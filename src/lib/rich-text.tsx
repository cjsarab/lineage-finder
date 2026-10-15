// Shows the catalog's descriptions formatted. Only what the catalog was found to use is understood (measured over
// every API and parameter description):
//   Markdown: ``` code blocks (an unclosed one runs to the end), `code`, # headings, **bold** and __bold__,
//             "-"/"*" bullets, "1." numbered lists and "---" dividers;
//   HTML:     <p> <div> <br> <b> <strong> <i> <em> <code> <pre> <h1>–<h6> <ul> <ol> <li> and simple tables.
// Everything else, a <script> tag included, is shown as plain text. Nothing is ever handed to the browser as HTML:
// each tag becomes the matching React element.
import { createElement, Fragment, type ReactNode } from "react"

type Tag = "p" | "strong" | "em" | "code" | "br" | "hr" | "pre" | "h4" | "h5" | "ul" | "ol" | "li" | "table" | "tr" | "td" | "th"
type Node = string | { tag: Tag; children: Node[] }

const HTML_TAGS: Record<string, Tag> = {
  p: "p", div: "p", br: "br", b: "strong", strong: "strong", i: "em", em: "em", code: "code", pre: "pre",
  h1: "h4", h2: "h4", h3: "h4", h4: "h4", h5: "h5", h6: "h5", ul: "ul", ol: "ol", li: "li",
  table: "table", tbody: "table", thead: "table", tr: "tr", td: "td", th: "th",
}
const INLINE_TAGS = new Set<Tag>(["strong", "em", "code", "br"])
const BLOCK_HTML = /<\/?(p|div|br|pre|h[1-6]|ul|ol|li|table|tbody|thead|tr|td|th)\b[^<>]*>/i
// A tag (its name, then anything up to ">"; attributes are dropped), or a `code` span (```code``` too), which is
// taken whole so a "<value>" inside it stays as written.
const TOKEN = /(`{1,3}[^`\n]+?`{1,3}|<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^<>]*)?\/?>)/
const TAG = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:\s[^<>]*)?\/?>$/
const CODE_SPAN = /^`{1,3}([^`\n]+?)`{1,3}$/
const BULLET = /^\s*[-*•]\s+/
const NUMBERED = /^\s*\d+[.)]\s+/
const HEADING = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/
const DIVIDER = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/

export function RichText({ text, className }: { text: string; className?: string }) {
  return <div className={className}>{render(parse(text))}</div>
}

function parse(text: string): Node[] {
  const out: Node[] = []
  for (const chunk of splitCodeBlocks(text.replace(/\r\n?/g, "\n"))) {
    if (chunk.code !== undefined) out.push({ tag: "pre", children: [{ tag: "code", children: [chunk.code] }] })
    else if (BLOCK_HTML.test(chunk.text)) out.push(...fromHtml(chunk.text))
    else out.push(...fromMarkdown(chunk.text))
  }
  return out
}

/** ``` code blocks are taken out first: nothing inside them is formatted. */
function splitCodeBlocks(text: string): { text: string; code?: string }[] {
  const out: { text: string; code?: string }[] = []
  let prose: string[] = []
  let code: string[] | null = null
  for (const line of text.split("\n")) {
    if (code === null) {
      // A line with a single ``` opens a block (usually at its start; a few start part-way along). Two on one line
      // (```x```) are inline code, not a block.
      const at = line.indexOf("```")
      if (at >= 0 && (line.match(/```/g) ?? []).length === 1) {
        if (line.slice(0, at).trim()) prose.push(line.slice(0, at))
        out.push({ text: prose.join("\n") })
        prose = []
        code = []
        const rest = line.slice(at + 3).trim()
        if (rest && !/^\w+$/.test(rest)) code.push(rest) // a word after ``` names the language; anything else is code
      } else prose.push(line)
    } else if (/^\s*```\s*$/.test(line) || /```\s*$/.test(line)) {
      const before = line.replace(/```\s*$/, "")
      if (before.trim()) code.push(before)
      out.push({ text: "", code: code.join("\n") })
      code = null
    } else code.push(line)
  }
  if (code !== null) out.push({ text: "", code: code.join("\n") }) // unclosed: runs to the end
  out.push({ text: prose.join("\n") })
  return out.filter((c) => c.code !== undefined || c.text.trim() !== "")
}

/**
 * Text with block tags: HTML's own rules, so line breaks are spaces (except inside <pre>). A Markdown heading on a
 * line of its own still counts as one (one description mixes the two).
 */
function fromHtml(text: string): Node[] {
  const headings = text.replace(/^[ \t]*(#{1,6})[ \t]+(.*?)[ \t#]*$/gm, (_, hashes: string, title: string) =>
    hashes.length <= 3 ? `<h3>${title}</h3>` : `<h5>${title}</h5>`,
  )
  return parseTags(headings, true)
}

/** Markdown blocks: headings, dividers, lists, and paragraphs in which single line breaks are kept. */
function fromMarkdown(text: string): Node[] {
  const out: Node[] = []
  let para: Node[] = []
  let list = null as { tag: "ul" | "ol"; items: Node[] } | null // "as": it changes inside the helpers below
  const flushPara = () => {
    if (para.length) out.push({ tag: "p", children: para })
    para = []
  }
  const flushList = () => {
    if (list) out.push({ tag: list.tag, children: list.items })
    list = null
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    const heading = line.match(HEADING)
    const kind = BULLET.test(line) ? "ul" : NUMBERED.test(line) ? "ol" : null
    if (line === "") {
      flushPara()
      flushList()
    } else if (heading) {
      flushPara()
      flushList()
      out.push({ tag: heading[1].length <= 3 ? "h4" : "h5", children: inline(heading[2]) })
    } else if (DIVIDER.test(line)) {
      flushPara()
      flushList()
      out.push({ tag: "hr", children: [] })
    } else if (kind) {
      flushPara()
      if (list?.tag !== kind) flushList()
      list ??= { tag: kind, items: [] }
      list.items.push({ tag: "li", children: inline(line.replace(kind === "ul" ? BULLET : NUMBERED, "")) })
    } else {
      flushList()
      if (para.length) para.push({ tag: "br", children: [] })
      para.push(...inline(line))
    }
  }
  flushPara()
  flushList()
  return out
}

const inline = (line: string) => parseTags(line, false)

/**
 * Splits text into allowed tags and text; unknown tags stay as text, unclosed ones close at the end. With
 * `html` set, whitespace runs become single spaces outside <pre>, and block tags are allowed; otherwise only the
 * inline ones are, and the rest are shown as text.
 */
function parseTags(text: string, html: boolean): Node[] {
  const root: { tag: Tag | null; children: Node[] } = { tag: null, children: [] }
  const stack: { tag: Tag | null; children: Node[] }[] = [root]
  const top = () => stack[stack.length - 1]

  for (const token of text.split(TOKEN)) {
    if (token === "") continue
    const code = token.match(CODE_SPAN)
    if (code) {
      top().children.push({ tag: "code", children: [decode(code[1])] })
      continue
    }
    const m = token.match(TAG)
    const known = m ? HTML_TAGS[m[2].toLowerCase()] : undefined
    const tag = known && (html || INLINE_TAGS.has(known)) ? known : undefined
    if (!m || !tag) {
      const inPre = stack.some((n) => n.tag === "pre")
      const t = html && !inPre ? token.replace(/\s+/g, " ") : token
      top().children.push(...inlineMarks(t))
    } else if (tag === "br") {
      top().children.push({ tag: "br", children: [] })
    } else if (m[1] === "") {
      const node = { tag, children: [] as Node[] }
      top().children.push(node)
      stack.push(node)
    } else {
      const at = stack.findLastIndex((n) => n.tag === tag)
      if (at > 0) stack.length = at // a closing tag with no opening one is ignored
    }
  }
  return root.children
}

/** **bold** and __bold__ (`code` spans are taken out before this). */
function inlineMarks(text: string): Node[] {
  return text.split(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/).flatMap((p, j): Node[] => {
    if (p === undefined || p === "") return []
    return j % 3 ? [{ tag: "strong", children: [decode(p)] }] : [decode(p)]
  })
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10)
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

// Paragraphs are drawn as <div>s: the catalog puts lists, tables and code inside its <p>s, which a real <p>
// can't hold.
const ELEMENT: Record<Tag, string> = { p: "div", strong: "strong", em: "em", code: "code", br: "br", hr: "hr", pre: "pre", h4: "h4", h5: "h5", ul: "ul", ol: "ol", li: "li", table: "table", tr: "tr", td: "td", th: "th" }
const STYLE: Partial<Record<Tag, string>> = {
  p: "[&:not(:last-child)]:mb-3",
  ul: "mb-3 list-disc pl-6 last:mb-0",
  ol: "mb-3 list-decimal pl-6 last:mb-0",
  strong: "font-bold",
  code: "font-names text-[0.9em] [:not(pre)>&]:bg-muted [:not(pre)>&]:px-1",
  pre: "mb-3 overflow-x-auto border-2 border-border bg-muted p-3 text-sm whitespace-pre last:mb-0",
  h4: "mt-4 mb-1 font-head first:mt-0",
  h5: "mt-3 mb-1 font-head first:mt-0",
  hr: "my-4 border-t-2 border-border",
  table: "mb-3 border-2 border-border text-sm last:mb-0",
  td: "border-2 border-border px-2 py-1 align-top",
  th: "border-2 border-border px-2 py-1 text-left font-head",
}

function render(nodes: Node[]): ReactNode {
  return nodes.map((n, i) => {
    if (typeof n === "string") return <Fragment key={i}>{n}</Fragment>
    if (n.tag === "br" || n.tag === "hr") return createElement(ELEMENT[n.tag], { key: i, className: STYLE[n.tag] })
    if (n.tag === "table") {
      // Browsers need rows inside a <tbody>; anything else in a table is left out.
      const rows = n.children.flatMap((c) => (typeof c !== "string" && c.tag === "table" ? c.children : [c])).filter((c) => typeof c !== "string" && c.tag === "tr")
      return (
        <table key={i} className={STYLE.table}>
          <tbody>{render(rows)}</tbody>
        </table>
      )
    }
    if (n.tag === "tr") return <tr key={i}>{render(n.children.filter((c) => typeof c !== "string" && (c.tag === "td" || c.tag === "th")))}</tr>
    return createElement(ELEMENT[n.tag], { key: i, className: STYLE[n.tag] }, render(n.children))
  })
}
