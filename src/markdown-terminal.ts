import { Lexer, type Token, type Tokens } from "marked";
import * as nodeEmoji from "node-emoji";
import type { Colors } from "picocolors/types";
import {
  expandTabsAnsi,
  HYPERLINK_CLOSE,
  hyperlinkOpen,
  normalizeAnsiLines,
  stripAnsi,
  visibleWidth,
  withBaseStyle,
  wrapAnsi,
} from "./ansi.ts";
import { highlightToAnsiLines } from "./highlight.ts";

/**
 * Renderizador de Markdown para o terminal.
 *
 * Substitui o `marked-terminal`, que tinha defeitos que não dava para corrigir
 * por fora: injetava `ESC[0m` no começo de cada parágrafo (apagando o estilo
 * de citações), mostrava o marcador interno `*#COLON|*` em cabeçalhos de
 * tabela com `código:`, sumia com as linhas `---` quando a saída não era um
 * terminal e não tinha alertas do GitHub nem quebra de linha com recuo.
 *
 * Como funciona: o `marked` só faz a análise (tokens); aqui cada bloco vira
 * uma lista de linhas já quebradas na largura disponível, com recuo correto
 * em listas e citações. Toda linha devolvida é autocontida (ver ansi.ts).
 */

export interface MarkdownTerminalOptions {
  /** Colunas disponíveis. `Infinity` não quebra parágrafos (saída redirecionada). */
  width: number;
  /** Links http(s)/mailto viram hyperlinks clicáveis (OSC 8). */
  hyperlinks: boolean;
  colors: Colors;
}

export interface TerminalHeading {
  title: string;
  level: number;
  lineIndex: number;
}

export interface RenderedMarkdown {
  lines: string[];
  headings: TerminalHeading[];
  /** Texto de cada linha sem cores e sem os prefixos decorativos (marcador, barra, recuo). */
  searchLines: string[];
  /**
   * A linha continua o parágrafo da linha anterior (foi quebrada só por
   * falta de espaço). A busca junta essas linhas para achar frases que
   * caíram na quebra.
   */
  continued: boolean[];
}

interface Block {
  lines: string[];
  headings: TerminalHeading[];
  /** Colunas de prefixo decorativo no começo de cada linha (marcador de lista, "│ ", recuo). */
  prefix: number[];
  continued: boolean[];
}

function makeBlock(lines: string[], continued?: boolean[], headings: TerminalHeading[] = []): Block {
  return { lines, headings, prefix: lines.map(() => 0), continued: continued ?? lines.map(() => false) };
}

function pushBlankLine(target: Block): void {
  target.lines.push("");
  target.prefix.push(0);
  target.continued.push(false);
}

/** Acrescenta `prefixFirst` à primeira linha e `prefixRest` às demais (mesma largura visível). */
function withPrefix(block: Block, prefixFirst: string, prefixRest: string): Block {
  const width = stripAnsi(prefixFirst).length;
  return {
    lines: block.lines.map((line, index) => (index === 0 ? prefixFirst : prefixRest) + line),
    headings: block.headings,
    prefix: block.prefix.map((value) => value + width),
    continued: block.continued,
  };
}

/** Largura mínima de um bloco aninhado (listas muito profundas não ficam com 1 coluna). */
const MIN_BLOCK_WIDTH = 12;

const ALERTS: Record<string, { label: string; color: keyof Colors }> = {
  NOTE: { label: "Nota", color: "blue" },
  TIP: { label: "Dica", color: "green" },
  IMPORTANT: { label: "Importante", color: "magenta" },
  WARNING: { label: "Atenção", color: "yellow" },
  CAUTION: { label: "Cuidado", color: "red" },
};
const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘",
  rsquo: "’", bull: "•", middot: "·", deg: "°", plusmn: "±", times: "×", divide: "÷", euro: "€",
  pound: "£", yen: "¥", cent: "¢", sect: "§", para: "¶", larr: "←", rarr: "→", uarr: "↑", darr: "↓",
  harr: "↔", rArr: "⇒", lArr: "⇐", hArr: "⇔", check: "✓", cross: "✗", ne: "≠", le: "≤", ge: "≥",
  infin: "∞", micro: "µ", ordf: "ª", ordm: "º", shy: "", zwj: "‍", zwnj: "‌", ensp: " ",
  emsp: " ", thinsp: " ",
};

