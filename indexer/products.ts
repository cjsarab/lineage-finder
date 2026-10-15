// Which product each family belongs to, for display. Display only: how deeply a family is handled still follows
// productOf() in folders.ts.

/** The groups, in the order they're shown: Banner first, then by size, the one-family products last. */
export const PRODUCT_GROUPS = ["Banner", "Colleague", "CRM", "PowerCampus", "Apply", "Other products"] as const
export type ProductGroup = (typeof PRODUCT_GROUPS)[number]

// Families whose name starts like this belong to that group, including any future ones.
const BY_PREFIX: [string, ProductGroup][] = [
  ["Banner", "Banner"],
  ["Colleague", "Colleague"],
  ["CRM", "CRM"],
  ["PowerCampus", "PowerCampus"],
  ["Apply", "Apply"],
]

// The one-family products, by folder name. Anything else unknown goes under "Other products" by its folder name.
const OTHER: Record<string, string> = {
  DegreeWorksAPIs: "Degree Works",
  EllDocumentMgmtAPIs: "Ellucian Document Management",
  ExperienceAPIs: "Experience",
  MaestroAPIs: "Intelligent Processes",
  PersonManagerAPIs: "Person Manager",
}

export function productOfFamily(family: string): { group: ProductGroup; product: string } {
  for (const [prefix, group] of BY_PREFIX) {
    if (family.startsWith(prefix)) return { group, product: group }
  }
  return { group: "Other products", product: OTHER[family] ?? family }
}
