// Descriptions formatted safely. Made-up text only.
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { RichText } from "./rich-text"

// The markup, without the wrapping <div> and the style classes, so the tests read as plain HTML. Paragraphs are
// drawn as <div>s (the catalog puts lists and code inside its <p>s, which a real <p> can't hold).
const html = (text: string) =>
  renderToStaticMarkup(<RichText text={text} />)
    .replace(/^<div>|<\/div>$/g, "")
    .replace(/ class="[^"]*"/g, "")

describe("RichText: the catalog's HTML", () => {
  it("keeps paragraphs, lists, bold, italics and line breaks", () => {
    expect(html("<p>One <b>bold</b> and <i>slanted</i>.</p><ul><li>A</li><li>B</li></ul>Line<br/>break")).toBe(
      "<div>One <strong>bold</strong> and <em>slanted</em>.</div><ul><li>A</li><li>B</li></ul>Line<br/>break",
    )
  })

  it("keeps headings, preformatted text (with its line breaks) and simple tables", () => {
    expect(html("<h4>Example</h4><pre>{\n  \"a\": 1\n}</pre><table><tr><td>id</td><td>Code</td></tr></table>")).toBe(
      '<h4>Example</h4><pre>{\n  &quot;a&quot;: 1\n}</pre><table><tbody><tr><td>id</td><td>Code</td></tr></tbody></table>',
    )
  })

  it("treats line breaks inside HTML as spaces, and drops attributes", () => {
    expect(html('<p style="color:red">Two\r\n  lines</p>')).toBe("<div>Two lines</div>")
  })

  it("shows any other tag as text, a script tag included", () => {
    expect(html("<p>Hi</p><script>alert(1)</script><img src=x onerror=alert(1)><seealso cref=\"x\"/>")).toBe(
      "<div>Hi</div>&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;&lt;seealso cref=&quot;x&quot;/&gt;",
    )
  })

  it("closes tags left open and ignores closing tags with no opening one", () => {
    expect(html("<p>Open <strong>bold</p> after</b>")).toBe("<div>Open <strong>bold</strong></div> after")
  })

  it("turns the character codes the catalog uses into characters, once", () => {
    expect(html("<p>It&#x27;s &quot;quoted&quot; &amp; &amp;lt; &unknown;</p>")).toBe("<div>It&#x27;s &quot;quoted&quot; &amp; &amp;lt; &amp;unknown;</div>")
  })

  it("still understands a Markdown heading on its own line", () => {
    expect(html("<b>Note</b><br>\n### Filters\nBy name")).toBe("<strong>Note</strong><br/> <h4>Filters</h4> By name")
  })
})

describe("RichText: Markdown", () => {
  it("makes paragraphs from blank lines and keeps single line breaks", () => {
    expect(html("First line\r\nsecond line\n\nNew paragraph")).toBe("<div>First line<br/>second line</div><div>New paragraph</div>")
  })

  it("makes bullet and numbered lists, and bold from ** and __", () => {
    expect(html("Needs:\n- a **term**\n* a __code__\n1. first\n2. second\nThen done")).toBe(
      "<div>Needs:</div><ul><li>a <strong>term</strong></li><li>a <strong>code</strong></li></ul><ol><li>first</li><li>second</li></ol><div>Then done</div>",
    )
  })

  it("makes headings and dividers", () => {
    expect(html("### Title\nFinds widgets by title.\n\n----\n\n#### Small")).toBe("<h4>Title</h4><div>Finds widgets by title.</div><hr/><h5>Small</h5>")
  })

  it("shows code blocks as written, nothing inside them formatted", () => {
    expect(html('### Name\nBy name.\n```\n/widgets?criteria={"name":"**x**"}\n```\nAfter')).toBe(
      '<h4>Name</h4><div>By name.</div><pre><code>/widgets?criteria={&quot;name&quot;:&quot;**x**&quot;}</code></pre><div>After</div>',
    )
  })

  it("runs an unclosed code block to the end, and copes with one opened part-way along a line or named", () => {
    expect(html("Example:\n```\n/widgets?limit=5")).toBe("<div>Example:</div><pre><code>/widgets?limit=5</code></pre>")
    expect(html("See this. ``` /widgets\n```")).toBe("<div>See this.</div><pre><code>/widgets</code></pre>")
    expect(html("```json\n{}\n```")).toBe("<pre><code>{}</code></pre>")
  })

  it("makes inline code from `x` and from ```x``` on one line, keeping <placeholders> as written", () => {
    expect(html('Use `limit` or ```{"a": "<value>"}```')).toBe('<div>Use <code>limit</code> or <code>{&quot;a&quot;: &quot;&lt;value&gt;&quot;}</code></div>')
  })

  it("still understands inline tags", () => {
    expect(html("Use <strong>care</strong>")).toBe("<div>Use <strong>care</strong></div>")
  })
})
