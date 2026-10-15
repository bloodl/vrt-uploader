import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "./util.js";

/**
 * Reads RCLootCouncil history straight out of the WoW SavedVariables .lua —
 * no in-game /rc export needed. Configured in config/guild.json:
 *   "rclcSavedVariables": ["D:\\...\\WTF\\Account\\<acct>\\SavedVariables\\RCLootCouncil_Classic.lua"],
 *   "rclcRealmFilter": "Thunderstrike"
 * Writes data/rclc/000-savedvariables-auto.json (regenerated fully each run).
 * The "000-" prefix sorts it first so a manual in-game export of the same
 * award (richer subType/equipLoc fields) wins the dedupe-by-id.
 * NOTE: WoW only writes SavedVariables on logout or /reload — history from a
 * session that's still logged in appears on the next run after logout.
 */

// A realm as letters and digits only, for the realm filter: "Alliance - Classic Beta PvE" holds "classic-beta-pve" (a
// guild's realm slug) and "Classic Beta PvE" (its name), and "Azjol-Nerub" holds "azjolnerub" — realm names have spaces
// and hyphens (docs/ROADMAP.md N3, for Forever's realms). A realm that matched before still does.
const flatRealm = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// Minimal Lua SavedVariables parser: tables, strings, numbers, booleans, nil — and "--" comments,
// which WoW writes after array entries ("}, -- [1]") in many SavedVariables files.
function skipBlank(text, pos, extra = "") {
  for (;;) {
    while (pos < text.length && (/\s/.test(text[pos]) || (extra && extra.includes(text[pos])))) pos++;
    if (text[pos] === "-" && text[pos + 1] === "-") { while (pos < text.length && text[pos] !== "\n") pos++; continue; }
    return pos;
  }
}
function parseLuaValue(text, pos) {
  pos = skipBlank(text, pos);
  const ch = text[pos];
  if (ch === "{") {
    pos++;
    const obj = {};
    const arr = [];
    let onlyPositional = true;
    for (;;) {
      pos = skipBlank(text, pos, ",");
      if (text[pos] === "}") { pos++; break; }
      if (text[pos] === "[") {
        onlyPositional = false;
        pos++;
        const keyRes = parseLuaValue(text, pos);
        pos = keyRes.pos;
        while (pos < text.length && /[\s\]=]/.test(text[pos])) pos++;
        const valRes = parseLuaValue(text, pos);
        pos = valRes.pos;
        obj[keyRes.value] = valRes.value;
      } else {
        const valRes = parseLuaValue(text, pos);
        pos = valRes.pos;
        arr.push(valRes.value);
      }
    }
    if (onlyPositional) return { value: arr, pos };
    if (arr.length) arr.forEach((v, i) => { obj[i + 1] = v; });
    return { value: obj, pos };
  }
  if (ch === '"') {
    pos++;
    let out = "";
    while (pos < text.length && text[pos] !== '"') {
      if (text[pos] === "\\") {
        const n = text[pos + 1];
        if (n === "n") { out += "\n"; pos += 2; }
        else if (n === "r") { out += "\r"; pos += 2; }
        else if (n === "t") { out += "\t"; pos += 2; }
        else if (/\d/.test(n)) {
          const m = text.slice(pos + 1, pos + 4).match(/^\d{1,3}/)[0];
          out += String.fromCharCode(parseInt(m, 10));
          pos += 1 + m.length;
        } else { out += n; pos += 2; }
      } else { out += text[pos++]; }
    }
    return { value: out, pos: pos + 1 };
  }
  const word = text.slice(pos).match(/^(true|false|nil|-?\d+(\.\d+)?(e-?\d+)?)/i);
  if (word) {
    const w = word[0];
    pos += w.length;
    if (/^true$/i.test(w)) return { value: true, pos };
    if (/^false$/i.test(w)) return { value: false, pos };
    if (/^nil$/i.test(w)) return { value: null, pos };
    return { value: parseFloat(w), pos };
  }
  throw new Error(`Lua parse error at offset ${pos}: "${text.slice(pos, pos + 30)}"`);
}

