/**
 * Which edition a read from the game belongs to (the guildmaster, 2026-09-13: "does the addon check game version so the
 * roster stays true to game version … and doesn't overwrite the wrong game's roster?").
 *
 * Every read the addon writes carries the client it came from — the version string GetBuildInfo() gives
 * ("2.5.6" on the TBC Anniversary realms, the 1.x line for World of Warcraft: Forever) and the realm. A guild
 * running two editions has two sites; the uploader on one PC sees both clients' SavedVariables (each flavour has
 * its own folder: _anniversary_, _forever_). Two guards, one rule:
 *
 *   the uploader sends a read to the edition whose game the client version matches (the folder as a fallback for
 *   loot files, which carry no version) — and every site refuses a read whose version is not its game's, so a
 *   wrong-way upload is a logged refusal, never an overwrite.
 *
 * Shared by the site (src/game.js, web-wishlist.js) and the uploader (bundled in by scripts/build-uploader.mjs):
 * no imports, plain functions.
 */

/** Does a client version satisfy a game's pattern (a regex source such as "^2\\.")? No version = an older addon: allowed. */
export function clientMatches(pattern, version) {
  const v = String(version ?? "").trim();
  if (!v || !pattern) return true;
  try { return new RegExp(String(pattern)).test(v); } catch { return true; }
}

/** The flavour folder a SavedVariables path sits in: "_anniversary_", "_forever_", "_classic_era_" — or "". */
export function flavourOf(file) {
  const m = String(file ?? "").replace(/\\/g, "/").match(/\/(_[a-z0-9_]+_)\/WTF\//i);
  return m ? m[1].toLowerCase() : "";
}

/**
 * The edition a read goes to. `editions` = [{ slug, server, token, game, versions, folders }] as the hub hands
 * them out; `read` = { version?, flavour? }. The version decides; the folder decides when there is no version;
 * null when neither says (the uploader then uses the guild it was set up for).
 */
export function pickEdition(editions, read = {}) {
  const list = Array.isArray(editions) ? editions.filter((e) => e && e.server) : [];
  if (list.length < 2) return null;
  const v = String(read.version ?? "").trim();
  if (v) {
    const byVersion = list.filter((e) => e.versions && clientMatches(e.versions, v));
    if (byVersion.length === 1) return byVersion[0];
    if (byVersion.length > 1) return byVersion[0];
  }
  const f = String(read.flavour ?? "").toLowerCase();
  if (f) {
    const byFolder = list.filter((e) => Array.isArray(e.folders) && e.folders.map((x) => String(x).toLowerCase()).includes(f));
    if (byFolder.length >= 1) return byFolder[0];
  }
  return null;
}

