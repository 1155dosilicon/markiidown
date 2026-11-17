/**
 * Emulador de terminal mínimo, usado só pelos testes de ponta a ponta.
 *
 * Recebe a saída de um pseudoterminal (no Windows, o ConPTY reescreve tudo o
 * que o programa imprime com as próprias sequências: CUP, EL, ECH, SGR...) e
 * reconstrói a grade de células: texto, largura (emoji/CJK ocupam 2 colunas)
 * e atributos (cores, negrito, itálico, sublinhado, hyperlink OSC 8).
 *
 * Cobre o subconjunto de VT100/xterm que o ConPTY e o MarkiiDown emitem.
 * Sequências desconhecidas são consumidas e ignoradas, nunca impressas.
 */

export interface CellAttributes {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  strikethrough: boolean;
  link: string | null;
}

export interface Cell {
  /** Grafema exibido; "" na segunda coluna de um caractere largo. */
  char: string;
  width: number;
  attrs: CellAttributes;
}

const DEFAULT_ATTRIBUTES: CellAttributes = Object.freeze({
  fg: null,
  bg: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
  strikethrough: false,
  link: null,
}) as CellAttributes;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function blankCell(attrs: CellAttributes = DEFAULT_ATTRIBUTES): Cell {
  // O apagamento (EL/ED/ECH) usa a cor de fundo atual, como num terminal real
  return { char: " ", width: 1, attrs: { ...DEFAULT_ATTRIBUTES, bg: attrs.bg } };
}

interface Buffer {
  grid: Cell[][];
  cursorRow: number;
  cursorCol: number;
  savedCursor: { row: number; col: number; attrs: CellAttributes } | null;
}

export class VirtualTerminal {
  title = "";
  cursorVisible = true;
  alternateScreen = false;
  /** Respostas que o programa pediu ao terminal (ex.: posição do cursor). */
  onReply: ((data: string) => void) | null = null;

  private main: Buffer;
  private alternate: Buffer;
  private attrs: CellAttributes = { ...DEFAULT_ATTRIBUTES };
  private pendingWrap = false;
  private scrollTop = 0;
  private scrollBottom: number;
  private autowrap = true;
  private pending = "";

  constructor(
    public cols: number,
    public rows: number
  ) {
    this.main = this.createBuffer();
    this.alternate = this.createBuffer();
    this.scrollBottom = rows - 1;
  }

  /** Muda o tamanho mantendo o conteúdo que cabe (sem refluxo, como o ConPTY espera). */
  resize(cols: number, rows: number): void {
    for (const buffer of [this.main, this.alternate]) {
      const grid = buffer.grid.slice(0, rows).map((row) => {
        const resized = row.slice(0, cols);
        while (resized.length < cols) resized.push(blankCell());
        return resized;
      });
      while (grid.length < rows) grid.push(Array.from({ length: cols }, () => blankCell()));
      buffer.grid = grid;
      buffer.cursorRow = Math.min(buffer.cursorRow, rows - 1);
      buffer.cursorCol = Math.min(buffer.cursorCol, cols - 1);
    }
    this.cols = cols;
    this.rows = rows;
    this.scrollTop = 0;
    this.scrollBottom = rows - 1;
    this.pendingWrap = false;
  }

