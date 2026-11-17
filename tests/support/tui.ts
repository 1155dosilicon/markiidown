import { resolve } from "node:path";
import { VirtualTerminal } from "./virtual-terminal.ts";

/**
 * Executa o MarkiiDown dentro de um pseudoterminal de verdade (ConPTY no
 * Windows, PTY no Linux/macOS) via `Bun.Terminal`, e reconstrói a tela com
 * o VirtualTerminal. É o mais próximo de um usuário digitando no Windows
 * Terminal: as teclas passam pelo ConPTY e pelo modo raw do console.
 *
 * Por padrão roda o código-fonte (`bun run src/index.ts`). Para testar o
 * executável compilado, defina MARKIIDOWN_E2E_EXE com o caminho do .exe.
 */

export const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");

/** Sequências que um terminal envia para cada tecla. */
export const KEYS = {
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  home: "\x1b[H",
  end: "\x1b[F",
  pageUp: "\x1b[5~",
  pageDown: "\x1b[6~",
  delete: "\x1b[3~",
  escape: "\x1b",
  enter: "\r",
  backspace: "\x7f",
  tab: "\t",
  shiftTab: "\x1b[Z",
  ctrlLeft: "\x1b[1;5D",
  ctrlRight: "\x1b[1;5C",
  ctrl: (letter: string) => String.fromCharCode(letter.toUpperCase().charCodeAt(0) - 64),
  /** Colagem com bracketed paste (o terminal envolve o texto colado). */
  paste: (text: string) => `\x1b[200~${text}\x1b[201~`,
} as const;

export interface TuiOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export interface TuiSession {
  screen: VirtualTerminal;
  /** Toda a saída bruta recebida até agora. */
  output(): string;
  /** Envia teclas (sequências de KEYS ou texto). */
  write(data: string): void;
  /** Espera a condição ser verdadeira; falha com a tela atual no erro. */
  waitFor(predicate: (screen: VirtualTerminal) => boolean, description: string, timeoutMs?: number): Promise<void>;
  waitForText(text: string, timeoutMs?: number): Promise<void>;
  /** Espera a tela parar de mudar por `quietMs`. */
  settle(quietMs?: number, timeoutMs?: number): Promise<void>;
  resize(cols: number, rows: number): void;
  /** Espera o processo terminar e devolve o código de saída. */
  waitForExit(timeoutMs?: number): Promise<number>;
  kill(): void;
}

export function appCommand(args: string[]): string[] {
  const exe = process.env.MARKIIDOWN_E2E_EXE;
  return exe ? [exe, ...args] : [process.execPath, "run", resolve(PROJECT_ROOT, "src", "index.ts"), ...args];
}

export function launchTui(args: string[], options: TuiOptions = {}): TuiSession {
  const cols = options.cols ?? 80;
  const rows = options.rows ?? 24;
  const screen = new VirtualTerminal(cols, rows);
  const decoder = new TextDecoder();
  let raw = "";
  let lastOutputAt = Date.now();

  // Comportamento padrão de um terminal de verdade: sem NO_COLOR/FORCE_COLOR
  // herdados do ambiente de teste (tests/support/setup.ts liga o NO_COLOR)
  const env: Record<string, string> = {};
  const inherited = { ...process.env, DO_NOT_TRACK: "1", NO_COLOR: undefined, FORCE_COLOR: undefined, ...options.env };
  for (const [name, value] of Object.entries(inherited)) {
    if (value !== undefined) env[name] = value;
  }

  const proc = Bun.spawn(appCommand(args), {
    cwd: options.cwd ?? PROJECT_ROOT,
    env,
    terminal: {
      cols,
      rows,
      data(_terminal: unknown, data: Uint8Array) {
        const text = decoder.decode(data, { stream: true });
        raw += text;
        lastOutputAt = Date.now();
        screen.write(text);
      },
    },
  } as Parameters<typeof Bun.spawn>[1]) as ReturnType<typeof Bun.spawn> & {
    terminal: { write(data: string): void; resize(cols: number, rows: number): void; close(): void };
  };

  screen.onReply = (reply) => proc.terminal.write(reply);

  let exitCode: number | null = null;
  void proc.exited.then((code) => {
    exitCode = code;
  });

  const describeScreen = () =>
    `\n----- tela (${screen.cols}x${screen.rows}) -----\n${screen.text()}\n-----------------------------`;

  const session: TuiSession = {
    screen,
    output: () => raw,
    write(data) {
      proc.terminal.write(data);
    },
    async waitFor(predicate, description, timeoutMs = 8000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (predicate(screen)) return;
        if (exitCode !== null) break;
        await Bun.sleep(20);
      }
      if (predicate(screen)) return;
      throw new Error(`Tempo esgotado esperando: ${description}${exitCode !== null ? ` (processo saiu com ${exitCode})` : ""}${describeScreen()}`);
    },
    waitForText(text, timeoutMs) {
      return session.waitFor((s) => s.text().includes(text), `texto "${text}"`, timeoutMs);
    },
    async settle(quietMs = 200, timeoutMs = 8000) {
      // O silêncio só conta a partir desta chamada: logo depois de enviar uma
      // tecla, a resposta do programa ainda nem começou a chegar.
      const startedAt = Date.now();
      const deadline = startedAt + timeoutMs;
      while (Date.now() < deadline) {
        if (Date.now() - Math.max(lastOutputAt, startedAt) >= quietMs) return;
        await Bun.sleep(20);
      }
    },
    resize(newCols, newRows) {
      screen.resize(newCols, newRows);
      proc.terminal.resize(newCols, newRows);
    },
    async waitForExit(timeoutMs = 8000) {
      const result = await Promise.race([proc.exited, Bun.sleep(timeoutMs).then(() => null)]);
      if (result === null) {
        proc.kill();
        throw new Error(`O processo não terminou em ${timeoutMs} ms${describeScreen()}`);
      }
      return result;
    },
    kill() {
      if (exitCode === null) proc.kill();
    },
  };
  return session;
}
