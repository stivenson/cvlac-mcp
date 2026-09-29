# Roadmap

Dónde está `cvlac-mcp` y qué falta. Actualizado: **2026-09-27**.

## Estado actual

Funciona de punta a punta contra el CvLAC real: lee, calcula el diff contra el portafolio y escribe con supervisión.

Un recorrido de las **86 entradas** del menú de CvLAC (2026-09-16) encontró que solo **11 tenían datos**. Esas 11 están gestionadas, con **CRUD verificado en vivo** por `tests/e2e/live-crud.mjs`. Además se gestionan el perfil del investigador y las redes académicas, que no son listas. El bloque de producción bibliográfica, tesis, jurados y cinco familias técnicas ya está implementado y cubierto por pruebas locales; falta la verificación e2e explícita contra una cuenta real.

| Área | Estado |
|---|---|
| Lectura de las 11 secciones con datos | ✅ Verificada contra el CvLAC real |
| Diff (faltantes / a actualizar / parecidos / al día) | ✅ |
| Bloqueo de duplicados (`needs_confirmation`) | ✅ Verificado en vivo |
| Escritura `add` / `delete` | ✅ Verificada en vivo en las 11 secciones |
| Escritura `update` | ✅ Verificada en vivo en las 11 secciones |
| Confirmación antes de borrar | ✅ `confirm_delete`; sin él no se escribe nada |
| Combobox ambiguo resuelto por una persona | ✅ `needs_confirmation` con candidatos en `choices` |
| Perfil, redes académicas y áreas de actuación | ✅ `read_profile` / `update_profile`, CRUD verificado en vivo |
| No enviar un formulario incompleto o sin cambios | ✅ Enviarlo tumbaba el validador de CvLAC con un 500 |
| Veredicto honesto de una escritura | ✅ `ok` / `failed` / `unverified`, decidido por lo que CvLAC almacenó, no por cómo respondió |
| Ritmo de peticiones y anti-bloqueo | ✅ Pacer, backoff, `Retry-After` y cortacircuitos, configurables por env |
| Warnings por campo + errores del servidor | ✅ |
| CvLAC caído (5xx) reportado como tal | ✅ Antes la sección se leía vacía |
| Configuración personal fuera del código | ✅ |
| Logging con redacción de secretos | ✅ |
| Lectura de la ficha de detalle de un ítem | ✅ `read_cvlac_detail`, genérica |
| Tests | ✅ 580 pruebas locales sin red, + suite e2e en vivo opt-in |
| Producción bibliográfica, tesis, jurados y cinco familias técnicas | ✅ Implementada; 580 pruebas locales pasan; CRUD real verificado en artículos y altas/bajas de informes y consultorías |
| Borrador de artículo desde DOI | ✅ `lookup_doi`, solo lectura contra Crossref |

## Limitaciones conocidas

Cosas que el diseño actual no puede hacer, no bugs pendientes.

- **Experiencia profesional está fuera del diff.** Los nombres de empresa en CvLAC difieren demasiado de los del portafolio (la razón social, "EMPRESA EJEMPLO COLOMBIA SAS", contra el nombre comercial, "Ejemplo Tech (Banco X)") y el cargo no aparece en la lista, solo en el detalle. Un match automático generaría falsos faltantes. Se gestiona a mano.
- **Proyectos, software y eventos solo se pueden crear, nunca actualizar.** Su vista de lista muestra únicamente el nombre, así que no hay con qué comparar para detectar un cambio.
- **El `add` de formación complementaria depende del catálogo de CvLAC.** Su buscador de programas académicos solo ofrece los ya registrados para esa institución y ese nivel, y el popup no permite crear uno. Si no hay ninguno, la sección no admite altas — ni desde aquí ni desde la web con ese picker.
- **El portafolio se lee renderizándolo.** Ya no se parsea el bundle: `fetchPortfolioData` abre un chromium y lee el DOM de `#/resume` y del dashboard. Sigue dependiendo de los nombres de clase del sitio, pero ahora un cambio se ve como listas vacías con warning en el log, no en silencio. `achievements` y `skills` también se leen.
- **Los pickers readonly de fecha y municipio se inyectan por JS.** Ya no se pierden valores: el municipio se resuelve por la cascada del popup (su código no es el DANE) y las fechas van en `yyyy-mm-dd`. Ver `docs/cvlac-findings.md`.

## Siguiente

Ordenado por relación valor/riesgo.

### 1. Fichas antiguas con un tercer layout

`extractDetailFields` cubre los dos layouts conocidos (etiqueta y valor en la misma fila; fila de etiquetas en `<b>` sobre fila de valores). Algunas fichas viejas —vistas en `cursos`— no marcan sus etiquetas con `<b>` y salen emparejadas mal (`Sitio web (URL)=DOI`). No afecta escrituras, solo la lectura de esos registros.

