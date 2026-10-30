# 🚀 MarkiiDown

<p align="center">
  <a href="./README.md">🇧🇷 Português</a> | <b>🇺🇸 English</b> | <a href="./README.es.md">🇪🇸 Español</a>
</p>

<p align="center">
  <b>100% Standalone, lightweight, and offline Universal File and Markdown Reader & Editor built with TypeScript and Bun.</b>
</p>

---

**MarkiiDown** is a high-performance universal file reader and editor designed to run directly in the terminal as an interactive TUI (Pager & Editor) or via the command line. It operates **100% offline**, without creating local web servers, without opening network ports, and without depending on heavy editors or external web browsers.

It supports **formatted Markdown**, **source code** (TypeScript, JavaScript, Python, Rust, Go, C/C++, HTML, CSS, SQL, Shell, and dozens more) with real-time syntax highlighting, **configuration files** (JSON, YAML, TOML, XML, ENV, Dockerfile), **plain text**, and **safe protection against binary files**.

It includes full support for **interactive terminal editing with in-place disk save (`Ctrl+S`)**, **non-admin user installation (`%LOCALAPPDATA%`)**, Windows Explorer **context menu integration ("Open with MarkiiDown")**, **"New" -> "Markdown Document"** menu, and compilation into a standalone portable **Windows `.exe` binary**.

---

## ✨ Key Features

- 📄 **Universal Reader & Editor**: Open and edit Markdown, source code in 30+ languages, JSON/YAML/TOML, logs, and plain text.
- ✏️ **Integrated TUI Editor (`-E` / `--edit` or `e` key)**: Full-screen terminal text editing with in-place disk saving (`Ctrl+S`), Undo/Redo (`Ctrl+Z`/`Ctrl+Y`), Tab indentation, line numbering, and live cursor navigation.
- 🎨 **Automatic Syntax Highlighting**: Complete syntax highlighting for source code files and fenced Markdown blocks.
- 🔒 **100% Standalone & Offline**: Zero HTTP servers, zero open ports, and zero network traffic.
- 🪟 **Non-Admin User Installer (`--install`)**: Installs to `%LOCALAPPDATA%\MarkiiDown`, automatically adds to User `PATH`, and registers Windows Explorer context menus.
- 🖱️ **Windows Explorer Integration**: *"Open with MarkiiDown"* right-click option, *"New file with MarkiiDown"*, and native support for Windows *"Open with..."* association.
- 📖 **Interactive Terminal Viewer (TUI Pager)**: Smooth navigation, responsive line wrapping without content loss, scrolling, reading progress, and real-time text search (`/`).
- 📑 **Built-in Table of Contents & Code Symbols**: Press `t` to list and jump directly to Markdown headings or functions/classes/symbols in code files.
- 💻 **Direct Print Mode (`--print` / `-p`)**: Outputs formatted and colored content directly to standard output (stdout), perfect for scripts and pipes.
- 🔄 **Continuous Watch Mode (`--watch` / `-w`)**: Watches changes and atomic file replacements in real time and refreshes the display.
- 📤 **Static HTML Export (`--export` / `-e`)**: Generates self-contained `.html` with embedded CSS, line numbers, dark/light theme, and syntax highlighting, without a CDN.
- 🛡️ **Binary Protection**: Detects and prevents binary files from corrupting the terminal.
- 📦 **Standalone Windows Executable (`.exe`)**: Bundles Bun runtime, source code, and all dependencies into a single portable binary with a custom icon.

---

## 📥 Requirements

