# Histórico de mudanças

Cada item diz **o que acontecia** e **o que acontece agora**. Todos os bugs
listados foram reproduzidos antes da correção e têm teste automático que
impede a volta (veja [Como testar](README.md#desenvolvimento)).

## 2.1.0 — 17/11/2026

### Leitor (modo padrão)

- **Esc demorava meio segundo e “engolia” a tecla seguinte.** Esc seguido
  rápido de outra tecla virava “Alt+tecla”: Esc e depois `/` não abria a
  busca. Agora o Esc responde na hora e nunca se junta à próxima tecla.
- **Citações e alertas perdiam o estilo.** Só o recuo saía em itálico/cinza;
  o texto vinha sem formatação (um `ESC[0m` era inserido no começo de cada
  parágrafo quando a saída era um terminal).
- **Estilos que atravessam linhas sumiam ao rolar.** Um negrito ou uma citação
  de várias linhas só aparecia certo com a primeira linha na tela; ao rolar,
  o resto ficava sem cor — e a cor podia vazar para a barra de status. Agora
  cada linha da tela é independente.
- **A barra de status estourava em terminais estreitos** (menos de ~35
  colunas) e a tela inteira subia uma linha a cada tecla. Agora ela sempre cabe.
- **Links clicáveis (Windows Terminal) podiam “vazar”**: um link quebrado em
  duas linhas deixava a barra de status clicável. Agora o link é fechado e
  reaberto em cada linha.
- **Título da janela não voltava** ao sair (ficava “MarkiiDown - arquivo”).
- **Busca:** não avisava quando não achava nada, destacava a linha inteira
  (apagando as cores) e ficava errada depois de editar o arquivo. Agora
  destaca só as ocorrências, mostra “3/12” na barra, avisa “Nenhuma
  ocorrência”, começa da posição atual e recomeça do início com aviso.
- **Sumário (`t`)** agora abre já na seção que está na tela e mostra a
  hierarquia dos títulos com recuo.
- **Redimensionar a janela** agora reorganiza o Markdown na nova largura.
- Linhas longas de código quebram alinhadas depois da numeração.

### Formatação de Markdown no terminal

- **Títulos mostravam os `#`** e todo subtítulo saía na mesma cor. Agora sem
  `#`, com uma cor por nível.
- **Alertas do GitHub** (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`,
  `[!CAUTION]`) apareciam crus; agora viram “Nota”, “Dica”, “Importante”,
  “Atenção” e “Cuidado”, com barra colorida.
- **Linhas `---` sumiam** com `--print` redirecionado e quebravam em duas com
  `--numbers`.
- **Cabeçalho de tabela com código contendo `:`** mostrava o lixo interno
  `*#COLON|*`. Tabelas agora respeitam o alinhamento (`:---:`) e encolhem para
  caber na tela, quebrando o texto das células.
- **Texto forçado em branco** (negrito, itálico, itens de lista e o texto do
  editor) ficava invisível em temas claros do terminal. Agora usa a cor
  padrão do tema.
- Parágrafos agora seguem a regra do Markdown (quebra simples vira espaço) e
  são reorganizados na largura da tela; listas e citações mantêm o recuo nas
  linhas quebradas.
- Front matter YAML (`---` no topo) virava linha horizontal + título falso;
  agora aparece como bloco YAML.
- Entidades HTML (`&amp;`, `&copy;`, `&#233;`) são convertidas; códigos de
  controle (`&#27;`) não, para um documento não conseguir mandar comandos ao
  terminal.
- Realce de sintaxe do terminal e do HTML agora usam o mesmo motor
  (highlight.js 11). Antes o terminal usava uma cópia antiga (10.7.3, sem
  manutenção) que reconhecia outras linguagens.
- Arquivos com quebra de linha só com CR (Mac antigo) mostravam linhas se
  sobrescrevendo; agora são lidos corretamente.

### Editor

- **Colar código acumulava indentação** (cada linha colada recebia a
  indentação da anterior mais a própria). Agora o texto colado entra
  exatamente como copiado, num único passo de desfazer.
- **Ctrl+Z desfazia uma letra por vez** e só as últimas 100. Agora desfaz por
  palavra/ação, com histórico bem maior.
- **Desfazer até o estado salvo continuava “Modificado”** e o Esc pedia
  confirmação à toa. Agora volta a “salvo”.
- **Caracteres de controle do arquivo eram enviados ao terminal**: um log com
  cores ANSI ou um `ESC` mudava as cores, o título da janela e desalinhava o
  cursor. Agora aparecem como símbolos visíveis (`␛`, `␇`...).
- **Salvamento não era seguro** (a documentação dizia “atômico”, mas o arquivo
  era sobrescrito direto: queda de energia ou disco cheio no meio deixava o
  arquivo truncado). Agora o conteúdo vai para um temporário e substitui o
  original de uma vez (`ReplaceFileW` no Windows), mantendo atributos e
  permissões do arquivo.
- **Arquivo alterado por outro programa** enquanto estava aberto era
  sobrescrito sem aviso. Agora o editor pergunta antes.
- **Linha/coluna sumiam do cabeçalho** em janelas estreitas ou com nome de
  arquivo longo.
- Arquivos só com CR ou com finais de linha misturados mantêm/normalizam o
  final de linha (com aviso).
- Novo: Tab usa a indentação do arquivo (TAB num Makefile, 4 espaços em
  Python), Shift+Tab desindenta, Ctrl+←/→ pulam palavras, Ctrl+Home/End vão
  ao início/fim do arquivo, Alt+Backspace e Ctrl+Delete apagam palavras.

### Linha de comando e saída redirecionada

- **`--print`/`--help` redirecionados gravavam códigos de cor** no arquivo
  (`markiidown x.md -p > saida.txt`). Agora cores só vão para o terminal;
  `NO_COLOR` e `FORCE_COLOR` são respeitados. Redirecionado, o `--print` sai
  só com o conteúdo, sem o cabeçalho decorativo.
- **`--export` podia apagar o próprio arquivo** (`pagina.html -e pagina.html`).
  Agora recusa.
- Erros inesperados não deixam mais o terminal preso no modo do leitor/editor.

### Exportação HTML

- **Imprimir no tema escuro gerava texto cinza-claro no papel branco.** Agora
  a impressão sai sempre clara, sem botões nem sumário lateral.
- Blocos de código perdiam a classe `hljs`.
- Ids dos títulos agora seguem a regra do GitHub, então os links de sumário
  escritos para o GitHub funcionam no HTML; ids duplicados nunca colidem.
- Comentários HTML (`<!-- -->`) não aparecem mais como texto.
- O tema inicial segue o do sistema e a escolha do botão é lembrada.
- O tamanho mostrado é o do arquivo no disco.

### Instalação e integração com o Windows

- **Reinstalar com outra janela do MarkiiDown aberta falhava** (o Windows não
  deixa sobrescrever um `.exe` em uso). Agora o antigo é renomeado e o novo
  entra no lugar; o antigo é apagado na próxima instalação.
- A desinstalação deixava a chave `.md` vazia no Registro; agora remove.
- O instalador dizia “adicionado ao PATH” mesmo quando a pasta já estava lá.
- A procura de restos de instalações antigas no Registro passou de uma
  consulta por aplicativo registrado para uma só.
- O Registro nunca mais aponta para um ícone dentro da pasta do projeto (que
  pode ser apagada); usa o `.ico` da pasta de instalação ou o ícone do `.exe`.
- O Explorer é avisado da mudança de associação (`SHChangeNotify`), além do
  `ie4uinit -show`.

### Para quem mantém o código

- Saíram as dependências `marked-terminal` (sem manutenção, prendia o projeto
  no `marked` 15) e `cli-highlight` (trazia o highlight.js 10). De ~50 pacotes
  instalados para 14.
- Novos módulos: `markdown-terminal.ts` (renderizador próprio), `highlight.ts`,
  `keys.ts` (teclado), `terminal-io.ts` (terminal real ou falso, para
  testes), `colors.ts`, `safe-write.ts`.
- Testes: de 115 (alguns falsos, como o antigo `editor.test.ts`) para mais de
  200, incluindo testes de ponta a ponta que rodam o programa num
  pseudoterminal de verdade (ConPTY) e reconstroem a tela.
- `bunfig.toml` desliga a telemetria do Bun no projeto.
- Arquitetura e armadilhas documentadas em [`llms.md`](llms.md).

## 2.0.1 e anteriores

Veja o histórico do Git (`git log`).
