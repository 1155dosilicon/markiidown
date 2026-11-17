import hljs from "highlight.js";
import { Marked, TextRenderer, type Tokens } from "marked";
import { markedHighlight } from "marked-highlight";
import { basename } from "node:path";
import { frontMatterToCodeBlock } from "./markdown-terminal.ts";
import {
  calculateReadingTime,
  detectFileType,
  extractCodeTableOfContents,
  formatBytes,
  resolveHighlightLanguage,
} from "./utils.ts";

/**
 * Exportação para um único arquivo HTML, sem nada externo: estilos, realce de
 * sintaxe e o botão de tema vão embutidos. O HTML que estiver dentro do
 * Markdown é mostrado como texto (escapado), nunca executado.
 */

const isHljsLanguage = (name: string) => !!hljs.getLanguage(name);

/**
 * Gera o id do título com a mesma regra do GitHub (github-slugger): letras
 * minúsculas, sem pontuação nem símbolos (emoji inclusive), cada espaço vira
 * "-". Assim os links de sumário escritos para o GitHub (`#-instalação`,
 * `#a--b`) funcionam no HTML exportado. Letras de qualquer alfabeto ficam.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Divide o HTML do highlight.js em linhas mantendo cada linha bem formada:
 * spans abertos (comentários e strings multilinha) são fechados no fim da
 * linha e reabertos no início da seguinte, preservando a cor.
 */
export function splitHighlightedHtmlLines(html: string): string[] {
  const lines: string[] = [];
  const openTags: string[] = [];
  let current = "";

  for (const part of html.split(/(<span[^>]*>|<\/span>|\r?\n)/)) {
    if (!part) continue;
    if (part === "\n" || part === "\r\n") {
      lines.push(current + "</span>".repeat(openTags.length));
      current = openTags.join("");
    } else if (part.startsWith("<span")) {
      openTags.push(part);
      current += part;
    } else if (part === "</span>") {
      openTags.pop();
      current += part;
    } else {
      current += part;
    }
  }

  lines.push(current + "</span>".repeat(openTags.length));
  return lines;
}

/** Só deixa passar links relativos, âncoras e http(s)/mailto/tel. */
function sanitizeUrl(url: string): string | null {
  const normalized = url.trim().replace(/[\u0000- \u007F]+/g, "");
  const scheme = normalized.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && !["http", "https", "mailto", "tel"].includes(scheme)) return null;
  return url;
}

