import { createColors } from "picocolors";

/**
 * Decide se a saída leva cores ANSI, seguindo as convenções usuais:
 *
 * 1. `NO_COLOR` definido e não vazio → sem cores (https://no-color.org).
 * 2. `FORCE_COLOR` definido → com cores, exceto `FORCE_COLOR=0`/`false`.
 * 3. Caso contrário, cores só quando a saída é um terminal.
 *
 * Antes o `picocolors` ligava as cores sempre no Windows, mesmo com a saída
 * redirecionada: `markiidown x.md --print > saida.txt` gravava o arquivo
 * cheio de códigos de escape.
 */
export function shouldUseColor(
  env: Record<string, string | undefined> = process.env,
  stream: { isTTY?: boolean } = process.stdout
): boolean {
  const noColor = env.NO_COLOR;
  if (noColor !== undefined && noColor !== "") return false;
  const force = env.FORCE_COLOR;
  if (force !== undefined) return !(force === "0" || force.toLowerCase() === "false");
  return !!stream.isTTY;
}

export const colorEnabled = shouldUseColor();

/** Instância do picocolors que respeita a decisão acima. Use sempre esta. */
export const pc = createColors(colorEnabled);