/**
 * Decodifica entidades HTML do texto (`&amp;` → `&`, `&#233;` → `é`). Códigos
 * de controle (ex.: `&#27;`, o ESC) ficam como texto: decodificá-los deixaria
 * um documento enviar sequências de escape ao terminal.
 */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g, (entity, body: string) => {
    if (body.startsWith("#")) {
      const codePoint = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      const isControl = codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
      const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
      if (!Number.isFinite(codePoint) || isControl || isSurrogate || codePoint > 0x10ffff) return entity;
      return String.fromCodePoint(codePoint);
    }
    return NAMED_ENTITIES[body] ?? entity;
  });
}

/**
 * Front matter YAML (`---` no topo do arquivo) seria lido como linha
 * horizontal + título; aqui ele vira um bloco de código YAML.
 */
export function frontMatterToCodeBlock(markdown: string): string {
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(markdown);
  if (!match) return markdown;
  return "```yaml\n" + match[1] + "\n```\n\n" + markdown.slice(match[0].length);
}

function isClickableUrl(href: string): boolean {
  return /^(?:https?:\/\/|mailto:)[^\s\x00-\x1F\x7F-\x9F]+$/i.test(href) && href.length <= 2000;
}

export function renderMarkdownToLines(markdown: string, options: MarkdownTerminalOptions): RenderedMarkdown {
  const renderer = new TerminalMarkdownRenderer(options);
  const tokens = new Lexer({ gfm: true }).lex(frontMatterToCodeBlock(markdown));
  const block = renderer.blocks(tokens, options.width, 0);
  return {
    lines: block.lines,
    headings: block.headings,
    searchLines: block.lines.map((line, index) => stripAnsi(line).slice(block.prefix[index])),
    continued: block.continued,
  };
}

class TerminalMarkdownRenderer {
  private readonly c: Colors;

  constructor(private readonly options: MarkdownTerminalOptions) {
    this.c = options.colors;
  }

  // ------------------------------------------------------------------ blocos

  blocks(tokens: Token[], width: number, depth: number): Block {
    const result = makeBlock([]);
    for (const token of tokens) {
      const block = this.block(token, width, depth);
      if (!block || block.lines.length === 0) continue;
      if (result.lines.length > 0) pushBlankLine(result);
      appendBlock(result, block);
    }
    return result;
  }

  private block(token: Token, width: number, depth: number): Block | null {
    switch (token.type) {
      case "space":
      case "def":
        return null;
      case "heading":
        return this.heading(token as Tokens.Heading, width);
      case "paragraph":
        return this.wrapText(this.inline((token as Tokens.Paragraph).tokens), width);
      case "text": {
        const text = token as Tokens.Text;
        return this.wrapText(text.tokens ? this.inline(text.tokens) : this.prose(text.text), width);
      }
      case "code":
        return this.code(token as Tokens.Code);
      case "blockquote":
        return this.blockquote(token as Tokens.Blockquote, width, depth);
      case "list":
        return this.list(token as Tokens.List, width, depth);
      case "table":
        return makeBlock(this.table(token as Tokens.Table, width));
      case "hr":
        return makeBlock([this.c.dim("─".repeat(Number.isFinite(width) ? width : 80))]);
      case "html":
        return this.htmlBlock((token as Tokens.HTML).text, width);
      default: {
        const text = (token as { text?: string }).text;
        return text ? this.wrapText(this.prose(text), width) : null;
      }
    }
  }

