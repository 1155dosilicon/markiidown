import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import pc from "picocolors";

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

  console.log(pc.cyan("\n🔧 Registrando MarkiiDown no Windows..."));
  console.log(`${pc.dim("Caminho do Executável:")} ${pc.white(exePath)}`);
  console.log(`${pc.dim("Caminho do Ícone:")}      ${pc.white(iconTarget)}`);

  const supportedExtensions = [
    ".md", ".markdown", ".txt", ".json", ".js", ".jsx", ".ts", ".tsx",
    ".py", ".rs", ".go", ".c", ".cpp", ".h", ".hpp", ".html", ".css",
    ".yaml", ".yml", ".toml", ".sh", ".bash", ".sql", ".xml", ".log"
  ];

  const commands: string[][] = [
    // 1. Menu de contexto universal para qualquer arquivo (*)
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\*\\shell\\MarkiiDown",
      "/ve",
      "/d",
      "Abrir com MarkiiDown",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\*\\shell\\MarkiiDown",
      "/v",
      "Icon",
      "/d",
      iconTarget,
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\*\\shell\\MarkiiDown\\command",
      "/ve",
      "/d",
      `"${exePath}" "%1"`,
      "/f",
    ],

    // 2. Registra como aplicativo reconhecido na lista "Abrir com..." do Windows
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Applications\\markiidown.exe",
      "/v",
      "FriendlyAppName",
      "/d",
      "MarkiiDown (Leitor & Editor Universal)",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Applications\\markiidown.exe",
      "/v",
      "ApplicationCompany",
      "/d",
      "MarkiiDown",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Applications\\markiidown.exe\\DefaultIcon",
      "/ve",
      "/d",
      iconTarget,
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Applications\\markiidown.exe\\shell\\open\\command",
      "/ve",
      "/d",
      `"${exePath}" "%1"`,
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Applications\\markiidown.exe\\shell\\edit\\command",
      "/ve",
      "/d",
      `"${exePath}" "%1" --edit`,
      "/f",
    ],

    // 3. Menu "Novo" (New) do Windows Explorer para criar arquivos Markdown (.md)
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\.md",
      "/ve",
      "/d",
      "MarkiiDown.Document",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\.md\\ShellNew",
      "/v",
      "NullFile",
      "/d",
      "",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\.markdown",
      "/ve",
      "/d",
      "MarkiiDown.Document",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\.markdown\\ShellNew",
      "/v",
      "NullFile",
      "/d",
      "",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\MarkiiDown.Document",
      "/ve",
      "/d",
      "Documento Markdown",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\MarkiiDown.Document",
      "/v",
      "FriendlyTypeName",
      "/d",
      "Documento Markdown",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\MarkiiDown.Document\\DefaultIcon",
      "/ve",
      "/d",
      iconTarget,
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\MarkiiDown.Document\\shell\\open\\command",
      "/ve",
      "/d",
      `"${exePath}" "%1"`,
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\MarkiiDown.Document\\shell\\edit\\command",
      "/ve",
      "/d",
      `"${exePath}" "%1" --edit`,
      "/f",
    ],

    // 4. Menu de Contexto ao clicar com botão direito no fundo de pastas e Desktop
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDown",
      "/ve",
      "/d",
      "Abrir pasta com MarkiiDown",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDown",
      "/v",
      "Icon",
      "/d",
      iconTarget,
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDown\\command",
      "/ve",
      "/d",
      `"${exePath}" "%V"`,
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew",
      "/ve",
      "/d",
      "Novo arquivo com MarkiiDown",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew",
      "/v",
      "Icon",
      "/d",
      iconTarget,
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew\\command",
      "/ve",
      "/d",
      `"${exePath}" "%V\\novo.md" --edit`,
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDownNew",
      "/ve",
      "/d",
      "Novo arquivo com MarkiiDown",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDownNew",
      "/v",
      "Icon",
      "/d",
      iconTarget,
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDownNew\\command",
      "/ve",
      "/d",
      `"${exePath}" --edit`,
      "/f",
    ],
  ];

  for (const ext of supportedExtensions) {
    commands.push([
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Applications\\markiidown.exe\\SupportedTypes",
      "/v",
      ext,
      "/d",
      "",
      "/f",
    ]);
  }

  let success = true;
  for (const cmd of commands) {
    const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe" });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      success = false;
      const errorText = await new Response(proc.stderr).text();
      console.warn(pc.yellow(`⚠️ Aviso no registro: ${errorText.trim()}`));
    }
  }

  // Notifica o Windows Explorer para atualizar ícones imediatamente
  await notifyWindowsShell();

  if (success) {
    console.log(pc.green("\n🎉 MarkiiDown registrado com sucesso no Windows!"));
    console.log(`\nAgora você pode:`);
    console.log(`  1. Clicar com o ${pc.bold("botão direito")} em qualquer pasta/espaço vazio -> ${pc.bold('"Novo" -> "Documento Markdown"')}.`);
    console.log(`  2. Clicar com o ${pc.bold("botão direito")} em qualquer arquivo e escolher ${pc.bold('"Abrir com MarkiiDown"')}.`);
    console.log(`  3. Clicar com o ${pc.bold("botão direito")} no fundo da pasta -> ${pc.bold('"Novo arquivo com MarkiiDown"')}.`);
    console.log(`  4. Ir em ${pc.bold('"Abrir com..."')} -> ${pc.bold("MarkiiDown")} para definir como aplicativo padrão.`);
  }

  return success;
}

/**
 * Remove o MarkiiDown do menu de contexto e da lista "Abrir com..."
 */
export async function unregisterWindowsContextMenu(): Promise<boolean> {
  if (process.platform !== "win32") {
    console.error(pc.red("❌ Apenas suportado no Windows."));
    return false;
  }

  console.log(pc.cyan("\n🗑️ Removendo MarkiiDown do menu de contexto do Windows..."));

  const keysToDelete = [
    "HKCU\\Software\\Classes\\*\\shell\\MarkiiDown",
    "HKCU\\Software\\Classes\\.md\\ShellNew",
    "HKCU\\Software\\Classes\\.markdown\\ShellNew",
    "HKCU\\Software\\Classes\\MarkiiDown.Document",
    "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDown",
    "HKCU\\Software\\Classes\\Directory\\Background\\shell\\MarkiiDownNew",
    "HKCU\\Software\\Classes\\DesktopBackground\\shell\\MarkiiDownNew",
    "HKCU\\Software\\Classes\\Applications\\markiidown.exe",
  ];

  let success = true;
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


