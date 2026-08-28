import { describe, expect, test } from "bun:test";
import { CliArgumentError, parseCliArgs } from "../src/cli.ts";

describe("parseCliArgs", () => {
  test("analisa arquivo e modo de exportação", () => {
    expect(parseCliArgs(["guia.md", "--export", "saida.html"])).toEqual({
      action: undefined,
      mode: "export",
      targetFile: "guia.md",
      exportPath: "saida.html",
      raw: false,
      lineNumbers: false,
    });
  });

  test("analisa modo de edição com -E e --edit", () => {
    expect(parseCliArgs(["app.ts", "--edit"])).toEqual({
      action: undefined,
      mode: "edit",
      targetFile: "app.ts",
      exportPath: undefined,
      raw: false,
      lineNumbers: false,
    });

    expect(parseCliArgs(["main.py", "-E"])).toEqual({
      action: undefined,
      mode: "edit",
      targetFile: "main.py",
      exportPath: undefined,
      raw: false,
      lineNumbers: false,
    });
  });

  test("analisa flags --raw e --numbers", () => {
    expect(parseCliArgs(["script.js", "--raw", "--numbers"])).toEqual({
      action: undefined,
      mode: "interactive",
      targetFile: "script.js",
      exportPath: undefined,
      raw: true,
      lineNumbers: true,
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
    expect(() => parseCliArgs(["arquivo.ts", "--edit", "--print"])).toThrow(/não podem ser usados juntos/);
  });

  test("rejeita ações administrativas combinadas com arquivos", () => {
    expect(() => parseCliArgs(["--install", "arquivo.md"])).toThrow(/não pode ser combinada/);
  });
});

