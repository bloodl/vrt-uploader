// The parser (rclc-lua.js) is shared with the Vortex Raid Tool site, where these two helpers live in a larger
// util.js. This is the part the uploader's copy needs so the module resolves on its own; the bundle never calls
// them — the build drops the server-side importer that does.
import fs from "node:fs";
import path from "node:path";

export function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch (err) {
    if (fallback !== undefined && err.code === "ENOENT") return fallback;
    throw new Error(`Could not read ${file}: ${err.message}`);
  }
}

export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}
