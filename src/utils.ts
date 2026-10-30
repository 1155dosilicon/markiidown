import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import pc from "picocolors";

export type FileType = "markdown" | "code" | "text" | "binary";

export interface FileTypeInfo {
  type: FileType;
  language: string;
  isBinary: boolean;
  description: string;
}

export interface FileInfo {
  name: string;
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  updatedAt: Date;
  typeInfo?: FileTypeInfo;
}

/**
 * Mapeamento de extensões e nomes de arquivo para linguagens de programação e tipos
 */
const EXTENSION_LANGUAGE_MAP: Record<string, { language: string; type: FileType; description: string }> = {
  // Markdown
  ".md": { language: "markdown", type: "markdown", description: "Markdown Document" },
  ".markdown": { language: "markdown", type: "markdown", description: "Markdown Document" },
  ".mdown": { language: "markdown", type: "markdown", description: "Markdown Document" },
  ".mkd": { language: "markdown", type: "markdown", description: "Markdown Document" },
  ".mdx": { language: "markdown", type: "markdown", description: "MDX Document" },

  // JavaScript & TypeScript
  ".ts": { language: "typescript", type: "code", description: "TypeScript" },
  ".tsx": { language: "typescript", type: "code", description: "TypeScript React" },
  ".mts": { language: "typescript", type: "code", description: "TypeScript Module" },
  ".cts": { language: "typescript", type: "code", description: "TypeScript CommonJS" },
  ".js": { language: "javascript", type: "code", description: "JavaScript" },
  ".jsx": { language: "javascript", type: "code", description: "JavaScript React" },
  ".mjs": { language: "javascript", type: "code", description: "JavaScript Module" },
  ".cjs": { language: "javascript", type: "code", description: "JavaScript CommonJS" },

  // Data & Config formats
  ".json": { language: "json", type: "code", description: "JSON Document" },
  ".jsonc": { language: "json", type: "code", description: "JSON with Comments" },
  ".json5": { language: "json", type: "code", description: "JSON5" },
  ".yaml": { language: "yaml", type: "code", description: "YAML Configuration" },
  ".yml": { language: "yaml", type: "code", description: "YAML Configuration" },
  ".toml": { language: "ini", type: "code", description: "TOML Configuration" },
  ".ini": { language: "ini", type: "code", description: "INI Configuration" },
  ".cfg": { language: "ini", type: "code", description: "Configuration File" },
  ".conf": { language: "ini", type: "code", description: "Configuration File" },
  ".env": { language: "bash", type: "code", description: "Environment Variables" },
  ".xml": { language: "xml", type: "code", description: "XML Document" },
  ".svg": { language: "xml", type: "code", description: "SVG Vector Image" },
  ".html": { language: "html", type: "code", description: "HTML Document" },
  ".htm": { language: "html", type: "code", description: "HTML Document" },
  ".css": { language: "css", type: "code", description: "CSS Stylesheet" },
  ".scss": { language: "scss", type: "code", description: "SCSS Stylesheet" },
  ".sass": { language: "scss", type: "code", description: "SASS Stylesheet" },
  ".less": { language: "less", type: "code", description: "LESS Stylesheet" },

  // Programming Languages
  ".py": { language: "python", type: "code", description: "Python Script" },
  ".pyw": { language: "python", type: "code", description: "Python Script" },
  ".rs": { language: "rust", type: "code", description: "Rust Source" },
  ".go": { language: "go", type: "code", description: "Go Source" },
  ".c": { language: "c", type: "code", description: "C Source" },
  ".h": { language: "c", type: "code", description: "C/C++ Header" },
  ".cpp": { language: "cpp", type: "code", description: "C++ Source" },
  ".cxx": { language: "cpp", type: "code", description: "C++ Source" },
  ".cc": { language: "cpp", type: "code", description: "C++ Source" },
  ".hpp": { language: "cpp", type: "code", description: "C++ Header" },
  ".cs": { language: "csharp", type: "code", description: "C# Source" },
  ".java": { language: "java", type: "code", description: "Java Source" },
  ".kt": { language: "kotlin", type: "code", description: "Kotlin Source" },
  ".kts": { language: "kotlin", type: "code", description: "Kotlin Script" },
  ".swift": { language: "swift", type: "code", description: "Swift Source" },
  ".php": { language: "php", type: "code", description: "PHP Script" },
  ".rb": { language: "ruby", type: "code", description: "Ruby Script" },
  ".sql": { language: "sql", type: "code", description: "SQL Query" },
  ".lua": { language: "lua", type: "code", description: "Lua Script" },
  ".r": { language: "r", type: "code", description: "R Script" },
  ".dart": { language: "dart", type: "code", description: "Dart Source" },
  // highlight.js não tem gramática de Zig: exibido como código sem realce
  ".zig": { language: "plaintext", type: "code", description: "Zig Source" },

  // Shell & Scripts
  ".sh": { language: "bash", type: "code", description: "Shell Script" },
  ".bash": { language: "bash", type: "code", description: "Bash Script" },
  ".zsh": { language: "bash", type: "code", description: "Zsh Script" },
  ".fish": { language: "bash", type: "code", description: "Fish Script" },
  ".bat": { language: "dos", type: "code", description: "Batch Script" },
  ".cmd": { language: "dos", type: "code", description: "Command Script" },
  ".ps1": { language: "powershell", type: "code", description: "PowerShell Script" },
  ".psm1": { language: "powershell", type: "code", description: "PowerShell Module" },

  // Plain Text & Logs
  ".txt": { language: "plaintext", type: "text", description: "Plain Text" },
  ".log": { language: "plaintext", type: "text", description: "Log File" },
  ".csv": { language: "plaintext", type: "text", description: "CSV Data" },
  ".tsv": { language: "plaintext", type: "text", description: "TSV Data" },
  ".diff": { language: "diff", type: "code", description: "Diff Patch" },
  ".patch": { language: "diff", type: "code", description: "Diff Patch" },
};

