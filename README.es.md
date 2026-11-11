# 🚀 MarkiiDown

<p align="center">
  <a href="./README.md">🇧🇷 Português</a> | <a href="./README.en.md">🇺🇸 English</a> | <b>🇪🇸 Español</b>
</p>

<p align="center">
  <b>Lector y Editor Universal de Archivos y Markdown 100% Standalone, ligero y offline desarrollado en TypeScript con Bun.</b>
</p>

---

**MarkiiDown** es un lector y editor universal de archivos de alto rendimiento diseñado para ejecutarse directamente en la terminal como un TUI interactivo (Pager & Editor) o mediante línea de comandos. Opera de forma **100% offline**, sin crear servidores web locales, sin abrir puertos de red y sin depender de editores pesados o navegadores externos.

Soporta **Markdown formateado**, **código fuente** (TypeScript, JavaScript, Python, Rust, Go, C/C++, HTML, CSS, SQL, Shell y docenas más) con resaltado de sintaxis en tiempo real, **archivos de configuración** (JSON, YAML, TOML, XML, ENV, Dockerfile), **texto plano** y **protección segura contra archivos binarios**.

Incluye soporte completo para **edición interactiva en terminal con guardado en disco (`Ctrl+S`)**, **instalación en espacio de usuario (`%LOCALAPPDATA%`) sin privilegios de administrador**, integración con el **menú contextual de Windows ("Abrir con MarkiiDown")**, menú **"Nuevo" -> "Documento Markdown"** y compilación a ejecutable portable **`.exe` para Windows**.

---

## ✨ Características Principales

- 📄 **Lector y Editor Universal**: Abre y edita Markdown, código fuente en más de 30 lenguajes, JSON/YAML/TOML, registros (logs) y texto plano.
- ✏️ **Editor TUI Integrado (`-E` / `--edit` o tecla `e`)**: Edición de texto a pantalla completa en la terminal con guardado en disco (`Ctrl+S`), Deshacer/Rehacer (`Ctrl+Z`/`Ctrl+Y`), sangría con Tab, numeración de líneas y cursor en tiempo real.
- 🎨 **Resaltado de Sintaxis Automático**: Resaltado completo para archivos de código y bloques Markdown.
- 🔒 **100% Standalone y Offline**: Cero servidores HTTP, cero puertos abiertos y cero tráfico de red.
- 🪟 **Instalador sin Administrador (`--install`)**: Se instala en `%LOCALAPPDATA%\MarkiiDown`, se añade automáticamente al `PATH` del usuario y configura el menú contextual de Windows.
- 🖱️ **Integración con Windows Explorer**: Opción *"Abrir con MarkiiDown"* al hacer clic derecho, *"Nuevo archivo con MarkiiDown"* y compatibilidad nativa con *"Abrir con..."*.
- 📖 **Visualizador Interactivo en Terminal (TUI Pager)**: Navegación fluida, ajuste responsivo de líneas largas sin perder contenido, desplazamiento, progreso de lectura y búsqueda en tiempo real (`/`).
- 📑 **Sumario Integrado y Símbolos de Código**: Presione `t` para listar y saltar directamente a encabezados Markdown o funciones/clases/símbolos en archivos de código.
- 💻 **Modo Impresión Directa (`--print` / `-p`)**: Muestra el contenido formateado y con colores directamente en la salida estándar (stdout), ideal para scripts y tuberías (pipes).
- 🔄 **Modo Monitoreo Continuo (`--watch` / `-w`)**: Detecta cambios y reemplazos atómicos del archivo en tiempo real y actualiza la pantalla.
- 📤 **Exportación a HTML Estático (`--export` / `-e`)**: Genera un archivo `.html` autocontenido con CSS, numeración de líneas, tema oscuro/claro y resaltado de sintaxis integrados, sin CDN.
- 🛡️ **Protección contra Binarios**: Detecta y previene que archivos binarios corrompan la terminal.
- 📦 **Ejecutable Windows Standalone (`.exe`)**: Empaqueta el runtime de Bun, el código fuente y las dependencias en un único archivo binario portable con icono personalizado.

