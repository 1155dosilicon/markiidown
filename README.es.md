# MarkiiDown

<p align="center">
  <a href="./README.md">🇧🇷 Português</a> | <a href="./README.en.md">🇺🇸 English</a> | <b>🇪🇸 Español</b>
</p>

Lector y editor de **Markdown**, **código** y **texto** para la terminal de
Windows. Un único `markiidown.exe`, sin instalar nada más, 100% sin conexión
(no abre puertos ni accede a la red).

- **Lector**: Markdown con formato (títulos, listas, tablas, citas, alertas de
  GitHub, enlaces, emoji), resaltado de sintaxis para decenas de lenguajes,
  búsqueda, índice y desplazamiento.
- **Editor** en la propia terminal: deshacer/rehacer, pegar sin desordenar la
  indentación, guardado seguro que conserva la codificación del archivo.
- **Exportación** a un archivo HTML autocontenido (tema claro/oscuro, índice,
  listo para imprimir o guardar como PDF).
- **Integración con el Explorador**, sin administrador: “Abrir con MarkiiDown”,
  “Nuevo → Documento Markdown”, “Nuevo archivo con MarkiiDown”.

Los cambios de cada versión están en [CHANGELOG.md](CHANGELOG.md) (en portugués).

## Instalación (Windows)

