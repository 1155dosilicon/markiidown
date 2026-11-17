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

  test("blocos de código mantêm a classe hljs (o renderizador do marked-highlight não é substituído)", () => {
    const html = convertMarkdownToStaticHtml("```ts\nconst a = 1;\n```\n\n```\nsem linguagem\n```", "x.md");
    expect(html).toContain('<code class="hljs language-ts">');
    expect(html).toContain('<code class="hljs">');
  });

  test("impressão sempre em cores claras e sem os botões e o sumário", () => {
    const html = convertMarkdownToStaticHtml("# T", "x.md");
    const print = html.slice(html.indexOf("@media print"));
    expect(print).toContain("--text-main: #000000");
    expect(print).toContain("aside { display: none; }");
  });

  test("ids únicos mesmo quando um título já se chama 'a-1'", () => {
    const html = convertMarkdownToStaticHtml("# a-1\n\n# a\n\n# a\n", "x.md");
    const ids = [...html.matchAll(/<h1 id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(["a-1", "a", "a-2"]);
  });

  test("ids iguais aos do GitHub: links de sumário escritos para o GitHub funcionam", () => {
    const html = convertMarkdownToStaticHtml("## 🚀 Instalação rápida\n\n## Perguntas & Respostas\n\n## Dúvidas?\n", "x.md");
    const ids = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(["-instalação-rápida", "perguntas--respostas", "dúvidas"]);
  });

  test("comentários HTML somem e front matter vira bloco YAML", () => {
    const html = convertMarkdownToStaticHtml("---\ntitle: X\n---\n\n<!-- nota interna -->\n\nTexto", "x.md");
    expect(html).not.toContain("nota interna");
    expect(html).toContain("language-yaml");
    expect(html).not.toContain("<hr>");
  });

  test("tamanho no cabeçalho é o do arquivo informado", () => {
    expect(convertMarkdownToStaticHtml("abc", "x.md", 2048)).toContain("📊 2 KB");
  });

  test("renderiza alertas e slugs duplicados corretamente", () => {
    const markdown = "# A & B\n\n# A & B\n\n> [!TIP]\n> Use **isto**.";
    const html = convertMarkdownToStaticHtml(markdown, "alertas.md");
    expect(html).toContain('id="a--b"');
    expect(html).toContain('id="a--b-1"');
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("A &amp;amp; B");
    expect(html).toContain("markdown-alert-tip");
    expect(html).toContain("<strong>isto</strong>");
  });
});
