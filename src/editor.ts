import readline from "node:readline";
import pc from "picocolors";
import { detectFileType, TAB_SIZE } from "./utils.ts";

export interface EditorResult {
  saved: boolean;
  modified: boolean;
}

export interface EditorOptions {
  filePath: string;
  initialContent?: string;
}

/**
 * Utilitário para calcular largura visual sem sequências ANSI
 */
const ANSI_SEQUENCE = /\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g;
const ANSI_SEQUENCE_AT_START = /^(?:\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\)))/;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function stripAnsi(text: string): string {
  return text.replace(ANSI_SEQUENCE, "");
}

function truncateAnsi(str: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";

  let visualWidth = 0;
  let result = "";
  let offset = 0;
  let truncated = false;

  while (offset < str.length) {
    const remaining = str.slice(offset);
    const ansiMatch = remaining.match(ANSI_SEQUENCE_AT_START);
    if (ansiMatch) {
      result += ansiMatch[0];
      offset += ansiMatch[0].length;
      continue;
    }

    const segment = graphemeSegmenter.segment(remaining)[Symbol.iterator]().next().value?.segment;
    if (!segment) break;

    const segmentWidth = Bun.stringWidth(segment);
    if (visualWidth + segmentWidth > maxWidth) {
      truncated = true;
      break;
    }

    result += segment;
    visualWidth += segmentWidth;
    offset += segment.length;
  }

  if (truncated && result.includes("\x1B[")) {
    result += "\x1B[0m";
  }

  return result;
}

function padToWidth(text: string, width: number): string {
  const truncated = truncateAnsi(text, width);
  const missingWidth = Math.max(0, width - Bun.stringWidth(stripAnsi(truncated)));
  return truncated + " ".repeat(missingWidth);
}

/**
 * Mantém a quebra de linha original do arquivo (CRLF no Windows) ao salvar
 */
export function detectLineEnding(content: string): "\r\n" | "\n" {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

/*
 * O cursor do editor é um índice na string (unidades UTF-16), mas a tela usa
 * colunas visuais: TAB avança até a próxima parada e emoji/CJK ocupam 2
 * colunas. As funções abaixo convertem entre as duas medidas.
 */
function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), (part) => part.segment);
}

function graphemeWidth(segment: string, column: number): number {
  return segment === "\t" ? TAB_SIZE - (column % TAB_SIZE) : Bun.stringWidth(segment);
}

export function displayColumn(line: string, index: number): number {
  let column = 0;
  for (const segment of graphemes(line.slice(0, index))) {
    column += graphemeWidth(segment, column);
  }
  return column;
}

