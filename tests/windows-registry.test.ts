import { describe, expect, test } from "bun:test";
import {
  buildKeysToDelete,
  buildRegisterCommands,
  formatIconValue,
  MARKIIDOWN_BACKUP_KEY,
  MARKIIDOWN_DOCUMENT_CLASS,
  MARKIIDOWN_SOFTWARE_KEY,
  parseRegDefaultValue,
  parseRegNamedValue,
  parseRegSubkeys,
} from "../src/windows-registry.ts";

const EXE = "C:\\Users\\Teste\\AppData\\Local\\MarkiiDown\\markiidown.exe";
const ICON = `"C:\\Users\\Teste\\AppData\\Local\\MarkiiDown\\markiidown.ico"`;

function commandData(commands: string[][], keySuffix: string): string | undefined {
  const command = commands.find((cmd) => cmd[2]?.endsWith(keySuffix) && cmd[3] === "/ve");
  if (!command) return undefined;
  const dataIndex = command.indexOf("/d");
  return dataIndex >= 0 ? command[dataIndex + 1] : undefined;
}

describe("buildRegisterCommands", () => {
  const commands = buildRegisterCommands({ exePath: EXE, iconValue: ICON, appKeyName: "markiidown.exe" });

  test("Novo arquivo no Desktop recebe a pasta (%V) com --new, nunca --edit solto", () => {
    expect(commandData(commands, "DesktopBackground\\shell\\MarkiiDownNew\\command")).toBe(
      `"${EXE}" "%V\\novo.md" --new`
    );
  });

  test("Novo arquivo no fundo de pastas e sobre pastas usa --new com caminho", () => {
    expect(commandData(commands, "Directory\\Background\\shell\\MarkiiDownNew\\command")).toBe(
      `"${EXE}" "%V\\novo.md" --new`
    );
    expect(commandData(commands, "Directory\\shell\\MarkiiDownNew\\command")).toBe(
      `"${EXE}" "%1\\novo.md" --new`
    );
  });

  test("nenhum comando --new/--edit é registrado sem caminho de alvo", () => {
    for (const command of commands) {
      const dataIndex = command.indexOf("/d");
      const data = dataIndex >= 0 ? command[dataIndex + 1] : "";
      if (data === undefined) continue;
      if (data.includes("--new") || data.includes("--edit")) {
        expect(data).toMatch(/%1|%V/);
      }
    }
  });

  test("abrir pasta existe nos três superfícies: ícone, fundo e Desktop", () => {
    expect(commandData(commands, "Directory\\shell\\MarkiiDown\\command")).toBe(`"${EXE}" "%1"`);
    expect(commandData(commands, "Directory\\Background\\shell\\MarkiiDown\\command")).toBe(`"${EXE}" "%V"`);
    expect(commandData(commands, "DesktopBackground\\shell\\MarkiiDown\\command")).toBe(`"${EXE}" "%V"`);
  });

  test("valores de ícone vão quotados para suportar espaços no caminho", () => {
    const iconCommands = commands.filter((cmd) => cmd[3] === "/v" && cmd[4] === "Icon");
    expect(iconCommands.length).toBeGreaterThan(0);
    for (const cmd of iconCommands) {
      expect(cmd[cmd.indexOf("/d") + 1].startsWith('"')).toBe(true);
    }
    const defaultIcons = commands.filter((cmd) => cmd[2]?.endsWith("DefaultIcon"));
    expect(defaultIcons.length).toBeGreaterThan(0);
    for (const cmd of defaultIcons) {
      expect(cmd[cmd.indexOf("/d") + 1].startsWith('"')).toBe(true);
    }
  });

  test("usa a classe de documento e o nome do executável instalados", () => {
    expect(MARKIIDOWN_DOCUMENT_CLASS).toBe("MarkiiDown.Document");
    expect(commandData(commands, "Classes\\.md")).toBe(MARKIIDOWN_DOCUMENT_CLASS);
    expect(commandData(commands, "Applications\\markiidown.exe\\shell\\open\\command")).toBe(
      `"${EXE}" "%1"`
    );
  });
});

describe("buildKeysToDelete", () => {
  test("cobre todas as chaves criadas, incluindo a de backups", () => {
    const keys = buildKeysToDelete(["markiidown.exe"]);
    for (const expected of [
      "HKCU\\Software\\Classes\\*\\shell\\MarkiiDown",
      "HKCU\\Software\\Classes\\.md\\ShellNew",
      "HKCU\\Software\\Classes\\.markdown\\ShellNew",
      `HKCU\\Software\\Classes\\${MARKIIDOWN_DOCUMENT_CLASS}`,
      "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDown",
      "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDownNew",
      "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDown",
      "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew",
      "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDown",
      "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDownNew",
      "HKCU\\Software\\Classes\\Applications\\markiidown.exe",
      MARKIIDOWN_SOFTWARE_KEY,
    ]) {
      expect(keys).toContain(expected);
    }
  });

  test("chave de backup vive sob a chave de software removida no uninstall", () => {
    expect(MARKIIDOWN_BACKUP_KEY.startsWith(`${MARKIIDOWN_SOFTWARE_KEY}\\`)).toBe(true);
  });
});

describe("reg output parsers", () => {
  test("parseRegDefaultValue extrai o valor padrão", () => {
    const output = "HKEY_CURRENT_USER\\Software\\Classes\\.md\r\n    (Default)    REG_SZ    MarkiiDown.Document\r\n";
    expect(parseRegDefaultValue(output)).toBe("MarkiiDown.Document");
    expect(parseRegDefaultValue("HKEY_CURRENT_USER\\Software\\Classes\\X\r\n")).toBeNull();
  });

  test("parseRegNamedValue extrai valor nomeado com regex escapado", () => {
    const output =
      "HKEY_CURRENT_USER\\Software\\MarkiiDown\\Backup\r\n    .md    REG_SZ    VSCode.md\r\n";
    expect(parseRegNamedValue(output, ".md")).toBe("VSCode.md");
    expect(parseRegNamedValue(output, ".markdown")).toBeNull();
  });

  test("parseRegSubkeys pula a primeira linha (a própria chave)", () => {
    const output = [
      "HKEY_CURRENT_USER\\Software\\Classes\\Applications",
      "HKEY_CURRENT_USER\\Software\\Classes\\Applications\\markiidown.exe",
      "HKEY_CURRENT_USER\\Software\\Classes\\Applications\\outro.exe",
      "",
    ].join("\r\n");
    expect(parseRegSubkeys(output)).toEqual([
      "HKEY_CURRENT_USER\\Software\\Classes\\Applications\\markiidown.exe",
      "HKEY_CURRENT_USER\\Software\\Classes\\Applications\\outro.exe",
    ]);
    expect(parseRegSubkeys("HKEY_CURRENT_USER\\Software\\Classes\\Applications\r\n")).toEqual([]);
  });
});

describe("formatIconValue", () => {
  test("quota caminho .ico e forma exe,0", () => {
    expect(formatIconValue("C:\\App com Espaço\\markiidown.ico")).toBe('"C:\\App com Espaço\\markiidown.ico"');
    expect(formatIconValue("C:\\App com Espaço\\markiidown.exe,0")).toBe(
      '"C:\\App com Espaço\\markiidown.exe",0'
    );
    expect(formatIconValue('"C:\\App\\a.ico"')).toBe('"C:\\App\\a.ico"');
  });
});
