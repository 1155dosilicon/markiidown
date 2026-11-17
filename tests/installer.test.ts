import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  appendPathEntry,
  buildCleanupScript,
  isRunningFromBunRuntime,
  normalizePathForComparison,
  removePathEntry,
} from "../src/installer.ts";
import { toWindowsFileVersion, VERSION } from "../src/version.ts";

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

describe("PATH do usuário", () => {
  const dir = resolve("/apps/MarkiiDown");
  const original = `${resolve("/a")};;%USERPROFILE%\\tools;${resolve("/b")}`;

  test("instalar e desinstalar devolve o PATH idêntico ao original", () => {
    const installed = appendPathEntry(original, dir);
    expect(installed).toBe(`${original};${dir}`);
    expect(removePathEntry(installed!, dir)).toBe(original);
  });

  test("PATH terminado em ';' também volta idêntico", () => {
    const withTrailing = `${original};`;
    const installed = appendPathEntry(withTrailing, dir);
    expect(installed).toBe(`${withTrailing}${dir};`);
    expect(removePathEntry(installed!, dir)).toBe(withTrailing);
  });

  test("não duplica nem grava quando nada muda", () => {
    expect(appendPathEntry(`${original};${dir}\\`, dir)).toBeNull();
    expect(removePathEntry(original, dir)).toBeNull();
    expect(appendPathEntry("", dir)).toBe(dir);
  });
});

describe("desinstalação", () => {
  test("script de limpeza lê o alvo do ambiente e tenta de novo até o .exe ser liberado", () => {
    const script = buildCleanupScript();
    expect(script).toContain("$env:MARKIIDOWN_CLEANUP_TARGET");
    expect(script).toContain("Set-Location -LiteralPath $env:TEMP");
    expect(script).toMatch(/for \(\$i = 0; \$i -lt \d+/);
  });

  // Regressão: o PowerShell de limpeza era encerrado junto com o MarkiiDown
  // (Job do Windows do Bun) e a pasta de instalação nunca era apagada.
  test.skipIf(process.platform !== "win32")(
    "a remoção agendada acontece depois que o processo termina",
    async () => {
      const target = mkdtempSync(join(tmpdir(), "markiidown-uninstall-"));
      mkdirSync(join(target, "sub"));
      writeFileSync(join(target, "sub", "markiidown.exe"), "x");

      const installerModule = resolve(import.meta.dir, "..", "src", "installer.ts");
      const child = Bun.spawn(
        [
          process.execPath,
          "-e",
          `const m = await import(${JSON.stringify(installerModule)}); await m.scheduleDirectoryRemovalAfterExit(${JSON.stringify(target)}); process.exit(0);`,
        ],
        { stdout: "ignore", stderr: "ignore" }
      );
      expect(await child.exited).toBe(0);

      const deadline = Date.now() + 15_000;
      while (existsSync(target) && Date.now() < deadline) await Bun.sleep(200);
      const removed = !existsSync(target);
      if (!removed) rmSync(target, { recursive: true, force: true });
      expect(removed).toBe(true);
    },
    20_000
  );
});

describe("versão", () => {
  test("vem do package.json e gera a versão de quatro partes do .exe", async () => {
    const pkg = await Bun.file(resolve(import.meta.dir, "..", "package.json")).json();
    expect(VERSION).toBe(pkg.version);
    expect(toWindowsFileVersion("2.0.0")).toBe("2.0.0.0");
    expect(toWindowsFileVersion("2.1.3-beta.1")).toBe("2.1.3.0");
  });
});
