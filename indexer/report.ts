// What `npm run index` prints: the summary, the check against the survey, and one API's entry.
import { productOfFamily } from "./products.ts"
import type { Api, ApiVersion, Counts, IndexInfo } from "./run-index.ts"

const n = (x: number) => x.toLocaleString("en-GB")
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`

/** The "needed care" lines, e.g. "18 read by the second reader"; only those that happened. Also shown by the app. */
export function careLines(c: Counts): { count: number; text: string }[] {
  const care = [
    [c.secondReader, plural(c.secondReader, "read by the second reader", "read by the second reader")],
    [c.repeatedKey, plural(c.repeatedKey, "with a repeated key", "with a repeated key")],
    [c.nested, plural(c.nested, "API folder inside another", "API folders inside another")],
    [c.dotFolders, plural(c.dotFolders, 'folder with "." before the version', 'folders with "." before the version')],
    [c.versionDiffers, plural(c.versionDiffers, "version where the spec's number differs from its folder's", "versions where the spec's number differs from its folder's")],
    [c.noFolderVersion, plural(c.noFolderVersion, "folder without a version number", "folders without a version number")],
    [c.extraYaml, plural(c.extraYaml, "folder with more than one YAML file (first one read)", "folders with more than one YAML file (first one read)")],
  ] as const
  return care.filter(([count]) => count > 0).map(([count, text]) => ({ count, text }))
}

export function formatSummary(info: IndexInfo, bytes: number): string {
  const c = info.counts
  const pad = (s: string | number, width: number) => String(s).padStart(width)
  const lines = [
    `Indexed ${n(c.specFiles)} spec files in ${n(c.families)} families in ${info.seconds.toFixed(1)} s (${info.threads} threads).`,
    "",
    `  APIs     ${pad(n(c.apis), 6)}    API versions ${pad(n(c.versions), 6)}`,
    `  Banner   ${pad(n(c.banner), 6)}    Colleague    ${pad(n(c.colleague), 6)}`,
    `  Beta     ${pad(n(c.beta), 6)}    Deprecated   ${pad(n(c.deprecated), 6)}    Sunset ${n(c.sunset)}`,
  ]

  const care = careLines(c)
  if (care.length) {
    lines.push("", "  Needed care:")
    for (const { text } of care) lines.push(`    ${text}`)
  }

  const lost = c.unreadable + c.noSpec
  if (c.unreadable) {
    lines.push("", `  ${plural(c.unreadable, "file couldn't be read", "files couldn't be read")} (listed, but without details):`)
    for (const u of info.care.unreadable) lines.push(`    ${u.file}: ${u.reason}`)
  }
  if (c.noSpec) {
    lines.push("", `  ${plural(c.noSpec, "folder has", "folders have")} no YAML file (listed, but without details):`)
    for (const f of info.care.noSpec) lines.push(`    ${f}`)
  }

  lines.push("", `Index written (${(bytes / 1_000_000).toFixed(1)} MB).${lost ? "" : " Nothing was left out."}`)
  return lines.join("\n")
}

// What a survey of the whole catalog found, as downloaded on 7 Oct 2026 (counts only), for `--check`.
export const SURVEY_COUNTS = {
  families: 20,
  specFiles: 4378,
  versions: 4378,
  banner: 3034,
  colleague: 1344,
  unreadable: 0,
  secondReader: 18,
  repeatedKey: 1,
  nested: 1,
  dotFolders: 2,
  versionDiffers: 3,
  noSpec: 0,
  extraYaml: 0,
  noFolderVersion: 0,
} satisfies Partial<Counts>

const LABELS: Record<keyof typeof SURVEY_COUNTS, string> = {
  families: "families",
  specFiles: "spec files",
  versions: "API versions",
  banner: "Banner versions",
  colleague: "Colleague versions",
  unreadable: "unreadable files",
  secondReader: "read by the second reader",
  repeatedKey: "with a repeated key",
  nested: "API folders inside another",
  dotFolders: 'folders with "." before the version',
  versionDiffers: "version disagreements",
  noSpec: "folders without a YAML file",
  extraYaml: "folders with more than one YAML file",
  noFolderVersion: "folders without a version number",
}

export interface Difference {
  label: string
  survey: number
  now: number
}

export function compareWithSurvey(counts: Counts): Difference[] {
  return (Object.keys(SURVEY_COUNTS) as (keyof typeof SURVEY_COUNTS)[])
    .filter((k) => counts[k] !== SURVEY_COUNTS[k])
    .map((k) => ({ label: LABELS[k], survey: SURVEY_COUNTS[k], now: counts[k] }))
}

export function formatCheck(diffs: Difference[]): string {
  const total = Object.keys(SURVEY_COUNTS).length
  if (!diffs.length) return `All ${total} counts match the survey.`
  return [
    `${diffs.length} of ${total} counts differ from the survey:`,
    ...diffs.map((d) => `  ${d.label}: survey ${n(d.survey)}, now ${n(d.now)}`),
    "",
    "If you've downloaded a newer catalog since the survey (7 Oct 2026), differences are expected.",
  ].join("\n")
}

function versionLines(v: ApiVersion): string[] {
  const d = v.details
  const tags = [
    d?.beta && "beta",
    d?.versionDiffers && `spec says ${d.specVersion}`,
    v.nestedIn && `inside ${v.nestedIn}`,
    d?.deprecatedOn && `deprecated ${d.deprecatedOn}`,
    d?.sunsetOn && `sunset ${d.sunsetOn}`,
  ].filter(Boolean)
  const head = `  ${v.version ?? "(no version)"}${tags.length ? `  (${tags.join(", ")})` : ""}   ${v.relDir}`
  if (!d) return [head, `      couldn't be read: ${v.problem ?? "no YAML file"}`]

  // Display only: some specs' titles and descriptions run over several lines.
  const field = (label: string, value: string | null) =>
    value ? [`      ${label.padEnd(14)}${value.replace(/\s+/g, " ").trim()}`] : []
  return [
    head,
    ...field("Title", d.title),
    ...field("Status", d.releaseStatus),
    ...field("Type", d.apiType),
    ...field("Source", [d.sourceSystem, d.sourceDomain].filter(Boolean).join(" / ") || null),
    ...field("Source page", [d.sourceName, d.sourceTitle].filter(Boolean).join(" ") || null),
    ...field("Audience", d.audience),
    ...field("Description", d.description && d.description.length > 100 ? d.description.slice(0, 97) + "..." : d.description),
    `      Methods (${d.methods.length})`,
    ...d.methods.map((m) => `        ${m.method.padEnd(7)}${m.path}   ${m.permissions.join(", ")}`.trimEnd()),
  ]
}

export function formatShow(apis: Api[], name: string): string {
  // "widgets" finds it in every family; "BannerWidgetAPIs/widgets" finds just that one.
  const wanted = name.toLowerCase()
  const found = apis.filter((a) => a.name.toLowerCase() === wanted || a.id.toLowerCase() === wanted)
  if (!found.length) {
    const close = [...new Set(apis.map((a) => a.name).filter((x) => x.toLowerCase().includes(wanted)))].slice(0, 10)
    return `No API called "${name}".${close.length ? ` Did you mean: ${close.join(", ")}` : ""}`
  }
  return found
    .map((a) => [`${a.id}  (${productOfFamily(a.family).product}, ${plural(a.versions.length, "version", "versions")})`, ...a.versions.flatMap(versionLines)].join("\n"))
    .join("\n\n")
}
