import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import pc from "picocolors";

export const MARKIIDOWN_DOCUMENT_CLASS = "MarkiiDown.Document";
export const MARKIIDOWN_SOFTWARE_KEY = "HKCU\\Software\\MarkiiDown";
export const MARKIIDOWN_BACKUP_KEY = "HKCU\\Software\\MarkiiDown\\Backup";
const LEGACY_APP_KEY_NAME = "markiidown.exe";
const MANAGED_EXTENSIONS = [".md", ".markdown"];

/**
 * Notifica o Windows Explorer para recarregar associações e ícones imediatamente
 */
export async function notifyWindowsShell(): Promise<void> {
  try {
    const proc = Bun.spawn(["ie4uinit.exe", "-show"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    // Não bloqueia caso o ie4uinit demore para responder no Windows
    proc.unref();
  } catch {}
}

/**
 * Quota valores de ícone para que caminhos com espaços funcionem:
 * `"C:\...\markiidown.ico"` ou `"C:\...\markiidown.exe",0`.
 * Função pura para permitir testes fora do Windows.
 */
export function formatIconValue(iconTarget: string): string {
  const indexed = iconTarget.match(/^(.*),(\d+)$/);
  if (indexed) {
    const filePart = indexed[1].startsWith('"') ? indexed[1] : `"${indexed[1]}"`;
    return `${filePart},${indexed[2]}`;
  }
  if (iconTarget.startsWith('"')) return iconTarget;
  return `"${iconTarget}"`;
}

/**
 * Extrai o valor `(Default)` da saída de `reg query <chave> /ve`.
 * Retorna null quando a linha não existe. Função pura (testável no Linux).
 */
export function parseRegDefaultValue(output: string): string | null {
  const match = output.match(/^[ \t]*\(Default\)[ \t]+REG_\S+[ \t]*(.*)$/mi);
  if (!match) return null;
  return match[1].trim();
}

/**
 * Extrai um valor nomeado da saída de `reg query <chave> /v <nome>`.
 * Retorna null quando a linha não existe. Função pura (testável no Linux).
 */
export function parseRegNamedValue(output: string, valueName: string): string | null {
  const escaped = valueName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`^[ \\t]*${escaped}[ \\t]+REG_\\S+[ \\t]*(.*)$`, "mi"));
  if (!match) return null;
  return match[1].trim();
}

/**
 * Lista as subchaves na saída de `reg query <chave>`
 * (a primeira linha é a própria chave consultada).
 * Função pura (testável no Linux).
 */
export function parseRegSubkeys(output: string): string[] {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];
  return lines.slice(1);
}

export interface ContextMenuTargets {
  exePath: string;
  iconValue: string;
  appKeyName: string;
}

/**
 * Monta todos os comandos `reg add` da integração com o Explorer.
 * Função pura (testável no Linux): nenhum efeito colateral aqui.
 *
 * Placeholders do Explorer usados:
 * - `%1`: item clicado (arquivo ou pasta sob o cursor);
 * - `%V`: pasta do clique no fundo (funciona em Directory\Background
 *   e em DesktopBackground — é assim que "Novo arquivo" sabe onde criar).
 */
