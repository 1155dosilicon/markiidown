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
      createNew: false,
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
      createNew: false,
    });

    expect(parseCliArgs(["main.py", "-E"])).toEqual({
      action: undefined,
      mode: "edit",
      targetFile: "main.py",
      exportPath: undefined,
      raw: false,
      lineNumbers: false,
      createNew: false,
    });
  });

  test("analisa --new como modo de edição com criação de arquivo novo", () => {
    expect(parseCliArgs(["--new"])).toEqual({
      action: undefined,
      mode: "edit",
      targetFile: undefined,
      exportPath: undefined,
      raw: false,
      lineNumbers: false,
      createNew: true,
    });

    expect(parseCliArgs(["C:\\Users\\Teste\\Desktop\\novo.md", "--new"])).toEqual({
      action: undefined,
      mode: "edit",
      targetFile: "C:\\Users\\Teste\\Desktop\\novo.md",
      exportPath: undefined,
      raw: false,
      lineNumbers: false,
      createNew: true,
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
      createNew: false,
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
    expect(() => parseCliArgs(["arquivo.md", "--new", "--print"])).toThrow(/não podem ser usados juntos/);
  });

  test("rejeita ações administrativas combinadas com arquivos", () => {
    expect(() => parseCliArgs(["--install", "arquivo.md"])).toThrow(/não pode ser combinada/);
    expect(() => parseCliArgs(["--install", "--new"])).toThrow(/não pode ser combinada/);
  });
});

