import { Marked, Renderer, TextRenderer } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import { basename } from "node:path";
import { calculateReadingTime, formatBytes } from "./utils.ts";

const htmlMarked = new Marked();

htmlMarked.use(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(url: string): string | null {
  const normalized = url.trim().replace(/[\u0000-\u0020\u007F]+/g, "");
  const scheme = normalized.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();

  if (scheme && !["http", "https", "mailto", "tel"].includes(scheme)) {
    return null;
  }

  return url;
}

/**
 * Converte Markdown para HTML estático com estilos e scripts autocontidos
 */
export function convertMarkdownToStaticHtml(rawMarkdown: string, filePath: string): string {
  const fileName = basename(filePath);
  const safeFileName = escapeHtml(fileName);
  const { words, minutes } = calculateReadingTime(rawMarkdown);
  const sizeFormatted = formatBytes(new TextEncoder().encode(rawMarkdown).length);

  const toc: { id: string; text: string; level: number }[] = [];
  const usedSlugs = new Map<string, number>();

  const renderer = new Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  renderer.link = function ({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const safeHref = sanitizeUrl(href);
    if (!safeHref) return text;

    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(safeHref)}"${titleAttribute}>${text}</a>`;
  };
  renderer.image = ({ href, title, text }) => {
    const safeHref = sanitizeUrl(href);
    if (!safeHref) return escapeHtml(text);

    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(text)}"${titleAttribute}>`;
  };
  renderer.blockquote = function ({ tokens }) {
    const innerHtml = this.parser.parse(tokens);
    const alertMatch = innerHtml.match(/^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n)?/i);
    if (!alertMatch) return `<blockquote>\n${innerHtml}</blockquote>\n`;

    const type = alertMatch[1].toLowerCase();
    const bodyHtml = innerHtml.replace(alertMatch[0], "<p>");
    return `<div class="markdown-alert markdown-alert-${type}">
      <strong>${type.toUpperCase()}</strong>
      ${bodyHtml}
    </div>\n`;
  };
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const cleanText = this.parser.parseInline(tokens, new TextRenderer());
    let slug = slugify(cleanText) || `heading-${toc.length + 1}`;

    if (usedSlugs.has(slug)) {
      const count = usedSlugs.get(slug)! + 1;
      usedSlugs.set(slug, count);
      slug = `${slug}-${count}`;
    } else {
      usedSlugs.set(slug, 1);
    }

    if (depth <= 4) {
      toc.push({ id: slug, text: escapeHtml(cleanText), level: depth });
    }

    return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
  };

  const htmlContent = htmlMarked.parse(rawMarkdown, { renderer }) as string;

  const tocHtml = toc.length
    ? toc
        .map(
          (item) =>
            `<a href="#${item.id}" class="toc-link level-${item.level}">
              ${item.text}
            </a>`
        )
        .join("\n")
    : '<div style="color:#8b949e;font-size:0.85rem;">Nenhum cabeçalho detectado</div>';

  return `<!DOCTYPE html>
<html lang="pt-BR" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeFileName} - MarkiiDown</title>
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --border-color: #30363d;
      --text-main: #c9d1d9;
      --text-muted: #8b949e;
      --text-bright: #f0f6fc;
      --accent-color: #58a6ff;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    }
    [data-theme="light"] {
      --bg-primary: #ffffff;
      --bg-secondary: #f6f8fa;
      --bg-tertiary: #eaedf0;
      --border-color: #d0d7de;
      --text-main: #24292f;
      --text-muted: #57606a;
      --text-bright: #0969da;
      --accent-color: #0969da;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background-color: var(--bg-primary);
      color: var(--text-main);
      line-height: 1.6;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .header-title { font-weight: 700; color: var(--text-bright); display: flex; align-items: center; gap: 8px; }
    .header-stats { font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 12px; }
    .btn { background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-main); padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
    .btn:hover { border-color: var(--accent-color); color: var(--text-bright); }
    .container { display: flex; max-width: 1300px; margin: 0 auto; width: 100%; flex: 1; }
    aside { width: 260px; border-right: 1px solid var(--border-color); padding: 24px 16px; background: var(--bg-secondary); }
    .toc-title { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 10px; }
    .toc-link { display: block; color: var(--text-muted); text-decoration: none; font-size: 0.85rem; padding: 4px 6px; border-radius: 4px; }
    .toc-link:hover { color: var(--accent-color); background: var(--bg-tertiary); }
    .toc-link.level-2 { padding-left: 14px; }
    .toc-link.level-3 { padding-left: 24px; }
    main { flex: 1; padding: 40px 48px; max-width: 850px; }
    .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: var(--text-bright); margin-top: 1.5em; margin-bottom: 0.6em; }
    .markdown-body h1 { border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; margin-top: 0; }
    .markdown-body h2 { border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    .markdown-body p, .markdown-body ul, .markdown-body ol, .markdown-body table, .markdown-body pre { margin-bottom: 1.2em; }
    .markdown-body a { color: var(--accent-color); }
    .markdown-body img { max-width: 100%; height: auto; }
    .markdown-body ul, .markdown-body ol { padding-left: 2em; }
    .markdown-body pre { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 14px; overflow-x: auto; font-family: var(--font-mono); }
    .markdown-body code { font-family: var(--font-mono); font-size: 0.9em; background: var(--bg-secondary); padding: 0.2em 0.4em; border-radius: 4px; }
    .markdown-body pre code { background: transparent; padding: 0; }
    .markdown-body table { width: 100%; border-collapse: collapse; margin-bottom: 1.5em; }
    .markdown-body th, .markdown-body td { border: 1px solid var(--border-color); padding: 8px 12px; }
    .markdown-body th { background: var(--bg-secondary); }
    .markdown-body blockquote { padding: 0 1em; color: var(--text-muted); border-left: 4px solid var(--border-color); margin-bottom: 1.2em; }
    .markdown-alert { padding: 10px 14px; margin-bottom: 14px; border-left: 4px solid var(--accent-color); background: var(--bg-secondary); border-radius: 0 6px 6px 0; }
    .markdown-alert-note { border-left-color: #58a6ff; }
    .markdown-alert-tip { border-left-color: #3fb950; }
    .markdown-alert-important { border-left-color: #a371f7; }
    .markdown-alert-warning { border-left-color: #d29922; }
    .markdown-alert-caution { border-left-color: #f85149; }
    .hljs { color: #c9d1d9; }
    .hljs-doctag, .hljs-keyword, .hljs-meta .hljs-keyword, .hljs-template-tag, .hljs-template-variable, .hljs-type, .hljs-variable.language_ { color: #ff7b72; }
    .hljs-title, .hljs-title.class_, .hljs-title.class_.inherited__, .hljs-title.function_ { color: #d2a8ff; }
    .hljs-attr, .hljs-attribute, .hljs-literal, .hljs-meta, .hljs-number, .hljs-operator, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id, .hljs-variable { color: #79c0ff; }
    .hljs-meta .hljs-string, .hljs-regexp, .hljs-string { color: #a5d6ff; }
    .hljs-built_in, .hljs-symbol { color: #ffa657; }
    .hljs-code, .hljs-comment, .hljs-formula { color: #8b949e; }
    [data-theme="light"] .hljs { color: #24292f; }
    [data-theme="light"] .hljs-doctag, [data-theme="light"] .hljs-keyword, [data-theme="light"] .hljs-meta .hljs-keyword, [data-theme="light"] .hljs-template-tag, [data-theme="light"] .hljs-template-variable, [data-theme="light"] .hljs-type, [data-theme="light"] .hljs-variable.language_ { color: #cf222e; }
    [data-theme="light"] .hljs-title, [data-theme="light"] .hljs-title.class_, [data-theme="light"] .hljs-title.class_.inherited__, [data-theme="light"] .hljs-title.function_ { color: #8250df; }
    [data-theme="light"] .hljs-attr, [data-theme="light"] .hljs-attribute, [data-theme="light"] .hljs-literal, [data-theme="light"] .hljs-meta, [data-theme="light"] .hljs-number, [data-theme="light"] .hljs-operator, [data-theme="light"] .hljs-selector-attr, [data-theme="light"] .hljs-selector-class, [data-theme="light"] .hljs-selector-id, [data-theme="light"] .hljs-variable { color: #0550ae; }
    [data-theme="light"] .hljs-meta .hljs-string, [data-theme="light"] .hljs-regexp, [data-theme="light"] .hljs-string { color: #0a3069; }
    [data-theme="light"] .hljs-built_in, [data-theme="light"] .hljs-symbol { color: #953800; }
    [data-theme="light"] .hljs-code, [data-theme="light"] .hljs-comment, [data-theme="light"] .hljs-formula { color: #6e7781; }
    @media (max-width: 800px) { aside { display: none; } main { padding: 20px; } }
  </style>
</head>
<body>
  <header>
    <div class="header-title">📄 ${safeFileName}</div>
    <div class="header-stats">
      <span>📊 ${sizeFormatted}</span>
      <span>📝 ${words} palavras</span>
      <span>⏱️ ~${minutes} min</span>
      <button class="btn" onclick="toggleTheme()">🌙/☀️ Tema</button>
      <button class="btn" onclick="window.print()">🖨️ Imprimir</button>
    </div>
  </header>
  <div class="container">
    <aside>
      <div class="toc-title">Sumário</div>
      <nav>${tocHtml}</nav>
    </aside>
    <main class="markdown-body">
      ${htmlContent}
    </main>
  </div>
  <script>
    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
    }
  </script>
</body>
</html>`;
}
