# Changes

## 1.16.1 — 2026-10-15

- CEPGP's loot is read where current CEPGP keeps it, `CEPGP.Traffic`. Its builds for TBC and Anniversary save no `TRAFFIC`, so a CEPGP guild's loot never reached the site. An older file with `TRAFFIC` is still read.

## 1.16.0 — 2026-10-07

- LootReserve's won rolls are sent too. LootReserve keeps them with each character (`WTF/Account/<account>/<realm>/<character>/SavedVariables/LootReserve.lua`), so each character's file is found and filed apart; the account's own file is read when its global profile is on. A disenchant and a raid roll come in as free, a roll's phase as its response, a reserve roll as "Reserved".
- A MonolithDKP or CommunityDKP file brings its DKP table along with its loot, so a DKP guild's points stand beside the priority on its board.
- A Gargul win carries the soft-reserve list it was won from. A list made on the guild's own site closes that raid's reserves with the win — even where the guild files RCLootCouncil's history, not Gargul's, as its loot.
- An uploader set up before takes LootReserve's files at its next start, by the same rule as at setup (written in the last half-year); the files an officer chose stay as chosen.

## 1.15.1 — 2026-10-05

- Each loot file says which game's folder it comes from (`_anniversary_`, `_classic_era_` …). Every World of Warcraft game keeps its own loot history, and one account's files from two games used to land in the same place on the site and overwrite each other. The site now files each game apart and answers a file from a game the guild does not play without filing it; the uploader says once which file it set aside and why.
- The prompt for a loot file typed by hand names the game's folder (`_anniversary_`), not `_classic_`.

## 1.15.0 — 2026-09-24

- The loot history goes both ways: the awards the guild's history holds and this PC's RCLootCouncil history lacks (a raid missed, or looted on another computer) go into the addon's inbox, and the addon adds them at the next /reload. An award deleted in game is never put back. Each upload carries RCLootCouncil's own entry whole.

## 1.14.1 — 2026-09-21

- The standings carry why a raider is off the board — under the attendance bar, inactive, not signed up — for the addon's column in the loot council's voting frame.

## 1.14.0 — 2026-09-21

- The guild's recipes ride into the addon's inbox as the site knows them, for clients that were never online with a crafter. A record the addon took from the site, or from a guildmate passing it on, is never sent back.

## 1.13.0 — 2026-09-20

- The exe is a launcher that never changes; the program is vrt-uploader.cjs beside it, and an update replaces only that file. No executable is downloaded or swapped any more.

## 1.12.6 — 2026-09-20

- Says, when it registers itself to start with Windows, that the downloaded file is the program and must be kept.

## 1.12.5 — 2026-09-18

- Uploads are filed under the character the addon reads for, never the Windows account name — chosen once from the addon's saved variables and kept; `--by` chooses another.

## 1.12.4 — 2026-09-18

- Reads the Forever addon's saved variables (VortexRaidToolForever.lua) and writes its inbox into that addon's folder: one uploader for both games.

## 1.12.3 — 2026-09-18

- Says its version and by-line on every request (the site lists who runs it, on which build, and when it was last heard from) and at every start.

## 1.12.2 — 2026-09-17

- After an update the program runs under the file's proper name (Task Manager had listed vrt-uploader.new.exe until the next logon).

## 1.12.1 — 2026-09-17

- One report per character: a character read on two of the PC's accounts had been reported turn and turn about at every look.

## 1.12.0 — 2026-09-17

- Keeps itself current: once an hour it asks the hub for the newest build, fetches a newer one beside itself, checks it against its published hash and starts it with the same settings; the new copy takes the old file's name and logon entry. `--check-update` asks now.

## 1.11.1 — 2026-09-17

- The inbox is written again when an addon update replaced it with the empty file the addon ships.

## 1.11.0 — 2026-09-17

- The standings go into the inbox for the addon's column in RCLootCouncil's voting frame, and the council's record of each award (candidates, responses, votes) goes out to the site, which tells the guild the why.

## 1.10.0 — 2026-09-16

- The site's wishlists and bank requests go into the addon's own Inbox.lua, inside the addon folder of the game flavour the saved variables belong to, every two minutes whenever the site's answer changed — game open or not. The game reads that file at every /reload and never writes it. The saved variables are only ever read from now on: a write into them during a /reload had left them unreadable.

## 1.9.2 — 2026-09-16

- A file the site does not take — another loot addon's history than the guild runs — is set aside once the site says so, and a file whose history cannot be read is said once and left alone; neither stops the files after it.
- Saying yes to "start with Windows" on the first run hands over to the background at once, so the window can be closed and nothing stops.
- A newer download run by hand takes over the logon entry from the old file, stops the old copy and says it can be deleted; the settings live in the profile folder, so nothing has to be typed again.

## 1.9.1 — 2026-09-16

- No more "which ones?" on the first run: every loot addon file written in the last half-year is taken, each account kept apart on the site; a file untouched for six months is left alone unless it is the only one. `--file` still picks by hand.

## 1.9.0 — 2026-09-16

- A wishlist row carries the raider's Priority when the site sends it, and, under a token or a recipe, the name of what was actually wishlisted; the addon shows both on the tooltip. The site decides whether the numbers travel (its own switch); without them the rows are written as before.

## 1.8.0 — 2026-09-16

- The guild bank's open request queue is carried into the in-game addon the way the wishlists are, and a hand-out marked in the addon is carried back to the site, once, with the site's answer remembered. One shared block writer for both keys; nothing is written while a World of Warcraft client is running.

## 1.7.0 — 2026-09-16

- The other direction, for the first time: the guild's wishlists are fetched from the site and written into the in-game addon's saved variables while the game is not running, as one top-level key, every other byte left alone. The addon shows them on item tooltips to ranks that can promote. Nothing is written while a World of Warcraft client is running.

## 1.6.1 — 2026-09-16

- A guild member on nobody's roster entry has their resistance gear filed under their own name (the site does it the way it already did recipes); the gear line says so, and the "not on the roster" line is only for a character in neither list.

## 1.6.0 — not released yet

- **Starting with Windows is a value in your own user's Run list**, no longer a VBScript in the Startup folder.
  Started for the background, the program hands over to a copy of itself that the operating system opens without
  a window and leaves; no script host is involved. An existing Startup-folder entry is moved the first time this
  version runs, and says so in the log.
- **`--uninstall`** removes the logon entry and the settings folder, and tells you which folder to delete.
- **`--remove-startup`** acts at once, without an upload first.
- **The exe says what it is.** Company, product, description, version, original file name and an icon are written
  into the file; Node's own signature is removed before the file is changed and the PE checksum is recomputed.
- **The source is public.** Release builds come from GitHub Actions on a tag of this repository and are submitted
  to SignPath Foundation for signing; `SHA256SUMS` sits beside every release.

## 1.5.4 — 2026-09-15

- A recipes package says which character sent it (the in-game addon answers for every character of the account
  since its 0.6.0).

## Earlier

- 1.5.1 — a refused report is not asked again until the addon has a new one.
- 1.5 — no code needed: a guild-named download, or the hub finds the guild from the names in the loot history.
- 1.4 — any raider's PC, not only the loot master's.
- 1.3.1 — the addon file found beside a typed loot file.
- 1.3 — the guild bank.
- 1.2 — the in-game addon's gear and recipes.
- 1.1 — Gargul, CEPGP, MonolithDKP and CommunityDKP files.
- 1.0 — RCLootCouncil history, watched and uploaded.
