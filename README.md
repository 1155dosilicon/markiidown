# 🚀 MarkiiDown

<p align="center">
  <b>🇧🇷 Português</b> | <a href="./README.en.md">🇺🇸 English</a> | <a href="./README.es.md">🇪🇸 Español</a>
</p>

<p align="center">
  <b>Leitor de Markdown (.md e .markdown) 100% Standalone, leve e offline, desenvolvido em TypeScript com Bun.</b>
</p>

---

**MarkiiDown** é um leitor de Markdown de alta performance projetado para rodar diretamente no terminal de forma interativa (TUI Pager) ou via linha de comando. Ele opera de forma **100% offline**, sem criar servidores web locais, sem abrir portas de rede e sem depender de navegadores externos.

Inclui suporte completo a **instalação em espaço de usuário (`%LOCALAPPDATA%`) sem privilégios de administrador**, integração ao **menu de contexto do Windows ("Abrir com MarkiiDown")** e compilação para executável portátil **`.exe` independente**.

---

## ✨ Recursos Principais

- 🔒 **100% Standalone & Offline**: Zero servidores HTTP, zero portas abertas e zero tráfego de rede.
- 🪟 **Instalador sem Administrador (`--install`)**: Instala em `%LOCALAPPDATA%\MarkiiDown`, adiciona automaticamente ao `PATH` do usuário e configura o menu de contexto do Windows.
- 🖱️ **Integração com o Windows Explorer**: Opção *"Abrir com MarkiiDown"* no menu de clique direito e suporte à associação no *"Abrir com..."*.
- 📖 **Visualizador Interativo no Terminal (TUI Pager)**: Navegação suave, quebra responsiva de linhas longas sem perder conteúdo, rolagem, barra de progresso e busca em tempo real (`/`).
- 🎨 **Realce de Código Explícito**: Blocos como `` ```ts `` e `` ```python `` recebem cores; blocos sem linguagem permanecem neutros para não colorir palavras comuns por engano. Opções longas de CLI, como `--install`, são coloridas como um token inteiro inclusive em blocos shell/PowerShell.
- 📑 **Sumário Integrado (TOC)**: Pressione `t` para listar e pular instantaneamente para qualquer seção do documento.
- 💻 **Modo Impressão Direta (`--print` / `-p`)**: Exibe o Markdown formatado e colorido diretamente na saída padrão (stdout), ideal para scripts e pipes.
- 🔄 **Modo Monitoramento Contínuo (`--watch` / `-w`)**: Observa alterações e substituições atômicas do arquivo em tempo real e atualiza a tela.
- 📤 **Exportação Estática para HTML (`--export` / `-e`)**: Gera um `.html` com CSS e realce de sintaxe embutidos, sem CDN.
- 📦 **Executável Windows Standalone (`.exe`)**: Compilado via Bun, embute o runtime e todas as dependências em um único arquivo binário portátil.

---

## 📥 Requisitos

