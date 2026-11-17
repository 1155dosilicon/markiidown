# Instruções para agentes de IA

Leia [`llms.md`](llms.md) antes de mudar qualquer coisa: lá estão a
arquitetura, as regras que o código segue e as armadilhas já encontradas.

- Antes de entregar: `bun run check` (tipos + testes). Mexeu no leitor, no
  editor ou no teclado? Rode também `bun test tests/e2e.test.ts`.
- Toda correção vem com teste de regressão e uma entrada no `CHANGELOG.md`
  dizendo **o que acontecia** e **o que acontece agora**.
- Interface, mensagens, comentários e documentação em português do Brasil
  (README.en.md e README.es.md acompanham o README.md).
- Cores só por `src/colors.ts`; teclado só por `TerminalIO.startInput`.
- Ao sair do leitor/editor: `ESC[?1049l` antes de desligar o modo raw.
