import { describe, expect, test } from "bun:test";
import { convertMarkdownToStaticHtml } from "../src/html-template.ts";

describe("convertMarkdownToStaticHtml", () => {
  test("gera estilos de sintaxe sem dependência de CDN", () => {
    const html = convertMarkdownToStaticHtml("```ts\nconst ok = true;\n```", "exemplo.md");
    expect(html).not.toContain("cdnjs.cloudflare.com");
    expect(html).toContain(".hljs-keyword");
  });

  test("escapa nome de arquivo e HTML bruto do Markdown", () => {
    const html = convertMarkdownToStaticHtml("<script>alert('x')</script>", "<img onerror=alert(1)>.md");
    expect(html).not.toContain("<script>alert('x')</script>");
    expect(html).not.toContain("<img onerror=alert(1)>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img onerror=alert(1)&gt;.md");
  });

  test("remove protocolos perigosos de links", () => {
    const html = convertMarkdownToStaticHtml("[clique](javascript:alert(1))", "links.md");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("clique");
  });

  test("renderiza alertas e slugs duplicados corretamente", () => {
    const markdown = "# A & B\n\n# A & B\n\n> [!TIP]\n> Use **isto**.";
    const html = convertMarkdownToStaticHtml(markdown, "alertas.md");
    expect(html).toContain('id="a-b"');
    expect(html).toContain('id="a-b-2"');
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("A &amp;amp; B");
    expect(html).toContain("markdown-alert-tip");
    expect(html).toContain("<strong>isto</strong>");
  });
});
