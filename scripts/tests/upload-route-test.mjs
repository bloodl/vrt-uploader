// Which edition a read from the game belongs to (src/upload-route.js): a guild on two games has a site per game, and
// the uploader must send each read to the one whose client it came from. Shared with the site; the bundle carries it.
import fs from "node:fs";
import path from "node:path";
import { clientMatches, flavourOf, pickEdition } from "../../src/upload-route.js";
import { repoRoot } from "./paths.mjs";
let failed = 0;
const check = (n, c, dd = "") => { console.log(`${c ? "✓" : "✗"} ${n}${c || !dd ? "" : " — " + dd}`); if (!c) failed++; };

check("a pattern against a version; no version or no pattern passes; a broken pattern passes rather than blocks", clientMatches("^2\\.", "2.5.6") && !clientMatches("^2\\.", "1.16.0") && clientMatches("^2\\.", "") && clientMatches("", "1.16.0") && clientMatches("(", "2.5.6"));
check("the flavour folder out of a SavedVariables path, either slash, lower-cased", flavourOf("D:/World of Warcraft/_anniversary_/WTF/Account/1#1/SavedVariables/VortexRaidTool.lua") === "_anniversary_" && flavourOf("C:\\Games\\World of Warcraft\\_Forever_\\WTF\\Account\\X\\SavedVariables\\RCLootCouncil.lua") === "_forever_" && flavourOf("/home/e/wow/_classic_era_/WTF/Account/a/SavedVariables/x.lua") === "_classic_era_" && flavourOf("somewhere/else.lua") === "");
const eds = [
  { slug: "vortex", guild: "Vortex", server: "https://x/g/vortex", token: "a", game: "tbc", versions: "^2\\.", folders: ["_anniversary_"] },
  { slug: "vortex-forever", guild: "Vortex Forever", server: "https://x/g/vortex-forever", token: "b", game: "forever", versions: "^1\\.", folders: ["_forever_"] },
];
check("the version decides: 2.5.6 → Anniversary, 1.16 → Forever", pickEdition(eds, { version: "2.5.6" })?.slug === "vortex" && pickEdition(eds, { version: "1.16.0", flavour: "_anniversary_" })?.slug === "vortex-forever");
check("no version (a loot file): the folder decides", pickEdition(eds, { flavour: "_forever_" })?.slug === "vortex-forever" && pickEdition(eds, { flavour: "_anniversary_" })?.slug === "vortex");
check("neither, an unknown client, or a guild on one game: null — the uploader uses the guild it was set up for", pickEdition(eds, {}) === null && pickEdition(eds, { version: "5.5.0", flavour: "_classic_" }) === null && pickEdition([eds[0]], { version: "2.5.6" }) === null && pickEdition(null, { version: "2.5.6" }) === null);
check("an edition without a server is not a place to send to", pickEdition([eds[0], { ...eds[1], server: "" }], { version: "1.16.0" }) === null);
const builder = fs.readFileSync(path.join(repoRoot, "scripts", "build.mjs"), "utf8");
check("the bundle carries the rule, before the CLI that uses it", /upload-route\.js/.test(builder) && builder.indexOf("$" + "{route}") < builder.indexOf("$" + "{cli}"));
const cli = fs.readFileSync(path.join(repoRoot, "src", "cli.cjs"), "utf8");
check("the uploader asks the hub for the editions, routes every read through target(), and names a wrong-game refusal", /\/api\/uploader\/editions/.test(cli) && (cli.match(/target\(\{/g) ?? []).length >= 4 && /wrongGame/.test(cli) && /version: mine\.version/.test(cli) && /version: gr\.version/.test(cli) && /version: bank\.version/.test(cli));
console.log(failed ? `\n${failed} check(s) failed` : "\nall upload-route checks passed");
process.exit(failed ? 1 : 0);
