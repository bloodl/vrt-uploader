"use strict";
// ---------- Vortex Raid Tool uploader — the launcher ----------
// The exe people download and keep. It does one thing: run vrt-uploader.cjs, the program, from beside itself.
// The program keeps itself current by replacing that file, so an update never downloads or swaps an executable —
// the behaviour antivirus classifiers punish (Trojan:Script/Conteban.A!ml on a 1.12 exe, 2026-09-20) — and this
// file never changes between releases: one file to sign, one file to keep. When no program sits beside it (a fresh
// download, or the copy a 1.12.x uploader fetched to update itself), it fetches the current one from the hub and
// checks the published SHA-256 before running it. Built into vrt-uploader.exe by scripts/build.mjs of the public
// repository github.com/bloodl/vrt-uploader; the program's source is src/cli.cjs there.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");

const LAUNCHER = "1"; // the launcher's own mark; the program says the version
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const hub = String(flag("--hub") || process.env.VRT_UPLOADER_HUB || "https://vortexraidtool.com").replace(/\/$/, "");
const dir = path.dirname(process.execPath);
const beside = path.join(dir, "vrt-uploader.cjs");
// An update in progress starts this launcher on the freshly fetched file (VRT_PROGRAM); that copy then takes the
// proper name and starts the launcher again without it.
const program = process.env.VRT_PROGRAM && fs.existsSync(process.env.VRT_PROGRAM) ? path.resolve(process.env.VRT_PROGRAM) : beside;
const headers = { "user-agent": `vrt-uploader-launcher/${LAUNCHER} (${process.platform})` };

if (argv.includes("--launcher-version")) { console.log(`vrt-uploader launcher ${LAUNCHER} — runs ${beside}`); process.exit(0); }

/** The current program off the hub, written beside this file once its hash matches what the hub publishes. */
async function fetchProgram() {
  const r = await fetch(`${hub}/api/uploader/version`, { headers });
  if (!r.ok) throw new Error(`the hub (${hub}) answered HTTP ${r.status} when asked for the program`);
  const info = await r.json();
  const want = info?.cjs;
  if (!want?.sha256 || !want.url) throw new Error(`the hub (${hub}) offers no program file`);
  const d = await fetch(`${hub}${want.url}`, { headers });
  if (!d.ok) throw new Error(`the program's download answered HTTP ${d.status}`);
  const buf = Buffer.from(await d.arrayBuffer());
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (sha !== String(want.sha256).toLowerCase()) throw new Error("the program's download did not match its published hash — not run");
  fs.writeFileSync(beside, buf);
  console.log(`fetched the program: vrt-uploader ${want.version} → ${beside}`);
}

(async () => {
  if (!fs.existsSync(program)) {
    console.log(`no program file beside ${process.execPath} — fetching vrt-uploader.cjs from ${hub}`);
    await fetchProgram();
    // The program runs in a fresh process: this one still has the download's sockets closing, and a program that
    // exits at once (--version) on top of them trips libuv's shutdown on Windows (exit 0xC0000409).
    const r = spawnSync(process.execPath, argv, { stdio: "inherit", env: { ...process.env } });
    process.exitCode = r.status ?? 1;
    return;
  }
  process.env.VRT_LAUNCHER = process.execPath; // the program reads this: updates replace the .cjs, never this exe
  createRequire(program)(program);
})().catch((e) => { console.error(`vrt-uploader: ${e.message}`); process.exitCode = 1; });
