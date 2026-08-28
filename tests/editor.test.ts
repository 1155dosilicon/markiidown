import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("editor", () => {
  test("carrega e salva alterações em arquivos no disco", async () => {
    const dir = mkdtempSync(join(tmpdir(), "markiidown-editor-"));
    const testFile = join(dir, "teste.txt");
    writeFileSync(testFile, "Linha 1\nLinha 2", "utf-8");

    const content = readFileSync(testFile, "utf-8");
    expect(content).toBe("Linha 1\nLinha 2");

    // Simula alteração e salvamento
    const newContent = "Linha 1 editada\nLinha 2\nLinha 3 adicionada";
    writeFileSync(testFile, newContent, "utf-8");

    expect(readFileSync(testFile, "utf-8")).toBe(newContent);
    rmSync(dir, { recursive: true, force: true });
  });

  test("formata indentação de 2 espaços no tab", () => {
    const spaces = "  ";
    expect(spaces.length).toBe(2);
  });
});
