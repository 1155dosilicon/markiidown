import { describe, expect, test } from "bun:test";
import {
  decodeTextBuffer,
  encodeText,
  hasMixedLineEndings,
  UnrepresentableTextError,
  type TextEncodingName,
} from "../src/text-file.ts";

// Os testes do editor salvando em cada codificação estão em editor.test.ts

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
  test("só acusa quando há mais de um tipo de final de linha (CRLF, LF, CR)", () => {
    expect(hasMixedLineEndings("a\r\nb\r\n")).toBe(false);
    expect(hasMixedLineEndings("a\nb\n")).toBe(false);
    expect(hasMixedLineEndings("a\r\nb\nc")).toBe(true);
    expect(hasMixedLineEndings("a\rb\nc")).toBe(true);
    expect(hasMixedLineEndings("a\rb\rc")).toBe(false);
  });
});
