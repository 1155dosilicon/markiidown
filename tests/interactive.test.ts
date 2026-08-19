import { describe, expect, test } from "bun:test";
import { stripAnsi, truncateAnsi, wrapAnsi } from "../src/interactive.ts";

describe("truncateAnsi", () => {
  test("preserva sequências ANSI completas", () => {
    const result = truncateAnsi("\x1B[31mvermelho\x1B[0m", 4);
    expect(result).toStartWith("\x1B[31mverm");
    expect(stripAnsi(result)).toBe("verm");
  });

  test("considera a largura visual de emoji e caracteres CJK", () => {
    expect(stripAnsi(truncateAnsi("😀界a", 4))).toBe("😀界");
    expect(Bun.stringWidth(stripAnsi(truncateAnsi("😀界a", 4)))).toBe(4);
  });
});

describe("wrapAnsi", () => {
  test("quebra caminhos longos sem descartar o restante da frase", () => {
    const text = "3. Menu: HKCU\\Software\\Classes\\SystemFileAssociations\\.md\\shell\\MarkiiDown e HKCU\\Software\\Classes\\Applications\\markiidown.exe.";
    const lines = wrapAnsi(text, 48);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map(stripAnsi).join("")).toBe(text);
    expect(lines.every((line) => Bun.stringWidth(stripAnsi(line)) <= 48)).toBe(true);
  });

  test("preserva texto e estilos ANSI entre linhas", () => {
    const text = "\x1B[33mabcdefghij\x1B[0m";
    const lines = wrapAnsi(text, 4);

    expect(lines.map(stripAnsi).join("")).toBe("abcdefghij");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toStartWith("\x1B[33m");
  });
});
