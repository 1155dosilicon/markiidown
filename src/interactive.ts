import { highlightRanges, padToWidth, stripAnsi, truncateAnsi, visibleWidth, wrapAnsiDetailed } from "./ansi.ts";
import { colorEnabled, pc } from "./colors.ts";
import { runInteractiveEditor } from "./editor.ts";
import type { KeyEvent, InputEvent } from "./keys.ts";
import { processTerminal, type TerminalIO } from "./terminal-io.ts";
import { formatBytes } from "./utils.ts";

// Mantidos como reexportação: testes e outros módulos importam daqui.
export { expandTabsAnsi, stripAnsi, truncateAnsi, wrapAnsi } from "./ansi.ts";

/** O que o leitor mostra. É recarregado ao redimensionar (Markdown) e depois de editar. */
export interface ViewerContent {
  renderedLines: string[];
  /** Texto pesquisável de cada linha, sem cores nem numeração. */
  searchLines?: string[];
  /** A linha continua o parágrafo da anterior: a busca as junta (frases que caem na quebra). */
  continued?: boolean[];
  tableOfContents: { title: string; lineIndex: number; level?: number }[];
  fileSize: number;
  /** Colunas ocupadas pela numeração; as continuações de linha recuam isso. */
  gutterWidth?: number;
  /** Se verdadeiro, `load` é chamado de novo quando a largura muda. */
  widthDependent?: boolean;
  isBinary?: boolean;
}

export interface InteractiveOptions {
  fileName: string;
  filePath: string;
  /** Carrega o conteúdo formatado para a largura informada. */
  load: (columns: number) => Promise<ViewerContent>;
  terminal?: TerminalIO;
  /** Abre o editor (injetável nos testes). */
  openEditor?: (filePath: string, terminal: TerminalIO) => Promise<{ saved: boolean }>;
}

interface VisualLine {
  text: string;
  source: number;
  /** Índice desta linha visual entre as linhas visuais da mesma linha lógica. */
  segment: number;
  /** Onde ela começa no texto visível da linha lógica. */
  start: number;
}

interface SearchState {
  query: string;
  /** Ocorrências em ordem: linha onde começam e posição no texto pesquisável. */
  matches: { line: number; start: number; end: number }[];
  current: number;
  /** Trechos a destacar em cada linha; uma ocorrência pode ocupar duas linhas. */
  byLine: Map<number, { start: number; end: number; match: number }[]>;
}

const MATCH_STYLE = colorEnabled ? "\x1B[30;43m" : "\x1B[7m";
const CURRENT_MATCH_STYLE = colorEnabled ? "\x1B[30;46m" : "\x1B[7;4m";

/**
 * Encontra todas as ocorrências de `needle` em `haystack` sem diferenciar
 * maiúsculas de minúsculas. As posições são do texto original, mesmo quando
 * a versão minúscula de um caractere tem outro tamanho (ex.: "İ").
 */
export function findAllCaseInsensitive(haystack: string, needle: string): { start: number; end: number }[] {
  if (!needle) return [];
  const loweredNeedle = needle.toLowerCase();
  let lowered = "";
  const originalIndex: number[] = [];
  for (let index = 0; index < haystack.length; ) {
    const codePoint = haystack.codePointAt(index)!;
    const char = String.fromCodePoint(codePoint);
    const lower = char.toLowerCase();
    for (let k = 0; k < lower.length; k++) originalIndex.push(index);
    lowered += lower;
    index += char.length;
  }
  originalIndex.push(haystack.length);

  const result: { start: number; end: number }[] = [];
  let from = 0;
  while (true) {
    const found = lowered.indexOf(loweredNeedle, from);
    if (found < 0) break;
    const start = originalIndex[found];
    const end = originalIndex[found + loweredNeedle.length] ?? haystack.length;
    if (end > start) result.push({ start, end });
    from = found + Math.max(1, loweredNeedle.length);
  }
  return result;
}

/**
 * Leitor interativo de terminal (pager): tela alternativa, quebra de linha
 * responsiva, rolagem, busca, sumário, ajuda e atalho para o editor.
 */
