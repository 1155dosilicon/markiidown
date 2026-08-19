import { existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import pc from "picocolors";
import { formatBytes } from "../src/utils.ts";

async function buildExecutable(): Promise<void> {
  console.log(pc.cyan("\n=========================================="));
  console.log(pc.bold(pc.white("  🔨 MarkiiDown - Compilador de Executável Windows (.EXE)")));
  console.log(pc.cyan("==========================================\n"));

  const rootDir = resolve(import.meta.dir, "..");
  const distDir = join(rootDir, "dist");
  const entryPoint = join(rootDir, "src", "index.ts");
  const outfile = join(distDir, "markiidown.exe");

  // Garante a pasta dist
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  console.log(`${pc.dim("Ponto de Entrada:")} ${pc.white(entryPoint)}`);
  console.log(`${pc.dim("Destino:")}          ${pc.white(outfile)}`);
  console.log(`${pc.dim("Alvo:")}             ${pc.yellow("Windows x64 Standalone (Bun)")}`);
  console.log(pc.cyan("\n⏳ Compilando executável com Bun, aguarde...\n"));

  const startTime = performance.now();

  // Executa o comando de compilação do Bun
  const proc = Bun.spawn(
    [
      "bun",
      "build",
      "--compile",
      "--minify",
      "--target=bun-windows-x64",
      entryPoint,
      "--outfile",
      outfile,
    ],
    {
      cwd: rootDir,
      stdout: "inherit",
      stderr: "inherit",
    }
  );

  const exitCode = await proc.exited;
  const elapsedSeconds = ((performance.now() - startTime) / 1000).toFixed(2);

  if (exitCode !== 0) {
    console.error(pc.red(`\n❌ Falha na compilação do executável! (Código de saída: ${exitCode})`));
    process.exit(exitCode);
  }

  if (existsSync(outfile)) {
    const stats = statSync(outfile);
    const formattedSize = formatBytes(stats.size);

    console.log(pc.green(`\n🎉 Executável gerado com sucesso em ${elapsedSeconds}s!`));
    console.log(`\n📦 ${pc.bold("Detalhes do Executável:")}`);
    console.log(`   ${pc.bold("Arquivo:")}  ${pc.cyan(outfile)}`);
    console.log(`   ${pc.bold("Tamanho:")}  ${pc.yellow(formattedSize)} (Runtime Bun + Dependências embutidas)`);

    console.log(`\n💡 ${pc.bold("Como usar o .exe gerado no Windows:")}`);
    console.log(`   1. ${pc.white("No Prompt / PowerShell:")}`);
    console.log(pc.cyan(`      .\\dist\\markiidown.exe exemplo.md`));
    console.log(`   2. ${pc.white("Para exibir direto no terminal:")}`);
    console.log(pc.cyan(`      .\\dist\\markiidown.exe exemplo.md --print`));
    console.log(`   3. ${pc.white("Para instalar no espaço do usuário e adicionar ao PATH:")}`);
    console.log(pc.cyan(`      .\\dist\\markiidown.exe --install`));
    console.log(`   4. ${pc.white("Dê duplo clique ou arraste qualquer arquivo .md para cima do executável!")}\n`);
  } else {
    console.error(pc.red(`❌ Erro: O arquivo ${outfile} não foi encontrado após o build.`));
    process.exit(1);
  }
}

buildExecutable().catch((err) => {
  console.error(pc.red(`\n❌ Erro durante o processo de build:`), err);
  process.exit(1);
});
