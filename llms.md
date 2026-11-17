# MarkiiDown — guia técnico (para quem mantém o código, pessoas ou agentes de IA)

Leitor/editor de Markdown, código e texto para o terminal do Windows, em
TypeScript com Bun, distribuído como um único `.exe`. Este arquivo explica
**como o código está organizado, as regras que ele segue e as armadilhas já
encontradas**. Para o uso, veja o [README](README.md); para o que mudou, o
[CHANGELOG](CHANGELOG.md).

## Comandos

```powershell
bun install                    # dependências
bun run check                  # tsc --noEmit + bun test (rode sempre antes de entregar)
bun test tests/e2e.test.ts     # ponta a ponta num pseudoterminal real (ConPTY)
bun run build                  # dist\markiidown.exe
$env:MARKIIDOWN_E2E_EXE = (Resolve-Path dist\markiidown.exe).Path; bun test tests/e2e.test.ts
bun run src/index.ts --install # compila e instala em %LOCALAPPDATA%\MarkiiDown
```

## Fluxo

```
index.ts ── cli.ts (argumentos → { action | mode, arquivo, opções })
   │
   ├─ --install/--uninstall/--register ── installer.ts ── windows-registry.ts
   ├─ --edit / --new ─────────────────── editor.ts
   ├─ --export ───────────────────────── html-template.ts
   └─ leitor / --print / --watch ─────── terminal.ts: getRenderedFileLines(arquivo, { width })
                                             ├─ Markdown → markdown-terminal.ts (+ highlight.ts nos blocos)
                                             └─ código/texto → highlight.ts + numeração + sumário (utils.ts)
                                          interactive.ts (leitor) mostra essas linhas
```

`getRenderedFileLines` devolve: `lines` (prontas para a tela, com cores e
numeração), `searchLines` (texto puro sem numeração, para a busca),
`tableOfContents`, `gutterWidth` (recuo das linhas quebradas) e
`widthDependent` (Markdown depende da largura; o leitor renderiza de novo ao
redimensionar).

## Módulos

| Arquivo | Responsabilidade |
| :--- | :--- |
| `cli.ts` | Analisa argumentos sem efeitos colaterais; rejeita opções desconhecidas e combinações contraditórias. |
| `colors.ts` | **Única fonte de cores.** `colorEnabled` = sem `NO_COLOR` e (com `FORCE_COLOR` ou saída num terminal). Exporta `pc`. |
| `ansi.ts` | Texto com ANSI: estado SGR, hyperlinks OSC 8, `wrapAnsi` (com recuo e posições), `truncateAnsi`, `normalizeAnsiLines`, `highlightRanges`, `withBaseStyle`. |
| `markdown-terminal.ts` | Renderizador Markdown → linhas de terminal, já quebradas na largura, com recuo em listas/citações, alertas do GitHub, tabelas que encolhem, hyperlinks. Usa só o *lexer* do `marked`. |
| `highlight.ts` | highlight.js 11 → linhas ANSI (tema de 16 cores) e opções `--longas` de shell numa cor só. |
| `terminal.ts` | Lê e formata arquivos; modos `--print` e `--watch`; detecção de hyperlinks; `sanitizeTerminalInput`. |
| `keys.ts` | `KeyDecoder`: bytes do teclado → teclas e colagens (Esc imediato, CSI/SS3 com modificadores, bracketed paste, UTF-8 partido). |
| `terminal-io.ts` | `TerminalIO`: terminal real (`processTerminal`) ou falso (`fakeTerminal`, para testes). Liga modo raw e bracketed paste. |
| `interactive.ts` | Leitor: layout visual, rolagem, busca com destaque, sumário, ajuda, título da janela, chamada do editor. |
| `editor.ts` | Editor: buffer de linhas, histórico agrupado, colagem, salvamento, confirmação de saída, aviso de arquivo alterado no disco. |
| `text-file.ts` | Detecta e regrava a codificação (UTF-8, UTF-8 BOM, UTF-16 LE/BE, Windows-1252). |
| `safe-write.ts` | Gravação segura: temporário + `ReplaceFileW` (Windows) ou `rename`; segue links simbólicos. |
| `html-template.ts` | HTML autocontido; ids de títulos iguais aos do GitHub; HTML do Markdown escapado. |
| `installer.ts` | Instalação, `PATH` do usuário (HKCU), troca do `.exe` em uso, remoção agendada da pasta. |
| `windows-registry.ts` | Menu de contexto, "Novo", "Abrir com", associação do `.md` com backup/restauração. Só HKCU. |
| `utils.ts` | Tipo de arquivo, escolha do arquivo da pasta, nomes únicos ("novo (2).md"), sumário de código. |

## Regras que o código segue

1. **Toda linha entregue à tela é autocontida**: abre os estilos de que precisa
   e fecha tudo no fim (SGR e hyperlink). Assim qualquer linha pode ser
   desenhada sozinha, em qualquer ordem, sem herdar nem vazar estilo.
   `wrapAnsi`/`truncateAnsi` preservam isso; `normalizeAnsiLines` conserta
   linhas que não seguem.
