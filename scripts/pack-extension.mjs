#!/usr/bin/env node
/**
 * Write extension.zip from the extension folder.
 * node_modules and .env stay out. This script does not print a key.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const source = process.argv[2] || join(root, 'extension');
const outFile = process.argv[3] || join(root, 'extension.zip');

function skipName(name) {
  return name === 'node_modules' || name === '.env';
}

function walk(dir, found) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipName(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.isFile()) found.push(full);
  }
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function u16(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value & 0xffff);
  return buf;
}

function u32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0);
  return buf;
}

const files = [];
walk(source, files);
const locals = [];
const centrals = [];
let offset = 0;
const dosDate = ((2026 - 1980) << 9) | (10 << 5) | 2;

for (const full of files) {
  const rel = relative(source, full).split(sep).join('/');
  const name = Buffer.from(rel);
  const data = readFileSync(full);
  const crc = crc32(data);
  const local = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(0),
    u16(0),
    u16(dosDate),
    u32(crc),
    u32(data.length),
    u32(data.length),
    u16(name.length),
    u16(0),
    name,
    data,
  ]);
  // Central directory header (APPNOTE 4.3.12): version made by, version needed, flags, method,
  // time, date. Five 16-bit fields before the date, not six: one extra field here shifted every
  // central record by two bytes, so `unzip`, Python and any store reading the central directory
  // saw a corrupt archive while a reader walking only the local headers saw a fine one.
  centrals.push(
    Buffer.concat([
      u32(0x02014b50),
      u16(20), // version made by
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method: stored
      u16(0), // time
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]),
  );
  locals.push(local);
  offset += local.length;
}

const central = Buffer.concat(centrals);
const end = Buffer.concat([
  u32(0x06054b50),
  u16(0),
  u16(0),
  u16(files.length),
  u16(files.length),
  u32(central.length),
  u32(offset),
  u16(0),
]);

writeFileSync(outFile, Buffer.concat(locals.concat([central, end])));
process.stdout.write(basename(outFile) + '\n');