### 2. `extractDetailFields` bajo `npm run dev`

Declara funciones con nombre dentro de un `$$eval`, y esbuild —que usa `tsx`— las envuelve en un `__name` que no existe en la página. Revienta solo en modo dev: el `dist` que ejecuta el MCP y la suite e2e no está afectado. Arreglo: escribir esos callbacks sin funciones nombradas, como ya se hace en `portfolio.ts`.

### 3. Segunda fase de productos y verificación e2e

La primera fase ya registra artículos, libros, capítulos, tesis, jurados y cinco familias técnicas.
La segunda fase ya fue explorada en vivo: la ficha de cada producto abre ventanas para coautores,
palabras clave, áreas y reconocimientos; las tesis tienen además una pantalla distinta para vincular
estudiantes y elegir su tipo de participación. Los hallazgos y endpoints están en
`docs/cvlac-findings.md`. Los certificados de libros son cargas de archivos separadas del resto de la
segunda fase y ya se adjuntan desde `update_section`.

Siguiente implementación, en orden de riesgo:

1. E2E real por tipo de producto: completar, leer la ficha, editar, verificar y limpiar.

`complete_product` ya gestiona palabras clave, áreas, coautores y reconocimientos, además de estudiantes
vinculados en tesis con su tipo de participación. Resuelve catálogos CvLAC, conserva el propietario,
reemplaza las listas completas y exige confirmación explícita antes de retirar valores. Los certificados
PDF de libros se validan localmente y se adjuntan durante el alta o edición mediante
`certificateCLCDO`/`certificateCLRI`. Fue verificado en vivo con libros temporales; CvLAC no ofrece una
lectura posterior fiable de los archivos.

### 4. Separar la fuente de datos del motor

Hoy `diff` y `sync` solo leen un portafolio web con una estructura concreta, que casi ningún
investigador tiene. Si reciben un JSON normalizado de hoja de vida, con esquema publicado, cualquier
fuente pasa a ser un adaptador: un PDF o Word de la hoja de vida, el dictado en el chat, ORCID, un
portafolio web o el `portfolio-extra.json` actual. El modelo del cliente puede armar ese JSON casi
siempre sin código nuevo en el servidor.

### 5. Usar el detalle para detectar `update` en proyectos, software y eventos

`read_cvlac_detail` ya lee la ficha de un ítem; falta que `diff.ts` la use. Entrar al detalle de cada ítem permitiría comparar fechas y tipo, y con eso detectar `update` en esas tres secciones. Cuesta una navegación por ítem; vale la pena solo si esas secciones empiezan a cambiar seguido.

### 6. Sostener el paquete de npm

