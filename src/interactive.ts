import readline from "node:readline";
import pc from "picocolors";
import { formatBytes } from "./utils.ts";

export interface InteractiveOptions {
  fileName: string;
  filePath: string;
  fileSize: number;
  renderedLines: string[];
  tableOfContents: { title: string; lineIndex: number }[];
}

/**
 * Remove códigos de controle ANSI para calcular tamanho visual real do texto
 */
function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Trunca uma string contendo códigos ANSI sem quebrar tags ou ultrapassar a largura da tela
 */
function truncateAnsi(str: string, maxWidth: number): string {
  let visualWidth = 0;
  let result = "";
  let insideEscape = false;
  let escapeSeq = "";

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === "\x1B") {
      insideEscape = true;
      escapeSeq = char;
      continue;
    }

    if (insideEscape) {
      escapeSeq += char;
      if (char >= "A" && char <= "z") {
        insideEscape = false;
        result += escapeSeq;
        escapeSeq = "";
      }
      continue;
    }

    if (visualWidth >= maxWidth) {
      break;
    }

    result += char;
    visualWidth++;
  }

  // Reseta cores caso tenha sido cortado com cor ativa
  if (result.includes("\x1B[")) {
    result += "\x1B[0m";
  }

  return result;
}

/**
 * Visualizador interativo de terminal (TUI Pager) com buffer alternativo de tela,
 * rolagem perfeita sem quebras de linha e rodapé fixado rigidamente na base.
 */
export async function runInteractiveViewer(options: InteractiveOptions): Promise<void> {
  const { fileName, fileSize, renderedLines, tableOfContents } = options;
  const totalLines = renderedLines.length;

  // Define o título da janela no Windows
  process.stdout.write(`\x1B]0;MarkiiDown - ${fileName}\x07`);

  if (totalLines === 0 || !process.stdout.isTTY) {
    for (const line of renderedLines) {
      console.log(line);
    }
    return;
  }

  let scrollTop = 0;
  let searchActive = false;
  let searchQuery = "";
  let searchMatches: number[] = [];
  let currentMatchIndex = 0;
  let showHelpOverlay = false;
  let showTocOverlay = false;

  const getTerminalRows = () => process.stdout.rows || 24;
  const getTerminalCols = () => process.stdout.columns || 80;

  function renderScreen() {
    const totalRows = getTerminalRows();
    const totalCols = getTerminalCols();
    const contentHeight = Math.max(1, totalRows - 1); // Exatamente 1 linha reservada para o rodapé

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

    // 1. Renderiza as linhas do Markdown posicionando o cursor linha por linha
    for (let row = 1; row <= contentHeight; row++) {
      const lineIndex = scrollTop + (row - 1);
      buffer += `\x1B[${row};1H\x1B[2K`; // Move para linha exata e limpa a linha

      if (lineIndex < totalLines) {
        const line = renderedLines[lineIndex] || "";
        if (searchQuery && searchMatches.includes(lineIndex)) {
          const plain = stripAnsi(line).padEnd(totalCols).slice(0, totalCols);
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
      const clamped = searchPrompt.padEnd(totalCols).slice(0, totalCols);
      buffer += pc.bgYellow(pc.black(clamped));
    } else {
      const percent = totalLines > contentHeight ? Math.min(100, Math.round(((scrollTop + contentHeight) / totalLines) * 100)) : 100;
      const stats = `${scrollTop + 1}-${Math.min(scrollTop + contentHeight, totalLines)}/${totalLines} (${percent}%)`;
      
      let leftText = ` 📄 ${fileName} (${formatBytes(fileSize)}) `;
      let rightText = ` [?] Ajuda  [t] Sumário  [/] Buscar  [q] Sair  ${stats} `;

      if (stripAnsi(leftText).length + stripAnsi(rightText).length > totalCols) {
        leftText = ` 📄 ${fileName} `;
      }
      if (stripAnsi(leftText).length + stripAnsi(rightText).length > totalCols) {
        rightText = ` [q] Sair ${stats} `;
      }

      const leftLen = stripAnsi(leftText).length;
      const rightLen = stripAnsi(rightText).length;
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
    const bottomText = " [Pressione qualquer tecla ou Esc para fechar a ajuda]".padEnd(width).slice(0, width);
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
      tableOfContents.slice(0, Math.max(1, contentHeight - 4)).forEach((item, index) => {
        lines.push(`  ${pc.yellow(`[${index + 1}]`)} ${item.title}`);
      });
    }

    lines.push(pc.dim("─".repeat(Math.max(10, width - 4))));
    lines.push(pc.dim("  Digite o número da seção para pular ou 't'/'Esc' para fechar."));

    for (let row = 1; row <= contentHeight; row++) {
      buf += `\x1B[${row};1H\x1B[2K`;
      const line = lines[row - 1];
      if (line) {
        buf += truncateAnsi(line, width);
      }
    }

    buf += `\x1B[${totalRows};1H\x1B[2K`;
    const bottomText = " [Pressione o número correspondente ou 't'/'Esc' para voltar]".padEnd(width).slice(0, width);
    buf += pc.bgCyan(pc.black(bottomText));
    return buf;
  }

  function performSearch() {
    searchMatches = [];
    if (!searchQuery.trim()) return;
    const cleanQuery = searchQuery.toLowerCase();

    renderedLines.forEach((line, index) => {
      const plainText = stripAnsi(line).toLowerCase();
      if (plainText.includes(cleanQuery)) {
        searchMatches.push(index);
      }
    });

    if (searchMatches.length > 0) {
      currentMatchIndex = 0;
      scrollTop = Math.max(0, searchMatches[0] - 2);
    }
  }

  function cleanup() {
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
    process.stdin.on("keypress", (str, key) => {
      if (key && key.ctrl && key.name === "c") {
        cleanup();
        process.exit(0);
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
        const num = parseInt(str, 10);
        if (!isNaN(num) && num >= 1 && num <= tableOfContents.length) {
          const target = tableOfContents[num - 1];
          scrollTop = Math.max(0, target.lineIndex);
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
          renderScreen();
          return;
        }
        if (key && key.name === "backspace") {
          searchQuery = searchQuery.slice(0, -1);
          renderScreen();
          return;
        }
        if (str && str.length === 1) {
          searchQuery += str;
          renderScreen();
          return;
        }
        return;
      }

      const totalRows = getTerminalRows();
      const contentHeight = Math.max(1, totalRows - 1);
      const maxScroll = Math.max(0, totalLines - contentHeight);

      if (str === "q" || (key && key.name === "escape")) {
        cleanup();
        process.stdout.removeListener("resize", handleResize);
        resolvePromise();
        return;
      }

      if (str === "?" || str === "h") {
        showHelpOverlay = true;
        renderScreen();
        return;
      }

      if (str === "t") {
        showTocOverlay = true;
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
        scrollTop = Math.max(0, searchMatches[currentMatchIndex] - 2);
        renderScreen();
        return;
      }

      if (str === "N" && searchMatches.length > 0) {
        currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
        scrollTop = Math.max(0, searchMatches[currentMatchIndex] - 2);
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
    });
  });
}