- [Bun](https://bun.sh) (v1.3+) para desenvolvimento, testes e compilação.
- *Nota:* O executável compilado (`markiidown.exe`) é totalmente autônomo e roda no Windows x64 **sem precisar de Bun, Node ou qualquer software instalado**.

---

## ⚡ Instalação Rápida no Windows (Sem Administrador)

Com o executável `markiidown.exe` ou código-fonte em mãos, basta executar:

```powershell
# Instala em %LOCALAPPDATA%\MarkiiDown, adiciona ao PATH e ao menu de contexto
.\dist\markiidown.exe --install

# Ou via código-fonte; este comando compila o standalone antes de instalá-lo:
bun run src/index.ts --install
```

Após a instalação:
1. O comando `markiidown` fica disponível em novas janelas do Prompt ou PowerShell (reabra o terminal após instalar).
2. Clicar com o **botão direito** em qualquer arquivo `.md` exibe a opção **"Abrir com MarkiiDown"**.
3. Você pode associar o MarkiiDown como aplicativo padrão para arquivos Markdown.

Para desinstalar e remover todas as entradas do sistema:
```powershell
markiidown --uninstall
```

---

## ⌨️ Controles do Modo Interativo (TUI Pager)

| Tecla | Ação |
| :--- | :--- |
| **`↓` / `j` / `Enter`** | Rolar 1 linha para baixo |
| **`↑` / `k`** | Rolar 1 linha para cima |
| **`Espaço` / `PgDown`** | Rolar 1 página para baixo |
| **`PgUp` / `b`** | Rolar 1 página para cima |
| **`Home` / `g`** | Ir para o topo do documento |
| **`End` / `G`** | Ir para o final do documento |
| **`/`** | Iniciar busca no documento (digite o termo e pressione Enter) |
| **`n` / `N`** | Próxima / Anterior ocorrência da busca |
| **`t`** | Abrir Sumário; use `↑`/`↓` e `Enter` para escolher a seção |
| **`?` / `h`** | Exibir painel de ajuda |
| **`q` / `Esc`** | Sair do visualizador |

---

## 🚀 Modos de Uso da Linha de Comando

```bash
# 1. Abrir no leitor interativo (Padrão)
markiidown documento.md

# 2. Imprimir todo o conteúdo formatado direto na tela
markiidown notas.md --print

# 3. Monitorar alterações no arquivo em tempo real
markiidown notas.md --watch

# 4. Exportar para arquivo HTML estático
markiidown guia.md --export manual.html

# 5. Instalar / Desinstalar no Windows
markiidown --install
markiidown --uninstall

# 6. Exibir ajuda e versão
markiidown --help
markiidown --version
```

São aceitos arquivos com extensão `.md` e `.markdown`. Caminhos explícitos inexistentes, opções desconhecidas e combinações de modos incompatíveis encerram com código diferente de zero, sem abrir silenciosamente outro arquivo.

O HTML exportado não carrega folhas de estilo ou scripts de CDN. HTML bruto do Markdown é exibido como texto e protocolos perigosos, como `javascript:`, são neutralizados. Links e imagens indicados pelo próprio documento continuam apontando para seus destinos e podem exigir rede quando o HTML for aberto.

---

## 🔨 Compilando o Executável `.exe`

Para gerar o binário standalone:

```bash
bun run build:exe
```

O arquivo executável standalone será gerado em [`dist/markiidown.exe`](./dist/markiidown.exe).

## ✅ Verificação do Projeto

```bash
# TypeScript + testes de regressão
bun run check

# Comandos separados
bun run typecheck
bun test
```

---

## 📂 Estrutura do Projeto

```text
markiidown/
├── dist/                     # Executável portátil compilado (.exe)
│   └── markiidown.exe
├── src/
│   ├── index.ts              # Ponto de entrada e despacho da CLI
│   ├── cli.ts                # Parser validado de opções, ações e modos
│   ├── interactive.ts        # TUI Pager (Alternate screen, scroll, busca, TOC)
│   ├── terminal.ts           # Formatador ANSI (marked + marked-terminal) e watch
│   ├── installer.ts          # Instalador em %LOCALAPPDATA% e gerenciador de PATH
│   ├── windows-registry.ts   # Integração com Registro do Windows (HKCU)
│   ├── html-template.ts      # Conversor de Markdown para HTML estático
│   ├── marked-terminal.d.ts  # Tipagem local do marked-terminal
│   └── utils.ts              # Utilitários de sistema, caminhos e estatísticas
├── tests/                    # Testes de regressão com bun:test
├── scripts/
│   └── build-exe.ts          # Script de compilação standalone com Bun
├── exemplo.md                # Arquivo Markdown com casos de teste
├── package.json              # Configurações do projeto e scripts
├── tsconfig.json             # Configuração TypeScript
├── LICENSE                   # Licença GNU General Public License v3.0 (GPL-3.0)
├── DEPENDENCIAS.md           # Detalhes das dependências e compatibilidade de licenças
├── llms.md                   # Documentação arquitetural para LLMs
├── README.md                 # Documentação em Português (Principal)
├── README.en.md              # Documentation in English
└── README.es.md              # Documentación en Español
```

---

## 📜 Licença

Distribuído sob a licença **GNU General Public License v3.0 (GPL-3.0-or-later)**. Consulte o arquivo [LICENSE](./LICENSE) para mais detalhes.
