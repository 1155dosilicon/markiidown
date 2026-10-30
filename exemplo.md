# 🚀 MarkiiDown - Documento de Demonstração

Bem-vindo ao **MarkiiDown**, um leitor e visualizador moderno de Markdown desenvolvido em **TypeScript** com o runtime ultra-rápido **Bun**.

> [!TIP]
> O MarkiiDown suporta **atualização automática** com `--watch`. Ao editar e salvar este arquivo no seu editor de código, a visualização no terminal é atualizada em tempo real!

---

## 📑 Sumário de Recursos

1. [Sintaxe de Código e Realce](#sintaxe-de-código-e-realce)
2. [Tabelas Formatadas](#tabelas-formatadas)
3. [Listas de Tarefas](#listas-de-tarefas)
4. [Alertas Estilo GitHub](#alertas-estilo-github)
5. [Citações e Destaques](#citações-e-destaques)

---

## 💻 Sintaxe de Código e Realce

O MarkiiDown utiliza o `highlight.js` para fornecer realce de sintaxe em tempo real para dezenas de linguagens:

### Exemplo em TypeScript:
```typescript
interface Usuario {
  id: number;
  nome: string;
  ativo: boolean;
}

export function saudar(usuario: Usuario): string {
  return `Olá, ${usuario.nome}! Bem-vindo ao MarkiiDown.`;
}

console.log(saudar({ id: 1, nome: "Dev", ativo: true }));
```

### Exemplo em Python:
```python
def fibonacci(n: int) -> list[int]:
    """Gera sequência de Fibonacci até n elementos."""
    seq = [0, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq[:n]

print(fibonacci(10))
```

### Exemplo em JSON:
```json
{
  "nome": "markiidown",
  "versao": "1.0.0",
  "autor": "Comunidade Bun",
  "recursos": ["Live-Reload", "Modo Escuro/Claro", "Terminal CLI", "Compilação .EXE"]
}
```

---

## 📊 Tabelas Formatadas

| Recurso | Terminal | Exportação HTML |
| :--- | :---: | :---: |
| **Renderização Markdown** | ✅ Sim | ✅ Sim |
| **Syntax Highlighting** | ✅ Sim | ✅ Sim |
| **Atualização automática** | 🔄 `--watch` | ❌ Estático |
| **Sumário Interativo** | ✅ Tecla `t` | ✅ Barra lateral |
| **Modo Escuro / Claro** | ⚙️ Terminal | 🌙/☀️ Toggle |
| **Geração de PDF** | ❌ Não | 🖨️ Navegador |

---

## 📋 Listas de Tarefas

- [x] Suporte nativo a TypeScript com Bun
- [x] Leitor rápido direto no terminal (`--cli`)
- [x] Servidor Web local com Live Reload em tempo real
- [x] Sumário lateral interativo com ScrollSpy
- [x] Botões de cópia rápida para todos os blocos de código
- [x] Script de compilação para executável standalone `.exe` (Windows)
- [ ] Exportação direta para PDF via linha de comando

---

## 🔔 Alertas Estilo GitHub

> [!NOTE]
> Este é um alerta informativo de nota para destacar contextos relevantes.

> [!TIP]
> Você pode alternar entre o tema Escuro e Claro clicando no botão no topo direito da tela ou pressionando a tecla de atalho.

> [!IMPORTANT]
> A geração de `.exe` standalone com Bun embute o runtime, o código e as dependências em um único arquivo portátil.

> [!WARNING]
> Certifique-se de que a porta 3333 esteja livre ou utilize a flag `-p <porta>` para especificar outra porta.

> [!CAUTION]
> Ao exportar documentos sensíveis em HTML, verifique se não há tokens ou segredos expostos no Markdown.

---

## 💬 Citações e Destaques

> "A simplicidade é o último grau de sofisticação."
> — *Leonardo da Vinci*

---

🎉 **Obrigado por usar o MarkiiDown!**
