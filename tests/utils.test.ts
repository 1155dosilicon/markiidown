import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  calculateReadingTime,
  detectFileType,
  formatBytes,
  getUniqueFilePath,
  isBinaryBuffer,
  isMarkdownPath,
  isSystemFileName,
  listSupportedFilesInDir,
  resolveNewFileTarget,
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

  test("ignora arquivos de sistema do Windows (desktop.ini, thumbs.db)", () => {
    expect(isSystemFileName("desktop.ini")).toBe(true);
    expect(isSystemFileName("DESKTOP.INI")).toBe(true);
    expect(isSystemFileName("Thumbs.db")).toBe(true);
    expect(isSystemFileName("notas.md")).toBe(false);

    const directory = makeTemporaryDirectory();
    writeFileSync(join(directory, "desktop.ini"), "[.ShellClassInfo]");
    writeFileSync(join(directory, "Thumbs.db"), "fake");
    const notes = join(directory, "notas.md");
    writeFileSync(notes, "# Notas");

    expect(resolveTargetFile(directory)).toBe(notes);
    expect(listSupportedFilesInDir(directory).map((f) => f.name)).toEqual(["notas.md"]);
  });

  test("retorna null para pasta contendo apenas arquivos de sistema", () => {
    const directory = makeTemporaryDirectory();
    writeFileSync(join(directory, "desktop.ini"), "[.ShellClassInfo]");

    expect(resolveTargetFile(directory)).toBeNull();
  });
});

describe("resolveNewFileTarget", () => {
  test("gera nome único estilo Explorer quando o arquivo já existe", () => {
    const directory = makeTemporaryDirectory();
    expect(getUniqueFilePath(directory, "novo.md")).toBe(join(directory, "novo.md"));

    writeFileSync(join(directory, "novo.md"), "");
    expect(getUniqueFilePath(directory, "novo.md")).toBe(join(directory, "novo (2).md"));

    writeFileSync(join(directory, "novo (2).md"), "");
    expect(getUniqueFilePath(directory, "novo.md")).toBe(join(directory, "novo (3).md"));
  });

  test("resolve pasta existente para novo.md único dentro dela", () => {
    const directory = makeTemporaryDirectory();
    expect(resolveNewFileTarget(directory)).toBe(join(directory, "novo.md"));

    writeFileSync(join(directory, "novo.md"), "");
    expect(resolveNewFileTarget(directory)).toBe(join(directory, "novo (2).md"));
  });

  test("gera irmão único quando o caminho já existe como arquivo", () => {
    const directory = makeTemporaryDirectory();
    const existing = join(directory, "novo.md");
    writeFileSync(existing, "");

    expect(resolveNewFileTarget(existing)).toBe(join(directory, "novo (2).md"));
  });

  test("usa o caminho como está quando não existe com pasta-mãe válida", () => {
    const directory = makeTemporaryDirectory();
    const target = join(directory, "rascunho.md");

    expect(resolveNewFileTarget(target)).toBe(target);
  });

  test("retorna null quando a pasta-mãe não existe", () => {
    const directory = makeTemporaryDirectory();

    expect(resolveNewFileTarget(join(directory, "ausente", "novo.md"))).toBeNull();
  });

  test("sem argumento cria novo.md na pasta atual (cenário Desktop)", () => {
    const directory = makeTemporaryDirectory();
    const previousCwd = process.cwd();
    process.chdir(directory);
    try {
      expect(resolveNewFileTarget(undefined)).toBe(join(directory, "novo.md"));
    } finally {
      process.chdir(previousCwd);
    }
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
