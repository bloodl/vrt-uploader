# Getting the releases signed — the steps, in order

What has to happen between "the source is public" and "the exe people download carries a signature". The
maintainer's own checklist; nothing here is needed to build or run the uploader.

## 1. Before the repository goes public — done 2026-09-15

- The GitHub profile that owns the repository shows **Furytann** as its display name.
- Two-factor authentication is on for that account (SignPath requires it for every role) — check this one by hand.
- The repository is **public** as `bloodl/vrt-uploader`, `main` is pushed, and the first workflow run is green
  (the release job is skipped until step 3).
- Repository settings: **Code security** → private vulnerability reporting **on** (SECURITY.md points people
  there); **Branches** → `main` protected (no force pushes, no deletion); **Actions** → allowed.

## 2. Apply

At <https://signpath.org/apply>, with:

- repository: `https://github.com/bloodl/vrt-uploader`
- licence: MIT
- downloads: `https://github.com/bloodl/vrt-uploader/releases/latest`
- CI: GitHub Actions
- description, in a few lines:

  > A command-line uploader for World of Warcraft raiding guilds. It reads the loot-council addon's history from
  > WoW's SavedVariables on the loot master's PC and sends it to the guild's Vortex Raid Tool site over HTTPS, so
  > loot priority updates without anyone exporting anything. Windows exe (a Node.js single-executable
  > application, built by GitHub Actions on a tag) plus the same program as a script. Code signing policy:
  > docs/code-signing-policy.md.

## 3. After acceptance, in SignPath

- Project: slug `vrt-uploader`.
- Artifact configuration: the GitHub artifact is a zip with the exe at its root:

  ```xml
  <?xml version="1.0" encoding="utf-8"?>
  <artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
    <zip-file>
      <pe-file path="vrt-uploader.exe">
        <authenticode-sign/>
      </pe-file>
    </zip-file>
  </artifact-configuration>
  ```

  SignPath Foundation requires product name and version in the file; add their file-metadata restrictions to the
  `pe-file` element as their artifact-configuration documentation shows. `scripts/build.mjs` writes
  `ProductName` "Vortex Raid Tool uploader" and the four-part version, so the restriction holds.
- Signing policy: slug `release-signing`, release type, **approval required** (Furytann approves each request).
- Trusted build system: link the **GitHub.com** trusted build system to the project, and require origin
  verification in the policy: repository `bloodl/vrt-uploader`, tags `v*` or branch `main`.
- A CI user with an API token.

## 4. In the GitHub repository

- Secret `SIGNPATH_API_TOKEN`: the CI user's token.
- Variable `SIGNPATH_ORGANIZATION_ID`: the organisation id from SignPath. Its presence is what switches the
  release job on.

## 5. The first signed release

```bash
git tag v1.6.0
git push origin v1.6.0
```

The workflow builds, submits, waits; approve the request in SignPath; the release appears with
`vrt-uploader.exe` (signed), `vrt-uploader.cjs` and `SHA256SUMS`. Check the exe's Digital Signatures tab on a
Windows PC before telling anyone.

## 6. Then, on the site

- `/downloads/vrt-uploader.exe` and the Settings page's uploader link point at the release file.
- The download page and the Settings page carry the sentence "Free code signing provided by SignPath.io,
  certificate by SignPath Foundation." and a link to `docs/code-signing-policy.md`.
- README's Code signing section: replace the status line with the first signed version and date.
- Submit the signed exe once to Microsoft's developer false-positive form, so Defender's cloud verdict is
  refreshed for the new certificate.
