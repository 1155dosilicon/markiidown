import { describe, expect, test } from "bun:test";
import { findAllCaseInsensitive, runInteractiveViewer, type ViewerContent } from "../src/interactive.ts";
import { fakeTerminal, type FakeTerminal } from "../src/terminal-io.ts";
import { press, screenOf, waitUntil } from "./support/fake-screen.ts";

const KEY = { down: "\x1B[B", up: "\x1B[A", pageDown: "\x1B[6~", end: "\x1B[F", home: "\x1B[H", enter: "\r" };

function content(lines: string[], extra: Partial<ViewerContent> = {}): ViewerContent {
  return { renderedLines: lines, tableOfContents: [], fileSize: 1234, ...extra };
}

async function openViewer(
  lines: string[],
  options: { columns?: number; rows?: number; extra?: Partial<ViewerContent>; openEditor?: () => Promise<{ saved: boolean }> } = {}
) {
  const terminal = fakeTerminal(options.columns ?? 50, options.rows ?? 10);
  const loads: number[] = [];
  let current = content(lines, options.extra);
  const done = runInteractiveViewer({
    fileName: "doc.md",
    filePath: "doc.md",
    terminal,
    load: async (columns) => {
      loads.push(columns);
      return current;
    },
    openEditor: options.openEditor,
  });
  await waitUntil(() => terminal.output.includes("doc.md"), "leitor desenhado");
  return {
    terminal,
    done,
    loads,
    setContent(next: ViewerContent) {
      current = next;
    },
  };
}

const numbered = (count: number) => Array.from({ length: count }, (_, index) => `linha ${index + 1}`);
const statusOf = (terminal: FakeTerminal) => screenOf(terminal).lineText(terminal.rows() - 1).trim();

describe("findAllCaseInsensitive", () => {
  test("acha todas as ocorrências sem diferenciar maiúsculas", () => {
    expect(findAllCaseInsensitive("Tabela, tabela e TABELA", "tabela")).toEqual([
      { start: 0, end: 6 },
      { start: 8, end: 14 },
      { start: 17, end: 23 },
    ]);
  });

  test("posições continuam certas quando a minúscula muda de tamanho (İ)", () => {
    expect(findAllCaseInsensitive("İstanbul x", "x")).toEqual([{ start: 9, end: 10 }]);
  });
});

describe("leitor: navegação e barra de status", () => {
  test("setas, páginas, início e fim", async () => {
    const { terminal, done } = await openViewer(numbered(50));
    expect(statusOf(terminal)).toContain("1-9/50");
    await press(terminal, KEY.down, "j");
    expect(statusOf(terminal)).toContain("3-11/50");
    await press(terminal, KEY.pageDown);
    expect(statusOf(terminal)).toContain("12-20/50");
    await press(terminal, KEY.end);
    expect(statusOf(terminal)).toContain("42-50/50 (100%)");
    await press(terminal, "g");
    expect(screenOf(terminal).lineText(0).trim()).toBe("linha 1");
    await press(terminal, "q");
    await done;
  });

  test("barra de status nunca passa da largura, nem em terminal estreito", async () => {
    for (const columns of [12, 20, 28, 36, 50, 80]) {
      const { terminal, done } = await openViewer(numbered(500), { columns, rows: 6 });
      const screen = screenOf(terminal);
      // Se a barra passasse da largura, a tela rolaria e a 1ª linha sumiria
      expect(screen.lineText(0).trim()).toBe("linha 1");
      expect(Bun.stringWidth(screen.lineText(5).trimEnd())).toBeLessThanOrEqual(columns);
      await press(terminal, "q");
      await done;
    }
  });

  test("Esc sai na hora, sai da tela alternativa e devolve o título da janela", async () => {
    const { terminal, done } = await openViewer(numbered(5));
    const titleBefore = process.title;
    const started = Date.now();
    await press(terminal, "\x1B");
    await done;
    expect(Date.now() - started).toBeLessThan(300);
    const screen = screenOf(terminal);
    expect(screen.alternateScreen).toBe(false);
    if (process.platform === "win32") expect(screen.title).toBe(titleBefore);
  });
});

