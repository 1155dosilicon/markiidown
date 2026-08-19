import { describe, expect, test } from "bun:test";
import { stripAnsi, truncateAnsi } from "../src/interactive.ts";

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
