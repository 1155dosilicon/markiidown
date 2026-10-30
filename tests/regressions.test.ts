import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectLineEnding,
  displayColumn,
  indexFromDisplayColumn,
  nextGraphemeIndex,
  previousGraphemeIndex,
  runInteractiveEditor,
  visibleLineSegment,
} from "../src/editor.ts";
import { convertFileToStaticHtml, splitHighlightedHtmlLines } from "../src/html-template.ts";
import { expandTabsAnsi, stripAnsi, wrapAnsi } from "../src/interactive.ts";
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
  test("expandTabsAnsi respeita paradas de tabulação e preserva ANSI", () => {
    expect(expandTabsAnsi("\tx")).toBe("    x");
    expect(expandTabsAnsi("ab\tc")).toBe("ab  c");
    expect(expandTabsAnsi("\x1B[33m\t\x1B[39mx")).toBe("\x1B[33m    \x1B[39mx");
  });

  test("linhas com TAB não ultrapassam a largura após a quebra", () => {
    const wrapped = wrapAnsi(expandTabsAnsi("\t\t\treturn x + y + z + w"), 10);
    expect(wrapped.every((line) => Bun.stringWidth(stripAnsi(line)) <= 10)).toBe(true);
  });

  test("arquivos de código não carregam TAB para a tela", async () => {
    const filePath = join(createTempDir(), "main.go");
    writeFileSync(filePath, "func main() {\n\treturn\n}\n");

    const result = await getRenderedFileLines(filePath);
    expect(result.lines.join("\n")).not.toContain("\t");
    expect(stripAnsi(result.lines[1])).toContain("    return");
  });
});

describe("editor: colunas visuais", () => {
  test("converte índice em coluna visual com TAB e emoji", () => {
    expect(displayColumn("\tab", 1)).toBe(4);
    expect(displayColumn("a\tb", 2)).toBe(4);
    expect(displayColumn("😀x", 2)).toBe(2);
    expect(indexFromDisplayColumn("\tab", 5)).toBe(2);
    expect(indexFromDisplayColumn("😀x", 1)).toBe(0);
  });

  test("navega por grafemas sem partir emoji", () => {
    const line = "a😀b";
    expect(nextGraphemeIndex(line, 1)).toBe(3);
    expect(previousGraphemeIndex(line, 3)).toBe(1);
    expect(previousGraphemeIndex(line, 1)).toBe(0);
  });

  test("recorta a janela visível expandindo TAB", () => {
    expect(visibleLineSegment("\tabc", 0, 6)).toBe("    ab");
    expect(visibleLineSegment("\tabc", 4, 2)).toBe("ab");
    expect(visibleLineSegment("界x", 1, 2)).toBe(" x");
  });

  test("preserva a quebra de linha original", () => {
    expect(detectLineEnding("a\r\nb")).toBe("\r\n");
    expect(detectLineEnding("a\nb")).toBe("\n");
  });

  test("recusa abrir arquivo binário", async () => {
    const filePath = join(createTempDir(), "imagem.png");
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));

    await expect(runInteractiveEditor({ filePath })).rejects.toThrow("binários");
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
