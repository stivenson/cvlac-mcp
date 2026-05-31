# CLAUDE.md

Guía para agentes IA que trabajen en este repo (`cvlac-mcp`).

## Qué es

Servidor **MCP** (stdio) en TypeScript que automatiza el perfil **CvLAC** de MinCiencias usando **Playwright**. Compara el portafolio canónico (`stivenson.github.io`) contra el CvLAC oficial y aplica los ítems faltantes, con supervisión humana.

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
- **Credenciales nunca hardcodeadas.** Se leen de env / `.env` (`CVLAC_NOMBRE`, `CVLAC_CEDULA`, `CVLAC_PASSWORD`, `CVLAC_SESSION_PATH`, `PORTFOLIO_URL`). Ver `.env.example`.
- **Idioma:** comunicación y docs en español; código/identificadores en inglés.
- `dist/`, `.env`, `*.cvlac-session.json` y `*.screenshot.png` están en `.gitignore` — no commitearlos.

## Arquitectura

```
src/
├── index.ts                  # Entry point: carga .env, crea server, conecta stdio transport
├── server.ts                 # Registra las 8 tools con registerTool (schemas zod)
├── types.ts                  # Interfaces Portfolio*, CvLAC*, Diff*, Update*
├── diff.ts                   # computeDiff() + normalize() (lowercase, sin tildes)
├── browser/
│   ├── session.ts            # BrowserSession singleton (Playwright). Login + storageState
│   └── navigation.ts         # URLS constantes (list/create) del CvLAC
├── tools/                    # Una función por tool MCP
│   ├── login.ts  read-cvlac.ts  read-portfolio.ts  diff.ts
│   ├── update-section.ts     # (grande) llena formularios CvLAC por sección
│   ├── sync.ts  screenshot.ts
└── extractors/
    ├── portfolio.ts          # Parsea el bundle React de stivenson.github.io (regex)
    └── cvlac/                # Un extractor por sección (lee tablas del CvLAC)
        formacion / experiencia / cursos / reconocimientos / proyectos / software / eventos
tests/                        # vitest: diff.test.ts, portfolio.test.ts (sin red)
```

Flujo de datos: `index.ts` → `server.ts` (router) → `tools/*` → `browser/session` (Playwright) + `extractors/*` → `diff.ts`.

## Tools MCP (registradas en `server.ts`)

`login`, `read_cvlac`, `read_portfolio`, `diff`, `update_section`, `sync`, `screenshot`, `inspect_form`.

**Secciones:** `formacion`, `experiencia`, `cursos`, `reconocimientos`, `proyectos`, `software`, `eventos`.

## Detalles que muerden (lee antes de tocar)

- **Fuente de verdad verificada en vivo:** `docs/cvlac-findings.md` documenta (navegación real 2026-05) las URLs, columnas de tabla y nombres de campos de formulario de las 7 secciones. Consúltalo antes de tocar extractores o `update-section.ts`.
- **Sesión persistente:** `session.ts` guarda `storageState` en `~/.cvlac-session.json` (o `CVLAC_SESSION_PATH`). `checkSession()` valida navegando a `formacion`; si redirige a `Login`, re-loguea. Tras login resetea el context para recargar cookies. Hay medidas anti-bot (user-agent Chrome real, `--disable-blink-features=AutomationControlled`, oculta `navigator.webdriver`, `humanDelay`, `withRetry`).
- **Login flow:** `tpo_nacionalidad='C'` (verificado: "Colombiana" = value `C`, NO `COL`), llena `#txt_nmes_rh` / `#nro_documento_ident` / `#txt_contrasena`, click `#botonEnviar`. Redirige a `EnRecursoHumano/inicio.do`; ese inicio.do a veces da 503 ("Server Unavailable") pero la sesión queda válida. `update_section` ya NO fuerza re-login en cada llamada: reusa sesión y `gotoForm()` re-loguea solo si cae en la página de login.
- **Listas (`all.do`):** filas `tr.odd`/`tr.even`; el selector aísla bien los datos (el menú usa `<li>`). Índices de columna verificados por sección (ver findings). En `reconocimientos` `cells[2]` es el **año**, no descripción.
- **Cursos = `EnProdCurso/all.do?__tipo=2B`** (no `EnFormacionComple`): ahí viven los cursos del portafolio (Platzi, Coursera, talleres). `formacionComple` define otra sección distinta y queda sin usar a propósito.
- **`portfolio.ts` es frágil:** parsea el bundle JS con regex y el hash del bundle cambia en cada deploy (se descubre desde el HTML). Las secciones `projects`, `software` y `eventos` **NO** se parsean del bundle: están hardcodeadas como `STATIC_PROJECTS`/`STATIC_SOFTWARE`/`STATIC_EVENTOS` en `portfolio.ts` — actualízalas ahí (decisión documentada en el comentario del archivo).
- **`update-section.ts`:** despacha por `action` → `add` (create.do), `update` (sigue el link *Editar* → edit.do, mismos campos que create) y `delete` (sigue *Eliminar* → `confirm.do` → link *Borrar* → `delete.do`). Cada sección tiene un `fill(page, data)` reutilizable (create y edit comparten campos) en el registro `SECTIONS`. Los formularios postean a `insert.do` con submit `value="Guardar"`. Campos `readonly` (institución, fechas `dta_*String`, municipio con id dinámico `_loc_NNNNN`) se setean por JS (`forceSetReadonly*` / `setInstitucion*`); la institución se busca vía API JSON `/cvlac/json/EnInstitucion/buscar.do` que responde en **latin1**. Códigos enum por sección viven en `types.ts` (tipoProyecto, tipoSoftware, tipoEvento — Congreso=`CG`, ámbito, rol, DANE municipio). En proyectos: participación = `tpo_participacion_proy` (IP/CI/AS/EP/EM/ED), financiación = `tpo_fuente_finan`/`tpo_amb_finan`/`tpo_rol`.
- **`diff.ts`:** matching con `nameMatches()` — normaliza (lowercase + sin diacríticos) y además ignora sufijos `(...)` y ` - ...` para no marcar falsos faltantes. La **experiencia está excluida del diff** a propósito (nombres de empresa divergen del portafolio y el rol no está en la lista) — ver comentario en `computeDiff` y findings.

## Verificación

- Unit tests (`vitest`) cubren `diff.ts`/`nameMatches` y el parser de `portfolio.ts` sin red. Corre `npm test` antes de dar por hecho un cambio en esas áreas.
- Para cambios de scraping/formularios usa `screenshot` e `inspect_form` (devuelve los inputs/selects de una URL) en modo real para depurar nombres de campos, o navega en vivo y compara contra `docs/cvlac-findings.md`.
- Antes de aplicar cambios reales al CvLAC, prueba con `sync({ dry_run: true })`. Las rutas de escritura `add`/`update`/`delete` están implementadas según los formularios reales pero **no se han ejecutado contra el CvLAC en vivo** (envío de formularios diferido): valida con una prueba supervisada (add de un ítem dummy + delete) antes de confiar en sync masivo.
