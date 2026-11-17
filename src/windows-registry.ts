import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pc } from "./colors.ts";

export const MARKIIDOWN_DOCUMENT_CLASS = "MarkiiDown.Document";
export const MARKIIDOWN_SOFTWARE_KEY = "HKCU\\Software\\MarkiiDown";
export const MARKIIDOWN_BACKUP_KEY = "HKCU\\Software\\MarkiiDown\\Backup";
const LEGACY_APP_KEY_NAME = "markiidown.exe";
const MANAGED_EXTENSIONS = [".md", ".markdown"];

/**
 * Avisa o Windows Explorer que as associações de arquivo mudaram, para ele
 * atualizar ícones e menus na hora: `SHChangeNotify(SHCNE_ASSOCCHANGED)`,
 * a forma documentada pela Microsoft, e `ie4uinit -show`, que recarrega o
 * cache de ícones.
 */
export async function notifyWindowsShell(): Promise<void> {
  try {
    const { dlopen, FFIType } = await import("bun:ffi");
    const shell32 = dlopen("shell32.dll", {
      SHChangeNotify: { args: [FFIType.i32, FFIType.u32, FFIType.ptr, FFIType.ptr], returns: FFIType.void },
    });
    try {
      const SHCNE_ASSOCCHANGED = 0x08000000;
      const SHCNF_IDLIST = 0;
      shell32.symbols.SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, null, null);
    } finally {
      shell32.close();
    }
  } catch {}
  try {
    const proc = Bun.spawn(["ie4uinit.exe", "-show"], { stdout: "ignore", stderr: "ignore" });
    // Não bloqueia caso o ie4uinit demore para responder
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
 * Extrai o valor padrão da saída de `reg query <chave>` (SEM `/ve`).
 *
 * O nome do valor padrão é traduzido pelo Windows: `(Default)` em inglês,
 * `(padrão)` em português, `(Predeterminado)` em espanhol... Por isso a linha
 * é reconhecida pelo formato `(qualquer nome)  REG_TIPO  dado`, nunca pela
 * palavra. Também não se usa `/ve`: com ele, um valor padrão inexistente
 * aparece como `(value not set)`/`(valor não definido)`, texto traduzido que
 * era confundido com um valor real. Sem `/ve`, o valor inexistente
 * simplesmente não é listado.
 *
 * Retorna null quando não há valor padrão. Função pura (testável no Linux).
 */
export function parseRegDefaultValue(output: string): string | null {
  const match = output.match(/^[ \t]+\([^)\r\n]*\)[ \t]+REG_[A-Z_]+(?:[ \t]+(.*?))?[ \t]*\r?$/m);
  if (!match) return null;
  return (match[1] ?? "").trim();
}

/**
 * Backups gravados por versões anteriores podiam conter o texto traduzido de
 * "valor não definido" (`(value not set)`, `(valor não definido)`) ou a
 * própria classe do MarkiiDown. Nenhum dos dois é uma associação válida.
 * Função pura (testável no Linux).
 */
