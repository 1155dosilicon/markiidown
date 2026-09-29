# LLMs Context & Architecture Guide: MarkiiDown (v2.0.0)

> Este arquivo fornece contexto técnico arquitetural para Modelos de Linguagem (LLMs) e agentes que precisem manter ou estender a base de código do **MarkiiDown**.

---

## 📌 Visão Geral do Projeto

**MarkiiDown** é um leitor e editor universal de arquivos e Markdown **100% standalone** em **TypeScript** executado pelo **Bun**, com interface interativa no terminal (TUI Pager & TUI Editor), suporte a mais de 30 linguagens de código, instalador em espaço de usuário sem privilégios de administrador (`%LOCALAPPDATA%\MarkiiDown`), ícone multi-resolução oficial embutido no PE e integrado ao Windows Explorer (Menu de Contexto, Novo Documento Markdown, Fundo de Pasta e Desktop) e compilável para binário **`.exe` (Windows x64)** sob licença **GPL-3.0**.

### Características Centrais:
1. **Zero Rede / Zero Portas:** Não inicia servidores HTTP e não abre portas no sistema.
2. **Leitor & Editor Universal (`src/utils.ts`, `src/terminal.ts`, `src/editor.ts`):**
   - Suporta arquivos Markdown (`.md`, `.markdown`), código-fonte (TypeScript, Python, Rust, Go, C/C++, SQL, HTML/CSS, Shell, etc.), arquivos de configuração (JSON, YAML, TOML, XML, ENV, Dockerfile), logs e texto plano.
   - Detecta e previne com segurança a renderização acidental de arquivos binários.
3. **Editor Interativo TUI em Tela Cheia (`src/editor.ts`):**
   - Ativado via `-E` / `--edit`, `--new` (sempre cria arquivo novo com nome único estilo Explorer) ou pressionando `e` no leitor interativo.
   - Buffer de tela cheia com numeração de linhas dinâmica, navegação precisa por cursor, inserção e remoção de caracteres/linhas, suporte a Tab (2 espaços) e auto-indentação.
   - Histórico de desfazer/refazer (Undo/Redo: `Ctrl+Z` / `Ctrl+Y`) em memória.
   - Salvamento direto e atômico no disco com `Ctrl+S` e confirmação ao fechar caso haja alterações não salvas.
4. **Leitor Interativo no Terminal (TUI Pager - `src/interactive.ts`):**
   - Utiliza Alternate Screen Buffer (`\x1B[?1049h`), quebra ANSI/Unicode responsiva sem perda de conteúdo (`wrapAnsi`), rolagem, busca interativa (`/`), sumário navegável de seções ou símbolos de código (`t`) e ajuda (`?`).
5. **Realce Sintático Confiável (`src/terminal.ts`):**
   - Sanitização de caracteres de controle antes do highlighting para preservar sequências ANSI de escape (`\x1B`).
   - Numeração de linha e extração de funções/classes/símbolos para visualização rápida.
6. **Instalador sem Administrador (`--install` / `--uninstall` - `src/installer.ts` & `src/windows-registry.ts`):**
   - Compila o executável standalone com ícone e metadados PE (`--windows-icon`, `--windows-title`, etc.) e instala em `%LOCALAPPDATA%\MarkiiDown\markiidown.exe`.
   - Copia o ícone oficial para `%LOCALAPPDATA%\MarkiiDown\markiidown.ico`.
   - Adiciona ao `PATH` do usuário (`HKCU\Environment\Path`).
   - Registra no Windows Shell via `HKCU\Software\Classes`:
     - `"Abrir com MarkiiDown"` em qualquer arquivo (`*\shell\MarkiiDown`).
     - `"Novo" -> "Documento Markdown"` (`.md\ShellNew`, `.markdown\ShellNew`, `MarkiiDown.Document`).
     - `"Novo arquivo com MarkiiDown"` (`"%V\novo.md" --new` / `"%1\novo.md" --new`) e `"Abrir pasta com MarkiiDown"` sobre pastas, no fundo de pastas e no Desktop (`Directory\shell`, `Directory\Background`, `DesktopBackground`).
     - Lista de aplicativos (`Applications\<nome-do-exe>`).
   - Guarda as associações anteriores de `.md`/`.markdown` em `HKCU\Software\MarkiiDown\Backup` e as restaura no `--uninstall` (somente se o usuário não mudou depois).
   - A resolução de pasta ignora arquivos de sistema (`desktop.ini`, `thumbs.db`) para nunca abri-los por engano.
   - Notifica o Windows Explorer para atualizar o cache de ícones imediatamente via `ie4uinit.exe -show`.
