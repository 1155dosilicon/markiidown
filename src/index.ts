#!/usr/bin/env bun
import { existsSync, lstatSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { CliArgumentError, parseCliArgs } from "./cli.ts";
import { pc } from "./colors.ts";
import { runInteractiveEditor } from "./editor.ts";
import { convertFileToStaticHtml } from "./html-template.ts";
import { getInstalledExePath, installMarkiiDown, isRunningFromBunRuntime, uninstallMarkiiDown } from "./installer.ts";
import { openInteractiveViewer, printDirectToTerminal, watchFileInTerminal } from "./terminal.ts";
import { readTextFile } from "./text-file.ts";
import { detectFileType, fixWindowsTrailingQuote, printBanner, resolveNewFileTarget, resolveTargetFile } from "./utils.ts";
import { VERSION } from "./version.ts";
import { registerWindowsContextMenu, unregisterWindowsContextMenu } from "./windows-registry.ts";

/** Ajuda da linha de comando (pt-BR). */
function showHelp(): void {
  printBanner();
  const title = (text: string) => pc.bold(pc.yellow(text));
  const key = (text: string) => pc.cyan(text);
  console.log(`
${title("USO:")}
  markiidown [arquivo|pasta] [opções]

  Sem arquivo, abre o README.md da pasta atual (ou o primeiro Markdown/texto).
  Um arquivo que não existe é aberto no editor para ser criado.

${title("FORMATOS:")}
  • Markdown (${key(".md .markdown .mdx")}): títulos, listas, tabelas, citações, alertas do GitHub, emoji
  • Código (${key("TypeScript, JavaScript, Python, Rust, Go, C/C++, C#, Java, SQL, Shell...")}) com realce de sintaxe
  • Configuração (${key("JSON, YAML, TOML, INI, XML, .env, Dockerfile...")}) e texto (${key(".txt .log .csv")})
  • Codificação detectada: UTF-8, UTF-8 com BOM, UTF-16 e ANSI (Windows-1252)

${title("MODOS:")}
  -i, --interactive       Leitor interativo com rolagem, busca e sumário (padrão)
  -E, --edit              Abre no editor de texto do terminal
      --new [pasta|arq.]  Cria um arquivo novo com nome livre ("novo.md", "novo (2).md"...) e o edita
  -p, --print             Imprime formatado e sai (redirecionado para arquivo/pipe: só o texto, sem cores)
  -w, --watch             Mostra e atualiza a cada salvamento (Ctrl+C para sair)
  -e, --export <saída>    Exporta para .html/.htm autocontido (tema claro/escuro, sumário, impressão)

${title("OPÇÕES:")}
  -r, --raw               Mostra o arquivo como texto, sem formatar o Markdown nem numerar o código
  -n, --numbers           Numera as linhas

${title("WINDOWS (SEM ADMINISTRADOR):")}
      --install           Instala em %LOCALAPPDATA%\\MarkiiDown, adiciona ao PATH e ao menu do Explorer
      --uninstall         Remove tudo o que o --install fez e restaura a associação anterior do .md
      --register          Só registra o menu de contexto ("Abrir com MarkiiDown"...)
      --unregister        Só remove o menu de contexto

${title("INFORMAÇÕES:")}
  -h, --help              Esta ajuda
  -v, --version           Versão

${title("LEITOR:")}
  ${key("↓ j Enter")} / ${key("↑ k")}          Descer / subir uma linha
  ${key("Espaço PgDn f")} / ${key("PgUp b")}   Página para baixo / para cima
  ${key("Home g")} / ${key("End G")}           Início / fim
  ${key("/")}  ${key("n")}  ${key("N")}                 Buscar, próxima e anterior ocorrência
  ${key("t")}                       Sumário (títulos ou funções e classes)
  ${key("e")}                       Editar o arquivo
  ${key("?")}                       Ajuda
  ${key("q Esc")}                   Sair

${title("EDITOR:")}
  ${key("Ctrl+S")}                  Salvar (mantém codificação e final de linha do arquivo)
  ${key("Esc Ctrl+Q")}              Sair (pergunta se há alterações não salvas)
  ${key("Ctrl+Z")} / ${key("Ctrl+Y")}         Desfazer / refazer (por palavra)
  ${key("Tab")} / ${key("Shift+Tab")}         Indentar / desindentar
  ${key("Ctrl+←/→")}                Pular palavra
  ${key("Ctrl+Home/End")}           Início / fim do arquivo
  Colar (Ctrl+V ou botão direito) insere o texto exatamente como copiado.

${title("EXEMPLOS:")}
  ${key("markiidown")}                       Abre o README.md da pasta atual
  ${key("markiidown script.ts")}             Lê "script.ts" com realce de sintaxe
  ${key("markiidown main.py --edit")}        Edita "main.py"
  ${key("markiidown config.json -p")}        Imprime "config.json" colorido
  ${key("markiidown notas.md --watch")}      Atualiza a tela a cada salvamento
  ${key("markiidown guia.md -e guia.html")}  Exporta para HTML
  ${key("markiidown --new")}                 Cria "novo.md" na pasta atual e abre o editor
`);
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.targetFile) options.targetFile = fixWindowsTrailingQuote(options.targetFile);

  switch (options.action) {
    case "help":
      showHelp();
      return;
    case "version":
      console.log(`MarkiiDown v${VERSION} (Bun ${Bun.version})`);
      return;
    case "install":
      process.exit((await installMarkiiDown()) ? 0 : 1);
    case "uninstall":
      process.exit((await uninstallMarkiiDown()) ? 0 : 1);
    case "register": {
      printBanner();
      const executablePath = isRunningFromBunRuntime() ? getInstalledExePath() : undefined;
      process.exit((await registerWindowsContextMenu(executablePath)) ? 0 : 1);
    }
    case "unregister":
      printBanner();
      process.exit((await unregisterWindowsContextMenu()) ? 0 : 1);
  }

  let mode = options.mode;

  // Sem terminal interativo (saída redirecionada), o leitor e o editor viram impressão
  if (!process.stdout.isTTY && (mode === "interactive" || mode === "edit")) {
    mode = "print";
  }

  let resolvedPath: string | null;
  if (options.createNew && mode === "edit") {
    // "--new" sempre cria um arquivo novo com nome único, nunca abre um existente
    resolvedPath = resolveNewFileTarget(options.targetFile);
  } else {
    resolvedPath = resolveTargetFile(options.targetFile, mode === "edit");

    if (mode === "edit") {
      if (!options.targetFile) {
        // "markiidown --edit" sem alvo cria um arquivo novo em vez de abrir um
        // arquivo qualquer da pasta (no Desktop isso abria o desktop.ini)
        resolvedPath = resolveNewFileTarget(undefined);
      } else {
        // "--edit" apontando para uma pasta cria o arquivo novo dentro dela
        const absoluteTarget = isAbsolute(options.targetFile) ? options.targetFile : resolve(process.cwd(), options.targetFile);
        try {
          if (existsSync(absoluteTarget) && statSync(absoluteTarget).isDirectory()) {
            resolvedPath = resolveNewFileTarget(absoluteTarget);
          }
        } catch {}
      }
    }
  }

  // Arquivo inexistente no modo leitor: abre o editor para criá-lo (como o Bloco de Notas)
  if (!resolvedPath && options.targetFile && mode === "interactive") {
    const candidatePath = isAbsolute(options.targetFile) ? options.targetFile : resolve(process.cwd(), options.targetFile);
    if (existsSync(dirname(candidatePath))) {
      resolvedPath = candidatePath;
      mode = "edit";
    }
  }

  if (!resolvedPath) {
    const detail = options.targetFile
      ? `O caminho não existe ou não pôde ser aberto: ${options.targetFile}`
      : "Nenhum arquivo de texto encontrado nesta pasta.";
    console.error(pc.red(`❌ ${detail}`));
    console.error(pc.yellow("Dica: informe um arquivo, por exemplo: ") + pc.cyan("markiidown notas.md"));
    process.exit(1);
  }

  switch (mode) {
    case "edit":
      await runInteractiveEditor({ filePath: resolvedPath });
      return;
    case "export":
      await exportToHtml(resolvedPath, options.exportPath!);
      return;
    case "watch":
      await watchFileInTerminal(resolvedPath, { raw: options.raw, lineNumbers: options.lineNumbers });
      return;
    case "print":
      await printDirectToTerminal(resolvedPath, { raw: options.raw, lineNumbers: options.lineNumbers });
      return;
    default:
      await openInteractiveViewer(resolvedPath, { raw: options.raw, lineNumbers: options.lineNumbers });
  }
}

