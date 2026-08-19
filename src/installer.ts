import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
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

export function isRunningFromBunRuntime(executablePath = process.execPath): boolean {
  const executableName = basename(executablePath).toLowerCase();
  return executableName === "bun" || executableName === "bun.exe";
}

function expandWindowsEnvironmentVariables(value: string): string {
  return value.replace(/%([^%]+)%/g, (match, variableName: string) => {
    const entry = Object.entries(process.env).find(([name]) => name.toLowerCase() === variableName.toLowerCase());
    return entry?.[1] ?? match;
  });
}

export function normalizePathForComparison(pathValue: string): string {
  const expanded = expandWindowsEnvironmentVariables(pathValue.trim().replace(/^"|"$/g, ""));
  return resolve(expanded).replace(/[\\/]+$/, "").toLowerCase();
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const childRelativePath = relative(resolve(parentPath), resolve(childPath));
  return childRelativePath === "" || (!childRelativePath.startsWith("..") && !isAbsolute(childRelativePath));
}

async function installExecutable(targetExe: string): Promise<boolean> {
  const currentExe = process.execPath;

  try {
    if (isRunningFromBunRuntime(currentExe)) {
      const entryPoint = resolve(import.meta.dir, "index.ts");
      if (!existsSync(entryPoint)) {
        console.error(pc.red(`❌ Ponto de entrada não encontrado para compilação: ${entryPoint}`));
        return false;
      }

      console.log(pc.cyan("⏳ Compilando o executável standalone antes da instalação..."));
      const buildArgs = [currentExe, "build", "--compile", "--minify"];
      if (process.platform === "win32") buildArgs.push("--target=bun-windows-x64");
      buildArgs.push(entryPoint, "--outfile", targetExe);

      const buildProc = Bun.spawn(buildArgs, { stdout: "inherit", stderr: "inherit" });
      const exitCode = await buildProc.exited;
      if (exitCode !== 0 || !existsSync(targetExe)) {
        console.error(pc.red(`❌ Falha ao compilar o executável (código ${exitCode}).`));
        return false;
      }

      console.log(pc.green(`✅ Executável compilado em: ${targetExe}`));
      return true;
    }

    if (normalizePathForComparison(currentExe) !== normalizePathForComparison(targetExe)) {
      copyFileSync(currentExe, targetExe);
      console.log(pc.green(`✅ Binário copiado para: ${targetExe}`));
    } else {
      console.log(pc.yellow("ℹ️ O executável já está rodando a partir do diretório de instalação."));
    }
    return true;
  } catch (error) {
    console.error(pc.red(`❌ Falha ao instalar o executável: ${error}`));
    return false;
  }
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
    const normalizedDir = normalizePathForComparison(dirToAdd);

    if (paths.some((p) => normalizePathForComparison(p) === normalizedDir)) {
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
    const normalizedDir = normalizePathForComparison(dirToRemove);

    const filtered = paths.filter((p) => normalizePathForComparison(p) !== normalizedDir);
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
  if (process.platform !== "win32") {
    console.error(pc.red("❌ A instalação automática é suportada apenas no Windows."));
    return false;
  }

  console.log(pc.cyan("\n======================================================="));
  console.log(pc.bold(pc.white("  🚀 MarkiiDown - Instalador Nativo (Sem Administrador)")));
  console.log(pc.cyan("=======================================================\n"));

  const targetDir = getInstallationDir();
  const targetExe = getInstalledExePath();

  console.log(`${pc.dim("Origem:")}   ${pc.white(process.execPath)}`);
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

  // 2. Copia o standalone atual ou compila um quando executado pelo código-fonte.
  if (!(await installExecutable(targetExe))) return false;

  // 3. Adiciona ao PATH do Windows
  let integrationOk = true;
  if (process.platform === "win32") {
    const pathOk = await addUserPathWindows(targetDir);
    if (pathOk) {
      console.log(pc.green(`✅ Diretório adicionado ao PATH do Usuário (HKCU).`));
    } else {
      console.warn(pc.yellow(`⚠️ Não foi possível adicionar ao PATH automaticamente.`));
      integrationOk = false;
    }

    // 4. Registra no menu de contexto apontando para o executável instalado
    const regOk = await registerWindowsContextMenu(targetExe);
    if (regOk) {
      console.log(pc.green(`✅ Menu de contexto registrado ("Abrir com MarkiiDown").`));
    } else {
      integrationOk = false;
    }
  }

  if (!integrationOk) {
    console.error(pc.red("\n❌ O executável foi instalado, mas uma ou mais integrações do Windows falharam."));
    return false;
  }

  console.log(pc.green("\n🎉 Instalação concluída com sucesso!"));
  console.log(`\n💡 ${pc.bold("Como usar agora:")}`);
  console.log(`   1. Digite ${pc.cyan("markiidown")} em qualquer janela do terminal/PowerShell.`);
  console.log(`   2. Clique com o botão direito em qualquer arquivo ${pc.cyan(".md")} -> ${pc.bold('"Abrir com MarkiiDown"')}.`);
  console.log(`   3. Abra com duplo clique associando o MarkiiDown no "Abrir com...".\n`);

  return integrationOk;
}

/**
 * Desinstala o MarkiiDown do sistema do usuário
 */
export async function uninstallMarkiiDown(): Promise<boolean> {
  console.log(pc.cyan("\n======================================================="));
  console.log(pc.bold(pc.white("  🗑️ MarkiiDown - Desinstalador")));
  console.log(pc.cyan("=======================================================\n"));

  const targetDir = getInstallationDir();
  let cleanupOk = true;

  if (process.platform === "win32") {
    // 1. Remove do menu de contexto
    cleanupOk = (await unregisterWindowsContextMenu()) && cleanupOk;

    // 2. Remove do PATH do usuário
    const pathRemoved = await removeUserPathWindows(targetDir);
    cleanupOk = pathRemoved && cleanupOk;
    if (pathRemoved) {
      console.log(pc.green(`✅ Removido do PATH do Usuário.`));
    } else {
      console.error(pc.red(`❌ Não foi possível remover o diretório do PATH do Usuário.`));
    }
  }

  // 3. Remove os arquivos instalados
  let filesRemoved = true;
  try {
    if (existsSync(targetDir)) {
      if (process.platform === "win32" && isPathInside(targetDir, process.execPath)) {
        const cleanupScript = [
          "Start-Sleep -Milliseconds 700",
          "if ($env:MARKIIDOWN_CLEANUP_TARGET) { Remove-Item -LiteralPath $env:MARKIIDOWN_CLEANUP_TARGET -Recurse -Force -ErrorAction SilentlyContinue }",
        ].join("; ");
        const cleanupProc = Bun.spawn(
          ["powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", cleanupScript],
          {
            env: { ...process.env, MARKIIDOWN_CLEANUP_TARGET: targetDir },
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
            windowsHide: true,
          }
        );
        cleanupProc.unref();
        console.log(pc.green(`✅ Remoção do diretório agendada para após o encerramento: ${targetDir}`));
      } else {
        rmSync(targetDir, { recursive: true, force: true });
        console.log(pc.green(`✅ Diretório removido: ${targetDir}`));
      }
    }
  } catch (err) {
    filesRemoved = false;
    console.error(pc.red(`❌ Falha ao remover arquivos: ${err}`));
  }

  if (filesRemoved && cleanupOk) {
    console.log(pc.green("\n🎉 MarkiiDown desinstalado com sucesso do sistema!\n"));
  }
  return filesRemoved && cleanupOk;
}
