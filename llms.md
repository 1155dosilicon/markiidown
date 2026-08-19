# LLMs Context & Architecture Guide: MarkiiDown (v1.1.0)

> Este arquivo fornece contexto técnico arquitetural para Modelos de Linguagem (LLMs) e agentes que precisem manter ou estender a base de código do **MarkiiDown**.

---

## 📌 Visão Geral do Projeto

**MarkiiDown** é um leitor de arquivos Markdown (`.md` e `.markdown`) **100% standalone** em **TypeScript** executado pelo **Bun**, com interface interativa no terminal (TUI Pager), instalador em espaço de usuário sem privilégios de administrador (`%LOCALAPPDATA%\MarkiiDown`), integração com o Windows Explorer ("Abrir com MarkiiDown") e compilável para binário **`.exe` (Windows x64)** sob licença **GPL-3.0**.

### Características Centrais:
1. **Zero Rede / Zero Portas:** Não inicia servidores HTTP e não abre portas no sistema.
2. **Instalador sem Administrador (`--install` / `--uninstall`):** Instala o `.exe` em `%LOCALAPPDATA%\MarkiiDown`, registra no `PATH` do usuário (`HKCU\Environment\Path`) e associa ao menu do Windows Explorer via `HKCU\Software\Classes`.
3. **Leitor Interativo no Terminal (TUI Pager):** Utiliza o Alternate Screen Buffer (`\x1B[?1049h`), quebra ANSI/Unicode responsiva sem descartar trechos longos, rolagem coordenada, busca (`/`), sumário navegável (`t`, setas e `Enter`) e ajuda (`?`). O layout é recalculado ao redimensionar e o TUI só é ativado quando stdin e stdout são TTYs.
   - `marked-terminal` opera com `reflowText: false`; sua quebra nativa pode separar sequências ANSI do texto. Toda quebra visual é responsabilidade de `wrapAnsi` em `interactive.ts`.
   - Um adaptador do renderer `text` percorre tokens inline aninhados do `marked` 15, mantendo `strong`, `codespan` e outros estilos corretos dentro de listas.
4. **Modo Impressão Direta (`--print` / `-p`):** Exibe o conteúdo formatado com cores ANSI diretamente na saída padrão (stdout).
   - O realce sintático usa `cli-highlight` somente quando o fence declara uma linguagem. `languageSubset: []` desativa autodetecção em blocos sem identificador, evitando falsos positivos em texto comum e árvores de arquivos. Um pós-processamento ANSI reconhece opções longas de CLI (`--install`, `--export=arquivo`) como tokens atômicos, impedindo que gramáticas shell/PowerShell deixem o primeiro hífen com outra cor.
5. **Modo Monitoramento (`--watch` / `-w`):** Observa a pasta do arquivo para sobreviver a salvamentos por substituição atômica e atualiza a exibição com debounce.
6. **Modo Exportação (`--export` / `-e`):** Converte para `.html`/`.htm` com CSS de realce embutido, sem CDN. HTML bruto é escapado e protocolos perigosos são neutralizados; recursos referenciados pelo Markdown continuam externos.
7. **Documentação Multilíngue:** `README.md` (Português), `README.en.md` (Inglês), `README.es.md` (Espanhol).
8. **Licença GPL-3.0:** Compatível com todas as dependências (`marked`, `highlight.js`, `picocolors`).

---

## 🏗️ Estrutura de Arquivos

```
markiidown/
├── src/
│   ├── index.ts          # Ponto de entrada e despacho das ações da CLI
│   ├── cli.ts            # Parser puro e validado de argumentos da CLI
│   ├── interactive.ts    # Motor do TUI Pager (render loop, alternate screen, scroll, busca, sumário)
│   ├── terminal.ts       # Configuração do Marked com markedTerminal, extração de TOC e watch
│   ├── installer.ts      # Instalação/Desinstalação em %LOCALAPPDATA% e gerenciador de PATH em HKCU
│   ├── windows-registry.ts # Registro no menu de contexto (SystemFileAssociations) e "Abrir com..."
│   ├── html-template.ts  # Gerador de HTML com CSS/scripts embutidos para exportação
│   ├── marked-terminal.d.ts # Tipagem local da extensão marked-terminal
│   └── utils.ts          # Resolução de arquivos, cálculos de leitura e formatação de bytes
├── tests/                # Testes de regressão executados por bun:test
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

1. **Destino do Binário:** `%LOCALAPPDATA%\MarkiiDown\markiidown.exe`. A instalação automática é limitada ao Windows.
2. **PATH do Usuário:** Adiciona o diretório em `HKCU\Environment\Path` sem exigir elevação UAC / Administrador.
3. **Menu de Contexto:** Adiciona as chaves em `HKCU\Software\Classes\SystemFileAssociations\.md\shell\MarkiiDown` e `HKCU\Software\Classes\Applications\markiidown.exe`.

Quando `--install` é executado via código-fonte (`bun run src/index.ts --install`), o instalador primeiro compila um executável standalone; ele nunca copia `bun.exe` como se fosse a aplicação. Ao desinstalar a partir do binário instalado, a remoção do diretório é agendada para depois que o processo terminar.

O novo PATH vale para processos abertos depois da instalação; o terminal atual precisa ser reaberto.

---

## 🔨 Pipeline de Compilação do Executável

```bash
bun build --compile --minify --target=bun-windows-x64 ./src/index.ts --outfile ./dist/markiidown.exe
```
- Produz um executável único e portátil para Windows x64.
- Não necessita de Bun, Node ou qualquer ferramenta externa instalada no computador de destino.

---

## ✅ Validação

```bash
bun run typecheck   # tsc --noEmit
bun test            # testes unitários e de regressão
bun run check       # executa ambos
```

Os testes cobrem parsing estrito da CLI, resolução de `.md`/`.markdown`, ANSI, Unicode e quebra de linhas sem perda, estilos inline em parágrafos/cabeçalhos/listas/citações/tabelas, blocos tipados e não tipados, TOC sem falsos positivos, segurança do HTML e helpers do instalador.
