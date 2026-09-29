<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/stivenson/cvlac-mcp/master/assets/logo-dark.svg">
    <img src="https://raw.githubusercontent.com/stivenson/cvlac-mcp/master/assets/logo.svg" alt="" width="96" height="96">
  </picture>
</p>

<h1 align="center">cvlac-mcp</h1>

<p align="center"><b>Actualiza tu CvLAC conversando con tu asistente de IA, sin llenar formularios a mano.</b></p>

<p align="center">
  <a href="https://www.npmjs.com/package/cvlac-mcp"><img src="https://img.shields.io/npm/v/cvlac-mcp?style=flat&logo=npm&logoColor=white&label=npm&color=CB3837" alt="npm"></a>
  <a href="https://github.com/stivenson/cvlac-mcp/actions/workflows/smoke.yml"><img src="https://github.com/stivenson/cvlac-mcp/actions/workflows/smoke.yml/badge.svg" alt="Pruebas en Windows, macOS y Linux"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat&logo=node.js&logoColor=white" alt="Node 20+">
  <img src="https://img.shields.io/badge/license-ISC-blue?style=flat" alt="Licencia ISC">
  <img src="https://img.shields.io/badge/proyecto-no%20oficial-9E9E9E?style=flat" alt="Proyecto no oficial">
</p>

Llenar el CvLAC de MinCiencias es lento: un formulario por cada curso, premio o proyecto, con
catálogos de instituciones y municipios que no siempre encuentran lo que buscas. **cvlac-mcp** le da a
tu asistente de IA (Claude, por ejemplo) la capacidad de hacerlo por ti: le dices en el chat qué
agregar o corregir, y él entra a CvLAC con tu cuenta, llena el formulario, lo guarda y revisa que haya
quedado guardado.

Funciona en tu computador. Tus credenciales no salen de él y no pasan por ningún servidor intermedio.