7. **Modo Impressão Direta (`--print` / `-p`):** Exibe o conteúdo formatado com cores ANSI diretamente na saída padrão (stdout).
8. **Modo Monitoramento (`--watch` / `-w`):** Observa a pasta do arquivo para sobreviver a salvamentos por substituição atômica e atualiza a exibição com debounce.
9. **Modo Exportação (`--export` / `-e`):** Converte para `.html`/`.htm` com CSS de realce embutido, numeração de linha e tema escuro/claro, sem dependências de CDN.
10. **Documentação Multilíngue:** `README.md` (Português), `README.en.md` (Inglês), `README.es.md` (Espanhol).

---

## 🏗️ Estrutura de Arquivos

```
markiidown/
├── assets/
│   └── icon.ico          # Ícone multi-resolução oficial (16x16 até 256x256)
├── dist/
│   └── markiidown.exe    # Binário portátil standalone gerado
├── exemplos/             # Arquivos de código em várias linguagens para testes
│   ├── app.ts
│   ├── script.py
│   ├── server.go
│   ├── main.rs
│   ├── programa.cpp
│   ├── query.sql
│   ├── config.yaml
│   └── Dockerfile
├── src/
│   ├── index.ts          # Ponto de entrada e despacho das ações da CLI
│   ├── cli.ts            # Parser puro e validado de argumentos da CLI
│   ├── editor.ts         # Motor do Editor TUI (Undo, Redo, Cursor, Salvamento Ctrl+S)
│   ├── interactive.ts    # Motor do TUI Pager (render loop, alternate screen, scroll, busca, sumário)
│   ├── terminal.ts       # Formatador de terminal (Markdown e código com syntax highlight)
│   ├── installer.ts      # Instalação/Desinstalação em %LOCALAPPDATA% e gerenciador de PATH em HKCU
│   ├── windows-registry.ts # Registro no menu de contexto, ShellNew, fundo de pastas e SHChangeNotify
│   ├── html-template.ts  # Gerador de HTML com CSS/scripts embutidos para exportação
│   ├── marked-terminal.d.ts # Tipagem local da extensão marked-terminal
│   └── utils.ts          # Resolução de arquivos, detecção de formato e métricas de leitura
├── tests/                # 40 testes unitários e de regressão executados por bun:test
├── scripts/
│   ├── build-exe.ts      # Script de compilação com metadados PE e ícone embutido
│   └── generate-icon.ts  # Gerador do arquivo icon.ico multi-resolução
├── exemplo.md            # Arquivo Markdown com casos de teste
├── package.json          # Metadados, scripts Bun e licença GPL-3.0-or-later
├── tsconfig.json         # Configurações do compilador TypeScript
├── LICENSE               # GNU General Public License v3.0
├── DEPENDENCIAS.md       # Documentação detalhada das dependências e análise GPL
├── README.md             # Documentação em Português (Principal)
├── README.en.md          # Documentação em Inglês
├── README.es.md          # Documentação em Espanhol
└── llms.md               # Este arquivo de contexto para agentes de IA
```

---

## 🔧 Fluxo de Instalação no Windows (`src/installer.ts`)

1. **Destino do Binário:** `%LOCALAPPDATA%\MarkiiDown\markiidown.exe`.
2. **Ícone Oficial:** `%LOCALAPPDATA%\MarkiiDown\markiidown.ico`.
3. **PATH do Usuário:** Adiciona o diretório em `HKCU\Environment\Path` sem exigir elevação UAC / Administrador.
4. **Menu de Contexto & ShellNew:** Adiciona chaves em `HKCU\Software\Classes` apontando diretamente para o `.ico` e executável.
5. **Recarregar Cache de Ícones:** Aciona `ie4uinit.exe -show` para atualização visual imediata no Explorer.

---

## 🔨 Pipeline de Compilação do Executável

```bash
bun build --compile --minify --windows-icon=assets/icon.ico --windows-title="MarkiiDown" --windows-description="Visualizador e Editor Universal de Arquivos e Markdown" --windows-publisher="MarkiiDown" --windows-version="2.0.0" --target=bun-windows-x64 ./src/index.ts --outfile ./dist/markiidown.exe
```
- Produz um executável único e portátil para Windows x64.
- Não necessita de Bun, Node ou qualquer ferramenta externa instalada no computador de destino.

---

## ✅ Validação

```bash
bun run typecheck   # tsc --noEmit
bun test            # 40 testes unitários e de regressão
bun run check       # executa ambos
```
