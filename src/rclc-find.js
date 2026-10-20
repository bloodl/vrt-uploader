import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// spawnSync, not execFileSync: the uploader's bundle drops this file's imports and has spawnSync from uploader/cli.cjs
// (its require of node:child_process). Until 1.17.0 this read execFileSync, which the bundle never had, so there the
// registry was never asked: the call threw, and the catch around it took that for "key not there".
import { spawnSync } from "node:child_process";
import { systemOfFile, addonLabel } from "./rclc-lua.js";

/** The game's own folder for an install path Battle.net wrote (…\World of Warcraft\_retail_ is …\World of Warcraft). */
export const installRootOf = (p) => { const t = String(p).trim().replace(/[\\/]+$/, ""); return /_(retail|classic|classic_era|classic_ptr|ptr|beta)_?$/i.test(path.basename(t)) ? path.dirname(t) : t; };
/**
 * Runs one of the system's tools (reg, mount); a test's stand-in for one, a script, runs under Node. Which Node: under
 * the single executable (vrt-uploader.exe, where this file is bundled in) process.execPath is the uploader itself, so
 * running a stand-in with it would start a second uploader on the default settings folder instead — "node" from the
 * PATH is Node there, as uploader/cli.cjs's runTool has it. The site loads this file as a module, where require is not
 * there at all and process.execPath is Node; no site is ever a single executable.
 */
function findTool(cmd, args, opts) {
  if (!/\.[cm]?js$/i.test(cmd)) return spawnSync(cmd, args, opts);
  let node = process.execPath;
  try { if (require("node:sea").isSea()) node = "node"; } catch { /* a module, or a node without node:sea: execPath is Node */ }
  return spawnSync(node, [cmd, ...args], opts);
}
const registryRoots = new Map(); // asked once a process: three runs of reg.exe, and the answer does not change while it runs
/**
 * Where Battle.net says WoW is installed (Windows registry), whatever drive or folder name. A test names a stand-in for
 * reg.exe (VRT_REG, as uploader/cli.cjs takes it), so no test reads this PC's registry (1.17.0).
 */
export function registryInstallRoots(platform = process.platform, env = process.env) {
  if (platform !== "win32") return [];
  const reg = env.VRT_REG || "reg";
  if (registryRoots.has(reg)) return registryRoots.get(reg);
  const roots = [];
  for (const key of ["HKLM\\SOFTWARE\\WOW6432Node\\Blizzard Entertainment\\World of Warcraft", "HKLM\\SOFTWARE\\Blizzard Entertainment\\World of Warcraft", "HKCU\\SOFTWARE\\Blizzard Entertainment\\World of Warcraft"]) {
    const r = findTool(reg, ["query", key, "/v", "InstallPath"], { encoding: "utf8", windowsHide: true, timeout: 10000, stdio: ["ignore", "pipe", "ignore"] });
    const m = r.status === 0 ? String(r.stdout ?? "").match(/InstallPath\s+REG_SZ\s+(.+)/) : null; // key not there: exit 1
    if (m) roots.push(installRootOf(m[1]));
  }
  registryRoots.set(reg, roots);
  return roots;
}

/**
 * A Mac's volumes that are not the Mac's own disks (1.17.0): a network share (SMB, NFS, AFP, WebDAV) under /Volumes, which
 * mount lists without "local". Looking in one whose server has gone away (a laptop off its home network) can hold the
 * program for as long as the system waits for that server, so it is never looked in; the game does not run from a share.
 * mount reads the system's own table and touches no volume. A test names a stand-in for it (VRT_MOUNT).
 */
function networkVolumes(volumes, env) {
  const r = findTool(env.VRT_MOUNT || "/sbin/mount", [], { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] });
  const out = new Set();
  if (r.status !== 0) return out;
  const at = path.resolve(volumes) + "/";
  for (const line of String(r.stdout ?? "").split("\n")) {
    const m = / on (.+) \(([^()]*)\)\s*$/.exec(line);
    if (!m || !m[1].startsWith(at) || m[2].split(",").map((x) => x.trim()).includes("local")) continue;
    out.add(m[1].slice(at.length).split("/")[0]);
  }
  return out;
}