- [Cómo se ve](#como-se-ve)
- [Qué puede hacer y qué no](#que-puede-hacer)
- [Qué necesitas](#que-necesitas)
- [Instalación paso a paso](#instalacion) — unos 15 minutos
- [Qué pedirle](#que-pedirle)
- [Cómo te protege](#como-te-protege)
- [Problemas frecuentes](#problemas-frecuentes)
- [Seguridad y privacidad](#seguridad)
- [Actualizar o desinstalar](#actualizar)
- [Para desarrolladores](#desarrolladores)

<a id="como-se-ve"></a>

## Cómo se ve

Una conversación se parece a esto:

> **Tú:** Muéstrame los reconocimientos que tengo en CvLAC.
>
> **Asistente:** Tienes 6. Entre ellos, "Distinción a la labor docente" (2023) y "Mejor ponencia,
> Congreso Nacional de Ingeniería" (2021)…
>
> **Tú:** Agrega este: "Mención de honor a la labor docente", Universidad del Norte, 2024, nacional.
>
> **Asistente:** No lo guardé todavía: se parece a "Distinción a la labor docente" (2023), que ya está
> en tu CvLAC. ¿Es el mismo reconocimiento y quieres corregirlo, o es otro y lo creo aparte?
>
> **Tú:** Es otro, créalo.
>
> **Asistente:** Listo, CvLAC confirmó el guardado. Ya aparece en tu lista: "Mención de honor a la labor
> docente", 2024, ámbito nacional.

El asistente no borra nada ni crea duplicados sin preguntarte primero. Los nombres de este ejemplo
son ficticios.

<a id="que-puede-hacer"></a>

## Qué puede hacer y qué no

**Puede leer, agregar, corregir y borrar:**

| En CvLAC se llama | Ejemplos |
|---|---|
| Formación académica | Pregrado, especialización, maestría, doctorado |
| Formación complementaria | Diplomados, cursos de extensión (ver la nota abajo) |
| Experiencia profesional | Vinculaciones con universidades y empresas |
| Cursos de corta duración | Cursos y talleres |
| Reconocimientos | Premios, distinciones, menciones |
| Proyectos | De investigación, innovación, extensión |
| Software | Productos de software registrados |
| Eventos científicos | Congresos, seminarios, talleres donde participaste |
| Idiomas | Con tus niveles de lectura, escritura, habla y escucha |
| Líneas de investigación | Activas o no, con su objetivo |
| Demás trabajos | Otros productos |
| Artículos | Artículos de revista, con ISSN o revista del catálogo |
| Libros | Libros con ISBN, editorial y área del catálogo |
| Capítulos | Capítulos vinculados a un libro y área del catálogo |
| Tesis dirigidas | Tesis, programa e institución |
| Jurados | Jurados de trabajos de grado o tesis |
| Producción técnica | Informes, innovaciones, productos tecnológicos, consultorías y prototipos |
| Perfil | El texto de presentación, las redes académicas (ORCID, Google Scholar, Scopus…) y las áreas de actuación |

**Todavía no puede:**

- **Completar automáticamente toda la segunda fase de un producto:** `complete_product` ya gestiona
  palabras clave, áreas, coautores, reconocimientos y estudiantes vinculados en tesis. Los certificados
  de libros todavía requieren completarse desde la web.
- **Crear revistas, libros, editoriales, programas o áreas que no existan en los catálogos de CvLAC.**
  Si un catálogo devuelve varias opciones, te las muestra para que elijas.
- **Iniciar sesión con una cuenta de nacionalidad extranjera.** Por ahora el inicio de sesión asume
  nacionalidad colombiana.
- **Tocar tus datos de identificación y direcciones,** ni nada de GrupLAC.
- **Crear un programa en formación complementaria que CvLAC no tenga registrado.** El buscador de
  CvLAC solo ofrece los que ya existen para esa institución, y la web tampoco deja crear otros.

**Comparar automáticamente** tu CvLAC con otra fuente (la herramienta `diff`) hoy solo funciona con un
portafolio web que tenga una estructura concreta ([detalles](#comparar-portafolio)). Si no tienes uno,
no importa: le pegas en el chat el texto de tu hoja de vida, o se lo dictas, y el asistente lee tu
CvLAC y agrega lo que falte, ítem por ítem, preguntándote ante cualquier parecido.

<a id="que-necesitas"></a>

## Qué necesitas

- **Tu usuario de CvLAC:** primer nombre, número de cédula y contraseña, los mismos con los que entras a
  la web.
- **Un computador con Windows, macOS o Linux.**
- **Node.js 20 o superior**, un programa gratuito que hace funcionar esta herramienta. En el paso 1 está
  cómo instalarlo.
- **Una app de IA que acepte servidores MCP.** MCP es el estándar con el que estas apps se conectan a
  herramientas como esta. Si no tienes ninguna, empieza con **[Claude Desktop](https://claude.ai/download)**:
  es la más sencilla y es la que usa esta guía. También sirven Claude Code, Cursor, VS Code, Windsurf,
  Zed y JetBrains ([cómo conectarlas](#otras-apps)).

No necesitas saber programar. Vas a copiar y pegar unos comandos en la terminal; la guía dice
exactamente cuáles.

<a id="instalacion"></a>

## Instalación paso a paso

> **¿Qué es la terminal?** Una ventana donde se escriben comandos.
> **En Windows:** tecla Windows, escribe `PowerShell` y ábrelo.
> **En macOS:** Cmd + Espacio, escribe `Terminal` y ábrela.
> Para pegar un comando: clic derecho en Windows, Cmd + V en macOS. Luego presiona Enter.

### Paso 1 · Instala Node.js

Descarga la versión **LTS** desde [nodejs.org](https://nodejs.org) e instálala con las opciones que
vienen marcadas. Luego **cierra y vuelve a abrir** la terminal y comprueba:

```bash
node --version
```

Debe mostrar `v20` o un número mayor (por ejemplo `v22.11.0`).

<details>
<summary>Otras formas de instalarlo</summary>

- **Windows:** `winget install OpenJS.NodeJS.LTS`
- **macOS:** `brew install node@22` con [Homebrew](https://brew.sh)
- **Linux:** [nvm](https://github.com/nvm-sh/nvm) y luego `nvm install 22`

</details>

### Paso 2 · Descarga el navegador que usa la herramienta

cvlac-mcp maneja CvLAC con su propia copia de Chromium, un navegador que funciona sin ventana. Se
descarga una sola vez (unos 150 MB):

```bash
npx -y cvlac-mcp@1 install-browser
```

Al final debe decir que Chromium quedó instalado.

<details>
<summary>¿Falla con <code>UNABLE_TO_VERIFY_LEAF_SIGNATURE</code> o <code>SELF_SIGNED_CERT_IN_CHAIN</code>?</summary>

Un antivirus (Avast, ESET, Kaspersky…) o la red de tu universidad revisa el tráfico con su propio
certificado de seguridad. Dile a Node que confíe en los certificados de tu sistema (necesita Node 22.15
o superior):

```powershell
$env:NODE_OPTIONS="--use-system-ca"; npx -y cvlac-mcp@1 install-browser   # Windows (PowerShell)
```

```bash
NODE_OPTIONS=--use-system-ca npx -y cvlac-mcp@1 install-browser           # macOS / Linux
```

Con un Node anterior, exporta el certificado raíz del antivirus o de la red y apunta a él con
`NODE_EXTRA_CA_CERTS=/ruta/al/certificado.pem`.

</details>

<details>
<summary>Por qué no <code>npx playwright install</code>, y qué significa <code>@1</code></summary>

`install-browser` usa el Playwright que trae este paquete. `npx playwright install` baja la última
versión, y puede dejarte un Chromium que este servidor no sabe abrir (`Executable doesn't exist`).

El `@1` fija la versión mayor: recibes arreglos, pero ningún cambio incompatible sin enterarte. En
algunas distribuciones de Linux hace falta además `npx playwright install-deps chromium`.

</details>

### Paso 3 · Guarda tus datos de acceso

Van en un archivo de texto aparte, dentro de tu carpeta de usuario, que solo tú puedes leer.

**Windows** — en PowerShell:

```powershell
mkdir "$HOME\.config\cvlac-mcp" -Force
notepad "$HOME\.config\cvlac-mcp\.env"
```

El Bloc de notas pregunta si quieres crear el archivo: di que **sí**. Pega estas tres líneas, cambia
lo que está entre comillas por tus datos, **conserva las comillas simples** y guarda con Ctrl + S:

```text
CVLAC_NOMBRE='Tu primer nombre'
CVLAC_CEDULA='1234567890'
CVLAC_PASSWORD='tu clave'
```

Cierra el Bloc de notas y deja el archivo legible solo por tu usuario:

```powershell
icacls "$HOME\.config\cvlac-mcp\.env" /inheritance:r /grant:r "${env:USERNAME}:(R,W)"
```

**macOS / Linux** — cambia los tres valores **antes** de pegar, conservando las comillas simples:

```bash
mkdir -p ~/.config/cvlac-mcp
cat > ~/.config/cvlac-mcp/.env <<'EOF'
CVLAC_NOMBRE='Tu primer nombre'
CVLAC_CEDULA='1234567890'
CVLAC_PASSWORD='tu clave'
EOF
chmod 600 ~/.config/cvlac-mcp/.env
```

- `CVLAC_NOMBRE` es tu **primer nombre** tal como lo registraste en CvLAC, con tildes y ñ.
- Las comillas simples importan: sin ellas, una clave con `#` se corta ahí.
- No guardes este archivo en Escritorio ni en Documentos si esas carpetas se sincronizan con OneDrive o
  Google Drive. La carpeta de arriba no se sincroniza.

<details>
<summary>Crear el archivo sin el Bloc de notas (Windows)</summary>

```powershell
$contenido = @'
CVLAC_NOMBRE='Tu primer nombre'
CVLAC_CEDULA='1234567890'
CVLAC_PASSWORD='tu clave'
'@
[IO.File]::WriteAllText("$HOME\.config\cvlac-mcp\.env", $contenido)
```

`@'...'@`, con comilla simple, no toca un `$` que haya en tu clave; `@"..."@` sí lo cambiaría.
`WriteAllText` guarda en UTF-8. Si el archivo te quedó en otra codificación —`Out-File` y `>` guardan
en UTF-16, y `Set-Content` en ANSI—, cvlac-mcp lo detecta, lo lee igual y lo anota en su registro al
arrancar.

</details>

### Paso 4 · Conecta cvlac-mcp con Claude Desktop

1. Abre Claude Desktop y ve a **Configuración → Desarrollador → Editar configuración** (en inglés:
   *Settings → Developer → Edit Config*). Se abre la carpeta con el archivo
   `claude_desktop_config.json`: ábrelo con el Bloc de notas o TextEdit.
2. Pega el bloque de tu sistema, cambiando `TU_USUARIO` por tu usuario del computador. Para saber cuál
   es: `echo $env:USERNAME` en PowerShell, o `whoami` en la terminal de macOS.

**Windows:**

```json
{
  "mcpServers": {
    "cvlac-mcp": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "cvlac-mcp@1"],
      "env": {
        "CVLAC_ENV_FILE": "C:\\Users\\TU_USUARIO\\.config\\cvlac-mcp\\.env"
      }
    }
  }
}
```

**macOS** (en Linux, la ruta empieza por `/home/` en vez de `/Users/`):

```json
{
  "mcpServers": {
    "cvlac-mcp": {
      "command": "npx",
      "args": ["-y", "cvlac-mcp@1"],
      "env": {
        "CVLAC_ENV_FILE": "/Users/TU_USUARIO/.config/cvlac-mcp/.env"
      }
    }
  }
}
```

3. Guarda y **cierra Claude Desktop del todo**; no basta con cerrar la ventana. En Windows, clic derecho
   en su ícono junto al reloj → Salir. En macOS, Cmd + Q. Luego ábrelo de nuevo.

Detalles que suelen fallar:

- Si el archivo ya tenía algo, no lo reemplaces: agrega `"cvlac-mcp": {...}` dentro del `"mcpServers"`
  que ya existe, separado con una coma.
- En Windows las barras de la ruta van **dobles** (`\\`), porque el archivo es JSON. `cmd /c` va delante
  porque en Windows `npx` no es un programa sino un script.
- `CVLAC_ENV_FILE` es obligatorio: le dice a cvlac-mcp dónde quedó el archivo del paso 3.

### Paso 5 · Pruébalo

En un chat nuevo de Claude Desktop, escribe:

1. **"Inicia sesión en CvLAC"** — debe responder que inició sesión.
2. **"Muéstrame mi formación académica en CvLAC"** — debe listar lo que ya tienes.

Si las dos funcionan, quedó listo. La primera vez puede tardar unos 15 segundos en conectar, porque se
descarga el paquete; si aparece desconectado, espera un momento y reinicia Claude Desktop.

¿Algo falló? → [Problemas frecuentes](#problemas-frecuentes).

<a id="otras-apps"></a>

### Otras apps de IA

La configuración es la misma del paso 4 en todas; cambia dónde se pega.

| App | Dónde va |
|---|---|
| **Claude Code** | Con un comando, abajo |
| **Cursor** | `~/.cursor/mcp.json` · Windows: `%USERPROFILE%\.cursor\mcp.json` |
| **VS Code** (Copilot, modo agente) | *Command Palette → MCP: Open User Configuration*. La clave es `"servers"` en vez de `"mcpServers"`, y cada servidor lleva además `"type": "stdio"` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **Zed** | `settings.json`, bajo `"context_servers"`, con `"source": "custom"` |
| **JetBrains** | *Settings → Tools → AI Assistant → Model Context Protocol (MCP) → Add*; acepta el mismo JSON |

**Claude Code:**

```bash
# macOS / Linux
claude mcp add cvlac-mcp --scope user -e CVLAC_ENV_FILE=$HOME/.config/cvlac-mcp/.env -- npx -y cvlac-mcp@1

# Windows, desde Git Bash
MSYS_NO_PATHCONV=1 claude mcp add cvlac-mcp --scope user -e 'CVLAC_ENV_FILE=C:\Users\TU_USUARIO\.config\cvlac-mcp\.env' -- cmd /c npx -y cvlac-mcp@1
```

En Git Bash, sin `MSYS_NO_PATHCONV=1`, el `/c` se convierte en `C:/` y el servidor no conecta. Desde
PowerShell el comando falla con `unknown option '-y'`, porque PowerShell se come el `--`: usa Git Bash,
pon `--%` antes de los argumentos, o pega el JSON de Windows con `claude mcp add-json`.

<a id="que-pedirle"></a>

## Qué pedirle

Habla normal, en español. Algunas ideas:

| Quieres… | Escribe algo como… |
|---|---|
| Ver lo que tienes | "Muéstrame mis cursos en CvLAC" |
| Ver un registro completo | "Muéstrame todos los datos guardados del proyecto X" |
| Agregar algo | "Agrega el curso 'Escritura científica' que tomé en 2025, 40 horas" |
| Corregir algo | "En mi formación, la maestría terminó en 2019, no en 2018" |
| Borrar algo | "Borra el evento 'Prueba'" — te pedirá confirmación antes |
| Preparar un artículo desde un DOI | "Busca este DOI y muéstrame los datos antes de registrarlo: 10.…" |
| Registrar producción | "Registra mi artículo con DOI 10.…" o "Agrega que fui jurado de una tesis de maestría en…" |
| Actualizar el perfil | "Reemplaza mi texto de perfil por este: …" |
| Agregar una red académica | "Agrega mi ORCID: https://orcid.org/0000-0000-0000-0000" |
| Ponerte al día con tu hoja de vida | Pega el texto de tu hoja de vida y di: "Compara esto con mi CvLAC y dime qué falta. No cambies nada todavía." |

Consejos:

- **Pide primero ver, después cambiar.** "Dime qué agregarías, sin guardar nada" es una buena forma de
  empezar.
- **Da los datos completos:** fechas, institución, horas, ámbito (nacional o internacional). Si falta un
  dato que CvLAC exige, el asistente te avisa en vez de inventarlo.
- **Revisa en CvLAC** lo que quede escrito. Lo que figura en tu hoja de vida es tu responsabilidad, y el
  asistente, aunque verifica cada guardado, se puede equivocar al interpretar lo que le pides.

<a id="como-te-protege"></a>

## Cómo te protege

CvLAC no tiene botón de deshacer, así que cvlac-mcp prefiere preguntar antes que equivocarse:

- **No crea duplicados sin preguntar.** Si lo que vas a agregar se parece a algo que ya está, no escribe
  nada y te muestra los parecidos.
- **No borra a la primera.** Todo borrado exige una segunda confirmación, incluido quitar una red
  académica o un área de actuación.
- **No elige por ti.** Si el nombre de una institución coincide con varias en el catálogo de CvLAC —hay
  seis "Universidad de los Andes"—, te muestra las opciones.
- **No inventa datos.** Si falta un dato, te avisa en vez de rellenarlo con algo que suene bien.
- **Comprueba el resultado.** No da por guardado algo solo porque envió el formulario: mira cómo respondió
  CvLAC y, si queda duda, vuelve a leer el registro. Si CvLAC se cae a mitad de un guardado, te dice que
  **no pudo confirmarlo**, para que lo revises antes de intentarlo otra vez.
- **Dice qué falló.** Si CvLAC rechaza un formulario, te dice qué campo y por qué.
- **Cuida tu cuenta.** Si CvLAC rechaza tu clave, no vuelve a intentarlo, para no bloquearte. Además
  espacia sus visitas a CvLAC para no saturarlo.

<a id="problemas-frecuentes"></a>

## Problemas frecuentes

<details>
<summary><b>"Faltan credenciales", aunque las escribiste</b></summary>

El mensaje dice qué datos faltan y qué archivo buscó:

- **"no existe":** la ruta de `CVLAC_ENV_FILE` en la configuración (paso 4) no apunta al archivo. Revisa
  el usuario y, en Windows, que las barras sean dobles.
- **"no encontré ninguna variable":** el archivo existe pero está vacío o mal escrito. Cada línea debe
  ser `NOMBRE='valor'`.
- **"no trae esas":** revisa que los nombres estén escritos exactamente como en el paso 3.

</details>

<details>
<summary><b>CvLAC rechazó el inicio de sesión</b></summary>

cvlac-mcp lo intentó **una sola vez**, para no bloquear tu cuenta. Revisa en tu archivo:

- `CVLAC_NOMBRE`: tu **primer** nombre, con tildes, tal como lo registraste.
- `CVLAC_CEDULA`: solo números, sin puntos.
- `CVLAC_PASSWORD`: entre comillas simples.

Antes de volver a intentarlo, entra a mano a
[CvLAC](https://scienti.minciencias.gov.co/cvlac/Login/pre_s_login.do) con esos mismos datos.

</details>

<details>
<summary><b>Claude Desktop no muestra cvlac-mcp, o aparece desconectado</b></summary>

- ¿Cerraste Claude Desktop **del todo** después de editar la configuración? (paso 4, punto 3)
- Revisa que el JSON sea válido: comas entre bloques, llaves cerradas, barras dobles en Windows.
- La primera vez tarda en descargarse: espera un minuto y reinicia.
- En macOS, si instalaste Node con nvm o Homebrew, Claude Desktop puede no encontrar `npx`. Pon la ruta
  completa: en la terminal, `which npx` te la da (por ejemplo `/opt/homebrew/bin/npx`), y va en
  `"command"`.

</details>

<details>
<summary><b><code>Executable doesn't exist</code> o no abre el navegador</b></summary>

Falta el navegador, o es de otra versión. Repite el paso 2: `npx -y cvlac-mcp@1 install-browser`. En
Linux, si existe pero no arranca, faltan librerías del sistema: `npx playwright install-deps chromium`.

</details>

<details>
<summary><b>CvLAC está caído o responde con errores 5xx</b></summary>

MinCiencias tiene caídas frecuentes. cvlac-mcp lo detecta, reintenta con calma y, si sigue caído, te lo
dice en vez de reportar tu hoja de vida como vacía. Espera un rato y vuelve a intentarlo. Si fue en
medio de un guardado, revisa en CvLAC si quedó antes de repetirlo.

</details>

¿Otra cosa? Abre un [issue](https://github.com/stivenson/cvlac-mcp/issues), pero **sin tus datos ni
capturas con información personal**.

<a id="seguridad"></a>

## Seguridad y privacidad

Qué pasa con tus datos, en concreto:

- **Tus credenciales no salen de tu computador.** Viven en el archivo del paso 3. cvlac-mcp las lee al
  arrancar y las escribe únicamente en el formulario de inicio de sesión de
  `scienti.minciencias.gov.co`.
- **No hay servidor intermedio, cuentas, telemetría ni analítica.** cvlac-mcp corre como un programa en tu
  computador y habla directamente con tu app de IA. Solo se conecta a **CvLAC**, al portafolio que
  configures y a **api.crossref.org** cuando pides la consulta DOI de solo lectura.
- **Tu asistente de IA sí ve tu hoja de vida.** No tus credenciales —cvlac-mcp nunca las devuelve—, pero
  sí lo que lee de tu CvLAC, porque eso viaja al chat. Tenlo en cuenta al elegir la app si tu hoja de
  vida tiene datos sensibles.
- **La sesión vale tanto como tu clave.** Para no pedir la clave en cada paso, cvlac-mcp guarda la sesión
  en `.cvlac-session.json`, en tu carpeta de usuario. Mientras siga vigente, quien copie ese archivo
  entra a tu CvLAC **y puede modificarlo** sin tu clave. En macOS y Linux se crea legible solo por ti; en
  Windows hereda los permisos de tu carpeta de usuario. Para restringirlo a mano:
  `chmod 600 ~/.cvlac-session.json` (macOS/Linux) o
  `icacls "$HOME\.cvlac-session.json" /inheritance:r /grant:r "${env:USERNAME}:(R,W)"` (Windows).
- **Ni el archivo de datos ni la sesión en carpetas sincronizadas** (OneDrive, Google Drive, Dropbox). Las
  rutas de esta guía no lo están.
- **Para cerrar la sesión,** borra `.cvlac-session.json`. La próxima vez, cvlac-mcp inicia sesión de
  nuevo.
- **Los registros no muestran secretos.** Aunque actives el modo detallado para depurar, la clave, la
  cédula y las cookies aparecen como `***`.
- **Las capturas de pantalla pueden tener datos personales.** Revísalas antes de compartirlas.
- **Si sospechas que se filtró algo,** cambia tu clave en CvLAC y borra el archivo de sesión.

### Uso responsable

- Esto automatiza un sitio del Estado colombiano **con tu propia cuenta y tus propios datos**. No evade
  la autenticación, no entra a hojas de vida ajenas y no usa ninguna API oculta: hace lo mismo que harías
  tú en el navegador, más rápido.
- **Revisa los términos de uso de ScienTI/MinCiencias** y las políticas de tu institución antes de usarlo.
- **Supervisión humana siempre.** Pide ver los cambios antes de aplicarlos, no lo dejes trabajando sin
  mirar y no lo programes para que corra solo.
- No lo corras en paralelo sobre varias cuentas ni subas su ritmo de peticiones.
- **Lo que quede en tu hoja de vida es tu responsabilidad.** Es una declaración con efectos ante
  convocatorias y evaluaciones: verifica en CvLAC lo que se haya escrito.

> **Proyecto independiente.** No está afiliado a MinCiencias ni respaldado por esa entidad. No reproduce
> su logotipo ni su identidad visual: el símbolo de arriba es original —unas llaves `{ }` de JSON-RPC
> dentro de un anillo de trazos que convergen— y las marcas «CvLAC», «ScienTI» y «MinCiencias» se
> nombran solo para identificar el sistema con el que habla el servidor.

<a id="actualizar"></a>

## Actualizar o desinstalar

- **Actualizar:** no tienes que hacer nada. Con `cvlac-mcp@1`, cada vez que abres tu app de IA se usa la
  última versión 1.x. Si alguna vez sale una 2.x, cambia `@1` por `@2` en la configuración (lee antes qué
  cambió en el [ROADMAP](https://github.com/stivenson/cvlac-mcp/blob/master/ROADMAP.md)).
- **Ver qué versión tienes:** `npx -y cvlac-mcp@1 --version`.
- **Desinstalar:** quita el bloque `"cvlac-mcp"` de la configuración de tu app y borra la carpeta
  `.config/cvlac-mcp` y el archivo `.cvlac-session.json` de tu carpeta de usuario.

---

<a id="desarrolladores"></a>

# Para desarrolladores

Todo lo de aquí en adelante es para quien quiera auditar el código, contribuir, usar las herramientas MCP
directamente o comparar el CvLAC con un portafolio web.

Servidor MCP (stdio) en **TypeScript + Playwright**, ESM estricto, probado con Vitest en Linux,
Windows y macOS. Qué está verificado, qué falta y las limitaciones conocidas están en el
**[ROADMAP](https://github.com/stivenson/cvlac-mcp/blob/master/ROADMAP.md)**.

- [Instalación desde el código fuente](#clonar)
- [Configuración avanzada](#config-avanzada)
- [Comparar con un portafolio (`diff` y `sync`)](#comparar-portafolio)
- [Referencia de tools MCP](#tools)
- [Variables de entorno](#variables)
- [Arquitectura](#arquitectura)
- [Pruebas y build](#pruebas)
- [Problemas de desarrollo](#problemas-dev)
- [Estado y roadmap](#estado)

<a id="clonar"></a>

## Instalación desde el código fuente

Para **desarrollar, contribuir o auditar** el código. Si solo quieres usar el servidor, la
[instalación paso a paso](#instalacion) es más corta. Sigue los pasos en orden; cada uno incluye una verificación para no avanzar con un entorno roto.

### Paso 0 - Prerrequisitos (todas las plataformas)

Necesitas **Node.js 20 o superior**, **npm 10+** y **git**.

| Plataforma | Cómo instalar Node 20+ |
|---|---|
| **Linux** (Debian/Ubuntu) | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash - && sudo apt-get install -y nodejs git` |
| **Linux** (cualquier distro, recomendado) | Instalar [nvm](https://github.com/nvm-sh/nvm) y luego `nvm install 20 && nvm use 20` |
| **macOS** | `brew install node@20 git` (con [Homebrew](https://brew.sh)) o nvm |
| **Windows** | `winget install OpenJS.NodeJS.LTS` y `winget install Git.Git` (o instalador desde [nodejs.org](https://nodejs.org)) |

**Verifica** (sirve igual en bash, zsh o PowerShell):

```bash
node --version   # debe mostrar v20.x o superior
npm --version    # debe mostrar 10.x o superior
git --version
```

### Paso 1 - Clonar el repositorio

**Linux / macOS (bash o zsh):**

```bash
cd ~/dev            # o la carpeta que prefieras
git clone https://github.com/stivenson/cvlac-mcp.git
cd cvlac-mcp
```

**Windows (PowerShell):**

```powershell
cd $HOME\dev        # crea la carpeta antes si no existe: mkdir $HOME\dev
git clone https://github.com/stivenson/cvlac-mcp.git
cd cvlac-mcp
```

### Paso 2 - Instalar dependencias y compilar

Igual en las tres plataformas:

```bash
npm install
npm run build
```

**Verifica:** debe existir el archivo de entrada compilado `dist/index.js`.

```bash
# Linux / macOS
ls dist/index.js
```

```powershell
# Windows (PowerShell)
Test-Path dist\index.js   # debe imprimir True
```

### Paso 3 - Instalar el navegador de Playwright

El servidor automatiza CvLAC con Chromium headless. Descarga el build que corresponde a la versión de
Playwright del proyecto:

```bash
node dist/index.js install-browser
```

En **Linux**, si faltan librerías del sistema, instala también las dependencias nativas:

```bash
npx playwright install-deps chromium   # requiere sudo en algunas distros
```

### Paso 4 - Configurar variables de entorno (`.env`)

Copia la plantilla y edita los valores:

**Linux / macOS:**

```bash
cp .env.example .env
```

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
```

Edita `.env` con tus datos:

```bash
CVLAC_NOMBRE='TuNombre'
CVLAC_CEDULA='TuDocumento'
CVLAC_PASSWORD='TuPassword'
PORTFOLIO_URL='https://tu-usuario.github.io'
# Opcional: por defecto, .cvlac-session.json en tu carpeta de usuario
# CVLAC_SESSION_PATH='/ruta/a/tu/.cvlac-session.json'
```

Restringe los permisos del archivo (Linux/macOS):

```bash
chmod 600 .env
```

En Windows, el equivalente de `chmod` es
`icacls .env /inheritance:r /grant:r "${env:USERNAME}:(R,W)"`.

`CVLAC_SESSION_PATH` por plataforma (ejemplos, si quieres cambiarlo):
- **Linux:** `/home/TU_USUARIO/.cvlac-session.json`
- **macOS:** `/Users/TU_USUARIO/.cvlac-session.json`
- **Windows:** `C:\\Users\\TU_USUARIO\\.cvlac-session.json`

<a id="config-json"></a>

### Paso 4b - Configurar tus valores por defecto (`cvlac.config.json`)

Varios formularios de CvLAC exigen campos que tu portafolio no tiene (municipio, intensidad horaria, idioma). Se declaran una vez aquí:

```bash
cp cvlac.config.example.json cvlac.config.json
```

```json
{
  "portfolioUrl": "https://tu-usuario.github.io",
  "defaults": {
    "municipio": { "nombre": "Bogotá", "codigoDane": "11001" },
    "institucionFallback": "Universidad Nacional de Colombia",
    "horasSemanales": 1,
    "idioma": "ES",
    "pais": "CO"
  }
}
```

Todo es opcional. **Si un valor falta, el campo se deja vacío y la respuesta trae un warning** — el servidor no inventa datos para tu hoja de vida.

<a id="portfolio-extra"></a>

### Paso 4c - Curar proyectos, software y eventos (`data/portfolio-extra.json`)

Estas tres secciones no se pueden leer del portafolio: necesitan metadatos que solo existen en CvLAC (tipo de proyecto, código DANE, códigos de enum). Se mantienen a mano:

```bash
cp data/portfolio-extra.example.json data/portfolio-extra.json
```

El archivo se valida al cargarse; si un ítem está mal formado, el servidor lo reporta y sigue con las demás secciones.

### Paso 5 - Registrar el MCP en tu app

Igual que en la [instalación paso a paso](#instalacion), cambiando `npx` por `node` y la ruta a tu
`dist/index.js`. No hace falta `CVLAC_ENV_FILE`: clonado, el servidor lee el `.env` de la raíz del
repo.

```json
{
  "mcpServers": {
    "cvlac-mcp": {
      "command": "node",
      "args": ["/home/TU_USUARIO/dev/cvlac-mcp/dist/index.js"]
    }
  }
}
```

- **macOS:** `"/Users/TU_USUARIO/dev/cvlac-mcp/dist/index.js"`
- **Windows:** `"C:\\Users\\TU_USUARIO\\dev\\cvlac-mcp\\dist\\index.js"` (barras dobles en JSON; aquí no hace falta `cmd /c`,
  porque `node` sí es un ejecutable)
- **Claude Code:** `claude mcp add cvlac-mcp --scope user -- node /ruta/a/cvlac-mcp/dist/index.js`
- **Dónde va el JSON en cada app:** [Otras apps de IA](#otras-apps).

> **Deja las credenciales solo en `.env`.** Los archivos de configuración de las apps suelen estar sin
> permisos restringidos o sincronizados entre máquinas. Si aun así las pones en un bloque `env`, ganan
> sobre el `.env`.

### Paso 6 - Verificar la instalación

1. **Build y tests** en verde:

   ```bash
   npm run build
   npm test
   ```

2. **Arranque del servidor** (sanity check; queda esperando por stdio, ciérralo con `Ctrl+C`):

   ```bash
   node dist/index.js
   ```

3. **En tu editor:** reinícialo (Claude Desktop necesita cerrarse del todo) y confirma que
   `cvlac-mcp` aparece activo y lista sus tools — *Settings → MCP* en Cursor, `claude mcp list`
   o `/mcp` en Claude Code, el selector de herramientas del chat agente en VS Code.

4. **Prueba funcional mínima** desde el chat de tu editor, en este orden:
   - `login` (debe autenticar y persistir sesión)
   - `read_cvlac` con `section: "formacion"` (debe devolver lo que ya está en CvLAC)
   - si configuraste un portafolio: `read_portfolio` y luego `diff`

Si responden sin error, el MCP quedó correctamente instalado y configurado.

---

<a id="config-avanzada"></a>

## Configuración avanzada

Nada de esto hace falta para usar el servidor. Instalado con `npx`, cada archivo se apunta con una
variable en el mismo bloque `env` de la configuración de tu app, junto a `CVLAC_ENV_FILE`; clonado, se
toman de la raíz del repo.

| Variable | Qué apunta | Para qué |
|---|---|---|
| `CVLAC_CONFIG_PATH` | Tu `cvlac.config.json` | Valores por defecto que CvLAC exige y tu fuente no trae: municipio, institución de respaldo, horas semanales, idioma, país, URL del portafolio ([formato](#config-json)) |
| `CVLAC_PORTFOLIO_EXTRA_PATH` | Tu `portfolio-extra.json` | Proyectos, software y eventos curados a mano, para que entren al `diff` ([formato](#portfolio-extra)) |

Sugerido: guárdalos junto al `.env`, en `~/.config/cvlac-mcp/`. Si falta un valor por defecto, el
campo queda vacío y la respuesta trae un warning: **el servidor nunca inventa un dato** para una hoja de
vida.

<a id="comparar-portafolio"></a>

## Comparar con un portafolio (`diff` y `sync`)

`diff` compara el CvLAC con un portafolio web y clasifica cada ítem en cuatro grupos: **faltantes**,
**a actualizar**, **parecidos** (algo similar ya existe: decide una persona) y **al día**. `sync` aplica
los faltantes y los de actualizar, y nunca los parecidos.

**Limitación importante:** `read_portfolio` está hecho para un sitio concreto —una app React con la ruta
`#/resume`, pestañas Experiencia, Educación y Cursos, y una sección "Logros Destacados"— y si no
encuentra esa estructura devuelve listas vacías, con un warning en el log. Proyectos, software y eventos
no salen del sitio sino de [`portfolio-extra.json`](#portfolio-extra). Tampoco entran al `diff`:
experiencia profesional (los nombres de empresa difieren demasiado), idiomas, líneas ni demás trabajos.

Separar la fuente del motor —que `diff` acepte un JSON normalizado de hoja de vida, venga de un PDF, de
ORCID o del dictado— está en el [ROADMAP](https://github.com/stivenson/cvlac-mcp/blob/master/ROADMAP.md).

Flujo recomendado:

1. `login`
2. `sync` con `dry_run: true`
3. Revisar el reporte con una persona: faltantes, a actualizar, **parecidos** y al día
4. Resolver los parecidos uno a uno — `update` sobre el existente, o `add` con `confirm_duplicate:true`
5. Aplicar el resto: `sync` sin `dry_run`, o `update_section` por ítem revisando los `warnings`
6. Verificar con `read_cvlac` de las secciones tocadas, o `read_cvlac_detail`

```text
read_portfolio ─┐
                ├─► diff ─► sync (dry_run → apply) ─► update_section (add / update / delete)
read_cvlac ─────┘
```

Si trabajas con Claude Code, la skill `cvlac-sync` del
[workspace cliente](https://github.com/stivenson/cvlac-workspace) encapsula este flujo.

<a id="tools"></a>

## Referencia de tools MCP

| Tool | Qué hace |
|---|---|
| `login` | Autentica en CvLAC y persiste la sesión. `force:true` vuelve a iniciar sesión. Un rechazo no se reintenta |
| `read_cvlac` | Lee una sección o todas (`all`) |
| `read_cvlac_detail` | Abre la ficha completa de un ítem (por sección y etiqueta) y devuelve sus pares campo/valor. Las listas muestran dos o tres columnas; esta es la forma de ver lo que realmente quedó guardado |
| `read_profile` | Lee lo que CvLAC guarda como registro único: el texto de perfil, la tabla de redes académicas y las áreas de actuación. Nada de eso sale en `read_cvlac` |
| `update_profile` | Escribe perfil, redes y/o áreas (detalles abajo) |
| `read_portfolio` | Renderiza el portafolio de `PORTFOLIO_URL` y lo une con `portfolio-extra.json` |
| `diff` | Compara CvLAC contra el portafolio: `missing`, `toUpdate`, `similar`, `upToDate` |
| `lookup_doi` | Consulta Crossref sin escribir y devuelve un borrador de artículo para revisar |
| `complete_product` | Completa la segunda fase de un producto existente: reemplaza y ordena palabras clave, áreas, coautores y reconocimientos; en tesis vincula estudiantes con su participación. `dry_run:true` previsualiza; retirar valores requiere `confirm_delete:true` |
| `update_section` | Aplica un cambio puntual: `add`, `update` o `delete` |
| `sync` | `diff` + aplica `missing` y `toUpdate`. `dry_run:true` para previsualizar. Los `similar` nunca se aplican solos |
| `screenshot` | Captura la `url` dada, o la última lista, ficha o formulario visitado, recargado tal como está ahora. Rechaza los enlaces de acción (borrar, guardar): en CvLAC abrir uno lo ejecuta |
| `inspect_form` | Lista los campos reales (`input`/`select`/`textarea`) de una URL de CvLAC, con sus opciones y cuáles son obligatorios |

Una tool que falla devuelve `isError: true`. `needs_confirmation` y `unverified` no son errores: piden
que una persona decida o revise.

### `complete_product`

`label` encuentra un producto existente y la operación recibe una o más listas completas:

- `keywords`: palabras clave ordenadas.
- `areas`: áreas de conocimiento ordenadas, por nombre o código de CvLAC.
- `coauthors`: nombres de coautores ordenados desde el catálogo de perfiles previamente registrados;
  el propietario de la hoja de vida se conserva automáticamente.
- `recognitions`: títulos de reconocimientos ordenados desde los reconocimientos ya registrados en
  el currículo CvLAC.
- `students`: solo para `tesis`; objetos `{name, participation, person_id?}`. `participation` acepta
  `TUT`, `ASE`, `COT`, `ORI` o sus etiquetas (`Tutor`, `Asesor`, `Cotutor`, `Orientado`). Si se omite,
  se usa `ORI`.

Las listas reemplazan lo almacenado. Si la operación quitaría valores existentes, primero devuelve
`needs_confirmation` con `removed`; repite con `confirm_delete:true`. Una persona no resuelta o con
varios perfiles posibles vuelve en `choices` y no se escribe nada.

### `update_section`

Secciones: `formacion`, `formacionComple`, `experiencia`, `cursos`, `reconocimientos`, `proyectos`,
`software`, `eventos`, `idiomas`, `lineas`, `demasTrabajos`, `articulos`, `libros`, `capitulos`,
`tesis`, `jurados`, `informesTecnicos`, `innovacionesProceso`, `productosTecnologicos`, `consultorias`,
`prototipos`. El esquema de `data` de cada una está en
[`src/schemas.ts`](https://github.com/stivenson/cvlac-mcp/blob/master/src/schemas.ts); un campo mal formado
se rechaza nombrándolo, antes de abrir el navegador.

| `status` | Significa |
|---|---|
| `ok` | Se guardó. Revisa los `warnings` de todos modos: traen los campos que no se llenaron |
| `needs_confirmation` | **No se escribió nada.** Tres causas: ítems parecidos en `similar` (repetir con `confirm_duplicate:true` o hacer `update`); una institución ambigua con candidatos en `choices` (repetir con `data.institucionId`); o un `delete` sin `confirm_delete:true` |
| `failed` | CvLAC rechazó el formulario. `message` trae su error, nombrando los campos |
| `unverified` | **Se envió y no se pudo confirmar**, típicamente porque CvLAC se cayó a mitad. No reintentar a ciegas: verificar con `read_cvlac_detail` |

Más detalles:

- Un `update` que no logre cambiar ningún campo del formulario **no se envía**: devuelve `failed` con
  los warnings.
- Una institución con coincidencia exacta se resuelve sola. El catálogo tiene duplicados exactos —seis
  "Universidad de los Andes"—, así que el nombre no siempre basta.
- **formacionComple** usa el mismo formulario que `formacion`, con otro catálogo de niveles (`Y` Otros,
  `8` Extensión, `F` Cursos de corta duración, `E` MBA) y `startMonth`. El `add` solo funciona con un
  programa académico que CvLAC ya tenga registrado para esa institución y nivel.
- **demasTrabajos**: `name`, `year`, `month`, `medio` (Papel, Internet u Otro), `finalidad`, y
  opcionalmente `idioma` y `ciudad`. El formulario trae Enero y Papel preseleccionados: si faltan
  `month` o `medio` se guardan esos, y lo avisa.
- **idiomas**: `language` (nombre en español o código ISO de 2 letras) y los niveles
  `read`/`write`/`speak`/`listen`, o un `level` que los fija todos: Deficiente, Aceptable o Bueno.
- **lineas**: `name`, `active` (por defecto `true`, y lo avisa) y `objective`.
- **experiencia**: el formulario de CvLAC no tiene campo de cargo; si el ítem trae `role`, se avisa que no
  se escribió.

### `update_profile`

- `description` reemplaza el texto de perfil. **No se puede vaciar**: CvLAC lo marca obligatorio (máx.
  3950 caracteres).
- `networks` se **fusionan** con lo guardado: el formulario de CvLAC reescribe la tabla entera, así que
  la tool la lee primero y reenvía todo. `url:null` quita una red y exige `confirm_delete:true`. Redes
  aceptadas: `google_scholar`, `researchgate`, `ssr`, `ssrn`, `academia_edu`, `mendeley`, `linkedin`,
  `repositorios_disciplinares`, `repositorios_institucionales`, `researcher_id`, `scopus_author_id`,
  `orcid` y `otro` (con su nombre en `label`).
- `areas` es la lista completa de áreas de actuación **en orden** —la primera es la principal—, por
  nombre o por código de CvLAC (`0-1B01`). Reemplaza lo guardado: dejar una fuera es borrarla y exige
  `confirm_delete:true`. El catálogo tiene 267 áreas en tres niveles; un nombre ambiguo vuelve en
  `choices` en vez de adivinarse.

<a id="variables"></a>

## Variables de entorno

Se definen en el `.env`, o en el bloque `env` de la configuración de la app, que tiene prioridad.

| Variable | Descripción |
|---|---|
| `CVLAC_NOMBRE` | Primer nombre con el que inicias sesión en CvLAC |
| `CVLAC_CEDULA` | Documento de identidad |
| `CVLAC_PASSWORD` | Contraseña de CvLAC |
| `CVLAC_ENV_FILE` | Ubicación del propio `.env`. Imprescindible instalado desde npm, donde el servidor corre desde la caché de `npx`. Va en la configuración de la app, no en el `.env` |
| `CVLAC_SESSION_PATH` | Dónde se guarda la sesión. Por defecto, `.cvlac-session.json` en la carpeta de usuario |
| `PORTFOLIO_URL` | Portafolio a comparar. También configurable como `portfolioUrl` en `cvlac.config.json` |
| `CVLAC_CONFIG_PATH` | Ubicación de `cvlac.config.json` |
| `CVLAC_PORTFOLIO_EXTRA_PATH` | Ubicación de `portfolio-extra.json` |
| `CVLAC_HEADLESS` | `false` abre el navegador para ver qué hace |
| `CVLAC_LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error` \| `silent`. Los logs van a stderr |
| `CVLAC_LOG_FILE` | Además de stderr, agrega cada línea a este archivo |
| `CVLAC_USER_AGENT` | Reemplaza el user-agent. Por defecto se usa el del Chromium real, que coincide con el sistema |

Al arrancar, el servidor escribe en stderr qué `.env` leyó:
`env file: <ruta> (found, 3 vars)`, o `NOT FOUND`, o `read as utf16le` / `read as latin1` si no estaba en
UTF-8.

### Ritmo de las peticiones

CvLAC empieza a responder 5xx cuando las peticiones llegan pegadas. El servidor espacía cada navegación,
reintenta con backoff y, si el sitio rechaza varias seguidas, deja de insistir hasta que pase un
enfriamiento. Los valores por defecto sirven para un `sync` normal; súbelos si notas 503 seguidos:

| Variable | Default | Descripción |
|---|---|---|
| `CVLAC_MIN_REQUEST_GAP_MS` | `900` | Espera mínima entre dos peticiones |
| `CVLAC_REQUEST_JITTER_MS` | `700` | Aleatorio que se suma a esa espera, para no tener un ritmo de máquina |
| `CVLAC_NAV_TIMEOUT_MS` | `30000` | Cuánto esperar a que cargue una página |
| `CVLAC_NAV_MAX_ATTEMPTS` | `3` | Intentos por navegación (5xx o timeout). `1` desactiva reintentos |
| `CVLAC_BACKOFF_BASE_MS` | `2000` | Espera tras el primer fallo; se duplica en cada intento |
| `CVLAC_BACKOFF_CAP_MS` | `30000` | Techo de esa espera |
| `CVLAC_OUTAGE_THRESHOLD` | `3` | Navegaciones fallidas seguidas antes de cortar el tráfico |
| `CVLAC_OUTAGE_COOLDOWN_MS` | `120000` | Cuánto se queda quieto tras cortar |

<a id="arquitectura"></a>

## Arquitectura

```text
src/
├── index.ts                  # Entry point: subcomandos, carga del .env, stdio transport
├── cli.ts                    # install-browser, --version, --help
├── env.ts                    # Ubicación y lectura del .env (UTF-8, UTF-16 o ANSI)
├── server.ts                 # Registro de tools MCP, isError
├── types.ts                  # Tipos de portfolio/CvLAC/diff/update
├── schemas.ts                # Un schema zod por sección
├── config.ts                 # cvlac.config.json
├── logger.ts                 # Logs a stderr, con secretos ocultos
├── diff.ts                   # Motor de comparación (normalize + nameMatches)
├── browser/
│   ├── session.ts            # Login, sesión persistente, Playwright context
│   ├── navigation.ts         # URLs de listas y formularios CvLAC
│   ├── navigate.ts           # Toda navegación: ritmo, reintentos, cortes
│   ├── pacing.ts             # Espaciado de peticiones y backoff
│   ├── availability.ts       # Distingue "CvLAC caído" de un error propio
│   └── catalogue.ts          # Catálogos de CvLAC (municipios, instituciones)
├── tools/
│   ├── login.ts  read-cvlac.ts  read-cvlac-detail.ts  read-portfolio.ts  diff.ts  sync.ts
│   ├── update-section.ts     # add/update/delete por sección
│   ├── write-verdict.ts      # ¿Se guardó? saved / rejected / unverified
│   ├── profile.ts            # Perfil y redes académicas
│   ├── areas.ts              # Áreas de actuación
│   └── screenshot.ts
└── extractors/
    ├── portfolio.ts          # Renderiza el portafolio + portfolio-extra.json
    └── cvlac/                # Un extractor por sección, sobre rows.ts
```

Las decisiones de diseño y las trampas de CvLAC que ya costaron un bug están en
[`CLAUDE.md`](https://github.com/stivenson/cvlac-mcp/blob/master/CLAUDE.md), y las URLs, columnas y
nombres de campos verificados en vivo, en
[`docs/cvlac-findings.md`](https://github.com/stivenson/cvlac-mcp/blob/master/docs/cvlac-findings.md).

<a id="pruebas"></a>

## Pruebas y build

```bash
npm test          # suite completa: sin red, sin credenciales, sin CvLAC
npm run build     # compila src/ a dist/, que es lo que ejecuta la app
npm run dev       # corre src/ con tsx, sin compilar
npm run test:watch
```

Los tests cubren extractores (contra fixtures HTML anonimizados), el motor de diff, los schemas, la carga
de configuración y del `.env`, la redacción de secretos en logs, el reporte de `sync`, el borde MCP y la
lectura de fichas de detalle. Los fixtures llevan datos ficticios a propósito: si capturas HTML real para
uno nuevo, anonimízalo antes de commitear.

El workflow [`smoke`](https://github.com/stivenson/cvlac-mcp/actions/workflows/smoke.yml) corre en Linux,
Windows y macOS: compila, corre los tests, instala Chromium con `install-browser` y ejecuta
`scripts/smoke.mjs`, que comprueba el arranque, el protocolo MCP, las tools registradas, el mensaje sin
credenciales y que el navegador abra. Otro job escribe el `.env` en PowerShell 5.1 y 7 de las tres formas
habituales y verifica que el servidor lo lea. Lanzado a mano, prueba además el paquete tal como se
instala desde npm.

### Suite en vivo (opcional, escribe en tu CvLAC real)

```bash
CVLAC_E2E=1 npm run test:e2e:live                      # las secciones con lista
CVLAC_E2E=1 npm run test:e2e:live -- --sections=cursos  # solo una
CVLAC_E2E=1 npm run test:e2e:live -- --sections=perfil  # perfil y redes
```

Recorre el CRUD completo por sección contra tu cuenta real: lista → `add` → lista → `read_cvlac_detail` →
`add` repetido (debe devolver `needs_confirmation`) → `update` → detalle para comprobar el cambio →
`delete` → lista final. Cada ítem que crea lleva el prefijo `ZZ PRUEBA MCP`, siempre intenta borrarlo y,
si algo sobrevive, lo reporta al final para que lo borres a mano. `--sections=perfil` toma un snapshot,
escribe en una red que nadie use, la edita, la borra y restaura lo que había.

Es la única suite que toca datos reales: por eso exige `CVLAC_E2E=1` y no corre con `npm test`. Habla con
`dist/index.js`, así que va después de `npm run build`. Deja el reporte en
`tests/e2e/report-<fecha>.json` (gitignored).

<a id="problemas-dev"></a>

## Problemas de desarrollo

- **La app usa una versión vieja del código:** ejecuta `npm run build` tras cambiar `src/`. La app corre
  `dist/index.js`, no `src/index.ts`.
- **No aparece en la app (instalación clonada):** revisa la ruta absoluta a `dist/index.js` en `args`, con
  barras dobles en Windows, y reinicia la app.
- **Un formulario no guarda un campo:** varios campos de CvLAC son `readonly` y se llenan por JS. Usa
  `inspect_form` para ver los nombres reales, `CVLAC_HEADLESS=false` para ver el navegador y
  `CVLAC_LOG_LEVEL=debug` para el detalle de cada campo.
- **Falsos faltantes en `diff`:** `nameMatches()` normaliza tildes y sufijos (`(en línea)`,
  ` - Aprobado ...`); la experiencia está fuera del diff a propósito.

<a id="estado"></a>

## Estado y roadmap

Las 11 secciones originales, el perfil, las redes académicas y las áreas de actuación se leen y escriben
(`add`/`update`/`delete`), con CRUD verificado contra el CvLAC real. También están implementadas las
secciones de artículos, libros, capítulos, tesis, jurados y producción técnica. El CRUD real se verificó
completo en artículos; en informes técnicos y consultorías se verificaron altas, listado, detalle,
bloqueo de duplicados y borrado. Algunos campos de edición dependen de variaciones del formulario real
y quedan documentados en el roadmap. El diff y el bloqueo de duplicados también cubren las listas
completas mediante paginación JMesa.

`complete_product` ya completa palabras clave, áreas, coautores y reconocimientos de productos
existentes, y vincula estudiantes de tesis con su participación. La operación fue verificada e2e con
registros temporales; los certificados siguen pendientes.

Detalle completo, limitaciones conocidas y lo que sigue:
**[ROADMAP](https://github.com/stivenson/cvlac-mcp/blob/master/ROADMAP.md)**.
