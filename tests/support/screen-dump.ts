import type { CellAttributes, VirtualTerminal } from "./virtual-terminal.ts";

/** Descreve os atributos de forma compacta (para depuração e mensagens de erro). */
export function describeAttributes(attrs: CellAttributes): string {
  const parts: string[] = [];
  if (attrs.fg) parts.push(`fg${attrs.fg}`);
  if (attrs.bg) parts.push(`bg${attrs.bg}`);
  if (attrs.bold) parts.push("b");
  if (attrs.dim) parts.push("dim");
  if (attrs.italic) parts.push("i");
  if (attrs.underline) parts.push("u");
  if (attrs.inverse) parts.push("inv");
  if (attrs.strikethrough) parts.push("s");
  if (attrs.link) parts.push(`link=${attrs.link}`);
  return parts.join(",") || "-";
}

/** Uma linha por linha da tela: texto seguido dos trechos com o mesmo estilo. */
export function dumpScreen(screen: VirtualTerminal): string {
  const out: string[] = [];
  for (let row = 0; row < screen.rows; row++) {
    const runs: string[] = [];
    let current = "";
    let text = "";
    for (let col = 0; col < screen.cols; col++) {
      const cell = screen.cell(row, col);
      if (cell.width === 0) continue;
      const style = describeAttributes(cell.attrs);
      if (style !== current) {
        if (text.trim() || current !== "-") runs.push(`[${current}]${JSON.stringify(text)}`);
        current = style;
        text = "";
      }
      text += cell.char;
    }
    if (text.trim() || current !== "-") runs.push(`[${current}]${JSON.stringify(text)}`);
    out.push(`${String(row + 1).padStart(2)}| ${screen.lineText(row).trimEnd()}`);
    const styled = runs.filter((run) => !run.startsWith("[-]"));
    if (styled.length) out.push(`  ~ ${styled.join(" ")}`);
  }
  return out.join("\n");
}
