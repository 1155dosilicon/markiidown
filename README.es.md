# 🚀 MarkiiDown

<p align="center">
  <a href="./README.md">🇧🇷 Português</a> | <a href="./README.en.md">🇺🇸 English</a> | <b>🇪🇸 Español</b>
</p>

<p align="center">
  <b>Lector de Markdown (.md) 100% Standalone, ligero y offline desarrollado en TypeScript con Bun.</b>
</p>

---

**MarkiiDown** es un lector de Markdown de alto rendimiento diseñado para ejecutarse directamente en la terminal como un TUI Pager interactivo o mediante línea de comandos. Opera de forma **100% offline**, sin crear servidores web locales, sin abrir puertos de red y sin depender de navegadores externos.

Incluye soporte completo para **instalación en espacio de usuario (`%LOCALAPPDATA%`) sin privilegios de administrador**, integración con el **menú contextual de Windows ("Abrir con MarkiiDown")** y compilación a ejecutable portable **`.exe` para Windows**.

---

## ✨ Características Principales

- 🔒 **100% Standalone y Offline**: Cero servidores HTTP, cero puertos abiertos y cero tráfico de red.
- 🪟 **Instalador sin Administrador (`--install`)**: Se instala en `%LOCALAPPDATA%\MarkiiDown`, se añade automáticamente al `PATH` del usuario y configura el menú contextual de Windows.
- 🖱️ **Integración con Windows Explorer**: Opción *"Abrir con MarkiiDown"* al hacer clic derecho y compatibilidad con *"Abrir con..."*.
- 📖 **Visualizador Interactivo en Terminal (TUI Pager)**: Navegación fluida con buffer alternativo de pantalla (`\x1B[?1049h`), desplazamiento por líneas (`j`/`k`, flechas), páginas (`PgDn`/`PgUp`), barra de progreso (%) y búsqueda en tiempo real (`/`).
- 📑 **Sumario Integrado (TOC)**: Presione `t` para listar y saltar directamente a cualquier sección del documento.
- 💻 **Modo Impresión Directa (`--print` / `-p`)**: Muestra el Markdown formateado y con colores directamente en la salida estándar (stdout), ideal para scripts y tuberías (pipes).
- 🔄 **Modo Monitoreo Continuo (`--watch` / `-w`)**: Detecta modificaciones en el archivo en tiempo real y actualiza la pantalla al instante.
- 📤 **Exportación a HTML Estático (`--export` / `-e`)**: Convierte el archivo a un documento `.html` autocontenido directamente en el disco.
- 📦 **Ejecutable Windows Standalone (`.exe`)**: Empaqueta el runtime de Bun, el código fuente y las dependencias en un único archivo binario portable.

---

## 📥 Requisitos

- [Bun](https://bun.sh) (v1.0+) para desarrollo y compilación.
- *Nota:* El ejecutable compilado (`markiidown.exe`) es completamente autónomo y funciona en Windows x64 **sin requerir Bun, Node ni ninguna herramienta externa**.

---

## ⚡ Instalación Rápida en Windows (Sin Administrador)

Con el ejecutable `markiidown.exe` o el código fuente descargado, ejecute:

```powershell
# Instala en %LOCALAPPDATA%\MarkiiDown, añade al PATH y configura el menú contextual
.\dist\markiidown.exe --install

# O mediante Bun:
bun run src/index.ts --install
```

Tras la instalación:
1. El comando `markiidown` estará disponible globalmente en cualquier ventana de PowerShell o CMD.
2. Al hacer **clic derecho** en cualquier archivo `.md` verá la opción **"Abrir con MarkiiDown"**.
3. Puede asociar MarkiiDown como aplicación predeterminada para archivos Markdown.

Para desinstalar y eliminar todas las entradas del sistema:
```powershell
markiidown --uninstall
```

---

## ⌨️ Controles del Modo Interactivo (TUI Pager)

| Tecla | Acción |
| :--- | :--- |
| **`↓` / `j` / `Enter`** | Desplazar 1 línea hacia abajo |
| **`↑` / `k`** | Desplazar 1 línea hacia arriba |
| **`Espacio` / `PgDown`** | Desplazar 1 página hacia abajo |
| **`PgUp` / `b`** | Desplazar 1 página hacia arriba |
| **`Home` / `g`** | Ir al inicio del documento |
| **`End` / `G`** | Ir al final del documento |
| **`/`** | Buscar texto en el documento (escriba el término y presione Enter) |
| **`n` / `N`** | Siguiente / Anterior coincidencia encontrada |
| **`t`** | Abrir Sumario (Índice de secciones) |
| **`?` / `h`** | Mostrar panel de ayuda |
| **`q` / `Esc`** | Salir del lector |

---

## 🚀 Ejemplos de Uso en Línea de Comandos

```bash
# 1. Abrir en el lector interactivo (Por defecto)
markiidown documento.md

# 2. Imprimir todo el contenido formateado en la terminal
markiidown notas.md --print

# 3. Monitorear cambios en el archivo en tiempo real
markiidown notas.md --watch

# 4. Exportar a archivo HTML estático
markiidown guia.md --export manual.html

# 5. Instalar / Desinstalar en Windows
markiidown --install
markiidown --uninstall

# 6. Mostrar ayuda y versión
markiidown --help
markiidown --version
```

---

## 🔨 Compilación del Ejecutable `.exe`

Para generar el binário standalone:

```bash
bun run build:exe
```

El archivo ejecutable se generará en [`dist/markiidown.exe`](file:///C:/Users/Eli/Desktop/ia/markiidown/dist/markiidown.exe).

---

## 📂 Estructura del Proyecto

```text
markiidown/
├── dist/                     # Ejecutable portable compilado (.exe)
│   └── markiidown.exe
├── src/
│   ├── index.ts              # Punto de entrada CLI y procesamiento de argumentos
│   ├── interactive.ts        # TUI Pager (Alternate screen, scroll, búsqueda, TOC)
│   ├── terminal.ts           # Formateador ANSI (marked + marked-terminal) y watch
│   ├── installer.ts          # Instalador en %LOCALAPPDATA% y gestor de PATH
│   ├── windows-registry.ts   # Integración con Registro de Windows (HKCU)
│   ├── html-template.ts      # Conversor de Markdown a HTML estático
│   └── utils.ts              # Utilidades de sistema, rutas y métricas de lectura
├── scripts/
│   └── build-exe.ts          # Script de compilación standalone con Bun
├── exemplo.md                # Archivo Markdown para demostración y pruebas
├── package.json              # Configuración del proyecto y scripts
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

Distribuido bajo la licencia **GNU General Public License v3.0 (GPL-3.0-or-later)**. Consulte el archivo [LICENSE](file:///C:/Users/Eli/Desktop/ia/markiidown/LICENSE) para más detalles.