export function isUsableBackupValue(value: string | null): value is string {
  if (!value) return false;
  if (value === MARKIIDOWN_DOCUMENT_CLASS) return false;
  return !/^\(.*\)$/.test(value.trim());
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
 * (a primeira linha é a própria chave consultada; linhas de valores, que
 * vêm indentadas, são ignoradas). Função pura (testável no Linux).
 */
export function parseRegSubkeys(output: string): string[] {
  const lines = output
    .split(/\r?\n/)
    .filter((line) => /^HKEY_/i.test(line))
    .map((line) => line.trim());
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
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDownNew", "/ve", "/d", "Novo arquivo com MarkiiDown", "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDownNew", "/v", "Icon", "/d", iconValue, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDownNew\\command", "/ve", "/d", `"${exePath}" "%1\\novo.md" --new`, "/f"],

    // 5. Menu ao clicar com botão direito no FUNDO de pastas
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew", "/ve", "/d", "Novo arquivo com MarkiiDown", "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew", "/v", "Icon", "/d", iconValue, "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew\\command", "/ve", "/d", `"${exePath}" "%V\\novo.md" --new`, "/f"],

    // 6. Menu ao clicar com botão direito no fundo do DESKTOP.
    // Usa "%V\novo.md" como nas pastas: sem o caminho, o programa abria
    // um arquivo existente ao acaso (o desktop.ini) em vez de criar um novo.
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
 * Chaves do antigo item "Abrir pasta com MarkiiDown", que não é mais
 * registrado. São apagadas no --register/--install (para limpar instalações
 * anteriores) e no --uninstall.
 */
export const LEGACY_FOLDER_MENU_KEYS = [
  "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDown",
  "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDown",
  "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDown",
];

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
    "HKCU\\Software\\Classes\\Directory\\shell\\MarkiiDownNew",
    "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew",
    "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDownNew",
    ...LEGACY_FOLDER_MENU_KEYS,
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

/** Valor padrão da chave, ou null se a chave ou o valor não existem (ou é vazio). */
async function queryRegDefault(key: string): Promise<string | null> {
  try {
    // Sem /ve: veja parseRegDefaultValue
    const { exitCode, stdout } = await runReg(["reg", "query", key]);
    if (exitCode !== 0) return null;
    const value = parseRegDefaultValue(stdout);
    return value === "" || value === null ? null : value;
  } catch {
    return null;
  }
}

/**
 * Em um novo --register/--install a extensão já aponta para o MarkiiDown;
 * gravar esse valor sobrescreveria o backup original e o uninstall
 * restauraria a associação para a classe que ele mesmo apaga.
 * Função pura (testável no Linux).
 */
export function shouldBackupAssociation(currentValue: string | null): boolean {
  return currentValue !== MARKIIDOWN_DOCUMENT_CLASS;
}

/**
 * Guarda a associação anterior da extensão antes de sobrescrevê-la,
 * para que o uninstall restaure o estado original do usuário.
 */
async function backupExtensionAssociation(extension: string): Promise<void> {
  const previous = await queryRegDefault(`HKCU\\Software\\Classes\\${extension}`);
  if (!shouldBackupAssociation(previous)) return;
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
      backup = isUsableBackupValue(parsed) ? parsed : null;
    }
  } catch {}

  if (backup) {
    const result = await runReg(["reg", "add", classesKey, "/ve", "/d", backup, "/f"]);
    return result.exitCode === 0;
  }
  // Sem backup, a associação foi criada pela instalação: só apaga o valor.
  // A chave em si é apagada no fim do unregister, se ficar vazia.
  const result = await runReg(["reg", "delete", classesKey, "/ve", "/f"]);
  return result.exitCode === 0;
}

/**
 * Indica se a saída de `reg query <chave>` não lista valores nem subchaves.
 * Função pura (testável no Linux).
 */
export function isRegKeyEmpty(output: string): boolean {
  const hasValue = /^[ \t]+\S.*?[ \t]+REG_[A-Z_]+/m.test(output);
  return !hasValue && parseRegSubkeys(output).length === 0;
}

/**
 * Da saída de `reg query <Applications> /s /f markiidown /d`, extrai as
 * chaves de aplicativo cujo comando de abertura menciona o MarkiiDown.
 * Função pura (testável no Linux).
 */
export function parseApplicationKeysFromSearch(output: string): string[] {
  const found = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^(HKEY_[^\r\n]*\\Applications\\[^\\\r\n]+)\\shell\\open\\command$/i.exec(line.trim());
    if (match) found.add(match[1]);
  }
  return [...found];
}

/**
 * Procura em Applications\ chaves cujo comando de abertura aponta para o
 * MarkiiDown. Cobre instalações feitas com o executável renomeado, que não
 * estão sob o nome de chave padrão. Uma única consulta (`/s /f`), em vez de
 * um `reg query` por aplicativo registrado.
 */