/** One top-level SavedVariables global ("NAME = {" at the start of a line), parsed. */
function extractGlobal(luaText, name) {
  const m = new RegExp(`(^|\\n)${name} = \\{`).exec(luaText);
  if (!m) return null;
  const start = luaText.indexOf("{", m.index);
  return parseLuaValue(luaText, start).value;
}
const extractLootDb = (luaText) => extractGlobal(luaText, "RCLootCouncilLootDB");
export const parseGlobal = extractGlobal; // for scripts that need the raw table (debugging a file, one-off checks)

// Numeric itemClass/itemSubClass -> the display subType names the classifier uses.
// The same names the in-game /rc export writes, so both sources classify alike (tier tokens are 15/0 "Junk"
// in TBC and are caught by name; recipes by profession; "Elemental", "Bag", "Food & Drink" price as minor).
const SUBTYPES = {
  0: { 0: "Consumable", 1: "Potion", 2: "Elixir", 3: "Flask", 4: "Scroll", 5: "Food & Drink", 6: "Item Enhancement", 7: "Bandage", 8: "Other" },
  1: { 0: "Bag", 1: "Soul Bag", 2: "Herb Bag", 3: "Enchanting Bag", 4: "Engineering Bag", 5: "Gem Bag", 6: "Mining Bag" },
  2: {
    0: "One-Handed Axes", 1: "Two-Handed Axes", 2: "Bows", 3: "Guns",
    4: "One-Handed Maces", 5: "Two-Handed Maces", 6: "Polearms",
    7: "One-Handed Swords", 8: "Two-Handed Swords", 10: "Staves",
    13: "Fist Weapons", 14: "Miscellaneous", 15: "Daggers", 16: "Thrown", 18: "Crossbows",
    19: "Wands", 20: "Fishing Poles",
  },
  3: { 0: "Red", 1: "Blue", 2: "Yellow", 3: "Purple", 4: "Green", 5: "Orange", 6: "Meta", 7: "Simple", 8: "Prismatic" },
  4: { 0: "Miscellaneous", 1: "Cloth", 2: "Leather", 3: "Mail", 4: "Plate", 6: "Shields", 7: "Librams", 8: "Idols", 9: "Totems" },
  6: { 2: "Arrow", 3: "Bullet" },
  7: { 0: "Trade Goods", 1: "Parts", 2: "Explosives", 3: "Devices", 4: "Jewelcrafting", 5: "Cloth", 6: "Leather", 7: "Metal & Stone", 8: "Meat", 9: "Herb", 10: "Elemental", 11: "Other", 12: "Enchanting", 13: "Materials" },
  9: { 0: "Book", 1: "Leatherworking", 2: "Tailoring", 3: "Engineering", 4: "Blacksmithing", 5: "Cooking", 6: "Alchemy", 7: "First Aid", 8: "Enchanting", 9: "Fishing", 10: "Jewelcrafting" },
  11: { 2: "Quiver", 3: "Ammo Pouch" },
  12: { 0: "Quest" },
  15: { 0: "Junk", 1: "Reagent", 2: "Pet", 3: "Holiday", 4: "Other", 5: "Mount" },
};

