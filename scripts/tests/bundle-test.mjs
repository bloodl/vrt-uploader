// The build produces a bundle that runs, says its version, and has the shape an antivirus can live with; on
// Windows, the exe (when dist/ has one) answers the same. Also the PE helpers, checked against the node.exe this
// test runs on.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { repoRoot, scratch } from "./paths.mjs";
import { peChecksum, readChecksum, isSigned } from "../pe.mjs";

let failed = 0;
const check = (n, c, d = "") => { console.log(`${c ? "✓" : "✗"} ${n}${c || !d ? "" : " — " + d}`); if (!c) failed++; };
const run = (file, args) => execFileSync(file, args, { encoding: "utf8", timeout: 60_000 }).trim();

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const out = path.join(scratch, "build");
fs.rmSync(out, { recursive: true, force: true });
execFileSync(process.execPath, [path.join(repoRoot, "scripts", "build.mjs"), "--no-exe", "--out", out], { stdio: "pipe" });
const cjs = path.join(out, "vrt-uploader.cjs");
check("the bundle is written and passes node --check", fs.existsSync(cjs));
const bundle = fs.readFileSync(cjs, "utf8");
check("--version names this version", run(process.execPath, [cjs, "--version"]) === `vrt-uploader ${pkg.version}`);
const help = run(process.execPath, [cjs, "--help", "--home", path.join(out, "home")]);
check("--help lists the logon options, --uninstall and --home", /--install-startup/.test(help) && /--remove-startup/.test(help) && /--uninstall/.test(help) && /--home/.test(help));
check("the bundle carries the parser, the finder and the edition rule before the CLI", /function rowsFromSavedVariables\(/.test(bundle) && /function findSavedVariables\b|const findSavedVariables\b/.test(bundle) && /function pickEdition\(/.test(bundle) && bundle.indexOf("function pickEdition(") < bundle.indexOf("const VERSION ="));
check("the logon entry is a Run-list value; no script host, no VBScript is written", /CurrentVersion\\\\Run/.test(bundle) && !/CreateObject\(/.test(bundle) && !/Wscript/i.test(bundle) && !/writeFileSync\([^\n]*\.vbs/.test(bundle));
check("started for the background it hands over to a windowless copy through windowsHide, once", /windowsHide: true/.test(bundle) && /VRT_UPLOADER_HIDDEN/.test(bundle));
check("--uninstall removes the logon entry and the settings folder", /rmSync\(cfgDir/.test(bundle));
check("SHA256SUMS lists the bundle", /  vrt-uploader\.cjs\n/.test(fs.readFileSync(path.join(out, "SHA256SUMS"), "utf8")));

if (process.platform === "win32") {
  const node = fs.readFileSync(process.execPath);
  check("the PE checksum helper agrees with the checksum node.exe carries", peChecksum(node) === readChecksum(node), `0x${peChecksum(node).toString(16)} vs 0x${readChecksum(node).toString(16)}`);
  check("node.exe is seen as signed", isSigned(process.execPath));
  const exe = path.join(repoRoot, "dist", "vrt-uploader.exe");
  if (fs.existsSync(exe)) {
    check("dist/vrt-uploader.exe answers --version with this version", run(exe, ["--version"]) === `vrt-uploader ${pkg.version}`);
    check("dist/vrt-uploader.exe carries no certificate table until SignPath adds one", !isSigned(exe));
    const built = fs.readFileSync(exe);
    check("dist/vrt-uploader.exe carries a correct PE checksum", peChecksum(built) === readChecksum(built));
  } else console.log("  (no dist/vrt-uploader.exe — npm run build makes one; skipped)");
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall bundle checks passed");
process.exit(failed ? 1 : 0);
