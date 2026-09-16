# CvLAC — Hallazgos de navegación en vivo

Fuente de verdad obtenida navegando el CvLAC real. Base: 2026-05-30 (solo lectura, inspeccionando `create.do` sin enviar). Ampliado el 2026-07-20 con la primera verificación de escritura real (`add` + `delete` de un ítem de prueba, revertido).

## ⚠️ La sesión expirada NO redirige (2026-07-20)

El hallazgo más importante y el que más caro sale si se ignora.

Ante una petición **no autenticada** a cualquier `all.do`, CvLAC responde **200 con el formulario de login incrustado, bajo la misma URL**. No hay redirect, no hay 401, `page.url()` sigue diciendo `.../all.do` y el `<title>` sigue siendo "CvLAC".

Consecuencia: cualquier chequeo de sesión basado en la URL da la sesión por válida, los extractores leen una página sin filas de datos y **el diff concluye que el CvLAC está vacío**. Un `sync` en ese estado duplica todo el portafolio en el registro oficial.

Detección correcta (`isLoginPage` en `src/browser/session.ts`): buscar en el DOM `#txt_contrasena`, `input[name="txt_contrasena"]` o `form[action*="s_login.do"]`.

Señal temprana: los extractores loguean `list page had no data rows` cuando una lista viene vacía. Si aparece en las 7 secciones a la vez, es la sesión, no el markup.

## Login

- URL form: `/cvlac/Login/pre_s_login.do` — POST a `/cvlac/Login/s_login.do`.
- Campos (ids = names): `tpo_nacionalidad` (select), `sgl_pais_nacim`, `txt_nmes_rh`, `nro_documento_ident`, `dta_nacimString`, `txt_contrasena`. Submit: `#botonEnviar`.
- **Nacionalidad "Colombiana" = value `C`** (NO `COL`). El código (`session.ts`) ya usa `'C'` → correcto. El spec decía `COL`, era erróneo.
- Tras submit redirige a `EnRecursoHumano/inicio.do`. Ese inicio.do a veces responde "Server Unavailable" (503) pero la sesión queda válida — comportamiento ya contemplado en el código.

## Tablas de lista (`all.do`) — estructura real

Todas las listas usan filas `tr.odd` / `tr.even`. La primera celda es el número de fila; las últimas 3 son Detalles/Editar/Eliminar. El selector `tr.odd, tr.even` aísla correctamente las filas de datos (el menú lateral usa `<li>`, no entra).

| Sección | URL lista | Columnas de datos (índice → contenido) |
|---|---|---|
| formacion | `/cvlac/EnTrayectoriaEscolar/all.do?isTrayectoria=TE` | 1=Año inicio, 2=Nivel, 3=Año graduación, 4=Institución, 5=Programa |
| experiencia | `/cvlac/EnTrayectoriaProfesional/all.do` | 1=Institución, 2=Año inicio, 3=Año fin, 4=Filiación actual (rol NO está en la lista) |
| cursos | `/cvlac/EnProdCurso/all.do?__tipo=2B` | 1=Nombre, 2=Año, 3=Categoría |
| reconocimientos | `/cvlac/EnReconocimiento/all.do` | 1=Título, 2=Año |
| proyectos | `/cvlac/EnProyecto/all.do` | 1=Nombre, 2=Año inicio, 3=Categoría |
| software | `/cvlac/EnProdSoftware/all.do` | 1=Nombre, 2=Año, 3=Categoría |
| eventos | `/cvlac/EnEventoCientifico/all.do` | 1=Evento, 2=Fecha inicio |

**Conclusión:** todos los extractores de `src/extractors/cvlac/` usan los índices correctos. El ajuste pendiente en reconocimientos (guardaba el AÑO como `description`) ya está corregido: el campo se llama `year`.

Los índices están fijados por los tests: `tests/extractors.test.ts` corre cada extractor contra un fixture HTML anonimizado en `tests/fixtures/cvlac/`. Si CvLAC cambia una columna, ahí se ve primero.