- [Bun](https://bun.sh) (v1.3+) for development, testing, and compilation.
- *Note:* The compiled standalone binary (`markiidown.exe`) runs on Windows x64 **without requiring Bun, Node.js, or any external dependencies**.

---

## ⚡ Quick Windows Installation (No Admin Required)

With `markiidown.exe` or source code downloaded, simply run:

```powershell
# Installs to %LOCALAPPDATA%\MarkiiDown, adds to User PATH, and sets up context menu
.\dist\markiidown.exe --install

# Or from source; this compiles the standalone executable before installing it:
bun run src/index.ts --install
```

After installation:
1. The `markiidown` command becomes available in new Command Prompt or PowerShell windows (reopen the terminal after installation).
2. Right-clicking in the empty space of any folder or the desktop displays:
   - **"New" -> "Markdown Document"** (creates a `.md` file immediately, just like Notepad).
   - **"New file with MarkiiDown"** (creates `novo.md`, `novo (2).md`... in that folder and opens the editor).
3. Right-clicking any file in Explorer displays **"Open with MarkiiDown"**.
4. Right-clicking a folder icon displays **"New file with MarkiiDown"** (creates the file inside that folder).
5. You can set MarkiiDown as the default application for Markdown files in *"Open with..."*.

To uninstall and clean up all system entries:
```powershell
markiidown --uninstall
```

---

## ⌨️ Controls & Shortcuts

### 📖 In Viewer Mode (TUI Viewer):

| Key | Action |
| :--- | :--- |
| **`e`** | **Open in Interactive Editor to modify the file** |
| **`↓` / `j` / `Enter`** | Scroll 1 line down |
| **`↑` / `k`** | Scroll 1 line up |
| **`Space` / `PgDown`** | Scroll 1 page down |
| **`PgUp` / `b`** | Scroll 1 page up |
| **`Home` / `g`** | Jump to document start |
| **`End` / `G`** | Jump to document end |
| **`/`** | Search text in document (type query and press Enter) |
| **`n` / `N`** | Next / Previous search match |
| **`t`** | Open TOC or Code Symbols (`↑`/`↓` and `Enter`) |
| **`?` / `h`** | Show keyboard shortcut help |
| **`q` / `Esc`** | Exit viewer |

### ✏️ In Editor Mode (TUI Editor):

| Key | Action |
| :--- | :--- |
| **`Ctrl+S`** | **Save changes to disk** |
| **`Esc` / `Ctrl+Q`** | **Exit editor (prompts for confirmation if there are unsaved changes)** |
| **`Ctrl+Z`** | Undo last change |
| **`Ctrl+Y`** | Redo undone change |
| **`Arrow Keys`** | Move cursor in document |
| **`Home` / `End`** | Jump to start / end of current line |
| **`PgUp` / `PgDown`** | Scroll screen up / down |
| **`Tab`** | Insert 2-space indentation |
| **`Enter`** | New line with smart auto-indentation |
| **`Backspace` / `Delete`** | Delete characters / join lines |

---

## 🚀 CLI Usage Examples

```bash
# 1. Open in interactive viewer (Default)
markiidown document.md
markiidown app.ts
markiidown config.json

# 2. Open directly in terminal editor
markiidown main.py --edit
markiidown script.ts -E

# 2b. Always create a new uniquely-named file and open it in the editor
markiidown --new
markiidown MyFolder --new

# 3. Print entire formatted and highlighted content to stdout
markiidown notes.md --print
markiidown server.go -p

# 4. Watch file changes in real-time
markiidown notes.md --watch

# 5. Export to static self-contained HTML file
markiidown guide.md --export manual.html
markiidown index.ts -e index.html

# 6. Install / Uninstall on Windows
markiidown --install
markiidown --uninstall

# 7. Display help and version
markiidown --help
markiidown --version
```

---

## 🔨 Compiling the Windows `.exe`

To build the standalone Windows binary:

```bash
bun run build:exe
```

The output file will be generated in [`dist/markiidown.exe`](./dist/markiidown.exe).

## ✅ Project Verification & Tests

```bash
# TypeScript verification + full test suite
bun run check

# Individual commands
bun run typecheck
bun test
```

---

## 📂 Project Structure

```text
markiidown/
├── assets/                   # Official multi-resolution icon (.ico)
│   └── icon.ico
├── dist/                     # Compiled portable executable (.exe)
│   └── markiidown.exe
├── exemplos/                 # Code sample files for syntax highlight testing
│   ├── app.ts
│   ├── script.py
│   ├── server.go
│   ├── main.rs
│   ├── programa.cpp
│   ├── query.sql
│   ├── config.yaml
│   └── Dockerfile
├── src/
│   ├── index.ts              # CLI entry point and action dispatch
│   ├── cli.ts                # Validated option, action, and mode parser
│   ├── editor.ts             # Full-screen interactive TUI Editor (Undo, Redo, Save Ctrl+S)
│   ├── interactive.ts        # TUI Pager viewer (Alternate screen, scroll, search, TOC/Symbols)
│   ├── terminal.ts           # Terminal formatter (Markdown & code syntax highlighting)
│   ├── installer.ts          # Non-admin installer in %LOCALAPPDATA% & PATH manager
│   ├── windows-registry.ts   # Windows Registry integration (HKCU, ShellNew, context menus)
│   ├── html-template.ts      # Markdown/Code to static self-contained HTML converter
│   ├── marked-terminal.d.ts  # Local marked-terminal type declaration
│   └── utils.ts              # File type detection, path resolution, and metrics
├── tests/                    # 40 unit and regression tests (bun test)
├── scripts/
│   ├── build-exe.ts          # Standalone compiler with PE metadata & embedded icon
│   └── generate-icon.ts      # Multi-resolution icon generator (16x16 up to 256x256)
├── exemplo.md                # Demonstration Markdown file
├── package.json              # Project configuration, dependencies, and Bun scripts
├── tsconfig.json             # TypeScript configuration
├── LICENSE                   # GNU General Public License v3.0 (GPL-3.0)
├── DEPENDENCIAS.md           # Dependency justifications and license compatibility
├── llms.md                   # Architecture and technical documentation for LLMs/Agents
├── README.md                 # Documentation in Portuguese (Main)
├── README.en.md              # Documentation in English
└── README.es.md              # Documentation in Spanish
```

---

## 📜 License

Distributed under the **GNU General Public License v3.0 (GPL-3.0-or-later)**. See [LICENSE](./LICENSE) for details.