const FILENAME_LANGUAGE_MAP: Record<string, { language: string; type: FileType; description: string }> = {
  dockerfile: { language: "dockerfile", type: "code", description: "Dockerfile" },
  containerfile: { language: "dockerfile", type: "code", description: "Containerfile" },
  makefile: { language: "makefile", type: "code", description: "Makefile" },
  license: { language: "plaintext", type: "text", description: "License Document" },
  "license.md": { language: "markdown", type: "markdown", description: "License Markdown" },
  "license.txt": { language: "plaintext", type: "text", description: "License Document" },
  gemfile: { language: "ruby", type: "code", description: "Ruby Gemfile" },
  vagrantfile: { language: "ruby", type: "code", description: "Vagrantfile" },
  procfile: { language: "yaml", type: "code", description: "Procfile" },
};

/**
 * Arquivos criados automaticamente pelo sistema (Windows Explorer, Finder).
 * Nunca devem ser escolhidos como o "arquivo principal" de uma pasta:
 * sem este filtro, abrir uma pasta ou criar um arquivo novo no Desktop
 * abre o `desktop.ini` em vez do comportamento esperado.
 */
const SYSTEM_FILENAMES = new Set([
  "desktop.ini",
  "thumbs.db",
  "ehthumbs.db",
  "ehthumbs_vista.db",
  ".ds_store",
]);

export function isSystemFileName(fileName: string): boolean {
  return SYSTEM_FILENAMES.has(basename(fileName).toLowerCase());
}

/**
 * Exibe o banner inicial do MarkiiDown no terminal
 */
export function printBanner(): void {
  console.log(
    pc.cyan(`
  __  __            _    _ _ _____                     
 |  \\/  |          | |  (_|_)  __ \\                    
 | \\  / | __ _ _ __| | ___ _| |  | | _____      ___ __ 
 | |\\/| |/ _\` | '__| |/ / | | |  | |/ _ \\ \\ /\\ / / '_ \\ 
 | |  | | (_| | |  |   <| | | |__| | (_) \\ V  V /| | | |
 |_|  |_|\\__,_|_|  |_|\\_\\_|_|_____/ \\___/ \\_/\\_/ |_| |_|
    `) +
      pc.dim("  Visualizador & Editor Universal de Arquivos e Markdown (Bun/TypeScript)\n")
  );
}

/**
 * Verifica se um buffer representa conteúdo binário (ex: imagens, executáveis, zip)
 */
export function isBinaryBuffer(buffer: Uint8Array | Buffer): boolean {
  const checkLength = Math.min(buffer.length, 8192);
  if (checkLength === 0) return false;

  let nonPrintableCount = 0;
  for (let i = 0; i < checkLength; i++) {
    const byte = buffer[i];
    // Byte nulo ou caracteres de controle não convencionais para texto
    if (byte === 0) return true;
    if (byte < 7 || (byte > 14 && byte < 32 && byte !== 27)) {
      nonPrintableCount++;
    }
  }

  return nonPrintableCount / checkLength > 0.3;
}

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff",
  ".exe", ".dll", ".bin", ".so", ".dylib", ".o", ".a", ".lib",
  ".zip", ".tar", ".gz", ".tgz", ".7z", ".rar", ".bz2", ".xz",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".mp3", ".mp4", ".wav", ".avi", ".mkv", ".mov", ".flac", ".ogg",
  ".wasm", ".iso", ".img", ".dmg", ".ttf", ".otf", ".woff", ".woff2",
]);

