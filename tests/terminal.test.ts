import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRenderedMarkdownLines } from "../src/terminal.ts";
import { stripAnsi, wrapAnsi } from "../src/interactive.ts";

const temporaryDirectories: string[] = [];

function expectTokenFullyYellow(line: string, token: string, width: number): void {
  const wrapped = wrapAnsi(line, width).join("");
  const plainCharacters: string[] = [];
  const foregrounds: Array<number | null> = [];
  let foreground: number | null = null;
  let offset = 0;

  while (offset < wrapped.length) {
    const sgr = wrapped.slice(offset).match(/^\x1B\[([0-9;]*)m/);
    if (sgr) {
      const parameters = sgr[1] === "" ? [0] : sgr[1].split(";").map(Number);
      for (const parameter of parameters) {
        if (parameter === 0 || parameter === 39) foreground = null;
        else if ((parameter >= 30 && parameter <= 37) || (parameter >= 90 && parameter <= 97)) {
          foreground = parameter;
        }
      }
      offset += sgr[0].length;
      continue;
    }

    plainCharacters.push(wrapped[offset]);
    foregrounds.push(foreground);
    offset++;
  }

  const plainText = plainCharacters.join("");
  let tokenIndex = plainText.indexOf(token);
  let occurrenceCount = 0;
  while (tokenIndex >= 0) {
    expect(foregrounds.slice(tokenIndex, tokenIndex + token.length)).toEqual(
      Array(token.length).fill(33)
    );
    occurrenceCount++;
    tokenIndex = plainText.indexOf(token, tokenIndex + token.length);
  }
  expect(occurrenceCount).toBeGreaterThan(0);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("getRenderedMarkdownLines", () => {
  test("inclui apenas cabeçalhos reais no sumário", async () => {
    const directory = mkdtempSync(join(tmpdir(), "markiidown-terminal-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "documento.md");
    writeFileSync(filePath, "# Título\n\n| Coluna | Valor |\n| --- | --- |\n| Item | Sim |\n\nSubtítulo\n---\n");

    const result = await getRenderedMarkdownLines(filePath);
    expect(result.tableOfContents.map((item) => item.title)).toEqual(["Título", "Subtítulo"]);
  });

  test("neutraliza sequências de controle vindas do documento", async () => {
    const directory = mkdtempSync(join(tmpdir(), "markiidown-terminal-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "controle.md");
    writeFileSync(filePath, "# Seguro\n\n\x1B]0;título malicioso\x07");

    const result = await getRenderedMarkdownLines(filePath);
    expect(result.lines.join("\n")).not.toContain("\x1B]0;");
  });

  test("não tenta detectar linguagem em blocos sem identificador", async () => {
    const directory = mkdtempSync(join(tmpdir(), "markiidown-terminal-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "realce.md");
    writeFileSync(
      filePath,
      "# Cabeçalho `--install`\n\n1. **Instalador (`--install`):** texto comum\n   - Aninhado `--install`\n\n> Citação `--install`\n\n| Opção | Estado |\n| --- | --- |\n| `--install` | ok |\n\nParágrafo com `--install` e tensão.\n\nTexto normal com tensão, an, e, a, c e en.\n\n```\nwindows-registry.ts # Registro no menu de contexto e teste\n```\n\n```ts\nconst value: string = 'ok';\n```\n\n```powershell\n.\\dist\\markiidown.exe --install --export=manual.html\n```\n"
    );

    const script = [
      "import { getRenderedMarkdownLines } from './src/terminal.ts';",
      `const result = await getRenderedMarkdownLines(${JSON.stringify(filePath)});`,
      "console.log(JSON.stringify(result.lines));",
    ].join(" ");
    const childEnvironment = { ...process.env, FORCE_COLOR: "1" };
    delete childEnvironment.NO_COLOR;
    const processResult = Bun.spawn([process.execPath, "-e", script], {
      cwd: process.cwd(),
      env: childEnvironment,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(processResult.stdout).text();
    const stderr = await new Response(processResult.stderr).text();
    expect(await processResult.exited).toBe(0);
    expect(stderr).toBe("");

    const lines = JSON.parse(stdout) as string[];
    const untypedLine = lines.find((line) => line.includes("windows-registry"));
    const typedLine = lines.find((line) => line.includes("const"));
    const listLine = lines.find((line) => stripAnsi(line).includes("Instalador"));
    const powershellLine = lines.find((line) => stripAnsi(line).includes("markiidown.exe"));
    const paragraphLine = lines.find((line) => stripAnsi(line).includes("Parágrafo"));
    const ordinaryLine = lines.find((line) => stripAnsi(line).includes("Texto normal"));
    const inlineCodeLines = lines.filter((line) => stripAnsi(line).includes("--install"));
    expect(untypedLine).not.toContain("\x1B[");
    expect(typedLine).toContain("\x1B[");
    expect(powershellLine).toBeDefined();
    expectTokenFullyYellow(powershellLine ?? "", "--install", 12);
    expectTokenFullyYellow(powershellLine ?? "", "--export=manual.html", 12);
    expect(stripAnsi(listLine ?? "")).toContain("Instalador (--install): texto comum");
    expect(listLine).not.toContain("**");
    expect(listLine).not.toContain("`");
    expect(paragraphLine).toContain("\x1B[33m--install\x1B[39m");
    expect(listLine).toMatch(/\x1B\[33m--install\x1B\[/);
    expect(ordinaryLine).not.toMatch(/\x1B\[(?:3[0-7]|9[0-7])m/);
    expect(inlineCodeLines.length).toBeGreaterThanOrEqual(6);

    for (const line of inlineCodeLines) {
      const wrapped = wrapAnsi(line ?? "", 8);
      expect(wrapped.map(stripAnsi).join("")).toBe(stripAnsi(line ?? ""));
      expect(wrapped.every((part) => Bun.stringWidth(stripAnsi(part)) <= 8)).toBe(true);
      expectTokenFullyYellow(line ?? "", "--install", 8);
    }
  });
});
