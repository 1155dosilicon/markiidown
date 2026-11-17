import { describe, expect, test } from "bun:test";
import { createColors } from "picocolors";
import { DEFAULT_CONTEXT, sgrOpen, stripAnsi, updateContext } from "../src/ansi.ts";
import { decodeEntities, fitColumns, frontMatterToCodeBlock, renderMarkdownToLines } from "../src/markdown-terminal.ts";

const color = createColors(true);
const plain = createColors(false);

function render(markdown: string, width = 60, options: { colors?: boolean; hyperlinks?: boolean } = {}) {
  return renderMarkdownToLines(markdown, {
    width,
    hyperlinks: options.hyperlinks ?? false,
    colors: options.colors ? color : plain,
  });
}

const text = (markdown: string, width = 60) => render(markdown, width).lines.join("\n");

function endsClean(line: string): boolean {
  let context = DEFAULT_CONTEXT;
  for (const match of line.matchAll(/\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1B]*(?:\x07|\x1B\\))/g)) context = updateContext(context, match[0]);
  return sgrOpen(context.sgr) === "" && context.link === null;
}

describe("títulos", () => {
  test("aparecem sem '#', entram no sumário com nível e linha", () => {
    const result = render("# Um\n\ntexto\n\n## Dois\n\n### Três\n\n#### Quatro\n\nTexto com # no meio.");
    expect(result.lines.some((line) => /^#/.test(line))).toBe(false);
    expect(result.headings.map(({ title, level }) => [title, level])).toEqual([
      ["Um", 1],
      ["Dois", 2],
      ["Três", 3],
      ["Quatro", 4],
    ]);
    for (const heading of result.headings) expect(result.lines[heading.lineIndex]).toBe(heading.title);
  });

  test("cada nível tem sua cor", () => {
    const { lines } = render("# A\n\n## B\n\n### C\n\n#### D", 40, { colors: true });
    expect(lines[0]).toContain("\x1B[35m");
    expect(lines[2]).toContain("\x1B[32m");
    expect(lines[4]).toContain("\x1B[33m");
    expect(lines[6]).toContain("\x1B[36m");
  });

  test("comentários de blocos de código não viram títulos", () => {
    const result = render("# Título\n\n```bash\n# instala dependências\nnpm i\n```\n\n- item\n\n  ```python\n  # comentário\n  ```\n\n## Seção");
    expect(result.headings.map((heading) => heading.title)).toEqual(["Título", "Seção"]);
    expect(result.lines.some((line) => line.includes("# instala dependências"))).toBe(true);
  });

  test("front matter vira bloco YAML, não título", () => {
    const result = render("---\ntitle: Teste\ntags: [a]\n---\n\n# Real");
    expect(result.headings.map((heading) => heading.title)).toEqual(["Real"]);
    expect(result.lines).toContain("  title: Teste");
    expect(frontMatterToCodeBlock("sem front matter")).toBe("sem front matter");
  });
});

describe("parágrafos", () => {
  test("quebras simples viram espaço e o texto é quebrado na largura", () => {
    const lines = render("um dois\ntres quatro cinco seis sete oito nove dez", 20).lines;
    expect(lines.every((line) => Bun.stringWidth(line) <= 20)).toBe(true);
    expect(lines.join(" ").replace(/\s+/g, " ")).toBe("um dois tres quatro cinco seis sete oito nove dez");
  });

  test("texto pesquisável sem prefixos e linhas de continuação marcadas", () => {
    const result = render("- item longo que vai quebrar em duas linhas\n\n> citação longa que também quebra aqui", 22);
    const itemLines = result.lines.filter((line) => /^(•| )/.test(line));
    expect(itemLines.length).toBeGreaterThan(1);
    expect(result.searchLines[0]).toBe("item longo que vai");
    expect(result.continued[0]).toBe(false);
    expect(result.continued[1]).toBe(true);
    const quoteStart = result.lines.findIndex((line) => line.startsWith("│"));
    expect(result.searchLines[quoteStart].startsWith("citação")).toBe(true);
    expect(result.continued[quoteStart]).toBe(false);
    expect(result.continued[quoteStart + 1]).toBe(true);
  });

  test("quebra forçada (dois espaços ou \\) inicia nova linha", () => {
    expect(render("a  \nb\\\nc").lines).toEqual(["a", "b", "c"]);
  });

  test("estilo que atravessa a quebra continua em cada linha (antes sumia ao rolar)", () => {
    const { lines } = render("x **negrito que vai quebrar em outra linha** y", 18, { colors: true });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[1].startsWith("\x1B[1m")).toBe(true);
    expect(lines.every(endsClean)).toBe(true);
  });

  test("entidades HTML são decodificadas, mas controles (ESC) nunca", () => {
    expect(text("AT&amp;T &copy; &#233; &#x1F600; &#27;[31m")).toBe("AT&T © é 😀 &#27;[31m");
    expect(decodeEntities("&#0; &#x9F; &#xD800; &naoexiste;")).toBe("&#0; &#x9F; &#xD800; &naoexiste;");
  });

  test("emoji :shortcode: no texto, mas não dentro de código", () => {
    expect(text("ok :white_check_mark: e `:x:`")).toBe("ok ✅ e :x:");
  });
});

describe("listas", () => {
  test("marcadores, numeração, tarefas e recuo das linhas de continuação", () => {
    const lines = render("- um item comprido que precisa quebrar a linha\n- dois\n\n3. três\n4. quatro\n\n- [x] feito\n- [ ] pendente", 25).lines;
    expect(lines[0]).toBe("• um item comprido que");
    expect(lines[1]).toBe("  precisa quebrar a linha");
    expect(lines).toContain("• dois");
    expect(lines).toContain("3. três");
    expect(lines).toContain("4. quatro");
    expect(lines).toContain("[x] feito");
    expect(lines).toContain("[ ] pendente");
  });

  test("listas aninhadas recuam e trocam o marcador", () => {
    const lines = render("- pai\n  - filho\n    - neto").lines;
    expect(lines).toEqual(["• pai", "  ◦ filho", "    ▪ neto"]);
  });

  test("números alinhados à direita quando passam de 9", () => {
    const markdown = Array.from({ length: 10 }, (_, index) => `${index + 1}. item`).join("\n");
    const lines = render(markdown).lines;
    expect(lines[0]).toBe(" 1. item");
    expect(lines[9]).toBe("10. item");
  });
});

describe("citações e alertas", () => {
  test("citação ganha barra e continua marcada em todas as linhas", () => {
    const lines = render("> primeira linha da citação que é longa o bastante para quebrar", 24).lines;
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.startsWith("│ "))).toBe(true);
  });

  test("citação em itálico mesmo com negrito dentro (antes um ESC[0m apagava o estilo)", () => {
    const [line] = render("> texto **forte** fim", 60, { colors: true }).lines;
    expect(line).toContain("\x1B[3m");
    expect(line).toContain("\x1B[1;3mforte");
    expect(line).toContain("\x1B[3m fim");
    expect(line).not.toMatch(/^\x1B\[0m/);
  });

  test("os cinco alertas do GitHub aparecem com rótulo, sem o marcador [!TIPO]", () => {
    const labels: Record<string, string> = { NOTE: "Nota", TIP: "Dica", IMPORTANT: "Importante", WARNING: "Atenção", CAUTION: "Cuidado" };
    for (const [type, label] of Object.entries(labels)) {
      const lines = render(`> [!${type}]\n> Corpo do alerta.`).lines;
      expect(lines).toEqual([`│ ${label}`, "│ Corpo do alerta."]);
    }
  });
});