  private heading(token: Tokens.Heading, width: number): Block {
    const text = this.inline(token.tokens);
    const c = this.c;
    const style =
      token.depth === 1
        ? (value: string) => c.bold(c.magenta(value))
        : token.depth === 2
        ? (value: string) => c.bold(c.green(value))
        : token.depth === 3
        ? (value: string) => c.bold(c.yellow(value))
        : (value: string) => c.bold(c.cyan(value));
    const title = stripAnsi(text).replace(/\s+/g, " ").trim();
    const block = this.wrapText(style(text), width);
    block.headings = title ? [{ title, level: token.depth, lineIndex: 0 }] : [];
    return block;
  }

  /**
   * Quebra o texto na largura. "\n" (quebra forçada) inicia uma linha nova;
   * as quebras por falta de espaço ficam marcadas como continuação.
   */
  private wrapText(text: string, width: number): Block {
    const lines: string[] = [];
    const continued: boolean[] = [];
    for (const hardLine of normalizeAnsiLines(text.split("\n"))) {
      wrapAnsi(hardLine, width).forEach((line, index) => {
        lines.push(line);
        continued.push(index > 0);
      });
    }
    return makeBlock(lines, continued);
  }

  private code(token: Tokens.Code): Block {
    const language = token.lang?.trim().split(/\s+/)[0];
    const code = token.text.replace(/\n+$/, "");
    const highlighted = this.c.isColorSupported ? highlightToAnsiLines(code, language) : null;
    const lines = highlighted ?? code.split("\n");
    return withPrefix(makeBlock(lines.map((line) => expandTabsAnsi(line))), "  ", "  ");
  }

  private blockquote(token: Tokens.Blockquote, width: number, depth: number): Block {
    const c = this.c;
    let tokens = token.tokens;
    let alert: { label: string; color: keyof Colors } | null = null;

    const first = tokens[0];
    if (first?.type === "paragraph") {
      const paragraph = first as Tokens.Paragraph;
      const marker = ALERT_MARKER.exec(paragraph.text);
      if (marker) {
        alert = ALERTS[marker[1].toUpperCase()];
        const rest = paragraph.text.slice(marker[0].length);
        const restTokens: Token[] = rest.trim() ? [{ ...paragraph, text: rest, raw: rest, tokens: Lexer.lexInline(rest) }] : [];
        tokens = [...restTokens, ...tokens.slice(1)];
      }
    }

    const innerWidth = Math.max(MIN_BLOCK_WIDTH, width - 2);
    const inner = this.blocks(tokens, innerWidth, depth + 1);

    if (alert) {
      const color = c[alert.color] as (value: string) => string;
      const bar = color("│ ");
      const result = withPrefix(makeBlock([c.bold(color(alert.label))]), bar, bar);
      appendBlock(result, withPrefix(inner, bar, bar));
      return result;
    }

    const bar = c.dim("│ ");
    const italic = c.isColorSupported ? { ...inner, lines: inner.lines.map((line) => withBaseStyle(line, "3")) } : inner;
    return withPrefix(italic, bar, bar);
  }

  private list(token: Tokens.List, width: number, depth: number): Block {
    const c = this.c;
    const start = token.ordered ? Number(token.start) || 1 : 1;
    const markers = token.items.map((item, index) => {
      if (item.task) return item.checked ? "[x]" : "[ ]";
      if (token.ordered) return `${start + index}.`;
      return ["•", "◦", "▪"][depth % 3];
    });
    const markerWidth = Math.max(...markers.map((marker) => visibleWidth(marker))) + 1;
    const innerWidth = Math.max(MIN_BLOCK_WIDTH, width - markerWidth);
    const result = makeBlock([]);

    token.items.forEach((item, index) => {
      if (index > 0 && token.loose) pushBlankLine(result);
      const body = this.listItemBody(item, innerWidth, depth);
      const rawMarker = markers[index];
      const padded = token.ordered && !item.task ? rawMarker.padStart(markerWidth - 1) + " " : rawMarker.padEnd(markerWidth);
      const marker = item.task ? (item.checked ? c.green(padded) : c.dim(padded)) : c.dim(padded);
      appendBlock(result, withPrefix(body, marker, " ".repeat(markerWidth)));
    });
    return result;
  }

