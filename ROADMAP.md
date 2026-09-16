# Roadmap

Dónde está `cvlac-mcp` y qué falta. Actualizado: **2026-09-16**.

## Estado actual

Funciona de punta a punta contra el CvLAC real: lee las 7 secciones, calcula el diff contra el portafolio y escribe con supervisión. **CRUD completo verificado en vivo en las 7 secciones el 2026-09-16** con `tests/e2e/live-crud.mjs`: lista → `add` → lista → detalle → `add` repetido (bloqueado) → `update` → verificación → `delete` → lista final, sin dejar nada atrás.

| Área | Estado |
|---|---|
| Lectura de las 7 secciones | ✅ Verificada contra el CvLAC real |
| Diff (faltantes / a actualizar / parecidos / al día) | ✅ |
| Bloqueo de duplicados (`needs_confirmation`) | ✅ Verificado en vivo |
| Escritura `add` / `delete` | ✅ Verificada en vivo en las 7 secciones |
| Escritura `update` | ✅ Verificada en vivo en las 7 secciones |
| Veredicto honesto de una escritura | ✅ `ok` / `failed` / `unverified`, decidido por lo que CvLAC almacenó, no por cómo respondió |
| Ritmo de peticiones y anti-bloqueo | ✅ Pacer, backoff, `Retry-After` y cortacircuitos, configurables por env |
| Warnings por campo + errores del servidor | ✅ |
| CvLAC caído (5xx) reportado como tal | ✅ Antes la sección se leía vacía |
| Configuración personal fuera del código | ✅ |
| Logging con redacción de secretos | ✅ |
| Lectura de la ficha de detalle de un ítem | ✅ `read_cvlac_detail`, genérica para las 7 secciones |
| Tests | ✅ 291 unitarios sin red, + suite e2e en vivo opt-in |

## Limitaciones conocidas

Cosas que el diseño actual no puede hacer, no bugs pendientes.

- **Experiencia profesional está fuera del diff.** Los nombres de empresa en CvLAC difieren demasiado de los del portafolio ("MO TECNOLOGIAS COLOMBIA SAS" vs "Mo Technologies (Mastercard)") y el cargo no aparece en la lista, solo en el detalle. Un match automático generaría falsos faltantes. Se gestiona a mano.
- **Proyectos, software y eventos solo se pueden crear, nunca actualizar.** Su vista de lista muestra únicamente el nombre, así que no hay con qué comparar para detectar un cambio.
- **El parseo del portafolio es frágil por diseño.** `portfolio.ts` lee el bundle minificado de una SPA con expresiones regulares que dependen del orden exacto de propiedades. Un cambio del bundler lo rompe en silencio (devuelve listas vacías).
- **Los pickers readonly de fecha y municipio se inyectan por JS.** Ya no se pierden valores: el municipio se resuelve por la cascada del popup (su código no es el DANE) y las fechas van en `yyyy-mm-dd`. Ver `docs/cvlac-findings.md`.
- **No hay tools para áreas de actuación, líneas de investigación ni idiomas.** Esas secciones se completan en la interfaz web.

## Siguiente

Ordenado por relación valor/riesgo.

### 1. Fichas antiguas con un tercer layout

`extractDetailFields` cubre los dos layouts conocidos (etiqueta y valor en la misma fila; fila de etiquetas en `<b>` sobre fila de valores). Algunas fichas viejas —vistas en `cursos`— no marcan sus etiquetas con `<b>` y salen emparejadas mal (`Sitio web (URL)=DOI`). No afecta escrituras, solo la lectura de esos registros.

### 2. Cerrar las secciones manuales del CvLAC

Áreas de actuación, líneas de investigación e idiomas siguen vacías o incompletas, y los textos de experiencia profesional están genéricos. El contenido sugerido ya está redactado en `CVLAC_GUIA_SECCIONES_MANUALES.md` del workspace cliente; falta cargarlo por la web.

### 3. Sacar los datos del portafolio de una fuente estable

La causa de fondo de la fragilidad de `portfolio.ts` y de que proyectos/software/eventos vivan en un JSON aparte es que el portafolio no publica sus datos, solo su bundle. Publicar un `data.json` en el sitio elimina las dos cosas de un golpe: se acaban las regex y `portfolio-extra.json` deja de ser necesario. Requiere tocar el repo del portafolio.

### 4. Usar el detalle para detectar `update` en proyectos, software y eventos

`read_cvlac_detail` ya lee la ficha de un ítem; falta que `diff.ts` la use. Entrar al detalle de cada ítem permitiría comparar fechas y tipo, y con eso detectar `update` en esas tres secciones. Cuesta una navegación por ítem; vale la pena solo si esas secciones empiezan a cambiar seguido.

### 5. Publicar en npm (sin fecha, y a propósito)

**El repo ya es público; el paquete no, y esa es la decisión.** El empaquetado está listo —`files` acotado a `dist` y los tres `.example`, `engines`, `prepublishOnly` con build y tests— así que publicar es `npm login && npm publish`, no un proyecto.

Se publica **cuando alguien reporte que le costó instalarlo clonando**, no antes. Hoy la vía de los pasos 1-5 del README funciona y el nombre en npm es irreversible: `npm unpublish` solo aplica dentro de las primeras 72 horas y no libera el nombre. Sin un caso real de fricción, publicar compra mantenimiento (versionado, issues de instalación) sin comprar usuarios.

El README ya marca el Paso 5b como *"disponible una vez el paquete esté publicado"*, así que nadie se topa con una promesa rota. El día que se publique: quitar esa línea y verificar `npx -y cvlac-mcp` contra el registro real.

Lo que se ganó preparándolo vale igual sin publicar nunca: `CVLAC_ENV_FILE` permite sacar las credenciales del directorio del repo clonando también, y el `quiet: true` de dotenv arregló un bug real —su banner iba a **stdout**, que en un MCP stdio es el canal JSON-RPC.

## Ideas sin compromiso

- Cachear el resultado de `findInstitucionId` — hoy hace una petición por institución en cada escritura.
- Tools para áreas de actuación e idiomas (formularios simples, selectores en cascada).
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

- **2026-09-12** — Un 5xx de CvLAC ya no se lee como sección vacía: `assertAvailable` corta en cada navegación y el usuario recibe el motivo. Tests del borde MCP (registro de tools, validación previa a cualquier navegación) y de las URLs por sección. Empaquetado para npm listo pero **sin publicar** (ver punto 5). `CVLAC_ENV_FILE` para instalaciones fuera del repo; corregido que dotenv escribía su banner en el stdout del MCP, o sea tráfico malformado en el canal JSON-RPC de cada arranque. README cubre los siete editores MCP en vez de solo Cursor. Tests de 138 a 142.
- **2026-07-20** — Configuración personal externalizada; logging con redacción; warnings por campo y lectura de los errores del formulario; diff con cuatro grupos y bloqueo de duplicados; tests de 12 a 138. Se descubrió y corrigió que una sesión expirada no redirige (habría duplicado los 23 ítems del portafolio en un `sync`).
- **2026-05-31** — Primera sincronización real: reconocimiento ACOFI 2026 y diplomado USB agregados.
- **2026-05-30** — Navegación en vivo del CvLAC; URLs, columnas y campos de formulario documentados en `docs/cvlac-findings.md`.
- **2026-04-14** — Diseño e implementación inicial (7 tools, extractores, motor de diff).
