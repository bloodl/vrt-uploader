// The loot-addon parser on a small RCLootCouncil SavedVariables file written for this test (names and items are
// made up), and the file-name → addon detection the finder relies on.
import { rowsFromAddon, rowsFromSavedVariables, systemOfFile, addonLabel, LOOT_ADDONS, parseGlobal } from "../../src/rclc-lua.js";
import { accountOf, labelOfFile } from "../../src/rclc-find.js";

let failed = 0;
const check = (n, c, d = "") => { console.log(`${c ? "✓" : "✗"} ${n}${c || !d ? "" : " — " + d}`); if (!c) failed++; };
const link = (id, name) => `|cffa335ee|Hitem:${id}::::::::70::::::::::|h[${name}]|h|r`;

const rclc = `
RCLootCouncilLootDB = {
\t["factionrealm"] = {
\t\t["Horde - Thunderstrike"] = {
\t\t\t["Ravenfall-Thunderstrike"] = {
\t\t\t\t{
\t\t\t\t\t["lootWon"] = "${link(32235, "Cursed Vision of Sargeras")}",
\t\t\t\t\t["date"] = "15/09/26",
\t\t\t\t\t["time"] = "21:15:07",
\t\t\t\t\t["id"] = "1758000000-1",
\t\t\t\t\t["response"] = "Mainspec/Need",
\t\t\t\t\t["responseID"] = 1,
\t\t\t\t\t["votes"] = 3,
\t\t\t\t\t["boss"] = "Illidan Stormrage",
\t\t\t\t\t["instance"] = "Black Temple",
\t\t\t\t\t["iClass"] = 4,
\t\t\t\t\t["iSubClass"] = 2,
\t\t\t\t\t["note"] = "a \\"quoted\\" note",
\t\t\t\t}, -- [1]
\t\t\t\t{
\t\t\t\t\t["lootWon"] = "${link(32837, "Warglaive of Azzinoth")}",
\t\t\t\t\t["date"] = "15/09/26",
\t\t\t\t\t["time"] = "21:40:00",
\t\t\t\t\t["id"] = "1758001500-1",
\t\t\t\t\t["response"] = "Offspec/Greed",
\t\t\t\t\t["responseID"] = 2,
\t\t\t\t\t["boss"] = "Illidan Stormrage",
\t\t\t\t\t["instance"] = "Black Temple",
\t\t\t\t\t["iClass"] = 2,
\t\t\t\t\t["iSubClass"] = 7,
\t\t\t\t}, -- [2]
\t\t\t},
\t\t\t["Moonbriar-Thunderstrike"] = {
\t\t\t\t{
\t\t\t\t\t["lootWon"] = "${link(32524, "Shroud of the Highborne")}",
\t\t\t\t\t["date"] = "15/09/26",
\t\t\t\t\t["time"] = "22:05:12",
\t\t\t\t\t["id"] = "1758003000-1",
\t\t\t\t\t["response"] = "Mainspec/Need",
\t\t\t\t\t["responseID"] = 1,
\t\t\t\t\t["boss"] = "Illidan Stormrage",
\t\t\t\t\t["instance"] = "Black Temple",
\t\t\t\t\t["iClass"] = 4,
\t\t\t\t\t["iSubClass"] = 1,
\t\t\t\t}, -- [1]
\t\t\t},
\t\t},
\t\t["Alliance - Dreamscythe"] = {
\t\t\t["Thornwick-Dreamscythe"] = {
\t\t\t\t{
\t\t\t\t\t["lootWon"] = "${link(29434, "Badge of Justice")}",
\t\t\t\t\t["date"] = "14/09/26",
\t\t\t\t\t["time"] = "20:00:00",
\t\t\t\t\t["id"] = "1757900000-1",
\t\t\t\t\t["response"] = "Free",
\t\t\t\t\t["boss"] = "Rage Winterchill",
\t\t\t\t\t["instance"] = "Hyjal Summit",
\t\t\t\t\t["iClass"] = 15,
\t\t\t\t\t["iSubClass"] = 0,
\t\t\t\t}, -- [1]
\t\t\t},
\t\t},
\t},
}
`;

const rows = rowsFromSavedVariables(rclc);
check("every award of every player on every realm, in order", rows.length === 4 && rows.map((r) => r.player).join() === "Ravenfall-Thunderstrike,Ravenfall-Thunderstrike,Moonbriar-Thunderstrike,Thornwick-Dreamscythe");
const first = rows[0];
check("a row carries what the site's loader reads: item link, date, time, id, response, votes, boss, instance", first.item === link(32235, "Cursed Vision of Sargeras") && first.date === "15/09/26" && first.time === "21:15:07" && first.id === "1758000000-1" && first.response === "Mainspec/Need" && first.responseid === 1 && first.votes === 3 && first.boss === "Illidan Stormrage" && first.instance === "Black Temple");
check("the numeric item class and subclass become the names the site classifies by", first.subtype === "Leather" && rows[1].subtype === "One-Handed Swords" && rows[2].subtype === "Cloth" && rows[3].subtype === "Junk");
check("no votes, no response id: sensible blanks", rows[3].votes === 0 && rows[3].responseid === null);
check("a realm filter keeps that realm only, case-insensitively", rowsFromSavedVariables(rclc, "dreamscythe").length === 1 && rowsFromSavedVariables(rclc, "Thunderstrike").length === 3);
check("rowsFromAddon with the rclc system is the same reading", rowsFromAddon(rclc, "rclc").length === 4);
check("escaped quotes inside a Lua string survive the parser", parseGlobal(rclc, "RCLootCouncilLootDB").factionrealm["Horde - Thunderstrike"]["Ravenfall-Thunderstrike"][0].note === 'a "quoted" note');
let threw = false;
try { rowsFromSavedVariables("SomeOtherAddonDB = {}"); } catch { threw = true; }
check("a file without the RCLootCouncil table is refused, not read as empty", threw);

check("file names say which addon wrote them; anything else is not a loot file", systemOfFile("D:/WoW/WTF/Account/A/SavedVariables/RCLootCouncil_Classic.lua") === "rclc" && systemOfFile("x/Gargul.lua") === "gargul" && systemOfFile("x/CEPGP.lua") === "cepgp" && systemOfFile("x/MonolithDKP.lua") === "monolithdkp" && systemOfFile("x/CommunityDKP.lua") === "communitydkp" && !systemOfFile("x/VortexRaidTool.lua") && !systemOfFile("x/Details.lua"));
check("labels for people, one per addon", addonLabel("rclc") === "RCLootCouncil" && labelOfFile("x/Gargul.lua") === "Gargul" && addonLabel("nope") === "loot addon" && Object.keys(LOOT_ADDONS).length === 5);
check("the account folder out of a SavedVariables path, either slash", accountOf("D:\\World of Warcraft\\_anniversary_\\WTF\\Account\\12345#1\\SavedVariables\\RCLootCouncil_Classic.lua") === "12345#1" && accountOf("/wow/_anniversary_/WTF/Account/MAIN/SavedVariables/Gargul.lua") === "MAIN");

console.log(failed ? `\n${failed} check(s) failed` : "\nall parser checks passed");
process.exit(failed ? 1 : 0);
