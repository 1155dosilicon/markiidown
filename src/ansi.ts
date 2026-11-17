import { TAB_SIZE } from "./utils.ts";

/**
 * Texto com sequências ANSI: cores e estilos (SGR, `ESC [ ... m`) e hyperlinks
 * (OSC 8, `ESC ] 8 ; ; url BEL`).
 *
 * Regra que todo o leitor segue: **cada linha entregue à tela é autocontida**.
 * Ela abre os estilos de que precisa no começo e fecha tudo no fim (reset de
 * SGR e fechamento do hyperlink). Assim uma linha pode ser desenhada sozinha,
 * em qualquer posição e em qualquer ordem, sem herdar estilo da linha de cima
 * nem vazar estilo para a de baixo, para a barra de status ou para o prompt.
 *
 * Todas as funções percorrem a string uma vez. Trechos ASCII (o caso comum)
 * não passam pelo Intl.Segmenter, que é caro; o resto é dividido em grafemas
 * para que emoji, acentos combinados e CJK (2 colunas) nunca sejam partidos.
 */

/** CSI (`ESC [`), OSC (`ESC ]`, termina em BEL ou ST) e DCS/SOS/PM/APC (terminam em ST). */
export const ANSI_PATTERN = /\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1B]*(?:\x07|\x1B\\)|[PX^_][^\x1B]*\x1B\\)/g;

const SGR_PATTERN = /^\x1B\[([0-9;:]*)m$/;
const OSC8_PATTERN = /^\x1B\]8;([^;\x07\x1B]*);([^\x07\x1B]*)(?:\x07|\x1B\\)$/;
const PRINTABLE_ASCII = /^[\x20-\x7E]*$/;
/** Pontos de quebra: espaço comum e TAB (o espaço não separável U+00A0 não quebra). */
const WHITESPACE = /^[ \t]+$/;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function stripAnsi(text: string): string {
  return text.includes("\x1B") ? text.replace(ANSI_PATTERN, "") : text;
}

/** Largura visível em colunas (ignora sequências ANSI). */
export function visibleWidth(text: string): number {
  return Bun.stringWidth(text);
}

// ---------------------------------------------------------------------------
// Estado de estilo (SGR) e hyperlink
// ---------------------------------------------------------------------------

export interface SgrState {
  readonly bold: boolean;
  readonly dim: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly inverse: boolean;
  readonly strikethrough: boolean;
  /** Parâmetro da cor do texto ("31", "38;5;208", "38;2;1;2;3") ou null. */
  readonly fg: string | null;
  readonly bg: string | null;
}

export const DEFAULT_SGR: SgrState = Object.freeze({
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
  strikethrough: false,
  fg: null,
  bg: null,
});

/** Estado completo que precisa ser reaberto numa nova linha. */
export interface StyleContext {
  readonly sgr: SgrState;
  /** Sequência OSC 8 de abertura do hyperlink ativo, ou null. */
  readonly link: string | null;
}

export const DEFAULT_CONTEXT: StyleContext = Object.freeze({ sgr: DEFAULT_SGR, link: null });

export const HYPERLINK_CLOSE = "\x1B]8;;\x07";

export function isDefaultSgr(state: SgrState): boolean {
  return state === DEFAULT_SGR || sgrOpen(state) === "";
}

/** Aplica os parâmetros de uma sequência SGR (sem o `ESC [` e o `m`). */
export function applySgr(state: SgrState, parameterText: string): SgrState {
  const params = parameterText === "" ? ["0"] : parameterText.split(";");
  let next: { -readonly [K in keyof SgrState]: SgrState[K] } | null = null;
  const edit = () => (next ??= { ...state });

  for (let i = 0; i < params.length; i++) {
    // Subparâmetros com ":" (ex.: "4:3" sublinhado ondulado, "38:5:208")
    const sub = params[i].split(":");
    const code = Number.parseInt(sub[0] || "0", 10);

    if (code === 0) {
      next = { ...DEFAULT_SGR };
      continue;
    }
    if (code === 38 || code === 48 || code === 58) {
      let color: string | null = null;
      if (sub.length > 1) {
        // Forma com dois-pontos: 38:5:n ou 38:2::r:g:b / 38:2:r:g:b
        const values = sub.slice(1).filter((value) => value !== "");
        if (values[0] === "5" && values.length >= 2) color = `${code};5;${values[1]}`;
        else if (values[0] === "2" && values.length >= 4) color = `${code};2;${values.slice(-3).join(";")}`;
      } else if (params[i + 1] === "5" && params[i + 2] !== undefined) {
        color = `${code};5;${params[i + 2]}`;
        i += 2;
      } else if (params[i + 1] === "2" && params[i + 4] !== undefined) {
        color = `${code};2;${params[i + 2]};${params[i + 3]};${params[i + 4]}`;
        i += 4;
      }
      if (color && code === 38) edit().fg = color;
      else if (color && code === 48) edit().bg = color;
      continue;
    }

    switch (code) {
      case 1:
        edit().bold = true;
        break;
      case 2:
        edit().dim = true;
        break;
      case 3:
        edit().italic = true;
        break;
      case 4:
      case 21:
        edit().underline = sub[1] !== "0";
        break;
      case 7:
        edit().inverse = true;
        break;
      case 9:
        edit().strikethrough = true;
        break;
      case 22:
        edit().bold = false;
        edit().dim = false;
        break;
      case 23:
        edit().italic = false;
        break;
      case 24:
        edit().underline = false;
        break;
      case 27:
        edit().inverse = false;
        break;
      case 29:
        edit().strikethrough = false;
        break;
      case 39:
        edit().fg = null;
        break;
      case 49:
        edit().bg = null;
        break;
      default:
        if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) edit().fg = String(code);
        else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) edit().bg = String(code);
        // Demais códigos (piscar, oculto, sobrelinhado...) não são usados
        break;
    }
  }

  if (!next) return state;
  const result = next as SgrState;
  return sgrOpen(result) === "" ? DEFAULT_SGR : Object.freeze(result);
}

