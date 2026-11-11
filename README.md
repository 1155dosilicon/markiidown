# 🚀 MarkiiDown

<p align="center">
  <b>🇧🇷 Português</b> | <a href="./README.en.md">🇺🇸 English</a> | <a href="./README.es.md">🇪🇸 Español</a>
</p>

<p align="center">
  <b>Visualizador e Editor Universal de Arquivos e Markdown 100% Standalone, leve e offline, desenvolvido em TypeScript com Bun.</b>
</p>

---

**MarkiiDown** é um leitor e editor universal de arquivos de alta performance projetado para rodar diretamente no terminal de forma interativa (TUI Pager & Editor) ou via linha de comando. Ele opera de forma **100% offline**, sem criar servidores web locais, sem abrir portas de rede e sem depender de editores pesados ou navegadores externos.

Ele suporta **Markdown formatado**, **código-fonte** (TypeScript, JavaScript, Python, Rust, Go, C/C++, HTML, CSS, SQL, Shell e dezenas de outros) com realce de sintaxe em tempo real, **arquivos de configuração** (JSON, YAML, TOML, XML, ENV, Dockerfile), **texto plano** e **prevenção segura contra arquivos binários**.

Inclui suporte completo a **edição interativa no terminal com salvamento no disco (`Ctrl+S`)**, **instalação em espaço de usuário (`%LOCALAPPDATA%`) sem privilégios de administrador**, integração ao **menu de contexto do Windows ("Abrir com MarkiiDown")** e compilação para executável portátil **`.exe` independente**.

---

## ✨ Recursos Principais

- 📄 **Leitor & Editor Universal**: Abre e edita Markdown, código-fonte em mais de 30 linguagens, JSON/YAML/TOML, logs e texto plano.
- ✏️ **Editor TUI Integrado (`-E` / `--edit` ou tecla `e`)**: Edição de texto em tela cheia direto no terminal com salvamento em disco (`Ctrl+S`), Undo/Redo (`Ctrl+Z`/`Ctrl+Y`), indentação por Tab, numeração de linhas e suporte a cursor live.
- 🎨 **Realce de Sintaxe Automático**: Syntax highlighting completo para código-fonte e blocos Markdown.
- 🔒 **100% Standalone & Offline**: Zero servidores HTTP, zero portas abertas e zero tráfego de rede.
- 🪟 **Instalador sem Administrador (`--install`)**: Instala em `%LOCALAPPDATA%\MarkiiDown`, adiciona automaticamente ao `PATH` do usuário e configura o menu de contexto do Windows.
- 🖱️ **Integração com o Windows Explorer**: Opção *"Abrir com MarkiiDown"* no menu de clique direito para qualquer arquivo e suporte à associação no *"Abrir com..."*.
- 📖 **Visualizador Interativo no Terminal (TUI Pager)**: Navegação suave, quebra responsiva de linhas longas sem perder conteúdo, rolagem, barra de progresso e busca em tempo real (`/`).
- 📑 **Sumário Integrado (TOC & Símbolos)**: Pressione `t` para listar e pular instantaneamente para cabeçalhos Markdown ou funções/classes/símbolos em arquivos de código.
- 💻 **Modo Impressão Direta (`--print` / `-p`)**: Exibe o arquivo formatado e colorido diretamente na saída padrão (stdout), ideal para scripts e pipes.
- 🔄 **Modo Monitoramento Contínuo (`--watch` / `-w`)**: Observa alterações e substituições atômicas do arquivo em tempo real e atualiza a tela.
- 📤 **Exportação Estática para HTML (`--export` / `-e`)**: Gera um `.html` com CSS, numeração de linhas, tema escuro/claro e realce de sintaxe embutidos, sem CDN.
- 🛡️ **Proteção contra Binários**: Detecta e impede que arquivos binários corrompam o terminal.
- 📦 **Executável Windows Standalone (`.exe`)**: Compilado via Bun, embute o runtime e todas as dependências em um único arquivo binário portátil.

---

## 📥 Requisitos

