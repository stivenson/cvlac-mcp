# Roadmap

Dónde está `cvlac-mcp` y qué falta. Actualizado: **2026-09-18**.

## Estado actual

Funciona de punta a punta contra el CvLAC real: lee, calcula el diff contra el portafolio y escribe con supervisión.

Un recorrido de las **86 entradas** del menú de CvLAC (2026-09-16) encontró que solo **11 tienen datos**. Las 11 están gestionadas, con **CRUD verificado en vivo** por `tests/e2e/live-crud.mjs`: lista → `add` → lista → detalle → `add` repetido (bloqueado) → `update` → verificación → `delete sin confirmar` (bloqueado) → `delete` → lista final, sin dejar nada atrás. Además se gestionan el perfil del investigador y las redes académicas, que no son listas.

| Área | Estado |
|---|---|
| Lectura de las 11 secciones con datos | ✅ Verificada contra el CvLAC real |
| Diff (faltantes / a actualizar / parecidos / al día) | ✅ |
| Bloqueo de duplicados (`needs_confirmation`) | ✅ Verificado en vivo |
| Escritura `add` / `delete` | ✅ Verificada en vivo en las 11 secciones |
| Escritura `update` | ✅ Verificada en vivo en las 11 secciones |
| Confirmación antes de borrar | ✅ `confirm_delete`; sin él no se escribe nada |
| Combobox ambiguo resuelto por una persona | ✅ `needs_confirmation` con candidatos en `choices` |
| Perfil del investigador y redes académicas | ✅ `read_profile` / `update_profile` |
| No enviar un formulario incompleto o sin cambios | ✅ Enviarlo tumbaba el validador de CvLAC con un 500 |
| Veredicto honesto de una escritura | ✅ `ok` / `failed` / `unverified`, decidido por lo que CvLAC almacenó, no por cómo respondió |
| Ritmo de peticiones y anti-bloqueo | ✅ Pacer, backoff, `Retry-After` y cortacircuitos, configurables por env |
| Warnings por campo + errores del servidor | ✅ |
| CvLAC caído (5xx) reportado como tal | ✅ Antes la sección se leía vacía |
| Configuración personal fuera del código | ✅ |
| Logging con redacción de secretos | ✅ |
| Lectura de la ficha de detalle de un ítem | ✅ `read_cvlac_detail`, genérica |
| Tests | ✅ 401 unitarios sin red, + suite e2e en vivo opt-in |

## Limitaciones conocidas

Cosas que el diseño actual no puede hacer, no bugs pendientes.

- **Experiencia profesional está fuera del diff.** Los nombres de empresa en CvLAC difieren demasiado de los del portafolio ("MO TECNOLOGIAS COLOMBIA SAS" vs "Mo Technologies (Mastercard)") y el cargo no aparece en la lista, solo en el detalle. Un match automático generaría falsos faltantes. Se gestiona a mano.
- **Proyectos, software y eventos solo se pueden crear, nunca actualizar.** Su vista de lista muestra únicamente el nombre, así que no hay con qué comparar para detectar un cambio.
- **El `add` de formación complementaria depende del catálogo de CvLAC.** Su buscador de programas académicos solo ofrece los ya registrados para esa institución y ese nivel, y el popup no permite crear uno. Si no hay ninguno, la sección no admite altas — ni desde aquí ni desde la web con ese picker.
- **El portafolio se lee renderizándolo.** Ya no se parsea el bundle: `fetchPortfolioData` abre un chromium y lee el DOM de `#/resume` y del dashboard. Sigue dependiendo de los nombres de clase del sitio, pero ahora un cambio se ve como listas vacías con warning en el log, no en silencio. `achievements` y `skills` también se leen.
- **Los pickers readonly de fecha y municipio se inyectan por JS.** Ya no se pierden valores: el municipio se resuelve por la cascada del popup (su código no es el DANE) y las fechas van en `yyyy-mm-dd`. Ver `docs/cvlac-findings.md`.
- **No hay tool para áreas de actuación.** Es un `select multiple` en cascada de catálogo, no una lista; se completa en la interfaz web. Líneas de investigación e idiomas ya tienen tool.

## Siguiente

Ordenado por relación valor/riesgo.

### 1. Fichas antiguas con un tercer layout

`extractDetailFields` cubre los dos layouts conocidos (etiqueta y valor en la misma fila; fila de etiquetas en `<b>` sobre fila de valores). Algunas fichas viejas —vistas en `cursos`— no marcan sus etiquetas con `<b>` y salen emparejadas mal (`Sitio web (URL)=DOI`). No afecta escrituras, solo la lectura de esos registros.

### 2. `extractDetailFields` bajo `npm run dev`

Declara funciones con nombre dentro de un `$$eval`, y esbuild —que usa `tsx`— las envuelve en un `__name` que no existe en la página. Revienta solo en modo dev: el `dist` que ejecuta el MCP y la suite e2e no está afectado. Arreglo: escribir esos callbacks sin funciones nombradas, como ya se hace en `portfolio.ts`.

