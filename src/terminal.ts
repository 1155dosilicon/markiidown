import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import pc from "picocolors";
import { watch } from "node:fs";
import { basename } from "node:path";
import { calculateReadingTime, formatBytes } from "./utils.ts";
import { runInteractiveViewer } from "./interactive.ts";

// Instância isolada do Marked para terminal CLI
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
  const renderedText = (await terminalMarked.parse(rawMarkdown)) as string;
  const lines = renderedText.split(/\r?\n/);

  // Mapeia cabeçalhos para o Sumário
  const tableOfContents: { title: string; lineIndex: number }[] = [];
  lines.forEach((line, index) => {
    const plain = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").trim();
    if (plain.startsWith("#") || (line.includes("\x1B[") && plain.length > 0 && index < lines.length - 1 && (lines[index + 1]?.includes("───") || lines[index + 1]?.includes("===")))) {
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
    console.error(pc.red(`\n❌ Arquivo não encontrado: ${filePath}`));
    process.exit(1);
  }

  const rawMarkdown = await file.text();
  const fileName = basename(filePath);
  const size = formatBytes(file.size);
  const { words, minutes } = calculateReadingTime(rawMarkdown);

  const width = Math.min(process.stdout.columns || 80, 100);
  const separator = pc.cyan("─".repeat(width));

  console.log(separator);
  console.log(`${pc.bold(pc.white(` 📄 ${fileName}`))} ${pc.dim(`(${filePath})`)}`);
  console.log(
    `${pc.dim(" 📊 Tamanho:")} ${pc.yellow(size)}  │  ` +
      `${pc.dim("📝 Palavras:")} ${pc.yellow(words.toString())}  │  ` +
      `${pc.dim("⏱️ Leitura:")} ${pc.green(`~${minutes} min`)}`
  );
  console.log(separator);
  console.log("");

  try {
    const rendered = terminalMarked.parse(rawMarkdown);
    console.log(rendered);
  } catch (err) {
    console.error(pc.red(`Erro ao renderizar Markdown: ${err}`));
    console.log(rawMarkdown);
  }

  console.log(pc.dim("─".repeat(width)) + "\n");
}

/**
 * Monitora alterações no arquivo e atualiza a exibição no terminal
 */
export async function watchFileInTerminal(filePath: string): Promise<void> {
  console.clear();
  await printDirectToTerminal(filePath);
  console.log(pc.magenta(`👀 Monitorando: ${pc.bold(filePath)} (Pressione Ctrl+C para sair)`));

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    watch(filePath, (eventType) => {
      if (eventType === "change" || eventType === "rename") {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          console.clear();
          await printDirectToTerminal(filePath);
          console.log(pc.magenta(`👀 Monitorando: ${pc.bold(filePath)} (Pressione Ctrl+C para sair)`));
        }, 150);
      }
    });
  } catch (err) {
    console.error(pc.red(`Erro ao iniciar monitoramento: ${err}`));
  }
}