  private listItemBody(item: Tokens.ListItem, width: number, depth: number): Block {
    const result = makeBlock([]);
    for (const token of item.tokens) {
      const block = token.type === "list" ? this.list(token as Tokens.List, width, depth + 1) : this.block(token, width, depth + 1);
      if (!block || block.lines.length === 0) continue;
      // Itens "soltos" (com linha em branco entre parágrafos) mantêm o espaço
      if (result.lines.length > 0 && item.loose) pushBlankLine(result);
      appendBlock(result, block);
    }
    if (result.lines.length === 0) pushBlankLine(result);
    return result;
  }

  private table(token: Tokens.Table, width: number): string[] {
    const c = this.c;
    const header = token.header.map((cell) => this.inline(cell.tokens));
    const rows = token.rows.map((row) => row.map((cell) => this.inline(cell.tokens)));
    const columns = header.length;
    if (columns === 0) return [];

    const cellLines = (text: string) => normalizeAnsiLines(text.split("\n"));
    const natural = Array.from({ length: columns }, (_, column) => {
      const cells = [header[column], ...rows.map((row) => row[column] ?? "")];
      return Math.max(1, ...cells.flatMap((cell) => cellLines(cell).map((line) => visibleWidth(line))));
    });

    // Cada coluna gasta 3 colunas de borda/espaço ("│ " + " "), mais a borda final
    const overhead = columns * 3 + 1;
    const widths = Number.isFinite(width) ? fitColumns(natural, Math.max(columns * 3, width - overhead)) : natural;

    const align = (text: string, column: number) => {
      const missing = Math.max(0, widths[column] - visibleWidth(text));
      const alignment = token.align[column];
      if (alignment === "right") return " ".repeat(missing) + text;
      if (alignment === "center") return " ".repeat(Math.floor(missing / 2)) + text + " ".repeat(Math.ceil(missing / 2));
      return text + " ".repeat(missing);
    };

    const renderRow = (cells: string[], isHeader: boolean): { lines: string[]; wrapped: boolean } => {
      const wrappedCells = Array.from({ length: columns }, (_, column) =>
        cellLines(cells[column] ?? "").flatMap((line) => wrapAnsi(isHeader ? c.bold(line) : line, widths[column]))
      );
      const height = Math.max(...wrappedCells.map((lines) => lines.length));
      const lines: string[] = [];
      for (let lineIndex = 0; lineIndex < height; lineIndex++) {
        const parts = wrappedCells.map((lines, column) => align(lines[lineIndex] ?? "", column));
        lines.push(c.dim("│ ") + parts.join(c.dim(" │ ")) + c.dim(" │"));
      }
      return { lines, wrapped: height > 1 };
    };

    const border = (left: string, middle: string, right: string) =>
      c.dim(left + widths.map((columnWidth) => "─".repeat(columnWidth + 2)).join(middle) + right);

    const headerRow = renderRow(header, true);
    const bodyRows = rows.map((row) => renderRow(row, false));
    // Linhas divisórias entre as linhas da tabela só quando alguma célula quebrou
    const separateRows = bodyRows.some((row) => row.wrapped);

    const lines = [border("┌", "┬", "┐"), ...headerRow.lines, border("├", "┼", "┤")];
    bodyRows.forEach((row, index) => {
      if (index > 0 && separateRows) lines.push(border("├", "┼", "┤"));
      lines.push(...row.lines);
    });
    lines.push(border("└", "┴", "┘"));
    return lines;
  }

  private htmlBlock(html: string, width: number): Block | null {
    const withoutComments = html.replace(/<!--[\s\S]*?(?:-->|$)/g, "").replace(/\n+$/, "");
    if (!withoutComments.trim()) return null;
    return this.wrapText(this.c.dim(withoutComments), width);
  }

  // ---------------------------------------------------------------- inline

