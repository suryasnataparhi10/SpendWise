// Minimal ZIP writer/reader for migration packages. Reading is deliberately strict: only the
// expected entry names are accepted, sizes are capped before and during decompression (zip-bomb
// protection), CRCs are verified, and nothing is ever written to disk.
const zlib = require('node:zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buffer) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buffer) >>> 0;
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

// entries: [{ name, data: Buffer, compress?: boolean }] (compress defaults to true)
function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { time, day } = dosDateTime(new Date());
  for (const { name, data, compress = true } of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const method = compress ? 8 : 0;
    const compressed = compress ? zlib.deflateRawSync(data, { level: 9 }) : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8); // 8 = deflate, 0 = store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const invalid = (message) => Object.assign(new Error(`Invalid migration package: ${message}`), { status: 400 });

// Returns { [name]: Buffer } for the allowed entries only. If `names` (an array) is given, the name
// of every entry in the archive, allowed or not, is appended to it.
function readZip(buffer, { allowed, names, maxEntryBytes = 512 * 1024 * 1024, maxTotalBytes = 768 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw invalid('the file is not a ZIP archive');
  let endOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      endOffset = i;
      break;
    }
  }
  if (endOffset < 0) throw invalid('the file is not a ZIP archive');
  const count = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (count > 16) throw invalid('too many files in the archive');
  if (centralOffset + centralSize > endOffset) throw invalid('corrupt central directory');

  const files = {};
  let total = 0;
  let pointer = centralOffset;
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) throw invalid('corrupt central directory');
    const flags = buffer.readUInt16LE(pointer + 8);
    const method = buffer.readUInt16LE(pointer + 10);
    const crc = buffer.readUInt32LE(pointer + 16);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const size = buffer.readUInt32LE(pointer + 24);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength);
    pointer += 46 + nameLength + extraLength + commentLength;
    if (flags & 0x1) throw invalid('ZIP-level encryption is not supported');
    if (Array.isArray(names)) names.push(name);
    if (!allowed.includes(name)) continue; // unknown entries are ignored, never extracted
    if (files[name]) throw invalid(`duplicate entry ${name}`);
    if (size > maxEntryBytes) throw invalid(`${name} is too large`);
    total += size;
    if (total > maxTotalBytes) throw invalid('the archive expands beyond the allowed size');
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw invalid('corrupt file header');
    const dataStart =
      localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    if (raw.length !== compressedSize) throw invalid('truncated archive');
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try {
        data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) });
      } catch {
        throw invalid(`${name} could not be decompressed`);
      }
    } else throw invalid('unsupported compression method');
    if (data.length !== size || crc32(data) !== crc) throw invalid(`${name} failed its integrity check`);
    files[name] = data;
  }
  return files;
}

module.exports = { createZip, readZip, crc32 };