### Resolución de la ambigüedad de "cursos"

- "Curso de corta duración" (`/cvlac/EnProdCurso/all.do?__tipo=2B`, botón "Crear curso de corta duración dictado") **es donde Stivenson tiene registrados sus cursos del portafolio** (Platzi AWS, IBM Coursera, Taller IA USB, SENA Proyecto de Vida/Microcontroladores, etc.). El código apunta aquí → CORRECTO.
- "Formación complementaria" (`/cvlac/EnFormacionComple/all.do?isTrayectoria=FC`) contiene OTROS ítems (cursos SENA técnicos antiguos: soldadura, instalación de software, etc.). El código define esta URL (`formacionComple`) pero no la usa, y está bien así.

### Experiencia: por qué queda fuera del diff

Los nombres de empresa en CvLAC difieren mucho del portafolio (ej. CvLAC "MO TECNOLOGIAS COLOMBIA SAS" / "bewe software" / "Manpower Professional ltda" vs portafolio "Mo Technologies (Mastercard - Start Path)"). Un match por nombre generaría falsos faltantes. Además el rol/cargo no aparece en la lista (solo en el detalle). Por eso experiencia se gestiona manualmente y se excluye del diff.

## Formularios de creación (`create.do` → POST a `insert.do`)

Todos tienen botón submit con `value="Guardar"` (por eso `clickGuardar` con `getByRole('button', {name:/guardar/i})` funciona).

### formacion — `EnTrayectoriaEscolar/insert.do`
- `cod_nivel_formacion` (select): 1=Pregrado/Universitario, 2=Especialización, 7=Técnico nivel medio, 9=Técnico nivel superior, C=Secundario, B=Primaria (Maestría/Doctorado fuera del corte, presumiblemente 3/4). `inferNivel` del código es consistente.
- `id_institucion` (hidden) + `txt_nme_institucion` (readonly), `txt_nme_programa_acad` (readonly), `txt_nme_titulo_obtenido` (text), `nro_ano_inicio` / `nro_ano_obten` (selects).
- **Programa académico es obligatorio en casi todo nivel.** El `<td id="programaAcademico">` arranca en `display:none` y el inline `cambiarNivelFormacion()` lo muestra para todo salvo `''`, `A`, `B`, `C`, `Z`. Si está visible y va vacío, el submit rebota con `Seleccione un programa académico`.
- El picker (`selectPrograma()`) abre `EnProgramaAcademico/searchPrograma.do` y busca con **POST** a `EnProgramaAcademico/queryPrograma.do?__form=enTrayectoriaEscolarInsertForm&__text=txt_nme_programa_acad&__value=cod_rh_prog_acad&id_institucion=<id>&txt_nme_inst=<nombre>&cod_nivel_formacion=<nivel>&isTrayectoria=TE`, body `txt_nme_programa_acad=<texto>`. Responde `<option value='<codRh>-<codPrograma>'>NOMBRE</option>`.
- Al elegir, el popup escribe `cod_rh_prog_acad` con **el valor completo** (`0000000000-14888`) y deja `cod_programa_academico` vacío: su propia rama que parte el valor consulta `window.opener.$("#")` — selector vacío — y nunca corre. Replicar eso es lo que el servidor acepta.

### Municipios — `cod_municipio` NO es el código DANE

El picker es un popup (`/cvlac/binary/ubicacion.do?methodToCall=display&t=m&ni=<sufijo>`) con cascada país → departamento → municipio. El hidden `cod_municipio` guarda **el id interno de CvLAC**: Cúcuta es `827`, no `54001`. Pasar el DANE no falla — guarda otro municipio (54001 resultó ser *Sketty*, Swansea, Gales).