export function indexFromDisplayColumn(line: string, targetColumn: number): number {
  let column = 0;
  let index = 0;
  for (const segment of graphemes(line)) {
    const width = graphemeWidth(segment, column);
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
 * Converte a linha para texto de tela (TAB vira espaços) e recorta a janela
 * visível [startColumn, startColumn + width) em colunas visuais.
 */
export function visibleLineSegment(line: string, startColumn: number, width: number): string {
  let column = 0;
  let result = "";
  const endColumn = startColumn + width;

  for (const segment of graphemes(line)) {
    const segmentWidth = graphemeWidth(segment, column);
    const text = segment === "\t" ? " ".repeat(segmentWidth) : segment;
    const segmentEnd = column + segmentWidth;

    if (segmentEnd > startColumn && column < endColumn) {
      if (column >= startColumn && segmentEnd <= endColumn) {
        result += text;
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

/**
 * Editor Interativo de Terminal (TUI Text Editor)
 * Suporta navegação completa, inserção, deleção, quebras com indentação,
 * salvar via Ctrl+S, desfazer/refazer e diálogo seguro de saída.
 */
export async function runInteractiveEditor(options: EditorOptions): Promise<EditorResult> {
  const { filePath } = options;
  const file = Bun.file(filePath);

  const typeInfo = detectFileType(filePath);

  let rawContent = options.initialContent;
  let isNewFile = false;
  if (rawContent === undefined) {
    if (await file.exists()) {
      // Carregar um binário como texto e salvar corromperia o arquivo
      if (typeInfo.isBinary) {
        throw new Error(`Arquivos binários não podem ser editados: ${filePath}`);
      }
      rawContent = await file.text();
    } else {
      rawContent = "";
      isNewFile = true;
    }
  }

  const lineEnding = detectLineEnding(rawContent);

  // Normaliza quebras de linha em array de linhas
  let lines = rawContent.split(/\r?\n/);
  if (lines.length === 0) lines = [""];

  const fileName = filePath.split(/[\\/]/).pop() || "arquivo";

  let cursorRow = 0;
  let cursorCol = 0;
  let preferredCol = 0;
  let scrollTop = 0;
  let scrollLeft = 0;

  let isModified = false;
  let wasSaved = false;
  let statusMessage: string | null = isNewFile
    ? "📄 Novo arquivo [Pressione Ctrl+S para salvar no disco]"
    : null;
  let statusTimeout: ReturnType<typeof setTimeout> | null = null;
  let confirmingExit = false;

  // Pilhas de histórico para Undo / Redo
  interface HistoryState {
    lines: string[];
    cursorRow: number;
    cursorCol: number;
  }
  const undoStack: HistoryState[] = [];
  const redoStack: HistoryState[] = [];
  const MAX_HISTORY = 100;

  // Coluna visual desejada ao navegar com ↑/↓ entre linhas de tamanhos diferentes
  function syncPreferredCol() {
    preferredCol = displayColumn(lines[cursorRow], cursorCol);
  }

  function pushHistory() {
    undoStack.push({
      lines: [...lines],
      cursorRow,
      cursorCol,
    });
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    redoStack.length = 0; // Limpa redo ao fazer nova alteração
  }

  function setStatus(msg: string, durationMs = 3000) {
    statusMessage = msg;
    if (statusTimeout) clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      statusMessage = null;
      render();
    }, durationMs);
  }

  const getTerminalRows = () => Math.max(8, process.stdout.rows || 24);
  const getTerminalCols = () => Math.max(20, process.stdout.columns || 80);

  function getContentHeight(): number {
    return Math.max(1, getTerminalRows() - 2); // 1 linha de cabeçalho + 1 linha de rodapé
  }

  function getGutterWidth(): number {
    const totalDigits = Math.max(2, String(lines.length).length);
    return totalDigits + 3; // ex: " 12 │ "
  }

  async function saveFile(): Promise<boolean> {
    try {
      const contentToSave = lines.join(lineEnding);
      await Bun.write(filePath, contentToSave);
      isModified = false;
      wasSaved = true;
      setStatus(pc.green("💾 Arquivo salvo com sucesso!"));
      return true;
    } catch (err) {
      setStatus(pc.red(`❌ Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`), 5000);
      return false;
    }
  }

  function render() {
    const totalRows = getTerminalRows();
    const totalCols = getTerminalCols();
    const contentHeight = getContentHeight();
    const gutterWidth = getGutterWidth();
    const textWidth = Math.max(1, totalCols - gutterWidth);

    // Ajusta scroll vertical
    if (cursorRow < scrollTop) {
      scrollTop = cursorRow;
    } else if (cursorRow >= scrollTop + contentHeight) {
      scrollTop = cursorRow - contentHeight + 1;
    }

    // Ajusta scroll horizontal (em colunas visuais)
    const cursorDisplayCol = displayColumn(lines[cursorRow], cursorCol);
    if (cursorDisplayCol < scrollLeft) {
      scrollLeft = cursorDisplayCol;
    } else if (cursorDisplayCol >= scrollLeft + textWidth) {
      scrollLeft = cursorDisplayCol - textWidth + 1;
    }

    let buffer = "";

    // 1. Cabeçalho (Linha 1)
    buffer += `\x1B[1;1H\x1B[2K`;
    const dirtyIndicator = isModified ? pc.yellow("● [Modificado]") : pc.green("○ [Salvo]");
    const leftHeader = ` 📝 MarkiiDown Editor │ ${pc.bold(fileName)}  ${dirtyIndicator} (${typeInfo.description}) `;
    const rightHeader = ` Ln ${cursorRow + 1}/${lines.length}, Col ${cursorDisplayCol + 1} `;

    const leftLen = Bun.stringWidth(stripAnsi(leftHeader));
    const rightLen = Bun.stringWidth(stripAnsi(rightHeader));
    const fillSpaces = Math.max(0, totalCols - leftLen - rightLen);

    buffer += pc.bgCyan(pc.black(truncateAnsi(leftHeader, totalCols))) +
      pc.bgBlue(pc.white(" ".repeat(fillSpaces) + rightHeader));

    // 2. Área de Conteúdo com Linhas e Gutter (Linhas 2 a totalRows - 1)
    const digits = Math.max(2, String(lines.length).length);

    for (let row = 1; row <= contentHeight; row++) {
      const screenRow = row + 1;
      const lineIndex = scrollTop + (row - 1);
      buffer += `\x1B[${screenRow};1H\x1B[2K`;

      if (lineIndex < lines.length) {
        const lineContent = lines[lineIndex];
        const isCurrentLine = lineIndex === cursorRow;
        const lineNumStr = String(lineIndex + 1).padStart(digits, " ");
        const gutter = isCurrentLine
          ? pc.bold(pc.yellow(lineNumStr)) + pc.cyan(" │ ")
          : pc.dim(lineNumStr) + pc.dim(" │ ");

        const visibleSegment = visibleLineSegment(lineContent, scrollLeft, textWidth);
        const styledText = pc.white(visibleSegment);

        buffer += gutter + styledText;
      } else {
        const emptyGutter = " ".repeat(digits) + pc.dim(" ~ ");
        buffer += emptyGutter;
      }
    }

    // 3. Rodapé / Barra de Status (Linha totalRows)
    buffer += `\x1B[${totalRows};1H\x1B[2K`;

    if (confirmingExit) {
      const prompt = " ⚠️ Alterações não salvas! [S] Salvar e Sair  [D] Descartar  [C/Esc] Cancelar ";
      buffer += pc.bgRed(pc.white(padToWidth(prompt, totalCols)));
    } else if (statusMessage) {
      buffer += padToWidth(` ${statusMessage}`, totalCols);
    } else {
      const shortcuts = " [Ctrl+S] Salvar  [Esc/Ctrl+Q] Sair  [Tab] Indentar  [Ctrl+Z] Desfazer ";
      buffer += pc.bgCyan(pc.black(padToWidth(shortcuts, totalCols)));
    }

    // 4. Posiciona o cursor físico do terminal no ponto exato de edição
    const screenCursorRow = cursorRow - scrollTop + 2;
    const screenCursorCol = gutterWidth + (cursorDisplayCol - scrollLeft) + 1;

    if (
      screenCursorRow >= 2 &&
      screenCursorRow <= totalRows - 1 &&
      screenCursorCol >= gutterWidth + 1 &&
      screenCursorCol <= totalCols
    ) {
      buffer += `\x1B[${screenCursorRow};${screenCursorCol}H\x1B[?25h`; // Mostra cursor
    } else {
      buffer += `\x1B[?25l`; // Esconde se fora da área visível
    }

    process.stdout.write(buffer);
  }

  // Prepara terminal
  process.stdout.write("\x1B[?1049h\x1B[?25h");
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }

  let cleanedUp = false;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    if (statusTimeout) clearTimeout(statusTimeout);
    process.stdout.write("\x1B[?1049l\x1B[?25h\x1B[0m");
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      } catch {}
    }
  }

  render();

  const handleResize = () => {
    render();
  };
  process.stdout.on("resize", handleResize);

  return new Promise<EditorResult>((resolvePromise) => {
    const finish = (saved: boolean, modified: boolean) => {
      cleanup();
      process.stdout.removeListener("resize", handleResize);
      process.stdin.removeListener("keypress", handleKeypress);
      resolvePromise({ saved, modified });
    };

    const handleKeypress = async (str: string, key: readline.Key) => {
      // Confirmação de saída quando há alterações pendentes
      if (confirmingExit) {
        if (str === "s" || str === "S") {
          confirmingExit = false;
          const ok = await saveFile();
          if (ok) finish(true, false);
          else render();
          return;
        }
        if (str === "d" || str === "D") {
          confirmingExit = false;
          finish(wasSaved, false);
          return;
        }
        if (str === "c" || str === "C" || (key && key.name === "escape")) {
          confirmingExit = false;
          render();
          return;
        }
        return;
      }

      // Atalhos globais do editor
      // Ctrl+S: Salvar
      if (key && key.ctrl && key.name === "s") {
        await saveFile();
        render();
        return;
      }

      // Ctrl+Z: Desfazer
      if (key && key.ctrl && key.name === "z") {
        if (undoStack.length > 0) {
          const prevState = undoStack.pop()!;
          redoStack.push({
            lines: [...lines],
            cursorRow,
            cursorCol,
          });
          lines = prevState.lines;
          cursorRow = Math.min(lines.length - 1, prevState.cursorRow);
          cursorCol = Math.min(lines[cursorRow].length, prevState.cursorCol);
          syncPreferredCol();
          isModified = true;
          render();
        }
        return;
      }

      // Ctrl+Y: Refazer
      if (key && key.ctrl && key.name === "y") {
        if (redoStack.length > 0) {
          const nextState = redoStack.pop()!;
          undoStack.push({
            lines: [...lines],
            cursorRow,
            cursorCol,
          });
          lines = nextState.lines;
          cursorRow = Math.min(lines.length - 1, nextState.cursorRow);
          cursorCol = Math.min(lines[cursorRow].length, nextState.cursorCol);
          syncPreferredCol();
          isModified = true;
          render();
        }
        return;
      }

      // Sair do Editor (Esc ou Ctrl+Q ou Ctrl+C)
      if ((key && (key.name === "escape" || (key.ctrl && key.name === "q"))) || (key && key.ctrl && key.name === "c")) {
        if (isModified) {
          confirmingExit = true;
          render();
          return;
        }
        finish(wasSaved, isModified);
        return;
      }

      // Navegação com Teclado
      if (key && key.name === "up") {
        if (cursorRow > 0) {
          cursorRow--;
          cursorCol = indexFromDisplayColumn(lines[cursorRow], preferredCol);
          render();
        }
        return;
      }

      if (key && key.name === "down") {
        if (cursorRow < lines.length - 1) {
          cursorRow++;
          cursorCol = indexFromDisplayColumn(lines[cursorRow], preferredCol);
          render();
        }
        return;
      }

      if (key && key.name === "left") {
        if (cursorCol > 0) {
          cursorCol = previousGraphemeIndex(lines[cursorRow], cursorCol);
          syncPreferredCol();
          render();
        } else if (cursorRow > 0) {
          cursorRow--;
          cursorCol = lines[cursorRow].length;
          syncPreferredCol();
          render();
        }
        return;
      }

      if (key && key.name === "right") {
        if (cursorCol < lines[cursorRow].length) {
          cursorCol = nextGraphemeIndex(lines[cursorRow], cursorCol);
          syncPreferredCol();
          render();
        } else if (cursorRow < lines.length - 1) {
          cursorRow++;
          cursorCol = 0;
          syncPreferredCol();
          render();
        }
        return;
      }

      if (key && key.name === "home") {
        const curLine = lines[cursorRow];
        const firstNonSpace = curLine.search(/\S/);
        if (firstNonSpace !== -1 && cursorCol !== firstNonSpace && cursorCol === 0) {
          cursorCol = firstNonSpace;
        } else if (cursorCol === firstNonSpace) {
          cursorCol = 0;
        } else {
          cursorCol = firstNonSpace !== -1 ? firstNonSpace : 0;
        }
        syncPreferredCol();
        render();
        return;
      }

      if (key && key.name === "end") {
        cursorCol = lines[cursorRow].length;
        syncPreferredCol();
        render();
        return;
      }

      if (key && key.name === "pageup") {
        cursorRow = Math.max(0, cursorRow - getContentHeight());
        cursorCol = indexFromDisplayColumn(lines[cursorRow], preferredCol);
        render();
        return;
      }

      if (key && key.name === "pagedown") {
        cursorRow = Math.min(lines.length - 1, cursorRow + getContentHeight());
        cursorCol = indexFromDisplayColumn(lines[cursorRow], preferredCol);
        render();
        return;
      }

      // Edição de Texto
      // Backspace
      // O histórico só é gravado quando há alteração real; um Backspace no
      // início do arquivo não pode apagar a pilha de Refazer.
      if (key && key.name === "backspace") {
        const curLine = lines[cursorRow];
        if (cursorCol > 0) {
          pushHistory();
          const previousIndex = previousGraphemeIndex(curLine, cursorCol);
          lines[cursorRow] = curLine.slice(0, previousIndex) + curLine.slice(cursorCol);
          cursorCol = previousIndex;
          syncPreferredCol();
          isModified = true;
          render();
        } else if (cursorRow > 0) {
          pushHistory();
          const prevLen = lines[cursorRow - 1].length;
          lines[cursorRow - 1] += curLine;
          lines.splice(cursorRow, 1);
          cursorRow--;
          cursorCol = prevLen;
          syncPreferredCol();
          isModified = true;
          render();
        }
        return;
      }

      // Delete
      if (key && key.name === "delete") {
        const curLine = lines[cursorRow];
        if (cursorCol < curLine.length) {
          pushHistory();
          lines[cursorRow] = curLine.slice(0, cursorCol) + curLine.slice(nextGraphemeIndex(curLine, cursorCol));
          isModified = true;
          render();
        } else if (cursorRow < lines.length - 1) {
          pushHistory();
          lines[cursorRow] += lines[cursorRow + 1];
          lines.splice(cursorRow + 1, 1);
          isModified = true;
          render();
        }
        return;
      }

      // Enter / Return
      if (key && key.name === "return") {
        pushHistory();
        const curLine = lines[cursorRow];
        const leftPart = curLine.slice(0, cursorCol);
        const rightPart = curLine.slice(cursorCol);

        // Auto-indentação baseada na linha atual
        const matchIndent = leftPart.match(/^(\s+)/);
        const indent = matchIndent ? matchIndent[1] : "";

        lines[cursorRow] = leftPart;
        lines.splice(cursorRow + 1, 0, indent + rightPart);
        cursorRow++;
        cursorCol = indent.length;
        syncPreferredCol();
        isModified = true;
        render();
        return;
      }

      // Tab
      if (key && key.name === "tab") {
        pushHistory();
        const curLine = lines[cursorRow];
        const spaces = "  "; // 2 espaços por padrão
        lines[cursorRow] = curLine.slice(0, cursorCol) + spaces + curLine.slice(cursorCol);
        cursorCol += spaces.length;
        syncPreferredCol();
        isModified = true;
        render();
        return;
      }

      // Caracteres imprimíveis, incluindo emoji (pares substitutos têm length 2)
      if (str && !key?.ctrl && !key?.meta && !/[\x00-\x1F\x7F]/.test(str)) {
        pushHistory();
        const curLine = lines[cursorRow];
        lines[cursorRow] = curLine.slice(0, cursorCol) + str + curLine.slice(cursorCol);
        cursorCol += str.length;
        syncPreferredCol();
        isModified = true;
        render();
        return;
      }
    };

    process.stdin.on("keypress", handleKeypress);
  });
}