### 3. Cerrar las secciones manuales del CvLAC

Queda **áreas de actuación** (vacía) y los textos genéricos de experiencia profesional. El contenido sugerido está en `CVLAC_GUIA_SECCIONES_MANUALES.md` del workspace cliente.

### 4. Sacar los datos del portafolio de una fuente estable

El portafolio no publica sus datos, solo su interfaz, así que hay que renderizarla y leer sus clases. Publicar un `data.json` en el sitio quitaría esa dependencia y, de paso, `portfolio-extra.json` — proyectos, software y eventos saldrían de ahí. Requiere tocar el repo del portafolio.

### 5. Usar el detalle para detectar `update` en proyectos, software y eventos

`read_cvlac_detail` ya lee la ficha de un ítem; falta que `diff.ts` la use. Entrar al detalle de cada ítem permitiría comparar fechas y tipo, y con eso detectar `update` en esas tres secciones. Cuesta una navegación por ítem; vale la pena solo si esas secciones empiezan a cambiar seguido.

### 6. Publicar en npm (sin fecha, y a propósito)

**El repo ya es público; el paquete no, y esa es la decisión.** El empaquetado está listo —`files` acotado a `dist` y los tres `.example`, `engines`, `prepublishOnly` con build y tests— así que publicar es `npm login && npm publish`, no un proyecto.

Se publica **cuando alguien reporte que le costó instalarlo clonando**, no antes. Hoy la vía de los pasos 1-5 del README funciona y el nombre en npm es irreversible: `npm unpublish` solo aplica dentro de las primeras 72 horas y no libera el nombre. Sin un caso real de fricción, publicar compra mantenimiento (versionado, issues de instalación) sin comprar usuarios.

El README ya marca el Paso 5b como *"disponible una vez el paquete esté publicado"*, así que nadie se topa con una promesa rota. El día que se publique: quitar esa línea y verificar `npx -y cvlac-mcp` contra el registro real.

Lo que se ganó preparándolo vale igual sin publicar nunca: `CVLAC_ENV_FILE` permite sacar las credenciales del directorio del repo clonando también, y el `quiet: true` de dotenv arregló un bug real —su banner iba a **stdout**, que en un MCP stdio es el canal JSON-RPC.

## Ideas sin compromiso

- Cachear el resultado de `findInstitucionId` — hoy hace una petición por institución en cada escritura.
- Tool para áreas de actuación (selector en cascada de catálogo).
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
      `git grep -inE '(tu-nombre|tu-cedula|cucuta|54001)'`
- [ ] Decidir si el workspace cliente se publica junto con este repo. Vive aparte, en [`stivenson/cvlac-workspace`](https://github.com/stivenson/cvlac-workspace) (privado): skill `cvlac-sync`, `.mcp.json` y las notas de estado del CvLAC.
- [x] Cambiar el repo a público.

## Historial

- **2026-09-18** — Todas las secciones con datos quedaron gestionadas: formación complementaria, idiomas, líneas de investigación y demás trabajos, más el perfil del investigador y las redes académicas. Tres reglas nuevas, cada una nacida de una escritura que mintió: un `delete` no se ejecuta a la primera, un formulario sin cambios o sin un campo obligatorio no se envía (enviarlo devolvía un 500 del validador de CvLAC que se leía como validación fallida), y un combobox ambiguo lo resuelve una persona — el catálogo tiene seis "Universidad de los Andes" y antes se tomaba la primera. `read_portfolio` pasó de parsear el bundle a renderizar el sitio, que llevaba devolviendo todo vacío desde que el portafolio se reescribió. El diff dejó de reportar como faltante lo que CvLAC guarda en otra sección o con otra redacción: `sync` habría duplicado dos registros. Tests de 291 a 401.

- **2026-09-12** — Un 5xx de CvLAC ya no se lee como sección vacía: `assertAvailable` corta en cada navegación y el usuario recibe el motivo. Tests del borde MCP (registro de tools, validación previa a cualquier navegación) y de las URLs por sección. Empaquetado para npm listo pero **sin publicar** (ver punto 5). `CVLAC_ENV_FILE` para instalaciones fuera del repo; corregido que dotenv escribía su banner en el stdout del MCP, o sea tráfico malformado en el canal JSON-RPC de cada arranque. README cubre los siete editores MCP en vez de solo Cursor. Tests de 138 a 142.
- **2026-07-20** — Configuración personal externalizada; logging con redacción; warnings por campo y lectura de los errores del formulario; diff con cuatro grupos y bloqueo de duplicados; tests de 12 a 138. Se descubrió y corrigió que una sesión expirada no redirige (habría duplicado los 23 ítems del portafolio en un `sync`).
- **2026-05-31** — Primera sincronización real: reconocimiento ACOFI 2026 y diplomado USB agregados.
- **2026-05-30** — Navegación en vivo del CvLAC; URLs, columnas y campos de formulario documentados en `docs/cvlac-findings.md`.
- **2026-04-14** — Diseño e implementación inicial (7 tools, extractores, motor de diff).
