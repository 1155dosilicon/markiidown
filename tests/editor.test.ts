import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectIndentUnit,
  detectLineEnding,
  displayColumn,
  indexFromDisplayColumn,
  nextGraphemeIndex,
  previousGraphemeIndex,
  runInteractiveEditor,
  visibleLineSegment,
  type EditorResult,
} from "../src/editor.ts";
import { fakeTerminal, type FakeTerminal } from "../src/terminal-io.ts";
import { press, screenOf, waitUntil } from "./support/fake-screen.ts";

const KEY = {
  up: "\x1B[A",
  down: "\x1B[B",
  right: "\x1B[C",
  left: "\x1B[D",
  home: "\x1B[H",
  end: "\x1B[F",
  ctrlEnd: "\x1B[1;5F",
  ctrlLeft: "\x1B[1;5D",
  enter: "\r",
  backspace: "\x7F",
  delete: "\x1B[3~",
  tab: "\t",
  shiftTab: "\x1B[Z",
  save: "\x13",
  undo: "\x1A",
  redo: "\x19",
  quit: "\x11",
  paste: (text: string) => `\x1B[200~${text}\x1B[201~`,
};

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function tempFile(name: string, content?: string | Uint8Array): string {
  const directory = mkdtempSync(join(tmpdir(), "markiidown-editor-"));
  directories.push(directory);
  const filePath = join(directory, name);
  if (content !== undefined) writeFileSync(filePath, content);
  return filePath;
}

async function openEditor(filePath: string, columns = 60, rows = 12): Promise<{ terminal: FakeTerminal; done: Promise<EditorResult> }> {
  const terminal = fakeTerminal(columns, rows);
  const done = runInteractiveEditor({ filePath, terminal });
  // O editor lê o arquivo antes de começar a ouvir o teclado
  await waitUntil(() => terminal.output.includes("Ln "), "editor desenhado");
  return { terminal, done };
}

/** Sai com Esc (descartando, se o editor perguntar). */
async function quit(terminal: FakeTerminal, done: Promise<EditorResult>, answer?: "s" | "d"): Promise<EditorResult> {
  await press(terminal, "\x1B");
  await Bun.sleep(30); // Esc sozinho é confirmado depois de um instante
  if (answer) await press(terminal, answer);
  return done;
}

describe("funções de coluna e linha", () => {
  test("converte índice em coluna visual com TAB e emoji", () => {
    expect(displayColumn("\tab", 1)).toBe(4);
    expect(displayColumn("a\tb", 2)).toBe(4);
    expect(displayColumn("😀x", 2)).toBe(2);
    expect(indexFromDisplayColumn("\tab", 5)).toBe(2);
    expect(indexFromDisplayColumn("😀x", 1)).toBe(0);
  });

  test("navega por grafemas sem partir emoji", () => {
    expect(nextGraphemeIndex("a😀b", 1)).toBe(3);
    expect(previousGraphemeIndex("a😀b", 3)).toBe(1);
    expect(previousGraphemeIndex("a😀b", 1)).toBe(0);
  });

  test("recorta a janela visível; caracteres de controle viram símbolos de 1 coluna", () => {
    expect(visibleLineSegment("\tabc", 0, 6)).toBe("    ab");
    expect(visibleLineSegment("\tabc", 4, 2)).toBe("ab");
    expect(visibleLineSegment("界x", 1, 2)).toBe(" x");
    expect(visibleLineSegment("a\x1B[31mb\x07", 0, 20)).toBe("a␛[31mb␇");
    expect(displayColumn("a\x1Bb", 3)).toBe(3);
  });

  test("final de linha predominante e unidade de indentação do arquivo", () => {
    expect(detectLineEnding("a\r\nb")).toBe("\r\n");
    expect(detectLineEnding("a\nb")).toBe("\n");
    expect(detectLineEnding("a\rb\rc")).toBe("\r");
    expect(detectLineEnding("sem quebra")).toBe("\n");
    expect(detectIndentUnit(["a", "\tb", "\tc"])).toBe("\t");
    expect(detectIndentUnit(["def f():", "    return 1"])).toBe("    ");
    expect(detectIndentUnit(["- a", "  - b"])).toBe("  ");
  });
});