/**
 * Detecta o tipo de arquivo, linguagem para syntax highlighting e descrição
 */
export function detectFileType(filePath: string, sampleBuffer?: Uint8Array | Buffer): FileTypeInfo {
  const fileName = basename(filePath).toLowerCase();
  const extension = extname(filePath).toLowerCase();

  // 1. Checagem por extensões binárias conhecidas
  if (BINARY_EXTENSIONS.has(extension)) {
    return {
      type: "binary",
      language: "binary",
      isBinary: true,
      description: `Binary (${extension.toUpperCase().slice(1)})`,
    };
  }

  // 2. Checagem por nome exato de arquivo
  if (FILENAME_LANGUAGE_MAP[fileName]) {
    const info = FILENAME_LANGUAGE_MAP[fileName];
    return { ...info, isBinary: false };
  }

  // 3. Checagem por extensão de texto/código conhecida
  if (EXTENSION_LANGUAGE_MAP[extension]) {
    const info = EXTENSION_LANGUAGE_MAP[extension];
    return { ...info, isBinary: false };
  }

  // 4. Checagem por buffer de amostra ou leitura rápida
  let isBinary = false;
  if (sampleBuffer) {
    isBinary = isBinaryBuffer(sampleBuffer);
  } else if (existsSync(filePath)) {
    try {
      const stats = statSync(filePath);
      if (stats.isFile() && stats.size > 0) {
        const buffer = readFileSync(filePath);
        isBinary = isBinaryBuffer(buffer);
      }
    } catch {}
  }

  if (isBinary) {
    return {
      type: "binary",
      language: "binary",
      isBinary: true,
      description: "Binary File",
    };
  }


  // Padrão para arquivos de texto sem extensão reconhecida
  return {
    type: "text",
    language: "plaintext",
    isBinary: false,
    description: "Text Document",
  };
}

/**
 * Informa se o caminho usa uma extensão Markdown suportada.
 */
export function isMarkdownPath(filePath: string): boolean {
  const extension = extname(filePath).toLowerCase();
  return extension === ".md" || extension === ".markdown" || extension === ".mdown" || extension === ".mkd" || extension === ".mdx";
}

/**
 * No Windows, o menu de contexto passa `"%V"`; na raiz de um disco isso vira
 * `"C:\"` e a barra final escapa a aspa, chegando como `C:"`. Aspas não são
 * válidas em caminhos do Windows, então a aspa final volta a ser a barra.
 */
export function fixWindowsTrailingQuote(inputPath: string, platform = process.platform): string {
  if (platform !== "win32" || !inputPath.endsWith('"')) return inputPath;
  return inputPath.slice(0, -1) + "\\";
}

/**
 * Resolve o caminho absoluto de um arquivo fornecido pelo usuário (qualquer formato existente ou novo)
 */
export function resolveTargetFile(inputPath?: string, allowNew = false): string | null {
  if (inputPath) {
    const fullPath = isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath);
    if (!existsSync(fullPath)) {
      if (allowNew && existsSync(dirname(fullPath))) {
        return fullPath;
      }
      return null;
    }

    try {
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        return findFirstReadableFileInDir(fullPath);
      }

      if (stats.isFile()) {
        return fullPath;
      }
    } catch {
      return null;
    }

    return null;
  }

  // Tenta encontrar README.md no diretório atual
  const defaultReadme = resolve(process.cwd(), "README.md");
  if (existsSync(defaultReadme)) {
    try {
      if (statSync(defaultReadme).isFile()) return defaultReadme;
    } catch {}
  }

  // Procura o primeiro arquivo no diretório atual
  return findFirstReadableFileInDir(process.cwd());
}

/**
 * Procura o primeiro arquivo legível dentro de uma pasta (priorizando Markdown, depois código e texto)
 */
