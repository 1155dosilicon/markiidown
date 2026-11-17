import { describe, expect, test } from "bun:test";
import {
  applySgr,
  DEFAULT_CONTEXT,
  DEFAULT_SGR,
  expandTabsAnsi,
  highlightRanges,
  HYPERLINK_CLOSE,
  hyperlinkOpen,
  normalizeAnsiLines,
  sgrOpen,
  stripAnsi,
  truncateAnsi,
  updateContext,
  withBaseStyle,
  wrapAnsi,
  wrapAnsiDetailed,
} from "../src/ansi.ts";

const ESC = "\x1B";
const LINK = hyperlinkOpen("https://exemplo.com");

/** Estado (SGR + hyperlink) no fim da string. */
function contextAtEnd(text: string) {
  let context = DEFAULT_CONTEXT;
  for (const match of text.matchAll(/\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1B]*(?:\x07|\x1B\\))/g)) {
    context = updateContext(context, match[0]);
  }
  return context;
}

function expectSelfContained(lines: string[]): void {
  for (const line of lines) {
    const context = contextAtEnd(line);
    expect(sgrOpen(context.sgr)).toBe("");
    expect(context.link).toBeNull();
  }
}

describe("stripAnsi", () => {
  test("remove cores, hyperlinks (BEL e ST) e mantém o texto", () => {
    expect(stripAnsi(`${ESC}[1;31mvermelho${ESC}[0m`)).toBe("vermelho");
    expect(stripAnsi(`${LINK}link${HYPERLINK_CLOSE}`)).toBe("link");
    expect(stripAnsi(`${ESC}]8;;https://x${ESC}\\a${ESC}]8;;${ESC}\\ e ${ESC}]8;;https://y${ESC}\\b${ESC}]8;;${ESC}\\`)).toBe("a e b");
  });
});

describe("estado SGR", () => {
  test("acumula e desliga atributos como o terminal", () => {
    let state = applySgr(DEFAULT_SGR, "1;31");
    expect(sgrOpen(state)).toBe(`${ESC}[1;31m`);
    state = applySgr(state, "2");
    state = applySgr(state, "22"); // desliga negrito e esmaecido juntos
    expect(sgrOpen(state)).toBe(`${ESC}[31m`);
    state = applySgr(state, "39");
    expect(state).toBe(DEFAULT_SGR);
  });

  test("entende cores de 256 e 24 bits, com ';' e com ':'", () => {
    expect(sgrOpen(applySgr(DEFAULT_SGR, "38;5;208"))).toBe(`${ESC}[38;5;208m`);
    expect(sgrOpen(applySgr(DEFAULT_SGR, "48;2;1;2;3"))).toBe(`${ESC}[48;2;1;2;3m`);
    expect(sgrOpen(applySgr(DEFAULT_SGR, "38:5:99"))).toBe(`${ESC}[38;5;99m`);
    expect(applySgr(applySgr(DEFAULT_SGR, "4"), "0")).toBe(DEFAULT_SGR);
  });
});

describe("normalizeAnsiLines", () => {
  test("estilo que atravessa linhas é fechado e reaberto em cada uma", () => {
    const lines = normalizeAnsiLines([`a ${ESC}[1mnegrito`, "continua", `fim${ESC}[22m ok`]);
    expect(lines[0]).toBe(`a ${ESC}[1mnegrito${ESC}[0m`);
    expect(lines[1]).toBe(`${ESC}[1mcontinua${ESC}[0m`);
    expect(lines[2]).toBe(`${ESC}[1mfim${ESC}[22m ok`);
    expectSelfContained(lines);
  });

  test("hyperlink aberto numa linha é fechado nela e reaberto na seguinte", () => {
    const lines = normalizeAnsiLines([`${LINK}primeira`, `segunda${HYPERLINK_CLOSE}`]);
    expect(lines[0].endsWith(HYPERLINK_CLOSE)).toBe(true);
    expect(lines[1].startsWith(LINK)).toBe(true);
    expectSelfContained(lines);
  });

  test("linhas já autocontidas não mudam", () => {
    const lines = [`${ESC}[33mamarelo${ESC}[39m`, "simples"];
    expect(normalizeAnsiLines(lines)).toEqual(lines);
  });
});

