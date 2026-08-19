import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import pc from "picocolors";

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

  console.log(pc.cyan("\n🔧 Registrando MarkiiDown no Windows..."));
  console.log(`${pc.dim("Caminho do Executável:")} ${pc.white(exePath)}`);

  const commands = [
    // 1. Registra no menu de contexto de arquivos .md (SystemFileAssociations)
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\SystemFileAssociations\\.md\\shell\\MarkiiDown",
      "/ve",
      "/d",
      "Abrir com MarkiiDown",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\SystemFileAssociations\\.md\\shell\\MarkiiDown\\command",
      "/ve",
      "/d",
      `"${exePath}" "%1"`,
      "/f",
    ],

    // 2. Registra no menu de contexto geral de arquivos Markdown (*.markdown)
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\SystemFileAssociations\\.markdown\\shell\\MarkiiDown",
      "/ve",
      "/d",
      "Abrir com MarkiiDown",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\SystemFileAssociations\\.markdown\\shell\\MarkiiDown\\command",
      "/ve",
      "/d",
      `"${exePath}" "%1"`,
      "/f",
    ],

    // 3. Registra como aplicativo reconhecido na lista "Abrir com..." do Windows
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Applications\\markiidown.exe",
      "/v",
      "FriendlyAppName",
      "/d",
      "MarkiiDown (Leitor de Markdown)",
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
      "HKCU\\Software\\Classes\\Applications\\markiidown.exe\\SupportedTypes",
      "/v",
      ".md",
      "/d",
      "",
      "/f",
    ],
    [
      "reg",
      "add",
      "HKCU\\Software\\Classes\\Applications\\markiidown.exe\\SupportedTypes",
      "/v",
      ".markdown",
      "/d",
      "",
      "/f",
    ],
  ];

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

  if (success) {
    console.log(pc.green("\n🎉 MarkiiDown registrado com sucesso no Windows!"));
    console.log(`\nAgora você pode:`);
    console.log(`  1. Clicar com o ${pc.bold("botão direito")} em qualquer arquivo ${pc.cyan(".md")} e escolher ${pc.bold('"Abrir com MarkiiDown"')}.`);
    console.log(`  2. Ir em ${pc.bold('"Abrir com..."')} -> ${pc.bold("MarkiiDown")} para definir como aplicativo padrão.`);
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
    "HKCU\\Software\\Classes\\SystemFileAssociations\\.md\\shell\\MarkiiDown",
    "HKCU\\Software\\Classes\\SystemFileAssociations\\.markdown\\shell\\MarkiiDown",
    "HKCU\\Software\\Classes\\Applications\\markiidown.exe",
  ];

  let success = true;
  for (const key of keysToDelete) {
    const queryProc = Bun.spawn(["reg", "query", key], { stdout: "ignore", stderr: "ignore" });
    if ((await queryProc.exited) !== 0) continue;

    const proc = Bun.spawn(["reg", "delete", key, "/f"], { stdout: "ignore", stderr: "ignore" });
    if ((await proc.exited) !== 0) success = false;
  }

  if (success) {
    console.log(pc.green("✅ Registro do MarkiiDown removido com sucesso do Windows!\n"));
  } else {
    console.error(pc.red("❌ Não foi possível remover todas as entradas do Registro.\n"));
  }
  return success;
}
