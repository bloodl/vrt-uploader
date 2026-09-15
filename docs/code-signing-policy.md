# Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io), certificate by
[SignPath Foundation](https://signpath.org).

This page says who is behind the signed `vrt-uploader.exe`, how it is built, what it does with your data and what
a signature on it means. It is published here; from the first signed release on, the download page of
[vortexraidtool.com](https://vortexraidtool.com/downloads) links it and carries the sentence above.

## Team

| role | who | what it means |
|---|---|---|
| Committer / author | Furytann | may change the source without a further review |
| Reviewer | Furytann | reviews every change from anyone who is not a committer before it is merged |
| Approver | Furytann | approves each signing request before SignPath signs |

All roles use multi-factor authentication on GitHub and on SignPath.

## What is signed, and how it is built

- Only release builds are signed: a tag `v<version>` on the `main` branch of
  [github.com/bloodl/vrt-uploader](https://github.com/bloodl/vrt-uploader).
- The build is GitHub Actions running the workflow in this repository, unchanged
  (`.github/workflows/build.yml`): it bundles `src/` into one file, copies the runner's official Node.js
  executable, removes Node's signature, writes this project's name and version into the file, injects the bundle
  and hands the result to SignPath as a GitHub artifact. `scripts/build.mjs` is the whole recipe, and anyone can
  run it and compare.
- SignPath verifies that the artifact came from that workflow on that repository, signs `vrt-uploader.exe` and
  the signed file is attached to the GitHub release together with `vrt-uploader.cjs` (the same program as a
  script, not signed) and `SHA256SUMS`, recomputed after signing.
- The signed file carries product name and version in its version resource; SignPath's file restrictions refuse
  a file without them.

## Privacy

The uploader runs on a raider's own PC and sends data to one place: the guild's Vortex Raid Tool site, named by
the guild's upload code or by the guild-named download the guild's Discord bot handed out. The default hub is
`https://vortexraidtool.com`; `--hub` names another.

What it reads: the SavedVariables files of the loot addons it knows (RCLootCouncil, Gargul, CEPGP, MonolithDKP,
CommunityDKP) under the World of Warcraft folder, and the Vortex Raid Tool in-game addon's file beside them.
Nothing else on the PC is read.

What it sends: the loot history in those files (who won which item, when, at which boss, with which response),
and the in-game addon's readings — resistance gear, known recipes, the guild roster and the guild bank as the
addon saw them — with the character and realm they came from, the addon's version, and a name for who uploaded
(your Windows user name unless `--by` says otherwise). When no upload code is given, the player names in the loot
history are sent to the hub so it can tell which guild's roster they belong to; nothing else is sent before a
guild is found.

What it keeps: `uploader.json` (the site's address, the upload code, which files it watches) and `uploader.log`
in `%APPDATA%\VortexRaidTool` (or the folder `--home` names). There is no telemetry, no crash reporting and no
analytics of any kind.

Opting out is not running it, or `--uninstall`, which removes the logon entry and the settings folder. Starting
with Windows is only ever set up after you say yes, or with `--install-startup`; `--remove-startup` takes it out.

## Verifying a download

- The Windows file properties, **Digital Signatures** tab, name SignPath Foundation with this project's name; a
  file that shows another signer or none did not come from a release of this repository.
- `SHA256SUMS` on the release lists the sums of the files as published.

## Changes to this policy

This policy is kept in the repository; the history of the file is its record. First published 2026-09-15.
