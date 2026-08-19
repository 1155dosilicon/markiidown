import { describe, expect, test } from "bun:test";
import { CliArgumentError, parseCliArgs } from "../src/cli.ts";

describe("parseCliArgs", () => {
  test("analisa arquivo e modo de exportação", () => {
    expect(parseCliArgs(["guia.md", "--export", "saida.html"])).toEqual({
      action: undefined,
      mode: "export",
      targetFile: "guia.md",
      exportPath: "saida.html",
    });
  });

  test("aceita caminho iniciado por hífen depois de --", () => {
    expect(parseCliArgs(["--print", "--", "-notas.md"]).targetFile).toBe("-notas.md");
  });

  test("rejeita opções desconhecidas", () => {
    expect(() => parseCliArgs(["--cli"])).toThrow(CliArgumentError);
  });

  test("rejeita modos contraditórios", () => {
    expect(() => parseCliArgs(["arquivo.md", "--print", "--watch"])).toThrow(/não podem ser usados juntos/);
  });

  test("rejeita ações administrativas combinadas com arquivos", () => {
    expect(() => parseCliArgs(["--install", "arquivo.md"])).toThrow(/não pode ser combinada/);
  });
});
