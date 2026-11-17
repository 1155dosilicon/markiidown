import { chmodSync, closeSync, fsyncSync, openSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Grava o arquivo sem risco de deixá-lo pela metade.
 *
 * Gravar direto por cima (o que o editor fazia) apaga o conteúdo antigo antes
 * de escrever o novo: se o disco encher ou o processo cair no meio, sobra um
 * arquivo truncado. Aqui o conteúdo novo vai para um temporário na mesma
 * pasta e só então substitui o original, de uma vez:
 *
 * - Windows: `ReplaceFileW`, que mantém atributos (oculto, somente leitura),
 *   data de criação, permissões (ACL) e fluxos alternativos do original;
 * - outros sistemas: `rename`, copiando antes as permissões do original.
 *
 * Links simbólicos são seguidos (o alvo é atualizado, o link continua link).
 * Se a substituição não for possível (pasta sem permissão de escrita, por
 * exemplo), grava direto no arquivo, como antes. Arquivos novos são criados
 * diretamente.
 */
export function writeFileSafely(filePath: string, data: Uint8Array): void {
  let target = filePath;
  try {
    target = realpathSync(filePath);
  } catch {
    // Arquivo ainda não existe
  }

  let exists = false;
  try {
    exists = statSync(target).isFile();
  } catch {}
  if (!exists) {
    writeFileSync(target, data);
    return;
  }

  const temporary = join(dirname(target), `.${basename(target)}.${process.pid}-${Date.now()}.markiidown-tmp`);
  try {
    const fd = openSync(temporary, "wx");
    try {
      let offset = 0;
      while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }

    if (process.platform === "win32") {
      if (!replaceFileWindows(target, temporary)) throw new Error("ReplaceFileW falhou");
    } else {
      try {
        chmodSync(temporary, statSync(target).mode & 0o7777);
      } catch {}
      renameSync(temporary, target);
    }
  } catch {
    try {
      rmSync(temporary, { force: true });
    } catch {}
    // Último recurso: grava por cima (lança o erro real, se houver)
    writeFileSync(target, data);
  }
}

type ReplaceFile = (replaced: Uint8Array, replacement: Uint8Array) => boolean;
let replaceFileImplementation: ReplaceFile | null | undefined;

/** Exportada para os testes conferirem que a chamada ao Windows funciona. */
export function replaceFileWindows(replaced: string, replacement: string): boolean {
  if (replaceFileImplementation === undefined) {
    try {
      const { dlopen, FFIType } = require("bun:ffi") as typeof import("bun:ffi");
      const kernel32 = dlopen("kernel32.dll", {
        ReplaceFileW: {
          args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr],
          returns: FFIType.i32,
        },
      });
      replaceFileImplementation = (target, source) => kernel32.symbols.ReplaceFileW(target, source, null, 0, null, null) !== 0;
    } catch {
      replaceFileImplementation = null;
    }
  }
  if (!replaceFileImplementation) return false;
  const wide = (value: string) => new Uint8Array(Buffer.from(value + "\0", "utf16le"));
  return replaceFileImplementation(wide(replaced), wide(replacement));
}