/** Sequência que liga exatamente este estado a partir do padrão ("" se padrão). */
export function sgrOpen(state: SgrState): string {
  const params: string[] = [];
  if (state.bold) params.push("1");
  if (state.dim) params.push("2");
  if (state.italic) params.push("3");
  if (state.underline) params.push("4");
  if (state.inverse) params.push("7");
  if (state.strikethrough) params.push("9");
  if (state.fg) params.push(state.fg);
  if (state.bg) params.push(state.bg);
  return params.length > 0 ? `\x1B[${params.join(";")}m` : "";
}

/** Atualiza o contexto com uma sequência ANSI inteira (outras sequências não mudam nada). */
export function updateContext(context: StyleContext, sequence: string): StyleContext {
  const sgr = SGR_PATTERN.exec(sequence);
  if (sgr) {
    const nextSgr = applySgr(context.sgr, sgr[1]);
    return nextSgr === context.sgr ? context : { sgr: nextSgr, link: context.link };
  }
  const osc8 = OSC8_PATTERN.exec(sequence);
  if (osc8) {
    const link = osc8[2] === "" ? null : sequence;
    return link === context.link ? context : { sgr: context.sgr, link };
  }
  return context;
}

/** Reabre o contexto no começo de uma linha. */
export function openContext(context: StyleContext): string {
  return sgrOpen(context.sgr) + (context.link ?? "");
}

/** Fecha o contexto no fim de uma linha (hyperlink e estilos). */
export function closeContext(context: StyleContext): string {
  return (context.link ? HYPERLINK_CLOSE : "") + (isDefaultSgr(context.sgr) ? "" : "\x1B[0m");
}

/** Abre um hyperlink OSC 8 (terminado em BEL, o formato mais aceito). */
export function hyperlinkOpen(uri: string): string {
  return `\x1B]8;;${uri}\x07`;
}

/**
 * Torna cada linha autocontida: o estilo que continua de uma linha para a
 * outra (ex.: uma citação em itálico com várias linhas) é fechado no fim de
 * cada linha e reaberto no começo da seguinte. Linhas que já são autocontidas
 * não mudam.
 */
export function normalizeAnsiLines(lines: string[]): string[] {
  let context = DEFAULT_CONTEXT;
  return lines.map((line) => {
    const prefix = openContext(context);
    if (line.includes("\x1B")) {
      for (const match of line.matchAll(ANSI_PATTERN)) context = updateContext(context, match[0]);
    }
    return prefix + line + closeContext(context);
  });
}

// ---------------------------------------------------------------------------
// Divisão em unidades (sequência ANSI ou grafema com sua largura)
// ---------------------------------------------------------------------------

interface Units {
  texts: string[];
  /** Largura em colunas; -1 marca uma sequência ANSI. */
  widths: number[];
}

function pushPlain(units: Units, text: string): void {
  if (PRINTABLE_ASCII.test(text)) {
    for (let i = 0; i < text.length; i++) {
      units.texts.push(text[i]);
      units.widths.push(1);
    }
    return;
  }
  for (const { segment } of graphemeSegmenter.segment(text)) {
    units.texts.push(segment);
    units.widths.push(Bun.stringWidth(segment));
  }
}