**Hay tres numeraciones distintas** y solo una sirve para `cod_municipio`. Para Cúcuta: DANE `54001` (guardó *Sketty*, Gales), id del JSON `EnMunicipio/buscar.do` `827` (guardó *NEIVA*), e id de la cascada del popup `991` (correcto).

La buena sale de la cascada, en XML:

- `GET /cvlac/binary/ubicacion.xml?methodToCall=getDepartamentosAsXML&sglPais=COL` → `<departamento><id>NO</id><name>NORTE DE SANTANDER</name></departamento>` (el país va en sigla de **3** letras; el JSON devuelve la de 2).
- `GET /cvlac/binary/ubicacion.xml?methodToCall=getMunicipiosAsXML&sglDepartamento=NO&sglPais=COL` → `<municipio><id>991</id><name>CÚCUTA</name><cod_rh>0000000000</cod_rh></municipio>`

El popup escribe **cuatro** campos (`returnData()`): `cod_municipio_text` = `"Colombia - NORTE DE SANTANDER - CÚCUTA"`, `cod_municipio` = id, `cod_rh_municipio` = `cod_rh`, y el hidden de país (`name="null"`) = `COL`.

El JSON sigue siendo útil para saber **a qué departamento** pertenece un municipio:

```json
[{"id":827,"idDepartamento":52,"txtNmeMunicipio":"CÚCUTA","departamento":{"id":52,"txtNmeDepartamento":"NORTE DE SANTANDER","pais":{"id":1,"sglPais":"CO"}}}]
```

El JSON de instituciones también trae su `municipio` ya resuelto (`idMunicipio` + objeto anidado), útil si algún día se quiere heredar la ciudad de la institución.

### proyectos — `EnProyecto/insert.do`

- **Fechas en `yyyy-mm-dd`.** El datepicker se configura con `dateFormat: "yy-mm-dd"` (jQuery UI: año de 4 cifras). Mandar `01/01/2024` da *La fecha del acto administrativo no tiene un formato válido*.
- `txt_acto_adm` y `dta_acto_admString` son **obligatorios siempre**, también en proyectos solidarios. Elegir *Solidario* (`tpo_financiacion=SO`) solo oculta `nro_valor` y los radios `tpo_fuente_finan` / `tpo_amb_finan`; omitir el acto administrativo da un genérico *Campo requerido*.
- `nro_valor` debe ser numérico y **≥ 10.000.000** (validadores `validarNumero` y `valorMinimo` inline en la página).

### cursos — `EnProdCurso/insert.do`
- Código llena: `txt_nme_prod`, `cod_tipo_producto` (radio), `nro_ano_presenta`, `nro_mes_presenta`, y si vienen en el ítem o en `cvlac.config.json`: `txt_participacion`, `nro_duracion`, `txt_lugar`, `sgl_idioma`, `sgl_pais`, municipio.
- Lo que no se pueda llenar aparece en `warnings` del resultado, no se silencia.

### reconocimientos — `EnReconocimiento/insert.do`
- Código llena `txt_nme_reconocimiento`, `nro_ano_obtencion`, `nro_mes_obtencion` y `tpo_ambito` (N/I).
- **El año no tiene default.** Antes se ponía el año actual; un año equivocado en un registro oficial es peor que un formulario rechazado. Si el ítem no trae `year`, se reporta warning.
- **Escritura verificada el 2026-07-20:** `add` con solo `{title, year}` → guardó correctamente. `delete` sobre ese ítem → lo eliminó y `read_cvlac` lo confirmó. Es la sección más barata para probar cambios.

