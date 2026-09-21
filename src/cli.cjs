// ---------- Vortex Raid Tool uploader (CLI) ----------
// Assembled into vrt-uploader.cjs (and, on Windows, vrt-uploader.exe) after the
// loot-addon parser, the SavedVariables finder and the edition rule — by
// scripts/build.mjs of the public repository github.com/bloodl/vrt-uploader,
// where the source is published and the releases are signed. Runs on a raider's
// PC: finds the loot history in WoW's SavedVariables, uploads it to the guild's
// site, keeps watching. First run finds the guild or asks for its upload code;
// after that it just works.
const readline = require("node:readline");
const crypto = require("node:crypto"); // the update's hash check (1.12.0)
const { spawn, spawnSync } = require("node:child_process");
let isSea = false; // running as the single executable (vrt-uploader.exe) or as a script under node?
try { isSea = require("node:sea").isSea(); } catch { /* an older node: a script, then */ }
// Under the launcher (1.13.0): vrt-uploader.exe is a launcher that never changes and runs this file, vrt-uploader.cjs,
// from beside itself — so an update replaces the .cjs and never an exe (launcher.cjs says why). A 1.12.x exe carried
// the program inside and swapped executables; it updates itself into the launcher once and is then this.
const underLauncher = isSea && !!process.env.VRT_LAUNCHER;

const VERSION = "1.14.1"; // 1.14.1: the standings carry why a raider is off the board (the attendance bar, auto-inactive, the signup gate) for the council column · 1.14.0: the guild's recipes ride into the addon's inbox (the site's union, for the clients that lack them), and a record the addon took from the site or a relay is never sent back · 1.13.0: the exe is a launcher that never changes; the program is vrt-uploader.cjs beside it, and an update replaces that file — no executable is ever downloaded or swapped again · 1.12.6: says, when it registers itself, that the downloaded file is the program and must be kept · 1.12.5: uploads are filed under the character the addon reads for, never the Windows account name (a person's real name, as often as not) — chosen once from the addon's saved variables, kept, --by to choose · 1.12.4: reads the Forever addon's saved variables (VortexRaidToolForever.lua) and writes its inbox into that addon's folder — one uploader for both games · 1.12.3: says its version and by-line on every request (the site lists who runs it, on which build, heard when) and at every start · 1.12.2: after an update the program runs under the file's proper name (Task Manager listed vrt-uploader.new.exe until the next logon) · 1.12.1: one report per character — a character read on two of the PC's accounts (its own reading on one, a copy heard over the guild channel on the other) was reported turn and turn about every look · 1.12.0: keeps itself current — once an hour the hub is asked for the newest build, a newer one is fetched beside this file, checked against its published hash, started with the same settings, and takes this file's name and logon entry; --check-update asks now · 1.11.1: the inbox is written again when an addon update replaced the file with the empty one the addon ships · 1.11.0: the standings go into the inbox for the addon's column in the RCLootCouncil voting frame, and the council's record of each award (candidates, responses, votes) comes out of the game to the site, which tells the guild the why · 1.10.0: the site's wishlists and bank requests go into the addon's Inbox.lua (read at every /reload) every two minutes — the saved variables are never written again, only read · 1.9.2: another addon's file than the guild runs is set aside once the site says so; a file that fails never stops the next; the first run hands over to the background at once; a newer download takes over the logon entry from the old file · 1.9.1: every loot file written this half-year is taken, no "which ones?" question · 1.9.0: a wishlist row carries the raider's Priority (and what was wishlisted, under a token or a recipe) when the site sends it · 1.8.0: the guild bank's request queue INTO the addon (as the wishlists) and a Given pressed in game back OUT to the site · 1.7.0: carries the guild's wishlists INTO the addon (written into its saved variables while the game is closed; the addon shows them on item tooltips to ranks that can promote) · 1.6.1: a guild member on nobody's roster entry has their resist gear filed too (the site says so; no 404 line) · 1.6.0: starts at logon from the user's own Run list (no VBScript, no script host), hides its own window through the OS, --uninstall, the exe carries its own name and version · 1.5.4: a recipes package says which character sent it (addon 0.6.0 answers for every character of the account) · 1.1: Gargul, CEPGP, MonolithDKP and CommunityDKP files · 1.2: the in-game addon's gear and recipes · 1.3: the guild bank · 1.3.1: the addon file found beside a typed loot file · 1.4: any raider's PC · 1.5: no code — a guild-named download, or the hub finds the guild · 1.5.1: a refused report is not asked again until the addon has a new one
const HUB = "https://vortexraidtool.com"; // where the guilds live; --hub for a hub of your own
// Every request says which build this is and who runs it (1.12.3): the site keeps a note per uploader — version,
// heard when, what it last did — so an officer sees who runs it and who is behind without asking anyone.
const AGENT = `vrt-uploader/${VERSION} (${isSea ? "exe" : "script"}; ${process.platform})`;
let runsAs = ""; // the by-line, once the settings are read (main)
const fetch = (url, init = {}) => globalThis.fetch(url, { ...init, headers: { "user-agent": AGENT, ...(runsAs ? { "x-vrt-by": encodeURIComponent(runsAs) } : {}), ...(init.headers ?? {}) } });
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const flags = (n) => argv.map((a, i) => (a === n ? argv[i + 1] : null)).filter(Boolean); // repeatable, e.g. --file twice
const has = (n) => argv.includes(n);
// Settings folder: --home <dir> or VRT_UPLOADER_HOME, else the user's application-data folder.
const cfgDir = flag("--home") ? path.resolve(flag("--home")) : process.env.VRT_UPLOADER_HOME ? path.resolve(process.env.VRT_UPLOADER_HOME)
  : process.platform === "win32" ? path.join(process.env.APPDATA || os.homedir(), "VortexRaidTool") : path.join(os.homedir(), ".config", "vortex-raid-tool");
const cfgFile = path.join(cfgDir, "uploader.json");
const logFile = path.join(cfgDir, "uploader.log");
fs.mkdirSync(cfgDir, { recursive: true });
const stamp = () => new Date().toLocaleString("sv-SE").slice(0, 19);
const say = (m) => { console.log(m); try { fs.appendFileSync(logFile, `[${stamp()}] ${m}\n`); } catch {} };
const loadCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile, "utf8")); } catch { return {}; } };
const saveCfg = (c) => fs.writeFileSync(cfgFile, JSON.stringify(c, null, 2));
const decodeCode = (code) => { try { const j = JSON.parse(Buffer.from(String(code).trim(), "base64url").toString("utf8")); if (!j.s || !j.t) throw 0; return { server: String(j.s).replace(/\/$/, ""), token: String(j.t) }; } catch { return null; } };
const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); });

if (has("--version") || has("-v")) { console.log(`vrt-uploader ${VERSION}`); process.exit(0); }
if (has("--help") || has("-h")) {
  console.log(`vrt-uploader ${VERSION} — sends your loot addon's history to your guild's Vortex Raid Tool.
  Reads RCLootCouncil, Gargul, CEPGP, MonolithDKP and CommunityDKP straight from WoW's SavedVariables,
  and carries the in-game addon's resistance gear, known recipes and guild bank read along with them.
  (no options)          first run finds your guild from the names in your loot history, then uploads and keeps watching
  --code <code>         the guild's upload code — for when the guild cannot be found, or wants every upload to carry it
  --hub <url>           the hub to ask which guild this is (default ${HUB})
  --file <path>         a SavedVariables .lua of one of those addons (auto-detected otherwise; repeatable)
  --system <id>         which addon a --file is, when its name doesn't say: rclc, gargul, cepgp, monolithdkp, communitydkp
  --realm <name>        only this realm's characters
  --by <name>           who the upload is logged as (default: the character the in-game addon reads for)
  --once                upload once and exit (no watching)
  --no-addon            skip the in-game addon's resistance gear, recipes and guild bank
  --install-startup     start at every Windows logon, without a window (a value in your own user's Run list)
  --remove-startup      take that logon entry out again
  --uninstall           remove the logon entry and the settings folder, and say which folder is left to delete
  --reset               forget the saved settings
  --home <dir>          keep settings and log in this folder instead of the user profile
  --quiet               no questions and no window — the log is the only voice (what the logon entry passes)
  --check-update        ask the hub for a newer build now (it is asked once an hour anyway) and install it — the
                        program file (vrt-uploader.cjs) beside the exe is what changes; the exe itself never does
  --no-update           never fetch a newer build
Settings: ${cfgFile}
Log:      ${logFile}`);
  process.exit(0);
}
if (has("--reset")) { try { fs.unlinkSync(cfgFile); } catch {} say("settings forgotten"); process.exit(0); }
if (has("--remove-startup")) { removeStartup(); process.exit(0); }
if (has("--uninstall")) {
  removeStartup();
  const program = isSea ? path.dirname(process.execPath) : path.dirname(path.resolve(process.argv[1] || "."));
  try { fs.rmSync(cfgDir, { recursive: true, force: true }); } catch {}
  console.log(`Settings and log removed (${cfgDir}); the logon entry is gone. Delete ${program} to finish — nothing else was installed.`);
  process.exit(0);
}
// Started for the background (--quiet: the logon entry, or a shortcut): a console program opens a window, so this
// copy starts a second one that the operating system opens without a window — Node's windowsHide, a plain Win32
// process flag — and leaves. No script host and no hidden VBScript are involved; those are the shape of most
// malware persistence, and antivirus heuristics treat them accordingly. Only when there is a window to hide: a
// parent that reads this program's output through a pipe (a test, a script) gets it directly.
if (process.platform === "win32" && has("--quiet") && process.stdout.isTTY && !has("--no-hide") && !process.env.VRT_UPLOADER_HIDDEN) {
  const child = spawn(process.execPath, isSea ? argv : [process.argv[1], ...argv], { detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, VRT_UPLOADER_HIDDEN: "1" } });
  child.unref();
  process.exit(0);
}

