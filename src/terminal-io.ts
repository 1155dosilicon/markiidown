import { KeyDecoder, type InputEvent } from "./keys.ts";

/**
 * Tudo o que o leitor e o editor precisam do terminal, num só lugar. O padrão
 * usa process.stdin/stdout; os testes passam um terminal falso e enviam bytes
 * como se fossem teclas, sem precisar de um terminal de verdade.
 */
export interface TerminalIO {
  readonly isTTY: boolean;
  columns(): number;
  rows(): number;
  write(data: string): void;
  /** Avisa quando o tamanho muda; devolve a função que cancela o aviso. */
  onResize(listener: () => void): () => void;
  /**
   * Liga o modo raw e começa a entregar teclas. `onBatchEnd` é chamado depois
   * de cada leitura (o editor redesenha uma vez por leitura, não por tecla).
   * Devolve a função que para a leitura e devolve o terminal ao modo normal.
   *
   * IMPORTANTE (Windows): chame a função de parada só DEPOIS de sair da tela
   * alternativa (`ESC[?1049l`). Desligar o modo raw com a tela alternativa
   * ainda ativa faz o Bun reabrir o console de saída preso a ela; quando a
   * tela alternativa é fechada, toda escrita seguinte falha com EPIPE e o modo
   * raw não liga mais (setRawMode errno 32). Era o que acontecia ao apertar
   * "e" no leitor. Reproduzido no ConPTY, o mesmo motor do Windows Terminal.
   */
  startInput(onEvent: (event: InputEvent) => void, onBatchEnd?: () => void): () => void;
}

/** Liga/desliga o "bracketed paste": o terminal marca o início e o fim do texto colado. */
const BRACKETED_PASTE_ON = "\x1B[?2004h";
const BRACKETED_PASTE_OFF = "\x1B[?2004l";

export function processTerminal(): TerminalIO {
  const stdin = process.stdin;
  const stdout = process.stdout;
  return {
    isTTY: !!stdout.isTTY && !!stdin.isTTY,
    columns: () => stdout.columns || 80,
    rows: () => stdout.rows || 24,
    write: (data) => {
      stdout.write(data);
    },
    onResize(listener) {
      stdout.on("resize", listener);
      return () => {
        stdout.removeListener("resize", listener);
      };
    },
    startInput(onEvent, onBatchEnd) {
      const decoder = new KeyDecoder((event) => {
        onEvent(event);
      });
      const onData = (chunk: Buffer | string) => {
        decoder.feed(typeof chunk === "string" ? chunk : new Uint8Array(chunk));
        onBatchEnd?.();
      };
      if (stdin.isTTY) stdin.setRawMode(true);
      stdin.on("data", onData);
      stdin.resume();
      stdout.write(BRACKETED_PASTE_ON);

      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        stdout.write(BRACKETED_PASTE_OFF);
        stdin.removeListener("data", onData);
        decoder.dispose();
        if (stdin.isTTY) {
          try {
            stdin.setRawMode(false);
          } catch {}
        }
        stdin.pause();
      };
    },
  };
}

/** Terminal falso para testes: guarda a saída e recebe "teclas" por `type()`. */
export interface FakeTerminal extends TerminalIO {
  output: string;
  type(data: string): void;
  resize(columns: number, rows: number): void;
}

export function fakeTerminal(columns = 80, rows = 24): FakeTerminal {
  let currentColumns = columns;
  let currentRows = rows;
  const resizeListeners = new Set<() => void>();
  let feed: ((data: string) => void) | null = null;

  const terminal: FakeTerminal = {
    isTTY: true,
    output: "",
    columns: () => currentColumns,
    rows: () => currentRows,
    write(data) {
      terminal.output += data;
    },
    onResize(listener) {
      resizeListeners.add(listener);
      return () => resizeListeners.delete(listener);
    },
    startInput(onEvent, onBatchEnd) {
      const decoder = new KeyDecoder(onEvent, 5);
      feed = (data) => {
        decoder.feed(data);
        onBatchEnd?.();
      };
      return () => {
        feed = null;
        decoder.dispose();
      };
    },
    type(data) {
      if (!feed) throw new Error("O programa não está lendo o teclado agora.");
      feed(data);
    },
    resize(newColumns, newRows) {
      currentColumns = newColumns;
      currentRows = newRows;
      for (const listener of resizeListeners) listener();
    },
  };
  return terminal;
}