function toUnits(str: string): Units {
  const units: Units = { texts: [], widths: [] };
  if (!str.includes("\x1B")) {
    pushPlain(units, str);
    return units;
  }
  let last = 0;
  for (const match of str.matchAll(ANSI_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) pushPlain(units, str.slice(last, index));
    units.texts.push(match[0]);
    units.widths.push(-1);
    last = index + match[0].length;
  }
  if (last < str.length) pushPlain(units, str.slice(last));
  return units;
}

/**
 * Converte tabulações em espaços até a próxima parada, ignorando sequências
 * ANSI. `Bun.stringWidth("\t")` é 0: sem esta etapa uma linha com TAB
 * ultrapassaria a largura calculada e quebraria o layout.
 */
export function expandTabsAnsi(str: string, tabSize = TAB_SIZE): string {
  if (!str.includes("\t")) return str;
  const { texts, widths } = toUnits(str);
  let result = "";
  let column = 0;
  for (let i = 0; i < texts.length; i++) {
    if (widths[i] < 0) {
      result += texts[i];
    } else if (texts[i] === "\t") {
      const spaces = tabSize - (column % tabSize);
      result += " ".repeat(spaces);
      column += spaces;
    } else {
      result += texts[i];
      column += widths[i];
    }
  }
  return result;
}

/**
 * Quebra uma linha em linhas visuais de no máximo `maxWidth` colunas, de
 * preferência nos espaços. Nenhum caractere, grafema ou sequência ANSI se
 * perde. Cada linha produzida é autocontida (veja o topo do arquivo).
 *
 * `continuationIndent` é colocado no começo das linhas de continuação
 * (recuo deslocado, usado para alinhar o texto quebrado de um item de lista
 * ou o código depois da numeração de linhas).
 */
export function wrapAnsi(str: string, maxWidth: number, continuationIndent = ""): string[] {
  return wrapAnsiDetailed(str, maxWidth, continuationIndent).lines;
}

/**
 * Como wrapAnsi, mas também informa onde cada linha visual começa no texto
 * visível original (posição em unidades UTF-16 de `stripAnsi(str)`). O leitor
 * usa isso para rolar até a linha visual exata de uma ocorrência da busca.
 */
export function wrapAnsiDetailed(
  str: string,
  maxWidth: number,
  continuationIndent = ""
): { lines: string[]; starts: number[] } {
  if (!Number.isFinite(maxWidth)) return { lines: [str], starts: [0] };
  const width = Math.max(1, Math.floor(maxWidth));
  if (str === "" || Bun.stringWidth(str) <= width) return { lines: [str], starts: [0] };

  const indentWidth = Bun.stringWidth(continuationIndent);
  // Se o recuo não deixa espaço para texto, ele é ignorado
  const indent = indentWidth < width ? continuationIndent : "";
  const continuationWidth = width - (indent ? indentWidth : 0);

  const { texts, widths } = toUnits(str);
  // Posição no texto visível em que cada unidade começa
  const plainOffsets: number[] = new Array(texts.length);
  let plain = 0;
  for (let k = 0; k < texts.length; k++) {
    plainOffsets[k] = plain;
    if (widths[k] >= 0) plain += texts[k].length;
  }

  const lines: string[] = [];
  const starts: number[] = [0];
  let context = DEFAULT_CONTEXT;
  let current = "";
  let currentWidth = 0;
  let available = width;
  let lineHasText = false;
  let skipLeadingSpace = false;
  let lineStartPending = false;
  // Ponto de quebra: depois do último espaço; `text` é a linha SEM esse espaço
  let lastBreak: { index: number; text: string; context: StyleContext } | null = null;
  let textBeforeSpaces: string | null = null;

  const startLine = () => {
    current = indent + openContext(context);
    currentWidth = 0;
    available = continuationWidth;
    lineHasText = false;
    lastBreak = null;
    textBeforeSpaces = null;
    lineStartPending = true;
  };

  let i = 0;
  while (i < texts.length) {
    const text = texts[i];
    const unitWidth = widths[i];

    if (unitWidth < 0) {
      current += text;
      context = updateContext(context, text);
      i++;
      continue;
    }

    if (skipLeadingSpace && WHITESPACE.test(text)) {
      i++;
      continue;
    }
    skipLeadingSpace = false;
    if (lineStartPending) {
      starts.push(plainOffsets[i]);
      lineStartPending = false;
    }

    if (currentWidth > 0 && currentWidth + unitWidth > available) {
      const breakPoint = lastBreak as { index: number; text: string; context: StyleContext } | null;
      if (breakPoint) {
        lines.push(breakPoint.text + closeContext(breakPoint.context));
        context = breakPoint.context;
        i = breakPoint.index;
      } else {
        lines.push(current + closeContext(context));
      }
      startLine();
      skipLeadingSpace = true;
      continue;
    }

    const isSpace = WHITESPACE.test(text);
    if (isSpace && lineHasText && textBeforeSpaces === null) textBeforeSpaces = current;
    current += text;
    currentWidth += unitWidth;
    i++;

    if (isSpace) {
      if (lineHasText) lastBreak = { index: i, text: textBeforeSpaces ?? current, context };
    } else {
      lineHasText = true;
      textBeforeSpaces = null;
    }
  }

  // Linha final só com espaços pulados: começa no fim do texto
  if (lineStartPending) starts.push(plain);
  lines.push(current + closeContext(context));
  return { lines, starts };
}

