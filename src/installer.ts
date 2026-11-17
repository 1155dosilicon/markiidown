import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, win32 } from "node:path";
import pc from "picocolors";
import { toWindowsFileVersion } from "./version.ts";
import { parseRegNamedValue, registerWindowsContextMenu, unregisterWindowsContextMenu } from "./windows-registry.ts";

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
  // win32.basename aceita "/" e "\\", então funciona com caminhos de qualquer sistema.
  const executableName = win32.basename(executablePath).toLowerCase();
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
      const iconFile = resolve(import.meta.dir, "..", "assets", "icon.ico");
      const buildArgs = [currentExe, "build", "--compile", "--minify"];
      if (process.platform === "win32") {
        buildArgs.push("--target=bun-windows-x64");
        if (existsSync(iconFile)) {
          buildArgs.push(`--windows-icon=${iconFile}`);
        }
        buildArgs.push(
          "--windows-title=MarkiiDown",
          "--windows-description=Leitor e Editor Universal de Arquivos e Markdown",
          "--windows-publisher=MarkiiDown",
          `--windows-version=${toWindowsFileVersion()}`
        );
      }
      buildArgs.push(entryPoint, "--outfile", targetExe);

      const buildProc = Bun.spawn(buildArgs, { stdout: "inherit", stderr: "inherit" });
      const exitCode = await buildProc.exited;
      if (exitCode !== 0 || !existsSync(targetExe)) {
        console.error(pc.red(`❌ Falha ao compilar o executável (código ${exitCode}).`));
        return false;
      }

      console.log(pc.green(`✅ Executável compilado com ícone em: ${targetExe}`));
    } else if (normalizePathForComparison(currentExe) !== normalizePathForComparison(targetExe)) {
      copyFileSync(currentExe, targetExe);
      console.log(pc.green(`✅ Binário copiado para: ${targetExe}`));
    } else {
      console.log(pc.yellow("ℹ️ O executável já está rodando a partir do diretório de instalação."));
    }

    // Copia o arquivo de ícone (.ico) dedicado para a pasta de instalação se existir
    const projectRoot = resolve(import.meta.dir, "..");
    const candidateIcons = [
      join(projectRoot, "assets", "icon.ico"),
      join(process.cwd(), "assets", "icon.ico"),
      join(resolve(currentExe, ".."), "assets", "icon.ico"),
      join(resolve(currentExe, ".."), "markiidown.ico"),
    ];

    const targetIcon = join(resolve(targetExe, ".."), "markiidown.ico");
    for (const src of candidateIcons) {
      if (existsSync(src)) {
        try {
          copyFileSync(src, targetIcon);
          break;
        } catch {}
      }
    }
    return true;
  } catch (error) {
    console.error(pc.red(`❌ Falha ao instalar o executável: ${error}`));
    return false;
  }
}

/**
 * Acrescenta o diretório ao PATH, sem duplicar. Retorna null quando ele já
 * está presente (nada a gravar). Função pura (testável no Linux).
 */
export function appendPathEntry(currentPath: string, dirToAdd: string): string | null {
  const normalizedDir = normalizePathForComparison(dirToAdd);
  const entries = currentPath.split(";");
  if (entries.some((entry) => entry.trim() && normalizePathForComparison(entry) === normalizedDir)) {
    return null;
  }
  if (!currentPath) return dirToAdd;
  // Mantém o ";" final, se havia: a remoção deixa o PATH idêntico ao original
  return currentPath.endsWith(";") ? `${currentPath}${dirToAdd};` : `${currentPath};${dirToAdd}`;
}

/**
 * Remove o diretório do PATH. Retorna null quando ele não está presente.
 * As demais entradas ficam exatamente como estavam (inclusive `;;` vazios e
 * variáveis como `%USERPROFILE%`). Função pura (testável no Linux).
 */
export function removePathEntry(currentPath: string, dirToRemove: string): string | null {
  const normalizedDir = normalizePathForComparison(dirToRemove);
  const entries = currentPath.split(";");
  const kept = entries.filter((entry) => !entry.trim() || normalizePathForComparison(entry) !== normalizedDir);
  return kept.length === entries.length ? null : kept.join(";");
}