/** Ids únicos como no GitHub: "a", "a-1", "a-2"... sem colidir com um título que já se chame "a-1". */
function createSlugger(): (text: string, fallbackIndex: number) => string {
  const used = new Set<string>();
  return (text, fallbackIndex) => {
    const base = slugify(text) || `secao-${fallbackIndex}`;
    let slug = base;
    for (let counter = 1; used.has(slug); counter++) slug = `${base}-${counter}`;
    used.add(slug);
    return slug;
  };
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

const ALERT_LABELS: Record<string, string> = {
  note: "Nota",
  tip: "Dica",
  important: "Importante",
  warning: "Atenção",
  caution: "Cuidado",
};

/**
 * Converte qualquer arquivo (Markdown, código, texto) em HTML estático.
 * `sizeBytes` é o tamanho real do arquivo no disco (para o cabeçalho).
 */
export function convertFileToStaticHtml(rawText: string, filePath: string, sizeBytes?: number): string {
  const typeInfo = detectFileType(filePath);
  if (typeInfo.type === "markdown") return convertMarkdownToStaticHtml(rawText, filePath, sizeBytes);

  const text = rawText.replace(/\r\n|\r/g, "\n");
  const lines = text.split("\n");
  const toc: TocItem[] =
    typeInfo.type === "code"
      ? extractCodeTableOfContents(lines).map((entry) => ({ id: `L${entry.lineIndex + 1}`, text: escapeHtml(entry.title), level: 1 }))
      : [];

  const language = resolveHighlightLanguage(typeInfo.language, isHljsLanguage) ?? "plaintext";
  let highlightedHtml: string;
  try {
    highlightedHtml = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  } catch {
    highlightedHtml = escapeHtml(text);
  }

  const digits = Math.max(2, String(lines.length).length);
  const body = splitHighlightedHtmlLines(highlightedHtml)
    .map((line, index) => {
      const number = String(index + 1).padStart(digits, " ");
      return `<div class="code-line" id="L${index + 1}"><span class="line-num">${number}</span><span class="line-content">${line || " "}</span></div>`;
    })
    .join("\n");

  return pageTemplate({
    fileName: basename(filePath),
    subtitle: typeInfo.description,
    rawText,
    sizeBytes,
    tocTitle: "Símbolos",
    toc,
    emptyToc: "Nenhum símbolo encontrado",
    mainClass: "code-view",
    mainHtml: `<div class="code-container hljs">\n${body}\n</div>`,
  });
}

/** Converte Markdown em HTML estático com estilos e scripts embutidos. */
export function convertMarkdownToStaticHtml(rawMarkdown: string, filePath: string, sizeBytes?: number): string {
  const toc: TocItem[] = [];
  const slug = createSlugger();

  // Instância nova a cada conversão: as personalizações abaixo guardam estado
  // (sumário, ids usados). Passar `{ renderer }` em parse() substituía o
  // renderizador do marked-highlight e os blocos perdiam a classe "hljs".
  const marked = new Marked(
    markedHighlight({
      emptyLangClass: "hljs",
      langPrefix: "hljs language-",
      highlight(code, lang) {
        const language = resolveHighlightLanguage(lang, isHljsLanguage) ?? "plaintext";
        return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      },
    })
  );

  marked.use({
    gfm: true,
    renderer: {
      html({ text }: Tokens.HTML | Tokens.Tag) {
        // Comentários somem; o resto do HTML aparece como texto, sem executar
        const withoutComments = text.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
        return withoutComments.trim() ? escapeHtml(withoutComments) : "";
      },
      link({ href, title, tokens }: Tokens.Link) {
        const text = this.parser.parseInline(tokens);
        const safeHref = sanitizeUrl(href);
        if (!safeHref) return text;
        const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
        return `<a href="${escapeHtml(safeHref)}"${titleAttribute}>${text}</a>`;
      },
      image({ href, title, text }: Tokens.Image) {
        const safeHref = sanitizeUrl(href);
        if (!safeHref) return escapeHtml(text);
        const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
        return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(text)}"${titleAttribute}>`;
      },
      blockquote({ tokens }: Tokens.Blockquote) {
        const innerHtml = this.parser.parse(tokens);
        const alertMatch = innerHtml.match(/^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n|(?=<\/p>))?/i);
        if (!alertMatch) return `<blockquote>\n${innerHtml}</blockquote>\n`;
        const type = alertMatch[1].toLowerCase();
        const bodyHtml = innerHtml.replace(alertMatch[0], "<p>").replace(/^<p><\/p>\n?/, "");
        return `<div class="markdown-alert markdown-alert-${type}">\n<p class="markdown-alert-title">${ALERT_LABELS[type]}</p>\n${bodyHtml}</div>\n`;
      },
      heading({ tokens, depth }: Tokens.Heading) {
        const html = this.parser.parseInline(tokens);
        const plain = this.parser.parseInline(tokens, new TextRenderer());
        const id = slug(plain, toc.length + 1);
        if (depth <= 4) toc.push({ id, text: escapeHtml(plain), level: depth });
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      },
    },
  });

  const htmlContent = marked.parse(frontMatterToCodeBlock(rawMarkdown), { async: false }) as string;

  return pageTemplate({
    fileName: basename(filePath),
    rawText: rawMarkdown,
    sizeBytes,
    tocTitle: "Sumário",
    toc,
    emptyToc: "Nenhum título encontrado",
    mainClass: "markdown-body",
    mainHtml: htmlContent,
  });
}

interface PageOptions {
  fileName: string;
  subtitle?: string;
  rawText: string;
  sizeBytes?: number;
  tocTitle: string;
  toc: TocItem[];
  emptyToc: string;
  mainClass: string;
  mainHtml: string;
}

