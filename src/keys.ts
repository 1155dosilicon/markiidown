/**
 * Decodificador de teclado para o modo raw do terminal.
 *
 * Por que não usar `readline.emitKeypressEvents`: ele espera 500 ms depois de
 * um ESC para decidir se é a tecla Esc ou o começo de uma sequência (setas
 * etc.). Na prática o Esc demorava meio segundo e, se outra tecla viesse
 * nesse intervalo, as duas viravam um "Alt+tecla" e a segunda se perdia
 * (Esc seguido de "/" não abria a busca). Ele também não junta o texto
 * colado: cada caractere colado virava uma tecla, com auto-indentação a cada
 * Enter.
 *
 * Aqui:
 * - um ESC sozinho vira Esc em ~25 ms se nada vier depois; no Windows cada
 *   tecla chega numa leitura separada, então isso é imediato na prática;
 * - texto colado entre `ESC[200~` e `ESC[201~` (bracketed paste) vira um
 *   único evento `paste`; colagens sem esse recurso (vários caracteres e
 *   quebras de linha numa só leitura) também são reconhecidas;
 * - sequências CSI/SS3 de xterm, Windows Terminal/ConPTY, VT220 e console
 *   Linux são reconhecidas, com Shift/Alt/Ctrl.
 */

export interface KeyEvent {
  kind: "key";
  /** Nome da tecla: "a", "return", "escape", "up", "pagedown", "f5"... */
  name: string;
  /** Texto que a tecla insere (null para teclas de controle e navegação). */
  text: string | null;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
}

export interface PasteEvent {
  kind: "paste";
  text: string;
}

export type InputEvent = KeyEvent | PasteEvent;

const PASTE_START = "\x1B[200~";
const PASTE_END = "\x1B[201~";

const CSI_LETTER_KEYS: Record<string, string> = {
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  H: "home",
  F: "end",
  E: "clear",
  P: "f1",
  Q: "f2",
  R: "f3",
  S: "f4",
  Z: "tab",
  I: "focusin",
  O: "focusout",
};

const CSI_TILDE_KEYS: Record<string, string> = {
  "1": "home",
  "2": "insert",
  "3": "delete",
  "4": "end",
  "5": "pageup",
  "6": "pagedown",
  "7": "home",
  "8": "end",
  "11": "f1",
  "12": "f2",
  "13": "f3",
  "14": "f4",
  "15": "f5",
  "17": "f6",
  "18": "f7",
  "19": "f8",
  "20": "f9",
  "21": "f10",
  "23": "f11",
  "24": "f12",
};

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function key(name: string, sequence: string, extra: Partial<KeyEvent> = {}): KeyEvent {
  return { kind: "key", name, text: null, ctrl: false, meta: false, shift: false, sequence, ...extra };
}

/** Modificador xterm ("1;5A" → 5): 1 + Shift(1) + Alt(2) + Ctrl(4) + Meta(8). */
function modifiers(parameter: string | undefined): Pick<KeyEvent, "shift" | "meta" | "ctrl"> {
  const value = Math.max(0, (Number.parseInt(parameter ?? "1", 10) || 1) - 1);
  return { shift: (value & 1) !== 0, meta: (value & 2) !== 0 || (value & 8) !== 0, ctrl: (value & 4) !== 0 };
}

function controlKey(char: string): KeyEvent {
  const code = char.charCodeAt(0);
  switch (code) {
    case 0x0d:
      return key("return", char);
    case 0x0a:
      return key("enter", char);
    case 0x09:
      return key("tab", char);
    case 0x7f:
    // Alguns consoles mandam BS (0x08) para o Backspace comum: os dois são Backspace
    case 0x08:
      return key("backspace", char);
    case 0x00:
      return key("space", char, { ctrl: true });
    case 0x1b:
      return key("escape", char);
    default:
      if (code >= 0x01 && code <= 0x1a) return key(String.fromCharCode(code + 96), char, { ctrl: true });
      return key(["\\", "]", "^", "_"][code - 0x1c] ?? "unknown", char, { ctrl: true });
  }
}

function printableKey(text: string, meta = false): KeyEvent {
  const lower = text.toLowerCase();
  const isLetter = text.length === 1 && lower !== text.toUpperCase();
  return {
    kind: "key",
    name: text === " " ? "space" : isLetter ? lower : text,
    text: meta ? null : text,
    ctrl: false,
    meta,
    shift: isLetter && text !== lower,
    sequence: meta ? "\x1B" + text : text,
  };
}

function decodeCsi(sequence: string): KeyEvent {
  // sequence = ESC [ <corpo> <final>
  const body = sequence.slice(2, -1);
  const final = sequence[sequence.length - 1];

  if (body.startsWith("<")) return key("mouse", sequence);
  if (final === "~") {
    const [code, modifier] = body.split(";");
    return key(CSI_TILDE_KEYS[code] ?? "unknown", sequence, modifiers(modifier));
  }
  if (body.startsWith("[")) {
    // Console Linux: ESC [ [ A..E = F1..F5
    const name = { A: "f1", B: "f2", C: "f3", D: "f4", E: "f5" }[final];
    return key(name ?? "unknown", sequence);
  }
  const name = CSI_LETTER_KEYS[final];
  if (!name) return key("unknown", sequence);
  const parts = body.split(";");
  const mods = modifiers(parts.length > 1 ? parts[1] : undefined);
  if (final === "Z") mods.shift = true;
  return key(name, sequence, mods);
}

