import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, extname } from "node:path";
import pc from "picocolors";

export interface FileInfo {
  name: string;
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  updatedAt: Date;
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
      pc.dim("  Leitor de Markdown 100% Standalone em TypeScript com Bun\n")
  );
}

/**
 * Resolve o caminho absoluto de um arquivo fornecido pelo usuário
 */
export function resolveTargetFile(inputPath?: string): string | null {
  if (inputPath) {
    const fullPath = isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath);
    if (existsSync(fullPath)) {
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        const found = findFirstMarkdownInDir(fullPath);
        if (found) return found;
      } else {
        return fullPath;
      }
    }
  }

  // Tenta encontrar README.md no diretório atual
  const defaultReadme = resolve(process.cwd(), "README.md");
  if (existsSync(defaultReadme)) {
    return defaultReadme;
  }

  // Procura o primeiro arquivo .md na pasta atual
  const firstMd = findFirstMarkdownInDir(process.cwd());
  if (firstMd) {
    return firstMd;
  }

  return null;
}

/**
 * Procura o primeiro arquivo .md dentro de uma pasta
 */
function findFirstMarkdownInDir(dirPath: string): string | null {
  try {
    const files = readdirSync(dirPath);
    const readme = files.find((f) => f.toLowerCase() === "readme.md");
    if (readme) return join(dirPath, readme);

    const anyMd = files.find((f) => extname(f).toLowerCase() === ".md");
    if (anyMd) return join(dirPath, anyMd);
  } catch {
    return null;
  }
  return null;
}

/**
 * Lista todos os arquivos .md de um diretório
 */
export function listMarkdownFilesInDir(dirPath: string): FileInfo[] {
  const result: FileInfo[] = [];
  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules" || entry === "dist") continue;
      const fullPath = join(dirPath, entry);
      try {
        const stats = statSync(fullPath);
        if (stats.isFile() && extname(entry).toLowerCase() === ".md") {
          result.push({
            name: entry,
            relativePath: entry,
            absolutePath: fullPath,
            sizeBytes: stats.size,
            updatedAt: stats.mtime,
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
 * Formata bytes para leitura humana
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Calcula tempo estimado de leitura
 */
export function calculateReadingTime(text: string): { words: number; minutes: number } {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return { words, minutes };
}
