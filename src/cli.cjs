// ---------- Vortex Raid Tool uploader (CLI) ----------
// Assembled into vrt-uploader.cjs (and, on Windows, vrt-uploader.exe) after the
// loot-addon parser, the SavedVariables finder and the edition rule — by
// scripts/build.mjs of the public repository github.com/bloodl/vrt-uploader,
// where the source is published and the releases are signed. Runs on a raider's
// PC: finds the loot history in WoW's SavedVariables, uploads it to the guild's
// site, keeps watching. First run finds the guild or asks for its upload code;
// after that it just works.
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");
let isSea = false; // running as the single executable (vrt-uploader.exe) or as a script under node?
try { isSea = require("node:sea").isSea(); } catch { /* an older node: a script, then */ }

const VERSION = "1.6.1"; // 1.6.1: a guild member on nobody's roster entry has their resist gear filed too (the site says so; no 404 line) · 1.6.0: starts at logon from the user's own Run list (no VBScript, no script host), hides its own window through the OS, --uninstall, the exe carries its own name and version · 1.5.4: a recipes package says which character sent it (addon 0.6.0 answers for every character of the account) · 1.1: Gargul, CEPGP, MonolithDKP and CommunityDKP files · 1.2: the in-game addon's gear and recipes · 1.3: the guild bank · 1.3.1: the addon file found beside a typed loot file · 1.4: any raider's PC · 1.5: no code — a guild-named download, or the hub finds the guild · 1.5.1: a refused report is not asked again until the addon has a new one
const HUB = "https://vortexraidtool.com"; // where the guilds live; --hub for a hub of your own
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
  --by <name>           who the upload is logged as (default: your Windows user name)
  --once                upload once and exit (no watching)
  --no-addon            skip the in-game addon's resistance gear, recipes and guild bank
  --install-startup     start at every Windows logon, without a window (a value in your own user's Run list)
  --remove-startup      take that logon entry out again
  --uninstall           remove the logon entry and the settings folder, and say which folder is left to delete
  --reset               forget the saved settings
  --home <dir>          keep settings and log in this folder instead of the user profile
  --quiet               no questions and no window — the log is the only voice (what the logon entry passes)
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
  if (flag("--code")) { const d = decodeCode(flag("--code")); if (!d) { say("That upload code doesn't look right."); process.exit(1); } Object.assign(cfg, d); }
  if (flags("--file").length) cfg.files = flags("--file");
  if (cfg.file && !cfg.files) { cfg.files = [cfg.file]; delete cfg.file; } // settings from an older version
  if (flag("--realm")) cfg.realm = flag("--realm");
  if (flag("--by")) cfg.by = flag("--by");
  if (flag("--system")) cfg.system = flag("--system").toLowerCase();
  const quiet = has("--quiet");
  const systemOf = (file) => systemOfFile(file) ?? cfg.system ?? "rclc";
  // Versions before 1.6.0 started at logon from a VBScript in the Startup folder — the pattern antivirus heuristics
  // flag. One that is still there is moved to the Run list, once, and the move is written to the log.
  if (process.platform === "win32" && fs.existsSync(legacyStartup())) installStartup("moved");

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
    } else if (found.length === 1 || quiet) {
      cfg.files = [found[0]];
      console.log(`\n${labelOfFile(cfg.files[0])} history: ${cfg.files[0]}`);
    } else {
      console.log("\nSeveral loot addon files found (newest first — the loot master's account is usually first). Pick every addon whose history you want on the site:");
      found.forEach((f, i) => console.log(`  ${i + 1}. ${f}   (${labelOfFile(f)}, account ${accountOf(f)})`));
      const pick = (await ask("Which ones? A number, several like 1,3, or 'all' [1]: ")).toLowerCase();
      cfg.files = pick === "all" ? found : [...new Set(pick.split(/[\s,]+/).map((n) => found[Number(n) - 1]).filter(Boolean))];
      if (!cfg.files.length) cfg.files = [found[0]];
    }
  }
  if (!cfg.by) cfg.by = process.env.USERNAME || process.env.USER || "uploader";
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

  const uploadOne = async (file) => {
    const system = systemOf(file);
    const rows = rowsFromAddon(fs.readFileSync(file, "utf8"), system, cfg.realm ?? "");
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
    say(`${t.routed ? "→ " + t.guild + ": " : ""}uploaded ${j.count} ${addonLabel(system)} award(s)${cfg.files.length > 1 ? ` from account ${accountOf(file)}` : ""}${j.changed === false ? " (no change since last time)" : " — the standings are rebuilding"}${rows.undated ? ` — ${rows.undated} older CEPGP loot line(s) carry no date and were left out` : ""}`);
  };
  const upload = async (files = cfg.files) => { for (const f of files) await uploadOne(f); };

  // The in-game addon writes what the game knows — resistance gear read off the items, recipes read off a trade
  // skill window that was open — into its own SavedVariables, and cannot send any of it itself. So this carries
  // it, for whichever characters play on this PC. Nothing is sent twice: the addon stamps each scan.
  const list = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
  // What the bot said no to, by the stamp it said no to: asked once more only when the addon has a newer
  // scan (a new stamp) or this uploader starts again. Kept in memory on purpose — a raider joining the roster
  // is filed at the next start, and nothing is asked about every thirty seconds in the meantime.
  const refused = new Map();
  const sendAddonData = async () => {
    // The usual folders and the registry find it; a WoW installed somewhere else is found beside the loot
    // file the loot master typed in on the first run — same account, same SavedVariables folder.
    const beside = (cfg.files ?? []).map((f) => path.join(path.dirname(f), "VortexRaidTool.lua")).filter((f) => { try { return fs.existsSync(f); } catch { return false; } });
    const files = [...new Map([...findAddonSavedVariables(), ...beside].map((f) => [path.resolve(f).toLowerCase(), f])).values()];
    if (!files.length) return;
    cfg.sent = cfg.sent ?? {};
    let posted = 0;
    for (const file of files) {
      let db = null;
      try { db = parseGlobal(fs.readFileSync(file, "utf8"), "VortexRaidToolDB"); } catch { continue; }
      for (const [character, mine] of Object.entries(db?.collect ?? {})) {
        if (!mine || typeof mine !== "object" || character === "version") continue;
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
        if (mine.recipes && Object.keys(mine.recipes).length) await post("/api/recipes/report", { professions: mine.recipes, via: mine.via ?? null }, mine.recipesAt, "recipes");
      }
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
  try { await upload(); } catch (e) { say(`upload failed: ${e.message}`); if (has("--once")) return finish(1); }
  // The addon's own reading is a bonus, never a reason to fail a loot upload.
  if (!has("--no-addon")) try { await sendAddonData(); } catch (e) { say(`the addon's data could not be sent: ${e.message}`); }
  if (has("--once")) return finish(0);

  if (process.platform === "win32" && !quiet && !has("--install-startup") && !has("--no-ask") && !cfg.askedStartup) {
    cfg.askedStartup = true; saveCfg(cfg);
    const a = (await ask("\nStart the uploader with Windows, so it runs after every raid by itself? [Y/n] ")).toLowerCase();
    if (!a || a.startsWith("y")) installStartup();
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
function installStartup(why) {
  if (process.platform !== "win32") { say("startup install is for Windows; on other systems run it from your own autostart"); return; }
  const parts = [process.execPath, ...(isSea ? [] : [path.resolve(process.argv[1])])].map((p) => `"${p}"`);
  if (flag("--home")) parts.push("--home", `"${path.resolve(flag("--home"))}"`);
  parts.push("--quiet");
  if (!reg("add", RUN_KEY, "/v", RUN_NAME, "/t", "REG_SZ", "/d", parts.join(" "), "/f")) { say("could not write the logon entry (reg.exe said no)"); return; }
  let hadScript = false;
  try { fs.unlinkSync(legacyStartup()); hadScript = true; } catch {}
  say(why === "moved" && hadScript
    ? `the logon entry moved from a script in the Startup folder to your user's Run list (${RUN_KEY}\\${RUN_NAME}) — same behaviour, nothing for an antivirus to quarantine`
    : `will start at every logon, without a window — the value ${RUN_NAME} in your user's Run list (${RUN_KEY}); --remove-startup takes it out`);
}
function removeStartup() {
  if (process.platform !== "win32") { say("nothing to remove: the logon entry is a Windows thing"); return; }
  const had = reg("delete", RUN_KEY, "/v", RUN_NAME, "/f");
  let script = false;
  try { fs.unlinkSync(legacyStartup()); script = true; } catch {}
  say(had || script ? "logon entry removed" : "no logon entry found");
}

main().catch((e) => { say(`error: ${e.message}`); process.exit(1); });
