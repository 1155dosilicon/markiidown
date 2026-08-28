import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  calculateReadingTime,
  detectFileType,
  formatBytes,
  isBinaryBuffer,
  isMarkdownPath,
  resolveTargetFile,
} from "../src/utils.ts";

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
  test("retorna null para caminho inexistente se allowNew for false", () => {
    const directory = makeTemporaryDirectory();
    expect(resolveTargetFile(join(directory, "inexistente.md"))).toBeNull();
  });

  test("retorna o caminho se allowNew for true e a pasta pai existir", () => {
    const directory = makeTemporaryDirectory();
    const newFilePath = join(directory, "novo-arquivo.md");
    expect(resolveTargetFile(newFilePath, true)).toBe(newFilePath);
  });

  test("aceita arquivos de qualquer formato suportado (Markdown, código, texto)", () => {
    const directory = makeTemporaryDirectory();
    const markdown = join(directory, "notas.markdown");
    const typescript = join(directory, "app.ts");
    const json = join(directory, "config.json");
    const text = join(directory, "notas.txt");

    writeFileSync(markdown, "# Notas");
    writeFileSync(typescript, "const x = 1;");
    writeFileSync(json, "{}");
    writeFileSync(text, "texto");

    expect(resolveTargetFile(markdown)).toBe(markdown);
    expect(resolveTargetFile(typescript)).toBe(typescript);
    expect(resolveTargetFile(json)).toBe(json);
    expect(resolveTargetFile(text)).toBe(text);
    expect(isMarkdownPath("README.MD")).toBe(true);
  });

  test("ignora diretórios cujo nome termina em .md e busca arquivos internos", () => {
    const directory = makeTemporaryDirectory();
    mkdirSync(join(directory, "falso.md"));
    const markdown = join(directory, "real.markdown");
    writeFileSync(markdown, "# Real");

    expect(resolveTargetFile(directory)).toBe(markdown);
  });
});

describe("detectFileType", () => {
  test("identifica markdown, linguagens de código e texto plano", () => {
    expect(detectFileType("docs.md").type).toBe("markdown");
    expect(detectFileType("main.ts").type).toBe("code");
    expect(detectFileType("main.ts").language).toBe("typescript");
    expect(detectFileType("script.py").language).toBe("python");
    expect(detectFileType("Dockerfile").language).toBe("dockerfile");
    expect(detectFileType("package.json").language).toBe("json");
    expect(detectFileType("info.txt").type).toBe("text");
  });

  test("detecta arquivos binários", () => {
    expect(detectFileType("image.png").isBinary).toBe(true);
    expect(detectFileType("binary.exe").isBinary).toBe(true);
    const nullBytes = new Uint8Array([0x48, 0x65, 0x00, 0x6c]);
    expect(isBinaryBuffer(nullBytes)).toBe(true);
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