describe("wrapAnsi", () => {
  test("não perde texto, respeita a largura e quebra nos espaços", () => {
    const text = "o rato roeu a roupa do rei de roma e a rainha ficou brava";
    const lines = wrapAnsi(text, 12);
    expect(lines.every((line) => Bun.stringWidth(line) <= 12)).toBe(true);
    expect(lines.join(" ")).toBe(text);
    expect(lines[0]).toBe("o rato roeu");
  });

  test("palavra maior que a largura é cortada", () => {
    expect(wrapAnsi("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  test("cada linha quebrada é autocontida, inclusive com hyperlink", () => {
    const text = `${ESC}[33m${LINK}um texto longo dentro de um link${HYPERLINK_CLOSE}${ESC}[39m depois`;
    const lines = wrapAnsi(text, 10);
    expect(lines.length).toBeGreaterThan(2);
    expectSelfContained(lines);
    expect(lines.map(stripAnsi).join(" ")).toBe("um texto longo dentro de um link depois");
    // A segunda linha reabre a cor e o link
    expect(lines[1].startsWith(`${ESC}[33m${LINK}`)).toBe(true);
  });

  test("emoji e CJK (2 colunas) nunca são partidos nem estouram a largura", () => {
    const lines = wrapAnsi("😀界😀界😀界a", 5);
    expect(lines.every((line) => Bun.stringWidth(line) <= 5)).toBe(true);
    expect(lines.join("")).toBe("😀界😀界😀界a");
  });

  test("espaço não separável não é ponto de quebra", () => {
    const lines = wrapAnsi("aaaa bbbb cc", 9);
    expect(lines[0]).toBe("aaaa bbbb");
  });

  test("recuo nas linhas de continuação", () => {
    const lines = wrapAnsi("um dois tres quatro cinco", 10, "   ");
    expect(lines[0].startsWith("um")).toBe(true);
    expect(lines.slice(1).every((line) => line.startsWith("   ") && Bun.stringWidth(line) <= 10)).toBe(true);
  });

  test("informa onde cada linha visual começa no texto", () => {
    const text = `${ESC}[1mprimeira${ESC}[0m segunda terceira`;
    const { lines, starts } = wrapAnsiDetailed(text, 9);
    const plain = stripAnsi(text);
    expect(starts).toHaveLength(lines.length);
    lines.forEach((line, index) => {
      expect(plain.slice(starts[index]).startsWith(stripAnsi(line).trim())).toBe(true);
    });
  });

  test("custo linear: 400 mil caracteres quebram rápido e sem perder texto", () => {
    const text = `${ESC}[33m` + "palavra ".repeat(50_000) + `${ESC}[0m`;
    const started = performance.now();
    const lines = wrapAnsi(text, 120);
    expect(performance.now() - started).toBeLessThan(2_000);
    // O espaço do ponto de quebra não fica no fim da linha
    expect(lines.map(stripAnsi).join(" ").trim()).toBe(stripAnsi(text).trim());
    expect(lines.slice(0, -1).some((line) => stripAnsi(line).endsWith(" "))).toBe(false);
    expect(lines.every((line) => Bun.stringWidth(line) <= 120)).toBe(true);
  });
});

describe("truncateAnsi e expandTabsAnsi", () => {
  test("corte não deixa estilo nem hyperlink abertos", () => {
    const cut = truncateAnsi(`${ESC}[31m${LINK}vermelho e link${HYPERLINK_CLOSE}${ESC}[0m`, 4);
    expect(stripAnsi(cut)).toBe("verm");
    expectSelfContained([cut]);
  });

  test("considera a largura de emoji e CJK", () => {
    expect(truncateAnsi("😀界a", 3)).toBe("😀");
    expect(truncateAnsi("😀界a", 4)).toBe("😀界");
  });

  test("TAB vai até a próxima parada, ignorando ANSI", () => {
    expect(expandTabsAnsi("\tx")).toBe("    x");
    expect(expandTabsAnsi("ab\tc")).toBe("ab  c");
    expect(expandTabsAnsi(`${ESC}[33m\t${ESC}[39mx`)).toBe(`${ESC}[33m    ${ESC}[39mx`);
  });
});

describe("highlightRanges e withBaseStyle", () => {
  test("marca só o trecho pedido e devolve a cor original depois", () => {
    const line = `${ESC}[32mabc def${ESC}[0m`;
    const marked = highlightRanges(line, [{ start: 4, end: 7 }], `${ESC}[7m`);
    expect(stripAnsi(marked)).toBe("abc def");
    expect(marked).toContain(`${ESC}[7mdef`);
    expectSelfContained([marked]);
  });

  test("uma cor do texto dentro do trecho não apaga a marcação", () => {
    const line = `x ${ESC}[31mvermelho${ESC}[39m y`;
    const marked = highlightRanges(line, [{ start: 0, end: 12 }], `${ESC}[43m`);
    // Depois do ESC[31m e do ESC[39m a marcação é reaplicada
    expect(marked.match(/\x1B\[43m/g)!.length).toBeGreaterThanOrEqual(3);
  });

  test("estilo de base vale onde o texto não define o próprio", () => {
    const line = `a ${ESC}[1mb${ESC}[22m c`;
    const styled = withBaseStyle(line, "3");
    expect(styled.startsWith(`${ESC}[3ma `)).toBe(true);
    expect(styled).toContain(`${ESC}[1;3mb`);
    expect(styled).toContain(`${ESC}[3m c`);
    expectSelfContained([styled]);
  });
});
