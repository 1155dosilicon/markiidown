import { statSync, watch } from "node:fs";
import { basename, dirname } from "node:path";
import { expandTabsAnsi, stripAnsi } from "./ansi.ts";
import { colorEnabled, pc } from "./colors.ts";
import { highlightToAnsiLines } from "./highlight.ts";
import { runInteractiveViewer, type ViewerContent } from "./interactive.ts";
import { renderMarkdownToLines } from "./markdown-terminal.ts";
import { readTextFile, type TextEncodingName } from "./text-file.ts";
import {
  calculateReadingTime,
  detectFileType,
  extractCodeTableOfContents,
  formatBytes,
  type FileTypeInfo,
} from "./utils.ts";

/** Largura máxima do texto Markdown: linhas muito longas cansam a leitura. */
export const MAX_MARKDOWN_WIDTH = 100;

/** Divide em linhas aceitando CRLF, LF e CR sozinho (finais de linha do Mac antigo). */
export const LINE_BREAK = /\r\n|\r|\n/;

/**
 * Remove caracteres de controle (menos TAB, LF e CR) para que um arquivo não
 * consiga mandar sequências de escape ao terminal (mudar título, cores,
 * apagar a tela...). Também cobre a faixa C1 (U+0080–U+009F).
 */
export function sanitizeTerminalInput(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
}

/**
 * O terminal entende hyperlinks OSC 8? Windows Terminal, VS Code, WezTerm,
 * iTerm2, kitty, Ghostty e terminais VTE recentes, sim. FORCE_HYPERLINK=0/1
 * decide manualmente.
 */
export function terminalSupportsHyperlinks(
  env: Record<string, string | undefined> = process.env,
  isTTY = !!process.stdout.isTTY
): boolean {
  if (env.FORCE_HYPERLINK !== undefined) return env.FORCE_HYPERLINK !== "0" && env.FORCE_HYPERLINK !== "false";
  if (!isTTY) return false;
  if (env.TMUX || env.TERM?.startsWith("screen") || env.TERM?.startsWith("tmux")) return false;
  if (env.WT_SESSION) return true;
  if (["vscode", "WezTerm", "iTerm.app", "ghostty"].includes(env.TERM_PROGRAM ?? "")) return true;
  if (env.TERM === "xterm-kitty") return true;
  return Number(env.VTE_VERSION ?? 0) >= 5000;
}

export interface RenderOptions {
  raw?: boolean;
  lineNumbers?: boolean;
  /**
   * Colunas disponíveis para o Markdown. Padrão: largura do terminal (até
   * MAX_MARKDOWN_WIDTH) ou sem limite quando a saída não é um terminal.
   */
  width?: number;
}

export interface TocEntry {
  title: string;
  lineIndex: number;
  level?: number;
}

export interface RenderedFileResult {
  /** Linhas prontas para a tela (com cores e numeração), uma por linha lógica. */
  lines: string[];
  /** Texto de cada linha sem cores nem numeração, usado pela busca. */
  searchLines: string[];
  /** A linha continua o parágrafo da anterior (a busca junta as duas). */
  continued?: boolean[];
  tableOfContents: TocEntry[];
  rawText: string;
  sizeBytes: number;
  typeInfo: FileTypeInfo;
  encoding: TextEncodingName | null;
  /** Colunas da numeração (gutter); as linhas quebradas recuam isso. */
  gutterWidth: number;
  /** O resultado depende da largura (Markdown): o leitor renderiza de novo ao redimensionar. */
  widthDependent: boolean;
}

function defaultMarkdownWidth(): number {
  return process.stdout.isTTY ? Math.min(process.stdout.columns || 80, MAX_MARKDOWN_WIDTH) : Infinity;
}

function gutterFor(lineCount: number): { digits: number; width: number } {
  const digits = Math.max(2, String(lineCount).length);
  return { digits, width: digits + 3 };
}

function addLineNumberGutter(lines: string[]): string[] {
  const { digits } = gutterFor(lines.length);
  return lines.map((line, index) => pc.dim(String(index + 1).padStart(digits, " ")) + pc.cyan(" │ ") + line);
}

/**
 * Lê e formata qualquer arquivo suportado (Markdown, código, texto) em linhas
 * ANSI, com o sumário (títulos do Markdown ou símbolos do código).
 */
