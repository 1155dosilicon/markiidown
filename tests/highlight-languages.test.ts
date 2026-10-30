import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { supportsLanguage } from "cli-highlight";
import hljs from "highlight.js";
import { convertFileToStaticHtml, convertMarkdownToStaticHtml } from "../src/html-template.ts";
import { detectFileType, resolveHighlightLanguage } from "../src/utils.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const isHljsLanguage = (name: string) => !!hljs.getLanguage(name);

/** Renderiza arquivos em um processo com cores forçadas e captura o stderr. */
async function renderWithColors(filePaths: string[]): Promise<{ lines: Record<string, string[]>; stderr: string }> {
  const script = [
    "import { getRenderedFileLines } from './src/terminal.ts';",
    "const out = {};",
    `for (const file of ${JSON.stringify(filePaths)}) out[file] = (await getRenderedFileLines(file)).lines;`,
    "console.log(JSON.stringify(out));",
  ].join(" ");
  const childEnvironment = { ...process.env, FORCE_COLOR: "1" };
  delete childEnvironment.NO_COLOR;
  const child = Bun.spawn([process.execPath, "-e", script], {
    cwd: process.cwd(),
    env: childEnvironment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(await child.exited).toBe(0);
  return { lines: JSON.parse(stdout), stderr };
}

describe("resolveHighlightLanguage", () => {
  test("usa a linguagem quando o motor a conhece", () => {
    expect(resolveHighlightLanguage("ts", supportsLanguage)).toBe("ts");
    expect(resolveHighlightLanguage("Python extra", supportsLanguage)).toBe("python");
  });

  test("cai para a gramática mais próxima quando não há uma própria", () => {
    expect(resolveHighlightLanguage("jsonc", supportsLanguage)).toBe("json");
    expect(resolveHighlightLanguage("vue", supportsLanguage)).toBe("xml");
    expect(resolveHighlightLanguage("sass", isHljsLanguage)).toBe("scss");
  });

  test("retorna undefined para linguagem desconhecida, vazia ou texto puro", () => {
    expect(resolveHighlightLanguage("mermaid", supportsLanguage)).toBeUndefined();
    expect(resolveHighlightLanguage("", supportsLanguage)).toBeUndefined();
    expect(resolveHighlightLanguage(undefined, supportsLanguage)).toBeUndefined();
    expect(resolveHighlightLanguage("plaintext", supportsLanguage)).toBeUndefined();
  });
});

describe("mapa de extensões", () => {
  test("toda linguagem mapeada existe nos dois motores (terminal e HTML)", () => {
    const extensions = [
      ".ts", ".js", ".json", ".jsonc", ".yaml", ".toml", ".xml", ".html", ".css", ".scss", ".sass", ".less",
      ".py", ".rs", ".go", ".c", ".cpp", ".cs", ".java", ".kt", ".swift", ".php", ".rb", ".sql", ".lua",
      ".r", ".dart", ".sh", ".bat", ".ps1", ".diff",
    ];
    for (const extension of extensions) {
      const { language } = detectFileType(`arquivo${extension}`);
      expect(resolveHighlightLanguage(language, supportsLanguage)).toBeDefined();
      expect(resolveHighlightLanguage(language, isHljsLanguage)).toBeDefined();
    }
    for (const fileName of ["Dockerfile", "Makefile"]) {
      const { language } = detectFileType(fileName);
      expect(resolveHighlightLanguage(language, supportsLanguage)).toBeDefined();
    }
  });
});

describe("realce no terminal", () => {
  test("arquivos de exemplo saem coloridos e sem avisos do highlight.js", async () => {
    const samples = ["app.ts", "script.py", "main.rs", "server.go", "query.sql", "config.yaml", "Dockerfile", "programa.cpp"]
      .map((name) => resolve(process.cwd(), "exemplos", name));

    const { lines, stderr } = await renderWithColors(samples);

    expect(stderr).toBe("");
    for (const sample of samples) {
      // Remove o gutter (sempre colorido) e procura cor no próprio código
      const codeColors = lines[sample].map((line) => line.split(" │ ").slice(1).join(" │ ")).join("\n");
      expect(codeColors).toMatch(/\x1B\[(?:3[0-7]|9[0-7])m/);
    }
  });

  test("bloco de Markdown com linguagem desconhecida fica neutro e não imprime aviso", async () => {
    const directory = mkdtempSync(join(tmpdir(), "markiidown-highlight-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "blocos.md");
    const zigPath = join(directory, "main.zig");
    writeFileSync(filePath, "# T\n\n```mermaid\ngraph TD; A-->B\n```\n\n```vue\n<template><div/></template>\n```\n");
    writeFileSync(zigPath, "pub fn main() void {}\n");

    const { lines, stderr } = await renderWithColors([filePath, zigPath]);

    expect(stderr).toBe("");
    const mermaidLine = lines[filePath].find((line) => line.includes("graph TD"));
    const vueLine = lines[filePath].find((line) => line.includes("template"));
    expect(mermaidLine).not.toContain("\x1B[");
    expect(vueLine).toContain("\x1B[");
  });
});

describe("realce no HTML", () => {
  test("usa os mesmos apelidos de linguagem do terminal", () => {
    const html = convertMarkdownToStaticHtml("```vue\n<template><div/></template>\n```\n", "doc.md");
    expect(html).toContain("hljs-tag");
  });

  test("arquivos .sass são realçados como SCSS", () => {
    const html = convertFileToStaticHtml("$cor: red\n.a\n  color: $cor\n", "estilo.sass");
    expect(html).toContain("hljs-");
  });
});
