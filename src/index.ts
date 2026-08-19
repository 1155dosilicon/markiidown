#!/usr/bin/env bun
import { existsSync, lstatSync, mkdirSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import pc from "picocolors";
import { parseCliArgs } from "./cli.ts";
import { convertMarkdownToStaticHtml } from "./html-template.ts";
import { getInstalledExePath, installMarkiiDown, isRunningFromBunRuntime, uninstallMarkiiDown } from "./installer.ts";
import { openInteractiveViewer, printDirectToTerminal, watchFileInTerminal } from "./terminal.ts";
import { printBanner, resolveTargetFile } from "./utils.ts";
import { registerWindowsContextMenu, unregisterWindowsContextMenu } from "./windows-registry.ts";

const VERSION = "1.1.0";

/**
 * Exibe a mensagem de ajuda detalhada em Português (pt-BR)
 */
function showHelp(): void {
  printBanner();
  console.log(`
${pc.bold(pc.yellow("USO:"))}
  markiidown [arquivo.md|arquivo.markdown] [opções]

${pc.bold(pc.yellow("OPÇÕES PRINCIPAIS:"))}
  -i, --interactive       Abre no leitor interativo de terminal com rolagem e busca (Padrão)
  -p, --print             Imprime todo o conteúdo diretamente no terminal (sem paginação)
  -w, --watch             Monitora alterações no arquivo em tempo real
  -e, --export <saida>    Exporta para um arquivo .html/.htm com estilos embutidos

${pc.bold(pc.yellow("INSTALAÇÃO & INTEGRAÇÃO COM WINDOWS (SEM ADMIN):"))}
      --install           Instala em %LOCALAPPDATA%\\MarkiiDown, adiciona ao PATH e menu do Windows
      --uninstall         Remove o MarkiiDown do sistema, PATH e menus
      --register          Apenas adiciona ao menu de contexto ("Abrir com MarkiiDown")
      --unregister        Apenas remove do menu de contexto

${pc.bold(pc.yellow("INFORMAÇÕES:"))}
  -h, --help              Exibe esta mensagem de ajuda
  -v, --version           Exibe a versão do MarkiiDown

${pc.bold(pc.yellow("TECLAS DO MODO INTERATIVO:"))}
  ${pc.cyan("↓ / j / Enter")}    Rolar para baixo
  ${pc.cyan("↑ / k")}            Rolar para cima
  ${pc.cyan("Espaço / PgDown")}  Avançar uma página
  ${pc.cyan("PgUp")}             Voltar uma página
  ${pc.cyan("/")}                Buscar palavra/termo no documento
  ${pc.cyan("t")}                Abrir Sumário (navegue com ↑/↓ e Enter)
  ${pc.cyan("?")}                Ajuda de teclas
  ${pc.cyan("q / Esc")}          Sair do leitor

${pc.bold(pc.yellow("EXEMPLOS:"))}
  ${pc.cyan("markiidown")}                       Abre o README.md da pasta no leitor interativo
  ${pc.cyan("markiidown documento.md")}          Abre "documento.md" no leitor interativo
  ${pc.cyan("markiidown --install")}             Instala no Windows no diretório do usuário
  ${pc.cyan("markiidown notas.md --print")}      Imprime o Markdown formatado direto na tela
  ${pc.cyan("markiidown notas.md --watch")}      Atualiza a exibição no terminal ao salvar
`);
}

/**
 * Função principal da CLI do MarkiiDown
 */
async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

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
  if (!process.stdout.isTTY && mode === "interactive") {
    mode = "print";
  }

  // Resolve o arquivo alvo
  const resolvedPath = resolveTargetFile(options.targetFile);

  if (!resolvedPath) {
    printBanner();
    const detail = options.targetFile
      ? `O caminho informado não existe, não é um arquivo Markdown ou não contém arquivos Markdown: ${options.targetFile}`
      : "Nenhum arquivo Markdown (.md ou .markdown) encontrado para visualização.";
    console.error(pc.red(`❌ ${detail}`));
    console.log(pc.yellow(`Dica: Crie um arquivo README.md ou informe um caminho válido:`));
    console.log(pc.cyan(`  markiidown meu-arquivo.md\n`));
    process.exit(1);
  }

  // Modo Exportação Estática
  if (mode === "export") {
    printBanner();
    const file = Bun.file(resolvedPath);
    const rawMarkdown = await file.text();
    const fullHtml = convertMarkdownToStaticHtml(rawMarkdown, resolvedPath);
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
    await watchFileInTerminal(resolvedPath);
    return;
  }

  // Modo Impressão Direta
  if (mode === "print") {
    await printDirectToTerminal(resolvedPath);
    return;
  }

  // Modo Interativo (Padrão)
  await openInteractiveViewer(resolvedPath);
}

main().catch((err) => {
  console.error(pc.red(`\n❌ Erro:`), err.message || err);
  process.exit(1);
});
