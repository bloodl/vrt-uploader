#!/usr/bin/env node
// Runs every scripts/tests/*-test.mjs, one after the other, and fails if any of them does.
//   npm test                      all of them
//   node scripts/tests/run.mjs bundle parser     the ones whose names start so
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { testsDir, scratch } from "./paths.mjs";

const all = fs.readdirSync(testsDir).filter((f) => f.endsWith("-test.mjs")).sort();
const wanted = process.argv.slice(2).map((a) => a.replace(/(-test)?\.mjs$/, ""));
const tests = wanted.length ? all.filter((f) => wanted.some((w) => f.startsWith(w))) : all;
if (!tests.length) { console.error(`No test matches ${wanted.join(", ")}. Have: ${all.map((f) => f.replace("-test.mjs", "")).join(", ")}`); process.exit(2); }

console.log(`${tests.length} test file(s) · scratch ${scratch}\n`);
const failures = [];
for (const file of tests) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(testsDir, file)], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const ok = r.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${file} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!ok) { failures.push(file); console.log(out.split("\n").map((l) => "    " + l).join("\n")); }
  else { const bad = out.split("\n").filter((l) => l.startsWith("✗")); if (bad.length) console.log(bad.map((l) => "    " + l).join("\n")); }
}
console.log(failures.length ? `\n${failures.length} of ${tests.length} failed: ${failures.join(", ")}` : `\nall ${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