function pageTemplate(page: PageOptions): string {
  const safeFileName = escapeHtml(page.fileName);
  const { words, minutes } = calculateReadingTime(page.rawText);
  const size = formatBytes(page.sizeBytes ?? new TextEncoder().encode(page.rawText).length);
  const tocHtml = page.toc.length
    ? page.toc.map((item) => `<a href="#${item.id}" class="toc-link level-${item.level}">${item.text}</a>`).join("\n")
    : `<div class="toc-empty">${page.emptyToc}</div>`;
  const subtitle = page.subtitle ? ` <span class="subtitle">(${escapeHtml(page.subtitle)})</span>` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="MarkiiDown">
  <title>${safeFileName} - MarkiiDown</title>
  <script>
    // Tema inicial segue o sistema; o botão alterna e a escolha fica guardada
    (function () {
      var saved = null;
      try { saved = localStorage.getItem("markiidown-theme"); } catch (e) {}
      var light = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
      document.documentElement.setAttribute("data-theme", saved || (light ? "light" : "dark"));
    })();
  </script>
  <style>
${PAGE_CSS}
  </style>
</head>
<body>
  <header>
    <div class="header-title">📄 ${safeFileName}${subtitle}</div>
    <div class="header-stats">
      <span>📊 ${size}</span>
      <span>📝 ${words} palavras</span>
      <span>⏱️ ~${minutes} min</span>
      <button class="btn" type="button" onclick="toggleTheme()">🌙/☀️ Tema</button>
      <button class="btn" type="button" onclick="window.print()">🖨️ Imprimir</button>
    </div>
  </header>
  <div class="container">
    <aside>
      <div class="toc-title">${page.tocTitle}</div>
      <nav>${tocHtml}</nav>
    </aside>
    <main class="${page.mainClass}">
${page.mainHtml}
    </main>
  </div>
  <script>
    function toggleTheme() {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("markiidown-theme", next); } catch (e) {}
    }
  </script>