export async function getRenderedFileLines(filePath: string, options: RenderOptions = {}): Promise<RenderedFileResult> {
  let sizeBytes: number;
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error("não é um arquivo");
    sizeBytes = stats.size;
  } catch {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const typeInfo = detectFileType(filePath);

  if (typeInfo.isBinary) {
    const lines = [
      "",
      pc.yellow(`  ⚠️  O arquivo "${sanitizeTerminalInput(basename(filePath))}" é um arquivo binário (${formatBytes(sizeBytes)}).`),
      pc.dim("     Arquivos binários não podem ser exibidos como texto no terminal."),
      "",
      `     ${pc.cyan("Caminho:")} ${sanitizeTerminalInput(filePath)}`,
      `     ${pc.cyan("Tipo:")}    ${typeInfo.description}`,
      `     ${pc.cyan("Tamanho:")} ${formatBytes(sizeBytes)}`,
      "",
    ];
    return {
      lines,
      searchLines: lines.map(stripAnsi),
      tableOfContents: [],
      rawText: "",
      sizeBytes,
      typeInfo,
      encoding: null,
      gutterWidth: 0,
      widthDependent: false,
    };
  }

  // Respeita a codificação do arquivo (UTF-8, UTF-16 com BOM, Windows-1252)
  const { text: rawText, encoding } = await readTextFile(filePath);
  const safeText = sanitizeTerminalInput(rawText);
  const finish = (result: Omit<RenderedFileResult, "rawText" | "sizeBytes" | "typeInfo" | "encoding">): RenderedFileResult => {
    // Arquivo vazio: uma linha vazia (o leitor sempre tem algo para mostrar)
    if (result.lines.length === 0) {
      result = { ...result, lines: [""], searchLines: [""], continued: [false] };
    }
    return {
      ...result,
      // Sem cores, nenhum código ANSI sai (nem os gerados por outras bibliotecas)
      lines: colorEnabled ? result.lines : result.lines.map(stripAnsi),
      rawText,
      sizeBytes,
      typeInfo,
      encoding,
    };
  };

  // Markdown formatado
  if (typeInfo.type === "markdown" && !options.raw) {
    const availableWidth = options.width ?? defaultMarkdownWidth();
    const render = (gutterWidth: number) =>
      renderMarkdownToLines(safeText, {
        width: Number.isFinite(availableWidth) ? Math.max(20, Math.min(availableWidth, MAX_MARKDOWN_WIDTH) - gutterWidth) : Infinity,
        hyperlinks: terminalSupportsHyperlinks(),
        colors: pc,
      });

    let rendered = render(0);
    let gutterWidth = 0;
    if (options.lineNumbers) {
      // A numeração ocupa colunas: renderiza de novo descontando a largura dela
      gutterWidth = gutterFor(rendered.lines.length).width;
      rendered = render(gutterWidth);
      gutterWidth = gutterFor(rendered.lines.length).width;
    }

    return finish({
      lines: options.lineNumbers ? addLineNumberGutter(rendered.lines) : rendered.lines,
      searchLines: rendered.searchLines,
      continued: rendered.continued,
      tableOfContents: rendered.headings.map(({ title, lineIndex, level }) => ({ title, lineIndex, level })),
      gutterWidth,
      widthDependent: true,
    });
  }

  // Código, configuração e texto
  const sourceLines = safeText.split(LINE_BREAK).map((line) => expandTabsAnsi(line));
  const highlighted =
    !options.raw && colorEnabled && typeInfo.type === "code" ? highlightToAnsiLines(sourceLines.join("\n"), typeInfo.language) : null;
  const contentLines = highlighted && highlighted.length === sourceLines.length ? highlighted : sourceLines;

  // Código mostra numeração por padrão; --raw remove, a menos que --numbers seja pedido
  const showGutter = !options.raw || !!options.lineNumbers;
  // Texto comum não tem símbolos: "Type something" num .txt não é um "type"
  const tableOfContents: TocEntry[] = typeInfo.type === "code" ? extractCodeTableOfContents(sourceLines) : [];

  return finish({
    lines: showGutter ? addLineNumberGutter(contentLines) : contentLines,
    searchLines: sourceLines,
    tableOfContents,
    gutterWidth: showGutter ? gutterFor(contentLines.length).width : 0,
    widthDependent: false,
  });
}

/**
 * Converte Markdown para linhas formatadas e sumário (mantida por compatibilidade).
 */
export async function getRenderedMarkdownLines(filePath: string): Promise<{
  lines: string[];
  tableOfContents: TocEntry[];
  rawMarkdown: string;
  sizeBytes: number;
}> {
  const result = await getRenderedFileLines(filePath);
  return {
    lines: result.lines,
    tableOfContents: result.tableOfContents,
    rawMarkdown: result.rawText,
    sizeBytes: result.sizeBytes,
  };
}

