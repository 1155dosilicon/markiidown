import { readFileSync } from "node:fs";

/**
 * Leitura e gravação de arquivos de texto preservando a codificação original.
 *
 * Antes, todo arquivo era lido como UTF-8. Um .txt salvo como "ANSI" pelo
 * Bloco de Notas (Windows-1252, padrão do Windows em português) tinha cada
 * acento trocado por U+FFFD, e o Ctrl+S do editor gravava essa troca no
 * disco, destruindo o texto. O BOM do UTF-8 e a codificação UTF-16 também
 * eram descartados em silêncio ao salvar.
 */
export type TextEncodingName = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" | "windows-1252";

export interface DecodedText {
  text: string;
  encoding: TextEncodingName;
}

export const ENCODING_LABELS: Record<TextEncodingName, string> = {
  "utf-8": "UTF-8",
  "utf-8-bom": "UTF-8 com BOM",
  "utf-16le": "UTF-16 LE",
  "utf-16be": "UTF-16 BE",
  "windows-1252": "Windows-1252 (ANSI)",
};

export class UnrepresentableTextError extends Error {
  constructor(public readonly character: string, encoding: TextEncodingName) {
    super(`O caractere "${character}" não existe na codificação ${ENCODING_LABELS[encoding]}.`);
    this.name = "UnrepresentableTextError";
  }
}

const utf8Strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const windows1252Decoder = new TextDecoder("windows-1252");

/** Bytes 0x80–0xFF do Windows-1252 → caractere Unicode, e o mapa inverso. */
const WINDOWS_1252_ENCODE_MAP: Map<number, number> = (() => {
  const map = new Map<number, number>();
  for (let byte = 0; byte <= 0xff; byte++) {
    const codePoint = windows1252Decoder.decode(new Uint8Array([byte])).codePointAt(0)!;
    map.set(codePoint, byte);
  }
  return map;
})();

/**
 * Detecta a codificação pelos bytes: BOM explícito, depois UTF-8 válido;
 * qualquer outra coisa é tratada como Windows-1252 (ANSI do Windows em
 * português), que aceita todos os 256 valores de byte.
 */
export function decodeTextBuffer(bytes: Uint8Array): DecodedText {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8-bom" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  }
  try {
    return { text: utf8Strict.decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: windows1252Decoder.decode(bytes), encoding: "windows-1252" };
  }
}

/**
 * Codifica o texto de volta na codificação original do arquivo.
 * Lança UnrepresentableTextError quando o texto tem um caractere que a
 * codificação não suporta (ex.: emoji em um arquivo Windows-1252).
 */
export function encodeText(text: string, encoding: TextEncodingName): Uint8Array {
  switch (encoding) {
    case "utf-8":
      return Buffer.from(text, "utf-8");
    case "utf-8-bom":
      return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf-8")]);
    case "utf-16le":
      return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
    case "utf-16be": {
      const body = Buffer.from(text, "utf16le");
      body.swap16();
      return Buffer.concat([Buffer.from([0xfe, 0xff]), body]);
    }
    case "windows-1252": {
      const output = new Uint8Array(text.length);
      let length = 0;
      for (const character of text) {
        const byte = WINDOWS_1252_ENCODE_MAP.get(character.codePointAt(0)!);
        if (byte === undefined) throw new UnrepresentableTextError(character, encoding);
        output[length++] = byte;
      }
      return output.subarray(0, length);
    }
  }
}

export function readTextFileSync(filePath: string): DecodedText {
  return decodeTextBuffer(readFileSync(filePath));
}

export async function readTextFile(filePath: string): Promise<DecodedText> {
  return decodeTextBuffer(new Uint8Array(await Bun.file(filePath).arrayBuffer()));
}

/**
 * Indica se o texto mistura finais de linha CRLF e LF. O editor trabalha com
 * um único final de linha e normaliza o arquivo ao salvar.
 */
export function hasMixedLineEndings(text: string): boolean {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length;
  return crlf > 0 && crlf < lf;
}