describe("editar e salvar", () => {
  test("digita, salva com Ctrl+S e mantém o CRLF do arquivo", async () => {
    const filePath = tempFile("notas.txt", "linha 1\r\nlinha 2\r\n");
    const { terminal, done } = await openEditor(filePath);
    await press(terminal, KEY.end, " editada", KEY.save);
    expect(screenOf(terminal).text()).toContain("Salvo");
    const result = await quit(terminal, done);
    expect(result).toEqual({ saved: true, modified: false });
    expect(readFileSync(filePath, "utf8")).toBe("linha 1 editada\r\nlinha 2\r\n");
  });

  test("arquivo só com CR (Mac antigo) continua com CR", async () => {
    const filePath = tempFile("mac.txt", "a\rb\rc");
    const { terminal, done } = await openEditor(filePath);
    expect(screenOf(terminal).text()).toContain("Ln 1/3");
    await press(terminal, KEY.down, "X", KEY.save);
    await quit(terminal, done);
    expect(readFileSync(filePath, "latin1")).toBe("a\rXb\rc");
  });

  test("arquivo novo só é criado quando salvo", async () => {
    const filePath = tempFile("novo.md");
    const { terminal, done } = await openEditor(filePath);
    expect(screenOf(terminal).text()).toContain("Arquivo novo");
    await quit(terminal, done);
    expect(existsSync(filePath)).toBe(false);
  });

  test("Enter mantém a indentação; colar NÃO acumula indentação", async () => {
    const filePath = tempFile("codigo.py", "def f():\n    x = 1\n");
    const { terminal, done } = await openEditor(filePath);
    await press(terminal, KEY.down, KEY.end, KEY.enter, "y = 2");
    await press(terminal, KEY.enter, KEY.paste("if x:\r    z = 3\r    w = 4"), KEY.save);
    await quit(terminal, done);
    expect(readFileSync(filePath, "utf8")).toBe("def f():\n    x = 1\n    y = 2\n    if x:\n    z = 3\n    w = 4\n");
  });

  test("Tab usa a indentação do arquivo e Shift+Tab desfaz", async () => {
    const filePath = tempFile("Makefile", "all:\n\techo oi\n");
    const { terminal, done } = await openEditor(filePath);
    await press(terminal, KEY.ctrlEnd, KEY.tab, "x", KEY.save);
    await press(terminal, KEY.shiftTab, KEY.save);
    await quit(terminal, done);
    expect(readFileSync(filePath, "utf8")).toBe("all:\n\techo oi\nx");
  });

  test("Backspace junta linhas e Delete apaga à frente", async () => {
    const filePath = tempFile("a.txt", "abc\ndef");
    const { terminal, done } = await openEditor(filePath);
    await press(terminal, KEY.down, KEY.backspace, KEY.delete, KEY.save);
    await quit(terminal, done);
    expect(readFileSync(filePath, "utf8")).toBe("abcef");
  });
});

describe("desfazer e refazer", () => {
  test("desfaz por palavra, não por letra, e refaz", async () => {
    const filePath = tempFile("a.txt", "");
    const { terminal, done } = await openEditor(filePath);
    await press(terminal, ..."olá mundo".split(""));
    await press(terminal, KEY.undo);
    expect(screenOf(terminal).lineText(1)).toContain("olá");
    expect(screenOf(terminal).lineText(1)).not.toContain("mundo");
    await press(terminal, KEY.undo);
    expect(screenOf(terminal).lineText(1).trim()).toBe("1 │");
    await press(terminal, KEY.redo, KEY.redo, KEY.save);
    await quit(terminal, done);
    expect(readFileSync(filePath, "utf8")).toBe("olá mundo");
  });

  test("desfazer até o estado salvo volta a 'salvo' e Esc sai sem perguntar", async () => {
    const filePath = tempFile("a.txt", "texto");
    const { terminal, done } = await openEditor(filePath);
    await press(terminal, KEY.end, "!");
    expect(screenOf(terminal).text()).toContain("modificado");
    await press(terminal, KEY.undo);
    expect(screenOf(terminal).text()).toContain("salvo");
    const result = await quit(terminal, done);
    expect(result).toEqual({ saved: false, modified: false });
  });
});