  private createBuffer(): Buffer {
    return {
      grid: Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => blankCell())),
      cursorRow: 0,
      cursorCol: 0,
      savedCursor: null,
    };
  }

  private get buffer(): Buffer {
    return this.alternateScreen ? this.alternate : this.main;
  }

  get cursorRow(): number {
    return this.buffer.cursorRow;
  }

  get cursorCol(): number {
    return this.buffer.cursorCol;
  }

  /** Texto de uma linha da tela (caracteres largos aparecem uma vez). */
  lineText(row: number): string {
    return this.buffer.grid[row].map((cell) => cell.char).join("");
  }

  /** Tela inteira, linhas sem os espaços finais. */
  text(): string {
    return Array.from({ length: this.rows }, (_, row) => this.lineText(row).trimEnd()).join("\n");
  }

  cell(row: number, col: number): Cell {
    return this.buffer.grid[row][col];
  }

  /** Procura o texto na tela e devolve a posição da primeira ocorrência. */
  find(needle: string): { row: number; col: number } | null {
    for (let row = 0; row < this.rows; row++) {
      // Converte índice de caractere em coluna, considerando largura
      const cells = this.buffer.grid[row];
      let line = "";
      const columnOfIndex: number[] = [];
      cells.forEach((cell, col) => {
        for (let i = 0; i < cell.char.length; i++) columnOfIndex.push(col);
        line += cell.char;
      });
      const index = line.indexOf(needle);
      if (index >= 0) return { row, col: columnOfIndex[index] };
    }
    return null;
  }

  write(data: string): void {
    const input = this.pending + data;
    this.pending = "";
    let index = 0;
    let textStart = -1;

    const flushText = (end: number) => {
      if (textStart >= 0 && end > textStart) this.printText(input.slice(textStart, end));
      textStart = -1;
    };

    while (index < input.length) {
      const code = input.charCodeAt(index);

      if (code === 0x1b) {
        flushText(index);
        const consumed = this.parseEscape(input, index);
        if (consumed === 0) {
          // Sequência incompleta: espera o próximo pedaço
          this.pending = input.slice(index);
          return;
        }
        index += consumed;
        continue;
      }

      if (code < 0x20 || code === 0x7f) {
        flushText(index);
        this.control(code);
        index++;
        continue;
      }

      if (textStart < 0) textStart = index;
      index++;
    }
    flushText(input.length);
  }

  private control(code: number): void {
    const buffer = this.buffer;
    switch (code) {
      case 0x0d: // CR
        buffer.cursorCol = 0;
        this.pendingWrap = false;
        break;
      case 0x0a: // LF
      case 0x0b:
      case 0x0c:
        this.lineFeed();
        break;
      case 0x08: // BS
        buffer.cursorCol = Math.max(0, buffer.cursorCol - 1);
        this.pendingWrap = false;
        break;
      case 0x09: // TAB
        buffer.cursorCol = Math.min(this.cols - 1, (Math.floor(buffer.cursorCol / 8) + 1) * 8);
        break;
      default:
        break; // BEL e demais controles não alteram a tela
    }
  }

  private lineFeed(): void {
    const buffer = this.buffer;
    this.pendingWrap = false;
    if (buffer.cursorRow === this.scrollBottom) {
      this.scrollUp(1);
    } else if (buffer.cursorRow < this.rows - 1) {
      buffer.cursorRow++;
    }
  }

  private scrollUp(count: number): void {
    const grid = this.buffer.grid;
    for (let i = 0; i < count; i++) {
      grid.splice(this.scrollTop, 1);
      grid.splice(this.scrollBottom, 0, Array.from({ length: this.cols }, () => blankCell(this.attrs)));
    }
  }

  private scrollDown(count: number): void {
    const grid = this.buffer.grid;
    for (let i = 0; i < count; i++) {
      grid.splice(this.scrollBottom, 1);
      grid.splice(this.scrollTop, 0, Array.from({ length: this.cols }, () => blankCell(this.attrs)));
    }
  }

  private printText(text: string): void {
    const buffer = this.buffer;
    for (const { segment } of segmenter.segment(text)) {
      const width = Math.min(2, Bun.stringWidth(segment));

      if (width === 0) {
        // Marca combinante solta: junta ao caractere anterior
        const col = Math.max(0, buffer.cursorCol - (this.pendingWrap ? 0 : 1));
        const cell = buffer.grid[buffer.cursorRow][col];
        if (cell) cell.char += segment;
        continue;
      }

      if (this.pendingWrap || (width === 2 && buffer.cursorCol === this.cols - 1)) {
        if (this.autowrap) {
          buffer.cursorCol = 0;
          this.lineFeed();
        }
        this.pendingWrap = false;
      }

      const row = buffer.grid[buffer.cursorRow];
      this.clearWideCharAt(row, buffer.cursorCol);
      row[buffer.cursorCol] = { char: segment, width, attrs: { ...this.attrs } };
      if (width === 2 && buffer.cursorCol + 1 < this.cols) {
        this.clearWideCharAt(row, buffer.cursorCol + 1);
        row[buffer.cursorCol + 1] = { char: "", width: 0, attrs: { ...this.attrs } };
      }

      const nextCol = buffer.cursorCol + width;
      if (nextCol >= this.cols) {
        buffer.cursorCol = this.cols - 1;
        this.pendingWrap = true;
      } else {
        buffer.cursorCol = nextCol;
      }
    }
  }

  /** Sobrescrever metade de um caractere largo apaga a outra metade. */
  private clearWideCharAt(row: Cell[], col: number): void {
    const cell = row[col];
    if (!cell) return;
    if (cell.width === 2 && row[col + 1]?.width === 0) row[col + 1] = blankCell();
    if (cell.width === 0 && row[col - 1]?.width === 2) row[col - 1] = blankCell();
  }

  /** Retorna quantos caracteres a sequência ocupa, ou 0 se está incompleta. */
  private parseEscape(input: string, start: number): number {
    if (start + 1 >= input.length) return 0;
    const next = input[start + 1];

    if (next === "[") return this.parseCsi(input, start);
    if (next === "]") return this.parseStringSequence(input, start, true);
    if (next === "P" || next === "X" || next === "^" || next === "_") {
      return this.parseStringSequence(input, start, false);
    }

    switch (next) {
      case "7":
        this.saveCursor();
        return 2;
      case "8":
        this.restoreCursor();
        return 2;
      case "M": // RI
        if (this.buffer.cursorRow === this.scrollTop) this.scrollDown(1);
        else this.buffer.cursorRow = Math.max(0, this.buffer.cursorRow - 1);
        return 2;
      case "D": // IND
        this.lineFeed();
        return 2;
      case "E": // NEL
        this.buffer.cursorCol = 0;
        this.lineFeed();
        return 2;
      case "c": // RIS
        this.reset();
        return 2;
      case "(":
      case ")":
      case "*":
      case "+":
        return start + 2 < input.length ? 3 : 0;
      default:
        return 2; // ESC = , ESC > e outros: ignorados
    }
  }

  private parseStringSequence(input: string, start: number, isOsc: boolean): number {
    let end = start + 2;
    while (end < input.length) {
      const ch = input[end];
      if (ch === "\x07") {
        if (isOsc) this.handleOsc(input.slice(start + 2, end));
        return end - start + 1;
      }
      if (ch === "\x1b") {
        if (end + 1 >= input.length) return 0;
        if (input[end + 1] === "\\") {
          if (isOsc) this.handleOsc(input.slice(start + 2, end));
          return end - start + 2;
        }
      }
      end++;
    }
    return 0;
  }

  private handleOsc(body: string): void {
    const separator = body.indexOf(";");
    const command = separator >= 0 ? body.slice(0, separator) : body;
    const rest = separator >= 0 ? body.slice(separator + 1) : "";
    if (command === "0" || command === "2") {
      this.title = rest;
    } else if (command === "8") {
      const uriSeparator = rest.indexOf(";");
      const uri = uriSeparator >= 0 ? rest.slice(uriSeparator + 1) : "";
      this.attrs.link = uri || null;
    }
  }

  private parseCsi(input: string, start: number): number {
    let end = start + 2;
    while (end < input.length) {
      const code = input.charCodeAt(end);
      if (code >= 0x40 && code <= 0x7e) break;
      end++;
    }
    if (end >= input.length) return 0;

    const body = input.slice(start + 2, end);
    const final = input[end];
    const privateMarker = /^[?>=<]/.test(body) ? body[0] : "";
    const paramText = (privateMarker ? body.slice(1) : body).replace(/[ -/]+$/, "");
    const intermediates = body.match(/[ -/]+$/)?.[0] ?? "";
    const params = paramText === "" ? [] : paramText.split(";").map((part) => part);

    if (intermediates === "") this.handleCsi(final, params, privateMarker);
    return end - start + 1;
  }

  private handleCsi(final: string, rawParams: string[], privateMarker: string): void {
    const buffer = this.buffer;
    const param = (index: number, fallback: number) => {
      const value = Number.parseInt(rawParams[index] ?? "", 10);
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    const clampRow = (row: number) => Math.min(this.rows - 1, Math.max(0, row));
    const clampCol = (col: number) => Math.min(this.cols - 1, Math.max(0, col));

    if (privateMarker === "?") {
      if (final === "h" || final === "l") this.setPrivateModes(rawParams, final === "h");
      return;
    }
    if (privateMarker) return;

    if (final !== "m") this.pendingWrap = false;

    switch (final) {
      case "A":
        buffer.cursorRow = clampRow(buffer.cursorRow - param(0, 1));
        break;
      case "B":
        buffer.cursorRow = clampRow(buffer.cursorRow + param(0, 1));
        break;
      case "C":
        buffer.cursorCol = clampCol(buffer.cursorCol + param(0, 1));
        break;
      case "D":
        buffer.cursorCol = clampCol(buffer.cursorCol - param(0, 1));
        break;
      case "E":
        buffer.cursorRow = clampRow(buffer.cursorRow + param(0, 1));
        buffer.cursorCol = 0;
        break;
      case "F":
        buffer.cursorRow = clampRow(buffer.cursorRow - param(0, 1));
        buffer.cursorCol = 0;
        break;
      case "G":
      case "`":
        buffer.cursorCol = clampCol(param(0, 1) - 1);
        break;
      case "d":
        buffer.cursorRow = clampRow(param(0, 1) - 1);
        break;
      case "H":
      case "f":
        buffer.cursorRow = clampRow(param(0, 1) - 1);
        buffer.cursorCol = clampCol(param(1, 1) - 1);
        break;
      case "J":
        this.eraseDisplay(Number.parseInt(rawParams[0] ?? "0", 10) || 0);
        break;
      case "K":
        this.eraseLine(Number.parseInt(rawParams[0] ?? "0", 10) || 0);
        break;
      case "X": {
        const row = buffer.grid[buffer.cursorRow];
        const count = param(0, 1);
        for (let col = buffer.cursorCol; col < Math.min(this.cols, buffer.cursorCol + count); col++) {
          row[col] = blankCell(this.attrs);
        }
        break;
      }
      case "P": {
        const row = buffer.grid[buffer.cursorRow];
        row.splice(buffer.cursorCol, param(0, 1));
        while (row.length < this.cols) row.push(blankCell(this.attrs));
        break;
      }
      case "@": {
        const row = buffer.grid[buffer.cursorRow];
        row.splice(buffer.cursorCol, 0, ...Array.from({ length: param(0, 1) }, () => blankCell(this.attrs)));
        row.length = this.cols;
        break;
      }
      case "L":
      case "M": {
        if (buffer.cursorRow < this.scrollTop || buffer.cursorRow > this.scrollBottom) break;
        const savedTop = this.scrollTop;
        this.scrollTop = buffer.cursorRow;
        if (final === "L") this.scrollDown(param(0, 1));
        else this.scrollUp(param(0, 1));
        this.scrollTop = savedTop;
        break;
      }
      case "S":
        this.scrollUp(param(0, 1));
        break;
      case "T":
        this.scrollDown(param(0, 1));
        break;
      case "r":
        this.scrollTop = clampRow(param(0, 1) - 1);
        this.scrollBottom = clampRow(param(1, this.rows) - 1);
        buffer.cursorRow = 0;
        buffer.cursorCol = 0;
        break;
      case "s":
        this.saveCursor();
        break;
      case "u":
        this.restoreCursor();
        break;
      case "m":
        this.applySgr(rawParams);
        break;
      case "n":
        if (rawParams[0] === "6") this.onReply?.(`\x1b[${buffer.cursorRow + 1};${buffer.cursorCol + 1}R`);
        break;
      default:
        break;
    }
  }

  private setPrivateModes(params: string[], enabled: boolean): void {
    for (const mode of params) {
      if (mode === "25") this.cursorVisible = enabled;
      else if (mode === "7") this.autowrap = enabled;
      else if (mode === "1049" || mode === "1047" || mode === "47") {
        if (enabled === this.alternateScreen) continue;
        if (enabled) {
          this.saveCursor();
          this.alternate = this.createBuffer();
          this.alternateScreen = true;
        } else {
          this.alternateScreen = false;
          this.restoreCursor();
        }
        this.pendingWrap = false;
      }
    }
  }

  private saveCursor(): void {
    const buffer = this.buffer;
    buffer.savedCursor = { row: buffer.cursorRow, col: buffer.cursorCol, attrs: { ...this.attrs } };
  }

  private restoreCursor(): void {
    const buffer = this.buffer;
    if (!buffer.savedCursor) return;
    buffer.cursorRow = buffer.savedCursor.row;
    buffer.cursorCol = buffer.savedCursor.col;
    this.attrs = { ...buffer.savedCursor.attrs };
    this.pendingWrap = false;
  }

  private eraseLine(mode: number): void {
    const buffer = this.buffer;
    const row = buffer.grid[buffer.cursorRow];
    const [from, to] = mode === 1 ? [0, buffer.cursorCol + 1] : mode === 2 ? [0, this.cols] : [buffer.cursorCol, this.cols];
    for (let col = from; col < to; col++) row[col] = blankCell(this.attrs);
  }

  private eraseDisplay(mode: number): void {
    const buffer = this.buffer;
    if (mode === 0) {
      this.eraseLine(0);
      for (let row = buffer.cursorRow + 1; row < this.rows; row++) this.blankRow(row);
    } else if (mode === 1) {
      this.eraseLine(1);
      for (let row = 0; row < buffer.cursorRow; row++) this.blankRow(row);
    } else {
      for (let row = 0; row < this.rows; row++) this.blankRow(row);
    }
  }

  private blankRow(row: number): void {
    this.buffer.grid[row] = Array.from({ length: this.cols }, () => blankCell(this.attrs));
  }

  private reset(): void {
    this.main = this.createBuffer();
    this.alternate = this.createBuffer();
    this.alternateScreen = false;
    this.attrs = { ...DEFAULT_ATTRIBUTES };
    this.pendingWrap = false;
    this.scrollTop = 0;
    this.scrollBottom = this.rows - 1;
  }

  private applySgr(rawParams: string[]): void {
    // Aceita tanto "38;5;n" quanto "38:5:n"
    const params = (rawParams.length === 0 ? ["0"] : rawParams).flatMap((part) => part.split(":"));
    for (let i = 0; i < params.length; i++) {
      const value = Number.parseInt(params[i] || "0", 10);
      const attrs = this.attrs;
      if (value === 0) {
        const link = attrs.link;
        this.attrs = { ...DEFAULT_ATTRIBUTES, link };
      } else if (value === 1) attrs.bold = true;
      else if (value === 2) attrs.dim = true;
      else if (value === 3) attrs.italic = true;
      else if (value === 4) attrs.underline = true;
      else if (value === 7) attrs.inverse = true;
      else if (value === 9) attrs.strikethrough = true;
      else if (value === 22) {
        attrs.bold = false;
        attrs.dim = false;
      } else if (value === 23) attrs.italic = false;
      else if (value === 24) attrs.underline = false;
      else if (value === 27) attrs.inverse = false;
      else if (value === 29) attrs.strikethrough = false;
      else if ((value >= 30 && value <= 37) || (value >= 90 && value <= 97)) attrs.fg = String(value);
      else if (value === 39) attrs.fg = null;
      else if ((value >= 40 && value <= 47) || (value >= 100 && value <= 107)) attrs.bg = String(value);
      else if (value === 49) attrs.bg = null;
      else if (value === 38 || value === 48) {
        const mode = params[i + 1];
        let color: string;
        if (mode === "5") {
          color = `5;${params[i + 2]}`;
          i += 2;
        } else if (mode === "2") {
          color = `2;${params[i + 2]};${params[i + 3]};${params[i + 4]}`;
          i += 4;
        } else {
          continue;
        }
        if (value === 38) attrs.fg = color;
        else attrs.bg = color;
      }
    }
  }
}