---

## 📥 Requisitos

- [Bun](https://bun.sh) (v1.3+) para desarrollo, pruebas y compilación.
- *Nota:* El ejecutable compilado (`markiidown.exe`) es completamente autónomo y funciona en Windows x64 **sin requerir Bun, Node ni ninguna herramienta externa**.

---

## ⚡ Instalación Rápida en Windows (Sin Administrador)

Descargue `markiidown.exe` de la [última versión](https://github.com/1155dosilicon/markiidown/releases/latest) y, en la carpeta donde está, ejecute:

```powershell
# Instala en %LOCALAPPDATA%\MarkiiDown, añade al PATH y configura el menú contextual
.\markiidown.exe --install

# O desde el código fuente; compila el ejecutable standalone antes de instalarlo:
bun run src/index.ts --install
```

Tras la instalación:
1. El comando `markiidown` estará disponible en nuevas ventanas de PowerShell o CMD (vuelva a abrir la terminal después de instalar).
2. Al hacer **clic derecho** en cualquier espacio vacío de una carpeta o escritorio se muestra:
   - **"Nuevo" -> "Documento Markdown"** (crea un archivo `.md` inmediatamente, igual que el Bloc de notas).
   - **"Nuevo archivo con MarkiiDown"** (crea `novo.md`, `novo (2).md`... en esa carpeta y abre el editor).
3. Al hacer **clic derecho** en cualquier archivo verá la opción **"Abrir con MarkiiDown"**.
4. Al hacer **clic derecho sobre el icono de una carpeta** verá **"Nuevo archivo con MarkiiDown"** (crea el archivo dentro de esa carpeta).
5. Puede asociar MarkiiDown como aplicación predeterminada para archivos en *"Abrir con..."*.

Para desinstalar y eliminar todas las entradas del sistema:
```powershell
markiidown --uninstall
```

---

## ⌨️ Controles y Accesos Directos

### 📖 En Modo Lector (TUI Viewer):

| Tecla | Acción |
| :--- | :--- |
| **`e`** | **Abrir en el Editor Interactivo para modificar el archivo** |
| **`↓` / `j` / `Enter`** | Desplazar 1 línea hacia abajo |
| **`↑` / `k`** | Desplazar 1 línea hacia arriba |
| **`Espacio` / `PgDown`** | Desplazar 1 página hacia abajo |
| **`PgUp` / `b`** | Desplazar 1 página hacia arriba |
| **`Home` / `g`** | Ir al inicio del documento |
| **`End` / `G`** | Ir al final del documento |
| **`/`** | Buscar texto en el documento (escriba el término y presione Enter) |
| **`n` / `N`** | Siguiente / Anterior coincidencia encontrada |
| **`t`** | Abrir sumario o símbolos de código (`↑`/`↓` y `Enter`) |
| **`?` / `h`** | Mostrar panel de ayuda |
| **`q` / `Esc`** | Salir del lector |

### ✏️ En Modo Editor (TUI Editor):

| Tecla | Acción |
| :--- | :--- |
| **`Ctrl+S`** | **Guardar cambios en el disco** |
| **`Esc` / `Ctrl+Q`** | **Salir del editor (solicita confirmación si hay cambios sin guardar)** |
| **`Ctrl+Z`** | Deshacer último cambio (Undo) |
| **`Ctrl+Y`** | Rehacer cambio deshecho (Redo) |
| **`Flechas direccionales`** | Mover cursor por el documento |
| **`Home` / `End`** | Ir al inicio / final de la línea actual |
| **`PgUp` / `PgDown`** | Desplazar pantalla arriba / abajo |
| **`Tab`** | Insertar sangría de 2 espacios |
| **`Enter`** | Nueva línea con sangría inteligente |
| **`Backspace` / `Delete`** | Eliminar caracteres / unir líneas |

---

## 🚀 Ejemplos de Uso en Línea de Comandos

```bash
# 1. Abrir en el lector interactivo (Por defecto)
markiidown documento.md
markiidown app.ts
markiidown config.json

# 2. Abrir directamente en el editor de terminal
markiidown main.py --edit
markiidown script.ts -E

# 2b. Crear siempre un archivo nuevo con nombre único y abrirlo en el editor
markiidown --new
markiidown MiCarpeta --new

# 3. Imprimir todo el contenido formateado y coloreado en stdout
markiidown notas.md --print
markiidown server.go -p

# 4. Monitorear cambios en el archivo en tiempo real
markiidown notas.md --watch

# 5. Exportar a archivo HTML estático autocontenido
markiidown guia.md --export manual.html
markiidown index.ts -e index.html

# 6. Instalar / Desinstalar en Windows
markiidown --install
markiidown --uninstall

# 7. Mostrar ayuda y versión
markiidown --help
markiidown --version
```

---

## 🔨 Compilación del Ejecutable `.exe`

Para generar el binario standalone:

```bash
bun run build:exe
```

El archivo ejecutable se generará en `dist/markiidown.exe`.

## ✅ Verificación del Proyecto

```bash
# TypeScript + suíte completa de pruebas
bun run check

# Comandos separados
bun run typecheck
bun test
```

---

## 📂 Estructura del Proyecto

```text
markiidown/
├── assets/                   # Icono oficial multi-resolución (.ico)
│   └── icon.ico
├── dist/                     # Ejecutable portable compilado (.exe)
│   └── markiidown.exe
├── exemplos/                 # Archivos de ejemplo para pruebas de syntax highlight
│   ├── app.ts
│   ├── script.py
│   ├── server.go
│   ├── main.rs
│   ├── programa.cpp
│   ├── query.sql
│   ├── config.yaml
│   └── Dockerfile
├── src/
│   ├── index.ts              # Punto de entrada y despacho de acciones CLI
│   ├── cli.ts                # Parser validado de opciones, acciones y modos
│   ├── editor.ts             # Editor TUI interactivo a pantalla completa (Undo, Redo, Guardar Ctrl+S)
│   ├── interactive.ts        # Visualizador TUI Pager (Alternate screen, scroll, búsqueda, TOC/Símbolos)
│   ├── terminal.ts           # Formateador de terminal (Markdown y código con syntax highlight)
│   ├── installer.ts          # Instalador en %LOCALAPPDATA% y gestor de PATH en HKCU
│   ├── windows-registry.ts   # Integración con Registro de Windows (HKCU, ShellNew, menús contextuales)
│   ├── html-template.ts      # Conversor de Markdown/Código a HTML estático autocontenido
│   ├── marked-terminal.d.ts  # Tipado local de marked-terminal
│   └── utils.ts              # Detección de tipos de archivo, rutas y métricas
├── tests/                    # 40 pruebas unitarias y de regresión con bun test
├── scripts/
│   ├── build-exe.ts          # Compilador con metadatos PE e icono embebido
│   └── generate-icon.ts      # Generador de icono multi-resolución (16x16 hasta 256x256)
├── exemplo.md                # Archivo Markdown para demostración y pruebas
├── package.json              # Configuración del proyecto, dependencias y scripts Bun
├── tsconfig.json             # Configuración TypeScript
├── LICENSE                   # Licencia GNU General Public License v3.0 (GPL-3.0)
├── DEPENDENCIAS.md           # Justificación de dependencias y compatibilidad de licencias
├── llms.md                   # Documentación técnica para agentes y LLMs
├── README.md                 # Documentación en Portugués (Principal)
├── README.en.md              # Documentación en Inglés
└── README.es.md              # Documentación en Español
```

---

## 📜 Licencia

Distribuido bajo la licencia **GNU General Public License v3.0 (GPL-3.0-or-later)**. Consulte el archivo [LICENSE](./LICENSE) para más detalles.
