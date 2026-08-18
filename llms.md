# LLMs Context & Architecture Guide: MarkiiDown (v1.1.0)

> Este arquivo fornece contexto técnico arquitetural para Modelos de Linguagem (LLMs) e agentes que precisem manter ou estender a base de código do **MarkiiDown**.

---

## 📌 Visão Geral do Projeto

**MarkiiDown** é um leitor de arquivos Markdown (`.md`) **100% standalone** em **TypeScript** executado pelo **Bun**, com interface interativa no terminal (TUI Pager), instalador em espaço de usuário sem privilégios de administrador (`%LOCALAPPDATA%\MarkiiDown`), integração com o Windows Explorer ("Abrir com MarkiiDown") e compilável para binário **`.exe` (Windows x64)** sob licença **GPL-3.0**.

### Características Centrais:
1. **Zero Rede / Zero Portas:** Não inicia servidores HTTP e não abre portas no sistema.
2. **Instalador sem Administrador (`--install` / `--uninstall`):** Instala o `.exe` em `%LOCALAPPDATA%\MarkiiDown`, registra no `PATH` do usuário (`HKCU\Environment\Path`) e associa ao menu do Windows Explorer via `HKCU\Software\Classes`.
3. **Leitor Interativo no Terminal (TUI Pager):** Utiliza o Alternate Screen Buffer (`\x1B[?1049h`), rolagem coordenada com posicionamento absoluto de linhas (`\x1B[row;1H\x1B[2K`), busca em tempo real (`/`), sumário de seções (`t`) e ajuda (`?`).
4. **Modo Impressão Direta (`--print` / `-p`):** Exibe o conteúdo formatado com cores ANSI diretamente na saída padrão (stdout).
5. **Modo Monitoramento (`--watch` / `-w`):** Observa alterações no arquivo em tempo real e atualiza a exibição.
6. **Modo Exportação (`--export` / `-e`):** Converte o arquivo para HTML estático sem abrir servidor ou navegador.
7. **Documentação Multilíngue:** `README.md` (Português), `README.en.md` (Inglês), `README.es.md` (Espanhol).
8. **Licença GPL-3.0:** Compatível com todas as dependências (`marked`, `highlight.js`, `picocolors`).

---

## 🏗️ Estrutura de Arquivos

```
markiidown/
├── src/
│   ├── index.ts          # Ponto de entrada CLI, parsing de argumentos e despacho
│   ├── interactive.ts    # Motor do TUI Pager (render loop, alternate screen, scroll, busca, sumário)
│   ├── terminal.ts       # Configuração do Marked com markedTerminal, extração de TOC e watch
│   ├── installer.ts      # Instalação/Desinstalação em %LOCALAPPDATA% e gerenciador de PATH em HKCU
│   ├── windows-registry.ts # Registro no menu de contexto (SystemFileAssociations) e "Abrir com..."
│   ├── html-template.ts  # Gerador de HTML estático autocontido para exportação
│   └── utils.ts          # Resolução de arquivos, cálculos de leitura e formatação de bytes
├── scripts/
│   └── build-exe.ts      # Script de compilação standalone com bun build --compile
├── dist/
│   └── markiidown.exe    # Binário portátil standalone gerado
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

1. **Destino do Binário:** `%LOCALAPPDATA%\MarkiiDown\markiidown.exe` (ou `~/.markiidown/bin/markiidown.exe`).
2. **PATH do Usuário:** Adiciona o diretório em `HKCU\Environment\Path` sem exigir elevação UAC / Administrador.
3. **Menu de Contexto:** Adiciona as chaves em `HKCU\Software\Classes\SystemFileAssociations\.md\shell\MarkiiDown` e `HKCU\Software\Classes\Applications\markiidown.exe`.

---

## 🔨 Pipeline de Compilação do Executável

```bash
bun build --compile --minify --target=bun-windows-x64 ./src/index.ts --outfile ./dist/markiidown.exe
```
- Produz um executável único e portátil para Windows x64.
- Não necessita de Bun, Node ou qualquer ferramenta externa instalada no computador de destino.
