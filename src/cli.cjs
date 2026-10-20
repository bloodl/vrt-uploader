// ---------- Vortex Raid Tool uploader (CLI) ----------
// Assembled into vrt-uploader.cjs (and, on Windows, vrt-uploader.exe) after the
// loot-addon parser, the SavedVariables finder and the edition rule — by
// scripts/build.mjs of the public repository github.com/bloodl/vrt-uploader,
// where the source is published and the releases are built. Runs on a raider's
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

const VERSION = "1.17.0"; // 1.17.0: one copy at a time (a lock, every hand-over), --status says whether it runs and what it last sent; a failed upload is tried again (30 s, 2 min, then every 10 min) where it waited for the next logout, and an addon read the site could not take goes again at the next look; the site records every loot upload per account, folder and addon; a look walks the WoW folders once and parses a saved file only when the game saved it; the log is capped; on a Mac: the WoW folders, the .cjs guild link, a login agent (launchd) and its updates · 1.16.1: CEPGP's loot is read where current CEPGP keeps it, CEPGP.Traffic (its builds for TBC and Anniversary save no TRAFFIC, so a CEPGP guild's loot never reached the site) · 1.16.0: LootReserve's won rolls are sent too — kept with each character, filed per character; a MonolithDKP or CommunityDKP file brings its DKP table with its loot, for the guild's points beside the priority; a Gargul win carries the soft-reserve list it was won from, so the site closes that raid's reserve; an uploader set up before takes LootReserve's files at its next start, the files an officer chose staying as chosen · 1.15.1: each loot file says which game's folder it sits in (_anniversary_, _classic_era_ …) — every WoW game keeps its own loot history, and the site now files them apart and leaves another game's out, where one account's files from two games used to overwrite each other · 1.15.0: both ways — the guild's loot history comes back into RCLootCouncil: the awards the site holds and this PC's RCLootCouncil history lacks (a raid missed, or looted on another computer) go into the addon's inbox, and the addon adds them at the next /reload; the upload carries each RCLootCouncil entry whole · 1.14.1: the standings carry why a raider is off the board (the attendance bar, auto-inactive, the signup gate) for the council column · 1.14.0: the guild's recipes ride into the addon's inbox (the site's union, for the clients that lack them), and a record the addon took from the site or a relay is never sent back · 1.13.0: the exe is a launcher that never changes; the program is vrt-uploader.cjs beside it, and an update replaces that file — no executable is ever downloaded or swapped again · 1.12.6: says, when it registers itself, that the downloaded file is the program and must be kept · 1.12.5: uploads are filed under the character the addon reads for, never the Windows account name (a person's real name, as often as not) — chosen once from the addon's saved variables, kept, --by to choose · 1.12.4: reads the Forever addon's saved variables (VortexRaidToolForever.lua) and writes its inbox into that addon's folder — one uploader for both games · 1.12.3: says its version and by-line on every request (the site lists who runs it, on which build, heard when) and at every start · 1.12.2: after an update the program runs under the file's proper name (Task Manager listed vrt-uploader.new.exe until the next logon) · 1.12.1: one report per character — a character read on two of the PC's accounts (its own reading on one, a copy heard over the guild channel on the other) was reported turn and turn about every look · 1.12.0: keeps itself current — once an hour the hub is asked for the newest build, a newer one is fetched beside this file, checked against its published hash, started with the same settings, and takes this file's name and logon entry; --check-update asks now · 1.11.1: the inbox is written again when an addon update replaced the file with the empty one the addon ships · 1.11.0: the standings go into the inbox for the addon's column in the RCLootCouncil voting frame, and the council's record of each award (candidates, responses, votes) comes out of the game to the site, which tells the guild the why · 1.10.0: the site's wishlists and bank requests go into the addon's Inbox.lua (read at every /reload) every two minutes — the saved variables are never written again, only read · 1.9.2: another addon's file than the guild runs is set aside once the site says so; a file that fails never stops the next; the first run hands over to the background at once; a newer download takes over the logon entry from the old file · 1.9.1: every loot file written this half-year is taken, no "which ones?" question · 1.9.0: a wishlist row carries the raider's Priority (and what was wishlisted, under a token or a recipe) when the site sends it · 1.8.0: the guild bank's request queue INTO the addon (as the wishlists) and a Given pressed in game back OUT to the site · 1.7.0: carries the guild's wishlists INTO the addon (written into its saved variables while the game is closed; the addon shows them on item tooltips to ranks that can promote) · 1.6.1: a guild member on nobody's roster entry has their resist gear filed too (the site says so; no 404 line) · 1.6.0: starts at logon from the user's own Run list (no VBScript, no script host), hides its own window through the OS, --uninstall, the exe carries its own name and version · 1.5.4: a recipes package says which character sent it (addon 0.6.0 answers for every character of the account) · 1.1: Gargul, CEPGP, MonolithDKP and CommunityDKP files · 1.2: the in-game addon's gear and recipes · 1.3: the guild bank · 1.3.1: the addon file found beside a typed loot file · 1.4: any raider's PC · 1.5: no code — a guild-named download, or the hub finds the guild · 1.5.1: a refused report is not asked again until the addon has a new one
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
// The system this copy acts as (1.17.0): this one, or the one a test of another system's way names (VRT_UPLOADER_PLATFORM).
// It decides how the lock check asks about a process (with a stand-in for ps, VRT_PS), which start at login is used (a
// Mac's login agent, Windows' Run list) and whose words are said, so a test runs the Mac's way on Windows, with stand-ins
// for launchctl (VRT_LAUNCHCTL) and the LaunchAgents folder (VRT_LAUNCH_AGENTS).
const PLATFORM = process.env.VRT_UPLOADER_PLATFORM || process.platform;
// Started by launchd from the Mac's login agent (1.17.0): the agent's plist sets VRT_LAUNCHD=1 (installAgent, near the end).
const underLaunchd = process.env.VRT_LAUNCHD === "1";
const THIS_PC = PLATFORM === "darwin" ? "this Mac" : "this PC";
const RETURN_KEY = PLATFORM === "darwin" ? "Return" : "Enter"; // the key as a Mac's keyboard and a PC's name it
// Settings folder: --home <dir> or VRT_UPLOADER_HOME, else the user's application-data folder.
const cfgDir = flag("--home") ? path.resolve(flag("--home")) : process.env.VRT_UPLOADER_HOME ? path.resolve(process.env.VRT_UPLOADER_HOME)
  : process.platform === "win32" ? path.join(process.env.APPDATA || os.homedir(), "VortexRaidTool") : path.join(os.homedir(), ".config", "vortex-raid-tool");
const cfgFile = path.join(cfgDir, "uploader.json");
const logFile = path.join(cfgDir, "uploader.log");
// --status only reads (1.17.0): it makes no settings folder either.
if (!has("--status")) fs.mkdirSync(cfgDir, { recursive: true });
const stamp = () => new Date().toLocaleString("sv-SE").slice(0, 19);
// The log rolls at about 2 MB into uploader.log.1 (1.17.0; it had no cap, and one PC's had grown past 4 MB), and the
// roll replaces the uploader.log.1 before it: the two together stay near 4 MB.
const LOG_MAX = 2 * 1024 * 1024;
const say = (m) => { console.log(m); try { rollLog(); fs.appendFileSync(logFile, `[${stamp()}] ${m}\n`); } catch {} };
const loadCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile, "utf8")); } catch { return {}; } };
const saveCfg = (c) => fs.writeFileSync(cfgFile, JSON.stringify(c, null, 2));
const decodeCode = (code) => { try { const j = JSON.parse(Buffer.from(String(code).trim(), "base64url").toString("utf8")); if (!j.s || !j.t) throw 0; return { server: String(j.s).replace(/\/$/, ""), token: String(j.t) }; } catch { return null; } };
// The answer typed, or null when there is no more input (nothing at the other end: a copy another program started, a
// window closed): never a question left waiting with no one to answer it, which ended the process unheard (1.17.0).
const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); let answered = false; rl.on("close", () => { if (!answered) res(null); }); rl.question(q, (a) => { answered = true; rl.close(); res(a.trim()); }); });
// Someone at a window who can answer a question (1.17.0): a terminal on both ends, in a copy no other copy started. A copy
// started by an update (--updated-from), launchd or a person's own autostart has none, and is never asked anything: it goes
// on watching. A test types its answers through a pipe and says so (VRT_UPLOADER_TTY=1).
const canAsk = () => !flag("--updated-from") && ((!!process.stdin.isTTY && !!process.stdout.isTTY) || process.env.VRT_UPLOADER_TTY === "1");
// One copy per settings folder (1.17.0): the copy that runs names itself in uploader.lock (lockAtStart, near the end).
const lockFile = path.join(cfgDir, "uploader.lock");
const EXIT_RUNNING = 4; // a start that found a copy running: not 0, which a service manager reads as "start it again"
const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString(); // when this process began, as the system records it too
const SETTINGS_FLAGS = ["--code", "--file", "--by", "--realm", "--system", "--reset", "--uninstall"]; // a start with one of these changes what the running copy reads
let lockHeld = false; // this process wrote the lock, and lets it go when it ends
let stoppedFor = null; // why this start stopped the copy that was running ("settings", "newer"), when it did
let handedFrom = 0; // the copy that handed this one its lock (an update, the start again under the proper name), when one did

if (has("--version") || has("-v")) { console.log(`vrt-uploader ${VERSION}`); process.exit(0); }
if (has("--help") || has("-h")) {
  console.log(`vrt-uploader ${VERSION} — sends your loot addon's history to your guild's Vortex Raid Tool.
  Reads RCLootCouncil, Gargul, CEPGP, MonolithDKP, CommunityDKP and LootReserve straight from WoW's SavedVariables,
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
  --install-startup     start at every logon, without a window: on Windows a value in your own user's Run list, on a
                        Mac a login agent (~/Library/LaunchAgents/com.vortexraidtool.uploader.plist)
  --remove-startup      take that start at logon out again
  --uninstall           remove the start at logon and the settings folder (on a Mac the program's folder too), and say
                        what is left to delete
  --reset               forget the saved settings
  --home <dir>          keep settings and log in this folder instead of the user profile
  --quiet               no questions and no window — the log is the only voice (what the logon entry passes)
  --check-update        ask the hub for a newer build now (it is asked once an hour anyway) and install it — the
                        program file (vrt-uploader.cjs) beside the exe is what changes; the exe itself never does
  --no-update           never fetch a newer build
  --status              says whether the uploader runs on ${THIS_PC} (exit code 0) or not (exit code 3), and what it last
                        did: each loot file's last upload and try, the addon's reads it sent, the addon's inbox and the
                        update check. It changes nothing, and never shows the upload code
One copy runs per settings folder. A second start says so and closes (exit code 4), and so do --once and
--check-update. With new settings (--code, --file, --by, --realm, --system) the running copy is stopped, the settings
are saved, and the uploader starts again in the background. --reset and --uninstall stop it first.
An upload that fails is tried again after 30 seconds, 2 minutes, then every 10 minutes, until the site takes it.
Settings: ${cfgFile}
Log:      ${logFile}`);
  process.exit(0);
}
// --remove-startup, --reset and --uninstall are done in start(), below: --reset and --uninstall once a copy still
// running has been stopped (1.17.0), and all three after the logon entry's names exist (until 1.17.0 they ran up here,
// before those lines, and on Windows --remove-startup and --uninstall stopped with "Cannot access 'RUN_KEY' before
// initialization" without doing anything).
// Started for the background (--quiet: the logon entry, or a shortcut): a console program opens a window, so this
// copy starts a second one that the operating system opens without a window — Node's windowsHide, a plain Win32
// process flag — and leaves. No script host and no hidden VBScript are involved; those are the shape of most
// malware persistence, and antivirus heuristics treat them accordingly. Only when there is a window to hide: a
// parent that reads this program's output through a pipe (a test, a script) gets it directly.
// The one-off commands are done in this window, where their answer shows. The hidden copy takes the lock itself
// (lockAtStart): this one never held it, so nothing is handed over.
if (process.platform === "win32" && has("--quiet") && process.stdout.isTTY && !has("--no-hide") && !process.env.VRT_UPLOADER_HIDDEN && !["--remove-startup", "--reset", "--uninstall", "--status"].some(has)) {
  const child = spawn(process.execPath, isSea ? argv : [process.argv[1], ...argv], { detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, VRT_UPLOADER_HIDDEN: "1" } });
  child.unref();
  process.exit(0);
}

/** The start: the one-off commands, then the lock (one copy per settings folder, 1.17.0), then the uploader itself. */
async function start() {
  if (has("--status")) return showStatus(); // reads the lock and status.json, takes nothing and writes nothing (1.17.0)
  if (has("--remove-startup")) { removeStartup(); process.exit(0); }
  await lockAtStart();
  if (has("--reset")) {
    try { fs.unlinkSync(cfgFile); } catch {}
    try { fs.unlinkSync(statusFile); } catch {} // what the stopped copy last did: it named the guild
    say(stoppedFor ? "settings forgotten, and the copy that was running has been stopped. Run vrt-uploader again to set it up." : "settings forgotten");
    process.exit(0);
  }
  if (has("--uninstall")) {
    removeStartup();
    const program = isSea ? path.dirname(process.execPath) : path.dirname(path.resolve(process.argv[1] || "."));
    try { fs.unlinkSync(runNote); } catch {} // the stopped copy's note in the running list
    try { fs.rmSync(cfgDir, { recursive: true, force: true }); } catch {}
    if (PLATFORM === "darwin") {
      // A Mac (1.17.0): the login agent is gone (removeStartup), and so is the program's own folder, which only the agent
      // used. The file downloaded is the one thing left, wherever it was run from.
      const dir = macProgramDir(), me = programFile();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      const inDir = path.resolve(me).startsWith(path.resolve(dir) + path.sep);
      console.log(`Settings and log removed (${cfgDir}). The login start and the program in ${dir} are gone.${inDir ? "" : ` Delete ${me} too, if you still have it.`} Nothing else was installed.`);
      process.exit(0);
    }
    console.log(`Settings and log removed (${cfgDir}); the logon entry is gone. Delete ${program} to finish. Nothing else was installed.`);
    process.exit(0);
  }
  return main();
}

