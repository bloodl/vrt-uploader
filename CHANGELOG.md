# Changes

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