/**
 * The folders a World of Warcraft install is looked for in on a system (1.17.0: a function of the system, the home folder
 * and the environment, so a test asks for a Mac's on any PC). VRT_WOW_ROOT, when set, is the only one. On a Mac the game
 * can sit on another drive too: each volume's /Volumes/<name>/World of Warcraft and /Volumes/<name>/Applications/World of
 * Warcraft that is there (VRT_VOLUMES names another folder of volumes, for a test). A folder reached two ways is looked in
 * once, under the first of its names: the Mac's start-up disk is also /Volumes/Macintosh HD, a link to /. Two kinds of
 * volume are left out (1.17.0): a network share (networkVolumes), and a copy of a Mac's start-up disk (a bootable clone
 * from Carbon Copy Cloner or SuperDuper, which has the system's own SystemVersion.plist), whose older loot files would be
 * sent after the live ones and stand in for them on the site. The registry's install path (Windows) comes on top of
 * these, in searchRoots.
 */
export function wowRoots(platform = process.platform, home = os.homedir(), env = process.env) {
  if (env.VRT_WOW_ROOT) return [env.VRT_WOW_ROOT];
  const roots = platform === "win32"
    ? ["C:\\Program Files (x86)\\World of Warcraft", "C:\\Program Files\\World of Warcraft", "D:\\World of Warcraft", "D:\\Games\\World of Warcraft", "C:\\Games\\World of Warcraft", "E:\\World of Warcraft", "E:\\Games\\World of Warcraft", "D:\\Battle.net\\World of Warcraft", "C:\\Battle.net\\World of Warcraft"]
    : [path.join(home, "Applications", "World of Warcraft"), "/Applications/World of Warcraft", path.join(home, "Games", "world-of-warcraft"), path.join(home, "Games", "battlenet", "drive_c", "Program Files (x86)", "World of Warcraft")];
  if (platform === "darwin") {
    const volumes = env.VRT_VOLUMES || "/Volumes";
    let names = [];
    try { names = fs.readdirSync(volumes).filter((n) => !n.startsWith(".")).sort(); } catch { /* no volumes folder */ }
    const shares = names.length ? networkVolumes(volumes, env) : new Set();
    for (const n of names) {
      if (shares.has(n)) continue;
      // A start-up disk: a clone, or the Mac's own under its second name (whose folders are among the roots above already).
      if (fs.existsSync(path.join(volumes, n, "System", "Library", "CoreServices", "SystemVersion.plist"))) continue;
      for (const p of [path.join(volumes, n, "World of Warcraft"), path.join(volumes, n, "Applications", "World of Warcraft")]) {
        try { if (fs.statSync(p).isDirectory()) roots.push(p); } catch { /* not on this volume */ }
      }
    }
  }
  const seen = new Set();
  return roots.filter((r) => {
    let key; try { key = fs.realpathSync(r); } catch { key = path.resolve(r); }
    if (platform === "win32") key = key.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The account folder name from a SavedVariables path (…\Account\<name>\SavedVariables\…), for keeping several accounts
 * apart — and a character's own file (…\Account\<name>\<realm>\<character>\SavedVariables\, where LootReserve keeps its
 * rolls, 1.16.0) is "<account>-<character>", each character's kept apart too.
 */
export function accountOf(file) {
  const f = String(file).replace(/\\/g, "/");
  const own = f.match(/\/Account\/([^/]+)\/[^/]+\/([^/]+)\/SavedVariables\//i);
  if (own) return `${own[1]}-${own[2]}`;
  const m = f.match(/\/Account\/([^/]+)\/SavedVariables\//i);
  return m ? m[1] : "default";
}
/** The loot files kept with the character rather than the account: LootReserve's (1.16.0). */
const PER_CHARACTER = /^LootReserve\.lua$/i;

/** "Gargul" / "RCLootCouncil" … for a SavedVariables path (see LOOT_ADDONS in rclc-lua.js). */
export const labelOfFile = (file) => addonLabel(systemOfFile(file));

/** Every folder looked in on a system: the registry's install paths (Windows), then wowRoots; VRT_WOW_ROOT alone when set. */
export function searchRoots(platform = process.platform, home = os.homedir(), env = process.env) {
  if (env.VRT_WOW_ROOT) return [env.VRT_WOW_ROOT];
  return [...new Set([...registryInstallRoots(platform, env), ...wowRoots(platform, home, env)])];
}
// The uploader looks for files three or four times a look, every 30 seconds, and on a Mac that listed /Volumes and
// looked at every drive each time. The folders are worked out again after ten minutes (1.17.0), so a drive mounted
// meanwhile is looked in within ten minutes; the files in them are looked for at every call.
const ROOTS_FOR = 10 * 60e3;
let rootsSeen = null; // { key, at, roots }
/** Forgets the folders worked out (a test's step). */
export const forgetRoots = () => { rootsSeen = null; };

/** Every SavedVariables file on this PC whose name `keep(name)` accepts, newest first. */
function savedVariablesFiles(keep) {
  // The system whose folders are looked in: this one, or the one a test of the uploader names (VRT_UPLOADER_PLATFORM,
  // as uploader/cli.cjs reads it), so a Mac's are tried on any PC.
  const platform = process.env.VRT_UPLOADER_PLATFORM || process.platform;
  const key = JSON.stringify([platform, os.homedir(), process.env.VRT_WOW_ROOT ?? null, process.env.VRT_VOLUMES ?? null, process.env.VRT_REG ?? null, process.env.VRT_MOUNT ?? null]);
  if (!rootsSeen || rootsSeen.key !== key || Date.now() - rootsSeen.at > ROOTS_FOR) rootsSeen = { key, at: Date.now(), roots: searchRoots(platform, os.homedir(), process.env) };
  const roots = rootsSeen.roots;
  const found = [];
  for (const r of roots) {
    try {
      for (const flavour of fs.readdirSync(r).filter((d) => d.startsWith("_"))) {
        const acc = path.join(r, flavour, "WTF", "Account");
        if (!fs.existsSync(acc)) continue;
        for (const a of fs.readdirSync(acc)) {
          const sv = path.join(acc, a, "SavedVariables");
          if (!fs.existsSync(sv)) continue;
          for (const f of fs.readdirSync(sv)) if (keep(f)) found.push(path.join(sv, f));
          // …and each character's own (Account\<a>\<realm>\<character>\SavedVariables), for the files kept there.
          for (const realm of fs.readdirSync(path.join(acc, a))) {
            if (realm === "SavedVariables") continue;
            let chars = [];
            try { chars = fs.readdirSync(path.join(acc, a, realm)); } catch { continue; }
            for (const c of chars) {
              const csv = path.join(acc, a, realm, c, "SavedVariables");
              try { for (const f of fs.readdirSync(csv)) if (PER_CHARACTER.test(f) && keep(f)) found.push(path.join(csv, f)); } catch { /* no saved variables for this one */ }
            }
          }
        }
      }
    } catch { /* drive or folder not there */ }
  }
  return [...new Set(found)].sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

/** Loot-addon SavedVariables files (RCLootCouncil, Gargul, CEPGP, MonolithDKP, CommunityDKP; every WoW flavour, every account), newest first. */
export const findSavedVariables = () => savedVariablesFiles((f) => !!systemOfFile(f));

/**
 * The in-game addon's own SavedVariables, newest first. It writes what the game already knows — resistance gear
 * read off the items, and the recipes on a trade skill window that happened to be open — and cannot send any of
 * it anywhere itself, so this is how it leaves the PC (docs/addon.md, step 4).
 */
// Two addons, one shape: the Anniversary addon's file and the Forever addon's (VortexRaidToolForever.lua, the
// same VortexRaidToolDB inside) — each in its own client's folder.
export const ADDON_SV_NAMES = ["VortexRaidTool.lua", "VortexRaidToolForever.lua"];
export const findAddonSavedVariables = () => savedVariablesFiles((f) => /^VortexRaidTool(Forever)?\.lua$/i.test(f));
