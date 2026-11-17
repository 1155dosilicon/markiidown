# MarkiiDown

<p align="center">
  <b>🇧🇷 Português</b> | <a href="./README.en.md">🇺🇸 English</a> | <a href="./README.es.md">🇪🇸 Español</a>
</p>

Leitor e editor de **Markdown**, **código** e **texto** para o terminal do
Windows. Um único `markiidown.exe`, sem instalar nada além dele, 100% offline
(não abre portas nem acessa a rede).

- **Leitor**: Markdown formatado (títulos, listas, tabelas, citações, alertas
  do GitHub, links, emoji), código com realce de sintaxe em dezenas de
  linguagens, busca, sumário e rolagem.
- **Editor** no próprio terminal: desfazer/refazer, colar sem bagunçar a
  indentação, salvamento seguro que mantém a codificação do arquivo.
- **Exportação** para um arquivo HTML autocontido (tema claro/escuro, sumário,
  pronto para imprimir ou salvar como PDF).
- **Integração com o Explorer**, sem administrador: “Abrir com MarkiiDown”,
  “Novo → Documento Markdown”, “Novo arquivo com MarkiiDown”.

O que mudou em cada versão está em [CHANGELOG.md](CHANGELOG.md).

## Instalação (Windows)

Baixe o `markiidown.exe` da [última versão](https://github.com/1155dosilicon/markiidown/releases/latest)
e, na pasta onde ele está:

```powershell
.\markiidown.exe --install
```

Isso:

1. copia o programa para `%LOCALAPPDATA%\MarkiiDown\markiidown.exe`;
2. adiciona essa pasta ao `PATH` do seu usuário (abra um terminal novo depois);
3. registra no Explorer (só no seu usuário, em `HKCU\Software\Classes`):
   - **Abrir com MarkiiDown** no botão direito de qualquer arquivo;
   - **Novo → Documento Markdown** e **Novo arquivo com MarkiiDown** no fundo
     das pastas e da área de trabalho;
   - o MarkiiDown na lista **Abrir com...**, para virar o padrão do `.md`.

A associação anterior de `.md`/`.markdown` é guardada e volta na desinstalação.
Pode rodar o `--install` de novo para atualizar, mesmo com o MarkiiDown aberto
em outra janela.

Para remover tudo (programa, `PATH` e Registro):

```powershell
markiidown --uninstall
```

> [!NOTE]
> No Windows 11, os itens do botão direito ficam em **Mostrar mais opções**
> (ou Shift+F10). O menu novo do Windows 11 só aceita programas empacotados.

## Uso

```powershell
markiidown                         # abre o README.md da pasta (ou o 1º Markdown/texto)
markiidown notas.md                # leitor interativo
markiidown script.py --edit        # editor
markiidown --new                   # cria "novo.md" (ou "novo (2).md"...) e abre o editor
markiidown config.json --print     # imprime formatado e sai
markiidown notas.md --watch        # atualiza a tela a cada salvamento (Ctrl+C sai)
markiidown guia.md -e guia.html    # exporta para HTML
markiidown app.ts --raw            # texto puro, sem formatação nem numeração
markiidown leia.md --numbers       # numera as linhas
markiidown --help                  # todas as opções
```

Um arquivo que não existe é aberto no editor para ser criado (como no Bloco de Notas).

### Teclas do leitor

| Tecla | Ação |
| :--- | :--- |
| `↓` `j` `Enter` / `↑` `k` | Descer / subir uma linha |
| `Espaço` `PgDn` `f` / `PgUp` `b` | Página para baixo / para cima |
| `Home` `g` / `End` `G` | Início / fim |
| `/` | Buscar (sem diferenciar maiúsculas; Enter com a busca vazia limpa os destaques) |
| `n` / `N` | Próxima / anterior ocorrência |
| `t` | Sumário: títulos do Markdown ou funções e classes do código |
| `e` | Editar o arquivo (volta ao leitor já atualizado) |
| `?` `h` | Ajuda |
| `q` `Esc` `Ctrl+C` | Sair |

### Teclas do editor

| Tecla | Ação |
| :--- | :--- |
| `Ctrl+S` | Salvar |
| `Esc` `Ctrl+Q` | Sair (pergunta se há alterações: **S**alvar, **D**escartar ou Esc para continuar) |
| `Ctrl+Z` / `Ctrl+Y` | Desfazer / refazer (por palavra ou ação) |
| `Tab` / `Shift+Tab` | Indentar / desindentar (usa a indentação do arquivo) |
| `Enter` | Nova linha mantendo a indentação |
| `Ctrl+←` `Ctrl+→` | Pular palavra |
| `Home` / `End` | Início do texto da linha, depois coluna 1 / fim da linha |
| `Ctrl+Home` / `Ctrl+End` | Início / fim do arquivo |
| `PgUp` / `PgDn` | Página acima / abaixo |
| `Alt+Backspace` / `Ctrl+Delete` | Apagar palavra anterior / seguinte |
| Colar (`Ctrl+V` ou botão direito) | Insere o texto exatamente como copiado |

## Detalhes que valem saber

- **Codificação**: UTF-8, UTF-8 com BOM, UTF-16 (com BOM) e ANSI/Windows-1252
  (o “ANSI” do Bloco de Notas) são detectados e o arquivo é salvo na mesma
  codificação. Se você digitar um caractere que não existe no ANSI (um emoji,
  por exemplo), o arquivo é salvo em UTF-8 e o editor avisa.
- **Finais de linha**: o editor mantém o do arquivo (CRLF, LF ou CR). Se o
  arquivo misturar tipos, avisa e salva com o predominante.
- **Salvamento seguro**: o conteúdo novo vai para um arquivo temporário na
  mesma pasta e substitui o original de uma vez, mantendo atributos e
  permissões. Se o arquivo foi alterado por outro programa desde que foi
  aberto, o editor pergunta antes de sobrescrever.
- **Saída redirecionada**: `markiidown x.md -p > saida.txt` grava só o texto,
  sem cores. `NO_COLOR=1` desliga as cores; `FORCE_COLOR=1` força.
- **Links**: no Windows Terminal, links `http(s)` e `mailto` são clicáveis
  (Ctrl+clique). Em outros terminais o endereço aparece entre parênteses.
  `FORCE_HYPERLINK=0` ou `1` decide manualmente.
- **Segurança**: códigos de controle do arquivo nunca chegam ao terminal (um
  arquivo não consegue mudar título, cores ou apagar a tela). Na exportação,
  HTML escrito dentro do Markdown aparece como texto, nunca é executado, e
  links `javascript:`/`data:` são removidos.
- **Binários** (imagens, executáveis, zip...) não são abertos como texto.

## Limitações conhecidas

- O menu de contexto fica em “Mostrar mais opções” no Windows 11 (veja acima).
- No terminal, imagens aparecem como `[imagem: descrição] (endereço)`; diagramas
  Mermaid e fórmulas aparecem como código.
- HTML dentro do Markdown aparece como texto (no terminal, esmaecido).
- O `.exe` tem ~110 MB porque embute o runtime do Bun.
- A detecção de “ANSI” assume Windows-1252 (português e demais línguas da
  Europa Ocidental). Arquivos em outras páginas de código (ex.: cirílico em
  1251) aparecem com caracteres trocados.

## Solução de problemas

| Problema | Solução |
| :--- | :--- |
| `markiidown` não é reconhecido depois do `--install` | Abra um terminal novo (o `PATH` vale para janelas abertas depois da instalação). |
| Os itens não aparecem no botão direito | No Windows 11, use **Mostrar mais opções**. Rode `markiidown --register` para registrar de novo. |
| Acentos trocados num arquivo antigo | O arquivo provavelmente não é UTF-8 nem Windows-1252. Converta para UTF-8 no Bloco de Notas (Salvar como → Codificação). |
| A tela fica estranha depois de fechar à força | Rode `cls` (ou feche e abra a aba). |

## Desenvolvimento

Requisitos: [Bun](https://bun.sh) 1.4.4 ou mais novo, no Windows (o projeto
também roda no Linux/macOS, mas a integração com o Explorer é só Windows).

```powershell
bun install            # dependências
bun run start x.md     # roda pelo código-fonte
bun run check          # verificação de tipos + todos os testes
bun test               # só os testes
bun test tests/e2e.test.ts                     # só os de ponta a ponta
bun run build          # gera dist\markiidown.exe (com ícone e versão)
bun run src/index.ts --install                 # compila e instala
```

Para rodar os testes de ponta a ponta contra o executável compilado:

```powershell
$env:MARKIIDOWN_E2E_EXE = (Resolve-Path dist\markiidown.exe).Path
bun test tests/e2e.test.ts
```

Os testes de ponta a ponta abrem o MarkiiDown num pseudoterminal de verdade
(ConPTY, o mesmo motor do Windows Terminal), mandam teclas e conferem a tela
reconstruída, incluindo cores e estilos.

A arquitetura, as regras que o código segue e as armadilhas encontradas estão
em [`llms.md`](llms.md). As dependências e licenças, em
[`DEPENDENCIAS.md`](DEPENDENCIAS.md).

### Estrutura

```text
src/
  index.ts             ponto de entrada: interpreta a CLI e escolhe o modo
  cli.ts               análise e validação dos argumentos (sem efeitos colaterais)
  terminal.ts          lê o arquivo e gera as linhas da tela; modos --print e --watch
  markdown-terminal.ts renderizador de Markdown para o terminal
  highlight.ts         realce de sintaxe (highlight.js → cores ANSI)
  interactive.ts       leitor interativo (rolagem, busca, sumário, ajuda)
  editor.ts            editor de texto
  keys.ts              decodificador de teclado (Esc, setas, colagem...)
  terminal-io.ts       acesso ao terminal (real ou falso, para testes)
  ansi.ts              utilidades de texto com cores: quebra, corte, largura
  colors.ts            decide se há cores (TTY, NO_COLOR, FORCE_COLOR)
  text-file.ts         detecção e preservação da codificação
  safe-write.ts        gravação segura (ReplaceFileW no Windows)
  html-template.ts     exportação HTML
  installer.ts         --install / --uninstall e PATH do usuário
  windows-registry.ts  menu de contexto, "Novo", "Abrir com" e associação do .md
  utils.ts             tipos de arquivo, escolha do arquivo da pasta, sumário de código
  version.ts           versão (lida do package.json)
tests/                 testes (bun test); tests/support/ tem o pseudoterminal e o emulador de tela
scripts/               build-exe.ts (gera o .exe) e generate-icon.ts (gera assets/icon.ico)
exemplos/              arquivos de código para testar o realce
exemplo.md             documento de demonstração
```

## Licença

[GPL-3.0-or-later](LICENSE).
