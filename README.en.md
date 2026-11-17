# MarkiiDown

<p align="center">
  <a href="./README.md">🇧🇷 Português</a> | <b>🇺🇸 English</b> | <a href="./README.es.md">🇪🇸 Español</a>
</p>

A **Markdown**, **source code** and **text** reader and editor for the Windows
terminal. A single `markiidown.exe` with nothing else to install, 100% offline
(it opens no ports and never touches the network).

- **Reader**: formatted Markdown (headings, lists, tables, quotes, GitHub
  alerts, links, emoji), syntax highlighting for dozens of languages, search,
  table of contents and scrolling.
- **Editor** right in the terminal: undo/redo, pasting without mangling
  indentation, safe saving that keeps the file's encoding.
- **Export** to a self-contained HTML file (light/dark theme, table of
  contents, ready to print or save as PDF).
- **Explorer integration**, no administrator needed: “Open with MarkiiDown”,
  “New → Markdown Document”, “New file with MarkiiDown”.

Every version's changes are listed in [CHANGELOG.md](CHANGELOG.md) (in Portuguese).

## Installation (Windows)

Download `markiidown.exe` from the [latest release](https://github.com/1155dosilicon/markiidown/releases/latest)
and, in the folder where it is:

```powershell
.\markiidown.exe --install
```

This:

1. copies the program to `%LOCALAPPDATA%\MarkiiDown\markiidown.exe`;
2. adds that folder to your user `PATH` (open a new terminal afterwards);
3. registers it in Explorer (for your user only, under `HKCU\Software\Classes`):
   - **Open with MarkiiDown** when right-clicking any file;
   - **New → Markdown Document** and **New file with MarkiiDown** on folder
     and desktop backgrounds;
   - MarkiiDown in the **Open with...** list, so it can become the `.md` default.

The previous `.md`/`.markdown` association is saved and restored on uninstall.
Running `--install` again updates the program, even if MarkiiDown is open in
another window.

To remove everything (program, `PATH` and registry):

```powershell
markiidown --uninstall
```

> [!NOTE]
> On Windows 11, the right-click items are under **Show more options**
> (or Shift+F10). The new Windows 11 menu only accepts packaged apps.

## Usage

```powershell
markiidown                         # opens the folder's README.md (or the first Markdown/text file)
markiidown notes.md                # interactive reader
markiidown script.py --edit        # editor
markiidown --new                   # creates "novo.md" (or "novo (2).md"...) and opens the editor
markiidown config.json --print     # prints formatted output and exits
markiidown notes.md --watch        # refreshes on every save (Ctrl+C quits)
markiidown guide.md -e guide.html  # exports to HTML
markiidown app.ts --raw            # plain text, no formatting or line numbers
markiidown read.md --numbers       # numbers the lines
markiidown --help                  # all options (the interface is in Portuguese)
```

A file that does not exist is opened in the editor to be created (like Notepad).

### Reader keys

| Key | Action |
| :--- | :--- |
| `↓` `j` `Enter` / `↑` `k` | Down / up one line |
| `Space` `PgDn` `f` / `PgUp` `b` | Page down / up |
| `Home` `g` / `End` `G` | Start / end |
| `/` | Search (case-insensitive; Enter on an empty search clears the highlights) |
| `n` / `N` | Next / previous match |
| `t` | Table of contents: Markdown headings or code functions and classes |
| `e` | Edit the file (returns to the reader already updated) |
| `?` `h` | Help |
| `q` `Esc` `Ctrl+C` | Quit |

### Editor keys

| Key | Action |
| :--- | :--- |
| `Ctrl+S` | Save |
| `Esc` `Ctrl+Q` | Quit (asks if there are unsaved changes: **S** save, **D** discard, Esc keeps editing) |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo (by word or action) |
| `Tab` / `Shift+Tab` | Indent / unindent (uses the file's indentation) |
| `Enter` | New line keeping the indentation |
| `Ctrl+←` `Ctrl+→` | Jump a word |
| `Home` / `End` | Start of the line's text, then column 1 / end of line |
| `Ctrl+Home` / `Ctrl+End` | Start / end of the file |
| `PgUp` / `PgDn` | Page up / down |
| `Alt+Backspace` / `Ctrl+Delete` | Delete previous / next word |
| Paste (`Ctrl+V` or right-click) | Inserts the text exactly as copied |

## Good to know

- **Encoding**: UTF-8, UTF-8 with BOM, UTF-16 (with BOM) and ANSI/Windows-1252
  (Notepad's “ANSI”) are detected, and the file is saved in the same encoding.
  If you type a character ANSI cannot store (an emoji, say), the file is saved
  as UTF-8 and the editor tells you.
- **Line endings**: the editor keeps the file's own (CRLF, LF or CR). Mixed
  files get a warning and are saved with the predominant one.
- **Safe saving**: new content goes to a temporary file in the same folder and
  replaces the original in one step, keeping attributes and permissions. If
  another program changed the file since it was opened, the editor asks
  before overwriting.
- **Redirected output**: `markiidown x.md -p > out.txt` writes plain text
  without colors. `NO_COLOR=1` turns colors off; `FORCE_COLOR=1` forces them.
- **Links**: in Windows Terminal, `http(s)` and `mailto` links are clickable
  (Ctrl+click). Elsewhere the address is shown in parentheses.
  `FORCE_HYPERLINK=0` or `1` overrides the detection.
- **Safety**: control codes from the file never reach the terminal (a file
  cannot change the title or colors or clear the screen). When exporting, HTML
  written inside Markdown is shown as text and never executed, and
  `javascript:`/`data:` links are removed.
- **Binary files** (images, executables, zip...) are not opened as text.

## Known limitations

- The context menu lives under “Show more options” on Windows 11 (see above).
- In the terminal, images show as `[imagem: description] (address)`; Mermaid
  diagrams and formulas show as code.
- HTML inside Markdown shows as text (dimmed in the terminal).
- The `.exe` is ~110 MB because it embeds the Bun runtime.
- “ANSI” detection assumes Windows-1252 (Western European languages). Files in
  other code pages (e.g. Cyrillic 1251) show wrong characters.

## Troubleshooting

| Problem | Solution |
| :--- | :--- |
| `markiidown` is not recognized after `--install` | Open a new terminal (the `PATH` applies to windows opened after installing). |
| The items are missing from the right-click menu | On Windows 11 use **Show more options**. Run `markiidown --register` to register again. |
| Wrong accented characters in an old file | The file is probably neither UTF-8 nor Windows-1252. Convert it to UTF-8 in Notepad (Save as → Encoding). |
| The screen looks odd after a forced close | Run `cls` (or close and reopen the tab). |

## Development

Requirements: [Bun](https://bun.sh) 1.4.4 or newer, on Windows (the project
also runs on Linux/macOS, but the Explorer integration is Windows-only).

```powershell
bun install            # dependencies
bun run start x.md     # run from source
bun run check          # type checking + all tests
bun test               # tests only
bun test tests/e2e.test.ts                     # end-to-end tests only
bun run build          # builds dist\markiidown.exe (with icon and version)
bun run src/index.ts --install                 # builds and installs
```

To run the end-to-end tests against the compiled executable:

```powershell
$env:MARKIIDOWN_E2E_EXE = (Resolve-Path dist\markiidown.exe).Path
bun test tests/e2e.test.ts
```

The end-to-end tests start MarkiiDown inside a real pseudo-terminal (ConPTY,
the same engine as Windows Terminal), send keystrokes and check the
reconstructed screen, colors and styles included.

The architecture, the rules the code follows and the pitfalls found along the
way are in [`llms.md`](llms.md) (in Portuguese). Dependencies and licenses are
in [`DEPENDENCIAS.md`](DEPENDENCIAS.md). The source tree is described in the
[Portuguese README](README.md#estrutura).

## License

[GPL-3.0-or-later](LICENSE).
