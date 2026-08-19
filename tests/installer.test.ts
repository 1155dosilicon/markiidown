import { describe, expect, test } from "bun:test";
import { isRunningFromBunRuntime, normalizePathForComparison } from "../src/installer.ts";

describe("installer helpers", () => {
  test("distingue o runtime Bun de um executável compilado", () => {
    expect(isRunningFromBunRuntime("C:\\tools\\bun.exe")).toBe(true);
    expect(isRunningFromBunRuntime("C:\\tools\\markiidown.exe")).toBe(false);
  });

  test("expande variáveis de ambiente ao comparar entradas do PATH", () => {
    const previous = process.env.MARKIIDOWN_TEST_ROOT;
    process.env.MARKIIDOWN_TEST_ROOT = "C:\\Users\\Teste\\AppData\\Local";
    try {
      expect(normalizePathForComparison("%MARKIIDOWN_TEST_ROOT%\\MarkiiDown\\")).toBe(
        normalizePathForComparison("C:\\Users\\Teste\\AppData\\Local\\MarkiiDown")
      );
    } finally {
      if (previous === undefined) delete process.env.MARKIIDOWN_TEST_ROOT;
      else process.env.MARKIIDOWN_TEST_ROOT = previous;
    }
  });
});
