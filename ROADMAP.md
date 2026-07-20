# Roadmap

Dónde está `cvlac-mcp` y qué falta. Actualizado: **2026-07-20**.

## Estado actual

Funciona de punta a punta contra el CvLAC real: lee las 7 secciones, calcula el diff contra el portafolio y escribe con supervisión. Verificado en vivo el 2026-07-20 (`add` y `delete` de un ítem de prueba en reconocimientos, revertido después).

| Área | Estado |
|---|---|
| Lectura de las 7 secciones | ✅ Verificada contra el CvLAC real |
| Diff (faltantes / a actualizar / parecidos / al día) | ✅ |
| Bloqueo de duplicados (`needs_confirmation`) | ✅ Verificado en vivo |
| Escritura `add` / `delete` | ✅ Verificada en reconocimientos |
| Escritura `update` | ⚠️ Implementada, sin probar en vivo |
| Warnings por campo + errores del servidor | ✅ |
| Configuración personal fuera del código | ✅ |
| Logging con redacción de secretos | ✅ |
| Tests | ✅ 138, sin red ni credenciales |

## Limitaciones conocidas

Cosas que el diseño actual no puede hacer, no bugs pendientes.

- **Experiencia profesional está fuera del diff.** Los nombres de empresa en CvLAC difieren demasiado de los del portafolio ("MO TECNOLOGIAS COLOMBIA SAS" vs "Mo Technologies (Mastercard)") y el cargo no aparece en la lista, solo en el detalle. Un match automático generaría falsos faltantes. Se gestiona a mano.
- **Proyectos, software y eventos solo se pueden crear, nunca actualizar.** Su vista de lista muestra únicamente el nombre, así que no hay con qué comparar para detectar un cambio.
- **El parseo del portafolio es frágil por diseño.** `portfolio.ts` lee el bundle minificado de una SPA con expresiones regulares que dependen del orden exacto de propiedades. Un cambio del bundler lo rompe en silencio (devuelve listas vacías).
- **Los pickers readonly de fecha y municipio se inyectan por JS.** Funciona, pero algunos formularios no persisten el valor — pasó con las fechas del evento ACOFI 2026, que hubo que corregir a mano.
- **No hay tools para áreas de actuación, líneas de investigación ni idiomas.** Esas secciones se completan en la interfaz web.

## Siguiente

Ordenado por relación valor/riesgo.

### 1. Verificar `update` en vivo

Es la única ruta de escritura sin probar. Hacerlo en reconocimientos, que es reversible y barato: `add` de un ítem TEST → `update` cambiándole el año → `read_cvlac` para confirmar → `delete`.

### 2. Cerrar las secciones manuales del CvLAC

Áreas de actuación, líneas de investigación e idiomas siguen vacías o incompletas, y los textos de experiencia profesional están genéricos. El contenido sugerido ya está redactado en `CVLAC_GUIA_SECCIONES_MANUALES.md` del workspace cliente; falta cargarlo por la web.

### 3. Sacar los datos del portafolio de una fuente estable

La causa de fondo de la fragilidad de `portfolio.ts` y de que proyectos/software/eventos vivan en un JSON aparte es que el portafolio no publica sus datos, solo su bundle. Publicar un `data.json` en el sitio elimina las dos cosas de un golpe: se acaban las regex y `portfolio-extra.json` deja de ser necesario. Requiere tocar el repo del portafolio.

### 4. Leer el detalle de proyectos, software y eventos

Entrar a la página de detalle de cada ítem permitiría comparar fechas y tipo, y con eso detectar `update` en esas tres secciones. Cuesta una navegación por ítem; vale la pena solo si esas secciones empiezan a cambiar seguido.

### 5. Publicar (sin fecha)

**El repo se mantiene privado por ahora.** El trabajo de preparación ya está hecho —el código no contiene datos de nadie y funcionaría para cualquier persona con CvLAC—, así que abrirlo es una decisión, no un proyecto. Checklist más abajo para cuando se tome.

## Ideas sin compromiso

- Tool `read_cvlac_detail(section, label)` para leer la ficha completa de un ítem.
- Cachear el resultado de `findInstitucionId` — hoy hace una petición por institución en cada escritura.
- Tools para áreas de actuación e idiomas (formularios simples, selectores en cascada).
- Un `--dry-run` de verdad a nivel de formulario: llenar y capturar screenshot sin enviar.

## Checklist para publicar

Pendiente de decisión: **hoy el repo es privado**. Lo marcado ya está listo; lo demás solo aplica el día que se abra.

- [ ] **Rotar la contraseña del CvLAC.** Estuvo en `~/.claude/mcp.json` y en documentos locales. Nada indica exposición, pero es barato — y esto conviene hacerlo aunque el repo siga privado.
- [x] Datos personales fuera del código (`.env`, `cvlac.config.json`, `data/portfolio-extra.json`, todos gitignored con su `.example`).
- [x] Fixtures de test con datos ficticios.
- [x] LICENSE.
- [x] README con instalación genérica y aviso de uso responsable.
- [ ] Barrido final de secretos sobre el árbol a publicar:
      `git grep -inE '(tu-nombre|tu-cedula|cucuta|54001)'`
- [ ] Decidir si el workspace cliente se publica junto con este repo. Vive aparte, en [`stivenson/cvlac-workspace`](https://github.com/stivenson/cvlac-workspace) (privado): skill `cvlac-sync`, `.mcp.json` y las notas de estado del CvLAC.
- [ ] Cambiar el repo a público.

## Historial

- **2026-07-20** — Configuración personal externalizada; logging con redacción; warnings por campo y lectura de los errores del formulario; diff con cuatro grupos y bloqueo de duplicados; tests de 12 a 138. Se descubrió y corrigió que una sesión expirada no redirige (habría duplicado los 23 ítems del portafolio en un `sync`).
- **2026-05-31** — Primera sincronización real: reconocimiento ACOFI 2026 y diplomado USB agregados.
- **2026-05-30** — Navegación en vivo del CvLAC; URLs, columnas y campos de formulario documentados en `docs/cvlac-findings.md`.
- **2026-04-14** — Diseño e implementación inicial (7 tools, extractores, motor de diff).