/** Lê o PATH do usuário (HKCU). Retorna "" se ele não existe e null em erro. */
async function readUserPathWindows(): Promise<string | null> {
  const queryProc = Bun.spawn(["reg", "query", "HKCU\\Environment", "/v", "Path"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const [output, exitCode] = await Promise.all([new Response(queryProc.stdout).text(), queryProc.exited]);
  if (exitCode !== 0) {
    // Código 1 = valor inexistente; confirma que a chave em si é legível
    const keyProc = Bun.spawn(["reg", "query", "HKCU\\Environment"], { stdout: "ignore", stderr: "ignore" });
    return (await keyProc.exited) === 0 ? "" : null;
  }
  return parseRegNamedValue(output, "Path") ?? "";
}

async function writeUserPathWindows(newPath: string): Promise<boolean> {
  const setProc = Bun.spawn(
    ["reg", "add", "HKCU\\Environment", "/v", "Path", "/t", "REG_EXPAND_SZ", "/d", newPath, "/f"],
    { stdout: "ignore", stderr: "ignore" }
  );
  if ((await setProc.exited) !== 0) return false;
  await broadcastEnvironmentChange();
  return true;
}

/**
 * Avisa o Windows (WM_SETTINGCHANGE "Environment") que o PATH mudou.
 * O `reg add` grava o Registro mas não avisa ninguém: o Explorer continuava
 * com o PATH antigo e os terminais abertos por ele não achavam `markiidown`
 * até sair e entrar de novo no Windows. É o mesmo aviso que o painel
 * "Variáveis de Ambiente" e o `setx` enviam.
 */
async function broadcastEnvironmentChange(): Promise<void> {
  if (process.platform !== "win32") return;
  try {
    const { dlopen, FFIType } = await import("bun:ffi");
    const user32 = dlopen("user32.dll", {
      SendMessageTimeoutW: {
        args: [FFIType.u64, FFIType.u32, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr],
        returns: FFIType.i64,
      },
    });
    try {
      const HWND_BROADCAST = 0xffff;
      const WM_SETTINGCHANGE = 0x001a;
      const SMTO_ABORTIFHUNG = 0x0002;
      const area = Buffer.from("Environment\0", "utf16le");
      const result = new BigUint64Array(1);
      user32.symbols.SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, area, SMTO_ABORTIFHUNG, 5000, result);
    } finally {
      user32.close();
    }
  } catch {
    // Sem o aviso o PATH só vale após novo login; não é motivo para falhar
  }
}

/**
 * Adiciona um diretório ao PATH do usuário no Windows (HKCU\Environment\Path) sem privilégios de Administrador
 */
async function addUserPathWindows(dirToAdd: string): Promise<boolean> {
  try {
    const currentPath = await readUserPathWindows();
    if (currentPath === null) return false;
    const newPath = appendPathEntry(currentPath, dirToAdd);
    return newPath === null ? true : await writeUserPathWindows(newPath);
  } catch {
    return false;
  }
}

/**
 * Remove um diretório do PATH do usuário no Windows
 */
async function removeUserPathWindows(dirToRemove: string): Promise<boolean> {
  try {
    const currentPath = await readUserPathWindows();
    if (currentPath === null) return false;
    const newPath = removePathEntry(currentPath, dirToRemove);
    return newPath === null ? true : await writeUserPathWindows(newPath);
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
 * Script PowerShell que apaga a pasta de instalação depois que o MarkiiDown
 * fecha. Tenta por até ~15 s, porque o .exe só é liberado pelo Windows
 * alguns instantes após o processo terminar. O caminho chega pela variável
 * de ambiente, nunca interpolado no script. Função pura (testável).
 */
export function buildCleanupScript(): string {
  return [
    "Set-Location -LiteralPath $env:TEMP",
    "$target = $env:MARKIIDOWN_CLEANUP_TARGET",
    "if (-not $target) { exit 1 }",
    "for ($i = 0; $i -lt 30; $i++) {",
    "  Start-Sleep -Milliseconds 500",
    "  Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue",
    "  if (-not (Test-Path -LiteralPath $target)) { exit 0 }",
    "}",
    "exit 1",
  ].join("\n");
}

/**
 * Agenda a remoção da pasta para depois do encerramento.
 *
 * O Bun coloca os processos filhos num Job do Windows que é encerrado junto
 * com ele: um PowerShell iniciado direto pelo Bun.spawn (mesmo com unref ou
 * detached) morria antes de apagar qualquer coisa, e a pasta ficava para
 * trás. `cmd /c start` cria o PowerShell como processo independente, que
 * sobrevive ao fim do MarkiiDown. O script vai em Base64 (-EncodedCommand)
 * para não passar pelas regras de aspas do cmd.
 */
export async function scheduleDirectoryRemovalAfterExit(targetDir: string): Promise<void> {
  const encodedScript = Buffer.from(buildCleanupScript(), "utf16le").toString("base64");
  const launcher = Bun.spawn(
    [
      "cmd.exe",
      "/d",
      "/c",
      "start",
      '""',
      "/b",
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-WindowStyle",
      "Hidden",
      "-EncodedCommand",
      encodedScript,
    ],
    {
      cwd: tmpdir(),
      env: { ...process.env, MARKIIDOWN_CLEANUP_TARGET: targetDir },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      windowsHide: true,
    }
  );
  // O `start` retorna assim que o PowerShell é criado
  await launcher.exited;
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
        // O Windows não deixa apagar a pasta enquanto ela for o diretório
        // atual de algum terminal
        if (isPathInside(targetDir, process.cwd())) {
          console.warn(
            pc.yellow(`⚠️ O terminal está dentro de ${targetDir}; saia da pasta (cd ..) ou ela não poderá ser apagada.`)
          );
        }
        await scheduleDirectoryRemovalAfterExit(targetDir);
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