async function main() {
  const cfg = loadCfg();
  say(`vrt-uploader ${VERSION}${isSea ? "" : " (script)"} — settings and log in ${cfgDir}`);
  if (flag("--code")) { const d = decodeCode(flag("--code")); if (!d) { say("That upload code doesn't look right."); process.exit(1); } Object.assign(cfg, d); }
  if (flags("--file").length) cfg.files = flags("--file");
  if (cfg.file && !cfg.files) { cfg.files = [cfg.file]; delete cfg.file; } // settings from an older version
  if (flag("--realm")) cfg.realm = flag("--realm");
  if (flag("--by")) cfg.by = flag("--by");
  if (flag("--system")) cfg.system = flag("--system").toLowerCase();
  const quiet = has("--quiet");
  // The inbox's state lives up here with the rest of main's state: carryInbox runs once before the watch loop, and a
  // const declared further down would still be in its dead zone then (the hub's claim route died of the same thing
  // on 2026-09-16).
  const INBOX_EVERY = 120; // seconds between asks of the site
  // The in-game addon's saved variables on this PC: the usual folders and the registry find them, and a WoW installed
  // somewhere else is found beside the loot file the loot master typed in on the first run — same account, same
  // SavedVariables folder. Read for the by-line (whoRunsIt) and every look (sendAddonData).
  const addonFiles = () => {
    const beside = (cfg.files ?? []).flatMap((f) => ADDON_SV_NAMES.map((n) => path.join(path.dirname(f), n))).filter((f) => { try { return fs.existsSync(f); } catch { return false; } });
    return [...new Map([...findAddonSavedVariables(), ...beside].map((f) => [path.resolve(f).toLowerCase(), f])).values()];
  };
  // The character this PC's addon reads for: the newest own reading (the addon marks a character's own collection
  // `own`; the rest are copies heard over the guild channel). Null until the addon has run on a character.
  const whoRunsIt = () => {
    let best = null;
    for (const file of addonFiles()) {
      let db; try { db = parseGlobal(fs.readFileSync(file, "utf8"), "VortexRaidToolDB"); } catch { continue; }
      for (const [character, mine] of Object.entries(db?.collect ?? {})) {
        if (!mine || typeof mine !== "object" || character === "version" || !mine.own) continue;
        const stamp = `${mine.resistAt ?? ""}|${mine.recipesAt ?? ""}`;
        if (!best || stamp > best.stamp) best = { character, stamp };
      }
    }
    return best ? String(best.character).slice(0, 24) : null;
  };
  const inboxStamp = new Map(); // per addon folder: what was last written, so an unchanged site writes nothing
  const inboxWritten = new Map(); // per addon folder: the stamp line the last write carried, checked against the file on disk
  const UPDATE_EVERY = 60 * 60 * 1000; // the update check's state, up here for the same reason (--check-update runs before the loop)
  let updateAskedAt = 0;
  let inboxAskedAt = 0;
  const systemOf = (file) => systemOfFile(file) ?? cfg.system ?? "rclc";
  // Versions before 1.6.0 started at logon from a VBScript in the Startup folder — the pattern antivirus heuristics
  // flag. One that is still there is moved to the Run list, once, and the move is written to the log.
  if (process.platform === "win32" && fs.existsSync(legacyStartup())) installStartup("moved");
  // Started by the copy this one replaces (--updated-from <its file>, 1.12.0): that copy fetched this file beside its
  // own, started it, and left. Wait for it to be gone, move its file aside, take its name — Windows lets a running
  // program be renamed, not overwritten — so the logon entry keeps starting the same path; the file moved aside goes
  // at the next start. If the old file cannot be moved (a folder this user may not write, a copy still running after
  // a minute), this copy runs from where it is and the logon entry is pointed at it instead. A process keeps the
  // image name it was created with — Task Manager would list vrt-uploader.new.exe until the next logon — so once
  // the file has its proper name the program is started again from it, and this copy leaves (1.12.2).
  if (flag("--updated-from") && (await takeOver(path.resolve(flag("--updated-from")))) === "left") return;
  sweepOld();
  // A newer download run by hand (1.9.2 — "how do I uninstall the old one and install the new?"): the logon entry
  // still names the file from last time, so it is pointed at this one, the old copy is stopped, and its file named
  // for deletion. Nothing else to do: the settings live in the profile folder, not beside the exe.
  if (process.platform === "win32" && isSea && !quiet) {
    const oldExe = exeOfEntry(startupEntry());
    if (oldExe && path.resolve(oldExe).toLowerCase() !== path.resolve(process.execPath).toLowerCase() && installStartup("newer")) {
      const stopped = stopProgramAt(oldExe);
      say(`the copy at ${oldExe} ${stopped ? "has been stopped and " : ""}is not needed any more — delete it when you like`);
    }
  }

  // No code: the hub works out the guild from the names in the loot history (upload-auto.js on the server) — the
  // guild whose roster they clearly fit. Nothing is uploaded until a guild has been found; a guild that wants the
  // code says so, and the code is asked for then.
  const hub = (flag("--hub") || cfg.hub || HUB).replace(/\/$/, "");
  const findGuild = async (files) => {
    const players = new Set();
    for (const f of files) { try { for (const r of rowsFromAddon(fs.readFileSync(f, "utf8"), systemOf(f), cfg.realm ?? "")) if (r.player) players.add(String(r.player)); } catch { /* not a loot file */ } }
    if (!players.size) return { error: "no awards in the loot history yet, so nothing says which guild this is" };
    const r = await fetch(`${hub}/api/uploader/find`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ players: [...players], from: cfg.by ?? "" }) }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.error ?? `the hub did not answer (HTTP ${r.status})` };
    return j;
  };
  // A guild-named download (/uploader in Discord): the file is called vrt-uploader-<guild>-<id>.exe, and the
  // hub says what the id means. Nothing to type, nothing to work out.
  if (!cfg.server || !cfg.token) {
    const own = path.basename(process.argv[1] && /\.cjs$/i.test(process.argv[1]) ? process.argv[1] : process.execPath);
    const m = /^vrt-uploader-([a-z0-9][a-z0-9-]*?)-([a-z0-9]{4,16})\.(?:exe|cjs)$/i.exec(own);
    if (m) {
      const r = await fetch(`${hub}/api/uploader/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: m[1], id: m[2], from: cfg.by ?? "" }) }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.token) { Object.assign(cfg, { server: j.server, token: j.token, slug: j.slug, guild: j.guild, link: m[2], hub, editions: j.editions ?? [] }); say(`this is ${j.guild}'s uploader — uploading there.`); }
      else say(`the link this uploader came from does not work any more (${j.error ?? `HTTP ${r.status}`}) — finding the guild another way.`);
    }
  }
  if (!cfg.server || !cfg.token) {
    const found = flags("--file").length ? flags("--file") : findSavedVariables();
    if (found.length) {
      const hit = await findGuild(found);
      if (hit.token) {
        Object.assign(cfg, { server: hit.server, token: hit.token, auto: true, slug: hit.slug, guild: hit.guild, hub, editions: hit.editions ?? [] });
        say(`this loot history is ${hit.guild}'s (found by its roster) — uploading there. Wrong guild? run once with --code <the right guild's code>.`);
      } else if (hit.requireCode) {
        if (quiet || !process.stdin.isTTY) { say(`${hit.guild} wants every upload to carry its code — run vrt-uploader in a window once and paste it.`); process.exitCode = 1; return; }
        console.log(`\nThis loot history is ${hit.guild}'s, and that guild wants every upload to carry its code (Settings → Uploader).`);
      } else {
        if (quiet || !process.stdin.isTTY) { say(`could not tell which guild this is (${hit.error}) — run vrt-uploader in a window once and paste the guild's upload code.`); process.exitCode = 1; return; }
        console.log(`\nCould not tell which guild this loot history belongs to: ${hit.error}.`);
      }
    }
  }
  // Started hidden, or from a shortcut, with nothing saved: there is nobody to answer a question. Say what is
  // wrong in the log and stop, rather than sitting invisible at a prompt uploading nothing — which is what a
  // settings folder passed without quotes, or a shortcut that forgets to pass one, looks like from outside.
  if ((!cfg.server || !cfg.token) && (quiet || !process.stdin.isTTY)) {
    say(`No upload code saved in ${cfgDir} — run vrt-uploader in a window once to paste one, or start it with --home "<the folder that has it>".`);
    process.exitCode = 1;
    return;
  }
  if (!cfg.server || !cfg.token) {
    console.log(`\nVortex Raid Tool uploader ${VERSION}\n\nThis sends your guild's loot history (RCLootCouncil, Gargul, CEPGP, MonolithDKP or CommunityDKP) to the guild's bot, so the loot pages update without anyone exporting anything.\n`);
    for (;;) {
      const code = await ask("Paste the upload code from the guild's settings page (Loot master uploader): ");
      const d = decodeCode(code);
      if (d) { Object.assign(cfg, d); break; }
      console.log("That doesn't look like an upload code — it is one long line of letters and digits.\n");
    }
  }
  // Which file(s): the loot council's account — or several accounts, each kept apart on the server.
  if (!cfg.files?.length || !cfg.files.every((f) => fs.existsSync(f))) {
    const found = findSavedVariables();
    if (!found.length && (quiet || !process.stdin.isTTY)) {
      say("No loot addon SavedVariables file found in the usual World of Warcraft folders, and nobody to ask where it is.");
      process.exitCode = 1;
      return;
    }
    if (!found.length) {
      console.log("\nNo loot addon SavedVariables file (RCLootCouncil, Gargul, CEPGP, MonolithDKP, CommunityDKP) found in the usual World of Warcraft folders.");
      cfg.files = [await ask("Full path to the addon's .lua (WoW\\_classic_\\WTF\\Account\\<account>\\SavedVariables\\): ")];
    } else {
      // Every file that has been written this half-year, no question asked (1.9.1 — the first officers to install
      // were stopped at "Which ones? A number, several like 1,3, or 'all'" and had to be told what to type). Taking
      // them all is the right answer: each account is kept apart on the site, a raid that is not the guild's is left
      // out there, and the in-game addon's file beside each one carries that account's characters. A file nobody
      // has touched in six months is an old client's, and is left alone unless it is the only one. --file picks by hand.
      const HALF_YEAR = 183 * 86400e3;
      const recent = found.filter((f) => { try { return Date.now() - fs.statSync(f).mtimeMs < HALF_YEAR; } catch { return false; } });
      cfg.files = recent.length ? recent : [found[0]];
      const accounts = [...new Set(cfg.files.map(accountOf))];
      console.log(cfg.files.length === 1
        ? `\n${labelOfFile(cfg.files[0])} history: ${cfg.files[0]}`
        : `\n${cfg.files.length} loot addon files found on ${accounts.length} account${accounts.length === 1 ? "" : "s"} — all of them are sent, each account kept apart on the site:\n` + cfg.files.map((f) => `  ${f}   (${labelOfFile(f)}, account ${accountOf(f)})`).join("\n"));
      if (found.length > cfg.files.length) console.log(`  (${found.length - cfg.files.length} older file(s) untouched for six months left alone — run once with --file to add one)`);
    }
  }
  // The by-line (1.12.5): the name every upload is filed under, shown to every officer on the loot import list
  // and on Settings → Uploader "Who runs it". Until now it defaulted to the Windows account name — often a
  // person's real name, or "Gebruiker" — so it is now the character this PC's addon reads for: the newest own
  // reading in the addon's saved variables, chosen once and kept. --by or uploader.json sets it by hand; a PC
  // without the addon's data yet says "uploader" until there is some.
  const osUser = String(process.env.USERNAME || process.env.USER || "").toLowerCase();
  if (!cfg.by || String(cfg.by).toLowerCase() === osUser || cfg.by === "uploader") {
    const was = cfg.by;
    cfg.by = whoRunsIt() ?? "uploader";
    if (cfg.by !== was) say(`uploads are filed under ${cfg.by}${was ? ` from now on, not ${was}` : ""} (--by <name> to choose another)`);
  }
  runsAs = String(cfg.by);
  // A guild on more than one game (editions: Anniversary and Forever side by side) has a site per game, and this PC
  // may hold both clients' SavedVariables. Ask the hub which editions the guild has, then send every read of the game
  // to the edition whose client it came from (upload-route.js, bundled above). One edition: nothing changes.
  // An uploader set up with a pasted code knows its server but not its slug: the address ends in /g/<slug>.
  if (!cfg.slug && cfg.server) { const m = /[/]g[/]([a-z0-9][a-z0-9-]*)[/]?$/i.exec(cfg.server); if (m) cfg.slug = m[1].toLowerCase(); }
  if (cfg.slug && cfg.token) {
    try {
      const r = await fetch(`${hub}/api/uploader/editions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: cfg.slug, token: cfg.token }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(j.editions)) cfg.editions = j.editions;
    } catch { /* offline: the last answer stands */ }
  }
  saveCfg(cfg);
  // Where a read goes: the edition its client matches (by version, else by the SavedVariables folder), or the guild
  // this uploader was set up for. An edition without a token (it insists on its code) is not written to.
  const target = (read) => {
    const e = pickEdition(cfg.editions, read);
    if (e && e.token && e.server) return { server: e.server, token: e.token, guild: e.guild || e.slug, routed: e.server !== cfg.server };
    return { server: cfg.server, token: cfg.token, guild: cfg.guild || "the guild", routed: false };
  };
  const refusedLine = (what, j, t) => j.wrongGame ? `${what}: from a ${j.version} client — ${t.guild} does not take it (no edition of the guild plays that game yet)` : j.wrongRealm ? `${what}: from ${j.realm} — not ${t.guild}'s realm` : null;

  // Files the site does not take — another loot addon's history than the guild runs (1.9.2), or a file whose
  // history cannot be read (an addon installed but never used) — are said once and left alone after that.
  const setAside = new Map(); // file -> why
  const uploadOne = async (file) => {
    if (setAside.has(file)) return;
    const system = systemOf(file);
    let rows;
    try { rows = rowsFromAddon(fs.readFileSync(file, "utf8"), system, cfg.realm ?? ""); }
    catch (e) { setAside.set(file, e.message); say(`${path.basename(file)} (account ${accountOf(file)}): no ${addonLabel(system)} history in it (${e.message}) — left alone`); return; }
    const t = target({ flavour: flavourOf(file) });
    const r = await fetch(`${t.server}/api/loot/rclc`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: t.token, by: cfg.by, rows, system, source: path.basename(file), account: accountOf(file) }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 403 && cfg.auto && !uploadOne.refound) {
      // A month has turned, or the guild now wants its code: find the guild once more, then try again.
      uploadOne.refound = true;
      const hit = await findGuild(cfg.files ?? [file]);
      if (hit.token) { Object.assign(cfg, { server: hit.server, token: hit.token, slug: hit.slug, guild: hit.guild }); saveCfg(cfg); return uploadOne(file); }
      throw new Error(hit.requireCode ? `${hit.guild} now wants every upload to carry its code — run vrt-uploader in a window once with --code <the code>` : `the guild could not be found any more (${hit.error}) — run vrt-uploader in a window once with --code <the guild's code>`);
    }
    if (r.status === 403) throw new Error("the bot refused the upload code — ask the guild master for a new one (settings page → Uploader)");
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    if (j.ignored) { setAside.set(file, j.ignored); say(`${t.routed ? "→ " + t.guild + ": " : ""}${path.basename(file)} (account ${accountOf(file)}): ${j.ignored} — not sent again`); return; }
    say(`${t.routed ? "→ " + t.guild + ": " : ""}uploaded ${j.count} ${addonLabel(system)} award(s)${cfg.files.length > 1 ? ` from account ${accountOf(file)}` : ""}${j.changed === false ? " (no change since last time)" : " — the standings are rebuilding"}${rows.undated ? ` — ${rows.undated} older CEPGP loot line(s) carry no date and were left out` : ""}`);
  };
  // Every file gets its turn: one that fails is reported and the next is sent all the same (1.9.2 — a CEPGP file
  // with nothing in it used to stop the files after it); the first failure is what --once exits with.
  const upload = async (files = cfg.files) => {
    let firstError = null;
    for (const f of files) { try { await uploadOne(f); } catch (e) { say(`${path.basename(f)} (account ${accountOf(f)}): upload failed — ${e.message}`); firstError ??= e; } }
    if (firstError) throw firstError;
  };

  // The in-game addon writes what the game knows — resistance gear read off the items, recipes read off a trade
  // skill window that was open — into its own SavedVariables, and cannot send any of it itself. So this carries
  // it, for whichever characters play on this PC. Nothing is sent twice: the addon stamps each scan.
  const list = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
  // What the bot said no to, by the stamp it said no to: asked once more only when the addon has a newer
  // scan (a new stamp) or this uploader starts again. Kept in memory on purpose — a raider joining the roster
  // is filed at the next start, and nothing is asked about every thirty seconds in the meantime.
  const refused = new Map();
  const sendAddonData = async () => {
    const files = addonFiles();
    if (!files.length) return;
    cfg.sent = cfg.sent ?? {};
    let posted = 0;
    // Every file read once; then one reading per character (1.12.1): a PC with two accounts holds a character's own
    // reading on one and a copy heard over the guild channel on the other, with different stamps, and until now each
    // look reported whichever came second — turn and turn about, a fresh report for the site to file every half
    // minute (2026-09-17: the bot fell behind Discord filing them). The character's own reading wins; else the newest.
    const dbs = new Map();
    for (const file of files) { try { dbs.set(file, parseGlobal(fs.readFileSync(file, "utf8"), "VortexRaidToolDB")); } catch { /* not readable this look */ } }
    const picked = new Map();
    const stampOf = (m) => `${m.resistAt ?? ""}|${m.recipesAt ?? ""}`;
    for (const [file, db] of dbs) {
      for (const [character, mine] of Object.entries(db?.collect ?? {})) {
        if (!mine || typeof mine !== "object" || character === "version") continue;
        const cur = picked.get(character);
        if (!cur || (mine.own && !cur.mine.own) || (!!mine.own === !!cur.mine.own && stampOf(mine) > stampOf(cur.mine))) picked.set(character, { mine, file });
      }
    }
    if (cfg.by === "uploader") { // named "uploader" until the addon had run on a character (1.12.5) — now it has
      const own = [...picked].filter(([, { mine }]) => mine.own).sort((a, b) => stampOf(b[1].mine).localeCompare(stampOf(a[1].mine)))[0];
      if (own) { cfg.by = String(own[0]).slice(0, 24); runsAs = cfg.by; saveCfg(cfg); say(`uploads are filed under ${cfg.by} from now on (--by <name> to choose another)`); }
    }
    for (const [character, { mine, file }] of picked) {
      const was = cfg.sent[character] ?? {};
      const t = target({ version: mine.version, flavour: flavourOf(file) });
      const post = async (path, body, stamp, what) => {
        if (!stamp || was[what] === stamp) return; // nothing new since the last run
        if (refused.get(`${character}:${what}`) === stamp) return; // said no to this very scan already
        const r = await fetch(`${t.server}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: t.token, by: cfg.by, character, version: mine.version ?? null, realm: mine.realm ?? null, ...body }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) refused.set(`${character}:${what}`, stamp);
        if (r.status === 409 && refusedLine(character, j, t)) { say(refusedLine(character, j, t)); return; }
        if (r.status === 404) { say(`${character}: not on ${t.routed ? t.guild + "'s" : "the"} roster and not in its guild list, so the addon's ${what} were not filed`); return; }
        if (!r.ok) { say(`${character}: the bot refused the addon's ${what} (${j.error ?? `HTTP ${r.status}`})`); return; }
        cfg.sent[character] = { ...(cfg.sent[character] ?? {}), [what]: stamp };
        posted++;
        if (what === "gear") say(`${character}: resistance gear filed${j.guild ? " (in the guild, not on the roster — an officer can link it to a main)" : ""} — ${Object.entries(j.sets ?? {}).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing found"}`);
        else say(`${character}: ${j.added} new recipe(s)${j.known ? `, ${j.known} already known` : ""}${j.refused?.length ? `, ${j.refused.length} not recognised` : ""}`);
      };
      if (mine.resist && Object.keys(mine.resist).length) await post("/api/resist/report", { sets: mine.resist, seen: list(mine.seen) }, mine.resistAt, "gear");
      // A record the addon took from the site's inbox, or from a guildmate passing it on (/vrt pull), is second-hand:
      // the site has the first-hand one, or will hear it from the character's own client (1.14.0).
      if (mine.from === "site" || mine.from === "relay") continue;
      if (mine.recipes && Object.keys(mine.recipes).length) await post("/api/recipes/report", { professions: mine.recipes, via: mine.via ?? null }, mine.recipesAt, "recipes");
    }
    for (const [file, db] of dbs) {
      // The guild roster as the game lists it (addon 0.5.3): one snapshot per guild, sent once per read. The site
      // files nothing from it by itself — it shows the officers which characters it does not know.
      for (const [guild, gr] of Object.entries(db?.guildRoster ?? {})) {
        if (!gr || typeof gr !== "object" || !gr.members || !gr.at) continue;
        const key = `guild roster:${guild}@${gr.realm ?? ""}`;
        if (cfg.sent[key] === gr.at || refused.get(key) === gr.at) continue;
        const t = target({ version: gr.version, flavour: flavourOf(file) });
        const r = await fetch(`${t.server}/api/guild/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: t.token, by: cfg.by, character: gr.by, guild, at: gr.at, realm: gr.realm ?? null, version: gr.version ?? null, members: list(gr.members) }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { refused.set(key, gr.at); say(refusedLine(`${guild}'s roster`, j, t) ?? `${guild}: the bot refused the guild roster read (${j.error ?? `HTTP ${r.status}`})`); continue; }
        cfg.sent[key] = gr.at;
        posted++;
        say(`${t.routed ? "→ " + t.guild + ": " : ""}${guild}: guild roster filed — ${j.members} character(s), ${j.unmatched} not on the site's roster, read ${gr.at}`);
      }
      // The guild bank, read by whoever opened it on this PC (addon 0.5): one snapshot per guild, sent once per read.
      for (const [guild, bank] of Object.entries(db?.guildBank ?? {})) {
        if (!bank || typeof bank !== "object" || !bank.items || !bank.at) continue;
        const key = `guild bank:${guild}@${bank.realm ?? ""}`;
        if (cfg.sent[key] === bank.at || refused.get(key) === bank.at) continue;
        const t = target({ version: bank.version, flavour: flavourOf(file) });
        const r = await fetch(`${t.server}/api/bank/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: t.token, by: cfg.by, character: bank.by, guild, at: bank.at, realm: bank.realm ?? null, version: bank.version ?? null, gold: bank.gold ?? null, tabs: bank.covered ?? bank.tabs ?? null, items: bank.items }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { refused.set(key, bank.at); say(refusedLine(`${guild}'s bank`, j, t) ?? `${guild}: the bot refused the guild bank read (${j.error ?? `HTTP ${r.status}`})`); continue; }
        cfg.sent[key] = bank.at;
        posted++;
        say(`${t.routed ? "→ " + t.guild + ": " : ""}${guild}: guild bank filed — ${j.items} item(s)${j.gold != null ? `, ${Math.floor(j.gold / 10000)}g` : ""}, read ${bank.at}${bank.covered && bank.tabs && bank.covered < bank.tabs ? ` (${bank.covered} of ${bank.tabs} tabs)` : ""}`);
      }
    }
    if (posted) saveCfg(cfg);
  };

  // --once: let the process wind down by itself (a fetch socket may still be closing — an immediate
  // process.exit() there trips a libuv assertion on Windows); force the exit only if it lingers.
  const finish = (code) => { process.exitCode = code; setTimeout(() => process.exit(code), 1500).unref(); };
  try { await upload(); } catch (e) { if (has("--once")) return finish(1); } // each file's failure was said as it happened
  // The addon's own reading is a bonus, never a reason to fail a loot upload.
  if (!has("--no-addon")) try { await sendAddonData(); } catch (e) { say(`the addon's data could not be sent: ${e.message}`); }
  if (!has("--no-addon")) try { await carrySessions(); } catch (e) { say(`the council's records could not be carried out: ${e.message}`); }
  if (!has("--no-addon")) try { await carryInbox(true); } catch (e) { say(`the inbox could not be written: ${e.message}`); }
  if (has("--check-update")) { if (await checkForUpdate(true)) return; } // a newer build has taken over: this copy is leaving
  if (has("--once")) return finish(0);

  if (process.platform === "win32" && !quiet && !has("--install-startup") && !has("--no-ask") && !cfg.askedStartup) {
    cfg.askedStartup = true; saveCfg(cfg);
    const a = (await ask("\nStart the uploader with Windows, so it runs after every raid by itself? [Y/n] ")).toLowerCase();
    if ((!a || a.startsWith("y")) && installStartup() && isSea) {
      // Off to the background now, not at the next logon (1.9.2): the same hidden start the logon entry makes, so the
      // person can close this window and nothing stops. Before this the window had to stay open until the next logon.
      const child = spawn(process.execPath, ["--quiet", ...(flag("--home") ? ["--home", path.resolve(flag("--home"))] : [])], { detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, VRT_UPLOADER_HIDDEN: "1" } });
      child.unref();
      console.log("\nRunning in the background from now on, and again at every logon. This window can be closed — nothing stops.");
      await ask("Press Enter to close it. ");
      return finish(0);
    }
  }
  if (has("--install-startup")) installStartup();

  say(`watching ${cfg.files.length === 1 ? cfg.files[0] : cfg.files.length + " files"} — WoW writes them on logout or /reload${quiet ? "" : "; leave this window open (or close it and let the Windows startup copy do the work)"}.`);
  const last = new Map(cfg.files.map((f) => [f, (() => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } })()]));
  let busy = false;
  setInterval(async () => {
    if (busy) return; // the last look is still sending; this one would send the same things again
    busy = true;
    try { await look(); } finally { busy = false; }
  }, (Number(process.env.VRT_UPLOADER_EVERY) || 30) * 1000);
  async function look() {
    for (const f of cfg.files) {
      try {
        const m = fs.statSync(f).mtimeMs;
        if (m === last.get(f)) continue;
        last.set(f, m);
        await new Promise((r) => setTimeout(r, 3000));
        await uploadOne(f);
      } catch (e) { say(`upload failed: ${e.message}`); }
    }
    // WoW writes every addon's file at the same moment, so this is the same logout the loot history came from.
    if (!has("--no-addon")) try { await sendAddonData(); } catch (e) { say(`the addon's data could not be sent: ${e.message}`); }
    if (!has("--no-addon")) try { await carryRequests(); } catch (e) { say(`the hand-outs could not be carried out: ${e.message}`); }
    if (!has("--no-addon")) try { await carrySessions(); } catch (e) { say(`the council's records could not be carried out: ${e.message}`); }
    if (!has("--no-addon")) try { await carryInbox(); } catch (e) { say(`the inbox could not be written: ${e.message}`); }
    try { await checkForUpdate(); } catch (e) { say(`the update check failed: ${e.message}`); } // once an hour; a newer build takes over and this copy leaves
  }

  // ---------- keeping itself current (1.12.0) ----------
  // Furytann, 2026-09-17: "Can we make the uploader auto-update for the others using it?" Once an hour the hub is asked
  // what the current build is and what its file hashes to; a newer one is fetched beside this file as <name>.new.<ext>,
  // checked against the hash, and started with the same arguments plus --updated-from <this file>; this copy then
  // leaves. The new copy does the rest (takeOver, above). A hub without the route, a download that fails, a hash
  // that differs: nothing changes, and the hour passes. The exe fetches the exe; the script form fetches the script.
  async function checkForUpdate(force) {
    if (has("--no-update")) return false;
    if (!force && Date.now() - updateAskedAt < UPDATE_EVERY) return false;
    updateAskedAt = Date.now();
    const kind = (isSea && !underLauncher) ? "exe" : "cjs"; // the launcher's program is the script; only a 1.12 exe fetches an exe
    let info;
    try { const r = await fetch(`${hub}/api/uploader/version`); if (!r.ok) return false; info = await r.json(); } catch { return false; }
    const want = info?.[kind];
    if (!want?.version || !want.sha256 || !newerVersion(want.version, VERSION)) return false;
    const me = programFile();
    const ext = path.extname(me);
    const fresh = me.slice(0, -ext.length) + ".new" + ext;
    say(`uploader ${want.version} is out (this is ${VERSION}) — fetching it`);
    try {
      const r = await fetch(`${hub}${want.url ?? "/downloads/vrt-uploader." + kind}`);
      if (!r.ok) { say(`the download answered HTTP ${r.status} — staying on ${VERSION}, trying again later`); return false; }
      const buf = Buffer.from(await r.arrayBuffer());
      const sha = crypto.createHash("sha256").update(buf).digest("hex");
      if (sha !== String(want.sha256).toLowerCase()) { say("the download did not match its published hash — not installed"); return false; }
      fs.writeFileSync(fresh, buf);
    } catch (e) { say(`could not fetch the update: ${e.message}`); return false; }
    // The same arguments, minus this one-off flag and minus the file the previous update came from.
    const args = [];
    for (let i = 0; i < argv.length; i++) { if (argv[i] === "--check-update") continue; if (argv[i] === "--updated-from") { i++; continue; } args.push(argv[i]); }
    args.push("--updated-from", me);
    // Under the launcher the fresh script is started through the launcher itself (VRT_PROGRAM names it); a 1.12 exe
    // starts the fresh exe; the script under node starts node on the fresh script.
    const env = { ...process.env, VRT_UPLOADER_HIDDEN: "1" };
    if (underLauncher) env.VRT_PROGRAM = fresh;
    const child = underLauncher ? spawn(process.execPath, args, { detached: true, stdio: "ignore", windowsHide: true, env })
      : spawn(isSea ? fresh : process.execPath, isSea ? args : [fresh, ...args], { detached: true, stdio: "ignore", windowsHide: true, env });
    child.unref();
    say(`uploader ${want.version} is taking over — this copy (${VERSION}) stops now`);
    setTimeout(() => process.exit(0), 500);
    return true;
  }

  // ---------- the loot decision, out of the game (addon 0.10.7) ----------
  // An officer's addon records every RCLootCouncil award it sees — the item, the winner, every candidate with their
  // response and votes — under db.council, keyed so that several officers' clients recording the same award file it
  // once. Each record not yet acknowledged is posted for the character that recorded it; the site answers with what
  // it filed and what it already had, and both are remembered so nothing is sent twice. Read only, like everything
  // else here: the saved variables are the game's.
  async function carrySessions() {
    const files = [...new Map([...findAddonSavedVariables(), ...(cfg.files ?? []).flatMap((f) => ADDON_SV_NAMES.map((n) => path.join(path.dirname(f), n)))].filter((f) => { try { return fs.existsSync(f); } catch { return false; } }).map((f) => [path.resolve(f).toLowerCase(), f])).values()];
    cfg.sessionsSent = cfg.sessionsSent ?? {};
    for (const file of files) {
      let db = null;
      try { db = parseGlobal(fs.readFileSync(file, "utf8"), "VortexRaidToolDB"); } catch { db = null; }
      const byChar = new Map();
      for (const [key, rec] of Object.entries(db?.council ?? {})) {
        if (!rec || typeof rec !== "object" || !rec.winner || cfg.sessionsSent[key]) continue;
        const who = String(rec.by ?? "").trim();
        if (!who) continue;
        if (!byChar.has(who)) byChar.set(who, []);
        byChar.get(who).push({ key, at: rec.at, item: rec.item, itemId: rec.itemId, boss: rec.boss, winner: rec.winner, response: rec.response, session: rec.session, candidates: list(rec.candidates) });
      }
      for (const [character, sessions] of byChar) {
        const mine = db?.collect?.[character] ?? {};
        const t = target({ version: mine.version, flavour: flavourOf(file) });
        const r = await fetch(`${t.server}/api/loot/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: t.token, by: cfg.by, character, version: mine.version ?? null, realm: mine.realm ?? null, sessions }) });
        const j = await r.json().catch(() => ({}));
        // A reporter the site does not know (404 naming the roster) or the wrong game (409) is final; anything else — a site
        // that does not have the route yet, an outage — is tried again at the next look.
        if (!r.ok) { say(`${character}: the bot refused the council's records (${j.error ?? `HTTP ${r.status}`})`); if ((r.status === 404 && /roster/i.test(j.error ?? "")) || r.status === 409) { for (const s of sessions) cfg.sessionsSent[s.key] = { at: new Date().toISOString().slice(0, 10), result: j.error ?? `HTTP ${r.status}` }; saveCfg(cfg); } continue; }
        for (const s of sessions) cfg.sessionsSent[s.key] = { at: new Date().toISOString().slice(0, 10), result: (j.keys ?? []).includes(s.key) ? "filed" : "known" };
        saveCfg(cfg);
        say(`${t.routed ? "→ " + t.guild + ": " : ""}${character}: ${j.added ?? 0} award(s) the council saw filed${j.known ? `, ${j.known} already known` : ""}${j.refused?.length ? `, ${j.refused.length} refused` : ""} — ${sessions.map((s) => `${s.item} → ${s.winner}`).join(", ")}`);
      }
    }
  }

  // ---------- bank requests, out of the game (0.10.0) ----------
  // A hand-out made on the addon's Requests tab is a mark in the saved variables (db.given[id] = { by, at, system });
  // every one not yet acknowledged is posted, and the site's answer — ok, already, gone — is remembered so it is sent
  // once. The saved variables are only ever READ here: see carryInbox for why.
  async function carryRequests() {
    const files = [...new Map([...findAddonSavedVariables(), ...(cfg.files ?? []).flatMap((f) => ADDON_SV_NAMES.map((n) => path.join(path.dirname(f), n)))].filter((f) => { try { return fs.existsSync(f); } catch { return false; } }).map((f) => [path.resolve(f).toLowerCase(), f])).values()];
    cfg.givenSent = cfg.givenSent ?? {};
    for (const file of files) {
      const t = target({ flavour: flavourOf(file) });
      let db = null;
      try { db = parseGlobal(fs.readFileSync(file, "utf8"), "VortexRaidToolDB"); } catch { db = null; }
      for (const [id, mark] of Object.entries(db?.given ?? {})) {
        if (!mark || typeof mark !== "object" || cfg.givenSent[id]) continue;
        const r = await fetch(`${t.server}/api/requests/addon-given`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: t.token, id, system: mark.system, by: mark.by, note: mark.note ?? "" }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok || r.status === 404 || r.status === 409) {
          cfg.givenSent[id] = { at: new Date().toISOString().slice(0, 10), result: j.already ? "already" : j.gone ? "gone" : r.ok ? "ok" : j.error ?? `HTTP ${r.status}` };
          saveCfg(cfg);
          say(`${t.routed ? "→ " + t.guild + ": " : ""}${mark.system ?? "request"} for ${j.main ?? id}: ${j.already ? "was already handed out on the site" : j.gone ? "no longer on the site (withdrawn or handled)" : r.ok ? `handed out in game by ${mark.by ?? "?"} — the site has it` : j.error ?? `HTTP ${r.status}`}`);
          inboxStamp.clear(); // the site's queue changed: the inbox is rewritten on the next look
        }
      }
    }
  }

  // ---------- the site's data, into the game: the inbox (1.10.0) ----------
  // The guild's wishlists and the bank's request queue used to be written into the addon's saved variables while
  // the game was closed. The game rewrites that file from memory at every /reload and logout, so a write while it
  // ran could only ever be lost — and on 2026-09-16 one landed in the middle of a /reload (the process reads as "not
  // responding" for a moment, which the old running-check mistook for closed) and left the file unreadable; the game
  // loaded nothing. So the saved variables are never written again. The site's data goes into Inbox.lua inside the
  // addon's own folder — a code file the game reads fresh at every /reload and never writes — every couple of
  // minutes, whenever the site's answer changed. An officer's /reload takes it; nothing else can, that is the game.
  /** The addon's folder for the game flavour a saved-variables file belongs to, or null when the addon is not installed there. */
  function addonDirOf(svFile) {
    // <WoW>\_anniversary_\WTF\Account\<account>\SavedVariables\VortexRaidTool.lua → <WoW>\_anniversary_\Interface\AddOns\VortexRaidTool
    // and the Forever addon's file (VortexRaidToolForever.lua) → its own folder, VortexRaidToolForever, in that client.
    const flavourRoot = path.resolve(svFile, "..", "..", "..", "..", ".."); // file → SavedVariables → <account> → Account → WTF → the flavour
    const name = path.basename(svFile).replace(/\.lua$/i, "");
    const dir = path.join(flavourRoot, "Interface", "AddOns", name);
    try { return fs.existsSync(path.join(dir, `${name}.toc`)) ? dir : null; } catch { return null; }
  }
  async function carryInbox(force) {
    if (!force && Date.now() - inboxAskedAt < INBOX_EVERY * 1000) return;
    inboxAskedAt = Date.now();
    const files = [...new Map([...findAddonSavedVariables(), ...(cfg.files ?? []).flatMap((f) => ADDON_SV_NAMES.map((n) => path.join(path.dirname(f), n)))].filter((f) => { try { return fs.existsSync(f); } catch { return false; } }).map((f) => [path.resolve(f).toLowerCase(), f])).values()];
    const done = new Set();
    for (const file of files) {
      const dir = addonDirOf(file);
      if (!dir || done.has(dir.toLowerCase())) continue;
      done.add(dir.toLowerCase());
      // Each flavour gets its own edition's data: the TBC client's folder the TBC guild's, the Forever client's the Forever edition's.
      const t = target({ flavour: flavourOf(file) });
      let wish = null, req = null, stand = null, recipes = null;
      try { const r = await fetch(`${t.server}/api/wishlists/addon?key=${encodeURIComponent(t.token)}`); if (r.ok) { const j = await r.json(); if (j?.items) wish = j; } } catch { /* the site is away: keep what the file has */ }
      try { const r = await fetch(`${t.server}/api/requests/addon?key=${encodeURIComponent(t.token)}`); if (r.ok) { const j = await r.json(); if (j?.systems) { j.acked = Object.keys(cfg.givenSent ?? {}); req = j; } } } catch { /* same */ }
      // The standings for the addon's column in the RCLootCouncil voting frame (1.11.0); an older site has no such route.
      try { const r = await fetch(`${t.server}/api/standings/addon?key=${encodeURIComponent(t.token)}`); if (r.ok) { const j = await r.json(); if (j?.raiders && Object.keys(j.raiders).length) stand = j; } } catch { /* same */ }
      // The guild's recipes as the site knows them (1.14.0): the union of every uploader's carry, handed back so a
      // client shows who can craft what without having been online with them; an older site has no such route.
      try { const r = await fetch(`${t.server}/api/recipes/addon?key=${encodeURIComponent(t.token)}`); if (r.ok) { const j = await r.json(); if (j?.characters && Object.keys(j.characters).length) recipes = j; } } catch { /* same */ }
      if (!wish && !req && !stand && !recipes) continue;
      const stamp = JSON.stringify([wish, req, stand, recipes]);
      // Unchanged since the last write — unless the file on disk is no longer ours: an addon update (CurseForge,
      // 2026-09-17) replaces Inbox.lua with the empty one the addon ships, and the addon then loads nothing until the
      // site changes. So the file is looked at, not just remembered: no stamp of ours in it, it is written again.
      const onDisk = (() => { try { return /\["stamp"\] = "([^"]*)"/.exec(fs.readFileSync(path.join(dir, "Inbox.lua"), "utf8"))?.[1] ?? null; } catch { return null; } })();
      if (inboxStamp.get(dir) === stamp && onDisk && onDisk === inboxWritten.get(dir)) continue;
      try {
        const text = inboxLua(wish, req, stand, recipes);
        fs.writeFileSync(path.join(dir, "Inbox.lua"), text);
        inboxStamp.set(dir, stamp);
        inboxWritten.set(dir, /\["stamp"\] = "([^"]*)"/.exec(text)?.[1] ?? null);
        say(`${t.routed ? "→ " + t.guild + ": " : ""}inbox written for the addon — ${wish ? `wishlists of ${wish.raiders} raider(s), ${Object.keys(wish.items).length} item(s)${wish.priority ? " with Priority" : ""}` : "no wishlists"}; ${req ? `${req.systems.reduce((n, s) => n + s.rows.length, 0)} bank request(s) waiting` : "no requests"}; ${stand ? `the standings of ${stand.count} raider(s) for the loot council frame` : "no standings"} — a /reload takes it`);
      } catch (e) { say(`${path.basename(path.dirname(dir))}: inbox not written — ${e.message}`); }
    }
  }
  // Function declarations, hoisted: carryInbox runs once before main reaches this line.
  function luaStr(v) { return '"' + String(v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ") + '"'; }
  function luaNum(v) { return (Number.isFinite(Number(v)) ? Number(v) : 0); }
  /** The whole inbox file: one global the addon reads at load, with a stamp of when it was written. */
  function inboxLua(wish, req, stand, recipes) {
    const stamp = new Date().toLocaleString("sv-SE").slice(0, 16);
    const lines = ["-- Vortex Raid Tool — written by the uploader; the game reads it at every /reload. Do not edit.", "VortexRaidToolInbox = {", `["stamp"] = ${luaStr(stamp)},`];
    if (wish) lines.push(`["wishlists"] = {`, ...wishlistsLua(wish), `},`);
    if (req) lines.push(`["requests"] = {`, ...requestsLua(req), `},`);
    if (stand) lines.push(`["standings"] = {`, ...standingsLua(stand), `},`);
    if (recipes) lines.push(`["recipes"] = {`, ...recipesLua(recipes), `},`);
    lines.push("}", "");
    return lines.join("\n");
  }
  /**
   * The guild's recipes as Lua (1.14.0), the shape the addon files a heard package in: at, count,
   * characters = { [character] = { main, at, professions = { [profession] = { { name, spellId, itemId }, … } } } }.
   */
  function recipesLua(j) {
    const s = luaStr, n = luaNum;
    const lines = [`["at"] = ${s(j.at)},`, `["count"] = ${n(j.count)},`, `["characters"] = {`];
    for (const [name, c] of Object.entries(j.characters ?? {})) {
      if (!c || typeof c !== "object" || !c.professions) continue;
      lines.push(`[${s(name)}] = { ["main"] = ${s(c.main)}, ["at"] = ${s(c.at)}, ["professions"] = {`);
      for (const [prof, list] of Object.entries(c.professions)) {
        if (!Array.isArray(list)) continue;
        lines.push(`[${s(prof)}] = {`);
        for (const t of list) if (Array.isArray(t) && t[0]) lines.push(`{ ${s(t[0])}, ${n(t[1])}, ${n(t[2])} },`);
        lines.push(`},`);
      }
      lines.push(`} },`);
    }
    lines.push(`},`);
    return lines;
  }
  /**
   * The standings as Lua (1.11.0), for the addon's column in the RCLootCouncil voting frame: at, count,
   * raiders = { [main] = { pos, prio, att, rank, class, last, lastAt } }, names = { [lower-cased character] = main }.
   */
  function standingsLua(j) {
    const s = luaStr, n = luaNum;
    const lines = [`["at"] = ${s(j.at)},`, `["count"] = ${n(j.count)},`, `["bar"] = ${n(j.bar)},`, `["raiders"] = {`];
    for (const [main, r] of Object.entries(j.raiders ?? {})) {
      if (!r || typeof r !== "object") continue;
      // gate (1.14.0): why a raider is off the board — "bar" (with att), "inactive" (lastSeen), "signups" — pos 0 then
      lines.push(`[${s(main)}] = { ["pos"] = ${n(r.pos)}, ["prio"] = ${n(r.prio)}, ["att"] = ${r.att == null ? -1 : n(r.att)}, ["rank"] = ${s(r.rank)}, ["class"] = ${s(r.class)}, ["last"] = ${s(r.last)}, ["lastAt"] = ${s(r.lastAt)}${r.gate ? `, ["gate"] = ${s(r.gate)}` : ""}${r.lastSeen ? `, ["lastSeen"] = ${s(r.lastSeen)}` : ""}${r.signups != null ? `, ["signups"] = ${n(r.signups)}` : ""} },`);
    }
    lines.push(`},`, `["names"] = {`);
    for (const [name, main] of Object.entries(j.names ?? {})) lines.push(`[${s(name)}] = ${s(main)},`);
    lines.push(`},`);
    return lines;
  }
  /** The open queue as Lua: at, acked = { id, … }, systems = { { id, name, unit, units, lockout, rows = { { id, main, character, amount, what, purpose, at, items = { { name, qty, itemId, inBank }, … } }, … } }, … }. */
  function requestsLua(j) {
    const s = luaStr, n = luaNum;
    const lines = [`["at"] = ${s(j.at)},`, `["acked"] = {`, ...(j.acked ?? []).map((id) => `${s(id)},`), `},`, `["systems"] = {`];
    for (const sys of j.systems) {
      lines.push(`{`, `["id"] = ${s(sys.id)},`, `["name"] = ${s(sys.name)},`, `["unit"] = ${s(sys.unit)},`, `["units"] = ${s(sys.units)},`, `["lockout"] = ${s(sys.lockout)},`, `["rows"] = {`);
      for (const r of sys.rows) {
        lines.push(`{`, `["id"] = ${s(r.id)},`, `["main"] = ${s(r.main)},`, `["character"] = ${s(r.character)},`, `["amount"] = ${n(r.amount)},`, `["what"] = ${s(r.what)},`, `["purpose"] = ${s(r.purpose)},`, `["at"] = ${s(r.at)},`);
        if (Array.isArray(r.items)) {
          lines.push(`["items"] = {`);
          for (const it of r.items) lines.push(`{ ["name"] = ${s(it.name)}, ["qty"] = ${n(it.qty)}, ["itemId"] = ${n(it.itemId)}, ["inBank"] = ${it.inBank == null ? -1 : n(it.inBank)} },`);
          lines.push(`},`);
        }
        lines.push(`},`);
      }
      lines.push(`},`, `},`);
    }
    lines.push(`},`);
    return lines;
  }
  /**
   * The wishlists as Lua: at, raiders, priority, items = { [itemId] = { { main, rank }, … } }. A row is { main, rank },
   * or { main, rank, prio } with the raider's Priority (1.9.0), or { main, rank, prio-or-false, via } under a token or
   * a recipe, `via` naming what was actually wishlisted — false keeps the row a plain sequence.
   */
  function wishlistsLua(j) {
    const num = (x) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? null : Number(x));
    const lines = [`["at"] = ${luaStr(j.at ?? "")},`, `["raiders"] = ${Number(j.raiders) || 0},`, `["priority"] = ${j.priority ? "true" : "false"},`, `["items"] = {`];
    for (const [id, who] of Object.entries(j.items)) {
      if (!/^\d+$/.test(id) || !Array.isArray(who)) continue;
      lines.push(`[${id}] = {`);
      for (const [main, rank, prio, via] of who) {
        const p = num(prio);
        const tail = typeof via === "string" && via ? `, ${p === null ? "false" : p}, ${luaStr(via)}` : p === null ? "" : `, ${p}`;
        lines.push(`{ ${luaStr(main)}, ${Number(rank) || 0}${tail} },`);
      }
      lines.push(`},`);
    }
    lines.push(`},`);
    return lines;
  }
}

// Starting with Windows: a value in the user's own Run list — what Discord, Steam and Spotify use — and nothing
// else. Versions before 1.6.0 wrote a VBScript into the Startup folder that ran the program with its window hidden;
// that is the shape of most malware persistence, and antivirus heuristics treated it accordingly. The window is
// hidden by the program itself now (the hand-over near the top). reg.exe does the writing: it is Windows' own,
// needs no module, and its arguments read plainly in a process log.
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_NAME = "VortexRaidToolUploader";
function legacyStartup() { return path.join(process.env.APPDATA || os.homedir(), "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "VortexRaidToolUploader.vbs"); }
function reg(...args) { const r = spawnSync("reg.exe", args, { encoding: "utf8", windowsHide: true }); return r.status === 0; }
/** The logon entry as it stands — the command line in the Run list — or null. */
function startupEntry() {
  if (process.platform !== "win32") return null;
  const r = spawnSync("reg.exe", ["query", RUN_KEY, "/v", RUN_NAME], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) return null;
  const m = new RegExp(`${RUN_NAME}\\s+REG_SZ\\s+(.+)$`, "m").exec(r.stdout ?? "");
  return m ? m[1].trim() : null;
}
/** The exe a logon entry starts, or null: the first quoted path, as installStartup writes it. */
const exeOfEntry = (entry) => (entry && /^"([^"]+\.exe)"/i.exec(entry)?.[1]) || null;
/** Stop every running copy of the program at that path — an older download the logon entry used to start. */
function stopProgramAt(exe) {
  if (process.platform !== "win32") return false;
  const ps = `Get-Process | Where-Object { $_.Path -eq '${exe.replace(/'/g, "''")}' -and $_.Id -ne ${process.pid} } | Stop-Process -Force`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", windowsHide: true, timeout: 20000 });
  return r.status === 0;
}
function installStartup(why, exePath = process.execPath) {
  if (process.platform !== "win32") { say("startup install is for Windows; on other systems run it from your own autostart"); return false; }
  const parts = [exePath, ...(isSea ? [] : [path.resolve(process.argv[1])])].map((p) => `"${p}"`);
  if (flag("--home")) parts.push("--home", `"${path.resolve(flag("--home"))}"`);
  parts.push("--quiet");
  if (!reg("add", RUN_KEY, "/v", RUN_NAME, "/t", "REG_SZ", "/d", parts.join(" "), "/f")) { say("could not write the logon entry (reg.exe said no)"); return false; }
  let hadScript = false;
  try { fs.unlinkSync(legacyStartup()); hadScript = true; } catch {}
  say(why === "moved" && hadScript
    ? `the logon entry moved from a script in the Startup folder to your user's Run list (${RUN_KEY}\\${RUN_NAME}) — same behaviour, nothing for an antivirus to quarantine`
    : why === "newer" ? `the logon entry now starts this file (${exePath})`
    : `will start at every logon, without a window — the value ${RUN_NAME} in your user's Run list (${RUN_KEY}); --remove-startup takes it out`);
  // The file people downloaded IS the program (nothing is installed anywhere else): one deleted from Downloads is
  // an uploader that silently stops (Furytann, 2026-09-20).
  if (why !== "moved" && why !== "newer") say(underLauncher
    ? `KEEP THESE FILES: ${exePath} and vrt-uploader.cjs beside it are the program that runs at every logon — nothing else was installed. Delete them and the uploads stop.`
    : `KEEP THIS FILE: ${exePath} is the program that runs at every logon — nothing else was installed. Delete it and the uploads stop.`);
  return true;
}
/** This program's own file: the script beside the launcher (or the fresh one an update started, VRT_PROGRAM), the exe of a 1.12 build, or the script under node. */
function programFile() {
  if (underLauncher) return process.env.VRT_PROGRAM && fs.existsSync(process.env.VRT_PROGRAM) ? path.resolve(process.env.VRT_PROGRAM) : path.join(path.dirname(process.execPath), "vrt-uploader.cjs");
  return isSea ? process.execPath : path.resolve(process.argv[1]);
}
/** Whether a is a newer version than b — "1.12.0" against "1.11.1". */
function newerVersion(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0), pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}
/**
 * The file this copy replaces goes aside and this copy takes its name and its logon entry (1.12.0, see main). Returns
 * "left" when the program has been started again under its proper name and this process is on its way out (1.12.2).
 */
async function takeOver(old) {
  // The exe of a 1.12.x copy that fetched this launcher: the launcher takes its name (the program sits beside it);
  // otherwise the file this copy runs from — the script, or an old-style exe.
  const me = path.extname(old).toLowerCase() === ".exe" ? process.execPath : programFile();
  // A copy that took over under 1.12.0 or 1.12.1 kept running under the path it was started from (…new.exe) after
  // its file was renamed, and names that path as the one to replace: the file is the properly named one beside it.
  if (!fs.existsSync(old)) { const proper = me.replace(/(\.new)+(\.[^.\\/]+)$/, "$2"); if (proper !== me && fs.existsSync(proper)) old = proper; }
  if (old.toLowerCase() === me.toLowerCase()) return;
  const ext = path.extname(old);
  const aside = old.slice(0, -ext.length) + ".old" + ext;
  let done = false, why = "";
  for (let i = 0; i < 120 && !done; i++) { // up to a minute for the old copy to leave
    try { try { fs.unlinkSync(aside); } catch {} fs.renameSync(old, aside); fs.renameSync(me, old); done = true; }
    catch (e) { why = e.message; await new Promise((r) => setTimeout(r, 500)); }
  }
  if (done) {
    let gone = false; try { fs.unlinkSync(aside); gone = true; } catch { /* the old copy has not quite left: swept at the next start */ }
    say(`updated to ${VERSION}: ${old} is the new file${gone ? "; the one it replaced is gone" : `; the one it replaced sits beside it as ${path.basename(aside)} until that copy has left`}`);
    const exeTaken = path.extname(old).toLowerCase() === ".exe";
    if (process.platform === "win32" && exeTaken && exeOfEntry(startupEntry())) installStartup("newer", old);
    if (isSea) { // the same arguments, minus the hand-over flag; the new process sweeps the file moved aside
      const args = [];
      for (let i = 0; i < argv.length; i++) { if (argv[i] === "--updated-from") { i++; continue; } args.push(argv[i]); }
      // Under the launcher: the launcher again, under its proper name, on the program file that now has its proper
      // name too (VRT_PROGRAM dropped); a 1.12 exe: the proper exe.
      const env = { ...process.env, VRT_UPLOADER_HIDDEN: "1" };
      delete env.VRT_PROGRAM;
      const child = spawn(exeTaken ? old : process.execPath, args, { detached: true, stdio: "ignore", windowsHide: true, env });
      child.unref();
      setTimeout(() => process.exit(0), 500);
      return "left";
    }
  } else {
    say(`updated to ${VERSION}, but the old file could not be replaced (${why}) — running from ${me} instead`);
    if (process.platform === "win32" && isSea && !underLauncher && exeOfEntry(startupEntry())) installStartup("newer");
  }
}
/** The file an update moved aside — deleted now that nothing runs from it; left alone if something still does. */
function sweepOld(again = [5000, 30000, 120000]) {
  let left = false;
  const mine = underLauncher ? [programFile(), process.execPath] : [programFile()]; // the script's leftovers, and the exe's from a 1.12 hand-over
  for (const me of mine) {
    const ext = path.extname(me);
    for (const f of [me.slice(0, -ext.length).replace(/\.new$/, "") + ".old" + ext, me.slice(0, -ext.length) + ".old" + ext]) { try { fs.unlinkSync(f); } catch (e) { if (e.code !== "ENOENT") left = true; } }
  }
  // The copy moved aside leaves half a second after starting this one — a file still in use is tried again shortly.
  if (left && again.length) setTimeout(() => sweepOld(again.slice(1)), again[0]).unref();
}
function removeStartup() {
  if (process.platform !== "win32") { say("nothing to remove: the logon entry is a Windows thing"); return; }
  const had = reg("delete", RUN_KEY, "/v", RUN_NAME, "/f");
  let script = false;
  try { fs.unlinkSync(legacyStartup()); script = true; } catch {}
  say(had || script ? "logon entry removed" : "no logon entry found");
}

main().catch((e) => { say(`error: ${e.message}`); process.exit(1); });