Descarga `markiidown.exe` de la [última versión](https://github.com/1155dosilicon/markiidown/releases/latest)
y, en la carpeta donde está:

```powershell
.\markiidown.exe --install
```

Esto:

1. copia el programa a `%LOCALAPPDATA%\MarkiiDown\markiidown.exe`;
2. añade esa carpeta al `PATH` de tu usuario (abre una terminal nueva después);
3. lo registra en el Explorador (solo para tu usuario, en `HKCU\Software\Classes`):
   - **Abrir con MarkiiDown** al hacer clic derecho en cualquier archivo;
   - **Nuevo → Documento Markdown** y **Nuevo archivo con MarkiiDown** en el
     fondo de las carpetas y del escritorio;
   - MarkiiDown en la lista **Abrir con...**, para que sea el predeterminado del `.md`.

La asociación anterior de `.md`/`.markdown` se guarda y vuelve al desinstalar.
Puedes ejecutar `--install` de nuevo para actualizar, incluso con MarkiiDown
abierto en otra ventana.

Para quitarlo todo (programa, `PATH` y Registro):

```powershell
markiidown --uninstall
```

> [!NOTE]
> En Windows 11, los elementos del clic derecho están en **Mostrar más
> opciones** (o Shift+F10). El menú nuevo de Windows 11 solo acepta
> aplicaciones empaquetadas.

## Uso

```powershell
markiidown                         # abre el README.md de la carpeta (o el primer Markdown/texto)
markiidown notas.md                # lector interactivo
markiidown script.py --edit        # editor
markiidown --new                   # crea "novo.md" (o "novo (2).md"...) y abre el editor
markiidown config.json --print     # imprime con formato y sale
markiidown notas.md --watch        # actualiza la pantalla en cada guardado (Ctrl+C sale)
markiidown guia.md -e guia.html    # exporta a HTML
markiidown app.ts --raw            # texto plano, sin formato ni numeración
markiidown leeme.md --numbers      # numera las líneas
markiidown --help                  # todas las opciones (la interfaz está en portugués)
```

Un archivo que no existe se abre en el editor para crearlo (como el Bloc de notas).

### Teclas del lector

| Tecla | Acción |
| :--- | :--- |
| `↓` `j` `Enter` / `↑` `k` | Bajar / subir una línea |
| `Espacio` `PgDn` `f` / `PgUp` `b` | Página abajo / arriba |
| `Home` `g` / `End` `G` | Inicio / fin |
| `/` | Buscar (sin distinguir mayúsculas; Enter con la búsqueda vacía borra los resaltados) |
| `n` / `N` | Coincidencia siguiente / anterior |
| `t` | Índice: títulos del Markdown o funciones y clases del código |
| `e` | Editar el archivo (vuelve al lector ya actualizado) |
| `?` `h` | Ayuda |
| `q` `Esc` `Ctrl+C` | Salir |

### Teclas del editor

| Tecla | Acción |
| :--- | :--- |
| `Ctrl+S` | Guardar |
| `Esc` `Ctrl+Q` | Salir (pregunta si hay cambios: **S** guardar, **D** descartar, Esc sigue editando) |
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / rehacer (por palabra o acción) |
| `Tab` / `Shift+Tab` | Indentar / desindentar (usa la indentación del archivo) |
| `Enter` | Nueva línea manteniendo la indentación |
| `Ctrl+←` `Ctrl+→` | Saltar palabra |
| `Home` / `End` | Inicio del texto de la línea, después columna 1 / fin de línea |
| `Ctrl+Home` / `Ctrl+End` | Inicio / fin del archivo |
| `PgUp` / `PgDn` | Página arriba / abajo |
| `Alt+Backspace` / `Ctrl+Delete` | Borrar palabra anterior / siguiente |
| Pegar (`Ctrl+V` o clic derecho) | Inserta el texto exactamente como se copió |

## Conviene saber

- **Codificación**: se detectan UTF-8, UTF-8 con BOM, UTF-16 (con BOM) y
  ANSI/Windows-1252 (el “ANSI” del Bloc de notas), y el archivo se guarda en la
  misma codificación. Si escribes un carácter que no existe en ANSI (un emoji,
  por ejemplo), el archivo se guarda en UTF-8 y el editor avisa.
- **Finales de línea**: el editor conserva los del archivo (CRLF, LF o CR). Si
  el archivo los mezcla, avisa y guarda con el predominante.
- **Guardado seguro**: el contenido nuevo va a un archivo temporal en la misma
  carpeta y reemplaza el original de una vez, conservando atributos y
  permisos. Si otro programa cambió el archivo desde que se abrió, el editor
  pregunta antes de sobrescribir.
- **Salida redirigida**: `markiidown x.md -p > salida.txt` guarda solo el
  texto, sin colores. `NO_COLOR=1` apaga los colores; `FORCE_COLOR=1` los fuerza.
- **Enlaces**: en Windows Terminal, los enlaces `http(s)` y `mailto` se pueden
  pulsar (Ctrl+clic). En otras terminales la dirección aparece entre
  paréntesis. `FORCE_HYPERLINK=0` o `1` decide manualmente.
- **Seguridad**: los códigos de control del archivo nunca llegan a la terminal
  (un archivo no puede cambiar el título ni los colores ni borrar la
  pantalla). Al exportar, el HTML escrito dentro del Markdown aparece como
  texto, nunca se ejecuta, y se eliminan los enlaces `javascript:`/`data:`.
- **Archivos binarios** (imágenes, ejecutables, zip...) no se abren como texto.

## Limitaciones conocidas

- En Windows 11 el menú contextual está en “Mostrar más opciones” (ver arriba).
- En la terminal, las imágenes aparecen como `[imagem: descripción] (dirección)`;
  los diagramas Mermaid y las fórmulas aparecen como código.
- El HTML dentro del Markdown aparece como texto (atenuado en la terminal).
- El `.exe` ocupa ~110 MB porque incluye el runtime de Bun.
- La detección de “ANSI” supone Windows-1252 (idiomas de Europa occidental).
  Archivos en otras páginas de códigos (p. ej. cirílico 1251) muestran
  caracteres equivocados.

## Solución de problemas

| Problema | Solución |
| :--- | :--- |
| `markiidown` no se reconoce después de `--install` | Abre una terminal nueva (el `PATH` vale para ventanas abiertas después de instalar). |
| Los elementos no aparecen en el clic derecho | En Windows 11 usa **Mostrar más opciones**. Ejecuta `markiidown --register` para registrarlo de nuevo. |
| Acentos raros en un archivo antiguo | Probablemente el archivo no es UTF-8 ni Windows-1252. Conviértelo a UTF-8 en el Bloc de notas (Guardar como → Codificación). |
| La pantalla queda rara tras un cierre forzado | Ejecuta `cls` (o cierra y abre la pestaña). |

## Desarrollo

Requisitos: [Bun](https://bun.sh) 1.4.4 o más reciente, en Windows (el
proyecto también funciona en Linux/macOS, pero la integración con el
Explorador es solo de Windows).

```powershell
bun install            # dependencias
bun run start x.md     # ejecuta desde el código fuente
bun run check          # verificación de tipos + todas las pruebas
bun test               # solo las pruebas
bun test tests/e2e.test.ts                     # solo las de extremo a extremo
bun run build          # genera dist\markiidown.exe (con icono y versión)
bun run src/index.ts --install                 # compila e instala
```

Para ejecutar las pruebas de extremo a extremo contra el ejecutable compilado:

```powershell
$env:MARKIIDOWN_E2E_EXE = (Resolve-Path dist\markiidown.exe).Path
bun test tests/e2e.test.ts
```

Las pruebas de extremo a extremo abren MarkiiDown en una pseudoterminal real
(ConPTY, el mismo motor de Windows Terminal), envían teclas y comprueban la
pantalla reconstruida, colores y estilos incluidos.

La arquitectura, las reglas que sigue el código y las trampas encontradas
están en [`llms.md`](llms.md) (en portugués). Las dependencias y licencias, en
[`DEPENDENCIAS.md`](DEPENDENCIAS.md). La estructura del código está descrita
en el [README en portugués](README.md#estrutura).

## Licencia

[GPL-3.0-or-later](LICENSE).
