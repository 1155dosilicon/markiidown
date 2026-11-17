import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { appCommand, KEYS, launchTui, PROJECT_ROOT, type TuiSession } from "./support/tui.ts";

/**
 * Testes de ponta a ponta: o MarkiiDown roda dentro de um pseudoterminal de
 * verdade (ConPTY no Windows), recebe teclas como se fossem digitadas e a
 * tela é reconstruída a partir do que ele escreve. Pegam problemas que só
 * aparecem no terminal real (ex.: o console do Windows quebrando ao sair da
 * tela alternativa na ordem errada).
 *
 * Para testar o executável compilado: MARKIIDOWN_E2E_EXE=dist\markiidown.exe bun test e2e
 */

const hasPty = typeof (Bun as unknown as { Terminal?: unknown }).Terminal === "function";
const E2E_TIMEOUT = 30_000;

const sessions: TuiSession[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) session.kill();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function launch(args: string[], cols = 80, rows = 20): TuiSession {
  const session = launchTui(args, { cols, rows });
  sessions.push(session);
  return session;
}

function tempFile(name: string, content: string): string {
  const directory = mkdtempSync(join(tmpdir(), "markiidown-e2e-"));
  directories.push(directory);
  const filePath = join(directory, name);
  writeFileSync(filePath, content);
  return filePath;
}

describe.skipIf(!hasPty)("ponta a ponta (pseudoterminal)", () => {
  test(
    "leitor: abre, rola, mantém o estilo das citações e sai limpo",
    async () => {
      const file = tempFile("doc.md", "# Título\n\n> citação **forte** que continua\n> na linha seguinte\n\n" + "linha\n\n".repeat(40));
      const session = launch([file], 60, 12);
      await session.waitForText("Título", 15_000);
      await session.settle();

      const screen = session.screen;
      const quote = screen.find("citação")!;
      expect(screen.cell(quote.row, quote.col).attrs.italic).toBe(true);
      const strong = screen.find("forte")!;
      expect(screen.cell(strong.row, strong.col).attrs.bold).toBe(true);
      expect(screen.cell(strong.row, strong.col).attrs.italic).toBe(true);
      // Nada do estilo da barra de status vaza para o conteúdo
      expect(screen.cell(0, 0).attrs.bg).toBeNull();

      session.write(KEYS.pageDown);
      await session.settle();
      expect(screen.lineText(11)).toMatch(/12-22\/\d+/);

      session.write("q");
      expect(await session.waitForExit()).toBe(0);
      expect(session.screen.alternateScreen).toBe(false);
      expect(session.screen.cursorVisible).toBe(true);
    },
    E2E_TIMEOUT
  );

  test(
    "leitor → editor → salvar → volta ao leitor com o conteúdo novo",
    async () => {
      const file = tempFile("nota.md", "# Antes\n\nTexto original.\n");
      const session = launch([file], 60, 12);
      await session.waitForText("Antes", 15_000);
      session.write("e");
      await session.waitForText("Ln 1/", 8_000);
      session.write("\x1B[1;5F"); // Ctrl+End
      session.write("Linha nova");
      session.write(KEYS.ctrl("s"));
      await session.waitForText("Salvo", 8_000);
      session.write(KEYS.escape);
      // De volta ao leitor (barra de status dele, não a do editor), com o texto novo
      await session.waitFor((screen) => screen.text().includes("Linha nova") && screen.text().includes("Sair") && !screen.text().includes("Ln 4/4"), "leitor recarregado", 8_000);
      expect(readFileSync(file, "utf8")).toBe("# Antes\n\nTexto original.\nLinha nova");

      // O leitor continua respondendo depois de voltar do editor
      session.write("?");
      await session.waitForText("teclas do leitor", 8_000);
      session.write("x");
      session.write("q");
      expect(await session.waitForExit()).toBe(0);
    },
    E2E_TIMEOUT
  );

  test(
    "editor: Esc imediato, colagem sem acumular indentação e Ctrl+S",
    async () => {
      const file = tempFile("codigo.py", "def f():\n    pass\n");
      const session = launch([file, "--edit"], 60, 12);
      await session.waitForText("Ln 1/", 15_000);
      session.write(KEYS.down);
      session.write(KEYS.end);
      session.write(KEYS.enter);
      session.write(KEYS.paste("if x:\r    y = 1\r    z = 2"));
      session.write(KEYS.ctrl("s"));
      await session.waitForText("Salvo", 8_000);
      const started = Date.now();
      session.write(KEYS.escape);
      expect(await session.waitForExit()).toBe(0);
      expect(Date.now() - started).toBeLessThan(1_500);
      expect(readFileSync(file, "utf8")).toBe("def f():\n    pass\n    if x:\n    y = 1\n    z = 2\n");
    },
    E2E_TIMEOUT
  );

  test(
    "terminal estreito: a barra de status não faz a tela rolar",
    async () => {
      const session = launch([resolve(PROJECT_ROOT, "exemplo.md")], 22, 8);
      await session.settle(800, 15_000);
      const firstLine = session.screen.lineText(0);
      expect(firstLine.trim().length).toBeGreaterThan(0);
      session.write(KEYS.down);
      session.write(KEYS.up);
      await session.settle();
      expect(session.screen.lineText(0)).toBe(firstLine);
      session.write("q");
      expect(await session.waitForExit()).toBe(0);
    },
    E2E_TIMEOUT
  );
});

describe("saída redirecionada", () => {
  async function run(args: string[]): Promise<{ stdout: string; code: number }> {
    const env = { ...process.env };
    delete env.NO_COLOR;
    delete env.FORCE_COLOR;
    const child = Bun.spawn(appCommand(args), { cwd: PROJECT_ROOT, env, stdout: "pipe", stderr: "pipe" });
    const stdout = await new Response(child.stdout).text();
    return { stdout, code: await child.exited };
  }

  test(
    "--print num pipe sai sem códigos de cor e com as linhas horizontais",
    async () => {
      const { stdout, code } = await run([resolve(PROJECT_ROOT, "exemplo.md"), "--print"]);
      expect(code).toBe(0);
      expect(stdout).not.toContain("\x1B");
      expect(stdout).toContain("─".repeat(40));
      expect(stdout).not.toMatch(/^#/m);
    },
    E2E_TIMEOUT
  );

  test(
    "--help num pipe sai sem códigos de cor",
    async () => {
      const { stdout, code } = await run(["--help"]);
      expect(code).toBe(0);
      expect(stdout).toContain("markiidown");
      expect(stdout).not.toContain("\x1B");
    },
    E2E_TIMEOUT
  );
});
