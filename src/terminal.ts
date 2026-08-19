import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import pc from "picocolors";
import { watch } from "node:fs";
import { basename, dirname } from "node:path";
import { calculateReadingTime, formatBytes } from "./utils.ts";
import { runInteractiveViewer, stripAnsi } from "./interactive.ts";

function createTerminalMarked(): Marked {
  const terminalMarked = new Marked();
  terminalMarked.use(
    markedTerminal({
      width: Math.min(process.stdout.columns || 80, 100),
      reflowText: true,
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
    }) as any
  );
  return terminalMarked;
}

function sanitizeTerminalInput(markdown: string): string {
  // Preserva tabulação e quebras de linha, mas impede que um documento injete
  // sequências de controle (OSC/CSI) no terminal do usuário.
  return markdown.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "�");
}

/**
 * Converte Markdown para linhas formatadas com ANSI e mapeia o sumário
 */
export async function getRenderedMarkdownLines(filePath: string): Promise<{
  lines: string[];
  tableOfContents: { title: string; lineIndex: number }[];
  rawMarkdown: string;
  sizeBytes: number;
}> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const rawMarkdown = await file.text();
  const renderedText = (await createTerminalMarked().parse(sanitizeTerminalInput(rawMarkdown))) as string;
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
    rawMarkdown,
    sizeBytes: file.size,
  };
}

/**
 * Abre o leitor interativo de terminal (TUI)
 */
export async function openInteractiveViewer(filePath: string): Promise<void> {
  const { lines, tableOfContents, sizeBytes } = await getRenderedMarkdownLines(filePath);
  await runInteractiveViewer({
    fileName: basename(filePath),
    filePath,
    fileSize: sizeBytes,
    renderedLines: lines,
    tableOfContents,
  });
}

/**
 * Imprime o Markdown diretamente no terminal (sem paginação interativa)
 */
export async function printDirectToTerminal(filePath: string): Promise<void> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const rawMarkdown = await file.text();
  const fileName = sanitizeTerminalInput(basename(filePath));
  const displayPath = sanitizeTerminalInput(filePath);
  const size = formatBytes(file.size);
  const { words, minutes } = calculateReadingTime(rawMarkdown);

  const width = Math.min(process.stdout.columns || 80, 100);
  const separator = pc.cyan("─".repeat(width));

  console.log(separator);
  console.log(`${pc.bold(pc.white(` 📄 ${fileName}`))} ${pc.dim(`(${displayPath})`)}`);
  console.log(
    `${pc.dim(" 📊 Tamanho:")} ${pc.yellow(size)}  │  ` +
      `${pc.dim("📝 Palavras:")} ${pc.yellow(words.toString())}  │  ` +
      `${pc.dim("⏱️ Leitura:")} ${pc.green(`~${minutes} min`)}`
  );
  console.log(separator);
  console.log("");

  try {
    const rendered = createTerminalMarked().parse(sanitizeTerminalInput(rawMarkdown));
    console.log(rendered);
  } catch (err) {
    console.error(pc.red(`Erro ao renderizar Markdown: ${err}`));
    console.log(sanitizeTerminalInput(rawMarkdown));
  }

  console.log(pc.dim("─".repeat(width)) + "\n");
}

/**
 * Monitora alterações no arquivo e atualiza a exibição no terminal
 */
export async function watchFileInTerminal(filePath: string): Promise<void> {
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
          await printDirectToTerminal(filePath);
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
