// The maintainer is Furytann everywhere this project is seen. A few other words — a name, an account, a domain —
// must never appear in anything here: not in code, comments, docs, the workflow or the build output. They are
// kept as SHA-256 digests of the lower-cased word, so this file does not carry them either.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { repoRoot } from "./paths.mjs";

let failed = 0;
const check = (n, c, d = "") => { console.log(`${c ? "✓" : "✗"} ${n}${c || !d ? "" : " — " + d}`); if (!c) failed++; };

const BANNED = new Set([
  "02d08359f754fb6b3afcf916e7784a2a41eb8196f5c43d647e368aeb0ad47597",
  "627a45dd4bef2b289cf0d32fa6796b8819f336ec68d6a593ddceae8fab8ccde6",
  "762222d73223e1444ea7d1e6b9a7dff472ade749eba66b4d1076115a2c091bd2",
]);
const SKIP_DIRS = new Set([".git", "node_modules"]);
const SKIP_EXT = new Set([".ico", ".png", ".jpg", ".exe", ".blob", ".zip"]);
const digest = (w) => crypto.createHash("sha256").update(w).digest("hex");

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name)); continue; }
    if (!SKIP_EXT.has(path.extname(e.name).toLowerCase())) files.push(path.join(dir, e.name));
  }
})(repoRoot);

let seen = 0;
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const lines = text.split("\n");
  const where = [];
  lines.forEach((l, i) => { for (const w of new Set((l.toLowerCase().match(/[a-z0-9]+/g) ?? []))) if (BANNED.has(digest(w))) where.push(i + 1); });
  seen++;
  if (where.length) check(`${path.relative(repoRoot, f)} names nobody it should not`, false, `line ${where.slice(0, 5).join(", ")}`);
}
check(`${seen} file(s) scanned, none names anyone it should not`, failed === 0);
console.log(failed ? `\n${failed} check(s) failed` : "\nall no-real-name checks passed");
process.exit(failed ? 1 : 0);
