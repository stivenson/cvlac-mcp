# CLAUDE.md

Guía para agentes IA que trabajen en este repo (`cvlac-mcp`).

## Qué es

Servidor **MCP** (stdio) en TypeScript que automatiza el perfil **CvLAC** de MinCiencias usando **Playwright**. Compara un portafolio web (el que indique `PORTFOLIO_URL`) contra el CvLAC oficial y aplica los ítems faltantes, con supervisión humana. El repo es genérico: cualquier persona con CvLAC puede usarlo configurando sus propios archivos.

El cliente MCP (Claude) ejecuta `dist/index.js`. **El código fuente está en `src/` y se compila a `dist/`.**

## Comandos

```bash
npm run build      # tsc → compila src/ a dist/ (lo que ejecuta el cliente MCP)
npm run dev        # tsx src/index.ts (corre sin compilar)
npm test           # vitest run
npm run test:watch # vitest en watch
npm start          # node dist/index.js
```

> **Importante:** tras cambiar `src/`, hay que `npm run build` para que el cliente MCP use la versión nueva (apunta a `dist/index.js`).

## Convenciones del proyecto

- **ESM + Node16 module resolution.** Todos los imports internos llevan extensión `.js` (aunque el archivo sea `.ts`), p. ej. `import { session } from './browser/session.js'`. No lo quites.
- **`strict: true`** en tsconfig. Evita `any`; usa los tipos de `src/types.ts`.
- **Nada personal en el código.** Ni credenciales, ni ciudad, ni institución, ni datos curados. Todo vive en tres archivos gitignored, cada uno con su `.example` versionado:
  - `.env` — credenciales y rutas (`CVLAC_NOMBRE`, `CVLAC_CEDULA`, `CVLAC_PASSWORD`, `CVLAC_SESSION_PATH`, `PORTFOLIO_URL`) y opciones (`CVLAC_HEADLESS`, `CVLAC_LOG_LEVEL`, `CVLAC_LOG_FILE`).
  - `cvlac.config.json` — `ownerNamePattern` y `defaults` (municipio + código DANE, institución de respaldo, horas semanales, idioma, país).
  - `data/portfolio-extra.json` — proyectos, software y eventos curados a mano.
  Si un valor falta, el campo se deja vacío y se reporta un warning. **Nunca inventes un default personal en el código**: escribiría el dato de otra persona en un registro oficial.
- **Idioma:** comunicación y docs en español; código/identificadores en inglés.
- `dist/`, `.env`, `cvlac.config.json`, `data/portfolio-extra.json`, `*.cvlac-session.json` y `*.screenshot.png` están en `.gitignore` — no commitearlos.

## Arquitectura

```
src/
├── index.ts                  # Entry point: carga .env, crea server, conecta stdio transport
├── server.ts                 # Registra las 8 tools con registerTool (valida data con schemas zod)
├── types.ts                  # Interfaces Portfolio*, CvLAC*, Diff*, Update*
├── schemas.ts                # Un schema zod por sección + portfolioExtraSchema
├── config.ts                 # Carga cvlac.config.json (defaults personales)
├── logger.ts                 # Log a stderr con niveles y redacción de secretos
├── diff.ts                   # classifyMatch() + computeDiff() (4 buckets)
├── browser/
│   ├── session.ts            # BrowserSession singleton (Playwright). Login + storageState
│   └── navigation.ts         # URLS constantes (list/create) del CvLAC
├── tools/                    # Una función por tool MCP
│   ├── login.ts  read-cvlac.ts  read-cvlac-detail.ts  read-portfolio.ts  diff.ts
│   ├── update-section.ts     # (grande) llena formularios CvLAC por sección
│   ├── sync.ts  screenshot.ts
└── extractors/
    ├── portfolio.ts          # Parsea el bundle React del portafolio (regex) + portfolio-extra.json
    └── cvlac/
        rows.ts               # readRows/mapRows compartidos por todos los extractores
        formacion / experiencia / cursos / reconocimientos / proyectos / software / eventos
tests/                        # vitest, sin red: extractores (fixtures HTML), diff, schemas,
                              # config, logger, sync (mocks), update-section (helpers), detalle
tests/e2e/                    # suite en vivo (opt-in, escribe en el CvLAC real)
data/                         # portfolio-extra.json (gitignored) + su .example
```