export async function runInteractiveViewer(options: InteractiveOptions): Promise<void> {
  const terminal = options.terminal ?? processTerminal();
  const openEditor = options.openEditor ?? ((filePath: string, io: TerminalIO) => runInteractiveEditor({ filePath, terminal: io }));
  const displayFileName = options.fileName.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

  let content = await options.load(terminal.columns());

  if (!terminal.isTTY) {
    for (const line of content.renderedLines) terminal.write(line + "\n");
    return;
  }

  let visualLines: VisualLine[] = [];
  let sourceToFirstVisual: number[] = [];
  let layoutColumns = -1;
  let scrollTop = 0;
  let mode: "view" | "help" | "toc" | "search" = "view";
  let searchInput = "";
  let search: SearchState | null = null;
  let message: string | null = null;
  let messageTimer: ReturnType<typeof setTimeout> | null = null;
  let tocSelected = 0;
  let tocScroll = 0;
  let finished = false;
  let reloadGeneration = 0;
  const highlightedCache = new Map<number, string[]>();

  const rows = () => Math.max(2, terminal.rows());
  const columns = () => Math.max(10, terminal.columns());
  const contentHeight = () => rows() - 1;

  // ---------------------------------------------------------------- layout

  function rebuildLayout(width: number, force = false): void {
    if (!force && width === layoutColumns) return;
    const topSource = visualLines[scrollTop]?.source ?? 0;
    const topSegment = visualLines[scrollTop]?.segment ?? 0;
    const indent = " ".repeat(content.gutterWidth ?? 0);
    const nextVisual: VisualLine[] = [];
    const nextFirst: number[] = [];

    content.renderedLines.forEach((line, source) => {
      nextFirst[source] = nextVisual.length;
      const wrapped = wrapAnsiDetailed(line, width, indent);
      wrapped.lines.forEach((text, segment) => nextVisual.push({ text, source, segment, start: wrapped.starts[segment] }));
    });

    visualLines = nextVisual;
    sourceToFirstVisual = nextFirst;
    layoutColumns = width;
    highlightedCache.clear();
    const firstOfTop = sourceToFirstVisual[Math.min(topSource, sourceToFirstVisual.length - 1)] ?? 0;
    scrollTop = clampScroll(firstOfTop + Math.min(topSegment, countSegments(topSource) - 1));
  }

  function countSegments(source: number): number {
    const first = sourceToFirstVisual[source];
    if (first === undefined) return 1;
    const next = sourceToFirstVisual[source + 1] ?? visualLines.length;
    return Math.max(1, next - first);
  }

  function maxScroll(): number {
    return Math.max(0, visualLines.length - contentHeight());
  }

  function clampScroll(value: number): number {
    return Math.min(maxScroll(), Math.max(0, value));
  }

  /** Diferença entre o texto visível da linha (com numeração) e o texto pesquisável. */
  function searchPrefixLength(source: number): number {
    const plain = stripAnsi(content.renderedLines[source] ?? "");
    const searchable = content.searchLines?.[source] ?? plain;
    const prefix = plain.length - searchable.length;
    return prefix >= 0 && plain.endsWith(searchable) ? prefix : 0;
  }

  /** Linhas visuais de uma linha lógica com as ocorrências da busca destacadas. */
  function highlightedSegments(source: number): string[] | null {
    if (!search) return null;
    const ranges = search.byLine.get(source);
    if (!ranges) return null;
    const cached = highlightedCache.get(source);
    if (cached) return cached;

    const prefix = searchPrefixLength(source);
    const shift = (list: typeof ranges) => list.map((range) => ({ start: range.start + prefix, end: range.end + prefix }));
    let line = content.renderedLines[source];
    line = highlightRanges(line, shift(ranges.filter((range) => range.match !== search!.current)), MATCH_STYLE);
    line = highlightRanges(line, shift(ranges.filter((range) => range.match === search!.current)), CURRENT_MATCH_STYLE);
    const segments = wrapAnsiDetailed(line, layoutColumns, " ".repeat(content.gutterWidth ?? 0)).lines;
    highlightedCache.set(source, segments);
    return segments;
  }

  // ----------------------------------------------------------------- busca

  /**
   * Busca em cada parágrafo inteiro: linhas que são continuação da anterior
   * (quebradas só por falta de espaço) são juntadas com um espaço, para achar
   * frases que caíram na quebra. Cada ocorrência é depois repartida entre as
   * linhas que ela ocupa.
   */
  function runSearch(query: string): void {
    const matches: SearchState["matches"] = [];
    const byLine: SearchState["byLine"] = new Map();
    const total = content.renderedLines.length;
    const searchable = (index: number) => content.searchLines?.[index] ?? stripAnsi(content.renderedLines[index]);

    for (let first = 0; first < total; ) {
      let last = first;
      while (last + 1 < total && content.continued?.[last + 1]) last++;

      let joined = "";
      const starts: number[] = [];
      for (let index = first; index <= last; index++) {
        if (index > first) joined += " ";
        starts.push(joined.length);
        joined += searchable(index);
      }

      for (const found of findAllCaseInsensitive(joined, query)) {
        const matchIndex = matches.length;
        let firstPiece: { line: number; start: number; end: number } | null = null;
        for (let index = first; index <= last; index++) {
          const lineStart = starts[index - first];
          const lineEnd = lineStart + searchable(index).length;
          const start = Math.max(found.start, lineStart);
          const end = Math.min(found.end, lineEnd);
          if (start >= end) continue;
          const piece = { start: start - lineStart, end: end - lineStart, match: matchIndex };
          byLine.set(index, [...(byLine.get(index) ?? []), piece]);
          firstPiece ??= { line: index, start: piece.start, end: piece.end };
        }
        if (firstPiece) matches.push(firstPiece);
      }
      first = last + 1;
    }

    search = { query, matches, current: 0, byLine };
    highlightedCache.clear();
  }

  function visualIndexOfMatch(match: { line: number; start: number }): number {
    const first = sourceToFirstVisual[match.line] ?? 0;
    const offset = match.start + searchPrefixLength(match.line);
    let index = first;
    const end = first + countSegments(match.line);
    while (index + 1 < end && visualLines[index + 1].start <= offset) index++;
    return index;
  }

  function revealMatch(): void {
    if (!search || search.matches.length === 0) return;
    const target = visualIndexOfMatch(search.matches[search.current]);
    // Deixa duas linhas de contexto acima da ocorrência
    if (target < scrollTop || target >= scrollTop + contentHeight()) scrollTop = clampScroll(target - 2);
    highlightedCache.clear();
  }

  function jumpToFirstMatchFromTop(): void {
    if (!search || search.matches.length === 0) return;
    const topSource = visualLines[scrollTop]?.source ?? 0;
    const index = search.matches.findIndex((match) => match.line >= topSource);
    search.current = index >= 0 ? index : 0;
    revealMatch();
  }

  function moveMatch(step: 1 | -1): void {
    if (!search || search.matches.length === 0) {
      showMessage(search ? `Nenhuma ocorrência de “${search.query}”` : "Nenhuma busca ativa. Pressione / para buscar.");
      return;
    }
    const total = search.matches.length;
    const next = search.current + step;
    if (next >= total) showMessage("Fim do documento: recomeçando do início");
    else if (next < 0) showMessage("Início do documento: continuando do fim");
    search.current = (next + total) % total;
    revealMatch();
  }

  function showMessage(text: string, durationMs = 2500): void {
    message = text;
    if (messageTimer) clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      message = null;
      messageTimer = null;
      if (!finished) render();
    }, durationMs);
  }

  // ------------------------------------------------------------------ tela

  function render(): void {
    if (finished) return;
    const width = columns();
    const height = contentHeight();
    rebuildLayout(width);
    scrollTop = clampScroll(scrollTop);

    let frame = "\x1B[?25l";
    const body = mode === "help" ? helpLines(width) : mode === "toc" ? tocLines(width, height) : null;

    for (let row = 0; row < height; row++) {
      frame += `\x1B[${row + 1};1H\x1B[0m`;
      if (body) {
        frame += truncateAnsi(body[row] ?? "", width);
      } else {
        const visual = visualLines[scrollTop + row];
        if (visual) {
          const highlighted = highlightedSegments(visual.source);
          frame += truncateAnsi(highlighted?.[visual.segment] ?? visual.text, width);
        } else {
          frame += pc.dim("~");
        }
      }
      frame += "\x1B[0m\x1B[K";
    }

    frame += `\x1B[${rows()};1H\x1B[0m` + statusBar(width) + "\x1B[0m";
    terminal.write(frame);
  }

  function statusBar(width: number): string {
    const style = (text: string) => (colorEnabled ? pc.bgBlue(pc.white(text)) : `\x1B[7m${text}\x1B[27m`);

    if (mode === "search") {
      const prompt = ` 🔍 Buscar: ${searchInput}▏`;
      const hint = "  Enter: buscar · Esc: cancelar ";
      const text = visibleWidth(prompt) + visibleWidth(hint) <= width ? prompt + " ".repeat(width - visibleWidth(prompt) - visibleWidth(hint)) + hint : prompt;
      return colorEnabled ? pc.bgYellow(pc.black(padToWidth(text, width))) : `\x1B[7m${padToWidth(text, width)}\x1B[27m`;
    }
    if (mode === "help") return style(padToWidth(" Ajuda · qualquer tecla volta ao documento", width));
    if (mode === "toc") return style(padToWidth(" Sumário · ↑/↓ escolher · Enter ir · Esc/t voltar", width));
    if (message) return style(padToWidth(` ${message}`, width));

    const total = visualLines.length;
    const height = contentHeight();
    const last = Math.min(scrollTop + height, total);
    const percent = total <= height ? 100 : Math.round((last / total) * 100);
    const position = ` ${scrollTop + 1}-${last}/${total} (${percent}%) `;
    const searchInfo = search
      ? search.matches.length > 0
        ? ` “${search.query}” ${search.current + 1}/${search.matches.length} `
        : ` “${search.query}” 0/0 `
      : "";

    const nameFull = ` 📄 ${displayFileName} (${formatBytes(content.fileSize)}) `;
    const nameShort = ` 📄 ${displayFileName} `;
    const shortcutSets = [
      " [?] Ajuda  [e] Editar  [t] Sumário  [/] Buscar  [q] Sair ",
      " [?] Ajuda  [/] Buscar  [q] Sair ",
      " [?] Ajuda  [q] Sair ",
      "",
    ];

    // Escolhe a combinação mais completa que cabe; o nome do arquivo é cortado por último
    for (const shortcuts of shortcutSets) {
      for (const name of [nameFull, nameShort]) {
        const right = searchInfo + shortcuts + position;
        const used = visibleWidth(name) + visibleWidth(right);
        if (used <= width) {
          const left = colorEnabled ? pc.bgCyan(pc.black(name)) : name;
          return left + style(" ".repeat(width - used) + right);
        }
      }
    }
    const right = searchInfo + position;
    const nameSpace = width - visibleWidth(right);
    if (nameSpace >= 6) {
      const name = padToWidth(nameShort, nameSpace);
      return (colorEnabled ? pc.bgCyan(pc.black(name)) : name) + style(right);
    }
    return style(padToWidth(right.trim() ? right : position, width));
  }

  function helpLines(width: number): string[] {
    const rule = pc.dim("─".repeat(Math.max(10, Math.min(width - 2, 70))));
    const row = (keys: string, action: string) => `  ${pc.yellow(keys.padEnd(18))} ${action}`;
    return [
      pc.bold(pc.cyan("  📖 MarkiiDown — teclas do leitor")),
      rule,
      row("↓  j  Enter", "Descer uma linha"),
      row("↑  k", "Subir uma linha"),
      row("Espaço  PgDn  f", "Descer uma página"),
      row("PgUp  b", "Subir uma página"),
      row("Home  g", "Início do documento"),
      row("End  G", "Fim do documento"),
      row("/", "Buscar (sem diferenciar maiúsculas)"),
      row("n  N", "Próxima / anterior ocorrência"),
      row("t", "Sumário: títulos ou funções e classes"),
      row("e", "Editar o arquivo"),
      row("?  h", "Esta ajuda"),
      row("q  Esc  Ctrl+C", "Sair"),
      rule,
    ];
  }

  function tocLines(width: number, height: number): string[] {
    const entries = content.tableOfContents;
    const lines = [pc.bold(pc.cyan("  📑 Sumário")), pc.dim("─".repeat(Math.max(10, Math.min(width - 2, 70))))];
    if (entries.length === 0) {
      lines.push(pc.dim("  Nenhum título ou símbolo encontrado neste arquivo."));
      return lines;
    }
    const visibleCount = Math.max(1, height - 2);
    tocScroll = Math.min(Math.max(0, entries.length - visibleCount), Math.max(0, tocScroll));
    if (tocSelected < tocScroll) tocScroll = tocSelected;
    if (tocSelected >= tocScroll + visibleCount) tocScroll = tocSelected - visibleCount + 1;
    const minLevel = Math.min(...entries.map((entry) => entry.level ?? 1));
    entries.slice(tocScroll, tocScroll + visibleCount).forEach((entry, offset) => {
      const index = tocScroll + offset;
      const indent = "  ".repeat(Math.max(0, (entry.level ?? 1) - minLevel));
      const text = `${indent}${entry.title}`;
      lines.push(index === tocSelected ? pc.cyan("› ") + pc.bold(text) : "  " + text);
    });
    return lines;
  }

  // ---------------------------------------------------------------- teclas

  function handleKey(event: InputEvent): void {
    if (finished) return;

    if (event.kind === "paste") {
      if (mode === "search") {
        searchInput += event.text.replace(/[\r\n]+/g, " ").replace(/[\u0000-\u001F\u007F]/g, "");
        render();
      }
      return;
    }
    const key = event;

    if (key.ctrl && key.name === "c") {
      void finish();
      return;
    }

    if (mode === "help") {
      mode = "view";
      render();
      return;
    }
    if (mode === "toc") return handleTocKey(key);
    if (mode === "search") return handleSearchKey(key);

    const height = contentHeight();
    switch (true) {
      case key.name === "q" && !key.ctrl && !key.meta:
      case key.name === "escape":
        void finish();
        return;
      case key.name === "e" && !key.ctrl && !key.meta:
        void editFile();
        return;
      case key.text === "?" || (key.name === "h" && !key.ctrl && !key.meta):
        mode = "help";
        break;
      case key.name === "t" && !key.ctrl && !key.meta:
        openToc();
        break;
      case key.text === "/":
        mode = "search";
        searchInput = "";
        break;
      case key.text === "n":
        moveMatch(1);
        break;
      case key.text === "N":
        moveMatch(-1);
        break;
      case key.name === "down" || key.name === "return" || key.name === "enter" || key.text === "j":
        scrollTop = clampScroll(scrollTop + 1);
        break;
      case key.name === "up" || key.text === "k":
        scrollTop = clampScroll(scrollTop - 1);
        break;
      case key.name === "pagedown" || key.name === "space" || key.text === "f":
        scrollTop = clampScroll(scrollTop + height);
        break;
      case key.name === "pageup" || key.text === "b":
        scrollTop = clampScroll(scrollTop - height);
        break;
      case key.name === "home" || key.text === "g":
        scrollTop = 0;
        break;
      case key.name === "end" || key.text === "G":
        scrollTop = maxScroll();
        break;
      default:
        return;
    }
    render();
  }

  function openToc(): void {
    mode = "toc";
    const topSource = visualLines[scrollTop]?.source ?? 0;
    // Abre já na seção que está na tela
    let current = 0;
    content.tableOfContents.forEach((entry, index) => {
      if (entry.lineIndex <= topSource) current = index;
    });
    tocSelected = current;
    tocScroll = Math.max(0, current - 2);
  }

  function handleTocKey(key: KeyEvent): void {
    const entries = content.tableOfContents;
    const page = Math.max(1, contentHeight() - 2);
    if (key.name === "escape" || key.name === "t" || key.name === "q") {
      mode = "view";
    } else if (entries.length === 0) {
      return;
    } else if (key.name === "down" || key.text === "j") {
      tocSelected = Math.min(entries.length - 1, tocSelected + 1);
    } else if (key.name === "up" || key.text === "k") {
      tocSelected = Math.max(0, tocSelected - 1);
    } else if (key.name === "pagedown") {
      tocSelected = Math.min(entries.length - 1, tocSelected + page);
    } else if (key.name === "pageup") {
      tocSelected = Math.max(0, tocSelected - page);
    } else if (key.name === "home") {
      tocSelected = 0;
    } else if (key.name === "end") {
      tocSelected = entries.length - 1;
    } else if (key.name === "return" || key.name === "enter") {
      const target = entries[tocSelected];
      scrollTop = clampScroll(sourceToFirstVisual[target.lineIndex] ?? 0);
      mode = "view";
    } else {
      return;
    }
    render();
  }

  function handleSearchKey(key: KeyEvent): void {
    if (key.name === "return" || key.name === "enter") {
      mode = "view";
      const query = searchInput;
      if (query.trim()) {
        runSearch(query);
        if (search!.matches.length === 0) showMessage(`Nenhuma ocorrência de “${query}”`);
        else jumpToFirstMatchFromTop();
      } else {
        // Enter com a busca vazia apaga os destaques da busca anterior
        search = null;
        highlightedCache.clear();
      }
    } else if (key.name === "escape" || (key.ctrl && key.name === "g")) {
      mode = "view";
    } else if (key.name === "backspace") {
      const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(searchInput)];
      searchInput = graphemes.slice(0, -1).map((part) => part.segment).join("");
    } else if (key.ctrl && key.name === "u") {
      searchInput = "";
    } else if (key.text && !key.ctrl && !key.meta) {
      searchInput += key.text;
    } else {
      return;
    }
    render();
  }

  // --------------------------------------------------- recarregar e editar

  async function reload(): Promise<void> {
    const generation = ++reloadGeneration;
    try {
      const next = await options.load(columns());
      if (generation !== reloadGeneration || finished) return;
      const topSource = visualLines[scrollTop]?.source ?? 0;
      content = next;
      layoutColumns = -1;
      visualLines = [];
      rebuildLayout(columns(), true);
      scrollTop = clampScroll(sourceToFirstVisual[Math.min(topSource, content.renderedLines.length - 1)] ?? 0);
      if (search) {
        const { query } = search;
        runSearch(query);
      }
      tocSelected = Math.min(tocSelected, Math.max(0, content.tableOfContents.length - 1));
    } catch (error) {
      showMessage(`Não foi possível recarregar: ${error instanceof Error ? error.message : String(error)}`, 4000);
    }
    render();
  }

  async function editFile(): Promise<void> {
    if (content.isBinary) {
      showMessage("Arquivos binários não podem ser editados.");
      render();
      return;
    }
    // Ordem importa: sair da tela alternativa ANTES de desligar o modo raw
    // (ver releaseTerminal em terminal-io.ts)
    leaveScreen();
    stopInput();
    stopResize();
    let saved = false;
    try {
      saved = (await openEditor(options.filePath, terminal)).saved;
    } catch (error) {
      showMessage(`Erro no editor: ${error instanceof Error ? error.message : String(error)}`, 4000);
    }
    if (finished) return;
    enterScreen();
    stopInput = terminal.startInput(handleKey);
    stopResize = terminal.onResize(handleResize);
    if (saved) await reload();
    else render();
  }

  // ------------------------------------------------- terminal e encerramento

  const savedTitle = process.platform === "win32" ? process.title : null;

  function enterScreen(): void {
    // Tela alternativa, cursor escondido e título da janela
    terminal.write("\x1B[?1049h\x1B[?25l\x1B[2J");
    if (savedTitle === null) terminal.write("\x1B[22;0t");
    terminal.write(`\x1B]0;MarkiiDown - ${displayFileName}\x07`);
  }

  function leaveScreen(): void {
    // Devolve o título que a janela tinha antes
    if (savedTitle !== null) terminal.write(`\x1B]0;${savedTitle.replace(/[\u0000-\u001F\u007F-\u009F]/g, "")}\x07`);
    else terminal.write("\x1B[23;0t");
    terminal.write("\x1B[0m\x1B[?25h\x1B[?1049l");
  }

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  function handleResize(): void {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      if (finished) return;
      if (content.widthDependent) void reload();
      else render();
    }, 60);
  }

  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  async function finish(): Promise<void> {
    if (finished) return;
    finished = true;
    if (messageTimer) clearTimeout(messageTimer);
    if (resizeTimer) clearTimeout(resizeTimer);
    leaveScreen();
    stopInput();
    stopResize();
    resolveDone();
  }

  enterScreen();
  let stopInput = terminal.startInput(handleKey);
  let stopResize = terminal.onResize(handleResize);
  render();
  await done;
}
