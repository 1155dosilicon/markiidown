import packageJson from "../package.json" with { type: "json" };

/**
 * Versão única do MarkiiDown, lida do package.json (o Bun embute o JSON no
 * executável compilado). Antes ela era repetida à mão em três arquivos.
 */
export const VERSION: string = packageJson.version;

/** Formato de quatro partes exigido pelo recurso de versão do .exe (ex.: 2.0.0.0). */
export function toWindowsFileVersion(version = VERSION): string {
  const parts = version.split(/[.+-]/).slice(0, 4).map((part) => (/^\d+$/.test(part) ? part : "0"));
  while (parts.length < 4) parts.push("0");
  return parts.join(".");
}