/** Leitor interativo (TUI) para qualquer arquivo. */
export async function openInteractiveViewer(filePath: string, options: RenderOptions = {}): Promise<void> {
  const load = async (columns: number): Promise<ViewerContent> => {
    const result = await getRenderedFileLines(filePath, { ...options, width: columns });
    return {
      renderedLines: result.lines,
      searchLines: result.searchLines,
      continued: result.continued,
      tableOfContents: result.tableOfContents,
      fileSize: result.sizeBytes,
      gutterWidth: result.gutterWidth,
      widthDependent: result.widthDependent,
      isBinary: result.typeInfo.isBinary,
    };
  };

  await runInteractiveViewer({
    fileName: basename(filePath),
    filePath,
    load,
  });
}

/**
 * Imprime o arquivo formatado na saída padrão. Num terminal, mostra um
 * cabeçalho com nome, tamanho, tipo e tempo de leitura; redirecionado
 * (`> arquivo`, `| outro-programa`), imprime só o conteúdo, sem cores.
 */
export async function printDirectToTerminal(filePath: string, options: RenderOptions = {}): Promise<void> {
  const { lines, rawText, typeInfo, sizeBytes } = await getRenderedFileLines(filePath, options);
  const output: string[] = [];

  if (process.stdout.isTTY) {
    const width = Math.min(process.stdout.columns || 80, MAX_MARKDOWN_WIDTH);
    const separator = pc.cyan("─".repeat(width));
    const { words, minutes } = calculateReadingTime(rawText);
    output.push(
      separator,
      `${pc.bold(` 📄 ${sanitizeTerminalInput(basename(filePath))}`)} ${pc.dim(`(${sanitizeTerminalInput(filePath)})`)}`,
      `${pc.dim(" 📊 Tamanho:")} ${pc.yellow(formatBytes(sizeBytes))}  │  ` +
        `${pc.dim("🏷️ Tipo:")} ${pc.magenta(typeInfo.description)}  │  ` +
        `${pc.dim("📝 Palavras:")} ${pc.yellow(words.toString())}  │  ` +
        `${pc.dim("⏱️ Leitura:")} ${pc.green(`~${minutes} min`)}`,
      separator,
      "",
      ...lines,
      pc.dim("─".repeat(width)),
      ""
    );
  } else {
    output.push(...lines);
  }

  await writeStdout(output.join("\n") + "\n");
}

/** Escreve tudo e espera o esvaziamento (saída grande num pipe não é cortada ao sair). */
function writeStdout(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (process.stdout.write(text)) resolve();
    else process.stdout.once("drain", () => resolve());
  });
}

/**
 * Mostra o arquivo e o atualiza a cada salvamento. Observa a pasta (não o
 * arquivo) para continuar funcionando quando o editor salva por substituição
 * atômica (grava um temporário e renomeia por cima).
 */
export async function watchFileInTerminal(filePath: string, options: RenderOptions = {}): Promise<void> {
  const watchedName = basename(filePath).toLowerCase();
  const watchedDirectory = dirname(filePath);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let rendering = false;
  let renderAgain = false;

  const render = async (): Promise<void> => {
    if (rendering) {
      renderAgain = true;
      return;
    }
    rendering = true;
    try {
      do {
        renderAgain = false;
        if (process.stdout.isTTY) process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
        try {
          await printDirectToTerminal(filePath, options);
        } catch (error) {
          console.error(pc.red(`Erro ao atualizar o arquivo: ${error instanceof Error ? error.message : error}`));
        }
        console.log(pc.magenta(`👀 Monitorando: ${pc.bold(sanitizeTerminalInput(filePath))} (Ctrl+C para sair)`));
      } while (renderAgain);
    } finally {
      rendering = false;
    }
  };

  await render();

  await new Promise<void>((resolve, reject) => {
    let watcher: ReturnType<typeof watch> | undefined;

    const cleanup = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      watcher?.close();
      process.removeListener("SIGINT", handleSignal);
      process.removeListener("SIGTERM", handleSignal);
    };

    const handleSignal = () => {
      cleanup();
      resolve();
    };

    try {
      watcher = watch(watchedDirectory, (_eventType, changedName) => {
        if (changedName && changedName.toString().toLowerCase() !== watchedName) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => void render(), 150);
      });
      watcher.once("error", (error) => {
        cleanup();
        reject(error);
      });
      process.once("SIGINT", handleSignal);
      process.once("SIGTERM", handleSignal);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