/** Award rows out of one SavedVariables file's text (optionally one realm only) — the shape loadAwards() reads. */
export function rowsFromSavedVariables(luaText, realmFilter = "") {
  const db = extractLootDb(luaText);
  if (!db) throw new Error("no RCLootCouncilLootDB table in this file");
  const rf = flatRealm(realmFilter);
  const rows = [];
  for (const [realmKey, playersTbl] of Object.entries(db?.factionrealm ?? {})) {
    if (rf && !flatRealm(realmKey).includes(rf)) continue;
    for (const [playerKey, entries] of Object.entries(playersTbl ?? {})) {
      const list = Array.isArray(entries) ? entries : Object.values(entries);
      for (const e of list) {
        if (!e || typeof e !== "object" || !e.lootWon || !e.date) continue;
        rows.push({
          player: playerKey,
          date: String(e.date),
          time: String(e.time ?? "00:00:00"),
          id: String(e.id ?? ""),
          item: String(e.lootWon),
          itemstring: String(e.lootWon),
          response: typeof e.response === "string" ? e.response : "",
          responseid: e.responseID ?? null,
          votes: e.votes ?? 0,
          boss: String(e.boss ?? ""),
          instance: String(e.instance ?? ""),
          subtype: SUBTYPES[e.iClass]?.[e.iSubClass] ?? "",
          equiploc: "",
          note: "",
          // RCLootCouncil's own entry and the faction-realm it sits under (uploader 1.15.0): the site hands them back,
          // exactly as they were, to the PCs whose history lacks this award (src/rclc-sync.js).
          raw: e,
          realmKey,
        });
      }
    }
  }
  return rows;
}

// ---------- other loot addons whose history sits in SavedVariables ----------
// The uploader reads these straight off the loot master's disk, the same way it reads RCLootCouncil,
// and turns them into the RCLootCouncil-shaped rows the loader knows (src/rclc.js normalizeRow).

/** What the uploader can read: SavedVariables file name → system id, label, the global that holds the history. */
export const LOOT_ADDONS = {
  rclc: { label: "RCLootCouncil", file: /^RCLootCouncil.*\.lua$/i, global: "RCLootCouncilLootDB" },
  gargul: { label: "Gargul", file: /^Gargul\.lua$/i, global: "GargulDB" },
  // Current CEPGP (1.14.1 for TBC, the Anniversary builds) saves one global, CEPGP, its loot log at CEPGP.Traffic; older
  // ones kept a global TRAFFIC, which the current ones take in once.
  cepgp: { label: "CEPGP", file: /^CEPGP\.lua$/i, global: "CEPGP" },
  monolithdkp: { label: "MonolithDKP", file: /^MonolithDKP\.lua$/i, global: "MonDKP_Loot" },
  communitydkp: { label: "CommunityDKP", file: /^CommunityDKP\.lua$/i, global: "CommDKP_Loot" },
  // 1.16.0: its won rolls — kept with the character (rclc-find.js looks there), or the account when its global profile is on.
  lootreserve: { label: "LootReserve", file: /^LootReserve\.lua$/i, global: "LootReserveCharacterSave" },
};
/** System id from a SavedVariables path, or null when it is not a loot addon we read. */
export function systemOfFile(file) {
  const base = String(file ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  for (const [id, a] of Object.entries(LOOT_ADDONS)) if (a.file.test(base)) return id;
  return null;
}
export const addonLabel = (system) => LOOT_ADDONS[system]?.label ?? "loot addon";

const p2 = (n) => String(n).padStart(2, "0");
/** A unix timestamp → the "YYYY/MM/DD" + "HH:MM:SS" pair the loader reads, in the PC's own clock. */
const stampOf = (unix) => { const d = new Date(Number(unix) * 1000); return { date: `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}`, time: `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` }; };
const listOf = (x) => (Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x) : []);
const linkFor = (link, id) => { const s = String(link ?? "").trim(); if (/\|Hitem:\d+/.test(s) || /^item:\d+/.test(s)) return s; return id ? `|Hitem:${id}::::::::70:::::|h[item ${id}]|h|r` : s; };
const rowOf = (o) => ({ player: "", date: "", time: "00:00:00", id: "", item: "", itemstring: "", response: "", responseid: null, votes: 0, boss: "", instance: "", subtype: "", equiploc: "", note: "", ...o });