  private inline(tokens: Token[] | undefined): string {
    if (!tokens) return "";
    const c = this.c;
    let result = "";
    for (const token of tokens) {
      switch (token.type) {
        case "text": {
          const text = token as Tokens.Text;
          result += text.tokens ? this.inline(text.tokens) : this.prose(text.text);
          break;
        }
        case "escape":
          result += (token as Tokens.Escape).text;
          break;
        case "strong":
          result += c.bold(this.inline((token as Tokens.Strong).tokens));
          break;
        case "em":
          result += c.italic(this.inline((token as Tokens.Em).tokens));
          break;
        case "del":
          result += c.strikethrough(this.inline((token as Tokens.Del).tokens));
          break;
        case "codespan":
          result += c.yellow((token as Tokens.Codespan).text);
          break;
        case "br":
          result += "\n";
          break;
        case "link":
          result += this.link(token as Tokens.Link);
          break;
        case "image":
          result += this.image(token as Tokens.Image);
          break;
        case "html":
          result += this.inlineHtml((token as Tokens.HTML).text);
          break;
        default:
          result += this.prose((token as { text?: string; raw?: string }).text ?? token.raw ?? "");
          break;
      }
    }
    return result;
  }

  /** Texto corrido: quebra suave vira espaço, entidades e :emoji: são convertidos. */
  private prose(text: string): string {
    return nodeEmoji.emojify(decodeEntities(text.replace(/[ \t]*\n[ \t]*/g, " ")));
  }

  private link(token: Tokens.Link): string {
    const c = this.c;
    const label = this.inline(token.tokens) || token.href;
    const href = token.href.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
    const styled = c.blue(c.underline(label));
    if (this.options.hyperlinks && c.isColorSupported && isClickableUrl(href)) {
      return hyperlinkOpen(href) + styled + HYPERLINK_CLOSE;
    }
    const plainLabel = stripAnsi(label);
    const isAutolink = plainLabel === href || `mailto:${plainLabel}` === href;
    return isAutolink ? styled : styled + c.dim(` (${href})`);
  }

  private image(token: Tokens.Image): string {
    const c = this.c;
    const description = decodeEntities(token.text || "").trim() || "sem descrição";
    const label = c.dim(`[imagem: ${description}]`);
    const href = token.href.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
    if (this.options.hyperlinks && c.isColorSupported && isClickableUrl(href)) {
      return hyperlinkOpen(href) + label + HYPERLINK_CLOSE;
    }
    return href ? label + c.dim(` (${href})`) : label;
  }

  private inlineHtml(html: string): string {
    if (/^<br\s*\/?>$/i.test(html)) return "\n";
    if (html.startsWith("<!--")) return "";
    return this.c.dim(html);
  }
}

function appendBlock(target: Block, block: Block): void {
  const offset = target.lines.length;
  // Laços em vez de push(...array): documentos enormes passariam do limite de argumentos
  for (let index = 0; index < block.lines.length; index++) {
    target.lines.push(block.lines[index]);
    target.prefix.push(block.prefix[index]);
    target.continued.push(block.continued[index]);
  }
  for (const heading of block.headings) target.headings.push({ ...heading, lineIndex: heading.lineIndex + offset });
}

/**
 * Reduz as colunas mais largas até a soma caber em `available`, preservando
 * as estreitas (as primeiras a perder espaço são as que mais têm).
 */
export function fitColumns(natural: number[], available: number): number[] {
  const total = natural.reduce((sum, value) => sum + value, 0);
  if (total <= available) return natural;
  const minimum = 3;
  // Maior limite L tal que soma(min(natural, L)) <= disponível
  let low = minimum;
  let high = Math.max(...natural);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const sum = natural.reduce((acc, value) => acc + Math.min(value, middle), 0);
    if (sum <= available) low = middle;
    else high = middle - 1;
  }
  const widths = natural.map((value) => Math.max(Math.min(value, minimum), Math.min(value, low)));
  // Distribui a sobra (por causa do arredondamento) entre as colunas cortadas
  let spare = available - widths.reduce((sum, value) => sum + value, 0);
  for (let index = 0; spare > 0 && index < widths.length; index++) {
    if (widths[index] < natural[index]) {
      widths[index]++;
      spare--;
    }
  }
  return widths;
}