describe("leitor: busca", () => {
  test("destaca as ocorrências, mostra a contagem e navega com n/N", async () => {
    const lines = numbered(40).map((line, index) => (index === 5 || index === 30 ? `${line} com Alvo aqui` : line));
    const { terminal, done } = await openViewer(lines);
    await press(terminal, "/", ..."alvo", KEY.enter);
    expect(statusOf(terminal)).toContain("“alvo” 1/2");
    let screen = screenOf(terminal);
    const position = screen.find("Alvo")!;
    // Sem cores (NO_COLOR nos testes) a ocorrência é marcada em vídeo reverso
    expect(screen.cell(position.row, position.col).attrs.inverse).toBe(true);
    expect(screen.cell(position.row, 0).attrs.inverse).toBe(false);

    await press(terminal, "n");
    expect(statusOf(terminal)).toContain("“alvo” 2/2");
    screen = screenOf(terminal);
    expect(screen.text()).toContain("linha 31 com Alvo aqui");

    await press(terminal, "n");
    expect(statusOf(terminal)).toContain("recomeçando do início");
    await press(terminal, "q");
    await done;
  });

  test("acha frases que caíram na quebra de linha do parágrafo e destaca as duas partes", async () => {
    const lines = ["um parágrafo que termina com visualização", "no terminal e continua", "", "outro bloco"];
    const continued = [false, true, false, false];
    const { terminal, done } = await openViewer(lines, { extra: { continued } });
    await press(terminal, "/", ..."visualização no terminal", KEY.enter);
    expect(statusOf(terminal)).toContain("1/1");
    const screen = screenOf(terminal);
    const first = screen.find("visualização")!;
    const second = screen.find("no terminal")!;
    expect(screen.cell(first.row, first.col).attrs.inverse).toBe(true);
    expect(screen.cell(second.row, second.col).attrs.inverse).toBe(true);
    // Sem a continuação marcada, a frase não existe numa linha só
    await press(terminal, "q");
    await done;
    const separate = await openViewer(lines);
    await press(separate.terminal, "/", ..."visualização no terminal", KEY.enter);
    expect(statusOf(separate.terminal)).toContain("Nenhuma ocorrência");
    await press(separate.terminal, "q");
    await separate.done;
  });

  test("busca sem resultado avisa; Esc cancela a digitação", async () => {
    const { terminal, done } = await openViewer(numbered(10));
    await press(terminal, "/", ..."inexistente", KEY.enter);
    expect(statusOf(terminal)).toContain("Nenhuma ocorrência de “inexistente”");
    await press(terminal, "/", "x", "\x1B");
    await Bun.sleep(30);
    expect(statusOf(terminal)).not.toContain("Buscar");
    await press(terminal, "q");
    await done;
  });

  test("a busca ignora a numeração de linhas (searchLines)", async () => {
    const lines = numbered(15).map((_, index) => ` ${String(index + 1).padStart(2)} │ let v = 0;`);
    const searchLines = lines.map(() => "let v = 0;");
    const { terminal, done } = await openViewer(lines, { extra: { searchLines, gutterWidth: 6 } });
    await press(terminal, "/", "1", KEY.enter);
    expect(statusOf(terminal)).toContain("Nenhuma ocorrência");
    await press(terminal, "q");
    await done;
  });
});

describe("leitor: sumário, ajuda e edição", () => {
  test("sumário abre na seção atual e Enter vai até ela", async () => {
    const lines = numbered(60);
    const tableOfContents = [
      { title: "Início", lineIndex: 0, level: 1 },
      { title: "Meio", lineIndex: 25, level: 2 },
      { title: "Fim", lineIndex: 50, level: 2 },
    ];
    const { terminal, done } = await openViewer(lines, { extra: { tableOfContents } });
    for (let i = 0; i < 27; i++) terminal.type(KEY.down);
    await press(terminal, "t");
    expect(screenOf(terminal).text()).toContain("›   Meio");
    await press(terminal, KEY.down, KEY.enter);
    expect(screenOf(terminal).lineText(0).trim()).toBe("linha 51");
    await press(terminal, "q");
    await done;
  });

  test("ajuda abre com ? e qualquer tecla volta", async () => {
    const { terminal, done } = await openViewer(numbered(5));
    await press(terminal, "?");
    expect(screenOf(terminal).text()).toContain("teclas do leitor");
    await press(terminal, "x");
    expect(screenOf(terminal).text()).toContain("linha 1");
    await press(terminal, "q");
    await done;
  });

  test("depois de editar e salvar, o conteúdo é recarregado", async () => {
    let viewer: Awaited<ReturnType<typeof openViewer>>;
    viewer = await openViewer(["antes"], {
      openEditor: async () => {
        viewer.setContent(content(["depois da edição"]));
        return { saved: true };
      },
    });
    await press(viewer.terminal, "e");
    await waitUntil(() => screenOf(viewer.terminal).text().includes("depois da edição"), "conteúdo recarregado");
    await press(viewer.terminal, "q");
    await viewer.done;
  });

  test("arquivo binário não abre no editor", async () => {
    let editorOpened = false;
    const { terminal, done } = await openViewer(["binário"], {
      extra: { isBinary: true },
      openEditor: async () => {
        editorOpened = true;
        return { saved: false };
      },
    });
    await press(terminal, "e");
    expect(editorOpened).toBe(false);
    expect(statusOf(terminal)).toContain("binários não podem ser editados");
    await press(terminal, "q");
    await done;
  });

  test("conteúdo que depende da largura é recarregado ao redimensionar", async () => {
    const { terminal, done, loads } = await openViewer(["x"], { extra: { widthDependent: true } });
    terminal.resize(30, 10);
    await waitUntil(() => loads.includes(30), "recarga com a nova largura");
    await press(terminal, "q");
    await done;
  });
});