async function findMarkiiDownApplicationKeys(): Promise<string[]> {
  try {
    const search = await runReg(["reg", "query", "HKCU\\Software\\Classes\\Applications", "/s", "/f", "markiidown", "/d"]);
    return search.exitCode === 0 ? parseApplicationKeysFromSearch(search.stdout) : [];
  } catch {
    return [];
  }
}

/** Apaga a chave da extensão se ela ficou vazia (sem valores nem subchaves). */
async function deleteKeyIfEmpty(key: string): Promise<void> {
  const remaining = await runReg(["reg", "query", key]);
  if (remaining.exitCode === 0 && isRegKeyEmpty(remaining.stdout)) {
    await runReg(["reg", "delete", key, "/f"]);
  }
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

  // Ícone: o .ico ao lado do executável (instalação pelo código-fonte) ou o
  // embutido no próprio .exe. Nunca um arquivo da pasta do projeto: ela pode
  // ser apagada e os menus ficariam sem ícone.
  const dedicatedIco = join(dirname(exePath), "markiidown.ico");
  const iconTarget = existsSync(dedicatedIco) ? dedicatedIco : `${exePath},0`;
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

  // Remove o antigo "Abrir pasta com MarkiiDown" deixado por instalações anteriores
  for (const key of LEGACY_FOLDER_MENU_KEYS) {
    const query = await runReg(["reg", "query", key]);
    if (query.exitCode !== 0) continue;
    const removal = await runReg(["reg", "delete", key, "/f"]);
    if (removal.exitCode !== 0) {
      success = false;
      console.warn(pc.yellow(`⚠️ Não foi possível remover a entrada antiga: ${key}`));
    }
  }

  // Notifica o Windows Explorer para atualizar ícones imediatamente
  await notifyWindowsShell();

  if (success) {
    console.log(pc.green("\n🎉 MarkiiDown registrado com sucesso no Windows!"));
    console.log(`\nAgora você pode:`);
    console.log(`  1. Clicar com o ${pc.bold("botão direito")} em qualquer arquivo e escolher ${pc.bold('"Abrir com MarkiiDown"')}.`);
    console.log(`  2. Clicar com o ${pc.bold("botão direito")} ${pc.bold("sobre uma pasta")} -> ${pc.bold('"Novo arquivo com MarkiiDown"')}.`);
    console.log(`  3. Clicar com o ${pc.bold("botão direito")} no ${pc.bold("fundo da pasta ou do Desktop")} -> ${pc.bold('"Novo arquivo com MarkiiDown"')}.`);
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
  let restoredAll = true;
  for (const extension of MANAGED_EXTENSIONS) {
    if (!(await restoreExtensionAssociation(extension))) {
      success = false;
      restoredAll = false;
      console.warn(pc.yellow(`⚠️ Não foi possível restaurar a associação anterior de ${extension}.`));
    }
  }

  // 2. Apaga as chaves criadas pela integração, incluindo restos de
  // instalações com o executável renomeado e a chave de backups. Se alguma
  // restauração falhou, os backups ficam para uma nova tentativa.
  const sweptKeys = await findMarkiiDownApplicationKeys();
  const keysToDelete = [...new Set([...buildKeysToDelete([LEGACY_APP_KEY_NAME]), ...sweptKeys])].filter(
    (key) => restoredAll || key !== MARKIIDOWN_SOFTWARE_KEY
  );

  for (const key of keysToDelete) {
    const queryProc = Bun.spawn(["reg", "query", key], { stdout: "ignore", stderr: "ignore" });
    if ((await queryProc.exited) !== 0) continue;

    const proc = Bun.spawn(["reg", "delete", key, "/f"], { stdout: "ignore", stderr: "ignore" });
    if ((await proc.exited) !== 0) success = false;
  }

  // 3. Chaves .md/.markdown que ficaram vazias (criadas pela instalação) somem
  for (const extension of MANAGED_EXTENSIONS) {
    await deleteKeyIfEmpty(`HKCU\\Software\\Classes\\${extension}`);
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
