#!/usr/bin/env node
/**
 * Builds the uploader: one CommonJS file out of src/ (the loot-addon parser, the SavedVariables finder, the
 * edition rule and the CLI) and, on Windows, a single vrt-uploader.exe with Node inside — Node's single-executable
 * application support, the blob injected with postject.
 *
 *   npm run build              bundle + exe (Windows)          npm run build:bundle    bundle only, any platform
 *   --out <dir>                where to write (default dist/)
 *
 * The exe, step by step, so a reader can follow what turns node.exe into vrt-uploader.exe:
 *   1. copy the node.exe this script runs on;
 *   2. remove its Authenticode signature — the copy is about to change, so Node's signature would be invalid
 *      anyway (the step Node's own documentation asks for before injecting);
 *   3. write our own version resource and icon with rcedit: company, product, description, version and the
 *      original file name, so the file says what it is instead of "Node.js JavaScript Runtime";
 *   4. inject the application blob (postject, at the sentinel fuse Node looks for);
 *   5. recompute the PE checksum;
 *   6. run the result with --version and refuse to finish unless it answers with this version.
 * Code signing is not done here: the release workflow hands the exe to SignPath Foundation
 * (docs/code-signing-policy.md), and the SHA-256 sums written beside the files are recomputed after signing.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stripSignature, fixChecksum, isSigned } from "./pe.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const out = path.resolve(flag("--out") || path.join(root, "dist"));
const src = path.join(root, "src");
fs.mkdirSync(out, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const read = (f) => fs.readFileSync(path.join(src, f), "utf8");

// One version number: the CLI prints it, package.json and the exe's resource carry it.
const cli = read("cli.cjs");
const version = cli.match(/^const VERSION = "([^"]+)"/m)?.[1];
if (version !== pkg.version) throw new Error(`src/cli.cjs says ${version}, package.json says ${pkg.version} — make them one`);

// 1) the parser, minus imports/exports and the site-side importer (it writes into the site's data folder)
let lua = read("rclc-lua.js").replace(/^import [^\n]*\n/gm, "").replace(/^export /gm, "");
lua = lua.replace(/function importSavedVariables\([\s\S]*?\n\}\n/, "");
lua = lua.replace(/\/\/ Standalone: node src\/rclc-lua\.js[\s\S]*$/, "");
// 2) the finder
const find = read("rclc-find.js").replace(/^import [^\n]*\n/gm, "").replace(/^export /gm, "");
// 3) the routing rule the site shares with the uploader (which edition a read belongs to)
const route = read("upload-route.js").replace(/^import [^\n]*\n/gm, "").replace(/^export /gm, "");
// 4) the CLI
const bundle = `#!/usr/bin/env node
"use strict";
// vrt-uploader ${version} — built by scripts/build.mjs from src/rclc-lua.js, src/rclc-find.js, src/upload-route.js and src/cli.cjs. Do not edit; edit those.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
${lua}
${find}
${route}
${cli}`;
const cjs = path.join(out, "vrt-uploader.cjs");
fs.writeFileSync(cjs, bundle);
execFileSync(process.execPath, ["--check", cjs]);
console.log(`bundle: ${cjs} (${(bundle.length / 1024).toFixed(0)} KB)`);

const files = [cjs];
if (process.platform === "win32" && !argv.includes("--no-exe")) {
  const exe = path.join(out, "vrt-uploader.exe");
  const seaCfg = path.join(out, "sea-config.json");
  const blob = path.join(out, "sea-prep.blob");

  fs.copyFileSync(process.execPath, exe);
  console.log(`node: ${process.execPath} (${process.version})`);
  console.log(`signature removed: ${stripSignature(exe)}`);

  const mod = await import("rcedit");
  const rcedit = mod.rcedit ?? mod.default;
  const v4 = `${version}.0`;
  await rcedit(exe, {
    "version-string": {
      CompanyName: "Vortex Raid Tool",
      ProductName: "Vortex Raid Tool uploader",
      FileDescription: "Vortex Raid Tool uploader",
      InternalName: "vrt-uploader",
      OriginalFilename: "vrt-uploader.exe",
      LegalCopyright: "Copyright (c) 2026 Furytann. MIT licence.",
      Comments: `Source, build and code signing policy: ${pkg.repository.url.replace(/\.git$/, "")}`,
    },
    "file-version": v4,
    "product-version": v4,
    icon: path.join(root, "assets", "icon.ico"),
  });
  console.log(`version resource: ${v4}, icon set`);

  fs.writeFileSync(seaCfg, JSON.stringify({ main: cjs, output: blob, disableExperimentalSEAWarning: true }, null, 2));
  execFileSync(process.execPath, ["--experimental-sea-config", seaCfg], { stdio: "inherit" });
  const postject = path.join(root, "node_modules", "postject", "dist", "cli.js");
  if (!fs.existsSync(postject)) throw new Error("postject is not installed — npm ci first");
  execFileSync(process.execPath, [postject, exe, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"], { stdio: "inherit" });
  fs.rmSync(seaCfg); fs.rmSync(blob);
  console.log(`checksum: 0x${fixChecksum(exe).toString(16)}`);
  if (isSigned(exe)) throw new Error("the exe still carries a certificate table");

  const said = execFileSync(exe, ["--version"], { encoding: "utf8" }).trim();
  if (said !== `vrt-uploader ${version}`) throw new Error(`the exe answers "${said}", expected "vrt-uploader ${version}"`);
  console.log(`exe: ${exe} (${(fs.statSync(exe).size / 1048576).toFixed(0)} MB) → ${said}`);
  files.push(exe);
} else console.log("(no .exe on this platform or --no-exe — the .cjs runs with node)");

// SHA-256 beside the files. The release workflow rewrites this after signing, because signing changes the exe.
const sums = files.map((f) => `${crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")}  ${path.basename(f)}`).join("\n") + "\n";
fs.writeFileSync(path.join(out, "SHA256SUMS"), sums);
process.stdout.write(sums);
