import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { systemOfFile, addonLabel } from "./rclc-lua.js";

/** Where Battle.net says WoW is installed (Windows registry), whatever drive or folder name. */
function registryInstallRoots() {
  if (process.platform !== "win32") return [];
  const roots = [];
  for (const key of ["HKLM\\SOFTWARE\\WOW6432Node\\Blizzard Entertainment\\World of Warcraft", "HKLM\\SOFTWARE\\Blizzard Entertainment\\World of Warcraft", "HKCU\\SOFTWARE\\Blizzard Entertainment\\World of Warcraft"]) {
    try {
      const out = execFileSync("reg", ["query", key, "/v", "InstallPath"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
      const m = out.match(/InstallPath\s+REG_SZ\s+(.+)/);
      if (m) { const p = m[1].trim().replace(/[\\/]+$/, ""); roots.push(/_(retail|classic|classic_era|classic_ptr|ptr|beta)_?$/i.test(path.basename(p)) ? path.dirname(p) : p); }
    } catch { /* key not there */ }
  }
  return roots;
}

/** The account folder name from a SavedVariables path (…\Account\<name>\SavedVariables\…), for keeping several accounts apart. */
export function accountOf(file) {
  const m = String(file).replace(/\\/g, "/").match(/\/Account\/([^/]+)\/SavedVariables\//i);
  return m ? m[1] : "default";
}

/** "Gargul" / "RCLootCouncil" … for a SavedVariables path (see LOOT_ADDONS in rclc-lua.js). */
export const labelOfFile = (file) => addonLabel(systemOfFile(file));

/** Every SavedVariables file on this PC whose name `keep(name)` accepts, newest first. */
function savedVariablesFiles(keep) {
  const roots = process.env.VRT_WOW_ROOT ? [process.env.VRT_WOW_ROOT] : [...new Set([
    ...registryInstallRoots(),
    ...(process.platform === "win32"
      ? ["C:\\Program Files (x86)\\World of Warcraft", "C:\\Program Files\\World of Warcraft", "D:\\World of Warcraft", "D:\\Games\\World of Warcraft", "C:\\Games\\World of Warcraft", "E:\\World of Warcraft", "E:\\Games\\World of Warcraft", "D:\\Battle.net\\World of Warcraft", "C:\\Battle.net\\World of Warcraft"]
      : [path.join(os.homedir(), "Applications", "World of Warcraft"), "/Applications/World of Warcraft", path.join(os.homedir(), "Games", "world-of-warcraft"), path.join(os.homedir(), "Games", "battlenet", "drive_c", "Program Files (x86)", "World of Warcraft")]),
  ])];
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
export const findAddonSavedVariables = () => savedVariablesFiles((f) => /^VortexRaidTool\.lua$/i.test(f));
