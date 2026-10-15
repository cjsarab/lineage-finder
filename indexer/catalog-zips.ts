// Ellucian's catalog as they deliver it: zips, read as they are. Lists the zips in a folder, finds the families inside
// each by their shape, and unpacks one zip's specs for reading.
//
// Listing is our own: it reads only each zip's list of files, from the end of the zip,
// which holds every file's size and checksum. fflate can't give the checksums and loads the whole zip first. Unpacking
// is fflate's.
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { unzipSync } from "fflate"
import { isYaml, splitFolder } from "./folders.ts"

/** One file in a zip, from the zip's list of files. */
export interface ZipItem {
  /** Its path inside the zip, with "/"; a folder's ends with "/". */
  name: string
  /** Unpacked size, in bytes. */
  size: number
  /** The CRC-32 checksum the zip stores for it. */
  crc: number
}

/** Why the folder's zips can't be read as a catalog; the folder check shows it (server/catalog-folder.ts). */
export type ZipProblem = { kind: "damaged"; zip: string } | { kind: "two-zips"; family: string; zips: [string, string] }

export class CatalogZipError extends Error {
  readonly problem: ZipProblem
  constructor(problem: ZipProblem) {
    super(
      problem.kind === "damaged"
        ? `${problem.zip} can't be opened. Download it again.`
        : `${problem.family} is in two zips: ${problem.zips[0]} and ${problem.zips[1]}. Keep only the newest download.`,
    )
    this.problem = problem
  }
}

/** A family found inside a zip. */
export interface ZipFamily {
  family: string
  /** The zip's file name, e.g. "production_API_catalog_A_B.zip". */
  zip: string
  /** The family's folder inside the zip, ending in "/" (e.g. "production_API_catalog_D/production_API_catalog_D/BannerX/"). */
  dir: string
  /** Every file and folder inside the family's folder, named from the family's folder (e.g. "x-1.0.0/x.yaml"). */
  items: ZipItem[]
}

export interface ZipCatalog {
  /** The zips with families in them, by file name. */
  zips: string[]
  /** Zips in the folder with no families in them, left alone (e.g. other downloads). */
  others: string[]
  /** Every family, in name order. */
  families: ZipFamily[]
}

/** The zips directly in `folder` (not in its subfolders), by file name, in name order. */
export function zipsIn(folder: string): string[] {
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((d) => d.isFile() && /\.zip$/i.test(d.name))
    .map((d) => d.name)
    .sort()
}

/**
 * Every family in the folder's zips. Throws a CatalogZipError for a zip that can't be opened, or a family in two zips
 * (likely an old and a new download side by side: merging them could mix two catalogs).
 */
export function findCatalog(folder: string): ZipCatalog {
  const out: ZipCatalog = { zips: [], others: [], families: [] }
  const seen = new Map<string, string>()
  for (const zip of zipsIn(folder)) {
    let items: ZipItem[]
    try {
      items = listZip(path.join(folder, zip))
    } catch {
      throw new CatalogZipError({ kind: "damaged", zip })
    }
    const families = familiesIn(zip, items)
    if (families.length === 0) {
      out.others.push(zip)
      continue
    }
    out.zips.push(zip)
    for (const f of families) {
      const other = seen.get(f.family)
      if (other) throw new CatalogZipError({ kind: "two-zips", family: f.family, zips: [other, zip] })
      seen.set(f.family, zip)
      out.families.push(f)
    }
  }
  out.families.sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0))
  return out
}

/**
 * The families in one zip's list of files. A family is found by its shape, not its name or depth:
 * a folder whose subfolders are named with a version at the end and hold a YAML spec (as `isFamily` in
 * server/catalog-folder.ts did for folders on disk). The folders above it are ignored, and nothing inside a family is
 * looked at for more families. macOS's "__MACOSX" copies are skipped: their "._" files look like specs.
 */
export function familiesIn(zip: string, items: ZipItem[]): ZipFamily[] {
  const usable = items.filter((i) => !i.name.startsWith("__MACOSX/"))
  // Every folder, including those the zip lists only through the files in them.
  const subfolders = new Map<string, Set<string>>([["", new Set()]])
  const addFolder = (dir: string) => {
    if (subfolders.has(dir)) return
    subfolders.set(dir, new Set())
    const parent = parentOf(dir)
    addFolder(parent)
    subfolders.get(parent)!.add(dir)
  }
  const yamlIn = new Set<string>()
  for (const i of usable) {
    if (i.name.endsWith("/")) addFolder(i.name)
    else {
      addFolder(parentOf(i.name))
      if (isYaml(i.name)) yamlIn.add(parentOf(i.name))
    }
  }
  const isFamily = (dir: string) =>
    [...(subfolders.get(dir) ?? [])].some((sub) => splitFolder(baseName(sub)).version != null && yamlIn.has(sub))

  const found: ZipFamily[] = []
  const walk = (dir: string) => {
    for (const sub of [...(subfolders.get(dir) ?? [])].sort()) {
      if (isFamily(sub)) {
        found.push({
          family: baseName(sub),
          zip,
          dir: sub,
          items: usable.filter((i) => i.name.startsWith(sub) && i.name !== sub).map((i) => ({ ...i, name: i.name.slice(sub.length) })),
        })
      } else walk(sub)
    }
  }
  walk("")
  return found
}

