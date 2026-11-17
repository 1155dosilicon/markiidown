import { statSync } from "node:fs";
import { basename } from "node:path";
import { padToWidth, truncateAnsi, visibleWidth } from "./ansi.ts";
import { colorEnabled, pc } from "./colors.ts";
import type { InputEvent, KeyEvent } from "./keys.ts";
import { writeFileSafely } from "./safe-write.ts";
import { processTerminal, type TerminalIO } from "./terminal-io.ts";
import {
  ENCODING_LABELS,
  encodeText,
  hasMixedLineEndings,
  readTextFile,
  UnrepresentableTextError,
  type TextEncodingName,
} from "./text-file.ts";
import { detectFileType, TAB_SIZE } from "./utils.ts";

export interface EditorResult {
  /** O arquivo foi gravado pelo menos uma vez nesta sessão. */
  saved: boolean;
  /** Ficaram alterações sem salvar (o usuário escolheu descartar). */
  modified: boolean;
}

export interface EditorOptions {
  filePath: string;
  /** Conteúdo inicial no lugar do arquivo (usado em testes). */
  initialContent?: string;
  terminal?: TerminalIO;
}

export type LineEnding = "\r\n" | "\n" | "\r";

const LINE_BREAK = /\r\n|\r|\n/;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Final de linha predominante do arquivo (CRLF no Windows, LF, ou CR do Mac
 * antigo). Sem quebras de linha, usa LF.
 */
export function detectLineEnding(content: string): LineEnding {
  const crlf = (content.match(/\r\n/g) ?? []).length;
  const lf = (content.match(/\n/g) ?? []).length - crlf;
  const cr = (content.match(/\r/g) ?? []).length - crlf;
  if (crlf === 0 && lf === 0 && cr === 0) return "\n";
  if (crlf >= lf && crlf >= cr) return "\r\n";
  return lf >= cr ? "\n" : "\r";
}

const LINE_ENDING_LABELS: Record<LineEnding, string> = { "\r\n": "CRLF", "\n": "LF", "\r": "CR" };

/*
 * O cursor é um índice na string (unidades UTF-16), mas a tela usa colunas:
 * TAB avança até a próxima parada, emoji/CJK ocupam 2 colunas e caracteres de
 * controle aparecem como um símbolo de 1 coluna (␛, ␀...). Todas as contas
 * de coluna passam por `cellOf`, então tela e cursor sempre concordam.
 */
function* graphemes(text: string): Generator<string> {
  for (const part of graphemeSegmenter.segment(text)) yield part.segment;
}

/** Como o grafema aparece na tela e quantas colunas ocupa. */
function cellOf(segment: string, column: number): { text: string; width: number; special: boolean } {
  if (segment === "\t") {
    const width = TAB_SIZE - (column % TAB_SIZE);
    return { text: " ".repeat(width), width, special: false };
  }
  const code = segment.codePointAt(0)!;
  if (segment.length === 1 && (code < 0x20 || code === 0x7f)) {
    // Mostrado como "Control Pictures" (␀ ␇ ␛ ...) em vez de ser enviado ao terminal
    return { text: code === 0x7f ? "␡" : String.fromCharCode(0x2400 + code), width: 1, special: true };
  }
  if (code >= 0x80 && code <= 0x9f) return { text: "�", width: 1, special: true };
  const width = Bun.stringWidth(segment);
  if (width === 0) return { text: "·", width: 1, special: true };
  return { text: segment, width, special: false };
}

export function displayColumn(line: string, index: number): number {
  let column = 0;
  for (const segment of graphemes(line.slice(0, index))) column += cellOf(segment, column).width;
  return column;
}

export function indexFromDisplayColumn(line: string, targetColumn: number): number {
  let column = 0;
  let index = 0;
  for (const segment of graphemes(line)) {
    const { width } = cellOf(segment, column);
    if (column + width > targetColumn) break;
    column += width;
    index += segment.length;
  }
  return index;
}

export function previousGraphemeIndex(line: string, index: number): number {
  let position = 0;
  for (const segment of graphemes(line)) {
    if (position + segment.length >= index) return position;
    position += segment.length;
  }
  return position;
}

export function nextGraphemeIndex(line: string, index: number): number {
  let position = 0;
  for (const segment of graphemes(line)) {
    if (position >= index) return position + segment.length;
    position += segment.length;
  }
  return line.length;
}