function findFirstReadableFileInDir(dirPath: string): string | null {
  try {
    const files = readdirSync(dirPath);
    const validFiles: string[] = [];

    for (const fileName of files) {
      if (fileName.startsWith(".") || fileName === "node_modules" || fileName === "dist" || fileName === "build") {
        continue;
      }
      if (isSystemFileName(fileName)) {
        continue;
      }
      try {
        const full = join(dirPath, fileName);
        if (statSync(full).isFile()) {
          validFiles.push(fileName);
        }
      } catch {}
    }

    // 1. Prioriza README.md
    const readme = validFiles.find((f) => f.toLowerCase() === "readme.md");
    if (readme) return join(dirPath, readme);

    // 2. Prioriza qualquer arquivo Markdown
    const anyMd = validFiles.filter(isMarkdownPath).sort((a, b) => a.localeCompare(b))[0];
    if (anyMd) return join(dirPath, anyMd);

    // 3. Pega o primeiro arquivo de texto ou código suportado
    const anyText = validFiles
      .filter((f) => {
        const info = detectFileType(join(dirPath, f));
        return !info.isBinary;
      })
      .sort((a, b) => a.localeCompare(b))[0];

    if (anyText) return join(dirPath, anyText);

    if (validFiles.length > 0) {
      return join(dirPath, validFiles.sort((a, b) => a.localeCompare(b))[0]);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Gera um caminho livre no estilo do Windows Explorer:
 * "novo.md", "novo (2).md", "novo (3).md", ...
 */
export function getUniqueFilePath(dirPath: string, baseName: string): string {
  const dotIndex = baseName.lastIndexOf(".");
  const stem = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;
  const extension = dotIndex > 0 ? baseName.slice(dotIndex) : "";
  let candidate = join(dirPath, baseName);
  let counter = 2;
  while (existsSync(candidate)) {
    candidate = join(dirPath, `${stem} (${counter})${extension}`);
    counter++;
  }
  return candidate;
}

/**
 * Resolve o alvo para a criação de um arquivo novo:
 * - sem argumento: "novo.md" (com nome único) na pasta atual;
 * - pasta existente: "novo.md" (com nome único) dentro dela;
 * - caminho inexistente com pasta-mãe válida: usa o caminho como está;
 * - arquivo existente: gera um nome irmão único ("arquivo (2).md").
 * Retorna null quando a pasta-mãe não existe.
 */
export function resolveNewFileTarget(inputPath?: string, defaultName = "novo.md"): string | null {
  if (!inputPath) {
    return getUniqueFilePath(process.cwd(), defaultName);
  }

  const fullPath = isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath);
  try {
    if (existsSync(fullPath)) {
      if (statSync(fullPath).isDirectory()) {
        return getUniqueFilePath(fullPath, defaultName);
      }
      return getUniqueFilePath(dirname(fullPath), basename(fullPath));
    }
  } catch {
    return null;
  }

  if (existsSync(dirname(fullPath))) {
    return fullPath;
  }
  return null;
}

/**
 * Lista todos os arquivos legíveis de um diretório
 */
export function listSupportedFilesInDir(dirPath: string): FileInfo[] {
  const result: FileInfo[] = [];
  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules" || entry === "dist" || entry === "build") continue;
      if (isSystemFileName(entry)) continue;
      const fullPath = join(dirPath, entry);
      try {
        const stats = statSync(fullPath);
        if (stats.isFile()) {
          const typeInfo = detectFileType(fullPath);
          result.push({
            name: entry,
            relativePath: entry,
            absolutePath: fullPath,
            sizeBytes: stats.size,
            updatedAt: stats.mtime,
            typeInfo,
          });
        }
      } catch {}
    }
  } catch {
    return [];
  }

  return result.sort((a, b) => {
    if (a.name.toLowerCase() === "readme.md") return -1;
    if (b.name.toLowerCase() === "readme.md") return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Mantém compatibilidade com funções antigas de listagem de markdown
 */
export function listMarkdownFilesInDir(dirPath: string): FileInfo[] {
  return listSupportedFilesInDir(dirPath).filter((f) => isMarkdownPath(f.name));
}

/**
 * Formata bytes para leitura humana
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Calcula tempo estimado de leitura
 */
export function calculateReadingTime(text: string): { words: number; minutes: number } {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));
  return { words, minutes };
}

/**
 * Largura de uma tabulação no leitor e no editor de terminal
 */
export const TAB_SIZE = 4;

/**
 * Linguagens sem gramática própria no highlight.js, realçadas com a
 * gramática mais próxima. O terminal (cli-highlight, highlight.js 10) e o
 * HTML (highlight.js 11) conhecem conjuntos diferentes de linguagens; os
 * apelidos fazem os dois colorirem os mesmos blocos.
 */
const LANGUAGE_FALLBACKS: Record<string, string> = {
  jsonc: "json",
  json5: "json",
  sass: "scss",
  vue: "xml",
  svelte: "xml",
};

/**
 * Resolve o identificador de linguagem para um que o motor de realce
 * conhece. Retorna undefined quando não há gramática: o bloco deve então
 * ficar neutro, sem chamar o motor (que imprimiria um aviso no terminal).
 */
export function resolveHighlightLanguage(
  language: string | undefined,
  isSupported: (name: string) => boolean
): string | undefined {
  const normalized = language?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!normalized || normalized === "plaintext") return undefined;
  if (isSupported(normalized)) return normalized;

  const fallback = LANGUAGE_FALLBACKS[normalized];
  return fallback && isSupported(fallback) ? fallback : undefined;
}
