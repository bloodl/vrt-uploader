/**
 * Two small operations on a Windows executable, done with plain file reads so the build needs no Windows SDK:
 * removing the Authenticode signature before the file is changed, and recomputing the PE checksum after.
 *
 * Both follow the PE/COFF layout: IMAGE_DOS_HEADER.e_lfanew at 0x3C points at "PE\0\0"; the COFF header is the
 * 20 bytes after it; then the optional header, whose CheckSum field sits 64 bytes in and whose data directories
 * start 96 (PE32) or 112 (PE32+) bytes in. The fifth directory is the certificate table — a file offset, not an
 * RVA, and it always points at the end of the file, which is why removing it is a truncation.
 */
import fs from "node:fs";

function headers(buf) {
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) throw new Error("not an executable (no MZ header)");
  const pe = buf.readUInt32LE(0x3c);
  if (buf.toString("latin1", pe, pe + 4) !== "PE\0\0") throw new Error("not a PE file");
  const opt = pe + 24;
  const magic = buf.readUInt16LE(opt);
  if (magic !== 0x10b && magic !== 0x20b) throw new Error(`unknown optional header magic 0x${magic.toString(16)}`);
  return { opt, checksumAt: opt + 64, securityAt: opt + (magic === 0x20b ? 112 : 96) + 4 * 8 };
}

/** Removes the certificate table (the Authenticode signature); true when there was one to remove. */
export function stripSignature(file) {
  const buf = fs.readFileSync(file);
  const { securityAt } = headers(buf);
  const at = buf.readUInt32LE(securityAt), size = buf.readUInt32LE(securityAt + 4);
  if (!at || !size) return false;
  buf.writeUInt32LE(0, securityAt);
  buf.writeUInt32LE(0, securityAt + 4);
  fs.writeFileSync(file, at + size >= buf.length ? buf.subarray(0, at) : buf);
  return true;
}

/** Is there a certificate table in this file? */
export function isSigned(file) {
  const buf = fs.readFileSync(file);
  const { securityAt } = headers(buf);
  return buf.readUInt32LE(securityAt) !== 0 && buf.readUInt32LE(securityAt + 4) !== 0;
}

/** The checksum the Windows loader would compute for this image (the CheckSum field itself counts as zero). */
export function peChecksum(buf) {
  const { checksumAt } = headers(buf);
  const b = Buffer.from(buf);
  b.writeUInt32LE(0, checksumAt);
  let sum = 0;
  const fold = () => { while (sum > 0xffffffff) sum = (sum % 0x100000000) + Math.floor(sum / 0x100000000); };
  const whole = b.length - (b.length % 4);
  for (let i = 0; i < whole; i += 4) { sum += b.readUInt32LE(i); if (sum > 0xffffffff) fold(); }
  if (whole < b.length) { let tail = 0; for (let i = b.length - 1; i >= whole; i--) tail = tail * 256 + b[i]; sum += tail; fold(); }
  sum = (sum & 0xffff) + (sum >>> 16);
  sum += sum >>> 16;
  sum &= 0xffff;
  return (sum + b.length) >>> 0;
}

/** The CheckSum field as the file carries it. */
export function readChecksum(buf) { return buf.readUInt32LE(headers(buf).checksumAt); }

/** Writes the checksum the file should carry; returns it. */
export function fixChecksum(file) {
  const buf = fs.readFileSync(file);
  const sum = peChecksum(buf);
  buf.writeUInt32LE(sum, headers(buf).checksumAt);
  fs.writeFileSync(file, buf);
  return sum;
}
