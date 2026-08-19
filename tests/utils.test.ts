import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { calculateReadingTime, formatBytes, isMarkdownPath, resolveTargetFile } from "../src/utils.ts";

const temporaryDirectories: string[] = [];

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "markiidown-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("resolveTargetFile", () => {
  test("não troca silenciosamente um caminho explícito inexistente pelo README atual", () => {
    const directory = makeTemporaryDirectory();
    expect(resolveTargetFile(join(directory, "inexistente.md"))).toBeNull();
  });

  test("aceita .md e .markdown, mas rejeita outros arquivos", () => {
    const directory = makeTemporaryDirectory();
    const markdown = join(directory, "notas.markdown");
    const text = join(directory, "notas.txt");
    writeFileSync(markdown, "# Notas");
    writeFileSync(text, "texto");

    expect(resolveTargetFile(markdown)).toBe(markdown);
    expect(resolveTargetFile(text)).toBeNull();
    expect(isMarkdownPath("README.MD")).toBe(true);
  });

  test("ignora diretórios cujo nome termina em .md", () => {
    const directory = makeTemporaryDirectory();
    mkdirSync(join(directory, "falso.md"));
    const markdown = join(directory, "real.markdown");
    writeFileSync(markdown, "# Real");

    expect(resolveTargetFile(directory)).toBe(markdown);
  });
});

describe("formatBytes", () => {
  test("formata tamanhos grandes sem unidade indefinida", () => {
    expect(formatBytes(1024 ** 4)).toBe("1 TB");
    expect(formatBytes(Number.NaN)).toBe("0 Bytes");
  });

  test("documento vazio tem tempo de leitura zero", () => {
    expect(calculateReadingTime("   ")).toEqual({ words: 0, minutes: 0 });
  });
});
