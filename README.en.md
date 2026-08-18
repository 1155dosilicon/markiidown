# 🚀 MarkiiDown

<p align="center">
  <a href="./README.md">🇧🇷 Português</a> | <b>🇺🇸 English</b> | <a href="./README.es.md">🇪🇸 Español</a>
</p>

<p align="center">
  <b>100% Standalone, lightweight, and offline Markdown (.md) reader built with TypeScript and Bun.</b>
</p>

---

**MarkiiDown** is a high-performance Markdown reader designed to run directly in the terminal as an interactive TUI Pager or via command line. It operates **100% offline**, without creating local web servers, without opening network ports, and without depending on external web browsers.

It features complete support for **non-admin user installation (`%LOCALAPPDATA%`)**, **Windows context menu integration ("Open with MarkiiDown")**, and compilation into a standalone portable **Windows `.exe` binary**.

---

## ✨ Key Features

- 🔒 **100% Standalone & Offline**: Zero HTTP servers, zero open ports, and zero network traffic.
- 🪟 **Non-Admin User Installer (`--install`)**: Installs to `%LOCALAPPDATA%\MarkiiDown`, automatically adds to User `PATH`, and configures Windows context menu.
- 🖱️ **Windows Explorer Integration**: *"Open with MarkiiDown"* right-click option and native support for Windows *"Open with..."* association.
- 📖 **Interactive Terminal Viewer (TUI Pager)**: Smooth navigation using terminal Alternate Screen Buffer (`\x1B[?1049h`), line scrolling (`j`/`k`, arrow keys), page scrolling (`PgDn`/`PgUp`), reading progress (%), and real-time text search (`/`).
- 📑 **Built-in Table of Contents (TOC)**: Press `t` to list and jump directly to any document heading.
- 💻 **Direct Print Mode (`--print` / `-p`)**: Outputs formatted and colored Markdown directly to standard output (stdout), perfect for scripts and piping.
- 🔄 **Continuous Watch Mode (`--watch` / `-w`)**: Watches file modifications in real time and automatically refreshes the display.
- 📤 **Static HTML Export (`--export` / `-e`)**: Converts Markdown files to self-contained `.html` documents directly on disk.
- 📦 **Standalone Windows Executable (`.exe`)**: Bundles Bun runtime, source code, and all dependencies into a single portable binary.

---

## 📥 Requirements

- [Bun](https://bun.sh) (v1.0+) for development and compilation.
- *Note:* The compiled standalone binary (`markiidown.exe`) runs on Windows x64 **without requiring Bun, Node.js, or any external dependencies**.

---

## ⚡ Quick Windows Installation (No Admin Required)

With `markiidown.exe` or source code downloaded, simply run:

```powershell
# Installs to %LOCALAPPDATA%\MarkiiDown, adds to User PATH, and sets up context menu
.\dist\markiidown.exe --install

# Or via Bun:
bun run src/index.ts --install
```

After installation:
1. The `markiidown` command becomes globally available in any Command Prompt or PowerShell window.
2. Right-clicking any `.md` file displays **"Open with MarkiiDown"**.
3. You can set MarkiiDown as the default application for Markdown files.

To uninstall and clean up all system entries:
```powershell
markiidown --uninstall
```

---

## ⌨️ Interactive Mode Controls (TUI Pager)

| Key | Action |
| :--- | :--- |
| **`↓` / `j` / `Enter`** | Scroll 1 line down |
| **`↑` / `k`** | Scroll 1 line up |
| **`Space` / `PgDown`** | Scroll 1 page down |
| **`PgUp` / `b`** | Scroll 1 page up |
| **`Home` / `g`** | Jump to document start |
| **`End` / `G`** | Jump to document end |
| **`/`** | Search text in document (type query and press Enter) |
| **`n` / `N`** | Next / Previous search match |
| **`t`** | Open Table of Contents overlay |
| **`?` / `h`** | Show keyboard shortcut help |
| **`q` / `Esc`** | Exit viewer |

---

## 🚀 CLI Usage Examples

```bash
# 1. Open in interactive TUI pager (Default)
markiidown document.md

# 2. Print entire formatted document to terminal
markiidown notes.md --print

# 3. Watch file changes in real-time
markiidown notes.md --watch

# 4. Export to static HTML file
markiidown guide.md --export manual.html

# 5. Install / Uninstall on Windows
markiidown --install
markiidown --uninstall

# 6. Display help and version
markiidown --help
markiidown --version
```

---

## 🔨 Compiling the Windows `.exe`

To build the standalone Windows binary:

```bash
bun run build:exe
```

The output file will be generated in [`dist/markiidown.exe`](file:///C:/Users/Eli/Desktop/ia/markiidown/dist/markiidown.exe).

---

## 📂 Project Structure

```text
markiidown/
├── dist/                     # Compiled portable executable (.exe)
│   └── markiidown.exe
├── src/
│   ├── index.ts              # CLI entry point and argument parsing
│   ├── interactive.ts        # TUI Pager (Alternate screen buffer, scroll, search, TOC)
│   ├── terminal.ts           # ANSI formatter (marked + marked-terminal) and watch
│   ├── installer.ts          # Non-admin installer in %LOCALAPPDATA% & PATH manager
│   ├── windows-registry.ts   # Windows Registry integration (HKCU)
│   ├── html-template.ts      # Markdown to static HTML converter
│   └── utils.ts              # System utilities, file paths, and reading metrics
├── scripts/
│   └── build-exe.ts          # Bun standalone compilation script
├── exemplo.md                # Demonstration Markdown file
├── package.json              # Project configuration and scripts
├── tsconfig.json             # TypeScript configuration
├── LICENSE                   # GNU General Public License v3.0 (GPL-3.0)
├── DEPENDENCIAS.md           # Dependency justifications and license compatibility
├── llms.md                   # Architecture documentation for LLMs
├── README.md                 # Documentation in Portuguese (Main)
├── README.en.md              # Documentation in English
└── README.es.md              # Documentation in Spanish
```

---

## 📜 License

Distributed under the **GNU General Public License v3.0 (GPL-3.0-or-later)**. See [LICENSE](file:///C:/Users/Eli/Desktop/ia/markiidown/LICENSE) for details.
