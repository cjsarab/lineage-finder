// Words for the first-run screens, kept apart so they're easy to test and reword.
import type { FolderCheck } from "@/lib/server"

/** A number with thousands separators: 3,645. */
export const n = (x: number) => x.toLocaleString("en-GB")

/** A rough guess at the time left, from the speed so far. Nothing until about 5% is read. */
export function timeLeft(done: number, total: number, seconds: number): string | null {
  if (total <= 0 || done / total < 0.05 || seconds <= 0) return null
  const left = (seconds * (total - done)) / done
  if (left < 10) return "A few seconds left"
  if (left < 90) return `About ${Math.round(left / 5) * 5} seconds left`
  return `About ${Math.round(left / 60)} minutes left`
}

export function seconds(s: number): string {
  const whole = Math.round(s)
  if (whole < 90) return `${whole} ${whole === 1 ? "second" : "seconds"}`
  return `${Math.floor(whole / 60)} min ${whole % 60} s`
}

export function count(x: number, one: string, many: string): string {
  return `${n(x)} ${x === 1 ? one : many}`
}

export interface FolderMessage {
  /** Did the folder pass the check? */
  ok: boolean
  text: string
}

/**
 * Ellucian's page for downloading the catalog's zips (it needs an Ellucian login). Kept here only,
 * so it's a one-line change if Ellucian move it.
 */
export const ELLUCIAN_DOWNLOAD_PAGE =
  "https://resources.elluciancloud.com/r/bundle/dev_res_ref_api_catalog/page/c_download_view_api_catalog.html"

const UNZIPPED = "This looks like a catalog that was unzipped. The app now reads Ellucian's zip files as you download them:"
const putZipsIn = (folder: string) =>
  `Put the five zips you downloaded from Ellucian into ${folder}, as they are (no need to unzip them), then press Check again.`

/**
 * What to say about a checked folder. `isDefault` is true for the
 * catalog-zips folder inside the app.
 */
export function describeCheck(check: FolderCheck, isDefault = false): FolderMessage {
  switch (check.kind) {
    case "ok": {
      const found = `Found ${count(check.families, "family", "families")} in ${count(check.zips, "zip", "zips")}`
      return { ok: true, text: check.others ? `${found} (${count(check.others, "other zip", "other zips")} ignored)` : found }
    }
    case "not-full-path":
      return { ok: false, text: "Paste the folder's full path, starting with the drive letter (for example C:\\…)." }
    case "missing":
      return isDefault
        ? { ok: false, text: putZipsIn(check.path) }
        : { ok: false, text: `There's no folder at ${check.path}. Check the path and try again.` }
    case "not-a-folder":
      return { ok: false, text: `${check.path} is a file, not a folder.` }
    case "unzipped":
      return isDefault
        ? { ok: false, text: `${UNZIPPED} put the five zips into ${check.path}, as they are, then press Check again.` }
        : { ok: false, text: `${UNZIPPED} put the zips in a folder and choose that.` }
    case "two-zips":
      return { ok: false, text: `${check.family} is in two zips: ${check.zips[0]} and ${check.zips[1]}. Keep only the newest download.` }
    case "damaged":
      return { ok: false, text: `${check.zip} can't be opened. Download it again.` }
    case "empty":
      if (isDefault) return { ok: false, text: putZipsIn(check.path) }
      return check.others
        ? { ok: false, text: `None of the zips in ${check.path} hold an API catalog. Choose the folder with the zips you downloaded from Ellucian.` }
        : { ok: false, text: `There are no zip files in ${check.path}. Choose the folder with the zips you downloaded from Ellucian.` }
  }
}
