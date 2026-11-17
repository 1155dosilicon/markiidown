import { TAB_SIZE } from "./utils.ts";

/**
 * Utilitários para texto com sequências ANSI (cores SGR, OSC) e grafemas Unicode.
 *
 * Todas as funções percorrem a string uma única vez. As versões anteriores
 * faziam `str.slice(offset)` e criavam um novo segmentador a cada caractere,
 * o que tornava o custo quadrático: uma linha de 80 mil caracteres (JSON
 * minificado, log) levava segundos para quebrar e travava o leitor.
 */
const ANSI_SEQUENCE = /\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g;
const SGR_SEQUENCE = /^\x1B\[[0-9;]*m$/;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export type AnsiToken = { ansi: true; text: string } | { ansi: false; text: string };

export function stripAnsi(text: string): string {
  return text.replace(ANSI_SEQUENCE, "");
}

/**
 * Percorre a string devolvendo, em ordem, sequências ANSI inteiras e grafemas.
 * É preguiçoso: quem para no meio (truncateAnsi) não paga pelo resto da linha.
 */
export function* iterateAnsi(str: string): Generator<AnsiToken> {
  let last = 0;
  for (const match of str.matchAll(ANSI_SEQUENCE)) {
    const index = match.index ?? 0;
    if (index > last) yield* iterateGraphemes(str.slice(last, index));
    yield { ansi: true, text: match[0] };
    last = index + match[0].length;
  }
  if (last < str.length) yield* iterateGraphemes(last === 0 ? str : str.slice(last));
}

function* iterateGraphemes(text: string): Generator<AnsiToken> {
  for (const part of graphemeSegmenter.segment(text)) {
    yield { ansi: false, text: part.segment };
  }
}

/**
 * Converte tabulações em espaços até a próxima parada de tabulação, ignorando
 * sequências ANSI. `Bun.stringWidth("\t")` é 0, então sem esta etapa linhas
 * com TAB ultrapassam a largura calculada e quebram o layout do terminal.
 */
export function expandTabsAnsi(str: string, tabSize = TAB_SIZE): string {
  if (!str.includes("\t")) return str;

  let result = "";
  let column = 0;
  for (const token of iterateAnsi(str)) {
    if (token.ansi) {
      result += token.text;
    } else if (token.text === "\t") {
      const spaces = tabSize - (column % tabSize);
      result += " ".repeat(spaces);
      column += spaces;
    } else {
      result += token.text;
      column += Bun.stringWidth(token.text);
    }
  }
  return result;
}

/**
 * Quebra uma linha em segmentos visuais sem perder texto, sequências ANSI ou
 * grafemas Unicode. Estilos SGR ativos são reaplicados na linha seguinte.
 */
export function wrapAnsi(str: string, maxWidth: number): string[] {
  if (maxWidth <= 0 || str.length === 0) return [""];

  const tokens = Array.from(iterateAnsi(str));
  const widths = tokens.map((token) => (token.ansi ? 0 : Bun.stringWidth(token.text)));

  const lines: string[] = [];
  const activeSgr: string[] = [];
  let currentLine = "";
  let currentWidth = 0;
  let index = 0;
  let lineHasNonWhitespace = false;
  let lastBreak: { index: number; line: string; activeSgr: string[] } | null = null;

  const pushLine = (line: string, styles: string[]) => {
    lines.push(styles.length > 0 ? line + "\x1B[0m" : line);
    currentLine = activeSgr.join("");
    currentWidth = 0;
    lineHasNonWhitespace = false;
    lastBreak = null;
  };

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.ansi) {
      currentLine += token.text;
      index++;
      if (SGR_SEQUENCE.test(token.text)) {
        const parameters = token.text.slice(2, -1);
        if (parameters === "" || parameters.split(";").includes("0")) {
          activeSgr.length = 0;
        } else {
          activeSgr.push(token.text);
        }
      }
      continue;
    }

    const segmentWidth = widths[index];
    if (currentWidth > 0 && currentWidth + segmentWidth > maxWidth) {
      if (lastBreak) {
        const breakPoint: { index: number; line: string; activeSgr: string[] } = lastBreak;
        activeSgr.splice(0, activeSgr.length, ...breakPoint.activeSgr);
        index = breakPoint.index;
        pushLine(breakPoint.line, breakPoint.activeSgr);
        continue;
      }
      pushLine(currentLine, activeSgr);
    }

    currentLine += token.text;
    currentWidth += segmentWidth;
    index++;

    if (/^\s+$/u.test(token.text)) {
      if (lineHasNonWhitespace) {
        lastBreak = { index, line: currentLine, activeSgr: [...activeSgr] };
      }
    } else {
      lineHasNonWhitespace = true;
    }
  }

  lines.push(currentLine);
  return lines;
}

/**
 * Trunca uma string contendo códigos ANSI sem quebrar sequências nem
 * ultrapassar a largura visual informada.
 */
export function truncateAnsi(str: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";

  let visualWidth = 0;
  let result = "";
  let truncated = false;

  for (const token of iterateAnsi(str)) {
    if (token.ansi) {
      result += token.text;
      continue;
    }
    const segmentWidth = Bun.stringWidth(token.text);
    if (visualWidth + segmentWidth > maxWidth) {
      truncated = true;
      break;
    }
    result += token.text;
    visualWidth += segmentWidth;
  }

  // Reseta cores caso tenha sido cortado com cor ativa
  if (truncated && result.includes("\x1B[")) {
    result += "\x1B[0m";
  }
  return result;
}

export function padToWidth(text: string, width: number): string {
  const truncated = truncateAnsi(text, width);
  const missingWidth = Math.max(0, width - Bun.stringWidth(stripAnsi(truncated)));
  return truncated + " ".repeat(missingWidth);
}