/** Gargul: GargulDB.AwardHistory[checksum] = { awardedTo, timestamp, itemLink, itemID, OS, BRCost, GDKPCost, SR, WL, PL … }. */
export function rowsFromGargul(luaText, realmFilter = "") {
  const db = extractGlobal(luaText, "GargulDB");
  if (!db) throw new Error("no GargulDB table in this file");
  const rf = flatRealm(realmFilter);
  const rows = [];
  for (const [key, e] of Object.entries(db.AwardHistory ?? {})) {
    if (!e || typeof e !== "object" || !e.awardedTo || !e.timestamp) continue;
    // The realm is all after the name's first hyphen: "Fury Tann-Azjol-Nerub" is on Azjol-Nerub.
    const to = String(e.awardedTo);
    const realm = to.includes("-") ? to.slice(to.indexOf("-") + 1) : "";
    if (rf && realm && !flatRealm(realm).includes(rf)) continue;
    const notes = [];
    if (e.BRCost) notes.push(`BR ${e.BRCost}`);
    if (e.GDKPCost) notes.push(`GDKP ${e.GDKPCost}g`);
    if (e.SR) notes.push("SR");
    if (e.WL) notes.push("WL");
    if (e.PL) notes.push("PL");
    const item = linkFor(e.itemLink, e.itemID);
    if (!item) continue;
    // 1.16.0: the soft-reserve list it was won from (its id, `vrt-<event>` for a list the guild's own site made) — the
    // win closes that event's reserve on the site, wherever Gargul's history is filed.
    rows.push(rowOf({ player: String(e.awardedTo), ...stampOf(e.timestamp), id: `gargul:${e.checksum ?? key}`, item, itemstring: item, response: e.OS ? "Off Spec" : "Best in slot", note: notes.join(", "), ...(e.softresID ? { softres: String(e.softresID) } : {}) }));
  }
  return rows;
}

/** MonolithDKP / CommunityDKP: entries { player, loot, zone, date, boss, cost, index }, deletion records carry `deletes`, deleted ones `deletedby`. */
export function rowsFromDkp(luaText, system = "monolithdkp", realmFilter = "") {
  const global = LOOT_ADDONS[system]?.global ?? "MonDKP_Loot";
  const db = extractGlobal(luaText, global);
  if (!db) throw new Error(`no ${global} table in this file`);
  const rf = flatRealm(realmFilter);
  const rows = [];
  const isEntry = (e) => e && typeof e === "object" && e.player && e.loot && e.date;
  const walk = (node, keyPath, depth) => {
    if (depth > 4 || !node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (isEntry(v)) {
        // CommunityDKP nests by "Realm-Guild" then team; the realm filter applies to that key when there is one.
        if (rf && keyPath.length && !keyPath.some((p) => flatRealm(p).includes(rf)) && /-/.test(keyPath[0] ?? "")) continue;
        if (v.deletes || v.deletedby) continue;
        const item = linkFor(v.loot);
        if (!item) continue;
        const cost = Math.abs(Number(v.cost) || 0);
        rows.push(rowOf({ player: String(v.player), ...stampOf(v.date), id: `${system}:${v.index ?? `${v.date}|${String(v.player).toLowerCase()}|${item.match(/item:(\d+)/)?.[1] ?? item}`}`, item, itemstring: item, response: "Best in slot", boss: String(v.boss ?? ""), instance: String(v.zone ?? ""), note: cost ? `cost ${cost} DKP` : "" }));
      } else if (v && typeof v === "object") walk(v, /^\d+$/.test(k) ? keyPath : [...keyPath, k], depth + 1);
    }
  };
  walk(db, [], 0);
  return rows;
}

/**
 * CEPGP's loot log: CEPGP.Traffic in current CEPGP, the global TRAFFIC in older ones. An entry is { [1] target, [2]
 * issuer, [3] action, [4] EP before, [5] EP after, [6] GP before, [7] GP after, [8] item link, [9] timestamp, [10] its
 * id (current CEPGP; an older one wrote a GUID there), [11] the issuer's GUID }.
 */
