import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { convertFileToStaticHtml } from "../src/html-template.ts";
import { stripAnsi } from "../src/interactive.ts";
import { getRenderedFileLines } from "../src/terminal.ts";
import { detectFileType } from "../src/utils.ts";

describe("syntax highlighting across languages", () => {
  const samples = [
    { file: "exemplos/app.ts", lang: "typescript", hasSymbol: "UserManager" },
    { file: "exemplos/script.py", lang: "python", hasSymbol: "DataPipeline" },
    { file: "exemplos/main.rs", lang: "rust", hasSymbol: "Cache" },
    { file: "exemplos/server.go", lang: "go", hasSymbol: "handleHealth" },
    { file: "exemplos/query.sql", lang: "sql", hasSymbol: null },
    { file: "exemplos/config.yaml", lang: "yaml", hasSymbol: null },
    { file: "exemplos/Dockerfile", lang: "dockerfile", hasSymbol: null },
    { file: "exemplos/programa.cpp", lang: "cpp", hasSymbol: "VectorUtils" },
  ];

  for (const sample of samples) {
    test(`detecta e renderiza sintaxe de ${sample.file}`, async () => {
      const fullPath = resolve(process.cwd(), sample.file);

      // 1. Detecção de Tipo e Linguagem
      const typeInfo = detectFileType(fullPath);
      expect(typeInfo.language).toBe(sample.lang);
      expect(typeInfo.type).toBe("code");

      // 2. Renderização no Terminal
      const result = await getRenderedFileLines(fullPath);
      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.typeInfo.language).toBe(sample.lang);

      // Verifica numeração de linhas
      const firstLinePlain = stripAnsi(result.lines[0]);
      expect(firstLinePlain).toContain("1 │");

      // Verifica extração de símbolos (se aplicável)
      if (sample.hasSymbol) {
        const found = result.tableOfContents.some((item) => item.title.includes(sample.hasSymbol!));
        expect(found).toBe(true);
      }

      // 3. Exportação para HTML
      const rawText = await Bun.file(fullPath).text();
      const html = convertFileToStaticHtml(rawText, fullPath);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("hljs");
      expect(html).toContain("code-container");
    });
  }
});