// "a/b/" -> "a/"; "a/b/c.yaml" -> "a/b/"; "a/" -> "".
function parentOf(name: string): string {
  const trimmed = name.endsWith("/") ? name.slice(0, -1) : name
  const cut = trimmed.lastIndexOf("/")
  return cut < 0 ? "" : trimmed.slice(0, cut + 1)
}

const baseName = (dir: string) => dir.slice(0, -1).split("/").at(-1) ?? ""

/**
 * Unpacks the named files of one zip (names as the zip lists them), as text. Throws if the zip can't be unpacked, or a
 * file's checksum isn't the one the zip stores: fflate doesn't check, and a damaged zip can unpack without an error
 * (tested).
 */
export function unpackTexts(file: string, names: Iterable<string>): Map<string, string> {
  const wanted = new Set(names)
  const damaged = () => new CatalogZipError({ kind: "damaged", zip: path.basename(file) })
  let files: Record<string, Uint8Array>
  let crcs: Map<string, number>
  try {
    crcs = new Map(listZip(file).map((i) => [i.name, i.crc]))
    files = unzipSync(new Uint8Array(fs.readFileSync(file)), { filter: (f) => wanted.has(f.name) })
  } catch {
    throw damaged()
  }
  const out = new Map<string, string>()
  for (const [name, data] of Object.entries(files)) {
    if (zlib.crc32(data) !== crcs.get(name)) throw damaged()
    out.set(name, Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8"))
  }
  return out
}

// The zip format's records (PKWARE's APPNOTE.TXT): the end record points to the list of files (the "central
// directory"), which ends the zip. Zip64 versions of both are used by very large zips or ones with over 65,535 files.
const END = 0x06054b50
const END64 = 0x06064b50
const END64_LOCATOR = 0x07064b50
const LIST_ENTRY = 0x02014b50
const MAX_COMMENT = 0xffff

/** A zip's list of files, read from the end of the zip only. Throws if it isn't a readable zip. */
export function listZip(file: string): ZipItem[] {
  const fd = fs.openSync(file, "r")
  try {
    const size = fs.fstatSync(fd).size
    const read = (at: number, length: number) => {
      if (at < 0 || length < 0 || at + length > size) throw new Error("outside the file")
      const buf = Buffer.alloc(length)
      if (fs.readSync(fd, buf, 0, length, at) !== length) throw new Error("short read")
      return buf
    }
    // The end record is 22 bytes, followed by a comment of up to 65,535 bytes.
    const tailStart = Math.max(0, size - 22 - MAX_COMMENT)
    const tail = read(tailStart, size - tailStart)
    let end = tail.length - 22
    while (end >= 0 && tail.readUInt32LE(end) !== END) end--
    if (end < 0) throw new Error("no end record")
    let count = tail.readUInt16LE(end + 10)
    let listSize = tail.readUInt32LE(end + 12)
    let listAt = tail.readUInt32LE(end + 16)
    if (count === 0xffff || listSize === 0xffffffff || listAt === 0xffffffff) {
      const locator = read(tailStart + end - 20, 20)
      if (locator.readUInt32LE(0) !== END64_LOCATOR) throw new Error("no zip64 locator")
      const end64 = read(Number(locator.readBigUInt64LE(8)), 56)
      if (end64.readUInt32LE(0) !== END64) throw new Error("no zip64 end record")
      count = Number(end64.readBigUInt64LE(32))
      listSize = Number(end64.readBigUInt64LE(40))
      listAt = Number(end64.readBigUInt64LE(48))
    }
    const list = read(listAt, listSize)
    const items: ZipItem[] = []
    let p = 0
    for (let i = 0; i < count; i++) {
      if (list.readUInt32LE(p) !== LIST_ENTRY) throw new Error("bad list entry")
      const flags = list.readUInt16LE(p + 8)
      const nameLength = list.readUInt16LE(p + 28)
      const extraLength = list.readUInt16LE(p + 30)
      const commentLength = list.readUInt16LE(p + 32)
      // Names are UTF-8 when the zip says so, else read byte for byte (as fflate does, so the names match its own).
      const name = list.toString(flags & 0x800 ? "utf8" : "latin1", p + 46, p + 46 + nameLength)
      let unpacked = list.readUInt32LE(p + 24)
      if (unpacked === 0xffffffff) unpacked = zip64Size(list.subarray(p + 46 + nameLength, p + 46 + nameLength + extraLength))
      items.push({ name, size: unpacked, crc: list.readUInt32LE(p + 16) })
      p += 46 + nameLength + extraLength + commentLength
    }
    return items
  } finally {
    fs.closeSync(fd)
  }
}

// The unpacked size from an entry's zip64 extra field (id 1), where it comes first.
function zip64Size(extra: Buffer): number {
  for (let p = 0; p + 4 <= extra.length; ) {
    const id = extra.readUInt16LE(p), length = extra.readUInt16LE(p + 2)
    if (id === 1 && length >= 8) return Number(extra.readBigUInt64LE(p + 4))
    p += 4 + length
  }
  throw new Error("no zip64 size")
}