export function buildRegisterCommands({ exePath, iconValue, appKeyName }: ContextMenuTargets): string[][] {
  const supportedExtensions = [
    ".md", ".markdown", ".txt", ".json", ".js", ".jsx", ".ts", ".tsx",
    ".py", ".rs", ".go", ".c", ".cpp", ".h", ".hpp", ".html", ".css",
    ".yaml", ".yml", ".toml", ".sh", ".bash", ".sql", ".xml", ".log"
  ];

  const appKey = `HKCU\\Software\\Classes\\Applications\\${appKeyName}`;

  const commands: string[][] = [
    // 1. Menu de contexto universal para qualquer arquivo (*)
    ["reg", "add", "HKCU\\Software\\Classes\\*\\shell\\MarkiiDown", "/ve", "/d", "Abrir com MarkiiDown", "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\*\\shell\\MarkiiDown", "/v", "Icon", "/d", iconValue, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\*\\shell\\MarkiiDown\\command", "/ve", "/d", `"${exePath}" "%1"`, "/f"],

    // 2. Registra como aplicativo reconhecido na lista "Abrir com..." do Windows
    ["reg", "add", appKey, "/v", "FriendlyAppName", "/d", "MarkiiDown (Leitor & Editor Universal)", "/f"],
    ["reg", "add", appKey, "/v", "ApplicationCompany", "/d", "MarkiiDown", "/f"],
    ["reg", "add", `${appKey}\\DefaultIcon`, "/ve", "/d", iconValue, "/f"],
    ["reg", "add", `${appKey}\\shell\\open\\command`, "/ve", "/d", `"${exePath}" "%1"`, "/f"],
    ["reg", "add", `${appKey}\\shell\\edit\\command`, "/ve", "/d", `"${exePath}" "%1" --edit`, "/f"],

    // 3. Menu "Novo" (New) do Windows Explorer para criar arquivos Markdown (.md)
    ["reg", "add", "HKCU\\Software\\Classes\\.md", "/ve", "/d", MARKIIDOWN_DOCUMENT_CLASS, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\.md\\ShellNew", "/v", "NullFile", "/d", "", "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\.markdown", "/ve", "/d", MARKIIDOWN_DOCUMENT_CLASS, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\.markdown\\ShellNew", "/v", "NullFile", "/d", "", "/f"],
    ["reg", "add", `HKCU\\Software\\Classes\\${MARKIIDOWN_DOCUMENT_CLASS}`, "/ve", "/d", "Documento Markdown", "/f"],
    ["reg", "add", `HKCU\\Software\\Classes\\${MARKIIDOWN_DOCUMENT_CLASS}`, "/v", "FriendlyTypeName", "/d", "Documento Markdown", "/f"],
    ["reg", "add", `HKCU\\Software\\Classes\\${MARKIIDOWN_DOCUMENT_CLASS}\\DefaultIcon`, "/ve", "/d", iconValue, "/f"],
    ["reg", "add", `HKCU\\Software\\Classes\\${MARKIIDOWN_DOCUMENT_CLASS}\\shell\\open\\command`, "/ve", "/d", `"${exePath}" "%1"`, "/f"],
    ["reg", "add", `HKCU\\Software\\Classes\\${MARKIIDOWN_DOCUMENT_CLASS}\\shell\\edit\\command`, "/ve", "/d", `"${exePath}" "%1" --edit`, "/f"],

    // 4. Menu ao clicar SOBRE o ícone de uma pasta
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDown", "/ve", "/d", "Abrir pasta com MarkiiDown", "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDown", "/v", "Icon", "/d", iconValue, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDown\\command", "/ve", "/d", `"${exePath}" "%1"`, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDownNew", "/ve", "/d", "Novo arquivo com MarkiiDown", "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDownNew", "/v", "Icon", "/d", iconValue, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDownNew\\command", "/ve", "/d", `"${exePath}" "%1\\novo.md" --new`, "/f"],

    // 5. Menu ao clicar com botão direito no FUNDO de pastas
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDown", "/ve", "/d", "Abrir pasta com MarkiiDown", "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDown", "/v", "Icon", "/d", iconValue, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDown\\command", "/ve", "/d", `"${exePath}" "%V"`, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew", "/ve", "/d", "Novo arquivo com MarkiiDown", "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew", "/v", "Icon", "/d", iconValue, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew\\command", "/ve", "/d", `"${exePath}" "%V\\novo.md" --new`, "/f"],

    // 6. Menu ao clicar com botão direito no fundo do DESKTOP.
    // Usa "%V\novo.md" como nas pastas: sem o caminho, o programa abria
    // um arquivo existente ao acaso (o desktop.ini) em vez de criar um novo.
    ["reg", "add", "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDown", "/ve", "/d", "Abrir pasta com MarkiiDown", "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDown", "/v", "Icon", "/d", iconValue, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDown\\command", "/ve", "/d", `"${exePath}" "%V"`, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDownNew", "/ve", "/d", "Novo arquivo com MarkiiDown", "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDownNew", "/v", "Icon", "/d", iconValue, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDownNew\\command", "/ve", "/d", `"${exePath}" "%V\\novo.md" --new`, "/f"],
  ];

  for (const ext of supportedExtensions) {
    commands.push(["reg", "add", `${appKey}\\SupportedTypes`, "/v", ext, "/d", "", "/f"]);
  }

  return commands;
}

/**
 * Lista todas as chaves criadas pela integração, para remoção completa.
 * Inclui a chave de software (backups) — que deve ser apagada DEPOIS
 * de restaurar as associações — e as chaves de aplicativo informadas.
 * Função pura (testável no Linux).
 */
