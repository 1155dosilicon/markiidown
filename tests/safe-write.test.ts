import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replaceFileWindows, writeFileSafely } from "../src/safe-write.ts";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "markiidown-safe-"));
  directories.push(directory);
  return directory;
}

const bytes = (text: string) => new TextEncoder().encode(text);

describe("writeFileSafely", () => {
  test("substitui o conteúdo e não deixa arquivo temporário para trás", () => {
    const directory = tempDir();
    const file = join(directory, "nota.md");
    writeFileSync(file, "versão antiga, bem mais comprida que a nova");
    writeFileSafely(file, bytes("nova"));
    expect(readFileSync(file, "utf8")).toBe("nova");
    expect(readdirSync(directory)).toEqual(["nota.md"]);
  });

  test("cria arquivo novo", () => {
    const file = join(tempDir(), "novo.txt");
    writeFileSafely(file, bytes("oi"));
    expect(readFileSync(file, "utf8")).toBe("oi");
  });

  test.skipIf(process.platform !== "win32")("no Windows usa ReplaceFileW (troca atômica) com sucesso", () => {
    const directory = tempDir();
    const target = join(directory, "alvo.txt");
    const replacement = join(directory, "novo.tmp");
    writeFileSync(target, "antigo");
    writeFileSync(replacement, "novo");
    expect(replaceFileWindows(target, replacement)).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("novo");
    expect(existsSync(replacement)).toBe(false);
  });

  test.skipIf(process.platform !== "win32")("mantém o atributo 'oculto' do arquivo original", async () => {
    const file = join(tempDir(), "oculto.txt");
    writeFileSync(file, "a");
    const attrib = (...args: string[]) => Bun.spawn(["attrib", ...args], { stdout: "pipe", stderr: "ignore" });
    await attrib("+h", file).exited;
    writeFileSafely(file, bytes("b"));
    const output = await new Response(attrib(file).stdout).text();
    expect(readFileSync(file, "utf8")).toBe("b");
    expect(output.slice(0, 12)).toContain("H");
    await attrib("-h", file).exited;
  });
});
