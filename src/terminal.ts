import { highlight as highlightCli } from "cli-highlight";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { watch } from "node:fs";
import { basename, dirname } from "node:path";
import pc from "picocolors";
import { runInteractiveViewer, stripAnsi } from "./interactive.ts";
import {
  calculateReadingTime,
  detectFileType,
  formatBytes,
  isMarkdownPath,
  type FileTypeInfo,
} from "./utils.ts";

const SGR_SEQUENCE_AT_START = /^\x1B\[([0-9;]*)m/;
const LONG_CLI_OPTION = /(?<![\w-])--[A-Za-z0-9][A-Za-z0-9-]*(?:=[^\s"'`)<>{}\]]+)?/g;

function updateForeground(sequence: string, currentForeground: string | null): string | null {
  const parametersText = sequence.slice(2, -1);
  const parameters = parametersText === "" ? [0] : parametersText.split(";").map(Number);
  let foreground = currentForeground;

  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    if (parameter === 0 || parameter === 39) foreground = null;
    else if ((parameter >= 30 && parameter <= 37) || (parameter >= 90 && parameter <= 97)) {
      foreground = `\x1B[${parameter}m`;
    } else if (parameter === 38) {
      foreground = sequence;
      break;
    }
  }

  return foreground;
}

/**
 * Grammars de shell podem dividir opções GNU, por exemplo renderizando
 * `--install` como "-" + "-install". Esta etapa trata a opção como um token
 * atômico e mantém todo o argumento amarelo sem alterar o restante do código.
 */
export function normalizeCliOptionHighlight(highlightedCode: string): string {
  if (!pc.isColorSupported) return highlightedCode;

  const plainCode = stripAnsi(highlightedCode);
  const ranges = [...plainCode.matchAll(LONG_CLI_OPTION)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  if (ranges.length === 0) return highlightedCode;

  let result = "";
  let rawOffset = 0;
  let plainOffset = 0;
  let rangeIndex = 0;
  let insideRange = false;
  let foreground: string | null = null;

  while (rawOffset < highlightedCode.length) {
    const range = ranges[rangeIndex];
    if (insideRange && range && plainOffset >= range.end) {
      result += foreground ?? "\x1B[39m";
      insideRange = false;
      rangeIndex++;
      continue;
    }
    if (!insideRange && range && plainOffset === range.start) {
      result += "\x1B[33m";
      insideRange = true;
    }

    const remaining = highlightedCode.slice(rawOffset);
    const sgrMatch = remaining.match(SGR_SEQUENCE_AT_START);
    if (sgrMatch) {
      foreground = updateForeground(sgrMatch[0], foreground);
      if (!insideRange) result += sgrMatch[0];
      rawOffset += sgrMatch[0].length;
      continue;
    }

    result += highlightedCode[rawOffset];
    rawOffset++;
    plainOffset++;
  }

  if (insideRange) result += foreground ?? "\x1B[39m";
  return result;
}

function renderCodeBlock(code: string, language?: string): string {
  const normalizedLanguage = language?.trim().split(/\s+/)[0];
  let renderedCode = code;

  if (normalizedLanguage && pc.isColorSupported) {
    try {
      renderedCode = normalizeCliOptionHighlight(
        highlightCli(code, { language: normalizedLanguage, languageSubset: [] })
      );
    } catch {
      renderedCode = pc.yellow(code);
    }
  }

  const indentation = "  ";
  return (
    renderedCode
      .split("\n")
      .map((line) => indentation + line)
      .join("\n") + "\n\n"
  );
}

function createTerminalMarked(): Marked {
  const terminalMarked = new Marked();
  terminalMarked.use(
    markedTerminal(
      {
        width: Math.min(process.stdout.columns || 80, 100),
        // A quebra nativa do marked-terminal separa códigos ANSI do texto na
        // borda da linha. O pager faz a quebra ANSI/Unicode com segurança.
        reflowText: false,
        showPrefix: false,
        unescape: true,
        emoji: true,
        tab: 2,
        heading: (text: string) => pc.bold(pc.cyan(text)),
        firstHeading: (text: string) => pc.bold(pc.magenta(text)),
        secondHeading: (text: string) => pc.bold(pc.green(text)),
        thirdHeading: (text: string) => pc.bold(pc.yellow(text)),
        blockquote: (text: string) => pc.italic(pc.gray(text)),
        listitem: (text: string) => pc.white(text),
        strong: (text: string) => pc.bold(pc.white(text)),
        em: (text: string) => pc.italic(pc.white(text)),
        codespan: (text: string) => pc.yellow(text),
        del: (text: string) => pc.strikethrough(pc.gray(text)),
        link: (text: string) => pc.blue(pc.underline(text)),
        href: (text: string) => pc.dim(pc.blue(text)),
      },
      // Sem linguagem declarada, texto técnico e árvores de arquivos devem
      // permanecer neutros. Blocos ```ts, ```python etc. continuam realçados.
      { languageSubset: [] }
    ) as any
  );

  // marked-terminal 7 não percorre tokens inline aninhados dentro de itens de
  // lista gerados pelo marked 15. Sem este adaptador, **forte** e `código`
  // aparecem literais ou com estilo parcial em listas.
  terminalMarked.use({
    renderer: {
      code(token) {
        return renderCodeBlock(token.text, token.lang);
      },
      text(token) {
        return "tokens" in token && token.tokens
          ? this.parser.parseInline(token.tokens)
          : token.text;
      },
    },
  });
  return terminalMarked;
}

export function sanitizeTerminalInput(text: string): string {
  // Preserva tabulação e quebras de linha, mas impede que um documento injete
  // sequências de controle (OSC/CSI) no terminal do usuário.
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
}

export interface RenderedFileResult {
  lines: string[];
  tableOfContents: { title: string; lineIndex: number }[];
  rawText: string;
  sizeBytes: number;
  typeInfo: FileTypeInfo;
}

/**
 * Converte qualquer arquivo suportado (Markdown, Código, Texto) para linhas formatadas com ANSI
 */
export async function getRenderedFileLines(
  filePath: string,
  options?: { raw?: boolean; lineNumbers?: boolean }
): Promise<RenderedFileResult> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const typeInfo = detectFileType(filePath);
  const sizeBytes = file.size;

  // 1. Tratamento seguro para arquivos binários
  if (typeInfo.isBinary) {
    const lines = [
      "",
      pc.yellow(`  ⚠️  O arquivo "${basename(filePath)}" é um arquivo binário (${formatBytes(sizeBytes)}).`),
      pc.dim("     Arquivos binários não podem ser renderizados como texto no terminal."),
      "",
      `     ${pc.cyan("Caminho:")} ${filePath}`,
      `     ${pc.cyan("Tipo:")}    ${typeInfo.description}`,
      `     ${pc.cyan("Tamanho:")} ${formatBytes(sizeBytes)}`,
      "",
    ];
    return {
      lines,
      tableOfContents: [],
      rawText: "[Binary Content]",
      sizeBytes,
      typeInfo,
    };
  }

  const rawText = await file.text();

  // 2. Se for Markdown e não estiver em modo --raw
  if (typeInfo.type === "markdown" && !options?.raw) {
    const renderedText = (await createTerminalMarked().parse(sanitizeTerminalInput(rawText))) as string;
    const lines = renderedText.split(/\r?\n/);

    // Mapeia cabeçalhos para o Sumário
    const tableOfContents: { title: string; lineIndex: number }[] = [];
    lines.forEach((line, index) => {
      const plain = stripAnsi(line).trim();
      if (/^#{1,6}\s+/.test(plain)) {
        tableOfContents.push({
          title: plain.replace(/^#+\s*/, ""),
          lineIndex: index,
        });
      }
    });

    return {
      lines,
      tableOfContents,
      rawText,
      sizeBytes,
      typeInfo,
    };
  }

  // 3. Se for Código ou Configuração com Syntax Highlighting
  const safeRawText = sanitizeTerminalInput(rawText);
  const rawLines = safeRawText.split(/\r?\n/);
  const totalDigits = Math.max(2, String(rawLines.length).length);
  const tableOfContents: { title: string; lineIndex: number }[] = [];

  // Mapeia símbolos de código (funções, classes, interfaces, structs, seções) para o sumário
  const codeSymbolRegex =
    /^(?:export\s+)?(?:async\s+)?(?:pub(?:\([^)]*\))?\s+)?(?:function|func|fn|def|class|struct|interface|type|enum|trait|impl|const)\s+([A-Za-z0-9_$]+)/i;
  const sectionCommentRegex = /^(?:\/\/|#|\/\*|--)\s*(?:\[|\bREGION\b|\bSECTION\b|\bMARK\b|#+)\s*(.*)/i;

  let highlightedText = safeRawText;
  if (typeInfo.language && typeInfo.language !== "plaintext" && !options?.raw && pc.isColorSupported) {
    try {
      highlightedText = highlightCli(safeRawText, {
        language: typeInfo.language,
        languageSubset: [],
        ignoreIllegals: true,
      });
    } catch {
      highlightedText = safeRawText;
    }
  }

  const highlightedLines = highlightedText.split(/\r?\n/);
  const lines: string[] = [];

  for (let i = 0; i < highlightedLines.length; i++) {
    const rawLine = rawLines[i] ?? "";
    const lineNumStr = String(i + 1).padStart(totalDigits, " ");
    const gutter = pc.dim(lineNumStr) + pc.cyan(" │ ");
    lines.push(gutter + (highlightedLines[i] ?? ""));

    // Extrai símbolos para o Sumário
    const trimmed = rawLine.trim();
    const symbolMatch = trimmed.match(codeSymbolRegex);
    if (symbolMatch && symbolMatch[1]) {
      tableOfContents.push({
        title: `${symbolMatch[0].split(/\s+/)[0]} ${symbolMatch[1]}`,
        lineIndex: i,
      });
    } else {
      const sectionMatch = trimmed.match(sectionCommentRegex);
      if (sectionMatch && sectionMatch[1]) {
        tableOfContents.push({
          title: sectionMatch[1].replace(/\*\/$/, "").trim(),
          lineIndex: i,
        });
      }
    }
  }

  return {
    lines,
    tableOfContents,
    rawText,
    sizeBytes,
    typeInfo,
  };
}

/**
 * Converte Markdown para linhas formatadas com ANSI e mapeia o sumário (Retrocompatibilidade)
 */
export async function getRenderedMarkdownLines(filePath: string): Promise<{
  lines: string[];
  tableOfContents: { title: string; lineIndex: number }[];
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

/**
 * Abre o leitor interativo de terminal (TUI) para qualquer arquivo
 */
export async function openInteractiveViewer(
  filePath: string,
  options?: { raw?: boolean; lineNumbers?: boolean }
): Promise<void> {
  const loadData = async () => {
    const res = await getRenderedFileLines(filePath, options);
    return {
      renderedLines: res.lines,
      tableOfContents: res.tableOfContents,
      fileSize: res.sizeBytes,
    };
  };

  const initial = await loadData();

  await runInteractiveViewer({
    fileName: basename(filePath),
    filePath,
    fileSize: initial.fileSize,
    renderedLines: initial.renderedLines,
    tableOfContents: initial.tableOfContents,
    onReload: loadData,
  });
}

/**
 * Imprime o arquivo diretamente no terminal com syntax highlighting (sem paginação interativa)
 */
export async function printDirectToTerminal(
  filePath: string,
  options?: { raw?: boolean; lineNumbers?: boolean }
): Promise<void> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const { lines, rawText, typeInfo } = await getRenderedFileLines(filePath, options);
  const fileName = sanitizeTerminalInput(basename(filePath));
  const displayPath = sanitizeTerminalInput(filePath);
  const size = formatBytes(file.size);
  const { words, minutes } = calculateReadingTime(rawText);

  const width = Math.min(process.stdout.columns || 80, 100);
  const separator = pc.cyan("─".repeat(width));

  console.log(separator);
  console.log(`${pc.bold(pc.white(` 📄 ${fileName}`))} ${pc.dim(`(${displayPath})`)}`);
  console.log(
    `${pc.dim(" 📊 Tamanho:")} ${pc.yellow(size)}  │  ` +
      `${pc.dim("🏷️ Tipo:")} ${pc.magenta(typeInfo.description)}  │  ` +
      `${pc.dim("📝 Palavras:")} ${pc.yellow(words.toString())}  │  ` +
      `${pc.dim("⏱️ Leitura:")} ${pc.green(`~${minutes} min`)}`
  );
  console.log(separator);
  console.log("");

  if (typeInfo.type === "markdown" && !options?.raw) {
    try {
      const rendered = createTerminalMarked().parse(sanitizeTerminalInput(rawText));
      console.log(rendered);
    } catch {
      for (const line of lines) {
        console.log(line);
      }
    }
  } else {
    for (const line of lines) {
      console.log(line);
    }
  }

  console.log(pc.dim("─".repeat(width)) + "\n");
}

/**
 * Monitora alterações no arquivo e atualiza a exibição no terminal em tempo real
 */
export async function watchFileInTerminal(
  filePath: string,
  options?: { raw?: boolean; lineNumbers?: boolean }
): Promise<void> {
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
        console.clear();
        try {
          await printDirectToTerminal(filePath, options);
        } catch (error) {
          console.error(pc.red(`Erro ao atualizar o arquivo: ${error instanceof Error ? error.message : error}`));
        }
        console.log(pc.magenta(`👀 Monitorando: ${pc.bold(filePath)} (Pressione Ctrl+C para sair)`));
      } while (renderAgain);
    } finally {
      rendering = false;
    }
  };

  await render();

  await new Promise<void>((resolve, reject) => {
    let watcher: ReturnType<typeof watch>;

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
      // Observar a pasta mantém o monitoramento ativo quando editores salvam por
      // substituição atômica (rename), em vez de alterar o arquivo original.
      watcher = watch(watchedDirectory, (_eventType, changedName) => {
        if (changedName && changedName.toString().toLowerCase() !== watchedName) return;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void render();
        }, 150);
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