async function main() {
  const cfg = loadCfg();
  if (lockHeld) statusStart(); // the copy that holds the lock says what it does in status.json (1.17.0, --status reads it)
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
  const findAddonFiles = () => {
    const beside = (cfg.files ?? []).flatMap((f) => ADDON_SV_NAMES.map((n) => path.join(path.dirname(f), n))).filter((f) => { try { return fs.existsSync(f); } catch { return false; } });
    return [...new Map([...findAddonSavedVariables(), ...beside].map((f) => [path.resolve(f).toLowerCase(), f])).values()];
  };
  // One list a pass, made by carryAll (1.17.0, the 18 October 2026 audit's finding 26): each part of a pass walked every
  // WoW folder for it, three or four times a look.
  let passFiles = null;
  const addonFiles = () => passFiles ?? findAddonFiles();
  // A file's parse, kept until the game saves the file again (finding 26): every look parsed each addon file three
  // times over, changed or not, and a big store takes seconds and hundreds of MB to parse. A file that fails is not kept.
  const parsed = new Map(); // resolved file and global -> { mtime, size, value }
  const readGlobal = (file, name) => {
    const st = fs.statSync(file), key = `${path.resolve(file).toLowerCase()}|${name}`, had = parsed.get(key);
    if (had && had.mtime === st.mtimeMs && had.size === st.size) return had.value;
    const value = parseGlobal(fs.readFileSync(file, "utf8"), name);
    parsed.set(key, { mtime: st.mtimeMs, size: st.size, value });
    return value;
  };
  // The character this PC's addon reads for: the newest own reading (the addon marks a character's own collection
  // `own`; the rest are copies heard over the guild channel). Null until the addon has run on a character.
  const whoRunsIt = () => {
    let best = null;
    for (const file of addonFiles()) {
      let db; try { db = readGlobal(file, "VortexRaidToolDB"); } catch { continue; }
      for (const [character, mine] of Object.entries(db?.collect ?? {})) {
        if (!mine || typeof mine !== "object" || character === "version" || !mine.own) continue;
        const stamp = `${mine.resistAt ?? ""}|${mine.recipesAt ?? ""}`;
        if (!best || stamp > best.stamp) best = { character, stamp };
      }
    }
    return best ? String(best.character).slice(0, 24) : null;
  };
  const inboxStamp = new Map(); // per addon folder: what was last written, so an unchanged site writes nothing
  // The guild's loot history, back into RCLootCouncil (1.15.0) — state up here for the same reason as the inbox's.
  const lootSite = new Map(); // server -> { version, awards }: the guild's history as the site last sent it
  const lootLast = new Map(); // addon folder -> what the last pass found missing, kept through a pass that could not read a file
  const lootSaid = new Map(); // addon folder -> the count the log last gave, so it speaks when that changes
  const LOOT_EVERY_PASS = 300; // the newest this many a pass; the rest follow once the game has saved these
  const seenFile = path.join(cfgDir, "rclc-seen.json");
  let lootSeen = null; // RCLootCouncil file (resolved, lower-cased) -> Set of every id it has held
  const inboxWritten = new Map(); // per addon folder: the stamp line the last write carried, checked against the file on disk
  const UPDATE_EVERY = 60 * 60 * 1000; // the update check's state, up here for the same reason (--check-update runs before the loop)
  let updateAskedAt = 0;
  let leaving = false; // an update under launchd is in place and this copy is about to end: no more looks (1.17.0)
  let inboxAskedAt = 0;
  const systemOf = (file) => systemOfFile(file) ?? cfg.system ?? "rclc";
  // Versions before 1.6.0 started at logon from a VBScript in the Startup folder — the pattern antivirus heuristics
  // flag. One that is still there is moved to the Run list, once, and the move is written to the log.
  if (PLATFORM === "win32" && fs.existsSync(legacyStartup())) installStartup("moved");
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
  if (PLATFORM === "win32" && isSea && !quiet) {
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
  // A guild-named download (/uploader in Discord): the file is called vrt-uploader-<guild>-<id>.exe (or .cjs, the
  // program a Mac runs with Node.js), and the hub says what the id means. Nothing to type, nothing to work out.
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
    console.log(`\nVortex Raid Tool uploader ${VERSION}\n\nThis sends your guild's loot history (RCLootCouncil, Gargul, CEPGP, MonolithDKP, CommunityDKP or LootReserve) to the guild's bot, so the loot pages update without anyone exporting anything.\n`);
    for (;;) {
      const code = await ask("Paste the upload code from the guild's settings page (Loot master uploader): ");
      if (code === null) { say("No upload code given, so nothing is uploaded. Run vrt-uploader again to paste one."); process.exitCode = 1; return; }
      const d = decodeCode(code);
      if (d) { Object.assign(cfg, d); break; }
      console.log("That doesn't look like an upload code — it is one long line of letters and digits.\n");
    }
  }
  const HALF_YEAR = 183 * 86400e3;
  const recentOf = (list) => list.filter((f) => { try { return Date.now() - fs.statSync(f).mtimeMs < HALF_YEAR; } catch { return false; } });
  const samePath = (a, b) => (PLATFORM === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));
  const isThere = (f) => { try { return fs.existsSync(f); } catch { return false; } };
  // One file for each account, game and loot addon (1.17.0). The site keeps one history of each, so two copies of it (a
  // World of Warcraft folder copied to another drive, an old install left beside the new one) overwrote each other at
  // every start, the older one last. The newest is taken (the finder lists the newest first; a saved file comes before
  // any found), and each file left out is said.
  const keyOf = (f) => `${accountOf(f)}|${flavourOf(f)}|${systemOf(f)}`.toLowerCase();
  const oneEach = (list, have = []) => {
    const taken = new Map(have.map((f) => [keyOf(f), f]));
    const out = [];
    for (const f of list) {
      const was = taken.get(keyOf(f));
      if (was) { if (!samePath(was, f)) say(`${f} is left out: it holds the same account's ${labelOfFile(f)} history${flavourOf(f) ? " in " + flavourOf(f) : ""} as ${was}, which is the one sent (the site keeps one of each)`); continue; }
      taken.set(keyOf(f), f);
      out.push(f);
    }
    return out;
  };
  // A set-up uploader, at each start: LootReserve's files (1.16.0, the one kind an older version could not find), and,
  // when a saved file is not there right now, any loot file written this half-year that no saved file which is there
  // stands for (the game moved to another folder or drive), by the setup's own rule, each said once. A saved file is
  // never dropped for not being there (1.17.0): a drive under /Volumes or a USB drive not mounted yet at login, or
  // unplugged for a while, keeps its file's place, and that file is sent once it is back. Until 1.17.0 one saved file
  // missing at a start made the whole list what was found then, and a drive's file was gone from the settings for good.
  // A saved file that is not there holds no account's place, though: World of Warcraft moved or reinstalled leaves the
  // same account's file under the new root, and counting the gone one as that account's, game's and addon's left the
  // new one out at every start — nothing was uploaded until someone ran --file. So only the saved files that are
  // there are weighed against what was found, and which of them is sent is settled at every look (newestEach, below).
  // --file sets the list.
  if (cfg.files?.length && !flags("--file").length) {
    const here = cfg.files.filter(isThere);
    const found = findSavedVariables();
    const fresh = oneEach(recentOf(found.filter((f) => (here.length !== cfg.files.length || systemOf(f) === "lootreserve") && !cfg.files.some((s) => samePath(s, f)))), here);
    if (fresh.length) { cfg.files = [...cfg.files, ...fresh]; saveCfg(cfg); for (const f of fresh) say(`a new loot file found: ${f} (${labelOfFile(f)}, account ${accountOf(f)}) — sent from now on`); }
    // Not one saved file is there and nothing was found in its place (the game moved somewhere the finder does not
    // look, a drive away): in a window, ask where the file is now, as a first run does — which is what versions
    // before 1.17.0 did here, since the whole list became what was found and so was empty. The files that are not
    // there are kept whatever the answer: the drive may only be away. With nobody to ask, the copy goes on watching
    // and the log says, once for each file, that it is not there and what to run (notThere).
    if (!here.length && !fresh.length && !quiet && canAsk()) {
      console.log(`\nNone of the saved loot files is there:\n${cfg.files.map((f) => `  ${f}`).join("\n")}\nIf World of Warcraft was moved or reinstalled, say where its loot addon's .lua is now. If the drive is only away, press ${RETURN_KEY}: the file is sent once it is back.`);
      for (;;) {
        const typed = await ask(PLATFORM === "win32"
          ? `Full path to the addon's .lua, or ${RETURN_KEY} to leave the settings as they are: `
          : `Full path to the addon's .lua, or ${RETURN_KEY} to leave the settings as they are (you can drag the file onto this window): `);
        if (typed === null || !typed) break;
        const file = PLATFORM === "win32" ? typed.replace(/^"(.*)"$/, "$1") : typedPath(typed);
        if (file && isThere(file)) {
          // One of the saved paths typed back, and there after all: nothing to add, or the list would hold it twice.
          if (cfg.files.some((s) => samePath(s, file))) say(`${file} is there after all — it is in the settings already, and is sent from now on`);
          else { cfg.files = [...cfg.files, file]; saveCfg(cfg); say(`a new loot file given: ${file} (${labelOfFile(file)}, account ${accountOf(file)}) — sent from now on; the files that are not there stay in the settings`); }
          break;
        }
        console.log(`There is no file at ${file || "that path"}. Paste or type the whole path, the file's name at its end.\n`);
      }
    }
  }
  // Which file(s), at the first run: the loot council's account — or several accounts, each kept apart on the server.
  if (!cfg.files?.length) {
    const found = findSavedVariables();
    if (!found.length && (quiet || !process.stdin.isTTY)) {
      say("No loot addon SavedVariables file found in the usual World of Warcraft folders, and nobody to ask where it is.");
      process.exitCode = 1;
      return;
    }
    if (!found.length) {
      console.log("\nNo loot addon SavedVariables file (RCLootCouncil, Gargul, CEPGP, MonolithDKP, CommunityDKP, LootReserve) found in the usual World of Warcraft folders.");
      // On a Mac (and Linux) with forward slashes, and a file dragged onto the window taken as Terminal types it (1.17.0).
      // A path that is not there is asked again (a saved file is kept even while it is not there, 1.17.0).
      for (;;) {
        const typed = PLATFORM === "win32"
          ? await ask("Full path to the addon's .lua (WoW\\<the game's folder, e.g. _anniversary_>\\WTF\\Account\\<account>\\SavedVariables\\): ")
          : await ask("Full path to the addon's .lua (World of Warcraft/<the game's folder, e.g. _anniversary_>/WTF/Account/<account>/SavedVariables/). You can drag the file onto this window: ");
        if (typed === null) { say("No loot file given, so nothing is uploaded. Run vrt-uploader again, or start it with --file <the file>."); process.exitCode = 1; return; }
        const file = PLATFORM === "win32" ? typed.replace(/^"(.*)"$/, "$1") : typedPath(typed);
        if (file && fs.existsSync(file)) { cfg.files = [file]; break; }
        console.log(`There is no file at ${file || "that path"}. Paste or type the whole path, the file's name at its end.\n`);
      }
    } else {
      // Every file that has been written this half-year, no question asked (1.9.1 — the first officers to install
      // were stopped at "Which ones? A number, several like 1,3, or 'all'" and had to be told what to type). Taking
      // them all is the right answer: each account is kept apart on the site, a raid that is not the guild's is left
      // out there, and the in-game addon's file beside each one carries that account's characters. A file nobody
      // has touched in six months is an old client's, and is left alone unless it is the only one. --file picks by hand.
      // Two copies of one account's history (another drive, an old install) give one file, the newest (oneEach, 1.17.0).
      const recent = recentOf(found);
      cfg.files = recent.length ? recent : [found[0]];
      cfg.files = oneEach(cfg.files);
      const accounts = [...new Set(cfg.files.map(accountOf))];
      console.log(cfg.files.length === 1
        ? `\n${labelOfFile(cfg.files[0])} history: ${cfg.files[0]}`
        : `\n${cfg.files.length} loot addon files found on ${accounts.length} account${accounts.length === 1 ? "" : "s"} — all of them are sent, each account kept apart on the site:\n` + cfg.files.map((f) => `  ${f}   (${labelOfFile(f)}, account ${accountOf(f)})`).join("\n"));
      const old = found.length - (recent.length || 1);
      if (old > 0) console.log(`  (${old} older file(s) untouched for six months left alone — run once with --file to add one)`);
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
  statusSettings(cfg);
  // Where a read goes: the edition its client matches (by version, else by the SavedVariables folder), or the guild
  // this uploader was set up for. An edition without a token (it insists on its code) is not written to.
  const target = (read) => {
    const e = pickEdition(cfg.editions, read);
    if (e && e.token && e.server) return { server: e.server, token: e.token, guild: e.guild || e.slug, routed: e.server !== cfg.server };
    return { server: cfg.server, token: cfg.token, guild: cfg.guild || "the guild", routed: false };
  };
  const refusedLine = (what, j, t) => j.wrongGame ? `${what}: from a ${j.version} client — ${t.guild} does not take it (no edition of the guild plays that game yet)` : j.wrongRealm ? `${what}: from ${j.realm} — not ${t.guild}'s realm` : null;

  // Files the site does not take — another loot addon's history than the guild runs (1.9.2), or a file whose
  // history cannot be read (an addon installed but never used) — are said once and left alone after that, until the
  // game saves the file again (1.17.0; before, they stayed set aside for as long as the copy ran).
  const setAside = new Map(); // file -> why, while the file is as it was when it was set aside
  // What came of each upload (1.17.0). A file counts as sent once the site has answered it for good: the site's own 2xx
  // answer, or a final one (403, the code refused; 409, another game's; 413 or a file too big to send; a 2xx that sets
  // the file aside). Then it waits for the game to save it again. Any other answer, or none (the site away, a 5xx, a
  // 429, a 2xx page that is not the site's), is tried again after 30 seconds, then 2 minutes, then every 10 minutes,
  // until one goes through. Until 1.17.0 a file was marked seen before it was sent, so a failed upload waited for the
  // next logout.
  const sentAt = new Map(); // file -> the modification time of the version the site answered for good
  const retryOf = new Map(); // file -> { failures, next (ms), mtime }: a failed upload's turn
  // The steps, which a test only scales down (VRT_UPLOADER_BACKOFF_SCALE, 0.01: 0.3 s, 1.2 s, 6 s), never names: the
  // test of the steps then holds the steps themselves.
  const BACKOFF = [30e3, 120e3, 600e3].map((ms) => ms * (Number(process.env.VRT_UPLOADER_BACKOFF_SCALE) > 0 ? Number(process.env.VRT_UPLOADER_BACKOFF_SCALE) : 1));
  // The site reads a loot upload of up to 12,000,000 characters and cuts a bigger one off unanswered, which looks like a
  // site that is away: such a file went again every 10 minutes for as long as the copy ran (1.17.0). It is not sent; the
  // answer is final until the game saves the file again.
  const SITE_BODY_MAX = 12_000_000;
  const mtimeOf = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return null; } };
  const finalError = (message, code) => Object.assign(new Error(message), { final: true, status: code });
  const uploadOne = async (file) => {
    setAside.delete(file); // here again: the game saved it since it was set aside, or this copy has just started
    const system = systemOf(file);
    let rows, balances = [];
    try {
      const text = fs.readFileSync(file, "utf8");
      rows = rowsFromAddon(text, system, cfg.realm ?? "");
      // A DKP addon's file holds the guild's DKP table beside its loot (1.16.0): sent with it, for the points on the board.
      balances = balancesFromAddon(text, system);
    }
    catch (e) { setAside.set(file, e.message); say(`${path.basename(file)} (account ${accountOf(file)}): no ${addonLabel(system)} history in it (${e.message}) — left alone until the game saves it again`); return { result: "unreadable" }; }
    // The game folder goes with the file (1.15.1): each game keeps its own history, so the site files one account's
    // files from two games apart, and takes none from a game the guild does not play (answered like another addon's).
    const t = target({ flavour: flavourOf(file) });
    const body = JSON.stringify({ key: t.token, by: cfg.by, rows, system, source: path.basename(file), account: accountOf(file), flavour: flavourOf(file), ...(balances.length ? { balances } : {}) });
    if (body.length > SITE_BODY_MAX) throw finalError(`its loot history is too big to send: about ${Math.round(body.length / 1e6)} MB, and the site takes up to ${SITE_BODY_MAX / 1e6} MB`, 413);
    const r = await fetch(`${t.server}/api/loot/rclc`, { method: "POST", headers: { "content-type": "application/json" }, body });
    const j = await r.json().catch(() => ({}));
    if (r.status === 403 && cfg.auto && !uploadOne.refound) {
      // A month has turned, or the guild now wants its code: find the guild once more, then try again.
      uploadOne.refound = true;
      const hit = await findGuild(cfg.files ?? [file]);
      if (hit.token) { Object.assign(cfg, { server: hit.server, token: hit.token, slug: hit.slug, guild: hit.guild }); saveCfg(cfg); return uploadOne(file); }
      throw finalError(hit.requireCode ? `${hit.guild} now wants every upload to carry its code — run vrt-uploader in a window once with --code <the code>` : `the guild could not be found any more (${hit.error}) — run vrt-uploader in a window once with --code <the guild's code>`, 403);
    }
    if (r.status === 403) throw finalError("the bot refused the upload code — ask the guild master for a new one (settings page → Uploader)", 403);
    if (!r.ok) throw Object.assign(new Error(j.error ?? `HTTP ${r.status}`), { status: r.status, final: r.status === 409 || r.status === 413 });
    // Every answer of the site's loot door says ok. A 2xx without it is some other page on the way (a hotel's or a
    // captive portal's sign-in page, a proxy's maintenance page), so nothing was filed: tried again like a failure.
    if (j?.ok !== true) throw Object.assign(new Error(`the answer was not the site's: HTTP ${r.status}${r.headers.get("content-type") ? ", " + String(r.headers.get("content-type")).split(";")[0] : ""}`), { status: r.status });
    if (j.ignored) { setAside.set(file, j.ignored); say(`${t.routed ? "→ " + t.guild + ": " : ""}${path.basename(file)} (account ${accountOf(file)}): ${j.ignored} — not sent again until the game saves it again`); return { result: "ignored" }; }
    say(`${t.routed ? "→ " + t.guild + ": " : ""}uploaded ${j.count} ${addonLabel(system)} award(s)${cfg.files.length > 1 ? ` from account ${accountOf(file)}${new Set(cfg.files.map(flavourOf)).size > 1 && flavourOf(file) ? " in " + flavourOf(file) : ""}` : ""}${j.changed === false ? " (no change since last time)" : " — the standings are rebuilding"}${j.balances ? ` — and its DKP table, ${j.balances} raider${j.balances === 1 ? "" : "s"}` : ""}${rows.undated ? ` — ${rows.undated} older CEPGP loot line(s) carry no date and were left out` : ""}`);
    return { result: j.changed === false ? "same" : "filed", awards: Number(j.count) || 0 };
  };
  // One upload of a file and what came of it, kept for the next look (sentAt, retryOf) and for --status (status.json).
  // m is the file's modification time read before the file was: a save during the upload makes it new again.
  const sendFile = async (f, m) => {
    const at = new Date().toISOString();
    try {
      const out = (await uploadOne(f)) ?? { result: "filed" };
      sentAt.set(f, m); retryOf.delete(f);
      const good = out.result === "filed" || out.result === "same";
      noteFile(f, { attempt: { at, result: out.result, ...(setAside.has(f) ? { said: setAside.get(f) } : {}), ...(good ? { awards: out.awards } : {}) }, ...(good ? { good: { at, awards: out.awards, changed: out.result === "filed" } } : {}), retry: null });
      return out;
    } catch (e) {
      if (e.final) { sentAt.set(f, m); retryOf.delete(f); }
      else {
        const failures = (retryOf.get(f)?.failures ?? 0) + 1;
        e.retryIn = BACKOFF[Math.min(failures, BACKOFF.length) - 1];
        retryOf.set(f, { failures, next: Date.now() + e.retryIn, mtime: m });
      }
      const again = retryOf.get(f);
      noteFile(f, { attempt: { at, result: e.final ? "refused" : "failed", said: e.message, ...(e.status ? { status: e.status } : {}) }, retry: e.final || !again ? null : { failures: again.failures, next: new Date(again.next).toISOString() } });
      throw e;
    }
  };
  const failedLine = (f, e) => `${path.basename(f)} (account ${accountOf(f)}): upload failed (${e.message})${has("--once") ? "." : e.final ? ". Not sent again until the game saves it again." : e.retryIn ? `. Trying again in ${spanText(e.retryIn)}.` : "."}`;
  // For --status: each loot file under its resolved path, with the addon, the account and the game folder it sits in.
  const noteFile = (f, rec) => statusNote("files", path.resolve(f).toLowerCase(), { file: f, addon: addonLabel(systemOf(f)), account: accountOf(f), folder: flavourOf(f) || null, ...rec });
  // …and each of the in-game addon's reads it sent or had refused (a character's gear or recipes, a guild's roster or
  // bank, the council's records), under the key cfg.sent keeps it by.
  const noteRead = (key, rec) => statusNote("reads", key, { at: new Date().toISOString(), ...rec });
  // A saved file that is not there right now (its drive not connected, or moved): said once, kept in the settings, and
  // sent once it is there again (1.17.0, see the files above). Said again only after it was back in between.
  const gone = new Set();
  const notThere = (f) => { if (gone.has(f)) return; gone.add(f); say(`${path.basename(f)} (account ${accountOf(f)}): the file is not there right now (${f}). It stays in the settings and is sent once it is there again. A start looks for the same account's file where World of Warcraft is now, should the game have moved; --file <the file> names it by hand.`); };
  // Which of the saved files is actually sent, worked out afresh at every pass and every look (1.17.0): among the ones
  // that are there, the newest of each account, game and loot addon, since the site keeps one history of each and the
  // older copy sent after the newer overwrote it until the game saved again. Two copies can be in the settings at
  // once — a game moved to another drive with the old folder still about, or a list an older version saved from two
  // installs — and which is the newest changes while the copy runs: the drive comes back, the old install is deleted.
  // Each file left out is said once, and again when the file it gives way to changes.
  const leftOut = new Map(); // a file that is not sent -> the file sent in its place, while that is the one
  const newestEach = (files) => {
    const best = new Map(); // key -> { file, m }
    const at = new Map();
    for (const f of files) {
      const m = mtimeOf(f);
      if (m === null) { leftOut.delete(f); continue; } // away: should it come back and still be left out, that is said again
      at.set(f, m);
      const cur = best.get(keyOf(f));
      if (!cur || m > cur.m) best.set(keyOf(f), { file: f, m });
    }
    const send = new Set([...best.values()].map((b) => b.file));
    for (const f of at.keys()) {
      if (send.has(f)) { if (leftOut.delete(f)) noteFile(f, { leftOut: null }); continue; }
      const was = best.get(keyOf(f)).file;
      if (leftOut.get(f) === was) continue;
      leftOut.set(f, was);
      noteFile(f, { leftOut: was }); // --status says it too: a file that is never sent and no failure to show for it
      say(`${f} is left out: it holds the same account's ${labelOfFile(f)} history${flavourOf(f) ? " in " + flavourOf(f) : ""} as ${was}, which is the one sent (the site keeps one of each)`);
    }
    return send;
  };
  // Every file gets its turn: one that fails is reported and the next is sent all the same (1.9.2 — a CEPGP file
  // with nothing in it used to stop the files after it); the first failure is what --once exits with, and so is no
  // file there at all.
  const upload = async (files = cfg.files) => {
    let firstError = null, there = 0;
    const send = newestEach(files);
    for (const f of files) {
      const m = mtimeOf(f);
      if (m === null) { notThere(f); continue; }
      gone.delete(f);
      there++;
      if (!send.has(f)) continue; // an older copy of a history another file carries: left out, said above
      try { await sendFile(f, m); } catch (e) { say(failedLine(f, e)); firstError ??= e; }
    }
    if (!there && files.length) firstError ??= new Error("none of the loot files is there");
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
  // Only the site's own no is final (finding 14): a 5xx or a 429 is tried again at the next look, where it was set
  // aside until the addon's next scan.
  const finalNo = (r) => r.status < 500 && r.status !== 429;
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
    for (const file of files) { try { dbs.set(file, readGlobal(file, "VortexRaidToolDB")); } catch { /* not readable this look */ } }
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
        if (!r.ok && finalNo(r)) refused.set(`${character}:${what}`, stamp);
        noteRead(`${character}:${what}`, { who: character, what, read: stamp, result: r.ok ? "filed" : finalNo(r) ? "refused" : "failed", ...(r.ok ? {} : { said: r.status === 404 ? "not on the roster" : j.error ?? `HTTP ${r.status}` }) });
        if (r.status === 409 && refusedLine(character, j, t)) { say(refusedLine(character, j, t)); return; }
        if (r.status === 404) { say(`${character}: not on ${t.routed ? t.guild + "'s" : "the"} roster and not in its guild list, so the addon's ${what} were not filed`); return; }
        if (!r.ok) { say(finalNo(r) ? `${character}: the bot refused the addon's ${what} (${j.error ?? `HTTP ${r.status}`})` : `${character}: the addon's ${what} did not go through (${j.error ?? `HTTP ${r.status}`}), so they go again at the next look`); return; }
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
        noteRead(key, { who: guild, what: "guild roster", read: gr.at, result: r.ok ? "filed" : finalNo(r) ? "refused" : "failed", ...(r.ok ? {} : { said: j.error ?? `HTTP ${r.status}` }) });
        if (!r.ok) { if (finalNo(r)) refused.set(key, gr.at); say(refusedLine(`${guild}'s roster`, j, t) ?? `${guild}: the bot refused the guild roster read (${j.error ?? `HTTP ${r.status}`})`); continue; }
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
        noteRead(key, { who: guild, what: "guild bank", read: bank.at, result: r.ok ? "filed" : finalNo(r) ? "refused" : "failed", ...(r.ok ? {} : { said: j.error ?? `HTTP ${r.status}` }) });
        if (!r.ok) { if (finalNo(r)) refused.set(key, bank.at); say(refusedLine(`${guild}'s bank`, j, t) ?? `${guild}: the bot refused the guild bank read (${j.error ?? `HTTP ${r.status}`})`); continue; }
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
  // The addon's reads, the hand-outs, the council's records and the inbox go at every look. A site that is away was said
  // in the log at every one of them, about 240 lines an hour, which pushed the loot lines out of the capped log (1.17.0):
  // now each failure is said once, until what it says changes or one goes through, and --status shows it (its reads).
  const failSaid = new Map(); // what -> the failure last said
  const carry = async (what, fn, failed, name) => {
    try {
      await fn();
      if (failSaid.delete(what)) { say(`${name} went through again`); statusDrop("reads", `site:${what}`); }
    } catch (e) {
      if (failSaid.get(what) !== e.message) { failSaid.set(what, e.message); say(`${failed}: ${e.message}`); }
      noteRead(`site:${what}`, { who: "the addon", what, result: "failed", said: e.message });
    }
  };
  // The addon's own reading is a bonus, never a reason to fail a loot upload. The first pass carries no hand-outs.
  const carryAll = async (first) => {
    if (has("--no-addon")) return;
    // One walk of the WoW folders for the whole pass; one that fails leaves each part to walk, and fail, in its own carry.
    try { passFiles = findAddonFiles(); } catch { passFiles = null; }
    try {
      await carry("reads", sendAddonData, "the addon's data could not be sent", "the addon's data");
      if (!first) await carry("hand-outs", async () => { await carryRequests(); }, "the hand-outs could not be carried out", "the hand-outs");
      await carry("council records", async () => { await carrySessions(); }, "the council's records could not be carried out", "the council's records");
      // The inbox: written at the start whatever the time (force), then every couple of minutes.
      await carry("inbox", async () => { if (first) await carryInbox(true); else await carryInbox(); }, "the inbox could not be written", "the inbox");
    } finally { passFiles = null; }
  };
  await carryAll(true);
  if (has("--check-update")) { if (await checkForUpdate(true)) return; } // a newer build has taken over: this copy is leaving
  // On a Mac (1.17.0) the copy that runs in the background is the login agent's, under launchd. A copy run by hand that
  // stopped the agent's copy (new settings, a newer version) goes back to the agent after its first pass, --once or not.
  // So does one that finds the agent set up but not running, when it is a newer version than the program the agent
  // starts, or the Node.js the agent names is gone (Homebrew or nvm moved it): its program is put in the agent's place and
  // the agent is pointed at it and started (backToBackground). One the same as the agent's runs here, in its window.
  if (PLATFORM === "darwin" && !underLaunchd && (stoppedAgent || (!quiet && !has("--once") && agentInstalled() && (stoppedFor === "newer" || newerVersion(VERSION, installedVersion() ?? "0") || !agentNodeThere())))) {
    await backToBackground(!quiet, stoppedFor === "settings" ? "settings" : "newer");
    return finish(0);
  }
  // New settings given while a copy ran (1.17.0): that copy was stopped before they were read, and they are saved now.
  // The uploader goes back to the background with them; a copy started with --quiet is that background copy already.
  if (stoppedFor === "settings" && (!quiet || has("--once"))) { await backToBackground(!quiet); return finish(0); }
  if (has("--once")) return finish(0);

  // The question about starting at logon is asked only of someone at a window (canAsk, 1.17.0), and counts as asked only
  // once it is answered. A copy with no one to answer (an update's new copy, which an older version starts with no
  // terminal and its own arguments; a person's own autostart) was asked all the same: the question met the end of its
  // input, never settled, and the copy ended before it watched, with nothing to start it again.
  if (PLATFORM === "win32" && !quiet && !has("--install-startup") && !has("--no-ask") && !cfg.askedStartup && canAsk()) {
    const a = await ask("\nStart the uploader with Windows, so it runs after every raid by itself? [Y/n] ");
    if (a !== null) { cfg.askedStartup = true; saveCfg(cfg); }
    if (a !== null && (!a || a.toLowerCase().startsWith("y")) && installStartup() && isSea) {
      // Off to the background now, not at the next logon (1.9.2): the same hidden start the logon entry makes, so the
      // person can close this window and nothing stops. Before this the window had to stay open until the next logon.
      // This copy lets the lock go first (1.17.0), so the hidden copy takes it rather than standing down, and names
      // itself to it (VRT_LOCK_GIVEN): a lock this copy could not remove that moment is the hidden copy's to take.
      releaseLock();
      const child = spawn(process.execPath, ["--quiet", ...(flag("--home") ? ["--home", path.resolve(flag("--home"))] : [])], { detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, VRT_UPLOADER_HIDDEN: "1", VRT_LOCK_GIVEN: String(process.pid) } });
      child.unref();
      console.log("\nRunning in the background from now on, and again at every logon. This window can be closed — nothing stops.");
      await ask("Press Enter to close it. ");
      return finish(0);
    }
  }
  // A Mac (1.17.0): the same question, and a yes sets up the login agent, which launchd starts at once and again at every
  // login; this copy hands over to it and the window may close (backToBackground). --install-startup is a yes given
  // beforehand. Should launchd not take the agent, this copy goes on watching here.
  if (PLATFORM === "darwin" && !underLaunchd && (has("--install-startup") || (!quiet && !has("--no-ask") && !cfg.askedStartup && canAsk()))) {
    let yes = has("--install-startup");
    if (!yes) {
      const a = await ask("\nStart the uploader when you log in to this Mac? [Y/n] ");
      if (a !== null) { cfg.askedStartup = true; saveCfg(cfg); }
      yes = a !== null && (!a || a.toLowerCase().startsWith("y"));
    }
    if (yes && (await backToBackground(!quiet, "start"))) return finish(0);
  } else if (has("--install-startup")) installStartup();

  const stays = quiet || !canAsk() ? "" : PLATFORM === "win32" ? "; leave this window open (or close it and let the Windows startup copy do the work)"
    : PLATFORM === "darwin" && agentInstalled() ? "; leave this window open, or close it and let the copy that starts when you log in do the work" : "; leave this window open while it should watch";
  say(`watching ${cfg.files.length === 1 ? cfg.files[0] : cfg.files.length + " files"} — WoW writes them on logout or /reload${stays}.`);
  statusSet({ watching: new Date().toISOString() });
  let busy = false;
  setInterval(async () => {
    if (busy || leaving) return; // the last look is still sending; this one would send the same things again
    busy = true;
    try { await look(); } finally { busy = false; }
  }, (Number(process.env.VRT_UPLOADER_EVERY) || 30) * 1000);
  async function look() {
    const send = newestEach(cfg.files); // the newest of each account, game and addon among the files that are there
    for (const f of cfg.files) {
      try {
        const m = mtimeOf(f);
        if (m === null) { notThere(f); continue; }
        if (gone.delete(f)) say(`${path.basename(f)} (account ${accountOf(f)}): the file is there again.`);
        if (!send.has(f)) continue; // an older copy of a history another file carries: left out, said by newestEach
        if (m === sentAt.get(f)) continue; // the site has this version, or answered it for good
        const again = retryOf.get(f);
        if (again && Date.now() < again.next) continue; // a failed upload waits its turn (BACKOFF)
        if (!again || again.mtime !== m) await new Promise((r) => setTimeout(r, 3000)); // just saved: the game may still be writing
        await sendFile(f, m);
      } catch (e) { say(failedLine(f, e)); }
    }
    // WoW writes every addon's file at the same moment, so this is the same logout the loot history came from.
    await carryAll(false);
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
    // What the check came to, for --status (1.17.0): "current", "no answer", "download failed", "hash", "newer".
    const noted = (result, more = {}) => statusSet({ update: { at: new Date(updateAskedAt).toISOString(), result, ...more } });
    const kind = (isSea && !underLauncher) ? "exe" : "cjs"; // the launcher's program is the script; only a 1.12 exe fetches an exe
    let info;
    try { const r = await fetch(`${hub}/api/uploader/version`); if (!r.ok) { noted("no answer", { said: `HTTP ${r.status}` }); return false; } info = await r.json(); } catch (e) { noted("no answer", { said: e.message }); return false; }
    const want = info?.[kind];
    if (!want?.version || !want.sha256 || !newerVersion(want.version, VERSION)) { noted("current", { version: want?.version ?? null }); return false; }
    const me = programFile();
    const ext = path.extname(me);
    const fresh = me.slice(0, -ext.length) + ".new" + ext;
    say(`uploader ${want.version} is out (this is ${VERSION}) — fetching it`);
    try {
      const r = await fetch(`${hub}${want.url ?? "/downloads/vrt-uploader." + kind}`);
      if (!r.ok) { say(`the download answered HTTP ${r.status} — staying on ${VERSION}, trying again later`); noted("download failed", { version: want.version, said: `HTTP ${r.status}` }); return false; }
      const buf = Buffer.from(await r.arrayBuffer());
      const sha = crypto.createHash("sha256").update(buf).digest("hex");
      if (sha !== String(want.sha256).toLowerCase()) { say("the download did not match its published hash — not installed"); noted("hash", { version: want.version }); return false; }
      fs.writeFileSync(fresh, buf);
    } catch (e) { say(`could not fetch the update: ${e.message}`); noted("download failed", { version: want.version, said: e.message }); return false; }
    // Under launchd, the login agent's copy on a Mac (1.17.0): the fresh file takes this one's name at once (a running
    // script's file can be replaced there), and this copy ends with exit code 0, which the agent's KeepAlive
    // (SuccessfulExit) answers by starting the program again: the new version, in launchd's keeping. No copy is started
    // from here: one started outside launchd would be a copy launchd does not know, and the agent's restart a second.
    if (underLaunchd && !isSea) {
      try { fs.renameSync(fresh, me); }
      catch (e) { try { fs.unlinkSync(fresh); } catch { /* gone */ } say(`could not put uploader ${want.version} in place (${e.message}), so this stays ${VERSION} and tries again later`); noted("download failed", { version: want.version, said: e.message }); return false; }
      noted("newer", { version: want.version });
      say(`updated to ${want.version}: ${me} is the new file, and launchd starts it now. This copy (${VERSION}) stops.`);
      leaving = true;
      setTimeout(() => process.exit(0), 500);
      return true;
    }
    noted("newer", { version: want.version });
    // The same arguments, minus this one-off flag and minus the file the previous update came from.
    const args = [];
    for (let i = 0; i < argv.length; i++) { if (argv[i] === "--check-update") continue; if (argv[i] === "--updated-from") { i++; continue; } args.push(argv[i]); }
    args.push("--updated-from", me);
    // Under the launcher the fresh script is started through the launcher itself (VRT_PROGRAM names it); a 1.12 exe
    // starts the fresh exe; the script under node starts node on the fresh script.
    // VRT_LOCK_FROM (1.17.0): the new copy waits for this process to be gone, then takes the lock it held.
    const env = { ...process.env, VRT_UPLOADER_HIDDEN: "1", VRT_LOCK_FROM: String(process.pid) };
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
    const files = addonFiles();
    cfg.sessionsSent = cfg.sessionsSent ?? {};
    for (const file of files) {
      let db = null;
      try { db = readGlobal(file, "VortexRaidToolDB"); } catch { db = null; }
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
        noteRead(`council:${character}`, { who: character, what: "council records", count: sessions.length, result: r.ok ? "filed" : "refused", ...(r.ok ? {} : { said: j.error ?? `HTTP ${r.status}` }) });
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
    const files = addonFiles();
    cfg.givenSent = cfg.givenSent ?? {};
    // The settings are written once for the pass, not once a mark (finding 7: 500 marks rewrote them 500 times), and
    // also when a post fails part way, so the marks before it are not sent again.
    let marked = 0;
    try {
      for (const file of files) {
        const t = target({ flavour: flavourOf(file) });
        let db = null;
        try { db = readGlobal(file, "VortexRaidToolDB"); } catch { db = null; }
        for (const [id, mark] of Object.entries(db?.given ?? {})) {
          if (!mark || typeof mark !== "object" || cfg.givenSent[id]) continue;
          const r = await fetch(`${t.server}/api/requests/addon-given`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: t.token, id, system: mark.system, by: mark.by, note: mark.note ?? "" }) });
          const j = await r.json().catch(() => ({}));
          if (r.ok || r.status === 404 || r.status === 409) {
            cfg.givenSent[id] = { at: new Date().toISOString().slice(0, 10), result: j.already ? "already" : j.gone ? "gone" : r.ok ? "ok" : j.error ?? `HTTP ${r.status}` };
            marked++;
            say(`${t.routed ? "→ " + t.guild + ": " : ""}${mark.system ?? "request"} for ${j.main ?? id}: ${j.already ? "was already handed out on the site" : j.gone ? "no longer on the site (withdrawn or handled)" : r.ok ? `handed out in game by ${mark.by ?? "?"} — the site has it` : j.error ?? `HTTP ${r.status}`}`);
            inboxStamp.clear(); // the site's queue changed: the inbox is rewritten on the next look
          }
        }
      }
    } finally { if (marked) saveCfg(cfg); }
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
    const files = addonFiles();
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
      // The guild's loot history, back into RCLootCouncil (1.15.0): what this client's RCLootCouncil history lacks.
      const found = lootFor(file, await siteLoot(t));
      const loot = found === undefined ? (lootLast.get(dir) ?? null) : found;
      if (found !== undefined) lootLast.set(dir, found);
      if (loot && loot.count !== (lootSaid.get(dir) ?? 0)) {
        if (loot.count) say(`${t.routed ? "→ " + t.guild + ": " : ""}RCLootCouncil history: ${loot.count} award(s) the guild's history has and ${THIS_PC}'s lacks${loot.total > loot.count ? ` (the newest ${loot.count} of ${loot.total}; the rest follow once the game has saved these)` : ""} — the addon adds them at the next /reload`);
        else say(`${t.routed ? "→ " + t.guild + ": " : ""}RCLootCouncil history: ${THIS_PC}'s now holds every award the guild's history has`);
        lootSaid.set(dir, loot.count);
      }
      if (!wish && !req && !stand && !recipes && !loot?.count) continue;
      const stamp = JSON.stringify([wish, req, stand, recipes, loot?.count ? loot.entries.map((e) => e.id) : null, lootSite.get(t.server)?.version ?? null]);
      // Unchanged since the last write — unless the file on disk is no longer ours: an addon update (CurseForge,
      // 2026-09-17) replaces Inbox.lua with the empty one the addon ships, and the addon then loads nothing until the
      // site changes. So the file is looked at, not just remembered: no stamp of ours in it, it is written again.
      const onDisk = (() => { try { return /\["stamp"\] = "([^"]*)"/.exec(fs.readFileSync(path.join(dir, "Inbox.lua"), "utf8"))?.[1] ?? null; } catch { return null; } })();
      if (inboxStamp.get(dir) === stamp && onDisk && onDisk === inboxWritten.get(dir)) continue;
      try {
        const text = inboxLua(wish, req, stand, recipes, loot?.count ? loot : null);
        fs.writeFileSync(path.join(dir, "Inbox.lua"), text);
        inboxStamp.set(dir, stamp);
        inboxWritten.set(dir, /\["stamp"\] = "([^"]*)"/.exec(text)?.[1] ?? null);
        statusNote("inbox", dir.toLowerCase(), { at: new Date().toISOString(), dir, folder: flavourOf(file) || null, addon: path.basename(dir), wishlists: wish ? Object.keys(wish.items).length : 0, requests: req ? req.systems.reduce((n, s) => n + s.rows.length, 0) : 0, standings: stand?.count ?? 0, recipes: recipes ? Number(recipes.count) || 0 : 0, loot: loot?.count ?? 0, error: null });
        say(`${t.routed ? "→ " + t.guild + ": " : ""}inbox written for the addon — ${wish ? `wishlists of ${wish.raiders} raider(s), ${Object.keys(wish.items).length} item(s)${wish.priority ? " with Priority" : ""}` : "no wishlists"}; ${req ? `${req.systems.reduce((n, s) => n + s.rows.length, 0)} bank request(s) waiting` : "no requests"}; ${stand ? `the standings of ${stand.count} raider(s) for the loot council frame` : "no standings"} — a /reload takes it`);
      } catch (e) { say(`${path.basename(path.dirname(dir))}: inbox not written — ${e.message}`); statusNote("inbox", dir.toLowerCase(), { failedAt: new Date().toISOString(), dir, folder: flavourOf(file) || null, addon: path.basename(dir), error: e.message }); }
    }
  }
  // ---------- the guild's loot history, back into RCLootCouncil (1.15.0) ----------
  // Furytann, 2026-09-24: "Whenever there's been a raid someone with the uploader installed missed (or did from other
  // computer) their loot history for RCLC should also be updated. So it remains current. Can we do both way?" Up has
  // always been this uploader's job. Down: the site hands out every award it counts, as the entry RCLootCouncil
  // writes (/api/loot/sync — asked with ?have=, so an unchanged history costs a word); the ones this PC's
  // RCLootCouncil files lack go into the addon's inbox, and the addon adds them to RCLootCouncil's history at the
  // next /reload (0.10.12). An award a file once held and no longer does was deleted in game on purpose and is never
  // put back — the ids each file has held are kept in rclc-seen.json beside the settings. Only the RCLootCouncil
  // files this uploader sends, and only those of the client (flavour) whose addon folder the inbox goes to.
  async function siteLoot(t) {
    const had = lootSite.get(t.server) ?? null;
    try {
      const r = await fetch(`${t.server}/api/loot/sync?key=${encodeURIComponent(t.token)}${had ? `&have=${encodeURIComponent(had.version)}` : ""}`);
      if (!r.ok) return had?.awards ?? null; // an older site has no such route
      const j = await r.json();
      if (j.same && had) return had.awards;
      if (!Array.isArray(j.awards)) return had?.awards ?? null;
      lootSite.set(t.server, { version: String(j.version ?? ""), awards: j.awards });
      return j.awards;
    } catch { return had?.awards ?? null; }
  }
  function flavourRootOf(file) { return path.resolve(file, "..", "..", "..", "..", "..").toLowerCase(); } // …\_anniversary_\WTF\Account\<account>\SavedVariables\x.lua → …\_anniversary_
  function seenIds() {
    if (lootSeen) return lootSeen;
    lootSeen = new Map();
    try { for (const [file, ids] of Object.entries(JSON.parse(fs.readFileSync(seenFile, "utf8")))) if (Array.isArray(ids)) lootSeen.set(file, new Set(ids.map(String))); } catch { /* none kept yet */ }
    return lootSeen;
  }
  /**
   * What this client's RCLootCouncil history lacks, for the inbox: { count, total, entries: [{ id, aliases, player,
   * realm, entry }] }; null when there is nothing to say (no RCLootCouncil file, no answer from the site); undefined
   * when a file could not be read this pass (the game writing it) — the caller keeps what the last pass found.
   */
  function lootFor(svFile, awards) {
    if (!Array.isArray(awards)) return null;
    const flavour = flavourRootOf(svFile);
    const files = (cfg.files ?? []).filter((f) => systemOf(f) === "rclc" && flavourRootOf(f) === flavour);
    if (!files.length) return null;
    const seen = seenIds();
    const held = [];
    const realms = new Map(); // faction-realm → entries under it, over this client's files
    let iso = 0, old = 0, grew = false;
    for (const f of files) {
      let db;
      try { db = readGlobal(f, "RCLootCouncilLootDB"); } catch { return undefined; }
      const key = path.resolve(f).toLowerCase();
      const had = seen.get(key) ?? new Set();
      for (const [realmKey, players] of Object.entries(db?.factionrealm ?? {})) {
        for (const list of Object.values(players ?? {})) {
          for (const e of Array.isArray(list) ? list : Object.values(list ?? {})) {
            if (!e || typeof e !== "object" || e.id == null) continue;
            if (!had.has(String(e.id))) { had.add(String(e.id)); grew = true; }
            realms.set(realmKey, (realms.get(realmKey) ?? 0) + 1);
            if (/^\d{4}\//.test(String(e.date))) iso++; else if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(String(e.date))) old++;
          }
        }
      }
      seen.set(key, had);
      held.push(had);
    }
    if (grew) { try { fs.writeFileSync(seenFile, JSON.stringify(Object.fromEntries([...seen].map(([k, v]) => [k, [...v]])))); } catch { /* next pass */ } }
    // Wanted where some file has never held it (nor the award it was folded into): a file that held it and lost it
    // had it deleted in game, and one that holds it has it.
    const wanted = awards.filter((a) => a && a.id != null && a.player && a.entry && held.some((h) => ![a.id, ...(a.aliases ?? [])].some((x) => h.has(String(x)))));
    const biggest = [...realms.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    const flat = (x) => String(x ?? "").toLowerCase().replace(/\s+/g, "");
    const realmFor = (a) => a.realmKey || [...realms.entries()].filter(([k]) => flat(k.split(" - ").slice(1).join(" - ")) === flat(String(a.player).split("-").slice(1).join("-"))).sort((x, y) => y[1] - x[1])[0]?.[0] || biggest;
    const entries = [];
    for (const a of wanted.slice(0, LOOT_EVERY_PASS)) {
      const realm = realmFor(a);
      if (!realm) continue;
      const entry = { ...a.entry };
      // An RCLootCouncil older than 0.24 keeps dd/mm/yy; 1.5 keeps YYYY/MM/DD, the site's form.
      if (old > iso) { const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(String(entry.date)); if (m) entry.date = `${m[3]}/${m[2]}/${m[1].slice(2)}`; }
      entries.push({ id: String(a.id), aliases: (a.aliases ?? []).map(String), player: String(a.player), realm, entry });
    }
    return { count: entries.length, total: wanted.length, entries };
  }
  /** A JavaScript value as Lua: strings, numbers, booleans, lists and keyed tables (an RCLootCouncil entry). */
  function luaVal(v) {
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "0";
    if (typeof v === "string") return luaStr(v);
    if (Array.isArray(v)) return "{ " + v.map(luaVal).join(", ") + " }";
    if (v && typeof v === "object") return "{ " + Object.entries(v).filter(([, x]) => x !== null && x !== undefined).map(([k, x]) => `[${luaStr(k)}] = ${luaVal(x)}`).join(", ") + " }";
    return "nil";
  }
  /** The awards for RCLootCouncil as Lua (1.15.0): at, count, entries = { { id, player, realm, aliases = { … }, entry = { … } }, … }. */
  function lootLua(l) {
    const lines = [`["at"] = ${luaStr(new Date().toLocaleString("sv-SE").slice(0, 16))},`, `["count"] = ${luaNum(l.count)},`, `["entries"] = {`];
    for (const e of l.entries) lines.push(`{ ["id"] = ${luaStr(e.id)}, ["player"] = ${luaStr(e.player)}, ["realm"] = ${luaStr(e.realm)}, ["aliases"] = ${luaVal(e.aliases)}, ["entry"] = ${luaVal(e.entry)} },`);
    lines.push(`},`);
    return lines;
  }
  // Function declarations, hoisted: carryInbox runs once before main reaches this line.
  function luaStr(v) { return '"' + String(v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ") + '"'; }
  function luaNum(v) { return (Number.isFinite(Number(v)) ? Number(v) : 0); }
  /** The whole inbox file: one global the addon reads at load, with a stamp of when it was written. */
  function inboxLua(wish, req, stand, recipes, loot) {
    const stamp = new Date().toLocaleString("sv-SE").slice(0, 16);
    const lines = ["-- Vortex Raid Tool — written by the uploader; the game reads it at every /reload. Do not edit.", "VortexRaidToolInbox = {", `["stamp"] = ${luaStr(stamp)},`];
    if (wish) lines.push(`["wishlists"] = {`, ...wishlistsLua(wish), `},`);
    if (req) lines.push(`["requests"] = {`, ...requestsLua(req), `},`);
    if (stand) lines.push(`["standings"] = {`, ...standingsLua(stand), `},`);
    if (recipes) lines.push(`["recipes"] = {`, ...recipesLua(recipes), `},`);
    if (loot) lines.push(`["loot"] = {`, ...lootLua(loot), `},`);
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
// A test points VRT_REG at a stand-in (1.17.0), so no test ever writes this user's real Run list.
const REG = process.env.VRT_REG || "reg.exe";
function reg(...args) { const r = runTool(REG, args, { encoding: "utf8", windowsHide: true }); return r.status === 0; }
/** The logon entry as it stands — the command line in the Run list — or null. */
function startupEntry() {
  if (PLATFORM !== "win32") return null;
  const r = runTool(REG, ["query", RUN_KEY, "/v", RUN_NAME], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) return null;
  const m = new RegExp(`${RUN_NAME}\\s+REG_SZ\\s+(.+)$`, "m").exec(r.stdout ?? "");
  return m ? m[1].trim() : null;
}
/** The exe a logon entry starts, or null: the first quoted path, as installStartup writes it. */
const exeOfEntry = (entry) => (entry && /^"([^"]+\.exe)"/i.exec(entry)?.[1]) || null;
/** Stop every running copy of the program at that path — an older download the logon entry used to start. */
function stopProgramAt(exe) {
  if (PLATFORM !== "win32") return false;
  const ps = `Get-Process | Where-Object { $_.Path -eq '${exe.replace(/'/g, "''")}' -and $_.Id -ne ${process.pid} } | Stop-Process -Force`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", windowsHide: true, timeout: 20000 });
  return r.status === 0;
}
function installStartup(why, exePath = process.execPath) {
  if (PLATFORM === "darwin") return installAgent(); // a Mac's start at login is a login agent (1.17.0)
  if (PLATFORM !== "win32") { say("starting at logon is set up on Windows and on a Mac; on this system, run it from your own autostart"); return false; }
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
    if (PLATFORM === "win32" && exeTaken && exeOfEntry(startupEntry())) installStartup("newer", old);
    if (isSea) { // the same arguments, minus the hand-over flag; the new process sweeps the file moved aside
      const args = [];
      for (let i = 0; i < argv.length; i++) { if (argv[i] === "--updated-from") { i++; continue; } args.push(argv[i]); }
      // Under the launcher: the launcher again, under its proper name, on the program file that now has its proper
      // name too (VRT_PROGRAM dropped); a 1.12 exe: the proper exe.
      // The copy started under the proper name waits for this one to leave and takes the lock after it (1.17.0).
      const env = { ...process.env, VRT_UPLOADER_HIDDEN: "1", VRT_LOCK_FROM: String(process.pid) };
      delete env.VRT_PROGRAM;
      const child = spawn(exeTaken ? old : process.execPath, args, { detached: true, stdio: "ignore", windowsHide: true, env });
      child.unref();
      setTimeout(() => process.exit(0), 500);
      return "left";
    }
  } else {
    say(`updated to ${VERSION}, but the old file could not be replaced (${why}) — running from ${me} instead`);
    if (PLATFORM === "win32" && isSea && !underLauncher && exeOfEntry(startupEntry())) installStartup("newer");
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
  if (PLATFORM === "darwin") return removeAgent(); // the login agent (1.17.0)
  if (PLATFORM !== "win32") { say("nothing to remove: starting at logon is set up on Windows and on a Mac only"); return; }
  const had = reg("delete", RUN_KEY, "/v", RUN_NAME, "/f");
  let script = false;
  try { fs.unlinkSync(legacyStartup()); script = true; } catch {}
  say(had || script ? "logon entry removed" : "no logon entry found");
}

// ---------- starting at login on a Mac (1.17.0) ----------
// Decided 17 October 2026: on a Mac the uploader runs under Node.js (from its makers' own installer, then one line in
// Terminal) and starts at login the Mac's own way, as a login agent: a plist in ~/Library/LaunchAgents that launchd, the
// Mac's service manager, loads at every login. The plist names Node.js and the program by their full paths, with --quiet
// (and the settings folder and the hub when they were given). RunAtLoad starts it as it is loaded. KeepAlive with
// SuccessfulExit starts it again after it ends with exit code 0, which is how an update hands over (checkForUpdate), and
// never after any other: a second copy standing down ends with 4, an error with 1. VRT_LAUNCHD tells the program where it
// runs. What it writes to stderr goes to a file in the settings folder; its log is its own, as anywhere. The program the
// agent starts is a copy in ~/Library/Application Support/VortexRaidTool: the file people run sits in Downloads, a folder
// macOS keeps from a program launchd starts unless the person allows it, and a file they may well delete. It is loaded
// with launchctl bootout (whatever ran under the agent before stops) and then bootstrap into the person's own login
// session (gui/<uid>), and with the older launchctl load -w when that is refused.
const AGENT_LABEL = "com.vortexraidtool.uploader";
const LAUNCHCTL = process.env.VRT_LAUNCHCTL || "/bin/launchctl"; // a test names a stand-in, so no test loads anything into launchd
let stoppedAgent = false; // this start stopped the agent's copy (new settings, a newer version): it goes back to the agent (main)
function agentPlist() { return path.join(process.env.VRT_LAUNCH_AGENTS || path.join(os.homedir(), "Library", "LaunchAgents"), `${AGENT_LABEL}.plist`); }
function macProgramDir() { return path.join(os.homedir(), "Library", "Application Support", "VortexRaidTool"); }
const agentInstalled = () => fs.existsSync(agentPlist());
function launchctl(...args) {
  const r = runTool(LAUNCHCTL, args, { encoding: "utf8", timeout: 30000 });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() || (r.error ? r.error.message : `exit code ${r.status}`) };
}
function guiDomain() { return `gui/${typeof process.getuid === "function" ? process.getuid() : os.userInfo().uid}`; }
/** The version of the program the agent starts (its copy in the program folder), or null when there is none. */
function installedVersion() { try { return /^const VERSION = "([^"]+)"/m.exec(fs.readFileSync(path.join(macProgramDir(), "vrt-uploader.cjs"), "utf8"))?.[1] ?? null; } catch { return null; } }
/** What the agent starts, as its plist lists it (ProgramArguments), or null. */
function agentArgs() {
  let xml; try { xml = fs.readFileSync(agentPlist(), "utf8"); } catch { return null; }
  const list = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(xml)?.[1];
  return list ? [...list.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) => m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")) : null;
}
/** Whether the Node.js the agent names is still there: installing Node.js again, or Homebrew or nvm updating it, moves it. */
const agentNodeThere = () => { const a = agentArgs(); return !!a?.[0] && fs.existsSync(a[0]); };
/**
 * The Node.js the agent names: /opt/homebrew/bin/node or /usr/local/bin/node when it is the very file this copy runs on (a
 * link Homebrew keeps pointing at its current Node.js, or the file Node.js's own installer puts there), so an update keeps
 * the start at login working; else this copy's own, with a line in the log. A test names other places (VRT_NODE_PATHS).
 */
function nodeForAgent() {
  const id = (p) => { try { const s = fs.statSync(p, { bigint: true }); return `${s.dev}:${s.ino}`; } catch { return null; } };
  const mine = id(process.execPath);
  const places = process.env.VRT_NODE_PATHS ? process.env.VRT_NODE_PATHS.split(path.delimiter) : ["/opt/homebrew/bin/node", "/usr/local/bin/node"];
  const stable = mine ? places.find((p) => p && id(p) === mine) : null;
  return stable ? { path: stable, stable: true } : { path: process.execPath, stable: false };
}
/** The agent's plist: what launchd reads at every login. */
function plistText(args) {
  const x = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>Label</key>", `\t<string>${AGENT_LABEL}</string>`,
    "\t<key>ProgramArguments</key>", "\t<array>", ...args.map((a) => `\t\t<string>${x(a)}</string>`), "\t</array>",
    "\t<key>RunAtLoad</key>", "\t<true/>",
    "\t<key>KeepAlive</key>", "\t<dict>", "\t\t<key>SuccessfulExit</key>", "\t\t<true/>", "\t</dict>",
    "\t<key>EnvironmentVariables</key>", "\t<dict>", "\t\t<key>VRT_LAUNCHD</key>", "\t\t<string>1</string>", "\t</dict>",
    "\t<key>StandardErrorPath</key>", `\t<string>${x(path.join(cfgDir, "uploader-errors.log"))}</string>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}
/** Loads the agent into launchd, which starts its copy; whatever ran under it before is stopped first. True once launchd has it. */
function loadAgent(plist) {
  const d = guiDomain(), job = `${d}/${AGENT_LABEL}`;
  launchctl("bootout", job); // nothing loaded: launchctl says so, and that is fine
  for (let i = 0; i < 20 && launchctl("print", job).ok; i++) sleepSync(250); // gone from launchd before it is loaded again
  // A start switched off before (launchctl disable) would not load, so it is switched on again, and only then (1.17.0):
  // enable, as load -w does, writes the label into launchd's own list of services switched off or on, which outlasts a
  // restart and which no command takes out again (launchctl(1)). An uploader that never needs it leaves nothing there.
  const off = launchctl("print-disabled", d);
  if (off.ok && off.out.split("\n").some((l) => l.includes(`"${AGENT_LABEL}"`) && /=>\s*(true|disabled)\s*$/.test(l))) launchctl("enable", job);
  let r = launchctl("bootstrap", d, plist);
  if (!r.ok) { sleepSync(1000); r = launchctl("bootstrap", d, plist); } // launchd may still be letting the old one go
  if (r.ok) return true;
  const old = launchctl("load", plist); // the older way, which some systems still take (without -w, for the same reason)
  if (old.ok && launchctl("print", job).ok) return true;
  say(`launchd did not start the login agent (${r.out.split("\n")[0]}), so the uploader is not running under it. Run vrt-uploader with --install-startup to try again.`);
  return false;
}
/**
 * Sets up the start at login, or points it at this program (yes to the question, --install-startup, a copy taking the
 * agent over): this program copied into the program folder, unless that one is a newer version; the plist written; the
 * agent loaded, which starts its copy. True once launchd has it.
 */
function installAgent() {
  const dir = macProgramDir(), prog = path.join(dir, "vrt-uploader.cjs"), me = programFile();
  const elsewhere = path.resolve(me) !== path.resolve(prog);
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (elsewhere && !newerVersion(installedVersion(), VERSION)) { const tmp = `${prog}.${process.pid}.tmp`; fs.copyFileSync(me, tmp); fs.renameSync(tmp, prog); }
  } catch (e) { say(`could not put the program in ${dir} (${e.message}), so the uploader does not start when you log in`); return false; }
  const node = nodeForAgent();
  const args = [node.path, prog, "--quiet", ...(flag("--home") || process.env.VRT_UPLOADER_HOME ? ["--home", cfgDir] : []), ...(flag("--hub") ? ["--hub", flag("--hub")] : [])];
  const plist = agentPlist();
  try { fs.mkdirSync(path.dirname(plist), { recursive: true }); const tmp = `${plist}.${process.pid}.tmp`; fs.writeFileSync(tmp, plistText(args)); fs.renameSync(tmp, plist); }
  catch (e) { say(`could not write the login agent ${plist} (${e.message}), so the uploader does not start when you log in`); return false; }
  if (!loadAgent(plist)) return false;
  // How to take it off names the program the agent runs, which stays where it is whatever becomes of the download (the
  // site's Mac steps give the same line).
  say(`starts whenever you log in to this Mac: the login agent ${plist} runs ${prog}${elsewhere ? ". The file you ran is not needed for that" : ""}. --remove-startup takes the login start out, and node "${prog}" --uninstall takes the uploader off.`);
  if (!node.stable) say(`the login start runs Node.js from ${node.path}. If Node.js moves (installed again, or updated through Homebrew or nvm), run the uploader once more from Terminal, and it finds Node.js again.`);
  return true;
}
/** Stops the agent's copy with bootout (launchd stops it and starts nothing in its place), waiting up to ten seconds for it to be gone. */
async function stopAgentCopy(pid) {
  stoppedAgent = true;
  launchctl("bootout", `${guiDomain()}/${AGENT_LABEL}`);
  for (let i = 0; i < 40; i++) { if (!pidAlive(pid)) return true; await sleep(250); }
  return stopProcess(pid); // launchd let it be: by its process id, as anywhere else
}
/** Takes the start at login out: the agent out of launchd, which stops its copy, and its plist gone. */
function removeAgent() {
  const job = `${guiDomain()}/${AGENT_LABEL}`;
  const seen = launchctl("print", job);
  if (seen.ok) launchctl("bootout", job);
  let had = false; try { fs.unlinkSync(agentPlist()); had = true; } catch { /* none */ }
  say(had || seen.ok ? `the login start is removed${/state = running/.test(seen.out) ? ", and the uploader it ran has stopped" : ""}` : "no login start found");
}
/** A path as Terminal types it (1.17.0): a file dragged onto the window comes with a backslash before each space, or in quotes; ~ is the home folder. */
function typedPath(s) {
  let p = String(s ?? "").trim();
  if (/^(['"]).*\1$/.test(p)) p = p.slice(1, -1);
  else p = p.replace(/\\(.)/g, "$1");
  if (p === "~" || p.startsWith("~/")) p = path.join(os.homedir(), p.slice(1));
  return p;
}

// ---------- one copy per settings folder (1.17.0) ----------
// Two copies on one settings folder both wrote uploader.json, the addon's Inbox.lua and rclc-seen.json, and raced each
// other's update renames; an old copy and the one replacing it were seen running side by side for minutes. So the copy
// that runs names itself in uploader.lock beside the settings, made with "wx" (only where no such file is): its process
// id, when it started, the PC, its version, its program file and the settings folder, and the copy that handed it the
// lock when one did (from: an update, the start again under the proper name). A lock counts only while it is
// true: the same PC, that process still running, the process this program, and the system's own start time for it
// within seconds of the one written (Windows hands a freed process id to the next program quickly). Anything else is a
// lock left behind, replaced with a line in the log. A check that cannot be made at all counts as no lock: two copies
// running is how it was before the lock, while a copy that wrongly stands down leaves the guild with no uploader. The
// lock goes with the process that wrote it, at its end, when it still names that process; a process ended from outside
// leaves it behind, and the next start replaces it.
const LOCK_SLACK = PLATFORM === "win32" ? 5000 : 60000; // ps gives the start to the second, and a clock set since moves it
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } }
/** Runs a helper program; a script (a test's stand-in for ps or reg.exe) runs under Node. */
function runTool(cmd, args, opts) { return /\.[cm]?js$/i.test(cmd) ? spawnSync(isSea ? "node" : process.execPath, [cmd, ...args], opts) : spawnSync(cmd, args, opts); }
/**
 * What the system says about a running process: { started (ms), command }; null when no such process runs; undefined
 * when it could not be asked (no PowerShell or ps, a timeout, an answer that does not read).
 */
function processInfo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (PLATFORM === "win32") {
    // Win32_Process: the creation time to the microsecond, the program, and its command line.
    const ps = "try { $p = Get-CimInstance Win32_Process -Filter 'ProcessId=" + pid + "' -ErrorAction Stop } catch { [Console]::Out.Write('ERR'); exit 0 }; "
      + "if ($p) { [Console]::Out.Write($p.CreationDate.ToUniversalTime().ToString('o') + [char]10 + $p.ExecutablePath + [char]10 + $p.CommandLine) } else { [Console]::Out.Write('NONE') }";
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", windowsHide: true, timeout: 20000 });
    const out = r.status === 0 ? String(r.stdout ?? "").trim() : "";
    if (out === "NONE") return null;
    if (!out || out === "ERR") return undefined;
    const [created, exe, ...line] = out.split("\n");
    const started = Date.parse(String(created).trim().replace(/(\.\d{3})\d+/, "$1"));
    return { started: Number.isFinite(started) ? started : null, command: (line.join(" ").trim() + " " + String(exe ?? "").trim()).trim() };
  }
  // ps: the start in the C locale's words ("Sat Oct 17 21:03:44 2026", local time), then the command. Each column is an
  // -o of its own: in "-o lstart=,command=" the "=" names the first column's header, and that header would be ",command=".
  const r = runTool(process.env.VRT_PS || "ps", ["-p", String(pid), "-o", "lstart=", "-o", "command="], { encoding: "utf8", timeout: 10000, env: { ...process.env, LC_ALL: "C", LANG: "C" } });
  if (r.error || r.status === null) return undefined;
  const line = String(r.stdout ?? "").split("\n").map((l) => l.trim()).find(Boolean);
  if (!line) return r.status === 1 ? null : undefined; // ps -p with no such process: exit 1, nothing printed
  const m = /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(\d{4})\s*(.*)$/.exec(line);
  const month = m ? "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(m[1]) : -1;
  if (!m || month < 0 || month % 3) return undefined;
  return { started: new Date(Number(m[6]), month / 3, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])).getTime(), command: m[7] };
}
/**
 * Whether a command line is this program's: by its name, or by the file names the lock gives (a download renamed by
 * hand), each as it is and under its proper name. A script renamed by hand that updated itself runs on as …new.cjs (a
 * script is not started again under its proper name), and its command line holds only that (1.17.0).
 */
function looksLikeUploader(command, lock) {
  const c = String(command ?? "").toLowerCase();
  const names = ["vrt-uploader", lock?.program && path.basename(String(lock.program)), lock?.kind === "exe" && lock?.exe && path.basename(String(lock.exe))].filter(Boolean).map((n) => String(n).toLowerCase());
  return !!c && [...names, ...names.map((n) => n.replace(/(\.new)+(\.[^.]+)$/, "$2"))].some((n) => c.includes(n));
}
/** The same program file as this one's; an update's new file counts under its proper name (…new.cjs is …cjs). */
function sameProgram(lock) {
  const norm = (p) => path.resolve(String(p ?? "")).replace(/(\.new)+(\.[^.\\/]+)$/i, "$2").toLowerCase();
  return norm(lock?.program) === norm(programFile());
}
/**
 * Whether the copy a lock (or a note in the running list) names still runs: { held: true, pid } or { held: false, why }.
 * `from` is the copy this one replaces: its lock is this one's to take, said nowhere.
 */
function judgeLock(lock, from = 0) {
  const pid = Number(lock?.pid);
  if (!Number.isInteger(pid) || pid <= 0 || !lock.started) return { held: false, why: "it could not be read" };
  if (from && pid === from) return { held: false, why: "the copy this one replaces has closed", quietly: true };
  if (pid === process.pid) return { held: false, why: "it names this process, from an earlier start" };
  if (lock.host && lock.host !== os.hostname()) return { held: false, why: `it was written on another PC, ${lock.host}` };
  if (!pidAlive(pid)) return { held: false, why: `process ${pid} has ended` };
  const info = processInfo(pid);
  if (info === null) return { held: false, why: `process ${pid} has ended` };
  if (info === undefined) return { held: false, why: `process ${pid} could not be checked`, unknown: true, pid }; // --status says it cannot tell
  if (!looksLikeUploader(info.command, lock)) return { held: false, why: `process ${pid} is another program now` };
  const at = Date.parse(lock.started);
  if (!Number.isFinite(at) || info.started == null || Math.abs(info.started - at) > LOCK_SLACK) return { held: false, why: `process ${pid} started at another time, so it is another program now` };
  return { held: true, pid };
}
/** The lock as it stands: null when there is none, else { raw, lock (null when it does not read), age in ms }. */
function readLock() {
  try {
    const raw = fs.readFileSync(lockFile, "utf8");
    let lock = null; try { lock = JSON.parse(raw); } catch { /* half written, or not a lock */ }
    let age = Infinity; try { age = Date.now() - fs.statSync(lockFile).mtimeMs; } catch { /* gone this moment */ }
    return { raw, lock: lock && typeof lock === "object" ? lock : null, age };
  } catch (e) { return e.code === "ENOENT" ? null : { raw: null, lock: null, age: 0 }; } // held open this moment (an antivirus scan): looked at again
}
// launchd: the copy is the Mac login agent's (1.17.0), which a start by hand stops with bootout rather than by its process id.
function lockRecord() { return { pid: process.pid, started: startedAt, host: os.hostname(), version: VERSION, program: programFile(), exe: process.execPath, kind: isSea ? "exe" : "script", home: cfgDir, ...(handedFrom ? { from: handedFrom } : {}), ...(underLaunchd ? { launchd: true } : {}) }; }
/** Makes the lock where there is none ("wx"): "taken", "exists", or why it could not be written. */
function writeLock() {
  try { fs.writeFileSync(lockFile, JSON.stringify(lockRecord(), null, 2) + "\n", { flag: "wx" }); lockHeld = true; return "taken"; }
  catch (e) { return e.code === "EEXIST" ? "exists" : e.message; }
}
/**
 * Lets the lock go: removed when it still names this process; another copy's is left as it is. Windows refuses the
 * removal while another program has the file open without sharing that (an antivirus or backup scan, a sync client), so
 * it is tried a few times; a copy this one starts is told whose lock it may take anyway (VRT_LOCK_GIVEN, 1.17.0).
 */
function releaseLock() {
  if (!lockHeld) return;
  statusEnds(); // the last word in status.json, written while this copy still holds the lock
  lockHeld = false;
  for (let i = 1; i <= 5; i++) {
    try { if (Number(JSON.parse(fs.readFileSync(lockFile, "utf8")).pid) === process.pid) fs.unlinkSync(lockFile); break; }
    catch (e) { if (e.code === "ENOENT" || !["EBUSY", "EPERM", "EACCES"].includes(e.code)) break; sleepSync(40 * i); }
  }
  unlist();
}
/** Removes a lock judged stale, unless another copy wrote it again meanwhile; true once it is gone. */
async function removeStale(seen) {
  for (let i = 0; i < 5; i++) {
    let now;
    try { now = fs.readFileSync(lockFile, "utf8"); } catch (e) { if (e.code === "ENOENT") return true; await sleep(200); continue; }
    if (now !== seen.raw) return false;
    try { fs.unlinkSync(lockFile); return true; } catch (e) { if (e.code === "ENOENT") return true; await sleep(200); }
  }
  return false;
}
/** Stops a running copy by its process id and waits up to ten seconds for it to be gone; false when it could not be stopped. */
async function stopProcess(pid) {
  try { process.kill(pid, "SIGTERM"); } catch (e) { return e.code === "ESRCH"; }
  for (let i = 0; i < 40; i++) { if (!pidAlive(pid)) return true; await sleep(250); }
  if (PLATFORM !== "win32") { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
  for (let i = 0; i < 8; i++) { if (!pidAlive(pid)) return true; await sleep(250); }
  return false;
}
/** Waits up to a minute for the copy this one replaces to leave; one still there then is stopped, when the lock says it is that copy. */
async function predecessorGone(pid) {
  for (let i = 0; i < 240; i++) { if (!pidAlive(pid)) return; await sleep(250); }
  const seen = readLock();
  if (Number(seen?.lock?.pid) === pid && judgeLock(seen.lock).held && (await stopProcess(pid))) say(`the copy this one replaces (process ${pid}) had not closed after a minute, so it has been stopped`);
}
/** A copy runs on this settings folder: stop it (new settings, a newer download), or say so and close. */
async function holderRuns(lock, pid) {
  const quiet = has("--quiet");
  const version = lock.version ? ` (version ${lock.version})` : "";
  // The Mac login agent's copy (1.17.0) is stopped through launchd (bootout), which would otherwise be free to start it
  // again; main then hands back to the agent, pointed at this program when it is the newer one.
  const agents = PLATFORM === "darwin" && !!lock.launchd;
  const stop = async (why, said) => {
    if (await (agents ? stopAgentCopy(pid) : stopProcess(pid))) { stoppedFor = why; say(said); return; }
    say(`The uploader that is running (process ${pid}) could not be stopped. ${PLATFORM === "win32" ? "End vrt-uploader in Task Manager" : agents ? `Stop it with launchctl bootout ${guiDomain()}/${AGENT_LABEL}` : `Stop it with kill ${pid}`}, then run this again.`);
    process.exit(1);
  };
  // New settings, --reset or --uninstall (decided 17 October 2026): the copy that runs keeps the settings it read at its
  // start and writes them back, so it is stopped first. Once they are saved, it starts again in the background (main).
  if (SETTINGS_FLAGS.some(has)) return stop("settings", `the uploader that was running${version} has been stopped, ${has("--uninstall") ? "so it can be removed" : has("--reset") ? "so its settings can be forgotten" : "so the new settings can be saved"}`);
  // A newer download run by hand (1.9.2): another program file, and not an older version than the one running. That copy
  // is stopped by the lock's process id; main then points the logon entry at this file, as before.
  // The agent's copy always runs its own program, never the file run by hand, so on a Mac it gives way to a newer version only.
  // Only a start that stays running takes over (1.17.0): --once, --check-update and --install-startup from another file
  // stopped the copy that runs and then ended (--once) or ran on in their window, so they get their own answers below.
  const staysRunning = !quiet && !["--once", "--check-update", "--install-startup"].some(has);
  if (staysRunning && (agents ? newerVersion(VERSION, lock.version) : !sameProgram(lock) && !newerVersion(lock.version, VERSION))) {
    return stop("newer", agents ? `the uploader that starts when you log in${version} has been stopped, so this newer version can take its place` : `the uploader at ${lock.kind === "exe" ? lock.exe : lock.program}${version} has been stopped. This copy runs from now on.`);
  }
  if (has("--install-startup") && installStartup()) { say(`The uploader is already running on ${THIS_PC}, and from now on it starts ${PLATFORM === "darwin" ? "whenever you log in" : "at every logon"} too.`); process.exit(0); }
  say(has("--once") ? `The uploader is already running on ${THIS_PC}, so --once has nothing to do: that copy sends each change as the game saves it.`
    : has("--check-update") ? `The uploader is already running on ${THIS_PC}, so --check-update has nothing to do: that copy looks for a newer version every hour.`
    : `The uploader is already running on ${THIS_PC}, so this copy closes. To change its settings, run it with --code, --file or --by.`);
  if (!quiet && process.stdin.isTTY && process.stdout.isTTY) await ask(`Press ${RETURN_KEY} to close this window. `);
  process.exit(EXIT_RUNNING);
}
/**
 * First thing at every start: take the lock, or find the copy that holds it and act on that. Returns when this start goes
 * on, and exits when it does not. A pass that ends by itself (--once, --reset, --uninstall) only looks and never holds
 * the lock, so a copy starting at logon meanwhile is never turned away by it.
 */
async function lockAtStart() {
  const keeps = !["--once", "--reset", "--uninstall"].some(has); // a copy that stays running holds the lock
  // Started by the copy it replaces (an update, or the start again under the proper name): that copy is on its way out.
  // Wait for it to be gone; then its lock is this one's to take.
  const from = Number(process.env.VRT_LOCK_FROM) || 0;
  delete process.env.VRT_LOCK_FROM; // never handed on to a copy this one starts
  if (from && from !== process.pid) { handedFrom = from; await predecessorGone(from); }
  // Started by a copy that let the lock go and stays in its window until Enter (new settings saved, yes to starting with
  // Windows): a lock that still names that copy, because Windows refused its removal for a moment, is this one's to take
  // at once, with no wait and no stop (1.17.0). Before, the background copy found the lock held, closed, and once the
  // window was closed no copy ran.
  const given = Number(process.env.VRT_LOCK_GIVEN) || 0;
  delete process.env.VRT_LOCK_GIVEN;
  let stopped = 0, settled = false;
  for (let i = 0; i < 20 && !settled; i++) {
    const seen = readLock();
    if (seen && !seen.lock && seen.age < 10000) { await sleep(500); continue; } // being written this moment
    if (seen) {
      const v = judgeLock(seen.lock ?? {}, from || given);
      if (v.held) { await holderRuns(seen.lock, v.pid); stopped = v.pid; continue; } // holderRuns exits, unless it stopped that copy
      if (!keeps) { settled = true; break; } // a stale lock is the next running copy's to replace
      if (!(await removeStale(seen))) continue; // written again meanwhile: looked at again
      if (!v.quietly && Number(seen.lock?.pid) !== stopped) say(`the lock in ${cfgDir} was left by a copy that is not running (${v.why}), so this copy took it over`);
    }
    if (!keeps) { settled = true; break; }
    const w = writeLock();
    if (w === "taken") settled = true;
    else if (w !== "exists") { say(`the lock in ${cfgDir} could not be written (${w}), so this copy runs without it`); settled = true; }
  }
  if (!settled) say(`the lock in ${cfgDir} kept changing, so this copy runs without it`);
  if (!has("--reset") && !has("--uninstall")) otherCopies();
}
// Copies on other settings folders never see this lock: each folder has its own. Two of them send the same files twice,
// so every copy that holds a lock leaves a note in one folder that all copies on this PC look in (the user's temporary
// folder), and a start that finds another folder's copy running says so in the log, and goes on.
const RUN_LIST = path.join(os.tmpdir(), "vrt-uploader-running");
const runNote = path.join(RUN_LIST, crypto.createHash("sha256").update(`${os.hostname()}|${cfgDir.toLowerCase()}`).digest("hex").slice(0, 16) + ".json");
function otherCopies() {
  let names = [];
  try { names = fs.readdirSync(RUN_LIST).filter((n) => n.endsWith(".json")); } catch { /* none yet */ }
  for (const n of names) {
    const f = path.join(RUN_LIST, n);
    if (f === runNote) continue;
    let note = null;
    try { note = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
    if (!note || typeof note !== "object" || String(note.home ?? "").toLowerCase() === cfgDir.toLowerCase()) continue;
    if (!judgeLock(note).held) { try { fs.unlinkSync(f); } catch { /* another start took it away */ } continue; }
    say(`another uploader is running on ${THIS_PC} with its settings in ${note.home} (process ${note.pid}). Two copies send the same loot twice, so stop the one you don't need.`);
  }
  if (lockHeld) { try { fs.mkdirSync(RUN_LIST, { recursive: true }); fs.writeFileSync(runNote, JSON.stringify(lockRecord())); } catch { /* a note, nothing more */ } }
}
function unlist() { try { if (Number(JSON.parse(fs.readFileSync(runNote, "utf8")).pid) === process.pid) fs.unlinkSync(runNote); } catch { /* not there */ } }
/**
 * After new settings were saved with the running copy stopped: the uploader starts again in the background, with them.
 * Started from a window, that window stays until Enter, as after yes to starting with Windows (with no one to answer,
 * stdin closed, it ends there).
 * On a Mac (1.17.0) the copy in the background is the login agent's: the agent is set up or pointed at this program
 * (installAgent), and launchd starts its copy. mode: "settings" (new settings saved), "newer" (this version takes the
 * agent over), "start" (yes to the question, or --install-startup). False only when a "start" set nothing up: this copy
 * holds the lock again and goes on in its window.
 */
async function backToBackground(inWindow, mode = "settings") {
  releaseLock(); // the copy started next takes it; this one only waits for Enter now
  if (PLATFORM === "darwin" && !underLaunchd && (mode !== "settings" || stoppedAgent || agentInstalled())) {
    if (installAgent()) {
      say(mode === "start" ? "running in the background from now on, and again whenever you log in to this Mac" : mode === "newer" ? `version ${VERSION} runs in the background from now on, and whenever you log in to this Mac` : "the uploader runs in the background again, with the new settings");
      if (inWindow) { console.log("You can close Terminal now."); await ask(`Press ${RETURN_KEY} to close it. `); }
      return true;
    }
    if (mode === "start") { if (writeLock() === "taken" && status) { delete status.ended; writeStatus(); } return false; }
  }
  const args = ["--quiet", ...(flag("--home") ? ["--home", cfgDir] : []), ...(flag("--hub") ? ["--hub", flag("--hub")] : []), ...["--no-addon", "--no-update"].filter(has)];
  // VRT_LOCK_GIVEN: the copy started here may take a lock that still names this one (releaseLock, lockAtStart, 1.17.0).
  const child = spawn(process.execPath, isSea ? args : [process.argv[1], ...args], { detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, VRT_UPLOADER_HIDDEN: "1", VRT_LOCK_GIVEN: String(process.pid) } });
  child.unref();
  say(`the uploader runs in the background again${mode === "newer" ? ", until you log out" : ", with the new settings"}${inWindow ? ". This window can be closed." : ""}`);
  if (inWindow) await ask(`Press ${RETURN_KEY} to close it. `);
  return true;
}

// ---------- what the running copy does, for --status (1.17.0) ----------
// The copy that holds the lock keeps status.json beside its settings: its version and start, a beat every 30 seconds,
// and for each loot file its last try and its last good upload, the in-game addon's reads it sent, the addon's inbox it
// wrote and its last update check. Each write goes to a file of its own first and is then renamed over status.json, so
// a reader never meets half of one; a rename Windows refuses for a moment (a reader has the file open) is tried again.
// What the copy before it recorded is kept, so a restart or an update loses nothing. The upload code is never in it.
// Only the lock's copy writes it: a pass that ends (--once) and --status never do.
const statusFile = path.join(cfgDir, "status.json");
let status = null; // this copy's record, once it holds the lock (main)
const BEAT = (Number(process.env.VRT_UPLOADER_EVERY) || 30) * 1000; // a test looks every second, and beats as often
/** Waits without giving the event loop back: for a write in an exit handler, which cannot wait any other way. */
function sleepSync(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* tried again at once */ } }
function statusStart() {
  const was = readStatus();
  const kept = was && !was.bad ? was : {};
  // beatEvery: how often this copy beats, so --status can tell a beat that is due from one that has stopped.
  status = { version: VERSION, pid: process.pid, started: startedAt, kind: isSea ? "exe" : "script", program: programFile(), home: cfgDir, updates: !has("--no-update"), addonReads: !has("--no-addon"), beat: null, beatEvery: BEAT, watching: null, files: kept.files ?? {}, reads: kept.reads ?? {}, inbox: kept.inbox ?? {}, update: kept.update ?? null };
  // A write that a copy never finished (it ended between the two steps) is swept.
  try { for (const n of fs.readdirSync(cfgDir)) if (/^status\.json\.\d+\.tmp$/.test(n)) { try { fs.unlinkSync(path.join(cfgDir, n)); } catch { /* still in use */ } } } catch { /* no folder */ }
  writeStatus();
  setInterval(writeStatus, BEAT).unref(); // the beat: never what keeps the process running
}
/** Once the settings are settled (main): only the loot files they name keep a record. */
function statusSettings(cfg) {
  if (!status) return;
  const keep = new Set((cfg.files ?? []).map((f) => path.resolve(f).toLowerCase()));
  for (const k of Object.keys(status.files)) if (!keep.has(k)) delete status.files[k];
  writeStatus();
}
function statusNote(section, key, rec) {
  if (!status) return;
  status[section] = status[section] ?? {};
  status[section][key] = { ...(status[section][key] ?? {}), ...rec };
  writeStatus();
}
function statusDrop(section, key) { if (!status?.[section]?.[key]) return; delete status[section][key]; writeStatus(); }
function statusSet(rec) { if (!status) return; Object.assign(status, rec); writeStatus(); }
function writeStatus() {
  if (!status || !lockHeld) return;
  status.beat = new Date().toISOString();
  const tmp = `${statusFile}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(status, null, 2) + "\n"); } catch { return; }
  for (let i = 1; i <= 8; i++) {
    try { fs.renameSync(tmp, statusFile); return; }
    catch (e) { if (!["EPERM", "EACCES", "EBUSY"].includes(e.code)) break; sleepSync(25 * i); }
  }
  try { fs.unlinkSync(tmp); } catch { /* gone */ }
}
/** The copy lets the lock go (its end, or a hand-over to the background copy): its last write says when. */
function statusEnds() { if (!status || !lockHeld) return; status.ended = new Date().toISOString(); writeStatus(); }
/** status.json as it stands: null when there is none, { bad: true } when it never read whole in half a second. */
function readStatus() {
  for (let i = 0; i < 5; i++) {
    try { const j = JSON.parse(fs.readFileSync(statusFile, "utf8")); return j && typeof j === "object" ? j : { bad: true }; }
    catch (e) { if (e.code === "ENOENT") return null; if (i < 4) sleepSync(100); }
  }
  return { bad: true };
}
// The log's cap (LOG_MAX, beside say): a log at it is renamed uploader.log.1, over the one before (a rename replaces the
// file it is renamed over, on Windows as on macOS and Linux). A rename that fails leaves both files as they are, and the
// next line tries again: no line is ever lost to a roll. uploader.log.1 is never deleted to make way: with the log held
// open (a viewer, a backup or antivirus scan) the older history would go and the log still not roll, and a second copy
// whose rename found the log rolled already would delete the uploader.log.1 the first had just made.
function rollLog() {
  let size = 0;
  try { size = fs.statSync(logFile).size; } catch { return; }
  if (size < LOG_MAX) return;
  try { fs.renameSync(logFile, logFile + ".1"); } catch { /* kept as it is */ }
}
// Times in --status, in this PC's own time and written the way the log writes them: the last upload and when the copy
// was last heard to the minute, every other one as a date, with how long ago where that tells more (the default taken
// on 17 October 2026: "Last upload" to the minute like "Last heard", everything else dates only).
const localMinute = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString("sv-SE").slice(0, 16) : "an unknown time"; };
const localDay = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString("sv-SE").slice(0, 10) : "an unknown day"; };
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** A span in words: "30 seconds", "2 minutes", "10 minutes", "3 hours", "2 days". */
function spanText(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 90) return plural(s, "second");
  const m = Math.round(s / 60);
  if (m < 90) return plural(m, "minute");
  const h = Math.round(m / 60);
  return h < 36 ? plural(h, "hour") : plural(Math.round(h / 24), "day");
}
const agoText = (iso) => `${spanText(Date.now() - Date.parse(iso))} ago`;
/**
 * --status (1.17.0): whether a copy runs on this settings folder (its lock, judged as a start judges it) and what it last
 * did (its status.json). It takes no lock, writes nothing, not even the settings folder, and never shows the upload
 * code. Exit code 0 when a copy runs, 3 when none does.
 */
function showStatus() {
  let seen = readLock();
  for (let i = 0; i < 5 && seen && !seen.lock && seen.age < 10000; i++) { sleepSync(200); seen = readLock(); } // held open or being written this moment
  const verdict = seen?.lock ? judgeLock(seen.lock) : null;
  const st = readStatus();
  const mine = st && !st.bad ? st : null;
  // The system could not be asked about the lock's process at all (no PowerShell or ps, a timeout): a process that is
  // there and whose own status.json beats on time runs (1.17.0); anything else cannot be told, and is said so, never "no".
  const asker = PLATFORM === "win32" ? "Windows" : "ps";
  const alive = !!verdict?.unknown && pidAlive(verdict.pid);
  const byBeat = alive && Number(mine?.pid) === verdict.pid && !!mine?.beat && Date.now() - Date.parse(mine.beat) < 2.5 * (Number(mine.beatEvery) || 30e3);
  const running = !!verdict?.held || byBeat;
  const cfg = loadCfg();
  const own = running && mine && Number(mine.pid) === verdict.pid; // status.json is the running copy's own
  const lines = [`Vortex Raid Tool uploader ${VERSION}. Settings and log in ${cfgDir}`];
  if (running) {
    lines.push(`Running: yes, process ${verdict.pid}, version ${seen.lock.version ?? "unknown"}, since ${localDay(seen.lock.started)}.${own && mine.beat ? ` Last heard ${localMinute(mine.beat)} (${agoText(mine.beat)}).` : ""}`);
    if (byBeat) lines.push(`${asker} could not be asked about process ${verdict.pid}, so this is from the beat it writes down.`);
    if (!own) lines.push("It has not written down what it does yet.");
    else if (!mine.watching) lines.push("It is still on its first pass.");
  } else if (alive) {
    lines.push(`Running: cannot tell. Process ${verdict.pid}, which the lock names, is there, but ${asker} could not be asked whether it is the uploader${mine?.beat && Number(mine.pid) === verdict.pid ? `, and it was last heard ${localMinute(mine.beat)} (${agoText(mine.beat)})` : ", and it has written down nothing"}.`);
  } else {
    const last = mine?.pid ? ` The last copy, process ${mine.pid} on version ${mine.version ?? "unknown"}, ${mine.ended ? `stopped ${localDay(mine.ended)} (${agoText(mine.ended)})` : mine.beat ? `was last heard ${localMinute(mine.beat)} (${agoText(mine.beat)})` : "never said what it did"}.` : "";
    lines.push(`Running: no.${last}`);
    if (verdict) lines.push(`Its lock was left behind (${verdict.why}). The next start replaces it.`);
  }
  if (st?.bad) lines.push("What the uploader last did could not be read: status.json is not whole. Ask again in a moment.");
  lines.push(cfg.server && cfg.token ? `Uploads go to ${cfg.guild ? cfg.guild + " at " : ""}${cfg.server}, filed under ${cfg.by ?? "uploader"}.` : "No guild is set up here yet. Run vrt-uploader once in a window to set it up.");
  const files = Array.isArray(cfg.files) ? cfg.files : [];
  if (files.length) lines.push("Loot files:");
  for (const f of files) {
    const rec = mine?.files?.[path.resolve(f).toLowerCase()];
    const folder = rec?.folder ?? flavourOf(f);
    lines.push(`  ${rec?.addon ?? labelOfFile(f)}, account ${rec?.account ?? accountOf(f)}${folder ? ", " + folder : ""}: ${f}`);
    if (!fs.existsSync(f)) lines.push("    The file is not there right now. It stays in the settings and is sent once it is there again.");
    // A second copy of one account's history for one game and addon (1.17.0): only the newest is sent, so this one
    // would show nothing at all — no upload and no failure. The running copy writes down which file it gave way to.
    if (rec?.leftOut) lines.push(`    Left out: it holds the same account's history as ${rec.leftOut}, which is the one sent.`);
    if (!rec?.attempt) { lines.push("    Not sent yet."); continue; }
    lines.push(rec.good ? `    Last upload: ${localMinute(rec.good.at)}, ${plural(rec.good.awards ?? 0, "award")}, ${rec.good.changed ? "new loot filed" : "no new loot"}.` : "    Last upload: none yet.");
    const a = rec.attempt;
    if (a.at === rec.good?.at) continue;
    const what = { failed: `failed (${a.said})`, refused: `refused (${a.said})`, ignored: `not filed (${a.said})`, unreadable: "no loot history in it" }[a.result] ?? a.result;
    const next = Date.parse(rec.retry?.next ?? "");
    const after = !running ? "" : a.result === "failed" ? (Number.isFinite(next) ? ` Next try ${next > Date.now() ? "in " + spanText(next - Date.now()) : "at the next look"}.` : "") : " Not sent again until the game saves it again.";
    lines.push(`    Last try: ${localDay(a.at)} (${agoText(a.at)}), ${what}.${after}`);
  }
  const reads = Object.values(mine?.reads ?? {}).filter((r) => r && r.at && r.who).sort((x, y) => String(y.at).localeCompare(String(x.at)));
  if (reads.length) {
    lines.push("Addon reads sent:");
    for (const r of reads.slice(0, 10)) lines.push(`  ${r.who}'s ${r.what}: ${r.result === "refused" ? `refused ${localDay(r.at)}${r.said ? " (" + r.said + ")" : ""}` : r.result === "failed" ? `did not go through ${localDay(r.at)}${r.said ? " (" + r.said + ")" : ""}` : `filed ${localDay(r.at)}`}`);
    if (reads.length > 10) lines.push(`  and ${reads.length - 10} more`);
  } else if (mine?.addonReads === false) lines.push("Addon reads: not sent (--no-addon).");
  for (const ib of Object.values(mine?.inbox ?? {})) {
    if (!ib || typeof ib !== "object") continue;
    const where = `${ib.addon ?? "the addon"}${ib.folder ? " in " + ib.folder : ""}`;
    lines.push(ib.error && ib.failedAt && !(ib.at > ib.failedAt) ? `Inbox for ${where}: not written ${localDay(ib.failedAt)} (${ib.error}).` : `Inbox for ${where}: written ${localDay(ib.at)}.`);
  }
  const u = mine?.update;
  if (mine?.updates === false) lines.push("Update check: off (--no-update).");
  else if (u?.at) lines.push(`Update check: ${localDay(u.at)}, ${u.result === "current" ? "this is the newest version" : u.result === "newer" ? `version ${u.version} was fetched and took over` : u.result === "hash" ? `version ${u.version} did not match its published hash, so it was not installed` : u.result === "download failed" ? `version ${u.version} could not be fetched (${u.said})` : `the site did not answer (${u.said ?? "no answer"})`}.`);
  lines.push(`Log: ${logFile}`);
  console.log(lines.join("\n"));
  process.exitCode = running ? 0 : 3;
}
process.on("exit", releaseLock);
// Ended from a terminal (Ctrl+C), by the system (a service manager's stop) or with its window closed: through the exit
// above, so the lock goes with the process.
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) process.on(signal, () => process.exit(code));

start().catch((e) => { say(`error: ${e.message}`); process.exit(1); });