export function buildKeysToDelete(appKeyNames: string[]): string[] {
  return [
    "HKCU\\Software\\Classes\\*\\shell\\MarkiiDown",
    "HKCU\\Software\\Classes\\.md\\ShellNew",
    "HKCU\\Software\\Classes\\.markdown\\ShellNew",
    `HKCU\\Software\\Classes\\${MARKIIDOWN_DOCUMENT_CLASS}`,
    "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDown",
    "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDownNew",
    "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDown",
    "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew",
    "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDown",
    "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDownNew",
    ...appKeyNames.map((name) => `HKCU\\Software\\Classes\\Applications\\${name}`),
    MARKIIDOWN_SOFTWARE_KEY,
  ];
}

async function runReg(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function queryRegDefault(key: string): Promise<string | null> {
  try {
    const { exitCode, stdout } = await runReg(["reg", "query", key, "/ve"]);
    if (exitCode !== 0) return null;
    const value = parseRegDefaultValue(stdout);
    return value === "" || value === null ? null : value;
  } catch {
    return null;
  }
}

/**
 * Guarda a associação anterior da extensão antes de sobrescrevê-la,
 * para que o uninstall restaure o estado original do usuário.
 */
async function backupExtensionAssociation(extension: string): Promise<void> {
  const previous = await queryRegDefault(`HKCU\\Software\\Classes\\${extension}`);
  await runReg(["reg", "add", MARKIIDOWN_BACKUP_KEY, "/v", extension, "/d", previous ?? "", "/f"]);
}

/**
 * Restaura a associação anterior da extensão. Só toca no Registro quando
 * o valor atual ainda é o nosso — se o usuário mudou a associação depois
 * da instalação, a escolha dele é preservada.
 */
async function restoreExtensionAssociation(extension: string): Promise<boolean> {
  const classesKey = `HKCU\\Software\\Classes\\${extension}`;
  const current = await queryRegDefault(classesKey);
  if (current !== MARKIIDOWN_DOCUMENT_CLASS) return true;

  let backup: string | null = null;
  try {
    const result = await runReg(["reg", "query", MARKIIDOWN_BACKUP_KEY, "/v", extension]);
    if (result.exitCode === 0) {
      const parsed = parseRegNamedValue(result.stdout, extension);
      backup = parsed === "" ? null : parsed;
    }
  } catch {}

  if (backup) {
    const result = await runReg(["reg", "add", classesKey, "/ve", "/d", backup, "/f"]);
    return result.exitCode === 0;
  }
  const result = await runReg(["reg", "delete", classesKey, "/ve", "/f"]);
  return result.exitCode === 0;
}

/**
 * Varre Applications\ por chaves cujo comando de abertura aponta para o
 * MarkiiDown. Cobre instalações feitas com o executável renomeado,
 * que não estão sob o nome de chave legado.
 */
async function findMarkiiDownApplicationKeys(): Promise<string[]> {
  const found: string[] = [];
  try {
    const list = await runReg(["reg", "query", "HKCU\\Software\\Classes\\Applications"]);
    if (list.exitCode !== 0) return found;
    for (const subkey of parseRegSubkeys(list.stdout)) {
      try {
        const cmd = await runReg(["reg", "query", `${subkey}\\shell\\open\\command`, "/ve"]);
        if (cmd.exitCode !== 0) continue;
        const command = parseRegDefaultValue(cmd.stdout);
        if (command && command.toLowerCase().includes("markiidown")) {
          found.push(subkey);
        }
      } catch {}
    }
  } catch {}
  return found;
}

/**
 * Registra o MarkiiDown no menu de contexto do Windows e na lista "Abrir com..."
 * Utiliza HKEY_CURRENT_USER (HKCU), dispensando privilégios de Administrador.
 */
export async function registerWindowsContextMenu(customExePath?: string): Promise<boolean> {
  if (process.platform !== "win32") {
    console.error(pc.red("❌ A integração com o menu de contexto é suportada apenas no Windows."));
    return false;
  }

  const exePath = customExePath ? resolve(customExePath) : process.execPath;
  const executableName = basename(exePath).toLowerCase();

  if (!existsSync(exePath)) {
    console.error(pc.red(`❌ Executável não encontrado: ${exePath}`));
    return false;
  }

  if (!customExePath && (executableName === "bun" || executableName === "bun.exe")) {
    console.error(pc.red("❌ O menu de contexto exige o executável standalone. Execute --install ou use o binário compilado."));
    return false;
  }

  const exeDir = dirname(exePath);
  const dedicatedIco = join(exeDir, "markiidown.ico");
  const assetIco = resolve(import.meta.dir, "..", "assets", "icon.ico");
  const iconTarget = existsSync(dedicatedIco)
    ? dedicatedIco
    : existsSync(assetIco)
    ? assetIco
    : `${exePath},0`;
  const iconValue = formatIconValue(iconTarget);
  const appKeyName = basename(exePath);

  console.log(pc.cyan("\n🔧 Registrando MarkiiDown no Windows..."));
  console.log(`${pc.dim("Caminho do Executável:")} ${pc.white(exePath)}`);
  console.log(`${pc.dim("Caminho do Ícone:")}      ${pc.white(iconValue)}`);
  console.log(`${pc.dim("Chave do Aplicativo:")}   ${pc.white(appKeyName)}`);

  // Guarda as associações anteriores de .md/.markdown antes de sobrescrevê-las
  for (const extension of MANAGED_EXTENSIONS) {
    await backupExtensionAssociation(extension);
  }

  const commands = buildRegisterCommands({ exePath, iconValue, appKeyName });

  let success = true;
  for (const cmd of commands) {
    const result = await runReg(cmd);
    if (result.exitCode !== 0) {
      success = false;
      console.warn(pc.yellow(`⚠️ Aviso no registro: ${result.stderr.trim()}`));
    }
  }

  // Notifica o Windows Explorer para atualizar ícones imediatamente
  await notifyWindowsShell();

  if (success) {
    console.log(pc.green("\n🎉 MarkiiDown registrado com sucesso no Windows!"));
    console.log(`\nAgora você pode:`);
    console.log(`  1. Clicar com o ${pc.bold("botão direito")} em qualquer arquivo e escolher ${pc.bold('"Abrir com MarkiiDown"')}.`);
    console.log(`  2. Clicar com o ${pc.bold("botão direito")} ${pc.bold("sobre uma pasta")} -> ${pc.bold('"Abrir pasta com MarkiiDown"')} ou ${pc.bold('"Novo arquivo com MarkiiDown"')}.`);
    console.log(`  3. Clicar com o ${pc.bold("botão direito")} no ${pc.bold("fundo da pasta ou do Desktop")} -> ${pc.bold('"Abrir pasta com MarkiiDown"')} ou ${pc.bold('"Novo arquivo com MarkiiDown"')}.`);
    console.log(`  4. Clicar com o ${pc.bold("botão direito")} -> ${pc.bold('"Novo" -> "Documento Markdown"')}.`);
    console.log(`  5. Ir em ${pc.bold('"Abrir com..."')} -> ${pc.bold("MarkiiDown")} para definir como aplicativo padrão.`);
  }

  return success;
}

/**
 * Remove o MarkiiDown do menu de contexto e da lista "Abrir com...",
 * restaurando as associações de .md/.markdown anteriores à instalação.
 */
export async function unregisterWindowsContextMenu(): Promise<boolean> {
  if (process.platform !== "win32") {
    console.error(pc.red("❌ Apenas suportado no Windows."));
    return false;
  }

  console.log(pc.cyan("\n🗑️ Removendo MarkiiDown do menu de contexto do Windows..."));

  // 1. Restaura as associações anteriores (antes de apagar os backups)
  let success = true;
  for (const extension of MANAGED_EXTENSIONS) {
    if (!(await restoreExtensionAssociation(extension))) {
      success = false;
      console.warn(pc.yellow(`⚠️ Não foi possível restaurar a associação anterior de ${extension}.`));
    }
  }

  // 2. Apaga as chaves criadas pela integração, incluindo restos de
  // instalações com o executável renomeado e a chave de backups
  const sweptKeys = await findMarkiiDownApplicationKeys();
  const keysToDelete = [...new Set([...buildKeysToDelete([LEGACY_APP_KEY_NAME]), ...sweptKeys])];

  for (const key of keysToDelete) {
    const queryProc = Bun.spawn(["reg", "query", key], { stdout: "ignore", stderr: "ignore" });
    if ((await queryProc.exited) !== 0) continue;

    const proc = Bun.spawn(["reg", "delete", key, "/f"], { stdout: "ignore", stderr: "ignore" });
    if ((await proc.exited) !== 0) success = false;
  }

  // Notifica o Windows Explorer para atualizar ícones imediatamente
  await notifyWindowsShell();

  if (success) {
    console.log(pc.green("✅ Registro do MarkiiDown removido com sucesso do Windows!\n"));
  } else {
    console.error(pc.red("❌ Não foi possível remover todas as entradas do Registro.\n"));
  }
  return success;
}
