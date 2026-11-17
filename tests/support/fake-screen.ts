import type { FakeTerminal } from "../../src/terminal-io.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

/** Reconstrói a tela atual a partir de tudo o que o programa escreveu no terminal falso. */
export function screenOf(terminal: FakeTerminal): VirtualTerminal {
  const screen = new VirtualTerminal(terminal.columns(), terminal.rows());
  screen.write(terminal.output);
  return screen;
}

/** Espera uma condição (o leitor e o editor carregam o arquivo de forma assíncrona). */
export async function waitUntil(condition: () => boolean, description: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await Bun.sleep(5);
  }
  if (!condition()) throw new Error(`Tempo esgotado esperando: ${description}`);
}

/** Envia teclas e espera o redesenho (o editor redesenha num microtask). */
export async function press(terminal: FakeTerminal, ...keys: string[]): Promise<void> {
  for (const key of keys) {
    terminal.type(key);
    await Bun.sleep(1);
  }
  await Bun.sleep(10);
}
