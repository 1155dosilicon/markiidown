import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripAnsi } from "../src/ansi.ts";
import { convertFileToStaticHtml, splitHighlightedHtmlLines } from "../src/html-template.ts";
import { getRenderedFileLines } from "../src/terminal.ts";
import { fixWindowsTrailingQuote } from "../src/utils.ts";
import { MARKIIDOWN_DOCUMENT_CLASS, shouldBackupAssociation } from "../src/windows-registry.ts";

const temporaryDirectories: string[] = [];

function createTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "markiidown-regressions-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("--numbers e --raw", () => {
  test("--numbers numera linhas de Markdown renderizado sem afetar o sumário", async () => {
    const filePath = join(createTempDir(), "doc.md");
    writeFileSync(filePath, "# Título\n\ntexto\n");

    const plain = await getRenderedFileLines(filePath);
    const numbered = await getRenderedFileLines(filePath, { lineNumbers: true });

    expect(stripAnsi(plain.lines[0])).not.toContain("│");
    expect(stripAnsi(numbered.lines[0])).toMatch(/^ 1 │ /);
    expect(numbered.tableOfContents).toEqual(plain.tableOfContents);
  });

  test("--raw remove a numeração de código, exceto quando --numbers é pedido", async () => {
    const filePath = join(createTempDir(), "x.ts");
    writeFileSync(filePath, "const a = 1;\n");

    const raw = await getRenderedFileLines(filePath, { raw: true });
    const rawNumbered = await getRenderedFileLines(filePath, { raw: true, lineNumbers: true });

    expect(stripAnsi(raw.lines[0])).toBe("const a = 1;");
    expect(stripAnsi(rawNumbered.lines[0])).toMatch(/^ 1 │ const a = 1;$/);
  });
});

describe("exportação HTML de código", () => {
  test("links do sumário apontam para ids existentes", () => {
    const html = convertFileToStaticHtml("function foo() {}\nclass Bar {}\n", "x.ts");
    const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);

    expect(targets).toEqual(["L1", "L2"]);
    for (const target of targets) {
      expect(html).toContain(`id="${target}"`);
    }
  });

  test("realces multilinha ficam bem formados e mantêm a cor em cada linha", () => {
    const lines = splitHighlightedHtmlLines('<span class="hljs-comment">/* a\nb */</span>\nx');

    expect(lines).toEqual([
      '<span class="hljs-comment">/* a</span>',
      '<span class="hljs-comment">b */</span>',
      "x",
    ]);
  });

  test("cada linha numerada do HTML tem spans balanceados", () => {
    const html = convertFileToStaticHtml("/* linha1\nlinha2 */\nconst a = `x\ny`;\n", "y.ts");
    const codeLines = [...html.matchAll(/<div class="code-line"[^>]*>(.*)<\/div>/g)].map((match) => match[1]);

    expect(codeLines.length).toBe(5);
    for (const line of codeLines) {
      expect((line.match(/<span/g) ?? []).length).toBe((line.match(/<\/span>/g) ?? []).length);
    }
    expect(codeLines[1]).toContain('class="hljs-comment"');
  });
});

describe("tabulação no leitor", () => {
  test("arquivos de código não carregam TAB para a tela", async () => {
    const filePath = join(createTempDir(), "main.go");
    writeFileSync(filePath, "func main() {\n\treturn\n}\n");

    const result = await getRenderedFileLines(filePath);
    expect(result.lines.join("\n")).not.toContain("\t");
    expect(stripAnsi(result.lines[1])).toContain("    return");
  });
});

