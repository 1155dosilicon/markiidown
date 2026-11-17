import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decodeTextBuffer,
  encodeText,
  hasMixedLineEndings,
  UnrepresentableTextError,
  type TextEncodingName,
} from "../src/text-file.ts";

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe("decodeTextBuffer", () => {
  test("arquivo ANSI (Windows-1252) mantém os acentos", () => {
    // "Ação é €" em Windows-1252
    const bytes = new Uint8Array([0x41, 0xe7, 0xe3, 0x6f, 0x20, 0xe9, 0x20, 0x80]);
    const decoded = decodeTextBuffer(bytes);
    expect(decoded.encoding).toBe("windows-1252");
    expect(decoded.text).toBe("Ação é €");
    expect(decoded.text).not.toContain("�");
  });

  test("detecta UTF-8, UTF-8 com BOM e UTF-16 pelos bytes", () => {
    expect(decodeTextBuffer(Buffer.from("Ação", "utf-8"))).toEqual({ text: "Ação", encoding: "utf-8" });
    expect(decodeTextBuffer(Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("oi")]))).toEqual({
      text: "oi",
      encoding: "utf-8-bom",
    });
    expect(decodeTextBuffer(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Ação", "utf16le")]))).toEqual({
      text: "Ação",
      encoding: "utf-16le",
    });
    const be = Buffer.from("Ação", "utf16le");
    be.swap16();
    expect(decodeTextBuffer(Buffer.concat([Buffer.from([0xfe, 0xff]), be]))).toEqual({
      text: "Ação",
      encoding: "utf-16be",
    });
  });
});

describe("encodeText", () => {
  test("cada codificação volta exatamente aos bytes originais", () => {
    const samples: [TextEncodingName, Uint8Array][] = [
      ["utf-8", Buffer.from("Ação\r\nfim", "utf-8")],
      ["utf-8-bom", Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("Ação", "utf-8")])],
      ["utf-16le", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Ação 😀", "utf16le")])],
      ["windows-1252", new Uint8Array([0x41, 0xe7, 0xe3, 0x6f, 0x80, 0x81, 0x9f, 0xff])],
    ];
    for (const [encoding, bytes] of samples) {
      const decoded = decodeTextBuffer(bytes);
      expect(decoded.encoding).toBe(encoding);
      expect(Buffer.from(encodeText(decoded.text, encoding)).equals(Buffer.from(bytes))).toBe(true);
    }
  });

  test("caractere fora do Windows-1252 gera erro em vez de virar '?'", () => {
    expect(() => encodeText("ok 😀", "windows-1252")).toThrow(UnrepresentableTextError);
  });
});

describe("hasMixedLineEndings", () => {
  test("só acusa quando CRLF e LF aparecem juntos", () => {
    expect(hasMixedLineEndings("a\r\nb\r\n")).toBe(false);
    expect(hasMixedLineEndings("a\nb\n")).toBe(false);
    expect(hasMixedLineEndings("a\r\nb\nc")).toBe(true);
  });
});

describe("editor preserva a codificação ao salvar", () => {
  async function editWithKeys(filePath: string, keys: [string | undefined, Partial<import("node:readline").Key>][]) {
    const { runInteractiveEditor } = await import("../src/editor.ts");
    const originalWrite = process.stdout.write;
    // O editor desenha a tela inteira; o teste não precisa dessa saída
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      const listenersBefore = process.stdin.listenerCount("keypress");
      const pending = runInteractiveEditor({ filePath });
      // O editor lê o arquivo antes de começar a ouvir o teclado
      while (process.stdin.listenerCount("keypress") === listenersBefore) {
        await Bun.sleep(5);
      }
      for (const [str, key] of keys) process.stdin.emit("keypress", str, key);
      return await pending;
    } finally {
      process.stdout.write = originalWrite;
      process.stdin.pause();
    }
  }

  test("arquivo ANSI editado continua ANSI e com os acentos intactos", async () => {
    const directory = mkdtempSync(join(tmpdir(), "markiidown-encoding-"));
    directories.push(directory);
    const filePath = join(directory, "ansi.txt");
    writeFileSync(filePath, new Uint8Array([0x41, 0xe7, 0xe3, 0x6f])); // "Ação"

    const result = await editWithKeys(filePath, [
      [undefined, { name: "end" }],
      ["é", { name: undefined, sequence: "é" }],
      [undefined, { name: "s", ctrl: true }],
      [undefined, { name: "escape" }],
    ]);

    expect(result.saved).toBe(true);
    expect([...readFileSync(filePath)]).toEqual([0x41, 0xe7, 0xe3, 0x6f, 0xe9]);
  });

  test("emoji em arquivo ANSI é salvo em UTF-8 em vez de ser perdido", async () => {
    const directory = mkdtempSync(join(tmpdir(), "markiidown-encoding-"));
    directories.push(directory);
    const filePath = join(directory, "ansi.txt");
    writeFileSync(filePath, new Uint8Array([0xe7])); // "ç"

    await editWithKeys(filePath, [
      [undefined, { name: "end" }],
      ["😀", { name: undefined, sequence: "😀" }],
      [undefined, { name: "s", ctrl: true }],
      [undefined, { name: "escape" }],
    ]);

    expect(readFileSync(filePath, "utf-8")).toBe("ç😀");
  });

  test("BOM do UTF-8 continua no arquivo após salvar", async () => {
    const directory = mkdtempSync(join(tmpdir(), "markiidown-encoding-"));
    directories.push(directory);
    const filePath = join(directory, "bom.md");
    writeFileSync(filePath, Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("oi")]));

    await editWithKeys(filePath, [
      [undefined, { name: "end" }],
      ["!", { name: undefined, sequence: "!" }],
      [undefined, { name: "s", ctrl: true }],
      [undefined, { name: "escape" }],
    ]);

    expect([...readFileSync(filePath)]).toEqual([0xef, 0xbb, 0xbf, 0x6f, 0x69, 0x21]);
  });
});
