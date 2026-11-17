import { describe, expect, test } from "bun:test";
import { KeyDecoder, type InputEvent, type KeyEvent } from "../src/keys.ts";

function decodeAll(...chunks: string[]): InputEvent[] {
  const events: InputEvent[] = [];
  const decoder = new KeyDecoder((event) => events.push(event), 5);
  for (const chunk of chunks) decoder.feed(chunk);
  decoder.flush();
  return events;
}

const names = (events: InputEvent[]) => events.map((event) => (event.kind === "key" ? event.name : `paste:${event.text}`));

describe("KeyDecoder: teclas especiais", () => {
  test("setas, Home/End e páginas nas variantes de xterm, VT220 e SS3", () => {
    expect(names(decodeAll("\x1B[A", "\x1B[B", "\x1B[C", "\x1B[D"))).toEqual(["up", "down", "right", "left"]);
    expect(names(decodeAll("\x1B[H", "\x1B[F", "\x1B[1~", "\x1B[4~", "\x1BOH", "\x1BOF"))).toEqual([
      "home", "end", "home", "end", "home", "end",
    ]);
    expect(names(decodeAll("\x1B[5~", "\x1B[6~", "\x1B[3~", "\x1B[2~"))).toEqual(["pageup", "pagedown", "delete", "insert"]);
    expect(names(decodeAll("\x1BOP", "\x1B[15~", "\x1B[24~"))).toEqual(["f1", "f5", "f12"]);
  });

  test("modificadores Ctrl/Shift/Alt e Shift+Tab", () => {
    const [ctrlLeft, shiftUp, ctrlEnd, shiftTab] = decodeAll("\x1B[1;5D", "\x1B[1;2A", "\x1B[1;5F", "\x1B[Z") as KeyEvent[];
    expect(ctrlLeft).toMatchObject({ name: "left", ctrl: true, shift: false });
    expect(shiftUp).toMatchObject({ name: "up", shift: true, ctrl: false });
    expect(ctrlEnd).toMatchObject({ name: "end", ctrl: true });
    expect(shiftTab).toMatchObject({ name: "tab", shift: true });
  });

  test("teclas de controle", () => {
    const events = decodeAll("\r", "\t", "\x7F", "\x08", "\x13", "\x1A", "\x19", "\x03") as KeyEvent[];
    expect(events.map((event) => [event.name, event.ctrl])).toEqual([
      ["return", false],
      ["tab", false],
      ["backspace", false],
      ["backspace", false],
      ["s", true],
      ["z", true],
      ["y", true],
      ["c", true],
    ]);
  });

  test("Alt+tecla chega numa só leitura", () => {
    const [event] = decodeAll("\x1Bx") as KeyEvent[];
    expect(event).toMatchObject({ name: "x", meta: true, text: null });
  });
});

describe("KeyDecoder: Esc", () => {
  test("Esc sozinho é entregue rápido, sem esperar outra tecla", async () => {
    const events: InputEvent[] = [];
    const decoder = new KeyDecoder((event) => events.push(event), 20);
    decoder.feed("\x1B");
    expect(events).toHaveLength(0);
    await Bun.sleep(40);
    expect(names(events)).toEqual(["escape"]);
  });

  test("Esc seguido de outra tecla (leituras separadas) não vira Alt+tecla", async () => {
    // Antes: Esc e depois "/" em menos de 500 ms viravam Alt+/ e a busca não abria
    const events: InputEvent[] = [];
    const decoder = new KeyDecoder((event) => events.push(event), 20);
    decoder.feed("\x1B");
    await Bun.sleep(40);
    decoder.feed("/");
    expect(events.map((event) => event.kind === "key" && [event.name, event.meta])).toEqual([
      ["escape", false],
      ["/", false],
    ]);
  });

  test("sequência partida entre leituras é juntada", () => {
    expect(names(decodeAll("\x1B", "[A"))).toEqual(["up"]);
    expect(names(decodeAll("\x1B[", "6~"))).toEqual(["pagedown"]);
  });
});

describe("KeyDecoder: texto e colagem", () => {
  test("texto vira uma tecla por grafema (acentos, emoji, ZWJ)", () => {
    const events = decodeAll("áé😀👨‍👩‍👧") as KeyEvent[];
    expect(events.map((event) => event.text)).toEqual(["á", "é", "😀", "👨‍👩‍👧"]);
  });

  test("UTF-8 partido entre leituras é montado corretamente", () => {
    const bytes = new TextEncoder().encode("ç😀");
    const events: InputEvent[] = [];
    const decoder = new KeyDecoder((event) => events.push(event), 5);
    for (const byte of bytes) decoder.feed(new Uint8Array([byte]));
    decoder.flush();
    expect(events.map((event) => event.kind === "key" && event.text)).toEqual(["ç", "😀"]);
  });

  test("bracketed paste vira um único evento, mesmo partido em várias leituras", () => {
    const events = decodeAll("\x1B[200~linha 1\r  linha", " 2\x1B[2", "01~j");
    expect(events[0]).toEqual({ kind: "paste", text: "linha 1\r  linha 2" });
    expect(names(events.slice(1))).toEqual(["j"]);
  });

  test("colagem sem bracketed paste (texto com quebras numa leitura só) também é reconhecida", () => {
    expect(decodeAll("def f():\r    return 1")).toEqual([{ kind: "paste", text: "def f():\r    return 1" }]);
  });

  test("teclas comuns digitadas rápido continuam sendo teclas", () => {
    expect(names(decodeAll("jjk"))).toEqual(["j", "j", "k"]);
    expect(names(decodeAll("\r"))).toEqual(["return"]);
  });
});
