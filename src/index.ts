#!/usr/bin/env bun
import { existsSync, lstatSync, mkdirSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import pc from "picocolors";
import { parseCliArgs } from "./cli.ts";
import { runInteractiveEditor } from "./editor.ts";
import { convertFileToStaticHtml } from "./html-template.ts";
import { getInstalledExePath, installMarkiiDown, isRunningFromBunRuntime, uninstallMarkiiDown } from "./installer.ts";
import { openInteractiveViewer, printDirectToTerminal, watchFileInTerminal } from "./terminal.ts";
import {
  detectFileType,
  fixWindowsTrailingQuote,
  printBanner,
  resolveNewFileTarget,
  resolveTargetFile,
} from "./utils.ts";
import { registerWindowsContextMenu, unregisterWindowsContextMenu } from "./windows-registry.ts";

const VERSION = "2.0.0";

/**
 * Exibe a mensagem de ajuda detalhada em Português (pt-BR)
 */
function showHelp(): void {
  printBanner();
  console.log(`
${pc.bold(pc.yellow("USO:"))}
  markiidown [arquivo|pasta] [opções]

${pc.bold(pc.yellow("FORMATOS SUPORTADOS:"))}
  • Markdown (${pc.cyan(".md, .markdown")}) - com suporte a tabelas, alertas, emoji e formatação rica
  • Código-Fonte (${pc.cyan("TypeScript, JavaScript, Python, Rust, Go, C/C++, HTML, CSS, SQL, Shell, etc.")})
  • Configurações (${pc.cyan("JSON, YAML, TOML, XML, INI, ENV, Dockerfile, etc.")})
  • Texto Plano e Logs (${pc.cyan(".txt, .log, .csv")})

${pc.bold(pc.yellow("OPÇÕES PRINCIPAIS:"))}
  -i, --interactive       Abre no leitor interativo de terminal com rolagem, busca e atalho para editor (Padrão)
  -E, --edit              Abre diretamente no editor interativo de terminal com salvamento via Ctrl+S
      --new [pasta|arq.]  Sempre cria um arquivo novo com nome único ("novo.md", "novo (2).md"...) e abre no editor
  -p, --print             Imprime todo o conteúdo diretamente no terminal (com syntax highlighting)
  -w, --watch             Monitora alterações no arquivo em tempo real
  -r, --raw               Exibe o arquivo sem formatação/parsers
  -n, --numbers           Exibe numeração de linhas
  -e, --export <saida>    Exporta para um arquivo .html/.htm com estilos embutidos e tema alternável

${pc.bold(pc.yellow("INSTALAÇÃO & INTEGRAÇÃO COM WINDOWS (SEM ADMIN):"))}
      --install           Instala em %LOCALAPPDATA%\\MarkiiDown, adiciona ao PATH e menu do Windows
      --uninstall         Remove o MarkiiDown do sistema, PATH e menus
      --register          Apenas adiciona ao menu de contexto ("Abrir com MarkiiDown")
      --unregister        Apenas remove do menu de contexto

${pc.bold(pc.yellow("INFORMAÇÕES:"))}
  -h, --help              Exibe esta mensagem de ajuda
  -v, --version           Exibe a versão do MarkiiDown

${pc.bold(pc.yellow("TECLAS NO MODO LEITOR:"))}
  ${pc.cyan("e")}                Abrir no Editor Interativo para alterar o arquivo
  ${pc.cyan("↓ / j / Enter")}    Rolar para baixo
  ${pc.cyan("↑ / k")}            Rolar para cima
  ${pc.cyan("Espaço / PgDown")}  Avançar uma página
  ${pc.cyan("PgUp")}             Voltar uma página
  ${pc.cyan("/")}                Buscar palavra/termo no documento
  ${pc.cyan("n / N")}            Próxima / Anterior ocorrência
  ${pc.cyan("t")}                Abrir Sumário ou Símbolos de Código (navegue com ↑/↓ e Enter)
  ${pc.cyan("?")}                Ajuda de teclas
  ${pc.cyan("q / Esc")}          Sair do leitor

${pc.bold(pc.yellow("TECLAS NO MODO EDITOR:"))}
  ${pc.cyan("Ctrl+S")}           Salvar alterações no disco
  ${pc.cyan("Esc / Ctrl+Q")}     Sair (pede confirmação se houver alterações não salvas)
  ${pc.cyan("Ctrl+Z / Ctrl+Y")}  Desfazer / Refazer
  ${pc.cyan("Tab")}              Inserir indentação (2 espaços)

${pc.bold(pc.yellow("EXEMPLOS:"))}
  ${pc.cyan("markiidown")}                       Abre o arquivo principal da pasta no leitor
  ${pc.cyan("markiidown script.ts")}             Abre "script.ts" com syntax highlighting no leitor
  ${pc.cyan("markiidown main.py --edit")}        Abre "main.py" diretamente no editor de terminal
  ${pc.cyan("markiidown config.json --print")}   Imprime "config.json" formatado e colorido
  ${pc.cyan("markiidown notas.md --watch")}      Atualiza a exibição no terminal ao salvar
  ${pc.cyan("markiidown codigo.rs -e app.html")} Exporta o arquivo para HTML estático estilizado
  ${pc.cyan("markiidown --install")}             Instala no Windows e integra ao menu do Explorador
  ${pc.cyan("markiidown --new")}                 Cria "novo.md" (ou "novo (2).md"...) e abre no editor
`);
}

/**
 * Função principal da CLI do MarkiiDown
 */
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
    case "install": {
      const ok = await installMarkiiDown();
      process.exit(ok ? 0 : 1);
    }
    case "uninstall": {
      const ok = await uninstallMarkiiDown();
      process.exit(ok ? 0 : 1);
    }
    case "register": {
      printBanner();
      const executablePath = isRunningFromBunRuntime() ? getInstalledExePath() : undefined;
      const ok = await registerWindowsContextMenu(executablePath);
      process.exit(ok ? 0 : 1);
    }
    case "unregister": {
      printBanner();
      const ok = await unregisterWindowsContextMenu();
      process.exit(ok ? 0 : 1);
    }
  }

  let mode = options.mode;

  // Se a saída padrão não for um terminal TTY interativo (ex: pipe), força modo print
  if (!process.stdout.isTTY && (mode === "interactive" || mode === "edit")) {
    mode = "print";
  }

  // Resolve o arquivo alvo (permite novos caminhos em modo de edição)
  let resolvedPath: string | null;
  if (options.createNew && mode === "edit") {
    // "--new" sempre cria um arquivo novo com nome único, nunca abre um existente
    resolvedPath = resolveNewFileTarget(options.targetFile);
  } else {
    resolvedPath = resolveTargetFile(options.targetFile, mode === "edit");

    if (mode === "edit") {
      if (!options.targetFile) {
        // "markiidown --edit" sem alvo sempre inicia um arquivo novo,
        // em vez de abrir um arquivo existente ao acaso na pasta atual
        // (no Desktop isso abria o desktop.ini)
        resolvedPath = resolveNewFileTarget(undefined);
      } else {
        // "--edit" apontando para uma pasta cria o arquivo novo dentro dela
        const absoluteTarget = isAbsolute(options.targetFile)
          ? options.targetFile
          : resolve(process.cwd(), options.targetFile);
        try {
          if (existsSync(absoluteTarget) && statSync(absoluteTarget).isDirectory()) {
            resolvedPath = resolveNewFileTarget(absoluteTarget);
          }
        } catch {}
      }
    }
  }

  // Se o usuário passou um arquivo inexistente no modo interativo padrão,
  // abre no editor para criar o arquivo (comportamento estilo Bloco de Notas)
  if (!resolvedPath && options.targetFile && mode === "interactive") {
    const candidatePath = isAbsolute(options.targetFile)
      ? options.targetFile
      : resolve(process.cwd(), options.targetFile);
    if (existsSync(dirname(candidatePath))) {
      resolvedPath = candidatePath;
      mode = "edit";
    }
  }

  if (!resolvedPath) {
    printBanner();
    const detail = options.targetFile
      ? `O caminho informado não existe ou não pôde ser aberto: ${options.targetFile}`
      : "Nenhum arquivo legível encontrado na pasta para visualização.";
    console.error(pc.red(`❌ ${detail}`));
    console.log(pc.yellow(`Dica: Informe um arquivo ou caminho válido:`));
    console.log(pc.cyan(`  markiidown meu-arquivo.ts\n`));
    process.exit(1);
  }

  // Modo Editor Direto
  if (mode === "edit") {
    await runInteractiveEditor({ filePath: resolvedPath });
    return;
  }

  // Modo Exportação Estática
  if (mode === "export") {
    printBanner();
    if (detectFileType(resolvedPath).isBinary) {
      throw new Error(`Arquivos binários não podem ser exportados para HTML: ${resolvedPath}`);
    }
    const file = Bun.file(resolvedPath);
    const rawText = await file.text();
    const fullHtml = convertFileToStaticHtml(rawText, resolvedPath);
    const destination = resolve(process.cwd(), options.exportPath!);
    const outputExtension = extname(destination).toLowerCase();
    if (outputExtension !== ".html" && outputExtension !== ".htm") {
      throw new Error("O arquivo de exportação deve usar a extensão .html ou .htm.");
    }
    if (existsSync(destination) && statSync(destination).isDirectory()) {
      throw new Error(`O destino da exportação é um diretório: ${destination}`);
    }
    if (existsSync(destination) && lstatSync(destination).isSymbolicLink()) {
      throw new Error(`O destino da exportação não pode ser um link simbólico: ${destination}`);
    }

    mkdirSync(dirname(destination), { recursive: true });

    await Bun.write(destination, fullHtml);

    console.log(pc.green(`✅ Arquivo exportado com sucesso para HTML estático!`));
    console.log(`   ${pc.bold("Origem:")}  ${resolvedPath}`);
    console.log(`   ${pc.bold("Destino:")} ${destination}\n`);
    process.exit(0);
  }

  // Modo Watch
  if (mode === "watch") {
    await watchFileInTerminal(resolvedPath, { raw: options.raw, lineNumbers: options.lineNumbers });
    return;
  }

  // Modo Impressão Direta
  if (mode === "print") {
    await printDirectToTerminal(resolvedPath, { raw: options.raw, lineNumbers: options.lineNumbers });
    return;
  }

  // Modo Interativo (Padrão)
  await openInteractiveViewer(resolvedPath, { raw: options.raw, lineNumbers: options.lineNumbers });
}

main().catch((err) => {
  console.error(pc.red(`\n❌ Erro:`), err.message || err);
  process.exit(1);
});