describe("tabelas", () => {
  test("alinhamento e código com ':' no cabeçalho (antes aparecia *#COLON|*)", () => {
    const lines = render("| `a:b` | centro | dir |\n|:---|:---:|---:|\n| 1 | x | 3 |").lines;
    expect(lines.join("\n")).not.toContain("COLON");
    expect(lines[1]).toBe("│ a:b │ centro │ dir │");
    expect(lines[3]).toBe("│ 1   │   x    │   3 │");
  });

  test("tabela larga é reduzida para caber e as células quebram", () => {
    const long = "palavra ".repeat(12).trim();
    const lines = render(`| A | B |\n|---|---|\n| curto | ${long} |`, 40).lines;
    expect(lines.every((line) => Bun.stringWidth(line) <= 40)).toBe(true);
    expect(lines.join(" ")).toContain("curto");
  });

  test("fitColumns encolhe as colunas largas primeiro", () => {
    expect(fitColumns([5, 50], 30)).toEqual([5, 25]);
    expect(fitColumns([10, 10], 30)).toEqual([10, 10]);
  });
});

describe("links, imagens, HTML e linhas", () => {
  test("link mostra o endereço entre parênteses; autolink não repete", () => {
    expect(text("[site](https://exemplo.com) e https://direto.com")).toBe("site (https://exemplo.com) e https://direto.com");
  });

  test("com hyperlinks, links http viram clicáveis (OSC 8) e a linha fecha o link", () => {
    const { lines } = render("[site](https://exemplo.com) [rel](./a.md)", 60, { colors: true, hyperlinks: true });
    expect(lines[0]).toContain("\x1B]8;;https://exemplo.com\x07");
    expect(stripAnsi(lines[0])).toBe("site rel (./a.md)");
    expect(lines.every(endsClean)).toBe(true);
  });

  test("imagem vira descrição; <br> quebra a linha; comentários somem", () => {
    expect(text('![logo da empresa](logo.png "t")')).toBe("[imagem: logo da empresa] (logo.png)");
    expect(render("a<br>b").lines).toEqual(["a", "b"]);
    expect(text("<!-- escondido -->\n\nvisível")).toBe("visível");
  });

  test("linha horizontal ocupa a largura (antes sumia fora do terminal)", () => {
    expect(render("---", 30).lines).toEqual(["─".repeat(30)]);
    expect(render("---", Infinity).lines).toEqual(["─".repeat(80)]);
  });

  test("toda linha colorida termina sem estilo aberto", async () => {
    const markdown = await Bun.file(new URL("../exemplo.md", import.meta.url)).text();
    const { lines } = render(markdown, 70, { colors: true, hyperlinks: true });
    expect(lines.every(endsClean)).toBe(true);
  });
});