/**
 * Corta a string na largura visual informada sem partir sequências nem
 * grafemas. O que foi cortado não deixa estilo nem hyperlink abertos.
 */
export function truncateAnsi(str: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (Bun.stringWidth(str) <= maxWidth) return str;

  const { texts, widths } = toUnits(str);
  let context = DEFAULT_CONTEXT;
  let result = "";
  let visual = 0;
  for (let i = 0; i < texts.length; i++) {
    if (widths[i] < 0) {
      result += texts[i];
      context = updateContext(context, texts[i]);
      continue;
    }
    if (visual + widths[i] > maxWidth) break;
    result += texts[i];
    visual += widths[i];
  }
  return result + closeContext(context);
}

/**
 * Aplica um estilo de base à linha inteira (ex.: itálico numa citação) sem que
 * os estilos internos o desliguem: onde o texto define a própria cor, ela
 * vale; nos demais pontos vale a base. Negrito/itálico/etc. se somam.
 */
export function withBaseStyle(line: string, baseParameters: string): string {
  const base = applySgr(DEFAULT_SGR, baseParameters);
  if (isDefaultSgr(base)) return line;
  const { texts, widths } = toUnits(line);
  let content = DEFAULT_SGR;
  let emitted = "";
  let result = "";
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (widths[i] < 0) {
      const sgr = SGR_PATTERN.exec(text);
      if (sgr) content = applySgr(content, sgr[1]);
      else result += text; // hyperlinks e outras sequências passam como estão
      continue;
    }
    const merged = sgrOpen({
      bold: base.bold || content.bold,
      dim: base.dim || content.dim,
      italic: base.italic || content.italic,
      underline: base.underline || content.underline,
      inverse: base.inverse || content.inverse,
      strikethrough: base.strikethrough || content.strikethrough,
      fg: content.fg ?? base.fg,
      bg: content.bg ?? base.bg,
    });
    if (merged !== emitted) {
      result += (emitted ? "\x1B[0m" : "") + merged;
      emitted = merged;
    }
    result += text;
  }
  return emitted ? result + "\x1B[0m" : result;
}

/** Corta ou completa com espaços até a largura exata. */
export function padToWidth(text: string, width: number): string {
  const truncated = truncateAnsi(text, width);
  return truncated + " ".repeat(Math.max(0, width - Bun.stringWidth(truncated)));
}

/**
 * Marca com o estilo `open` os trechos [start, end) do texto visível (posições
 * em unidades UTF-16 do texto sem ANSI), mantendo as cores do resto da linha.
 * Usado para destacar as ocorrências da busca.
 */
export function highlightRanges(str: string, ranges: { start: number; end: number }[], open: string): string {
  if (ranges.length === 0) return str;
  const { texts, widths } = toUnits(str);

  // Para cada unidade de texto: ela está dentro de algum trecho marcado?
  const inside: boolean[] = new Array(texts.length).fill(false);
  let offset = 0;
  let rangeIndex = 0;
  for (let i = 0; i < texts.length; i++) {
    if (widths[i] < 0) continue;
    while (rangeIndex < ranges.length && offset >= ranges[rangeIndex].end) rangeIndex++;
    const range = ranges[rangeIndex];
    inside[i] = !!range && offset >= range.start && offset < range.end;
    offset += texts[i].length;
  }
  const nextTextInside = (from: number) => {
    for (let j = from; j < texts.length; j++) if (widths[j] >= 0) return inside[j];
    return false;
  };

  let context = DEFAULT_CONTEXT;
  let marking = false;
  let result = "";
  for (let i = 0; i < texts.length; i++) {
    if (widths[i] < 0) {
      result += texts[i];
      context = updateContext(context, texts[i]);
      // Uma cor do próprio texto no meio do trecho cobriria a marcação
      if (marking && SGR_PATTERN.test(texts[i]) && nextTextInside(i + 1)) result += open;
      continue;
    }
    if (inside[i] && !marking) result += open;
    if (!inside[i] && marking) result += "\x1B[0m" + sgrOpen(context.sgr);
    marking = inside[i];
    result += texts[i];
  }
  if (marking) result += "\x1B[0m" + sgrOpen(context.sgr);
  return result;
}