**Publicado el 2026-09-28**: [`cvlac-mcp@1.0.3`](https://www.npmjs.com/package/cvlac-mcp). Verificado
contra el registro real: `npx -y cvlac-mcp` arranca y responde `tools/list` sin ruido en stderr.

La decisión anterior era esperar a que alguien reportara fricción clonando. Se adelantó porque el
proyecto pasó de uso propio a difusión: el público al que se quiere llegar —investigadores, no
desarrolladores— no clona ni compila, y sin `npx` el README pedía algo que ese lector no iba a hacer.

Lo que compró la publicación, y ahora hay que sostener:

- **Versionado.** `dist` sale del `tsc` local, así que una publicación con el árbol sucio sube código
  que no está en git. Publicar solo desde `master` limpio, con tag.
- **Issues de instalación.** Chromium de Playwright y `CVLAC_ENV_FILE` son las dos fuentes probables.
  El Troubleshooting del README cubre ambas, y `install-browser` quita la primera de raíz.
- **Playwright queda clavado en una versión exacta.** Un build de navegador pertenece a una versión de
  la librería: con `^` el usuario podía terminar con un Chromium que el servidor no arranca. Subirla es
  ahora un cambio deliberado, y obliga a correr la suite e2e en vivo antes de publicar.
- **El nombre es irreversible.** `npm unpublish` solo aplica dentro de las primeras 72 horas y no
  libera el nombre.

Pendiente: automatizar la publicación desde CI queda descartado por ahora — npm está restringiendo los
tokens que se saltan el 2FA ([aviso](https://gh.io/npm-gat-bypass2fa-deprecation)), y la cuenta usa
passkey. Se publica a mano.

## Ideas sin compromiso

- Cachear el resultado de `findInstitucionId` — hoy hace una petición por institución en cada escritura.
- Tools para identificación y direcciones, los dos registros únicos que quedan sin explorar.
- Un `--dry-run` de verdad a nivel de formulario: llenar y capturar screenshot sin enviar.

## Checklist de apertura del repo

El repo **ya está público**. Queda lo que sigue pendiente de todos modos.

- [ ] **Rotar la contraseña del CvLAC.** Estuvo en `~/.claude/mcp.json` y en documentos locales. Nada indica exposición, pero es barato — y ahora el repo es público, así que no hay razón para seguir postergándolo.
- [x] Datos personales fuera del código (`.env`, `cvlac.config.json`, `data/portfolio-extra.json`, todos gitignored con su `.example`).
- [x] Fixtures de test con datos ficticios.
- [x] LICENSE.
- [x] README con instalación genérica y aviso de uso responsable, cubriendo Cursor, Claude Code,
      Claude Desktop, VS Code, Windsurf, Zed y JetBrains.
- [ ] Barrido final de secretos sobre el árbol a publicar:
      `git grep -inE '<tu nombre>|<tu cédula>|<tu municipio>|<tus instituciones>'`
- [ ] Decidir si el workspace cliente se publica junto con este repo. Vive aparte, en [`stivenson/cvlac-workspace`](https://github.com/stivenson/cvlac-workspace) (privado): skill `cvlac-sync`, `.mcp.json` y las notas de estado del CvLAC.
- [x] Cambiar el repo a público.

## Historial

- **2026-09-29 (1.0.4)** — Añadida la carga de certificados PDF de libros mediante
  `certificateCLCDO` y `certificateCLRI`, con validación local de firma, existencia y límite de 2 MiB.
  Corregido el campo actual `cod_editorial_otro` y la confirmación de altas cuando CvLAC vuelve a
  mostrar el formulario vacío. Verificado con CRUD real temporal y 593 pruebas locales.
- **2026-09-28 (1.0.3)** — Ampliado el CRUD MCP para artículos, libros, capítulos, tesis, jurados y
  producción técnica; añadido `lookup_doi` con Crossref, catálogos y manejo robusto de formularios.
  Publicado con 580 pruebas locales pasando, README actualizado y dependencias de producción corregidas
  tras la auditoría de npm.
- **2026-09-27 (1.0.2, limpieza)** — Fuera del repo público todo dato personal del autor: los documentos
  de diseño iniciales y el script de perfil de una sola vez (pasan al workspace privado), los empleadores
  y cursos que servían de ejemplo en código y documentación, los conteos de su CvLAC, y el municipio y las
  instituciones con que lo ubicaban. Los fixtures, que decían ser ficticios pero copiaban su hoja de vida
  con cambios mínimos, llevan ahora datos inventados de verdad. Los hallazgos de CvLAC se conservan, contados
  sin nombrar a quién pertenecía el registro.
- **2026-09-27 (1.0.2)** — README reescrito para investigadores sin perfil técnico, sin perder la
  referencia técnica. Abre con qué es y un ejemplo de conversación; dice qué puede hacer y **qué no**
  (producción bibliográfica, tesis, jurados, cuentas extranjeras) y que el `diff` solo sirve con un
  portafolio de estructura concreta —antes prometía fuentes que no usaba—. La instalación va con Claude
  Desktop primero, el `.env` en Windows con el Bloc de notas, y la prueba con frases para el chat en vez de
  nombres de tools. Los detalles técnicos quedan plegados, y todo lo de desarrollo pasa a una segunda
  parte. Anclas explícitas sin tildes para que los enlaces internos funcionen también en npm, y el
  diagrama `mermaid` pasa a texto, porque npm no lo dibuja.
- **2026-09-27 (noche)** — Bloque 1.0.1 del reporte de prueba en Windows. **Un login rechazado ya no
  se reintenta**: el error salía dentro de `withRetry`, así que una clave equivocada se enviaba tres
  veces contra la cuenta real; ahora es un `LoginRejectedError` que atraviesa el retry. **El `.env` se
  lee aunque no esté en UTF-8**: `env.ts` detecta UTF-16 (`Out-File`) y ANSI (`Set-Content`), lo
  decodifica y lo deja en el log al arrancar (`env file: <ruta> (found, N vars)`), y el error de
  credenciales dice qué variables faltan y qué ruta leyó. `CVLAC_SESSION_PATH` y `CVLAC_USER_AGENT` se
  resuelven al usarse: como constantes de módulo se evaluaban antes de cargar el `.env` y se ignoraban.
  Sin user-agent fijo (decía Linux y Chrome 124 desde Windows), y el archivo de sesión se crea `0600`.
  **Las tools marcan `isError`** cuando fallan, no solo con `"success": false` en el texto.
  `screenshot` recarga la última lista, ficha o formulario visitado (o la `url` que se le pase) en vez de
  capturar una página en blanco, y rechaza los enlaces de acción, porque en CvLAC un borrado es un GET.
  El reporte de `sync` sugería `confirmDuplicate`, un parámetro que no existe: un test cruza ahora los
  nombres que citan los mensajes contra los esquemas. README: sección Windows con `cmd /c`,
  `MSYS_NO_PATHCONV` y `--%`, `--use-system-ca`, valores entre comillas simples, `icacls`, la sesión
  como credencial, versión mayor fijada (`cvlac-mcp@1`) y enlaces absolutos para que se vean en npm.
  El job de CI de Windows ahora prueba el lector con los tres modos de escribir el `.env`. Tests de 433
  a 580.
- **2026-09-27 (tarde)** — Auditoría del paquete publicado, con tres arreglos de portabilidad.
  `install-browser` descarga Chromium con el CLI de Playwright que trae el paquete, no con el último
  publicado: un build de navegador pertenece a una versión de la librería, y `npx playwright install`
  —que siempre resuelve a la última— dejaba un Chromium que el servidor no arranca. Por lo mismo,
  Playwright pasó de `^1.59.1` a `1.59.1` exacto. El error de arranque ya no repite el consejo de
  Playwright, que apunta a la versión equivocada, sino el comando correcto. En Windows, el `.env` que
  documentaba el README se escribía con `Set-Content` (ANSI, tildes dañadas) y con `Out-File` habría
  quedado en UTF-16, que el lector de `.env` ignora **entero** sin avisar: se cambió a
  `[IO.File]::WriteAllText`. Añadidos `--version` y `--help`. Tests de 421 a 433.

- **2026-09-27** — Publicado en npm como `cvlac-mcp@1.0.0`, y el README reposicionado alrededor de esa
  vía: abre diciendo qué hace el servidor —actualizar la hoja de vida sin llenar formularios— en vez de
  cómo nació —sincronizar un CvLAC con un portafolio—, y la instalación con `npx` pasó de nota al pie a
  primer camino, con el clonado reservado para desarrollar o auditar. La sección de seguridad creció a
  dos bloques: dónde quedan las credenciales y qué hosts se tocan de verdad (CvLAC y la URL de
  portafolio que configure el usuario, nada más), y que el modelo de IA del editor sí ve lo que las
  tools devuelven. Publicar exigió 2FA: npm ya no acepta TOTP nuevo, solo passkey.

- **2026-09-18** — Todas las secciones con datos quedaron gestionadas: formación complementaria, idiomas, líneas de investigación y demás trabajos, más el perfil del investigador y las redes académicas. Tres reglas nuevas, cada una nacida de una escritura que mintió: un `delete` no se ejecuta a la primera, un formulario sin cambios o sin un campo obligatorio no se envía (enviarlo devolvía un 500 del validador de CvLAC que se leía como validación fallida), y un combobox ambiguo lo resuelve una persona — el catálogo tiene seis "Universidad de los Andes" y antes se tomaba la primera. `read_portfolio` pasó de parsear el bundle a renderizar el sitio, que llevaba devolviendo todo vacío desde que el portafolio se reescribió. El diff dejó de reportar como faltante lo que CvLAC guarda en otra sección o con otra redacción: `sync` habría duplicado dos registros. Áreas de actuación cerró la lista: su catálogo de 267 áreas viaja entero dentro de la página del popup, y el `select multiple` que las guarda solo envía lo seleccionado, así que se escriben seleccionadas en vez de confiar en el handler de la página. Tests de 291 a 421.

- **2026-09-12** — Un 5xx de CvLAC ya no se lee como sección vacía: `assertAvailable` corta en cada navegación y el usuario recibe el motivo. Tests del borde MCP (registro de tools, validación previa a cualquier navegación) y de las URLs por sección. Empaquetado para npm listo pero **sin publicar** (ver punto 5). `CVLAC_ENV_FILE` para instalaciones fuera del repo; corregido que dotenv escribía su banner en el stdout del MCP, o sea tráfico malformado en el canal JSON-RPC de cada arranque. README cubre los siete editores MCP en vez de solo Cursor. Tests de 138 a 142.
- **2026-07-20** — Configuración personal externalizada; logging con redacción; warnings por campo y lectura de los errores del formulario; diff con cuatro grupos y bloqueo de duplicados; tests de 12 a 138. Se descubrió y corrigió que una sesión expirada no redirige (habría duplicado todo el portafolio en un `sync`).
- **2026-05-31** — Primera sincronización real: dos ítems agregados desde el portafolio.
- **2026-05-30** — Navegación en vivo del CvLAC; URLs, columnas y campos de formulario documentados en `docs/cvlac-findings.md`.
- **2026-04-14** — Diseño e implementación inicial (7 tools, extractores, motor de diff).