export function rowsFromCepgp(luaText) {
  const t = extractGlobal(luaText, "CEPGP")?.Traffic ?? extractGlobal(luaText, "TRAFFIC");
  if (!t) throw new Error("no CEPGP loot log in this file (CEPGP.Traffic, or TRAFFIC in an older CEPGP)");
  const rows = [];
  let undated = 0;
  for (const e of listOf(t)) {
    if (!e || typeof e !== "object") continue;
    const f = (i) => (Array.isArray(e) ? e[i - 1] : e[i] ?? e[String(i)]);
    const link = String(f(8) ?? "");
    if (!/\|Hitem:\d+/.test(link) && !/^item:\d+/.test(link)) continue;
    const gpB = Number(f(6)) || 0, gpA = Number(f(7)) || 0, action = String(f(3) ?? "");
    if (!(gpA > gpB || /loot|award|item|distribut/i.test(action))) continue;
    const ts = Number(f(9));
    if (!ts) { undated++; continue; }
    const notes = [`GP ${gpA - gpB}`];
    if (action) notes.push(action);
    rows.push(rowOf({ player: String(f(1) ?? ""), ...stampOf(ts), id: `cepgp:${f(10) ?? `${ts}|${String(f(1) ?? "").toLowerCase()}|${link.match(/item:(\d+)/)?.[1] ?? link}`}`, item: link, itemstring: link, response: "Best in slot", note: notes.join(" — ") }));
  }
  rows.undated = undated; // loot lines from a CEPGP too old to stamp its traffic — reported, not uploaded
  return rows;
}

/**
 * What one of LootReserve's won rolls is — the same read from its saved file here and from its Rolls export on the site
 * (loot-import.js): a disenchant, or a raid roll (the item handed to someone at random), is free; a roll's phase ("Main
 * Spec", "Off Spec" …) is its response; else a reserve roll is "Reserved" and any other a "Roll".
 */
export const lootReserveAward = ({ disenchant = false, raidRoll = false, reserved = false, phase = "" } = {}) =>
  disenchant ? { response: "Disenchant", note: "disenchanted" }
  : raidRoll ? { response: "Free roll", note: "raid roll" }
  : { response: String(phase ?? "").trim() || (reserved ? "Reserved" : "Roll"), note: reserved ? "reserved" : "rolled" };
/** A won roll's id, the same from LootReserve's export, its saved file and the uploader: when it started, the item, the winner. */
export const lootReserveId = (startTime, itemId, player) => `lootreserve:${Math.round(Number(startTime))}:${Number(itemId)}:${String(player).toLowerCase()}`;

/**
 * LootReserve (1.16.0): the won rolls of its RollHistory — the character's file (LootReserveCharacterSave.Server) or the
 * account's when its global profile is on (LootReserveGlobalSave.Server.GlobalProfile), read off its Server.lua. A roll:
 * Item {id, suffix, uniqueID}, StartTime, Players {name = {rolls}}, Winners {names} — an older roll has none, and its
 * highest roll won, as its own export decides (0 is "not rolled") — Custom (no reserve roll), Disenchant, RaidRoll, and a
 * Tiered roll's Phases (max + roll/1000: Phases[101 − max]). Each row also carries `at`, the roll's start in ms, for a
 * reader that dates it on the guild's clock; `rows.skipped` counts the rolls nobody won.
 */
