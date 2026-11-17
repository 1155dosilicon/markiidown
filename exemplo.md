# 🚀 MarkiiDown — documento de demonstração

Este arquivo mostra tudo o que o **MarkiiDown** formata no terminal. Abra com
`markiidown exemplo.md`, role com as setas, busque com `/` e veja o sumário com `t`.

> [!TIP]
> Com `markiidown exemplo.md --watch` a tela é atualizada sozinha sempre que
> este arquivo for salvo por qualquer editor.

---

## 📑 Sumário

1. [Texto e links](#-texto-e-links)
2. [Código com realce de sintaxe](#-código-com-realce-de-sintaxe)
3. [Tabelas](#-tabelas)
4. [Listas](#-listas)
5. [Alertas e citações](#-alertas-e-citações)

---

## 📝 Texto e links

Parágrafos podem ter **negrito**, *itálico*, ~~riscado~~ e `código em linha`.
Quebras de linha simples no arquivo viram espaço, como no GitHub; o texto é
reorganizado para a largura do terminal.\
Uma barra invertida (ou dois espaços) no fim da linha força a quebra.

Links aparecem com o endereço: [site do Bun](https://bun.sh). Endereços soltos
também: https://github.com. No Windows Terminal, eles são clicáveis.

Emoji por código também funcionam: :tada: :white_check_mark: :warning:

![Logotipo do MarkiiDown](assets/icon.ico)

---

## 💻 Código com realce de sintaxe

### TypeScript

```typescript
interface Usuario {
  id: number;
  nome: string;
}

export function saudar(usuario: Usuario): string {
  return `Olá, ${usuario.nome}!`;
}
```

### Python

```python
def fibonacci(n: int) -> list[int]:
    """Gera os n primeiros números de Fibonacci."""
    sequencia = [0, 1]
    while len(sequencia) < n:
        sequencia.append(sequencia[-1] + sequencia[-2])
    return sequencia[:n]
```

### PowerShell

```powershell
# Instala e integra ao Explorer, sem administrador
.\markiidown.exe --install
markiidown exemplo.md --export exemplo.html
```

### JSON

```json
{
  "nome": "markiidown",
  "recursos": ["leitor", "editor", "exportação HTML"],
  "offline": true
}
```

---

## 📊 Tabelas

| Recurso                 | Terminal        | HTML exportado   |
| :---------------------- | :-------------: | :--------------: |
| Markdown formatado      | ✅              | ✅               |
| Realce de sintaxe       | ✅              | ✅               |
| Sumário                 | Tecla `t`       | Barra lateral    |
| Tema claro/escuro       | O do terminal   | Botão no topo    |
| Imprimir / PDF          | —               | Pelo navegador   |

Tabelas largas encolhem para caber na tela e as células quebram em várias linhas.

---

## 📋 Listas

- [x] Leitor interativo com busca e sumário
- [x] Editor com desfazer, refazer e salvamento seguro
- [x] Exportação para HTML autocontido
- [ ] Algo que ainda falta fazer

1. Primeiro passo
2. Segundo passo, com uma lista dentro:
   - item aninhado
   - outro item aninhado
3. Terceiro passo

---

## 🔔 Alertas e citações

> [!NOTE]
> Informação útil que o leitor deve notar.

> [!IMPORTANT]
> Algo essencial para entender o assunto.

> [!WARNING]
> Atenção: requer cuidado imediato.

> [!CAUTION]
> Riscos ou consequências negativas de uma ação.

> "A simplicidade é o último grau de sofisticação."
> — *Leonardo da Vinci*

---

🎉 **Obrigado por usar o MarkiiDown!**