describe("sair", () => {
  test("com alterações pergunta; [D] descarta sem gravar", async () => {
    const filePath = tempFile("a.txt", "original");
    const { terminal, done } = await openEditor(filePath);
    await press(terminal, "X", KEY.quit);
    expect(screenOf(terminal).text()).toContain("Alterações não salvas");
    await press(terminal, "d");
    expect(await done).toEqual({ saved: false, modified: true });
    expect(readFileSync(filePath, "utf8")).toBe("original");
  });

  test("[S] salva e sai", async () => {
    const filePath = tempFile("a.txt", "original");
    const { terminal, done } = await openEditor(filePath);
    await press(terminal, "X", KEY.quit, "s");
    expect(await done).toEqual({ saved: true, modified: false });
    expect(readFileSync(filePath, "utf8")).toBe("Xoriginal");
  });

  test("Esc imediato: não espera outra tecla nem engole a seguinte", async () => {
    const filePath = tempFile("a.txt", "x");
    const { terminal, done } = await openEditor(filePath);
    const started = Date.now();
    await press(terminal, "\x1B");
    await done;
    expect(Date.now() - started).toBeLessThan(300);
  });

  test("arquivo alterado por outro programa: pergunta antes de sobrescrever", async () => {
    const filePath = tempFile("a.txt", "v1");
    const { terminal, done } = await openEditor(filePath);
    writeFileSync(filePath, "versão de outro programa");
    utimesSync(filePath, new Date(), new Date(Date.now() + 5000));
    await press(terminal, "X", KEY.save);
    expect(screenOf(terminal).text()).toContain("mudou no disco");
    await press(terminal, "\x1B");
    await Bun.sleep(30);
    expect(readFileSync(filePath, "utf8")).toBe("versão de outro programa");
    await press(terminal, KEY.save, "s");
    expect(readFileSync(filePath, "utf8")).toBe("Xv1");
    await quit(terminal, done);
  });
});

describe("tela", () => {
  test("ESC e BEL do arquivo aparecem como símbolos, nunca vão para o terminal", async () => {
    const filePath = tempFile("log.txt", "fim\x1B[31mVERMELHO\x1B[0m e \x07sino\x1B]0;titulo falso\x07");
    const { terminal, done } = await openEditor(filePath);
    const screen = screenOf(terminal);
    expect(screen.lineText(1)).toContain("fim␛[31mVERMELHO␛[0m e ␇sino␛]0;titulo falso␇");
    expect(screen.title).not.toContain("titulo falso");
    await quit(terminal, done);
  });

  test("cabeçalho sempre mostra Ln/Col, mesmo em terminal estreito e nome longo", async () => {
    const filePath = tempFile("um-nome-de-arquivo-bem-comprido-mesmo.md", "a\nb");
    const { terminal, done } = await openEditor(filePath, 32, 8);
    const header = screenOf(terminal).lineText(0);
    expect(header).toContain("Ln 1/2, Col 1");
    expect(Bun.stringWidth(header.trimEnd())).toBeLessThanOrEqual(32);
    await quit(terminal, done);
  });

  test("recusa abrir arquivo binário", async () => {
    const filePath = tempFile("imagem.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));
    await expect(runInteractiveEditor({ filePath, terminal: fakeTerminal() })).rejects.toThrow("binários");
  });
});

describe("codificação preservada ao salvar", () => {
  test("arquivo ANSI (Windows-1252) continua ANSI e com os acentos", async () => {
    const filePath = tempFile("ansi.txt", new Uint8Array([0x41, 0xe7, 0xe3, 0x6f])); // "Ação"
    const { terminal, done } = await openEditor(filePath);
    await press(terminal, KEY.end, "é", KEY.save);
    expect((await quit(terminal, done)).saved).toBe(true);
    expect([...readFileSync(filePath)]).toEqual([0x41, 0xe7, 0xe3, 0x6f, 0xe9]);
  });

  test("emoji em arquivo ANSI faz salvar em UTF-8 em vez de perder o caractere", async () => {
    const filePath = tempFile("ansi.txt", new Uint8Array([0xe7])); // "ç"
    const { terminal, done } = await openEditor(filePath);
    await press(terminal, KEY.end, "😀", KEY.save);
    await quit(terminal, done);
    expect(readFileSync(filePath, "utf8")).toBe("ç😀");
  });

  test("BOM do UTF-8 continua no arquivo", async () => {
    const filePath = tempFile("bom.md", new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("oi")]));
    const { terminal, done } = await openEditor(filePath);
    await press(terminal, KEY.end, "!", KEY.save);
    await quit(terminal, done);
    expect([...readFileSync(filePath)]).toEqual([0xef, 0xbb, 0xbf, 0x6f, 0x69, 0x21]);
  });
});