2. **Cores só por `src/colors.ts`** (`import { pc } from "./colors.ts"`), nunca
   `import pc from "picocolors"` direto: o padrão do picocolors liga cores no
   Windows mesmo com a saída redirecionada.
3. **Conteúdo de arquivo nunca vai cru para o terminal.** O leitor passa tudo
   por `sanitizeTerminalInput`; o editor mostra controles como símbolos
   (`cellOf`); entidades `&#27;` não são decodificadas.
4. **Ordem ao sair do leitor/editor: primeiro sair da tela alternativa
   (`ESC[?1049l`), depois desligar o modo raw.** Ao contrário, no Windows
   (ConPTY/Windows Terminal), o console do processo fica inválido: toda escrita
   seguinte dá EPIPE e `setRawMode` falha com errno 32. Detalhes em
   `terminal-io.ts`. O teste "leitor → editor → salvar" pega isso.
5. **Teclado só via `TerminalIO.startInput`** (`KeyDecoder`). Não use
   `readline.emitKeypressEvents`: espera 500 ms no Esc e junta Esc + tecla
   seguinte em "Alt+tecla".
6. **Larguras com `Bun.stringWidth`** (ignora ANSI, conta emoji/CJK como 2).
   TAB é expandido antes (`expandTabsAnsi`), porque `stringWidth("\t")` é 0.
7. **Salvar sempre por `writeFileSafely`**, preservando codificação e final de
   linha do arquivo.
8. **Registro só em HKCU** e nunca apontando para arquivos dentro da pasta do
   projeto (o usuário apaga `~/proj` de vez em quando). A associação anterior
   do `.md` é guardada em `HKCU\Software\MarkiiDown\Backup` e restaurada só se
   ainda for a nossa.
9. **Cada correção vem com teste de regressão** e uma entrada no CHANGELOG
   dizendo o que acontecia e o que acontece agora.

## Testes

| Arquivo | O que cobre |
| :--- | :--- |
| `ansi.test.ts`, `keys.test.ts` | Utilidades ANSI e decodificador de teclado. |
| `markdown-terminal.test.ts`, `highlight.test.ts` | Renderização de Markdown e realce. |
| `interactive.test.ts`, `editor.test.ts` | Leitor e editor com `fakeTerminal`; a tela é reconstruída por `tests/support/virtual-terminal.ts`. |
| `e2e.test.ts` | Programa inteiro num pseudoterminal real (`Bun.Terminal` → ConPTY no Windows). |
| demais | CLI, arquivos/codificação, HTML, instalador, Registro (funções puras), salvamento seguro. |

- `bunfig.toml` carrega `tests/support/setup.ts`, que liga `NO_COLOR`: os
  testes dão o mesmo resultado num terminal ou no CI. Testes que conferem cores
  rodam um processo filho com `FORCE_COLOR=1` ou passam `createColors(true)`.
- `tests/support/tui.ts` (`launchTui`) abre o programa num pseudoterminal e
  permite `write(teclas)`, `waitForText`, `settle` e `screen` (grade com
  texto e atributos de cada célula). `screen-dump.ts` imprime a tela com os
  estilos, útil para depurar.

## Armadilhas já encontradas

- **Bun + `String.raw` com acentos**: o transpilador do Bun 1.4 transforma
  `é` em `é` literal dentro de `String.raw`. Não use `String.raw` com
  texto não ASCII.
- **Ctrl+C em testes**: o pseudoterminal do `Bun.Terminal` não converte Ctrl+C
  em SIGINT (nem para `ping`). Teste o tratamento de SIGINT com
  `process.emit("SIGINT")`.
- **ConPTY reescreve a saída**: o que chega ao terminal não é o que o programa
  escreveu, por isso os testes reconstroem a tela em vez de comparar bytes.
- **`.exe` em uso não pode ser sobrescrito** (EBUSY/EPERM), mas pode ser
  renomeado — é o que `swapExecutable` faz.
- **Processos filhos do Bun morrem com ele** (Job do Windows). A remoção da
  pasta na desinstalação usa `cmd /c start` para o PowerShell sobreviver.
- **`reg.exe`** chamado pelo Bun escreve em UTF-8 (o Bun troca a página de
  código do console), então valores com acento no Registro funcionam.
- **`process.title`** no Windows devolve o título atual do console; é assim
  que o leitor restaura o título ao sair.
- **Testes de desempenho**: meça com entradas pequenas e crescentes. Uma linha
  gigante contra código quadrático já esgotou a memória e travou o PC.

## Publicar uma versão

1. Atualize `version` no `package.json` (é a única fonte da versão; o `.exe`
   e o `--version` leem dela).
2. Escreva a seção no `CHANGELOG.md`.
3. `bun run check` e os testes de ponta a ponta contra o `.exe`.
4. Crie a tag `vX.Y.Z` e envie: o GitHub Actions (`.github/workflows/release.yml`)
   roda os testes, gera o `.exe` e anexa à release.
