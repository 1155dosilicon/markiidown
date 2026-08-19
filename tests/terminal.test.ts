import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRenderedMarkdownLines } from "../src/terminal.ts";

const temporaryDirectories: string[] = [];

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
});