Flujo de datos: `index.ts` → `server.ts` (router) → `tools/*` → `browser/session` (Playwright) + `extractors/*` → `diff.ts`.

## Tools MCP (registradas en `server.ts`)

`login`, `read_cvlac`, `read_cvlac_detail`, `read_portfolio`, `diff`, `update_section`, `sync`, `screenshot`, `inspect_form`.

**Secciones:** `formacion`, `experiencia`, `cursos`, `reconocimientos`, `proyectos`, `software`, `eventos`.

## Detalles que muerden (lee antes de tocar)

- **Fuente de verdad verificada en vivo:** `docs/cvlac-findings.md` documenta (navegación real 2026-05) las URLs, columnas de tabla y nombres de campos de formulario de las 7 secciones. Consúltalo antes de tocar extractores o `update-section.ts`.
- **Sesión persistente:** `session.ts` guarda `storageState` en `~/.cvlac-session.json` (o `CVLAC_SESSION_PATH`). `checkSession()` valida navegando a `formacion`; si redirige a `Login`, re-loguea. Tras login resetea el context para recargar cookies. Hay medidas anti-bot (user-agent Chrome real, `--disable-blink-features=AutomationControlled`, oculta `navigator.webdriver`, `humanDelay`, `withRetry`).
- **Login flow:** `tpo_nacionalidad='C'` (verificado: "Colombiana" = value `C`, NO `COL`), llena `#txt_nmes_rh` / `#nro_documento_ident` / `#txt_contrasena`, click `#botonEnviar`. Redirige a `EnRecursoHumano/inicio.do`; ese inicio.do a veces da 503 ("Server Unavailable") pero la sesión queda válida. `update_section` ya NO fuerza re-login en cada llamada: reusa sesión y `gotoForm()` re-loguea solo si cae en la página de login.
- **Listas (`all.do`):** filas `tr.odd`/`tr.even`; el selector aísla bien los datos (el menú usa `<li>`). Índices de columna verificados por sección (ver findings). En `reconocimientos` `cells[2]` es el **año**, no descripción.
- **Cursos = `EnProdCurso/all.do?__tipo=2B`** (no `EnFormacionComple`): ahí viven los cursos del portafolio (Platzi, Coursera, talleres). `formacionComple` define otra sección distinta y queda sin usar a propósito.
- **`portfolio.ts` es frágil:** parsea el bundle JS con regex y el hash del bundle cambia en cada deploy (se descubre desde el HTML). Las secciones `projects`, `software` y `eventos` **NO** se parsean del bundle (requieren metadatos que solo existen en CvLAC): vienen de `data/portfolio-extra.json`, validado con zod. Para agregar un proyecto nuevo se edita ese JSON, no el código.
- **`read-cvlac-detail.ts`:** las listas `all.do` solo muestran dos o tres columnas, así que es lo único que permite verificar lo que una escritura guardó de verdad. Encuentra la fila por etiqueta con el mismo `findRowActionHref` que usan `update`/`delete` (link *Detalles*) y empareja las celdas de cada `<tr>` en pares etiqueta/valor. Hay **dos layouts** y se distinguen por markup, no por heurística: (A) *fila de etiquetas → fila de valores*, con las etiquetas en `<b>` y tablas anidadas para los bloques de varias columnas — lo usan `cursos`, `software` y `eventos`; (B) *etiqueta y valor en la misma fila*, sin negrita — lo usan `reconocimientos`, `experiencia` y `formacion`. Emparejar dentro del `<tr>` en el layout A producía pares absurdos (`Ciudad = Disponibilidad`) y hacía fallar toda verificación de lo que un update guardó. Es **deliberadamente genérico**: no hay nombres de campo por sección. Si no logra emparejar nada devuelve el texto de la página en vez de un objeto vacío. `SECTION_LIST` (en `navigation.ts`) es la fuente única de `listUrl` + `matchCellIndex`; `update-section.ts` la consume con spread, así que las dos no pueden discrepar sobre qué columna lleva el nombre.
- **`update-section.ts`:** despacha por `action` → `add` (create.do), `update` (sigue el link *Editar* → edit.do, mismos campos que create) y `delete` (sigue *Eliminar* → `confirm.do` → link *Borrar* → `delete.do`). Cada sección tiene un `fill(page, data)` reutilizable (create y edit comparten campos) en el registro `SECTIONS`. Los formularios postean a `insert.do` con submit `value="Guardar"`. Campos `readonly` (institución, fechas `dta_*String`, municipio con id dinámico `_loc_NNNNN`) se setean por JS (`forceSetReadonly*` / `setInstitucion*`); la institución se busca vía API JSON `/cvlac/json/EnInstitucion/buscar.do` que responde en **latin1**. Códigos enum por sección viven en `types.ts` (tipoProyecto, tipoSoftware, tipoEvento — Congreso=`CG`, ámbito, rol, DANE municipio). En proyectos: participación = `tpo_participacion_proy` (IP/CI/AS/EP/EM/ED), financiación = `tpo_fuente_finan`/`tpo_amb_finan`/`tpo_rol`.
- **`diff.ts`:** `classifyMatch()` devuelve `exact` / `same` / `similar` / `none`; normaliza (lowercase + sin diacríticos), ignora sufijos `(...)` y ` - ...`, y mide solapamiento de tokens para los parecidos. `computeDiff()` devuelve cuatro grupos: `missing`, `toUpdate` (mismo ítem, año distinto), `similar` (parecidos — **nunca se aplican solos**) y `upToDate`. Las secciones cuya lista solo muestra el nombre (proyectos, software, eventos) nunca generan `toUpdate`. La **experiencia está excluida del diff** a propósito (nombres de empresa divergen del portafolio y el rol no está en la lista).
- **Duplicados:** CvLAC no valida duplicados y borrarlos a mano es tedioso. Por eso `update_section` con `action:"add"` primero revisa la lista y, si encuentra algo igual o parecido, **no escribe**: devuelve `status:"needs_confirmation"` con los candidatos. Solo `confirm_duplicate:true` fuerza la creación. `sync` nunca lo pasa en `true`.
- **Errores de formulario:** los fillers no silencian fallos. Cada campo pasa por `tryField`, que acumula `warnings` (devueltos también cuando la escritura fue exitosa). Si el submit rebota al formulario, `readFormErrors()` extrae los mensajes del servidor y los incluye en `message`. Ese extractor **ignora cualquier bloque hecho de links** (el footer de CvLAC es blanco sobre oscuro y se colaba como si fuera un error) y solo acepta rojos explícitos.
- **Veredicto de una escritura (`write-verdict.ts`):** rebotar al formulario **no** significa rechazo — una corrida en vivo guardó bien una experiencia y volvió al edit form sin decir nada. `classifySubmit()` devuelve `saved` (redirigió), `rejected` (hay mensaje del servidor) o `unverified` (volvió al form, callado). En `unverified`, `update` recarga el edit form y compara con `storedMatchesSubmitted()` **solo los campos que el filler cambió** (`changedFields()`, snapshot antes y después del `fill`), porque CvLAC reescribe valores que sí aceptó. Cuesta una petición extra y solo en el caso ambiguo.
- **Borrado:** tres endpoints (`EnProdCurso`, `EnReconocimiento`, `EnProdSoftware`) responden **5xx y borran igual**. Por eso la navegación al link *Borrar* va con `tolerateUnavailable: true` y quien decide es la lista, no el status. Si la fila desapareció tras un 5xx, se devuelve `ok` con un warning que lo dice.
- **Catálogos de CvLAC (`browser/catalogue.ts`):** varios campos son texto readonly + un código oculto que el servidor sí valida. **Municipio:** `cod_municipio` es el id interno de CvLAC, **no el DANE** (Cúcuta = 827, no 54001); se resuelve por nombre con `/cvlac/json/EnMunicipio/buscar.do` (latin1) y `defaults.municipio.codigoDane` quedó como referencia — si no coincide, sale un warning. **Programa académico:** obligatorio para todo nivel salvo `''/A/B/C/Z` (`needsProgramaAcademico`), se busca con POST a `queryPrograma.do` dentro de la institución ya resuelta y se escribe el valor completo `<codRh>-<codPrograma>` en `cod_rh_prog_acad`, replicando el bug del popup de CvLAC. Si el programa no está en el catálogo de esa institución, warning explícito en vez de un submit que rebota sin explicación.
- **Experiencia:** el formulario de CvLAC **no tiene campo de cargo** (institución, fechas, `nro_hora_dedicacion` + `tpo_unidad_dedicacion`, `sta_filiacion_actual`, `txt_otra_inf`). Si el ítem trae `role`, se reporta un warning diciendo que no se escribió. `nro_hora_dedicacion` sale de `defaults.horasSemanales`; sin eso CvLAC guardaba 0 horas.
- **Ritmo y anti-bloqueo (`browser/pacing.ts` + `browser/navigate.ts`):** **toda** navegación pasa por `navigate()`, que espacia peticiones (`RequestPacer`, un pacer por proceso), reintenta 5xx y timeouts con backoff exponencial jitterado, respeta `Retry-After` y corta el tráfico con `OutageBreaker` cuando el sitio rechaza varias seguidas. Todo configurable por env (ver README → *Ritmo de las peticiones*); `CVLAC_NAV_MAX_ATTEMPTS=1` desactiva reintentos, útil en tests.
- **Logging:** `logger.ts` escribe siempre a **stderr** (stdout lleva el protocolo MCP) y redacta claves tipo password/cookie/token/cédula. Niveles con `CVLAC_LOG_LEVEL`; `CVLAC_HEADLESS=false` abre el navegador para depurar.

