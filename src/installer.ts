import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import pc from "picocolors";
import { registerWindowsContextMenu, unregisterWindowsContextMenu } from "./windows-registry.ts";

/**
 * Retorna o diretório de instalação do usuário (%LOCALAPPDATA%\MarkiiDown ou ~/.markiidown/bin)
 */
export function getInstallationDir(): string {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    return join(localAppData, "MarkiiDown");
  }
  return join(homedir(), ".markiidown", "bin");
}

export function getInstalledExePath(): string {
  const ext = process.platform === "win32" ? ".exe" : "";
  return join(getInstallationDir(), `markiidown${ext}`);
}

/**
 * Adiciona um diretório ao PATH do usuário no Windows (HKCU\Environment\Path) sem privilégios de Administrador
 */
async function addUserPathWindows(dirToAdd: string): Promise<boolean> {
  try {
    // 1. Obtém o PATH atual do usuário em HKCU
    const queryProc = Bun.spawn(
      ["reg", "query", "HKCU\\Environment", "/v", "Path"],
      { stdout: "pipe", stderr: "ignore" }
    );
    const queryOutput = await new Response(queryProc.stdout).text();
    let currentPath = "";

    const match = queryOutput.match(/Path\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)/i);
    if (match && match[1]) {
      currentPath = match[1].trim();
    }

    // Se já estiver no PATH, não adiciona novamente
    const paths = currentPath.split(";").map((p) => p.trim()).filter(Boolean);
    const normalizedDir = resolve(dirToAdd).toLowerCase();

    if (paths.some((p) => resolve(p).toLowerCase() === normalizedDir)) {
      return true;
    }

    // 2. Adiciona o novo diretório ao PATH do usuário
    const newPath = currentPath ? `${currentPath};${dirToAdd}` : dirToAdd;
    const addProc = Bun.spawn(
      ["reg", "add", "HKCU\\Environment", "/v", "Path", "/t", "REG_EXPAND_SZ", "/d", newPath, "/f"],
      { stdout: "ignore", stderr: "ignore" }
    );
    return (await addProc.exited) === 0;
  } catch {
    return false;
  }
}

/**
 * Remove um diretório do PATH do usuário no Windows
 */
async function removeUserPathWindows(dirToRemove: string): Promise<boolean> {
  try {
    const queryProc = Bun.spawn(
      ["reg", "query", "HKCU\\Environment", "/v", "Path"],
      { stdout: "pipe", stderr: "ignore" }
    );
    const queryOutput = await new Response(queryProc.stdout).text();
    const match = queryOutput.match(/Path\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)/i);
    if (!match || !match[1]) return true;

    const currentPath = match[1].trim();
    const paths = currentPath.split(";").map((p) => p.trim()).filter(Boolean);
    const normalizedDir = resolve(dirToRemove).toLowerCase();

    const filtered = paths.filter((p) => resolve(p).toLowerCase() !== normalizedDir);
    const newPath = filtered.join(";");

    const setProc = Bun.spawn(
      ["reg", "add", "HKCU\\Environment", "/v", "Path", "/t", "REG_EXPAND_SZ", "/d", newPath, "/f"],
      { stdout: "ignore", stderr: "ignore" }
    );
    return (await setProc.exited) === 0;
  } catch {
    return false;
  }
}

/**
 * Instala o MarkiiDown no diretório do usuário (%LOCALAPPDATA%\MarkiiDown)
 * Adiciona ao PATH e registra no menu de contexto ("Abrir com MarkiiDown")
 */
export async function installMarkiiDown(): Promise<boolean> {
  console.log(pc.cyan("\n======================================================="));
  console.log(pc.bold(pc.white("  🚀 MarkiiDown - Instalador Nativo (Sem Administrador)")));
  console.log(pc.cyan("=======================================================\n"));

  const currentExe = process.execPath;
  const targetDir = getInstallationDir();
  const targetExe = getInstalledExePath();

  console.log(`${pc.dim("Origem:")}   ${pc.white(currentExe)}`);
  console.log(`${pc.dim("Destino:")}  ${pc.white(targetExe)}`);

  // 1. Cria a pasta no AppData
  try {
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
  } catch (err) {
    console.error(pc.red(`❌ Erro ao criar diretório em ${targetDir}: ${err}`));
    return false;
  }

  // 2. Copia o executável
  try {
    if (resolve(currentExe).toLowerCase() !== resolve(targetExe).toLowerCase()) {
      copyFileSync(currentExe, targetExe);
      console.log(pc.green(`✅ Binário copiado para: ${targetExe}`));
    } else {
      console.log(pc.yellow(`ℹ️ O executável já está rodando a partir do diretório de instalação.`));
    }
  } catch (err) {
    console.error(pc.red(`❌ Falha ao copiar o executável: ${err}`));
    return false;
  }

  // 3. Adiciona ao PATH do Windows
  if (process.platform === "win32") {
    const pathOk = await addUserPathWindows(targetDir);
    if (pathOk) {
      console.log(pc.green(`✅ Diretório adicionado ao PATH do Usuário (HKCU).`));
    } else {
      console.warn(pc.yellow(`⚠️ Não foi possível adicionar ao PATH automaticamente.`));
    }

    // 4. Registra no menu de contexto apontando para o executável instalado
    const regOk = await registerWindowsContextMenu(targetExe);
    if (regOk) {
      console.log(pc.green(`✅ Menu de contexto registrado ("Abrir com MarkiiDown").`));
    }
  }

  console.log(pc.green("\n🎉 Instalação concluída com sucesso!"));
  console.log(`\n💡 ${pc.bold("Como usar agora:")}`);
  console.log(`   1. Digite ${pc.cyan("markiidown")} em qualquer janela do terminal/PowerShell.`);
  console.log(`   2. Clique com o botão direito em qualquer arquivo ${pc.cyan(".md")} -> ${pc.bold('"Abrir com MarkiiDown"')}.`);
  console.log(`   3. Abra com duplo clique associando o MarkiiDown no "Abrir com...".\n`);

  return true;
}

/**
 * Desinstala o MarkiiDown do sistema do usuário
 */
export async function uninstallMarkiiDown(): Promise<boolean> {
  console.log(pc.cyan("\n======================================================="));
  console.log(pc.bold(pc.white("  🗑️ MarkiiDown - Desinstalador")));
  console.log(pc.cyan("=======================================================\n"));

  const targetDir = getInstallationDir();

  if (process.platform === "win32") {
    // 1. Remove do menu de contexto
    await unregisterWindowsContextMenu();

    // 2. Remove do PATH do usuário
    await removeUserPathWindows(targetDir);
    console.log(pc.green(`✅ Removido do PATH do Usuário.`));
  }

  // 3. Remove os arquivos instalados
  try {
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true });
      console.log(pc.green(`✅ Diretório removido: ${targetDir}`));
    }
  } catch (err) {
    console.warn(pc.yellow(`⚠️ Aviso ao remover arquivos: ${err}`));
  }

  console.log(pc.green("\n🎉 MarkiiDown desinstalado com sucesso do sistema!\n"));
  return true;
}