- [Bun](https://bun.sh) (v1.3+) para desenvolvimento, testes e compilação.
- *Nota:* O executável compilado (`markiidown.exe`) é totalmente autônomo e roda no Windows x64 **sem precisar de Bun, Node ou qualquer software instalado**.

---

## ⚡ Instalação Rápida no Windows (Sem Administrador)

Baixe o `markiidown.exe` na [última versão](https://github.com/1155dosilicon/markiidown/releases/latest) e, na pasta onde ele está, execute:

```powershell
# Instala em %LOCALAPPDATA%\MarkiiDown, adiciona ao PATH e ao menu de contexto
.\markiidown.exe --install

# Ou via código-fonte; este comando compila o standalone antes de instalá-lo:
bun run src/index.ts --install
```

Após a instalação:
1. O comando `markiidown` fica disponível em novas janelas do Prompt ou PowerShell (reabra o terminal após instalar).
2. Clicar com o **botão direito** no espaço vazio de qualquer pasta ou área de trabalho exibe:
   - **"Novo" -> "Documento Markdown"** (cria um arquivo `.md` imediatamente, igual ao Bloco de Notas).
   - **"Novo arquivo com MarkiiDown"** (cria `novo.md`, `novo (2).md`... naquela pasta e abre o editor).
3. Clicar com o **botão direito** em qualquer arquivo no Explorer exibe **"Abrir com MarkiiDown"**.
4. Clicar com o **botão direito sobre o ícone de uma pasta** exibe **"Novo arquivo com MarkiiDown"** (cria o arquivo dentro daquela pasta).
5. Você pode associar o MarkiiDown como aplicativo padrão no *"Abrir com..."*.

Para desinstalar e remover todas as entradas do sistema:
```powershell
markiidown --uninstall
```

---

## ⌨️ Controles e Atalhos

### 📖 No Modo Leitor (TUI Viewer):

| Tecla | Ação |
| :--- | :--- |
| **`e`** | **Abrir no Editor Interativo para alterar o arquivo** |
| **`↓` / `j` / `Enter`** | Rolar 1 linha para baixo |
| **`↑` / `k`** | Rolar 1 linha para cima |
| **`Espaço` / `PgDown`** | Rolar 1 página para baixo |
| **`PgUp` / `b`** | Rolar 1 página para cima |
| **`Home` / `g`** | Ir para o topo do documento |
| **`End` / `G`** | Ir para o final do documento |
| **`/`** | Iniciar busca no documento (digite o termo e pressione Enter) |
| **`n` / `N`** | Próxima / Anterior ocorrência da busca |
| **`t`** | Abrir Sumário ou Símbolos de Código (`↑`/`↓` e `Enter`) |
| **`?` / `h`** | Exibir painel de ajuda |
| **`q` / `Esc`** | Sair do visualizador |

### ✏️ No Modo Editor (TUI Editor):

| Tecla | Ação |
| :--- | :--- |
| **`Ctrl+S`** | **Salvar alterações no disco** |
| **`Esc` / `Ctrl+Q`** | **Sair do editor (pede confirmação se houver alterações)** |
| **`Ctrl+Z`** | Desfazer última alteração (Undo) |
| **`Ctrl+Y`** | Refazer alteração desfeita (Redo) |
| **`Setas direcionais`** | Mover cursor no documento |
| **`Home` / `End`** | Ir para o início / final da linha atual |
| **`PgUp` / `PgDown`** | Rolar tela para cima / baixo |
| **`Tab`** | Inserir indentação (2 espaços) |
| **`Enter`** | Nova linha com auto-indentação inteligente |
| **`Backspace` / `Delete`** | Apagar caracteres / unir linhas |

---

## 🚀 Modos de Uso da Linha de Comando

```bash
# 1. Abrir no leitor interativo (Padrão)
markiidown documento.md
markiidown app.ts
markiidown config.json

# 2. Abrir diretamente no editor de terminal
markiidown main.py --edit
markiidown script.ts -E

# 2b. Criar sempre um arquivo novo com nome único e abrir no editor
markiidown --new
markiidown MinhaPasta --new

# 3. Imprimir todo o conteúdo formatado e colorido direto na tela
markiidown notas.md --print
markiidown server.go -p

# 4. Monitorar alterações no arquivo em tempo real
markiidown notas.md --watch

# 5. Exportar para arquivo HTML estático autocontido
markiidown guia.md --export manual.html
markiidown index.ts -e index.html

# 6. Instalar / Desinstalar no Windows
markiidown --install
markiidown --uninstall

# 7. Exibir ajuda e versão
markiidown --help
markiidown --version
```

---

## 🔨 Compilando o Executável `.exe`

Para gerar o binário standalone:

```bash
bun run build:exe
```

O arquivo executável standalone será gerado em `dist/markiidown.exe`.

## ✅ Verificação e Testes do Projeto

```bash
# Verificação TypeScript + suíte completa de testes
bun run check

# Comandos individuais
bun run typecheck
bun test
```

## 📂 Estrutura do Projeto

```text
markiidown/
├── assets/                   # Ícone oficial multi-resolução (.ico)
│   └── icon.ico
├── dist/                     # Executável portátil compilado (.exe)
│   └── markiidown.exe
├── exemplos/                 # Arquivos de exemplo para teste de syntax highlight
│   ├── app.ts
│   ├── script.py
│   ├── server.go
│   ├── main.rs
│   ├── programa.cpp
│   ├── query.sql
│   ├── config.yaml
│   └── Dockerfile
├── src/
│   ├── index.ts              # Ponto de entrada e despacho de ações CLI
│   ├── cli.ts                # Parser validado de opções, ações e modos
│   ├── editor.ts             # Editor TUI interativo em tela cheia (Undo, Redo, Save Ctrl+S)
│   ├── interactive.ts        # Visualizador TUI Pager (Alternate screen, scroll, busca, TOC/Símbolos)
│   ├── terminal.ts           # Formatador de terminal (Markdown e código com syntax highlight)
│   ├── installer.ts          # Instalador em %LOCALAPPDATA% e gestor de PATH em HKCU
│   ├── windows-registry.ts   # Integração com Registro do Windows (HKCU, ShellNew, menus de contexto)
│   ├── html-template.ts      # Conversor de Markdown/Código para HTML estático autocontido
│   ├── marked-terminal.d.ts  # Tipagem local da extensão marked-terminal
│   └── utils.ts              # Detecção de tipo de arquivo, resolução de caminhos e métricas
├── tests/                    # 40 testes unitários e de regressão (bun test)
├── scripts/
│   ├── build-exe.ts          # Compilador com metadados PE e ícone embutido
│   └── generate-icon.ts      # Gerador de ícone multi-resolução (16x16 até 256x256)
├── exemplo.md                # Arquivo Markdown para testes gerais
├── package.json              # Configuração do projeto, dependências e scripts Bun
├── tsconfig.json             # Configuração TypeScript
├── LICENSE                   # Licença GNU General Public License v3.0 (GPL-3.0)
├── DEPENDENCIAS.md           # Justificativa de dependências e análise de licença
├── llms.md                   # Documentação técnica e arquitetura para LLMs/Agentes
├── README.md                 # Documentação em Português (Principal)
├── README.en.md              # Documentação em Inglês
└── README.es.md              # Documentação em Espanhol
```

---

## 📜 Licença

Distribuído sob a licença **GNU General Public License v3.0 (GPL-3.0-or-later)**. Consulte o arquivo [LICENSE](./LICENSE) para mais detalhes.