export class KeyDecoder {
  private pending = "";
  private inPaste = false;
  private pasteBuffer = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly textDecoder = new TextDecoder();

  constructor(
    private readonly emit: (event: InputEvent) => void,
    private readonly escapeTimeoutMs = 25
  ) {}

  feed(data: string | Uint8Array): void {
    const text = typeof data === "string" ? data : this.textDecoder.decode(data, { stream: true });
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Colagem sem bracketed paste: várias linhas de texto numa única leitura
    if (!this.inPaste && this.pending === "" && looksLikeRawPaste(text)) {
      this.emit({ kind: "paste", text });
      return;
    }

    this.pending += text;
    this.process(false);
  }

  /** Emite o que estiver pendente (um ESC solto vira a tecla Esc). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.process(true);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = "";
  }

  private process(force: boolean): void {
    while (this.pending.length > 0) {
      if (this.inPaste) {
        const end = this.pending.indexOf(PASTE_END);
        if (end < 0) {
          // Guarda um possível começo do marcador final que chegou partido
          const keep = partialSuffix(this.pending, PASTE_END);
          this.pasteBuffer += this.pending.slice(0, this.pending.length - keep);
          this.pending = this.pending.slice(this.pending.length - keep);
          return;
        }
        this.pasteBuffer += this.pending.slice(0, end);
        this.pending = this.pending.slice(end + PASTE_END.length);
        this.inPaste = false;
        this.emit({ kind: "paste", text: this.pasteBuffer });
        this.pasteBuffer = "";
        continue;
      }

      const consumed = this.parseOne(force);
      if (consumed === 0) {
        // Sequência incompleta: espera mais dados por um instante
        this.timer = setTimeout(() => {
          this.timer = null;
          this.process(true);
        }, this.escapeTimeoutMs);
        return;
      }
      this.pending = this.pending.slice(consumed);
    }
  }

  /** Emite um evento a partir do início de `pending` e devolve quantos caracteres usou (0 = incompleto). */
  private parseOne(force: boolean): number {
    const input = this.pending;
    const first = input[0];

    if (first === "\x1B") {
      if (input.length === 1) {
        if (!force) return 0;
        this.emit(key("escape", "\x1B"));
        return 1;
      }
      const second = input[1];

      if (second === "[") {
        let end = 2;
        while (end < input.length) {
          const code = input.charCodeAt(end);
          if (code >= 0x40 && code <= 0x7e && !(end === 2 && input[end] === "[")) break;
          end++;
        }
        if (end >= input.length) {
          if (!force && input.length < 32) return 0;
          // Sequência quebrada: Esc + o resto como texto comum
          this.emit(key("escape", "\x1B"));
          return 1;
        }
        const sequence = input.slice(0, end + 1);
        if (sequence === PASTE_START) {
          this.inPaste = true;
          this.pasteBuffer = "";
          return sequence.length;
        }
        if (sequence === PASTE_END) return sequence.length;
        this.emit(decodeCsi(sequence));
        return sequence.length;
      }

      if (second === "O") {
        if (input.length < 3) {
          if (!force) return 0;
          this.emit(printableKey("O", true));
          return 2;
        }
        const name = CSI_LETTER_KEYS[input[2]] ?? "unknown";
        this.emit(key(name, input.slice(0, 3)));
        return 3;
      }

      if (second === "\x1B") {
        this.emit(key("escape", "\x1B"));
        return 1;
      }

      // Alt + tecla
      const codePoint = input.codePointAt(1)!;
      const char = String.fromCodePoint(codePoint);
      if (codePoint < 0x20 || codePoint === 0x7f) {
        this.emit({ ...controlKey(char), meta: true, sequence: "\x1B" + char });
      } else {
        this.emit(printableKey(char, true));
      }
      return 1 + char.length;
    }

    const code = first.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      this.emit(controlKey(first));
      return 1;
    }

    // Texto imprimível até o próximo controle/ESC, emitido grafema a grafema
    let end = 1;
    while (end < input.length) {
      const next = input.charCodeAt(end);
      if (next < 0x20 || next === 0x7f) break;
      end++;
    }
    // Um par substituto partido entre leituras espera a segunda metade
    const lastCode = input.charCodeAt(end - 1);
    if (end === input.length && lastCode >= 0xd800 && lastCode <= 0xdbff && !force) {
      if (end === 1) return 0;
      end--;
    }
    for (const { segment } of graphemes.segment(input.slice(0, end))) this.emit(printableKey(segment));
    return end;
  }
}

/** Comprimento do maior sufixo de `text` que é prefixo de `marker`. */
function partialSuffix(text: string, marker: string): number {
  for (let length = Math.min(marker.length - 1, text.length); length > 0; length--) {
    if (marker.startsWith(text.slice(text.length - length))) return length;
  }
  return 0;
}

/**
 * Uma leitura com texto e quebra de linha seguida de mais texto só acontece
 * numa colagem: ninguém digita "abc⏎def" entre duas leituras do teclado.
 */
function looksLikeRawPaste(text: string): boolean {
  if (text.length < 3 || text.includes("\x1B")) return false;
  const lineBreak = text.search(/[\r\n]/);
  if (lineBreak < 0) return false;
  return /[^\r\n]/.test(text.slice(lineBreak)) && /[^\s]/.test(text);
}
