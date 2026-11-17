import readline from "node:readline";
import pc from "picocolors";
import { padToWidth, stripAnsi, truncateAnsi, wrapAnsi, expandTabsAnsi } from "./ansi.ts";
import { runInteractiveEditor } from "./editor.ts";
import { detectFileType, formatBytes } from "./utils.ts";

// Mantidos como reexportação: testes e outros módulos importam daqui.
export { expandTabsAnsi, stripAnsi, truncateAnsi, wrapAnsi } from "./ansi.ts";

export interface InteractiveOptions {
  fileName: string;
  filePath: string;
  fileSize: number;
  renderedLines: string[];
  /** Texto pesquisável de cada linha, sem cores nem numeração (gutter). */
  searchLines?: string[];
  tableOfContents: { title: string; lineIndex: number }[];
  onReload?: () => Promise<{
    renderedLines: string[];
    searchLines?: string[];
    tableOfContents: { title: string; lineIndex: number }[];
    fileSize: number;
  }>;
}

/**
 * Visualizador interativo de terminal (TUI Pager) com buffer alternativo de tela,
 * quebra visual responsiva, rolagem, busca, sumário e modo editor integrado.
 */
export async function runInteractiveViewer(options: InteractiveOptions): Promise<void> {
  let { fileName, filePath, fileSize, renderedLines, searchLines, tableOfContents } = options;
  const displayFileName = fileName.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

  if (renderedLines.length === 0 || !process.stdout.isTTY || !process.stdin.isTTY) {
    for (const line of renderedLines) {
      console.log(line);
    }
    return;
  }

  // Define o título da janela apenas quando há um terminal realmente interativo.
  process.stdout.write(`\x1B]0;MarkiiDown - ${displayFileName}\x07`);

  let scrollTop = 0;
  let searchActive = false;
  let searchQuery = "";
  let searchMatches: number[] = [];
  let searchMatchSet = new Set<number>();
  let currentMatchIndex = 0;
  let showHelpOverlay = false;
  let showTocOverlay = false;
  let tocSelectedIndex = 0;
  let tocScrollTop = 0;
  let visualLines: { text: string; sourceLineIndex: number }[] = [];
  let sourceToFirstVisualLine: number[] = [];
  let layoutWidth = 0;

  const getTerminalRows = () => process.stdout.rows || 24;
  const getTerminalCols = () => process.stdout.columns || 80;

  function getContentHeight(): number {
    return Math.max(1, getTerminalRows() - 1);
  }

  function rebuildVisualLines(width: number): void {
    if (layoutWidth === width && visualLines.length > 0) return;

    const previousTopSource = visualLines[scrollTop]?.sourceLineIndex ?? 0;
    const nextVisualLines: { text: string; sourceLineIndex: number }[] = [];
    const nextSourceMap: number[] = [];

    renderedLines.forEach((line, sourceLineIndex) => {
      nextSourceMap[sourceLineIndex] = nextVisualLines.length;
      for (const wrappedLine of wrapAnsi(expandTabsAnsi(line), width)) {
        nextVisualLines.push({ text: wrappedLine, sourceLineIndex });
      }
    });

    visualLines = nextVisualLines;
    sourceToFirstVisualLine = nextSourceMap;
    layoutWidth = width;
    scrollTop = sourceToFirstVisualLine[previousTopSource] ?? 0;
  }

  function getMaxScroll(): number {
    return Math.max(0, visualLines.length - getContentHeight());
  }

  function scrollToLine(lineIndex: number, contextLines = 0): void {
    const visualLineIndex = sourceToFirstVisualLine[lineIndex] ?? 0;
    scrollTop = Math.min(getMaxScroll(), Math.max(0, visualLineIndex - contextLines));
  }

  function renderScreen() {
    const totalRows = getTerminalRows();
    const totalCols = getTerminalCols();
    const contentHeight = Math.max(1, totalRows - 1); // Exatamente 1 linha reservada para o rodapé
    rebuildVisualLines(totalCols);
    const totalLines = visualLines.length;
    scrollTop = Math.min(scrollTop, Math.max(0, totalLines - contentHeight));

    let buffer = "";

    if (showHelpOverlay) {
      buffer += renderHelpBuffer(totalCols, contentHeight, totalRows);
      process.stdout.write(buffer);
      return;
    }

    if (showTocOverlay) {
      buffer += renderTocBuffer(totalCols, contentHeight, totalRows);
      process.stdout.write(buffer);
      return;
    }

    // 1. Renderiza as linhas posicionando o cursor linha por linha
    for (let row = 1; row <= contentHeight; row++) {
      const lineIndex = scrollTop + (row - 1);
      buffer += `\x1B[${row};1H\x1B[2K`; // Move para linha exata e limpa a linha

      if (lineIndex < totalLines) {
        const visualLine = visualLines[lineIndex];
        const line = visualLine?.text || "";
        if (searchQuery && visualLine && searchMatchSet.has(visualLine.sourceLineIndex)) {
          const plain = padToWidth(stripAnsi(line), totalCols);
          buffer += pc.bgYellow(pc.black(plain));
        } else {
          buffer += truncateAnsi(line, totalCols);
        }
      } else {
        buffer += pc.dim("~");
      }
    }

    // 2. Renderiza o Rodapé na ÚLTIMA LINHA (totalRows)
    buffer += `\x1B[${totalRows};1H\x1B[2K`;

    if (searchActive) {
      const searchPrompt = ` 🔍 Buscar: ${searchQuery}█ (Enter para buscar, Esc para cancelar)`;
      const clamped = padToWidth(searchPrompt, totalCols);
      buffer += pc.bgYellow(pc.black(clamped));
    } else {
      const percent = totalLines > contentHeight ? Math.min(100, Math.round(((scrollTop + contentHeight) / totalLines) * 100)) : 100;
      const stats = `${scrollTop + 1}-${Math.min(scrollTop + contentHeight, totalLines)}/${totalLines} (${percent}%)`;
      
      let leftText = ` 📄 ${displayFileName} (${formatBytes(fileSize)}) `;
      let rightText = ` [?] Ajuda  [e] Editar  [t] Sumário  [/] Buscar  [q] Sair  ${stats} `;

      if (Bun.stringWidth(stripAnsi(leftText)) + Bun.stringWidth(stripAnsi(rightText)) > totalCols) {
        leftText = ` 📄 ${displayFileName} `;
      }
      if (Bun.stringWidth(stripAnsi(leftText)) + Bun.stringWidth(stripAnsi(rightText)) > totalCols) {
        rightText = ` [e] Editar  [q] Sair ${stats} `;
      }

      leftText = truncateAnsi(leftText, Math.max(0, totalCols - Bun.stringWidth(stripAnsi(rightText))));
      const leftLen = Bun.stringWidth(stripAnsi(leftText));
      const rightLen = Bun.stringWidth(stripAnsi(rightText));
      const fillSpaces = Math.max(0, totalCols - leftLen - rightLen);

      buffer += pc.bgCyan(pc.black(leftText)) + pc.bgBlue(pc.white(" ".repeat(fillSpaces) + rightText));
    }

    process.stdout.write(buffer);
  }

  function renderHelpBuffer(width: number, contentHeight: number, totalRows: number): string {
    let buf = "";
    const lines = [
      pc.bold(pc.cyan("  📖 MarkiiDown - Teclas de Navegação")),
      pc.dim("─".repeat(Math.max(10, width - 4))),
      `  ${pc.yellow("↓ / j / Enter")}     : Rolar 1 linha para baixo`,
      `  ${pc.yellow("↑ / k")}             : Rolar 1 linha para cima`,
      `  ${pc.yellow("Espaço / PgDown")}   : Rolar 1 página para baixo`,
      `  ${pc.yellow("PgUp / b")}          : Rolar 1 página para cima`,
      `  ${pc.yellow("Home / g")}          : Ir para o início do documento`,
      `  ${pc.yellow("End / G")}           : Ir para o final do documento`,
      `  ${pc.yellow("e")}                 : Abrir no Editor Interativo (Editar arquivo)`,
      `  ${pc.yellow("/")}                 : Buscar texto no documento`,
      `  ${pc.yellow("n / N")}             : Próxima / Anterior ocorrência da busca`,
      `  ${pc.yellow("t")}                 : Abrir Sumário (Índice de Seções)`,
      `  ${pc.yellow("? / h")}             : Abrir / Fechar esta tela de ajuda`,
      `  ${pc.yellow("q / Esc")}           : Sair do visualizador`,
      pc.dim("─".repeat(Math.max(10, width - 4))),
      pc.italic(pc.dim("  Pressione qualquer tecla ou Esc para voltar ao documento...")),
    ];

    for (let row = 1; row <= contentHeight; row++) {
      buf += `\x1B[${row};1H\x1B[2K`;
      const line = lines[row - 1];
      if (line) {
        buf += truncateAnsi(line, width);
      }
    }

    buf += `\x1B[${totalRows};1H\x1B[2K`;
    const bottomText = padToWidth(" [Pressione qualquer tecla ou Esc para fechar a ajuda]", width);
    buf += pc.bgCyan(pc.black(bottomText));
    return buf;
  }

  function renderTocBuffer(width: number, contentHeight: number, totalRows: number): string {
    let buf = "";
    const lines = [
      pc.bold(pc.cyan("  📑 Sumário do Documento")),
      pc.dim("─".repeat(Math.max(10, width - 4))),
    ];

    if (tableOfContents.length === 0) {
      lines.push(pc.dim("  Nenhum cabeçalho detectado no documento."));
    } else {
      const visibleCount = Math.max(1, contentHeight - 4);
      const maxTocScroll = Math.max(0, tableOfContents.length - visibleCount);
      tocScrollTop = Math.min(maxTocScroll, Math.max(0, tocScrollTop));
      const visibleItems = tableOfContents.slice(tocScrollTop, tocScrollTop + visibleCount);

      visibleItems.forEach((item, visibleIndex) => {
        const itemIndex = tocScrollTop + visibleIndex;
        const marker = itemIndex === tocSelectedIndex ? pc.cyan(">") : " ";
        const number = pc.yellow(`[${itemIndex + 1}]`);
        lines.push(`${marker} ${number} ${item.title}`);
      });
    }

    lines.push(pc.dim("─".repeat(Math.max(10, width - 4))));
    lines.push(pc.dim("  Use ↑/↓ e Enter para abrir; 't' ou Esc fecha o sumário."));

    for (let row = 1; row <= contentHeight; row++) {
      buf += `\x1B[${row};1H\x1B[2K`;
      const line = lines[row - 1];
      if (line) {
        buf += truncateAnsi(line, width);
      }
    }

    buf += `\x1B[${totalRows};1H\x1B[2K`;
    const bottomText = padToWidth(" [↑/↓] Selecionar  [Enter] Abrir  [t/Esc] Voltar", width);
    buf += pc.bgCyan(pc.black(bottomText));
    return buf;
  }

  function performSearch() {
    searchMatches = [];
    if (!searchQuery.trim()) return;
    const cleanQuery = searchQuery.toLowerCase();

    // Pesquisa o texto sem a numeração de linhas: buscar "1" não deve casar
    // com toda linha cujo número contém 1.
    renderedLines.forEach((line, index) => {
      const plainText = (searchLines?.[index] ?? stripAnsi(line)).toLowerCase();
      if (plainText.includes(cleanQuery)) {
        searchMatches.push(index);
      }
    });

    searchMatchSet = new Set(searchMatches);
    if (searchMatches.length > 0) {
      currentMatchIndex = 0;
      scrollToLine(searchMatches[0], 2);
    }
  }

  let cleanedUp = false;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    // Restaura tela original do usuário, cursor e atributos
    process.stdout.write("\x1B[?1049l\x1B[?25h\x1B[0m");
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      } catch {}
    }
  }

  // Ativa Alternate Screen Buffer e esconde o cursor
  process.stdout.write("\x1B[?1049h\x1B[?25l");

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }

  renderScreen();

  const handleResize = () => {
    renderScreen();
  };
  process.stdout.on("resize", handleResize);

  return new Promise<void>((resolvePromise) => {
    const finish = () => {
      cleanup();
      process.stdout.removeListener("resize", handleResize);
      process.stdin.removeListener("keypress", handleKeypress);
      resolvePromise();
    };

    const handleKeypress = async (str: string, key: readline.Key) => {
      if (key && key.ctrl && key.name === "c") {
        finish();
        return;
      }

      if (showHelpOverlay) {
        showHelpOverlay = false;
        renderScreen();
        return;
      }

      if (showTocOverlay) {
        if (key && (key.name === "escape" || key.name === "t" || str === "q")) {
          showTocOverlay = false;
          renderScreen();
          return;
        }

        if (tableOfContents.length === 0) return;

        const visibleCount = Math.max(1, getContentHeight() - 4);
        if ((key && key.name === "down") || str === "j") {
          tocSelectedIndex = Math.min(tableOfContents.length - 1, tocSelectedIndex + 1);
          if (tocSelectedIndex >= tocScrollTop + visibleCount) {
            tocScrollTop = tocSelectedIndex - visibleCount + 1;
          }
          renderScreen();
          return;
        }
        if ((key && key.name === "up") || str === "k") {
          tocSelectedIndex = Math.max(0, tocSelectedIndex - 1);
          if (tocSelectedIndex < tocScrollTop) tocScrollTop = tocSelectedIndex;
          renderScreen();
          return;
        }
        if (key && key.name === "pagedown") {
          tocSelectedIndex = Math.min(tableOfContents.length - 1, tocSelectedIndex + visibleCount);
          tocScrollTop = Math.min(tocSelectedIndex, Math.max(0, tableOfContents.length - visibleCount));
          renderScreen();
          return;
        }
        if (key && key.name === "pageup") {
          tocSelectedIndex = Math.max(0, tocSelectedIndex - visibleCount);
          tocScrollTop = tocSelectedIndex;
          renderScreen();
          return;
        }
        if (key && key.name === "return") {
          const target = tableOfContents[tocSelectedIndex];
          scrollToLine(target.lineIndex);
          showTocOverlay = false;
          renderScreen();
          return;
        }
        return;
      }

      if (searchActive) {
        if (key && key.name === "return") {
          searchActive = false;
          performSearch();
          renderScreen();
          return;
        }
        if (key && (key.name === "escape" || (key.ctrl && key.name === "g"))) {
          searchActive = false;
          searchQuery = "";
          searchMatches = [];
          searchMatchSet = new Set();
          renderScreen();
          return;
        }
        if (key && key.name === "backspace") {
          searchQuery = searchQuery.slice(0, -1);
          renderScreen();
          return;
        }
        // Aceita qualquer texto imprimível (emoji e caracteres compostos têm
        // length > 1 em UTF-16), mas não teclas de controle.
        if (str && !key?.ctrl && !key?.meta && !/[\x00-\x1F\x7F]/.test(str)) {
          searchQuery += str;
          renderScreen();
          return;
        }
        return;
      }

      const totalRows = getTerminalRows();
      const contentHeight = Math.max(1, totalRows - 1);
      const maxScroll = Math.max(0, visualLines.length - contentHeight);

      if (str === "q" || (key && key.name === "escape")) {
        finish();
        return;
      }

      if (str === "e" || str === "E") {
        // Abrir um binário no editor e salvar corromperia o arquivo
        if (detectFileType(filePath).isBinary) return;

        cleanup();
        process.stdout.removeListener("resize", handleResize);
        process.stdin.removeListener("keypress", handleKeypress);

        const editResult = await runInteractiveEditor({ filePath });

        if (editResult.saved && options.onReload) {
          try {
            const reloaded = await options.onReload();
            renderedLines = reloaded.renderedLines;
            searchLines = reloaded.searchLines;
            tableOfContents = reloaded.tableOfContents;
            fileSize = reloaded.fileSize;
            layoutWidth = 0;
          } catch {}
        }

        // Restabelece viewer
        cleanedUp = false;
        process.stdout.write("\x1B[?1049h\x1B[?25l");
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
          process.stdin.resume();
        }
        process.stdout.on("resize", handleResize);
        process.stdin.on("keypress", handleKeypress);
        renderScreen();
        return;
      }

      if (str === "?" || str === "h") {
        showHelpOverlay = true;
        renderScreen();
        return;
      }

      if (str === "t") {
        showTocOverlay = true;
        tocSelectedIndex = 0;
        tocScrollTop = 0;
        renderScreen();
        return;
      }

      if (str === "/") {
        searchActive = true;
        searchQuery = "";
        renderScreen();
        return;
      }

      if (str === "n" && searchMatches.length > 0) {
        currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
        scrollToLine(searchMatches[currentMatchIndex], 2);
        renderScreen();
        return;
      }

      if (str === "N" && searchMatches.length > 0) {
        currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
        scrollToLine(searchMatches[currentMatchIndex], 2);
        renderScreen();
        return;
      }

      if (
        (key && (key.name === "down" || key.name === "return")) ||
        str === "j"
      ) {
        if (scrollTop < maxScroll) {
          scrollTop = Math.min(maxScroll, scrollTop + 1);
          renderScreen();
        }
        return;
      }

      if ((key && key.name === "up") || str === "k") {
        if (scrollTop > 0) {
          scrollTop = Math.max(0, scrollTop - 1);
          renderScreen();
        }
        return;
      }

      if ((key && key.name === "pagedown") || str === " " || str === "f") {
        if (scrollTop < maxScroll) {
          scrollTop = Math.min(maxScroll, scrollTop + contentHeight);
          renderScreen();
        }
        return;
      }

      if ((key && key.name === "pageup") || str === "b") {
        if (scrollTop > 0) {
          scrollTop = Math.max(0, scrollTop - contentHeight);
          renderScreen();
        }
        return;
      }

      if ((key && key.name === "home") || str === "g") {
        scrollTop = 0;
        renderScreen();
        return;
      }

      if ((key && key.name === "end") || str === "G") {
        scrollTop = maxScroll;
        renderScreen();
        return;
      }
    };

    process.stdin.on("keypress", handleKeypress);
  });
}
