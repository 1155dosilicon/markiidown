import { Marked, Renderer } from "marked";
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

/**
 * Converte Markdown para HTML estático completo e autocontido
 */
export function convertMarkdownToStaticHtml(rawMarkdown: string, filePath: string): string {
  const fileName = basename(filePath);
  const { words, minutes } = calculateReadingTime(rawMarkdown);
  const sizeFormatted = formatBytes(new TextEncoder().encode(rawMarkdown).length);

  const toc: { id: string; text: string; level: number }[] = [];
  const usedSlugs = new Map<string, number>();

  let processedMarkdown = rawMarkdown.replace(
    />\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n((?:>.*\n?)*)/gi,
    (_, type, content) => {
      const cleanType = type.toLowerCase();
      const cleanContent = content
        .split("\n")
        .map((line: string) => line.replace(/^>\s?/, ""))
        .join("\n");
      return `<div class="markdown-alert markdown-alert-${cleanType}">
        <strong>${type.toUpperCase()}</strong>
        <div>${cleanContent}</div>
      </div>\n`;
    }
  );

  const renderer = new Renderer();
  renderer.heading = ({ text, depth }: { text: string; depth: number }) => {
    const cleanText = text.replace(/<[^>]*>/g, "");
    let slug = slugify(cleanText) || `heading-${toc.length + 1}`;

    if (usedSlugs.has(slug)) {
      const count = usedSlugs.get(slug)! + 1;
      usedSlugs.set(slug, count);
      slug = `${slug}-${count}`;
    } else {
      usedSlugs.set(slug, 1);
    }

    if (depth <= 4) {
      toc.push({ id: slug, text: cleanText, level: depth });
    }

    return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
  };

  const htmlContent = htmlMarked.parse(processedMarkdown, { renderer }) as string;

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
  <title>${fileName} - MarkiiDown</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css" id="hljs-theme">
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
    .markdown-body ul, .markdown-body ol { padding-left: 2em; }
    .markdown-body pre { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 14px; overflow-x: auto; font-family: var(--font-mono); }
    .markdown-body code { font-family: var(--font-mono); font-size: 0.9em; background: var(--bg-secondary); padding: 0.2em 0.4em; border-radius: 4px; }
    .markdown-body pre code { background: transparent; padding: 0; }
    .markdown-body table { width: 100%; border-collapse: collapse; margin-bottom: 1.5em; }
    .markdown-body th, .markdown-body td { border: 1px solid var(--border-color); padding: 8px 12px; }
    .markdown-body th { background: var(--bg-secondary); }
    .markdown-alert { padding: 10px 14px; margin-bottom: 14px; border-left: 4px solid var(--accent-color); background: var(--bg-secondary); border-radius: 0 6px 6px 0; }
    @media (max-width: 800px) { aside { display: none; } main { padding: 20px; } }
  </style>
</head>
<body>
  <header>
    <div class="header-title">📄 ${fileName}</div>
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
      const hljs = document.getElementById('hljs-theme');
      hljs.href = next === 'light' 
        ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css'
        : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css';
    }
  </script>
</body>
</html>`;
}
