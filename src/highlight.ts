import hljs from "highlight.js";
import { applySgr, DEFAULT_SGR, highlightRanges, sgrOpen, stripAnsi, type SgrState } from "./ansi.ts";
import { resolveHighlightLanguage } from "./utils.ts";

/**
 * Realce de sintaxe para o terminal.
 *
 * Usa o mesmo motor da exportação HTML (highlight.js 11) e converte o HTML
 * dele (`<span class="hljs-keyword">`) em cores ANSI. Antes o terminal usava o
 * `cli-highlight`, que embute o highlight.js 10.7.3 (sem manutenção): o
 * terminal e o HTML reconheciam linguagens diferentes e coloriam diferente.
 *
 * Só as 16 cores básicas são usadas, para que o tema do terminal (claro ou
 * escuro) decida os tons.
 */

export const isHighlightLanguage = (name: string): boolean => !!hljs.getLanguage(name);

/** Escopo do highlight.js → parâmetros SGR. Escopos ausentes ficam na cor padrão. */
const THEME: Record<string, string> = {
  keyword: "35",
  "variable.language_": "35",
  literal: "35",
  built_in: "36",
  type: "36",
  "title.class_": "33",
  "title.class_.inherited__": "33",
  title: "34",
  "title.function_": "34",
  "title.function_.invoke__": "34",
  params: "",
  number: "33",
  string: "32",
  char: "32",
  regexp: "31",
  symbol: "33",
  subst: "",
  comment: "90",
  doctag: "90;1",
  quote: "90",
  meta: "90",
  "meta.keyword": "35",
  "meta.string": "32",
  section: "34;1",
  tag: "90",
  name: "34",
  attr: "36",
  attribute: "36",
  property: "36",
  variable: "",
  "template-tag": "35",
  "template-variable": "33",
  "selector-tag": "35",
  "selector-id": "33",
  "selector-class": "33",
  "selector-attr": "36",
  "selector-pseudo": "36",
  bullet: "33",
  code: "33",
  emphasis: "3",
  strong: "1",
  link: "4",
  addition: "32",
  deletion: "31",
};

function themeFor(classAttribute: string): string {
  const classes = classAttribute.split(/\s+/).filter(Boolean);
  const scope = classes.find((name) => name.startsWith("hljs-"))?.slice(5);
  if (!scope) return "";
  const modifiers = classes.filter((name) => !name.startsWith("hljs-"));
  // Tenta do mais específico ao mais genérico: "title.function_.invoke__", "title.function_", "title"
  for (let count = modifiers.length; count >= 0; count--) {
    const key = [scope, ...modifiers.slice(0, count)].join(".");
    if (key in THEME) return THEME[key];
  }
  return "";
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
};

function decodeHljsText(text: string): string {
  return text.includes("&") ? text.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => HTML_ENTITIES[entity]) : text;
}

/**
 * Converte o HTML do highlight.js em linhas ANSI autocontidas (cada linha
 * fecha o que abriu; um comentário de várias linhas é reaberto em cada uma).
 */
export function hljsHtmlToAnsiLines(html: string): string[] {
  const lines: string[] = [];
  const stack: SgrState[] = [DEFAULT_SGR];
  let emitted: SgrState = DEFAULT_SGR;
  let current = "";

  const emitText = (text: string) => {
    if (text === "") return;
    const wanted = stack[stack.length - 1];
    if (wanted !== emitted) {
      current += (emitted === DEFAULT_SGR ? "" : "\x1B[0m") + sgrOpen(wanted);
      emitted = wanted;
    }
    current += text;
  };
  const endLine = () => {
    if (emitted !== DEFAULT_SGR) current += "\x1B[0m";
    emitted = DEFAULT_SGR;
    lines.push(current);
    current = "";
  };

  for (const part of html.split(/(<span class="[^"]*">|<\/span>)/)) {
    if (part === "") continue;
    if (part.startsWith("<span")) {
      const params = themeFor(part.slice(13, -2));
      const parent = stack[stack.length - 1];
      stack.push(params ? applySgr(parent, params) : parent);
      continue;
    }
    if (part === "</span>") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const pieces = decodeHljsText(part).split("\n");
    pieces.forEach((piece, index) => {
      if (index > 0) endLine();
      emitText(piece);
    });
  }
  endLine();
  return lines;
}

/** Opções de linha de comando (`--install`, `--export=x.html`) em gramáticas de shell. */
const LONG_CLI_OPTION = /(?<![\w-])--[A-Za-z0-9][A-Za-z0-9-]*(?:=[^\s"'`)<>{}\]]+)?/g;
const SHELL_GRAMMARS = new Set(["bash", "shell", "powershell", "dos"].map((name) => hljs.getLanguage(name)));

/**
 * Gramáticas de shell partem `--install` em "-" + "-install" com cores
 * diferentes. Aqui a opção inteira recebe uma cor só, sem mexer no resto.
 */
function colorCliOptions(line: string): string {
  const plain = stripAnsi(line);
  if (!plain.includes("--")) return line;
  const ranges = [...plain.matchAll(LONG_CLI_OPTION)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  return highlightRanges(line, ranges, "\x1B[33m");
}

/**
 * Realça o código e devolve uma linha ANSI por linha do código, ou null quando
 * não há gramática para a linguagem (o chamador mostra o texto sem cores).
 */
export function highlightToAnsiLines(code: string, language: string | undefined): string[] | null {
  const resolved = resolveHighlightLanguage(language, isHighlightLanguage);
  if (!resolved) return null;
  try {
    const html = hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value;
    const lines = hljsHtmlToAnsiLines(html);
    return SHELL_GRAMMARS.has(hljs.getLanguage(resolved)) ? lines.map(colorCliOptions) : lines;
  } catch {
    return null;
  }
}
