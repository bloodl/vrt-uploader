// Where the tests find the checkout and a writable folder for this run (VRT_TEST_TMP, else <tmp>/vrt-uploader-tests;
// kept after the run so a failure can be looked at).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const testsDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(testsDir, "..", "..");
export const scratch = process.env.VRT_TEST_TMP || path.join(os.tmpdir(), "vrt-uploader-tests");
fs.mkdirSync(scratch, { recursive: true });
