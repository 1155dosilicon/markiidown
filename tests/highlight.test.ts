import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULT_CONTEXT, sgrOpen, stripAnsi, updateContext } from "../src/ansi.ts";
import { highlightToAnsiLines, hljsHtmlToAnsiLines, isHighlightLanguage } from "../src/highlight.ts";
import { convertFileToStaticHtml, convertMarkdownToStaticHtml } from "../src/html-template.ts";
import { detectFileType, resolveHighlightLanguage } from "../src/utils.ts";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** Renderiza arquivos num processo com cores forçadas e captura o stderr. */
async function renderWithColors(filePaths: string[]): Promise<{ lines: Record<string, string[]>; stderr: string }> {
  const script = [
    `import { getRenderedFileLines } from ${JSON.stringify(resolve(import.meta.dir, "..", "src", "terminal.ts"))};`,
    "const out = {};",
    `for (const file of ${JSON.stringify(filePaths)}) out[file] = (await getRenderedFileLines(file, { width: 80 })).lines;`,
    "console.log(JSON.stringify(out));",
  ].join(" ");
  const env = { ...process.env, FORCE_COLOR: "1" };
  delete env.NO_COLOR;
  const child = Bun.spawn([process.execPath, "-e", script], { env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(await child.exited).toBe(0);
  return { lines: JSON.parse(stdout), stderr };
}

/** Cor de texto efetiva de cada caractere visível. */
function foregroundPerCharacter(line: string): (string | null)[] {
  const colors: (string | null)[] = [];
  let context = DEFAULT_CONTEXT;
  for (const part of line.split(/(\x1B\[[0-9;]*m)/)) {
    if (part.startsWith("\x1B[")) context = updateContext(context, part);
    else for (let i = 0; i < part.length; i++) colors.push(context.sgr.fg);
  }
  return colors;
}

function endsClean(line: string): boolean {
  let context = DEFAULT_CONTEXT;
  for (const match of line.matchAll(/\x1B\[[0-9;]*m/g)) context = updateContext(context, match[0]);
  return sgrOpen(context.sgr) === "";
}

describe("resolveHighlightLanguage", () => {
  test("usa a linguagem quando o highlight.js a conhece", () => {
    expect(resolveHighlightLanguage("ts", isHighlightLanguage)).toBe("ts");
    expect(resolveHighlightLanguage("Python extra", isHighlightLanguage)).toBe("python");
  });

  test("cai para a gramática mais próxima quando não há uma própria", () => {
    expect(resolveHighlightLanguage("jsonc", isHighlightLanguage)).toBeDefined();
    expect(resolveHighlightLanguage("vue", isHighlightLanguage)).toBe("xml");
    expect(resolveHighlightLanguage("svelte", isHighlightLanguage)).toBe("xml");
    expect(resolveHighlightLanguage("sass", isHighlightLanguage)).toBe("scss");
  });

  test("retorna undefined para linguagem desconhecida, vazia ou texto puro", () => {
    expect(resolveHighlightLanguage("mermaid", isHighlightLanguage)).toBeUndefined();
    expect(resolveHighlightLanguage("", isHighlightLanguage)).toBeUndefined();
    expect(resolveHighlightLanguage(undefined, isHighlightLanguage)).toBeUndefined();
    expect(resolveHighlightLanguage("plaintext", isHighlightLanguage)).toBeUndefined();
  });

  test("toda linguagem do mapa de extensões tem gramática", () => {
    const extensions = [
      ".ts", ".js", ".json", ".jsonc", ".yaml", ".toml", ".xml", ".html", ".css", ".scss", ".sass", ".less",
      ".py", ".rs", ".go", ".c", ".cpp", ".cs", ".java", ".kt", ".swift", ".php", ".rb", ".sql", ".lua",
      ".r", ".dart", ".sh", ".bat", ".ps1", ".diff",
    ];
    for (const extension of extensions) {
      const { language } = detectFileType(`arquivo${extension}`);
      expect(resolveHighlightLanguage(language, isHighlightLanguage)).toBeDefined();
    }
    for (const fileName of ["Dockerfile", "Makefile"]) {
      expect(resolveHighlightLanguage(detectFileType(fileName).language, isHighlightLanguage)).toBeDefined();
    }
  });
});

describe("HTML do highlight.js → ANSI", () => {
  test("comentário de várias linhas mantém a cor em cada linha e cada linha fecha o que abriu", () => {
    const lines = hljsHtmlToAnsiLines('<span class="hljs-comment">/* a\nb */</span>\n<span class="hljs-keyword">if</span> x');
    expect(lines.map(stripAnsi)).toEqual(["/* a", "b */", "if x"]);
    expect(lines[0].startsWith("\x1B[90m")).toBe(true);
    expect(lines[1].startsWith("\x1B[90m")).toBe(true);
    expect(lines.every(endsClean)).toBe(true);
  });

  test("entidades do HTML voltam a ser caracteres", () => {
    expect(hljsHtmlToAnsiLines("a &lt;b&gt; &amp;&amp; &quot;c&quot; &#x27;d&#x27;").map(stripAnsi)).toEqual(['a <b> && "c" \'d\'']);
  });

  test("linguagem desconhecida devolve null (o bloco fica sem cores)", () => {
    expect(highlightToAnsiLines("graph TD; A-->B", "mermaid")).toBeNull();
    expect(highlightToAnsiLines("x", undefined)).toBeNull();
  });

  test("opções --longas em shell ficam inteiras numa cor só", () => {
    for (const language of ["powershell", "bash"]) {
      const [line] = highlightToAnsiLines("markiidown.exe --install --export=manual.html", language)!;
      const plain = stripAnsi(line);
      expect(plain).toBe("markiidown.exe --install --export=manual.html");
      const colors = foregroundPerCharacter(line);
      for (const option of ["--install", "--export=manual.html"]) {
        const start = plain.indexOf(option);
        expect(colors.slice(start, start + option.length).every((color) => color === "33")).toBe(true);
      }
    }
  });
});

describe("realce no terminal", () => {
  test("arquivos de exemplo saem coloridos e sem avisos", async () => {
    const samples = ["app.ts", "script.py", "main.rs", "server.go", "query.sql", "config.yaml", "Dockerfile", "programa.cpp"].map((name) =>
      resolve(import.meta.dir, "..", "exemplos", name)
    );
    const { lines, stderr } = await renderWithColors(samples);
    expect(stderr).toBe("");
    for (const sample of samples) {
      const code = lines[sample].map((line) => line.split(" │ ").slice(1).join(" │ ")).join("\n");
      expect(code).toMatch(/\x1B\[(?:\d+;)*(?:3[0-7]|9[0-7])m/);
      expect(lines[sample].every(endsClean)).toBe(true);
    }
  });

  test("bloco Markdown com linguagem desconhecida fica neutro; vue usa a gramática XML", async () => {
    const directory = mkdtempSync(join(tmpdir(), "markiidown-highlight-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "blocos.md");
    writeFileSync(filePath, "# T\n\n```mermaid\ngraph TD; A-->B\n```\n\n```vue\n<template><div/></template>\n```\n");
    const { lines, stderr } = await renderWithColors([filePath]);
    expect(stderr).toBe("");
    expect(lines[filePath].find((line) => line.includes("graph TD"))).not.toContain("\x1B[");
    expect(lines[filePath].find((line) => line.includes("template"))).toContain("\x1B[");
  });
});

describe("realce no HTML", () => {
  test("usa os mesmos apelidos de linguagem do terminal", () => {
    expect(convertMarkdownToStaticHtml("```vue\n<template><div/></template>\n```\n", "doc.md")).toContain("hljs-tag");
  });

  test("arquivos .sass são realçados como SCSS", () => {
    expect(convertFileToStaticHtml("$cor: red\n.a\n  color: $cor\n", "estilo.sass")).toContain("hljs-");
  });
});