## Verificación

- `npm test` corre toda la suite sin red ni credenciales: extractores contra fixtures HTML anonimizados (`tests/fixtures/cvlac/`), diff, schemas, config, logger, sync con mocks y los helpers de `update-section`. Córrelo antes de dar por hecho cualquier cambio.
- Los fixtures se versionan y llevan **datos ficticios**. Si capturas HTML real para un fixture nuevo, anonimízalo antes de commitear.
- Para cambios de scraping/formularios usa `inspect_form` (lista inputs, selects con sus opciones y marca los campos con `*`) y `screenshot`, o navega en vivo y compara contra `docs/cvlac-findings.md`.
- Antes de aplicar cambios reales al CvLAC, `sync({ dry_run: true })`. Para validar una ruta de escritura, prueba reversible en reconocimientos: `add` de un ítem TEST → repetir el `add` (debe dar `needs_confirmation`) → `update` → `delete`.
- Esa prueba ya está automatizada para las 7 secciones en `tests/e2e/live-crud.mjs` (`CVLAC_E2E=1 npm run test:e2e:live`). **Escribe en el CvLAC real**: por eso exige `CVLAC_E2E=1`, marca todo lo que crea con el prefijo `ZZ PRUEBA MCP`, borra en un `finally` y reporta lo que no pudo borrar. Habla con el servidor por stdio contra `dist/index.js`, así que hay que `npm run build` antes. Un CvLAC caído (5xx) aborta la corrida con el mensaje de `CvlacUnavailableError`, no con una sección vacía.
