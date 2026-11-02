// Minimal ZIP writer (no dependency): deflate-compressed entries, UTF-8 file
// names, CRC-32 from Node's zlib. Enough for exporting a website's files.
import zlib from "zlib"

// MS-DOS time/date fields used by ZIP headers.
function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

// files: [{ name, content (string | Buffer) }] → Buffer containing a .zip
export function createZip(files, { date = new Date() } = {}) {
  const { time, date: day } = dosDateTime(date)
  const locals = [], centrals = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8")
    const raw = Buffer.isBuffer(f.content) ? f.content : Buffer.from(String(f.content), "utf8")
    const data = zlib.deflateRawSync(raw, { level: 9 })
    const crc = zlib.crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)  // local file header signature
    local.writeUInt16LE(20, 4)          // version needed (2.0)
    local.writeUInt16LE(0x0800, 6)      // flags: UTF-8 names
    local.writeUInt16LE(8, 8)           // method: deflate
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)          // extra length
    locals.push(local, name, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0) // central directory signature
    central.writeUInt16LE(20, 4)         // version made by
    central.writeUInt16LE(20, 6)         // version needed
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(day, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)    // offset of the local header
    centrals.push(central, name)

    offset += local.length + name.length + data.length
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)       // end of central directory
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

// Reads a ZIP made by createZip (used by tests to verify exports).
export function readZip(buf) {
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (endAt < 0) throw new Error("not a zip")
  const count = buf.readUInt16LE(endAt + 10)
  let p = buf.readUInt32LE(endAt + 16)
  const out = []
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory")
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16)
    const compressed = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32)
    const localAt = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8")
    const localNameLen = buf.readUInt16LE(localAt + 26), localExtra = buf.readUInt16LE(localAt + 28)
    const start = localAt + 30 + localNameLen + localExtra
    const data = buf.subarray(start, start + compressed)
    const raw = method === 8 ? zlib.inflateRawSync(data) : data
    if (raw.length !== size || zlib.crc32(raw) !== crc) throw new Error(`corrupt entry ${name}`)
    out.push({ name, content: raw })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}