</body>
</html>`;
}

const PAGE_CSS = `
    :root {
      --bg-primary: #0d1117; --bg-secondary: #161b22; --bg-tertiary: #21262d; --border-color: #30363d;
      --text-main: #c9d1d9; --text-muted: #8b949e; --text-bright: #f0f6fc; --accent-color: #58a6ff;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: "Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      --hl-keyword: #ff7b72; --hl-title: #d2a8ff; --hl-attr: #79c0ff; --hl-string: #a5d6ff;
      --hl-builtin: #ffa657; --hl-comment: #8b949e; --hl-addition: #3fb950; --hl-deletion: #f85149;
    }
    [data-theme="light"] {
      --bg-primary: #ffffff; --bg-secondary: #f6f8fa; --bg-tertiary: #eaedf0; --border-color: #d0d7de;
      --text-main: #24292f; --text-muted: #57606a; --text-bright: #0969da; --accent-color: #0969da;
      --hl-keyword: #cf222e; --hl-title: #8250df; --hl-attr: #0550ae; --hl-string: #0a3069;
      --hl-builtin: #953800; --hl-comment: #6e7781; --hl-addition: #116329; --hl-deletion: #82071e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-sans); background: var(--bg-primary); color: var(--text-main); line-height: 1.6; display: flex; flex-direction: column; min-height: 100vh; }
    header { background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; position: sticky; top: 0; z-index: 10; }
    .header-title { font-weight: 700; color: var(--text-bright); display: flex; align-items: center; gap: 8px; overflow-wrap: anywhere; }
    .subtitle { font-size: 0.8rem; color: var(--text-muted); font-weight: 400; }
    .header-stats { font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .btn { background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-main); padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
    .btn:hover { border-color: var(--accent-color); color: var(--text-bright); }
    .container { display: flex; max-width: 1400px; margin: 0 auto; width: 100%; flex: 1; }
    aside { width: 260px; flex-shrink: 0; border-right: 1px solid var(--border-color); padding: 24px 16px; background: var(--bg-secondary); }
    nav { position: sticky; top: 70px; max-height: calc(100vh - 90px); overflow-y: auto; }
    .toc-title { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 10px; }
    .toc-empty { color: var(--text-muted); font-size: 0.85rem; }
    .toc-link { display: block; color: var(--text-muted); text-decoration: none; font-size: 0.85rem; padding: 4px 6px; border-radius: 4px; }
    .toc-link:hover { color: var(--accent-color); background: var(--bg-tertiary); }
    .toc-link.level-2 { padding-left: 14px; }
    .toc-link.level-3 { padding-left: 24px; }
    .toc-link.level-4 { padding-left: 34px; }
    main { flex: 1; min-width: 0; padding: 40px 48px; }
    .markdown-body { max-width: 900px; }
    .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { color: var(--text-bright); margin-top: 1.5em; margin-bottom: 0.6em; line-height: 1.25; scroll-margin-top: 70px; }
    .markdown-body > h1:first-child { margin-top: 0; }
    .markdown-body h1 { border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    .markdown-body h2 { border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    .markdown-body p, .markdown-body ul, .markdown-body ol, .markdown-body table, .markdown-body pre, .markdown-body blockquote { margin-bottom: 1.2em; }
    .markdown-body a { color: var(--accent-color); }
    .markdown-body img { max-width: 100%; height: auto; }
    .markdown-body ul, .markdown-body ol { padding-left: 2em; }
    .markdown-body li > ul, .markdown-body li > ol { margin-bottom: 0; }
    .markdown-body li:has(> input[type="checkbox"]) { list-style: none; margin-left: -1.4em; }
    .markdown-body hr { border: 0; border-top: 1px solid var(--border-color); margin: 1.5em 0; }
    .markdown-body pre { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 14px; overflow-x: auto; font-family: var(--font-mono); }
    .markdown-body code { font-family: var(--font-mono); font-size: 0.9em; background: var(--bg-secondary); padding: 0.2em 0.4em; border-radius: 4px; }
    .markdown-body pre code { background: transparent; padding: 0; }
    .markdown-body table { border-collapse: collapse; display: block; overflow-x: auto; max-width: 100%; }
    .markdown-body th, .markdown-body td { border: 1px solid var(--border-color); padding: 8px 12px; }
    .markdown-body th { background: var(--bg-secondary); }
    .markdown-body blockquote { padding: 0 1em; color: var(--text-muted); border-left: 4px solid var(--border-color); }
    .markdown-alert { padding: 10px 14px; margin-bottom: 14px; border-left: 4px solid var(--accent-color); background: var(--bg-secondary); border-radius: 0 6px 6px 0; }
    .markdown-alert > :last-child { margin-bottom: 0; }
    .markdown-alert-title { font-weight: 700; margin-bottom: 4px; }
    .markdown-alert-note { border-left-color: #58a6ff; } .markdown-alert-note .markdown-alert-title { color: #58a6ff; }
    .markdown-alert-tip { border-left-color: #3fb950; } .markdown-alert-tip .markdown-alert-title { color: #3fb950; }
    .markdown-alert-important { border-left-color: #a371f7; } .markdown-alert-important .markdown-alert-title { color: #a371f7; }
    .markdown-alert-warning { border-left-color: #d29922; } .markdown-alert-warning .markdown-alert-title { color: #d29922; }
    .markdown-alert-caution { border-left-color: #f85149; } .markdown-alert-caution .markdown-alert-title { color: #f85149; }
    .code-container { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; font-family: var(--font-mono); font-size: 0.9rem; line-height: 1.5; overflow-x: auto; }
    .code-line { display: flex; scroll-margin-top: 70px; }
    .code-line:target { background: var(--bg-tertiary); }
    .line-num { min-width: 45px; text-align: right; color: var(--text-muted); user-select: none; padding-right: 16px; white-space: pre; }
    .line-content { flex: 1; white-space: pre; }
    .hljs { color: var(--text-main); }
    .hljs-doctag, .hljs-keyword, .hljs-meta .hljs-keyword, .hljs-template-tag, .hljs-template-variable, .hljs-type, .hljs-variable.language_ { color: var(--hl-keyword); }
    .hljs-title, .hljs-title.class_, .hljs-title.class_.inherited__, .hljs-title.function_ { color: var(--hl-title); }
    .hljs-attr, .hljs-attribute, .hljs-literal, .hljs-meta, .hljs-number, .hljs-operator, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id, .hljs-variable { color: var(--hl-attr); }
    .hljs-meta .hljs-string, .hljs-regexp, .hljs-string { color: var(--hl-string); }
    .hljs-built_in, .hljs-symbol { color: var(--hl-builtin); }
    .hljs-code, .hljs-comment, .hljs-formula { color: var(--hl-comment); }
    .hljs-addition { color: var(--hl-addition); } .hljs-deletion { color: var(--hl-deletion); }
    @media (max-width: 800px) { aside { display: none; } main { padding: 20px; } }
    /* Impressão: sempre claro (fundo escuro não sai no papel e o texto cinza-claro ficava ilegível) */
    @media print {
      :root, [data-theme] {
        --bg-primary: #ffffff; --bg-secondary: #f6f8fa; --bg-tertiary: #eaedf0; --border-color: #d0d7de;
        --text-main: #000000; --text-muted: #444444; --text-bright: #000000; --accent-color: #0550ae;
        --hl-keyword: #cf222e; --hl-title: #8250df; --hl-attr: #0550ae; --hl-string: #0a3069;
        --hl-builtin: #953800; --hl-comment: #57606a; --hl-addition: #116329; --hl-deletion: #82071e;
      }
      header .btn, aside { display: none; }
      header { position: static; }
      main { padding: 0; }
      .markdown-body { max-width: none; }
      pre, .code-container { white-space: pre-wrap; overflow: visible; }
      .line-content { white-space: pre-wrap; }
      h1, h2, h3, h4 { break-after: avoid; }
      pre, table, .markdown-alert { break-inside: avoid; }
    }`;
