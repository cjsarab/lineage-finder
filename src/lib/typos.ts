// Probable typos in the catalog. Display only: the index keeps the catalog's names as written, and the app marks
// these "probably …" beside them rather than correcting them, since the catalog is the source of truth. Each was
// checked against a Banner database.
export interface Typo {
  /** The catalog's name, as written. */
  name: string
  /** The name it probably means: a table or a form, linked to its page, or Oracle's own (no page in the app). */
  probably: string
  kind: "table" | "form" | "oracle"
  /** Confirmed: the catalog's name is neither a table nor a form in the database. Otherwise "very likely". */
  confirmed: boolean
  /** Added to the note. */
  more?: string
}

const typo = (name: string, probably: string, o: { kind?: Typo["kind"]; confirmed?: boolean; more?: string } = {}): Typo => ({
  name,
  probably,
  kind: o.kind ?? "table",
  confirmed: o.confirmed ?? true,
  ...(o.more ? { more: o.more } : {}),
})

export const TYPOS: Record<string, Typo> = {
  // Program definition rules: the form SMAPRLE with two letters swapped (a form, not the table); the form sits on the
  // table SMRPRLE, which lookups normally name.
  SMARPLE: typo("SMARPLE", "SMAPRLE", { kind: "form", more: "The form SMAPRLE sits on the table SMRPRLE." }),
  GTVFLST: typo("GTVFLST", "GTVLFST"),
  SBPPERS: typo("SBPPERS", "SPBPERS"),
  SLBREDF: typo("SLBREDF", "SLBRDEF"),
  // A Finance name: FTVFTYP is a form there, but the database it was checked against had no Finance tables.
  FTVFTPY: typo("FTVFTPY", "FTVFTYP", { confirmed: false }),
  // A lookup written with a comma for Oracle's $. Assumed, not checked
  // against a database. Matched as written, comma included.
  "V,TIMEZONE_NAMES": typo("V,TIMEZONE_NAMES", "V$TIMEZONE_NAMES", {
    kind: "oracle",
    confirmed: false,
    more: "Probably Oracle's built-in list of time zone names, V$TIMEZONE_NAMES, with a comma for the $. Assumed, not checked against a database.",
  }),
}

export function typoNote(t: Typo): string {
  if (t.kind === "oracle") return t.more ?? ""
  const checked = t.confirmed
    ? "Not a table or form in a Banner database checked on 12 Oct 2026."
    : "Very likely a typo: not a form in a Banner database checked on 12 Oct 2026 (its Finance tables couldn't be seen)."
  return t.more ? `${checked} ${t.more}` : checked
}

/** The listed typos in a value, each once, in the order they appear. */
export function typosIn(text: string): Typo[] {
  const found = new Set<Typo>()
  const upper = text.toUpperCase()
  // A name with a separator in it (`V,TIMEZONE_NAMES`) is matched as written.
  for (const name of Object.keys(TYPOS)) if (/[^A-Z0-9$#_]/.test(name) && upper.includes(name)) found.add(TYPOS[name])
  for (const word of upper.split(/[^A-Z0-9$#]+/)) {
    for (const part of [word, ...word.split("_")]) {
      if (Object.hasOwn(TYPOS, part)) found.add(TYPOS[part])
    }
  }
  return [...found]
}