describe("CLI: exportação de binário", () => {
  test("--export recusa arquivos binários sem criar o HTML", async () => {
    const directory = createTempDir();
    const binaryPath = join(directory, "dados.bin");
    const outputPath = join(directory, "saida.html");
    writeFileSync(binaryPath, Buffer.from([0x00, 0xff, 0x00, 0x12]));

    const child = Bun.spawn([process.execPath, "run", "src/index.ts", binaryPath, "-e", outputPath], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(child.stderr).text();

    expect(await child.exited).toBe(1);
    expect(stderr).toContain("binários");
    expect(existsSync(outputPath)).toBe(false);
  });
});

describe("CLI: exportação sobre a origem", () => {
  test("--export recusa gravar por cima do próprio arquivo de origem", async () => {
    const directory = createTempDir();
    const source = join(directory, "pagina.html");
    writeFileSync(source, "<p>original</p>");

    const child = Bun.spawn([process.execPath, "run", "src/index.ts", source, "-e", source], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(child.stderr).text();

    expect(await child.exited).toBe(1);
    expect(stderr).toContain("próprio arquivo de origem");
    expect(await Bun.file(source).text()).toBe("<p>original</p>");
  });
});

describe("integração com Windows", () => {
  test("não sobrescreve o backup quando a extensão já aponta para o MarkiiDown", () => {
    expect(shouldBackupAssociation(MARKIIDOWN_DOCUMENT_CLASS)).toBe(false);
    expect(shouldBackupAssociation("VSCode.md")).toBe(true);
    expect(shouldBackupAssociation(null)).toBe(true);
  });

  test("corrige a aspa final de \"%V\" na raiz do disco", () => {
    expect(fixWindowsTrailingQuote('C:"', "win32")).toBe("C:\\");
    expect(fixWindowsTrailingQuote("C:\\pasta", "win32")).toBe("C:\\pasta");
    expect(fixWindowsTrailingQuote('C:"', "linux")).toBe('C:"');
  });
});

describe("leitor: sumário e busca", () => {
  test("comentários dentro de blocos de código não entram no sumário do Markdown", async () => {
    const filePath = join(createTempDir(), "doc.md");
    writeFileSync(
      filePath,
      "# Título\n\n```bash\n# instala dependências\nnpm i\n```\n\n- item\n\n  ```python\n  # comentário em lista\n  ```\n\n## Seção\n"
    );
    const result = await getRenderedFileLines(filePath);

    expect(result.tableOfContents.map((item) => item.title)).toEqual(["Título", "Seção"]);
    // O marcador interno dos blocos de código nunca chega à tela
    expect(result.lines.some((line) => /[\u0080-\u009F]/.test(line))).toBe(false);
    expect(result.lines.map(stripAnsi).some((line) => line.includes("# instala dependências"))).toBe(true);
  });

  test("títulos aparecem sem os '#' e continuam no sumário", async () => {
    const filePath = join(createTempDir(), "titulos.md");
    writeFileSync(filePath, "# Um\n\n## Dois\n\n### Três\n\n#### Quatro\n\nTexto com # no meio.\n");
    const result = await getRenderedFileLines(filePath);
    const plain = result.lines.map(stripAnsi);

    expect(plain.some((line) => /^\s*#{1,6} /.test(line))).toBe(false);
    expect(plain.some((line) => line.trim() === "Dois")).toBe(true);
    expect(plain.some((line) => line.includes("Texto com # no meio."))).toBe(true);
    expect(result.tableOfContents.map((item) => item.title)).toEqual(["Um", "Dois", "Três", "Quatro"]);
    expect(result.lines.some((line) => /[\u0080-\u009F]/.test(line))).toBe(false);
  });

  test("a busca não enxerga a numeração de linhas dos arquivos de código", async () => {
    const filePath = join(createTempDir(), "busca.ts");
    writeFileSync(filePath, Array.from({ length: 15 }, () => 'let v = "x";').join("\n"));
    const result = await getRenderedFileLines(filePath);

    expect(result.searchLines).toHaveLength(result.lines.length);
    expect(result.searchLines.filter((line) => line.includes("1"))).toHaveLength(0);
    expect(result.searchLines[0]).toBe('let v = "x";');
  });

  test("sumário de código ignora const/type locais e usa a palavra-chave no título", async () => {
    const filePath = join(createTempDir(), "consts.ts");
    writeFileSync(
      filePath,
      "export const LIMITE = 10;\nexport function soma() {\n  const a = 1;\n  type Local = string;\n}\nclass Pilha {\n  def() {}\n}\n"
    );
    const result = await getRenderedFileLines(filePath);
    expect(result.tableOfContents.map((item) => item.title)).toEqual(["const LIMITE", "function soma", "class Pilha"]);
  });

  test("arquivo Markdown salvo em ANSI aparece com os acentos", async () => {
    const filePath = join(createTempDir(), "ansi.md");
    writeFileSync(filePath, Buffer.from([0x23, 0x20, 0x41, 0xe7, 0xe3, 0x6f])); // "# Ação" em Windows-1252
    const result = await getRenderedFileLines(filePath);
    expect(result.tableOfContents.map((item) => item.title)).toEqual(["Ação"]);
  });
});

describe("exportação HTML: ids dos cabeçalhos", () => {
  test("mantêm letras acentuadas e de outros alfabetos", () => {
    const html = convertFileToStaticHtml("# Instalação\n\n## Configuração Avançada\n\n# 日本語\n", "x.md");
    const ids = [...html.matchAll(/<h\d id="([^"]*)"/g)].map((match) => match[1]);
    expect(ids).toEqual(["instalação", "configuração-avançada", "日本語"]);
  });
});
