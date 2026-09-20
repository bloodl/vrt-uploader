# vrt-uploader

The small program that carries a raid's loot history from a raider's PC to the guild's
[Vortex Raid Tool](https://vortexraidtool.com) site. It reads the files World of Warcraft writes on logout, sends
what is new, and keeps watching. This repository is the complete source of what runs on your PC.

## What it does, exactly

- **Finds** the SavedVariables files of the loot addons it knows — RCLootCouncil, Gargul, CEPGP, MonolithDKP and
  CommunityDKP — under the World of Warcraft folder (`WTF\Account\<account>\SavedVariables\`), and the Vortex Raid
  Tool in-game addon's file beside them. It looks in the usual install folders and, on Windows, where the registry
  says the game is.
- **Reads** the loot history (who won which item, when, at which boss, with which response) and the in-game addon's
  readings: resistance gear, known recipes, the guild roster and the guild bank as the addon saw them.
- **Sends** them over HTTPS to one place: the guild's site, named by the guild's upload code or by the guild-named
  download the guild's Discord bot handed out. The default hub is `https://vortexraidtool.com`; `--hub` names
  another. Nothing else is sent, and nothing outside those files is read.
- **Watches** the files every 30 seconds and sends again when the game rewrites them (logout or `/reload`).
- **Starts with Windows** if you say yes when asked: a value in your own user's Run list, nothing system-wide, taken
  out again with `--remove-startup`.
- **Writes a log** of what it did to `%APPDATA%\VortexRaidTool\uploader.log`, and its settings to `uploader.json`
  beside it. The settings hold the site's address and the upload code — treat that folder like a password.

## Get it

**Windows:** download `vrt-uploader.exe` from the
[latest release](https://github.com/bloodl/vrt-uploader/releases/latest) and run it. Your guild's Settings page on
the site links the same file. **Put it in a folder of its own before the first run, and keep that folder.** It
installs nothing: `vrt-uploader.exe` is a launcher that never changes — on the first run it fetches the program,
`vrt-uploader.cjs`, beside itself (checked against the SHA-256 the hub publishes) and keeps that file current by
itself. The two files in that folder are what runs after every logon; delete them and the uploads stop. Nothing is
downloaded or swapped as an executable, ever: an update replaces the `.cjs` only.

**Anything else:** `vrt-uploader.cjs` from the same release runs with Node.js 22 or newer:

```bash
node vrt-uploader.cjs
```

The first run finds your guild from the names in your loot history, or asks for the guild's upload code, and then
asks whether to start with Windows. After that it runs by itself.

Windows shows "Windows protected your PC" the first few times an exe with a new certificate runs; "More info", then
"Run anyway". [Code signing](#code-signing) says what the signature tells you and how to check it.

**It keeps itself current** (1.12). Once an hour it asks the site which build is current; a newer one is downloaded
beside the running file, checked against the SHA-256 the site publishes, started with the same settings, and the
old copy leaves — the new file takes the old one's name and logon entry, so nothing changes for you, and the log
says "updated to …". A download that fails or does not match its hash is not installed. `--no-update` turns this
off; `--check-update` asks now.

## Options

| option | what it does |
|---|---|
| *(none)* | first run finds your guild from the names in your loot history, then uploads and keeps watching |
| `--code <code>` | the guild's upload code, for when the guild cannot be found or wants every upload to carry it |
| `--hub <url>` | the hub to ask which guild this is (default `https://vortexraidtool.com`) |
| `--file <path>` | a SavedVariables `.lua` of one of the loot addons (auto-detected otherwise; repeatable) |
| `--system <id>` | which addon a `--file` is, when its name does not say: `rclc`, `gargul`, `cepgp`, `monolithdkp`, `communitydkp` |
| `--realm <name>` | only this realm's characters |
| `--by <name>` | who the upload is logged as (default: the character the in-game addon reads for; never your Windows user name since 1.12.5) |
| `--once` | upload once and exit (no watching) |
| `--no-addon` | skip the in-game addon's resistance gear, recipes and guild bank |
| `--install-startup` | start at every Windows logon, without a window (a value in your own user's Run list) |
| `--remove-startup` | take that logon entry out again |
| `--uninstall` | remove the logon entry and the settings folder, and say which folder is left to delete |
| `--reset` | forget the saved settings |
| `--home <dir>` | keep settings and log in this folder instead of the user profile |
| `--quiet` | no questions and no window; the log is the only voice (what the logon entry passes) |
| `--check-update` | ask the site for a newer build now, not at the next hourly check |
| `--no-update` | never ask for a newer build |
| `--version`, `--help` | |

## Privacy

What leaves your PC, and only to the guild's site:

- the loot history in the addon files: player names, items, dates, responses, bosses, instances;
- the in-game addon's readings: resistance gear, known recipes, the guild roster (names and ranks) and the guild
  bank (items and gold), with the character and realm they came from and the addon's version;
- a name for who uploaded — the character the in-game addon reads for on this PC (before 1.12.5 it was the Windows
  user name), or what `--by` says — and, on every request, this
  program's version and form (exe or script) as its user-agent, so the guild's officers can see who runs it and
  who is on an old build (1.12.3);
- when no upload code is given, the player names in the loot history go to the hub so it can tell which guild's
  roster they belong to; nothing else is sent before a guild is found.

What does not: there is no telemetry, no crash reporting and no analytics. The program does not read the
Battle.net client, browsers, or anything outside the SavedVariables files it names in its log.

Who sees it: the operator of the site the data goes to, and the guild's members according to that site's own
rules. The site is a separate program from this one; see [Relationship to Vortex Raid Tool](#relationship-to-vortex-raid-tool).

## Uninstall

```bash
vrt-uploader --uninstall
```

removes the logon entry and the settings folder and names the one folder left to delete, the program's own.
Nothing else was installed: no service, no driver, no entry for other users.

## Verify a download

- `SHA256SUMS` on every release lists the sums of the files as published. On Windows,
  `Get-FileHash vrt-uploader.exe` in PowerShell; elsewhere `sha256sum`.
- Once releases are signed, the file's properties, **Digital Signatures** tab, name SignPath Foundation with this
  project's name. A file that shows another signer, or none, did not come from a release here.

## Build from source

```bash
npm ci
npm run build
```

`npm run build:bundle` makes the script alone, on any platform; `npm run build` on Windows also makes the exe.
`scripts/build.mjs` is the whole recipe, step by step: the four source files are joined into one CommonJS file; the
node.exe the build runs on is copied; Node's own signature is removed (the copy is about to change, as Node's
documentation asks); this project's name, version, description and icon are written into the file; the bundle is
injected as a Node single-executable application; the PE checksum is recomputed; the result is run with
`--version` and must answer with this version. `npm test` runs the checks.

The parser (`src/rclc-lua.js`), the finder (`src/rclc-find.js`) and the edition rule (`src/upload-route.js`) are
shared with the Vortex Raid Tool site, which is why they arrive here as copies; `src/cli.cjs` is the uploader itself.

## Code signing

Releases are built by GitHub Actions from a tag on this repository, and the release job is ready to submit the
build for signing. The policy — who holds which role, how a build becomes a signed file, what the program does
with data — is [docs/code-signing-policy.md](docs/code-signing-policy.md).

Status: not signed yet. An application to [SignPath Foundation](https://signpath.org) was made on 2026-09-15 and
declined on 2026-09-16: the Foundation program looks for public adoption (stars, forks, contributors, independent
mentions) that a repository published five days earlier does not have yet, and invited a reapplication once it
does. Until a certificate exists the exe is unsigned, and this section will say when that changes. If you build
it yourself from this repository, you get the same file.

## Relationship to Vortex Raid Tool

Vortex Raid Tool is a hosted service for WoW raiding guilds: loot priority, assignments, boss guides, a Discord
bot. Its server is not open source. This uploader is the one part that runs on a raider's own PC, and it is
published in full so anyone can read what it does before running it. The in-game addon is on
[CurseForge](https://www.curseforge.com/wow/addons/vortex-raid-tool).

Vortex Raid Tool is an independent fan-made tool and is not affiliated with or endorsed by Blizzard Entertainment.
World of Warcraft is a trademark of Blizzard Entertainment, Inc.

## Licence

[MIT](LICENSE). Maintained by Furytann.