async function exportToHtml(sourcePath: string, exportPath: string): Promise<void> {
  if (detectFileType(sourcePath).isBinary) {
    throw new Error(`Arquivos binários não podem ser exportados para HTML: ${sourcePath}`);
  }
  const destination = resolve(process.cwd(), exportPath);
  const outputExtension = extname(destination).toLowerCase();
  if (outputExtension !== ".html" && outputExtension !== ".htm") {
    throw new Error("O arquivo de exportação deve ter a extensão .html ou .htm.");
  }
  if (existsSync(destination)) {
    if (lstatSync(destination).isSymbolicLink()) throw new Error(`O destino não pode ser um link simbólico: ${destination}`);
    if (statSync(destination).isDirectory()) throw new Error(`O destino é uma pasta: ${destination}`);
    // `markiidown pagina.html -e pagina.html` apagaria o próprio arquivo de origem
    if (realpathSync(destination).toLowerCase() === realpathSync(sourcePath).toLowerCase()) {
      throw new Error("O destino da exportação é o próprio arquivo de origem.");
    }
  }

  const { text } = await readTextFile(sourcePath);
  const html = convertFileToStaticHtml(text, sourcePath, statSync(sourcePath).size);
  mkdirSync(dirname(destination), { recursive: true });
  await Bun.write(destination, html);

  console.log(pc.green("✅ Exportado para HTML."));
  console.log(`   ${pc.bold("Origem:")}  ${sourcePath}`);
  console.log(`   ${pc.bold("Destino:")} ${destination}`);
}

/**
 * Erro inesperado: se ele aconteceu com o leitor ou o editor abertos, devolve
 * o terminal ao normal (modo raw, tela alternativa, cursor) antes de mostrar
 * a mensagem. Sem isso o terminal do usuário ficava "quebrado".
 */
function fail(error: unknown): never {
  const stdin = process.stdin as typeof process.stdin & { isRaw?: boolean };
  if (stdin.isTTY && stdin.isRaw) {
    try {
      stdin.setRawMode(false);
    } catch {}
    if (process.stdout.isTTY) process.stdout.write("\x1B[0m\x1B[?2004l\x1B[?25h\x1B[?1049l");
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red("❌ Erro:"), message);
  if (error instanceof CliArgumentError) console.error(pc.yellow("Use ") + pc.cyan("markiidown --help") + pc.yellow(" para ver as opções."));
  process.exit(1);
}

process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
main().catch(fail);