### proyectos — `EnProyecto/insert.do`
- OK: `tpo_proyecto` (radio), `txt_nme_proyecto`, `nro_ano_inicio`/`nro_mes_inicio`/`nro_ano_fin`/`nro_mes_fin`, `nro_valor`, `txt_resumen_proyecto`, institución `nme_inst` (readonly).
- Nombres de financiación reales (los bugs de la primera versión ya están corregidos): `tpo_fuente_finan` con valores **`I`/`E`** (no `IN`/`EX`), `tpo_amb_finan` (radio) y `tpo_rol` (select F/E/C).
- `tpo_participacion_proy` (select: IP=Investigador principal, CI=Coinvestigador, AS=Asesor, EP=Estudiante pregrado, EM=Estudiante maestría, ED=Estudiante doctorado) — ya se llena, inferido del texto libre `participacion`.
- `dta_acto_admString` es **readonly** → `page.fill` no funciona; se inyecta por JS (`forceSetReadonly`).
- Sin verificar por escritura todavía: es la sección con más campos obligatorios y la más cara de limpiar si sale mal.

### software — `EnProdSoftware/insert.do`
- OK: `cod_tipo_producto` (radio 211/212/219), `txt_nme_prod`, `nro_ano_presenta`/`nro_mes_presenta`, `txt_web_producto`, `tpo_prod_tiene` (radio, value "N"=Ninguno).
- Las **seis** textareas son obligatorias: `txt_analisis`, `txt_desarrollo`, `txt_implementacion`, `txt_validacion`, `txt_plataforma`, `txt_ambiente`. Se llenan desde `descripcionTecnica` del ítem; si no viene, se repite el nombre y se emite un warning explícito (queda un registro pobre pero válido).

### eventos — `EnEventoCientifico/insert.do`
- OK: `txt_nme_evento`, `tpo_clasificacion` (N/I), `dta_inicioString`/`dta_finString` (readonly→JS), `cod_municipio_text` (readonly, id dinámico `_loc_NNNNN`), `txt_lugar`, checkboxes de rol `tpo_part_ponente`/`tpo_part_ponenteMag`/`tpo_part_organizador`/`tpo_part_asistente`, `txt_nme_institucion` (readonly), `txt_resumen_evento`.
- `tpo_evento` (select): OT=Otro, **CG=Congreso** (no "CO"), EN=Encuentro, SE=Seminario, SI=Simposio, TA=Taller. Corregir el comentario del tipo en `types.ts`.

## Estado de datos en CvLAC

Conteos leídos el **2026-07-20** con `read_cvlac('all')`:

| Sección | Ítems |
|---|---|
| formacion | 7 |
| experiencia | 9 |
| cursos (EnProdCurso) | 9 |
| reconocimientos | 6 |
| proyectos | 4 |
| software | 5 |
| eventos | 5 |

Diff contra el portafolio en esa fecha: **8 faltantes, 15 al día**, 0 a actualizar, 0 parecidos.

Estos números sirven de canario: si `read_cvlac` devuelve 0 en todas las secciones, la sesión está caída (ver la primera sección de este documento), no es que el CvLAC se haya vaciado.

## La página de caída de MinCiencias

Ante una caída, el sitio sirve un HTML propio con `Server Unavailable!` y la URL pedida, **para cualquier ruta y sin markup de CvLAC**. Como no es la página del formulario, un submit que aterriza ahí parecía el redirect que sigue a un guardado: en una corrida en vivo tres `update` se reportaron como `Updated` sin haber guardado nada. Se detecta por contenido (`isOutageMarkup`), no por status.

## Fichas de detalle: qué muestra cada sección

No todas las fichas muestran lo que se editó, y eso limita qué se puede verificar leyendo:

| Sección | La ficha muestra |
|---|---|
| `experiencia`, `reconocimientos`, `software` | fechas incluidas |
| `cursos` | año y mes, en tabla anidada con celdas espaciadoras |
| `eventos` | **sin fechas**; sí municipio, lugar y resumen |
| `proyectos` | **sin fechas**; sí tipo, título y resumen |
| `formacion` | **sin fechas**; el período solo está en la lista (`all.do`) |

La ficha de `formacion` además mete etiqueta y valor **en la misma celda** (`Municipio CÚCUTA`), un tercer layout que `extractDetailFields` todavía no separa.
