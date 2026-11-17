# Dependências e licenças

O MarkiiDown é distribuído sob a **GPL-3.0-or-later**. Todas as dependências
abaixo têm licenças permissivas (MIT, ISC, BSD-3-Clause, Apache-2.0), que
podem ser incorporadas num programa GPL-3.0.

## Runtime

| Componente | Licença | Para quê |
| :--- | :---: | :--- |
| [Bun](https://bun.sh) 1.4.4+ | MIT (partes LGPL/Apache) | Executa o TypeScript direto, roda os testes (`bun test`) e gera o `.exe` único (`bun build --compile`), que embute o runtime — por isso o executável tem ~110 MB e não precisa de nada instalado. Também fornece `bun:ffi` (chamadas à API do Windows) e `Bun.Terminal` (pseudoterminal usado nos testes). |

A telemetria do Bun fica desligada no projeto (`telemetry = false` em
`bunfig.toml`; o script de build e o CI também usam `DO_NOT_TRACK=1`). O
MarkiiDown em si não acessa a rede.

## Dependências do programa (`dependencies`)

| Pacote | Versão | Licença | Para quê |
| :--- | :---: | :---: | :--- |
| `marked` | 15.0 | MIT | Analisa o Markdown (tokens). A formatação para o terminal é feita pelo próprio projeto (`src/markdown-terminal.ts`); a para HTML, pelo `marked`. |
| `marked-highlight` | 2.2 | MIT | Liga o `highlight.js` aos blocos de código na exportação HTML. |
| `highlight.js` | 11.12 | BSD-3-Clause | Realce de sintaxe, no terminal (convertido para cores ANSI em `src/highlight.ts`) e no HTML. |
| `node-emoji` | 2.2 | MIT | Converte `:shortcode:` em emoji (`:tada:` → 🎉). Traz `@sindresorhus/is`, `char-regex`, `emojilib`, `skin-tone` e `unicode-emoji-modifier-base`, todos MIT. |
| `picocolors` | 1.1 | ISC | Cores ANSI. Usado sempre por `src/colors.ts`, que decide se há cores (terminal, `NO_COLOR`, `FORCE_COLOR`). |

## Dependências de desenvolvimento (`devDependencies`)

| Pacote | Licença | Para quê |
| :--- | :---: | :--- |
| `typescript` | Apache-2.0 | Verificação de tipos (`bun run typecheck`). |
| `@types/bun`, `@types/node` | MIT | Tipos das APIs do Bun e do Node. |

## Removidas na 2.1.0

| Pacote | Motivo |
| :--- | :--- |
| `marked-terminal` | Sem manutenção e fonte de vários defeitos (`ESC[0m` no começo dos parágrafos, `*#COLON|*` em cabeçalhos de tabela, linhas `---` sumindo, `#` nos títulos). Também prendia o projeto ao `marked` 15. Trazia `chalk`, `cli-table3`, `ansi-escapes`, `supports-hyperlinks` e outros. |
| `cli-highlight` | Embutia o highlight.js 10.7.3, sem manutenção: o terminal e o HTML usavam motores diferentes. Trazia `chalk`, `parse5`, `yargs` e outros. |

Com isso, a instalação passou de ~50 pacotes para 14.
