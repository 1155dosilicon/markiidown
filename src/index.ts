#!/usr/bin/env bun
import { basename, resolve } from "node:path";
import pc from "picocolors";
import { convertMarkdownToStaticHtml } from "./html-template.ts";
import { installMarkiiDown, uninstallMarkiiDown } from "./installer.ts";
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
  markiidown [arquivo.md] [opções]

${pc.bold(pc.yellow("OPÇÕES PRINCIPAIS:"))}
  -i, --interactive       Abre no leitor interativo de terminal com rolagem e busca (Padrão)
  -p, --print             Imprime todo o conteúdo diretamente no terminal (sem paginação)
  -w, --watch             Monitora alterações no arquivo em tempo real
  -e, --export <saida>    Exporta o arquivo Markdown para um HTML estático autocontido

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
  ${pc.cyan("t")}                Abrir Sumário (Índice de seções)
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
  const args = process.argv.slice(2);

  let targetFileArg: string | undefined;
  let mode: "interactive" | "print" | "watch" | "export" = "interactive";
  let exportPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      showHelp();
      process.exit(0);
    }

    if (arg === "-v" || arg === "--version") {
      console.log(`MarkiiDown v${VERSION} (Bun ${Bun.version})`);
      process.exit(0);
    }

    if (arg === "--install") {
      const ok = await installMarkiiDown();
      process.exit(ok ? 0 : 1);
    }

    if (arg === "--uninstall") {
      const ok = await uninstallMarkiiDown();
      process.exit(ok ? 0 : 1);
    }

    if (arg === "--register") {
      printBanner();
      const ok = await registerWindowsContextMenu();
      process.exit(ok ? 0 : 1);
    }

    if (arg === "--unregister") {
      printBanner();
      const ok = await unregisterWindowsContextMenu();
      process.exit(ok ? 0 : 1);
    }

    if (arg === "-p" || arg === "--print") {
      mode = "print";
      continue;
    }

    if (arg === "-i" || arg === "--interactive") {
      mode = "interactive";
      continue;
    }

    if (arg === "-w" || arg === "--watch") {
      mode = "watch";
      continue;
    }

    if (arg === "-e" || arg === "--export") {
      mode = "export";
      exportPath = args[++i];
      if (!exportPath || exportPath.startsWith("-")) {
        console.error(pc.red("❌ Erro: O parâmetro --export exige o caminho do arquivo HTML de saída."));
        process.exit(1);
      }
      continue;
    }

    if (!arg.startsWith("-") && !targetFileArg) {
      targetFileArg = arg;
    }
  }

  // Se a saída padrão não for um terminal TTY interativo (ex: pipe), força modo print
  if (!process.stdout.isTTY && mode === "interactive") {
    mode = "print";
  }

  // Resolve o arquivo alvo
  const resolvedPath = resolveTargetFile(targetFileArg);

  if (!resolvedPath) {
    printBanner();
    console.error(pc.red("❌ Nenhum arquivo Markdown (.md) encontrado para visualização."));
    console.log(pc.yellow(`Dica: Crie um arquivo README.md ou informe o caminho do arquivo:`));
    console.log(pc.cyan(`  markiidown meu-arquivo.md\n`));
    process.exit(1);
  }

  // Modo Exportação Estática
  if (mode === "export") {
    printBanner();
    const file = Bun.file(resolvedPath);
    const rawMarkdown = await file.text();
    const fullHtml = convertMarkdownToStaticHtml(rawMarkdown, resolvedPath);
    const destination = resolve(process.cwd(), exportPath!);

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