/**
 * Texto de tela da janela [startColumn, startColumn + width) da linha: TAB
 * vira espaços e caracteres de controle viram símbolos (nunca são enviados
 * ao terminal, onde um ESC do arquivo mudaria cores ou o título da janela).
 */
export function visibleLineSegment(line: string, startColumn: number, width: number): string {
  let column = 0;
  let result = "";
  const endColumn = startColumn + width;
  for (const segment of graphemes(line)) {
    const cell = cellOf(segment, column);
    const segmentEnd = column + cell.width;
    if (segmentEnd > startColumn && column < endColumn) {
      if (column >= startColumn && segmentEnd <= endColumn) {
        result += cell.special && colorEnabled ? pc.dim(cell.text) : cell.text;
      } else {
        // Caractere largo cortado pela borda da janela: preenche com espaços
        result += " ".repeat(Math.min(segmentEnd, endColumn) - Math.max(column, startColumn));
      }
    }
    column = segmentEnd;
    if (column >= endColumn) break;
  }
  return result;
}

/** Unidade de indentação do arquivo: TAB se ele já usa TAB, senão 2 ou 4 espaços. */
export function detectIndentUnit(lines: string[]): string {
  let tabs = 0;
  let twoSpaces = 0;
  let fourSpaces = 0;
  for (const line of lines) {
    if (line.startsWith("\t")) tabs++;
    else if (/^ {2}\S/.test(line)) twoSpaces++;
    else if (/^ {4}\S/.test(line)) fourSpaces++;
  }
  if (tabs > twoSpaces + fourSpaces) return "\t";
  if (twoSpaces === 0 && fourSpaces > 0) return "    ";
  return "  ";
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function nextWordIndex(line: string, index: number): number {
  let position = index;
  while (position < line.length && WORD_CHAR.test(line[position])) position++;
  while (position < line.length && !WORD_CHAR.test(line[position])) position++;
  return position === index ? Math.min(line.length, index + 1) : position;
}

function previousWordIndex(line: string, index: number): number {
  let position = index;
  while (position > 0 && !WORD_CHAR.test(line[position - 1])) position--;
  while (position > 0 && WORD_CHAR.test(line[position - 1])) position--;
  return position === index ? Math.max(0, index - 1) : position;
}

interface Snapshot {
  lines: string[];
  row: number;
  col: number;
  version: number;
}

/** Limite de memória do histórico: soma das linhas guardadas em todos os passos. */
const HISTORY_LINE_BUDGET = 2_000_000;
const HISTORY_MAX_STEPS = 1000;
/** Digitação contínua vira um único passo de desfazer, até uma pausa deste tamanho. */
const GROUP_PAUSE_MS = 1000;

/**
 * Editor de texto de terminal em tela cheia: navegação, edição, desfazer e
 * refazer, colagem, salvamento seguro preservando a codificação e o final de
 * linha do arquivo, e confirmação antes de sair com alterações.
 */
export async function runInteractiveEditor(options: EditorOptions): Promise<EditorResult> {
  const { filePath } = options;
  const terminal = options.terminal ?? processTerminal();
  const typeInfo = detectFileType(filePath);
  const fileName = basename(filePath).replace(/[\u0000-\u001F\u007F-\u009F]/g, "") || "arquivo";

  let rawContent = options.initialContent;
  let isNewFile = false;
  let encoding: TextEncodingName = "utf-8";
  let diskStamp: { mtimeMs: number; size: number } | null = null;

  if (rawContent === undefined) {
    let exists = false;
    try {
      exists = statSync(filePath).isFile();
    } catch {}
    if (exists) {
      // Carregar um binário como texto e salvar corromperia o arquivo
      if (typeInfo.isBinary) throw new Error(`Arquivos binários não podem ser editados: ${filePath}`);
      const decoded = await readTextFile(filePath);
      rawContent = decoded.text;
      encoding = decoded.encoding;
      diskStamp = readDiskStamp(filePath);
    } else {
      rawContent = "";
      isNewFile = true;
    }
  }

  const lineEnding = detectLineEnding(rawContent);
  let lines = rawContent.split(LINE_BREAK);
  if (lines.length === 0) lines = [""];
  const indentUnit = detectIndentUnit(lines);

  let row = 0;
  let col = 0;
  let preferredColumn = 0;
  let scrollTop = 0;
  let scrollLeft = 0;

  let version = 0;
  let versionCounter = 0;
  let savedVersion = 0;
  let wasSaved = false;
  const undoStack: Snapshot[] = [];
  const redoStack: Snapshot[] = [];
  let lastEdit: { kind: string; at: number; row: number } | null = null;

  type Prompt = "exit" | "overwrite" | "overwrite-and-exit" | null;
  let prompt: Prompt = null;
  let statusMessage: string | null = isNewFile
    ? "📄 Arquivo novo — Ctrl+S cria o arquivo no disco"
    : hasMixedLineEndings(rawContent)
    ? pc.yellow(`⚠️ Finais de linha misturados: ao salvar, todos viram ${LINE_ENDING_LABELS[lineEnding]}.`)
    : null;
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  let finished = false;
  let renderQueued = false;

  const isModified = () => version !== savedVersion;
  const totalRows = () => Math.max(3, terminal.rows());
  const totalColumns = () => Math.max(20, terminal.columns());
  const contentHeight = () => totalRows() - 2; // cabeçalho + rodapé
  const gutterDigits = () => Math.max(2, String(lines.length).length);
  const gutterWidth = () => gutterDigits() + 3; // " 12 │ "

  function syncPreferredColumn(): void {
    preferredColumn = displayColumn(lines[row], col);
  }

  function setStatus(message: string, durationMs = 3000): void {
    statusMessage = message;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusMessage = null;
      statusTimer = null;
      scheduleRender();
    }, durationMs);
  }

  // --------------------------------------------------------------- histórico

  function historyCost(stack: Snapshot[]): number {
    return stack.reduce((sum, snapshot) => sum + snapshot.lines.length, 0);
  }

  /**
   * Guarda o estado antes de uma alteração. Alterações seguidas do mesmo tipo
   * na mesma linha (digitar uma palavra, apagar com Backspace) formam um
   * único passo; espaço, Enter, pausa ou movimento do cursor fecham o passo.
   */
  function beginEdit(kind: "insert" | "delete" | "other", text = ""): void {
    const now = Date.now();
    const continuesGroup =
      kind !== "other" &&
      lastEdit !== null &&
      lastEdit.kind === kind &&
      lastEdit.row === row &&
      now - lastEdit.at < GROUP_PAUSE_MS &&
      !(kind === "insert" && /^\s$/.test(text));
    if (!continuesGroup) {
      undoStack.push({ lines: [...lines], row, col, version });
      while (undoStack.length > HISTORY_MAX_STEPS || (undoStack.length > 1 && historyCost(undoStack) > HISTORY_LINE_BUDGET)) {
        undoStack.shift();
      }
    }
    redoStack.length = 0;
    lastEdit = kind === "other" ? null : { kind, at: now, row };
    version = ++versionCounter;
  }

  function breakEditGroup(): void {
    lastEdit = null;
  }

  function restore(from: Snapshot[], to: Snapshot[]): void {
    const snapshot = from.pop();
    if (!snapshot) return;
    to.push({ lines: [...lines], row, col, version });
    lines = snapshot.lines;
    row = Math.min(lines.length - 1, snapshot.row);
    col = Math.min(lines[row].length, snapshot.col);
    version = snapshot.version;
    syncPreferredColumn();
    breakEditGroup();
  }

  // ----------------------------------------------------------------- edição

  function insertText(text: string, kind: "insert" | "other" = "insert"): void {
    const pieces = text.split(LINE_BREAK);
    beginEdit(pieces.length > 1 ? "other" : kind, text);
    const before = lines[row].slice(0, col);
    const after = lines[row].slice(col);
    if (pieces.length === 1) {
      lines[row] = before + text + after;
      col += text.length;
    } else {
      const inserted = [before + pieces[0], ...pieces.slice(1, -1), pieces[pieces.length - 1] + after];
      // Sem splice(...inserted): uma colagem de centenas de milhares de linhas
      // passaria do limite de argumentos de uma chamada
      lines = [...lines.slice(0, row), ...inserted, ...lines.slice(row + 1)];
      row += pieces.length - 1;
      col = pieces[pieces.length - 1].length;
    }
    syncPreferredColumn();
  }

  function newLineWithIndent(): void {
    beginEdit("other");
    const before = lines[row].slice(0, col);
    const after = lines[row].slice(col);
    const indent = /^[ \t]*/.exec(before)?.[0] ?? "";
    lines.splice(row, 1, before, indent + after);
    row++;
    col = indent.length;
    syncPreferredColumn();
  }

  function deleteBackward(word: boolean): void {
    if (col > 0) {
      beginEdit(word ? "other" : "delete");
      const start = word ? previousWordIndex(lines[row], col) : previousGraphemeIndex(lines[row], col);
      lines[row] = lines[row].slice(0, start) + lines[row].slice(col);
      col = start;
    } else if (row > 0) {
      beginEdit("other");
      const previousLength = lines[row - 1].length;
      lines[row - 1] += lines[row];
      lines.splice(row, 1);
      row--;
      col = previousLength;
    } else {
      return;
    }
    syncPreferredColumn();
  }

  function deleteForward(word: boolean): void {
    const line = lines[row];
    if (col < line.length) {
      beginEdit(word ? "other" : "delete");
      const end = word ? nextWordIndex(line, col) : nextGraphemeIndex(line, col);
      lines[row] = line.slice(0, col) + line.slice(end);
    } else if (row < lines.length - 1) {
      beginEdit("other");
      lines[row] += lines[row + 1];
      lines.splice(row + 1, 1);
    }
  }

  function dedentLine(): void {
    const line = lines[row];
    const removable = line.startsWith("\t") ? 1 : Math.min(indentUnit === "\t" ? TAB_SIZE : indentUnit.length, /^ */.exec(line)![0].length);
    if (removable === 0) return;
    beginEdit("other");
    lines[row] = line.slice(removable);
    col = Math.max(0, col - removable);
    syncPreferredColumn();
  }

  // ---------------------------------------------------------------- salvar

  function readDiskStamp(path: string): { mtimeMs: number; size: number } | null {
    try {
      const stats = statSync(path);
      return { mtimeMs: stats.mtimeMs, size: stats.size };
    } catch {
      return null;
    }
  }

  function changedOnDisk(): boolean {
    if (!diskStamp) return false;
    const current = readDiskStamp(filePath);
    return !!current && (current.mtimeMs !== diskStamp.mtimeMs || current.size !== diskStamp.size);
  }

  function save(): boolean {
    const content = lines.join(lineEnding);
    let message = pc.green(`💾 Salvo (${ENCODING_LABELS[encoding]}, ${LINE_ENDING_LABELS[lineEnding]})`);
    let bytes: Uint8Array;
    try {
      try {
        bytes = encodeText(content, encoding);
      } catch (error) {
        if (!(error instanceof UnrepresentableTextError)) throw error;
        // Gravar "?" no lugar do caractere perderia texto: muda para UTF-8 e avisa
        const previous = ENCODING_LABELS[encoding];
        encoding = "utf-8";
        bytes = encodeText(content, encoding);
        message = pc.yellow(`💾 Salvo em UTF-8: "${error.character}" não existe em ${previous}.`);
      }
      writeFileSafely(filePath, bytes);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const hint = /EPERM|EACCES|EBUSY/.test(detail) ? " (somente leitura ou aberto em outro programa?)" : "";
      setStatus(pc.red(`❌ Não foi possível salvar: ${detail}${hint}`), 6000);
      return false;
    }
    savedVersion = version;
    wasSaved = true;
    isNewFile = false;
    diskStamp = readDiskStamp(filePath);
    breakEditGroup();
    setStatus(message, 4000);
    return true;
  }

  // ------------------------------------------------------------------ tela

  function scheduleRender(): void {
    if (renderQueued || finished) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      render();
    });
  }

  function render(): void {
    if (finished) return;
    const rowsTotal = totalRows();
    const columnsTotal = totalColumns();
    const height = contentHeight();
    const digits = gutterDigits();
    const textWidth = Math.max(1, columnsTotal - gutterWidth());

    if (row < scrollTop) scrollTop = row;
    else if (row >= scrollTop + height) scrollTop = row - height + 1;
    const cursorColumn = displayColumn(lines[row], col);
    if (cursorColumn < scrollLeft) scrollLeft = cursorColumn;
    else if (cursorColumn >= scrollLeft + textWidth) scrollLeft = cursorColumn - textWidth + 1;

    let frame = "\x1B[?25l";

    // Cabeçalho: a posição do cursor (direita) nunca some; o nome é cortado antes
    const state = isModified() ? pc.yellow("● modificado") : pc.green("○ salvo");
    const details = [typeInfo.description, encoding === "utf-8" ? "" : ENCODING_LABELS[encoding], LINE_ENDING_LABELS[lineEnding]]
      .filter(Boolean)
      .join(" · ");
    const right = ` Ln ${row + 1}/${lines.length}, Col ${cursorColumn + 1} `;
    const leftFull = ` 📝 ${pc.bold(fileName)}  ${state}  ${pc.dim(details)} `;
    const leftShort = ` 📝 ${pc.bold(fileName)}  ${state} `;
    const leftSpace = Math.max(0, columnsTotal - visibleWidth(right));
    const left = visibleWidth(leftFull) <= leftSpace ? leftFull : truncateAnsi(leftShort, leftSpace);
    const header = padToWidth(left, leftSpace) + (leftSpace > 0 ? right : truncateAnsi(right, columnsTotal));
    frame += "\x1B[1;1H\x1B[0m" + (colorEnabled ? pc.bgCyan(pc.black(header)) : `\x1B[7m${header}\x1B[27m`) + "\x1B[0m\x1B[K";

    for (let screenRow = 0; screenRow < height; screenRow++) {
      const lineIndex = scrollTop + screenRow;
      frame += `\x1B[${screenRow + 2};1H\x1B[0m`;
      if (lineIndex < lines.length) {
        const number = String(lineIndex + 1).padStart(digits, " ");
        const gutter = lineIndex === row ? pc.bold(pc.yellow(number)) + pc.cyan(" │ ") : pc.dim(number) + pc.dim(" │ ");
        frame += gutter + visibleLineSegment(lines[lineIndex], scrollLeft, textWidth);
      } else {
        frame += " ".repeat(digits) + pc.dim(" ~ ");
      }
      frame += "\x1B[0m\x1B[K";
    }

    frame += `\x1B[${rowsTotal};1H\x1B[0m` + footer(columnsTotal) + "\x1B[0m";

    const screenRow = row - scrollTop + 2;
    const screenColumn = gutterWidth() + (cursorColumn - scrollLeft) + 1;
    if (!prompt && screenRow >= 2 && screenRow <= rowsTotal - 1 && screenColumn <= columnsTotal) {
      frame += `\x1B[${screenRow};${screenColumn}H\x1B[?25h`;
    }
    terminal.write(frame);
  }

  function footer(width: number): string {
    const warn = (text: string) => (colorEnabled ? pc.bgRed(pc.white(padToWidth(text, width))) : `\x1B[7m${padToWidth(text, width)}\x1B[27m`);
    if (prompt === "exit") {
      return warn(" ⚠️ Alterações não salvas!  [S] Salvar e sair  [D] Descartar e sair  [Esc] Continuar editando ");
    }
    if (prompt === "overwrite" || prompt === "overwrite-and-exit") {
      return warn(" ⚠️ O arquivo mudou no disco desde que foi aberto.  [S] Sobrescrever  [Esc] Cancelar ");
    }
    if (statusMessage) return padToWidth(` ${statusMessage}`, width);
    const options = [
      " [Ctrl+S] Salvar  [Esc] Sair  [Ctrl+Z] Desfazer  [Ctrl+Y] Refazer  [Tab] Indentar ",
      " [Ctrl+S] Salvar  [Esc] Sair  [Ctrl+Z] Desfazer  [Ctrl+Y] Refazer ",
      " ^S Salvar  Esc Sair  ^Z Desfazer ",
      " ^S Salvar  Esc Sair ",
    ];
    const text = options.find((option) => visibleWidth(option) <= width) ?? options[options.length - 1];
    return colorEnabled ? pc.bgCyan(pc.black(padToWidth(text, width))) : `\x1B[7m${padToWidth(text, width)}\x1B[27m`;
  }

  // ---------------------------------------------------------------- teclas

  function handleEvent(event: InputEvent): void {
    if (finished) return;
    if (event.kind === "paste") {
      if (prompt) return;
      // Texto colado entra como está: sem auto-indentação a cada linha
      if (event.text) insertText(event.text.replace(/\r\n|\r/g, "\n"), "other");
      scheduleRender();
      return;
    }
    handleKey(event);
    scheduleRender();
  }

  function handleKey(key: KeyEvent): void {
    if (prompt) return handlePromptKey(key);

    if (key.ctrl && !key.meta) {
      switch (key.name) {
        case "s":
          if (changedOnDisk()) prompt = "overwrite";
          else save();
          return;
        case "z":
          restore(undoStack, redoStack);
          return;
        case "y":
          restore(redoStack, undoStack);
          return;
        case "q":
        case "c":
          requestExit();
          return;
      }
    }

    switch (key.name) {
      case "escape":
        requestExit();
        return;
      case "up":
      case "down": {
        breakEditGroup();
        const target = key.name === "up" ? row - 1 : row + 1;
        if (target < 0 || target >= lines.length) return;
        row = target;
        col = indexFromDisplayColumn(lines[row], preferredColumn);
        return;
      }
      case "left":
        breakEditGroup();
        if (key.ctrl && col > 0) col = previousWordIndex(lines[row], col);
        else if (col > 0) col = previousGraphemeIndex(lines[row], col);
        else if (row > 0) {
          row--;
          col = lines[row].length;
        }
        syncPreferredColumn();
        return;
      case "right":
        breakEditGroup();
        if (key.ctrl && col < lines[row].length) col = nextWordIndex(lines[row], col);
        else if (col < lines[row].length) col = nextGraphemeIndex(lines[row], col);
        else if (row < lines.length - 1) {
          row++;
          col = 0;
        }
        syncPreferredColumn();
        return;
      case "home": {
        breakEditGroup();
        if (key.ctrl) {
          row = 0;
          col = 0;
        } else {
          // Home "inteligente": primeiro vai ao início do texto, depois à coluna 0
          const firstText = lines[row].search(/\S/);
          col = firstText > 0 && col !== firstText ? firstText : 0;
        }
        syncPreferredColumn();
        return;
      }
      case "end":
        breakEditGroup();
        if (key.ctrl) row = lines.length - 1;
        col = lines[row].length;
        syncPreferredColumn();
        return;
      case "pageup":
      case "pagedown": {
        breakEditGroup();
        const step = contentHeight();
        row = key.name === "pageup" ? Math.max(0, row - step) : Math.min(lines.length - 1, row + step);
        scrollTop = key.name === "pageup" ? Math.max(0, scrollTop - step) : scrollTop + step;
        col = indexFromDisplayColumn(lines[row], preferredColumn);
        return;
      }
      case "backspace":
        // Alt+Backspace apaga a palavra anterior; Ctrl+Delete, a seguinte
        deleteBackward(key.meta);
        return;
      case "delete":
        deleteForward(key.ctrl || key.meta);
        return;
      case "return":
      case "enter":
        newLineWithIndent();
        return;
      case "tab":
        if (key.shift) dedentLine();
        else insertText(indentUnit, "other");
        return;
    }

    if (key.text && !key.ctrl && !key.meta) insertText(key.text);
  }

  function handlePromptKey(key: KeyEvent): void {
    const answer = key.text?.toLowerCase();
    if (key.name === "escape" || answer === "c" || answer === "n") {
      prompt = null;
      return;
    }
    if (prompt === "exit") {
      if (answer === "s") {
        if (changedOnDisk()) {
          prompt = "overwrite-and-exit";
          return;
        }
        prompt = null;
        if (save()) finish();
      } else if (answer === "d") {
        prompt = null;
        finish();
      }
      return;
    }
    if (answer === "s") {
      const exitAfter = prompt === "overwrite-and-exit";
      prompt = null;
      if (save() && exitAfter) finish();
    }
  }

  function requestExit(): void {
    if (isModified()) prompt = "exit";
    else finish();
  }

  // -------------------------------------------------------- início e fim

  const savedTitle = process.platform === "win32" ? process.title : null;
  let resolveResult: (result: EditorResult) => void = () => {};
  const result = new Promise<EditorResult>((resolve) => {
    resolveResult = resolve;
  });

  function finish(): void {
    if (finished) return;
    finished = true;
    if (statusTimer) clearTimeout(statusTimer);
    if (savedTitle !== null) terminal.write(`\x1B]0;${savedTitle.replace(/[\u0000-\u001F\u007F-\u009F]/g, "")}\x07`);
    else terminal.write("\x1B[23;0t");
    // Sai da tela alternativa ANTES de desligar o modo raw (ver terminal-io.ts)
    terminal.write("\x1B[0m\x1B[?25h\x1B[?1049l");
    stopInput();
    stopResize();
    resolveResult({ saved: wasSaved, modified: isModified() });
  }

  terminal.write("\x1B[?1049h\x1B[2J");
  if (savedTitle === null) terminal.write("\x1B[22;0t");
  terminal.write(`\x1B]0;MarkiiDown - ${fileName} (editando)\x07`);
  const stopInput = terminal.startInput(handleEvent);
  const stopResize = terminal.onResize(() => scheduleRender());
  render();
  return result;
}
