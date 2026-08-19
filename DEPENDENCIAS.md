# 📦 Documentação de Dependências e Licenças - MarkiiDown

Este documento descreve todas as dependências do projeto **MarkiiDown**, a justificativa técnica de cada uma e a análise jurídica de **compatibilidade com a licença GNU GPL-3.0**.

---

## ⚖️ Análise de Compatibilidade da Licença GPL-3.0

O **MarkiiDown** é licenciado sob a **GNU General Public License v3.0 (GPL-3.0-or-later)**.

Todas as dependências externas utilizadas possuem licenças permissivas e amplamente compatíveis com a GPLv3:

| Pacote | Licença do Pacote | Compatibilidade com GPL-3.0 | Detalhes |
| :--- | :---: | :---: | :--- |
| **`marked`** | MIT | ✅ 100% Compatível | A licença MIT permite incorporação em projetos sob copyleft GPL. |
| **`marked-terminal`** | MIT | ✅ 100% Compatível | Permissiva MIT compatível com GPLv3. |
| **`marked-highlight`** | MIT | ✅ 100% Compatível | Permissiva MIT compatível com GPLv3. |
| **`highlight.js`** | BSD-3-Clause | ✅ 100% Compatível | A cláusula BSD-3 é oficialmente listada pela Free Software Foundation (FSF) como compatível com a GPL. |
| **`picocolors`** | ISC | ✅ 100% Compatível | A licença ISC é funcionalmente equivalente à MIT/BSD-2 e compatível com a GPL. |
| **`Bun` (Runtime)** | MIT / LGPL / Apache 2.0 | ✅ 100% Compatível | A compilação standalone com Bun empacota o runtime que suporta GPLv3 sem violar termos. |

> **Conclusão Jurídica:** A distribuição do MarkiiDown sob a licença **GPL-3.0** é plenamente válida, legal e compatível com todo o ecossistema de bibliotecas adotado.

---

## 🎯 Runtime e Compilação

### **Bun (`v1.3+`)**
- **Função:** Runtime TypeScript de ultra-alta velocidade, leitor e gravador de arquivos do sistema (`Bun.file`, `Bun.write`), manipulador de subprocessos (`Bun.spawn`) e compilador standalone de executáveis (`bun build --compile`).
- **Justificativa Técnica:**
  - Permite rodar código TypeScript moderno nativamente sem etapa intermediária de compilação ou transpile.
  - O comando `bun build --compile --minify --target=bun-windows-x64` gera um executável `.exe` independente de ~95 MB que não requer Bun nem Node.js na máquina do usuário final.
  - A CLI não abre rede em tempo de execução. Um HTML exportado só acessa rede se o próprio Markdown referenciar links ou imagens externos.
  - `bun:test` fornece a suíte de regressão sem adicionar um framework externo.

---

## 📚 Dependências de Produção (`dependencies`)

| Pacote | Versão | Finalidade |
| :--- | :---: | :--- |
| **`marked`** | `^15.0.7` | Parser de Markdown para nós AST de texto e cabeçalhos. |
| **`marked-terminal`** | `^7.3.0` | Conversor AST para sequências ANSI de terminal, tabelas com bordas e formatação estilizada. |
| **`marked-highlight`** | `^2.2.1` | Integração do realce sintático com o pipeline do `marked`. |
| **`highlight.js`** | `^11.11.1` | Motor de syntax highlighting para blocos de código em TypeScript, Python, JSON, C#, Rust, etc. |
| **`picocolors`** | `^1.1.1` | Biblioteca minimalista e sem overhead para cores e formatações ANSI no terminal. |

---

## 🛠️ Dependências de Desenvolvimento (`devDependencies`)

| Pacote | Versão | Finalidade |
| :--- | :---: | :--- |
| **`@types/bun`** | `latest` | Definições de tipo para as APIs nativas do Bun. |
| **`@types/node`** | `^22.13.9` | Definições de tipo para APIs do Node (`node:readline`, `node:fs`, `node:path`, `node:os`). |
| **`typescript`** | `^5.8.2` | Verificação estática de tipos. |

O exportador incorpora no próprio HTML as regras de cores usadas pelo `highlight.js`; não há folha de estilos carregada por CDN em tempo de execução.