export function rowsFromLootReserve(luaText) {
  const ch = extractGlobal(luaText, "LootReserveCharacterSave"), gl = extractGlobal(luaText, "LootReserveGlobalSave");
  if (!ch && !gl) throw new Error("no LootReserve table in this file");
  const hist = ch?.Server?.RollHistory ?? gl?.Server?.GlobalProfile?.RollHistory;
  if (!hist) throw new Error("no roll history in it yet — LootReserve keeps it with the character, or the account when its global profile is on");
  const nth = (t, k) => (Array.isArray(t) ? t[k - 1] : t?.[k] ?? t?.[String(k)]);
  const rows = [];
  let skipped = 0;
  for (const roll of listOf(hist)) {
    const itemId = Number(nth(roll?.Item, 1) ?? roll?.Item?.id);
    const ts = Number(roll?.StartTime);
    if (!Number.isInteger(itemId) || itemId <= 0 || !ts) { skipped++; continue; }
    const players = roll.Players && typeof roll.Players === "object" ? roll.Players : {};
    const rollsOf = (p) => listOf(players[p]).map(Number);
    let winners = roll.Winners ? listOf(roll.Winners).map(String) : null;
    if (!winners) {
      winners = [];
      let max = 0;
      for (const p of Object.keys(players)) for (const n of rollsOf(p)) { if (n > max) { max = n; winners = [p]; } else if (n === max && n > 0 && !winners.includes(p)) winners.push(p); }
    }
    if (!winners.length) { skipped++; continue; }
    const item = linkFor(null, itemId);
    for (const w of winners) {
      const player = String(w).split("-")[0].trim();
      if (!player) continue;
      const max = roll.Tiered ? Math.floor(Math.max(0, ...rollsOf(w))) : 100;
      const phase = (Array.isArray(roll.Phases) ? roll.Phases[100 - max] : "") ?? "";
      const a = lootReserveAward({ disenchant: !!roll.Disenchant, raidRoll: !!roll.RaidRoll, reserved: !roll.Custom && !roll.Disenchant, phase });
      rows.push(rowOf({ player, ...stampOf(ts), id: lootReserveId(ts, itemId, player), item, itemstring: item, response: a.response, note: a.note, at: ts * 1000 }));
    }
  }
  rows.skipped = skipped;
  return rows;
}

/**
 * A DKP addon's own balances (1.16.0) — MonolithDKP's MonDKP_DKPTable, CommunityDKP's CommDKP_DKPTable (by realm-guild,
 * then team): [{ name, class, dkp }], the first entry of a name kept; [] for a file without one, or another addon's.
 */
export function balancesFromAddon(luaText, system) {
  const global = system === "monolithdkp" ? "MonDKP_DKPTable" : system === "communitydkp" ? "CommDKP_DKPTable" : null;
  const table = global ? extractGlobal(luaText, global) : null;
  if (!table) return [];
  const out = [], seen = new Set();
  const walk = (node, depth) => {
    if (!node || typeof node !== "object" || depth > 4) return;
    for (const k of Object.keys(node).sort()) {
      const v = node[k];
      if (v && typeof v === "object" && v.player != null && Number.isFinite(Number(v.dkp))) {
        const name = String(v.player).split("-")[0].trim();
        if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); out.push({ name, class: v.class ? String(v.class) : null, dkp: Number(v.dkp) }); }
      } else if (v && typeof v === "object") walk(v, depth + 1);
    }
  };
  walk(table, 0);
  return out;
}

/** Rows for any supported addon file. */
export function rowsFromAddon(luaText, system = "rclc", realmFilter = "") {
  switch (system) {
    case "lootreserve": return rowsFromLootReserve(luaText);
    case "gargul": return rowsFromGargul(luaText, realmFilter);
    case "cepgp": return rowsFromCepgp(luaText);
    case "monolithdkp": case "communitydkp": return rowsFromDkp(luaText, system, realmFilter);
    default: return rowsFromSavedVariables(luaText, realmFilter);
  }
}

export function importSavedVariables(root, guildCfg, dataDir) {
  const files = guildCfg.rclcSavedVariables ?? [];
  if (!files.length) return 0;
  const realmFilter = (guildCfg.rclcRealmFilter ?? guildCfg.serverSlug ?? "").toLowerCase();
  const rows = [];
  for (const file of files) {
    if (!fs.existsSync(file)) { console.log(`  rclc-sv: missing ${file}`); continue; }
    try { rows.push(...rowsFromSavedVariables(fs.readFileSync(file, "utf8"), realmFilter)); }
    catch (err) { console.log(`  rclc-sv: parse failed for ${path.basename(file)} (${err.message})`); continue; }
  }
  const out = path.join(dataDir, "rclc", "000-savedvariables-auto.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  writeJson(out, rows);
  console.log(`  rclc-sv: ${rows.length} award(s) read from ${files.length} SavedVariables file(s) -> ${path.basename(out)}`);
  return rows.length;
}

// Standalone: node src/rclc-lua.js
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const guildCfg = readJson(path.join(root, "config", "guild.json"));
  importSavedVariables(root, guildCfg, path.join(root, "data"));
}
