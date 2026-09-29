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

- "Curso de corta duración" (`/cvlac/EnProdCurso/all.do?__tipo=2B`, botón "Crear curso de corta duración dictado") es donde quedan los cursos que un portafolio suele listar (plataformas en línea, talleres). El código apunta aquí → CORRECTO.
- "Formación complementaria" (`/cvlac/EnFormacionComple/all.do?isTrayectoria=FC`) guarda otra cosa: cursos técnicos y de extensión registrados como trayectoria. El código define esta URL (`formacionComple`) pero no la usa.

  **Corregido el 2026-09-16:** aquí decía "y está bien así". No lo está: la cuenta de prueba tenía registros ahí y ninguna tool. Ver el recorrido completo del menú al final de este documento.

### Experiencia: por qué queda fuera del diff

Los nombres de empresa en CvLAC difieren mucho del portafolio: CvLAC guarda la razón social ("EMPRESA EJEMPLO COLOMBIA SAS") y un portafolio suele usar el nombre comercial, a veces con el cliente ("Ejemplo Tech (Banco X)"). Un match por nombre generaría falsos faltantes. Además el rol/cargo no aparece en la lista (solo en el detalle). Por eso experiencia se gestiona manualmente y se excluye del diff.

## Formularios de creación (`create.do` → POST a `insert.do`)

Todos tienen botón submit con `value="Guardar"` (por eso `clickGuardar` con `getByRole('button', {name:/guardar/i})` funciona).

### formacion — `EnTrayectoriaEscolar/insert.do`
- `cod_nivel_formacion` (select): 1=Pregrado/Universitario, 2=Especialización, 7=Técnico nivel medio, 9=Técnico nivel superior, C=Secundario, B=Primaria (Maestría/Doctorado fuera del corte, presumiblemente 3/4). `inferNivel` del código es consistente.
- `id_institucion` (hidden) + `txt_nme_institucion` (readonly), `txt_nme_programa_acad` (readonly), `txt_nme_titulo_obtenido` (text), `nro_ano_inicio` / `nro_ano_obten` (selects).
- **Programa académico es obligatorio en casi todo nivel.** El `<td id="programaAcademico">` arranca en `display:none` y el inline `cambiarNivelFormacion()` lo muestra para todo salvo `''`, `A`, `B`, `C`, `Z`. Si está visible y va vacío, el submit rebota con `Seleccione un programa académico`.
- El picker (`selectPrograma()`) abre `EnProgramaAcademico/searchPrograma.do` y busca con **POST** a `EnProgramaAcademico/queryPrograma.do?__form=enTrayectoriaEscolarInsertForm&__text=txt_nme_programa_acad&__value=cod_rh_prog_acad&id_institucion=<id>&txt_nme_inst=<nombre>&cod_nivel_formacion=<nivel>&isTrayectoria=TE`, body `txt_nme_programa_acad=<texto>`. Responde `<option value='<codRh>-<codPrograma>'>NOMBRE</option>`.
- Al elegir, el popup escribe `cod_rh_prog_acad` con **el valor completo** (`0000000000-14888`) y deja `cod_programa_academico` vacío: su propia rama que parte el valor consulta `window.opener.$("#")` — selector vacío — y nunca corre. Replicar eso es lo que el servidor acepta.

### Municipios — `cod_municipio` NO es el código DANE

El picker es un popup (`/cvlac/binary/ubicacion.do?methodToCall=display&t=m&ni=<sufijo>`) con cascada país → departamento → municipio. El hidden `cod_municipio` guarda **el id interno de CvLAC**, no el código DANE. Pasar el DANE no falla — guarda otro municipio (en la primera prueba, *Sketty*, Swansea, Gales).

**Hay tres numeraciones distintas** y solo una sirve para `cod_municipio`. Para el mismo municipio: el DANE guardó *Sketty* (Gales), el id del JSON `EnMunicipio/buscar.do` guardó *NEIVA*, y el id de la cascada del popup es el correcto.

La buena sale de la cascada, en XML:

- `GET /cvlac/binary/ubicacion.xml?methodToCall=getDepartamentosAsXML&sglPais=COL` → `<departamento><id>XX</id><name>NOMBRE DEL DEPARTAMENTO</name></departamento>` (el país va en sigla de **3** letras; el JSON devuelve la de 2).
- `GET /cvlac/binary/ubicacion.xml?methodToCall=getMunicipiosAsXML&sglDepartamento=XX&sglPais=COL` → `<municipio><id>NNN</id><name>NOMBRE DEL MUNICIPIO</name><cod_rh>0000000000</cod_rh></municipio>`

El popup escribe **cuatro** campos (`returnData()`): `cod_municipio_text` = `"Colombia - <DEPARTAMENTO> - <MUNICIPIO>"`, `cod_municipio` = id, `cod_rh_municipio` = `cod_rh`, y el hidden de país (`name="null"`) = `COL`.

El JSON sigue siendo útil para saber **a qué departamento** pertenece un municipio:

```json
[{"id":123,"idDepartamento":45,"txtNmeMunicipio":"<MUNICIPIO>","departamento":{"id":45,"txtNmeDepartamento":"<DEPARTAMENTO>","pais":{"id":1,"sglPais":"CO"}}}]
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

## Canario de sesión

Si `read_cvlac` devuelve 0 en todas las secciones de un CvLAC que tiene datos, la sesión está caída (ver la primera sección de este documento), no es que el CvLAC se haya vaciado.

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

La ficha de `formacion` además mete etiqueta y valor **en la misma celda** (`Municipio <NOMBRE>`), un tercer layout que `extractDetailFields` todavía no separa.

## Campos que no se pueden usar para verificar una escritura

Al releer un formulario para confirmar que un cambio quedó, estos campos discrepan **siempre**, sin que nada esté mal:

| Campo | Por qué |
|---|---|
| `cod_municipio_text`, `txt_nme_institucion`, `txt_nme_programa_acad`, `nme_inst` | son el rótulo legible de un picker; CvLAC los re-renderiza a su manera (`"Colombia - <DEPARTAMENTO> - <MUNICIPIO>"` vuelve como `"<MUNICIPIO>"`). El código oculto de al lado sí es exacto. |
| `null` | no es un nombre de campo: el input de país del picker de ubicación lleva literalmente `name="null"`, y el formulario no conserva lo que se le ponga. |
| `dta_inicioString`, `dta_finString` | se guardan en `yyyy-mm-dd`; escribirles `dd/mm/yyyy` deja el formulario con una forma y la ficha con otra. |

## Los `edit.do` traen copias ocultas de sus propios campos

El formulario de edición de cursos (`EnProdCurso/edit.do?cod_producto=N&cod_rh=...`) arranca con un bloque de hidden que repite nombres del formulario visible, con **los valores almacenados**:

```html
<input type="hidden" name="txt_nme_prod"     value="Taller de ejemplo">
<input type="hidden" name="nro_ano_presenta" value="2019">
<input type="hidden" name="nro_mes_presenta" value="1">
...
<input type="text"   name="txt_nme_prod" id="txt_nme_prod" value="Taller de ejemplo">
<select name="nro_ano_presenta">...</select>
```

Dos efectos, los dos silenciosos:

1. Un `page.fill('input[name="txt_nme_prod"]')` apunta al **oculto** (es el primero del DOM) y se queda esperando a que sea editable hasta agotar el timeout.
2. El POST lleva el campo **dos veces** y Struts se queda con el primero, o sea con el valor viejo. La edición se ve aplicada en pantalla y llega descartada: el año del curso nunca se movía.

Por eso `syncHiddenDuplicates()` corre después de cada `fill` y antes de Guardar, y los `page.fill` apuntan a `input:not([type="hidden"])[name=...]`.

## Códigos de país: tres letras

Los selects `sgl_pais` usan códigos de **tres** letras (`COL`, `ARG`). `cvlac.config.json` y el portafolio usan ISO de dos (`CO`), que no coincide con ninguna opción: el select se queda como estaba y la llamada agota su timeout. `countryOption()` traduce lo que sabe con certeza y deja pasar el resto.

## Recorrido completo del menú (2026-09-16)

Se navegaron las **86 entradas** del menú lateral con la cuenta real, solo lectura, contando filas `tr.odd/tr.even` en cada una.

**Cuidado con el conteo:** una lista vacía no trae cero filas, trae **una** con el texto `Ningún dato disponible en esta tabla`. Contar filas sin mirar el contenido da 1 en decenas de secciones vacías.

En esa cuenta, solo **11 tenían datos** (estado de las tools en esa fecha; hoy las 11 tienen):

| Sección | ¿Tool en 2026-09-16? |
|---|---|
| Formación académica | ✅ `formacion` |
| Formación complementaria (`EnFormacionComple/all.do?isTrayectoria=FC`) | ❌ |
| Experiencia profesional | ✅ `experiencia` |
| Líneas de investigación (`EnLineaInv/all.do`) | ❌ |
| Idiomas (`ReRecursoHumIdioma/all.do`) | ❌ |
| Curso de corta duración | ✅ `cursos` |
| Evento científico | ✅ `eventos` |
| Software | ✅ `software` |
| Proyectos | ✅ `proyectos` |
| Reconocimientos | ✅ `reconocimientos` |
| Demás trabajos (`EnProdTecnica/all_demasTrabajos.do`) | ❌ |

Detalles que valen para cuando se automatice alguna:

- **Formación complementaria** usa la misma forma de tabla que `formacion` (Año inicio, Categoría, Año fin, Institución, Nombre) — es la candidata más barata. Ojo: uno de sus registros **no trae enlace Eliminar**; CvLAC bloquea el borrado de algunos ítems, así que su CRUD no es simétrico.
- **Estancias posdoctorales** es un tercer sabor del mismo endpoint: `EnTrayectoriaEscolar/all.do?isTrayectoria=FP`.
- **Áreas de actuación** (`ReRecursoHumAreaCon/detail.do`) no es lista: es un `select multiple cod_area_conocimiento` que llega con una sola opción — es cascada (gran área → área), y habrá que resolver catálogo como con municipios.

## Los dos registros únicos: perfil y redes académicas

Ninguno tiene `all.do` ni ficha por ítem. Son un formulario cada uno, con un solo `Guardar`.

### Redes sociales académicas — `ReRedSocialIdent/create.do` → `insert.do`

`create.do` es a la vez la vista de lectura y el formulario: los valores guardados vienen en el `value=` de cada `URL_n` y en un bloque `$(document).ready` que marca las casillas.

Trece filas, cada una con `CHECK_n` (checkbox) y `URL_n` (texto), más `cod_rh` oculto:

| n | Etiqueta en CvLAC |
|---|---|
| 1 | Google Scholar |
| 2 | ResearchGate |
| 3 | Social Sciences Research |
| 4 | Network (SSRN) |
| 5 | Academia.edu |
| 6 | Mendeley (Elservier - Scopus) |
| 7 | Linkedln |
| 8 | Repositorios disciplinares (Directorio Exit, eLIS, etc.) |
| 9 | Repositorios institucionales |
| 10 | ResearcherID (Thomson Reuters - WOS) |
| 11 | Autor ID (Scopus) |
| 12 | Open Researcher and Contributor ID (ORCID) |
| 13 | Otro (+ `txt_otro` con el nombre) |

Cuatro cosas que muerden:

1. **`insert.do` reescribe la tabla entera** con lo que reciba el POST. Enviar solo la red nueva borra todas las demás. Por eso `update_profile` lee primero y reenvía todo (`mergeRedes`).
2. **Las filas 3 y 4 son una sola red partida en dos.** El JSP corta "Social Sciences Research Network (SSRN)" en dos `<tr>`, cada uno con su checkbox y su URL. Son dos slots reales; el código los mantiene separados porque el formulario los mantiene separados.
3. **CvLAC escribe "Linkedln"**, con ele donde va la i. `resolveNetwork` acepta `linkedin`.
4. **`txt_otro` vive dentro de `<div id="otro" style="display:none">`**, que solo se muestra al hacer clic en su checkbox (`mostrarCampoOtro()`). Un `page.fill` ahí espera a que sea editable hasta agotar el timeout. Los `onchange` de todas las casillas llaman a jQuery-validate y el `$("#formulario").validate(...)` ni siquiera engancha (el form no tiene ese id). Por eso `applyRedesState` escribe valores y `checked` por JS, sin clics.

La validación que sí importa: el formulario espera URLs **con esquema**. `normalizeNetworkUrl` antepone `https://` a un host pelado y rechaza lo que no sea una dirección.

### Perfil del investigador — `enPerfilInvestigador.do` → `perfilUpdate.do`

Un solo `textarea txt_desc_perfil`, y **diez hidden con la identidad de la persona** que se reenvían en el POST: `nro_documento_ident`, `txt_names_rh`, `txt_prim_apell`, `tpo_nacionalidad`, `tpo_sexo`, `cod_mun_nacim`, `dta_nacim`, `cod_mun_exped_doc`, `dta_nacimString`, `staPerfilInvestigador`.

`txt_desc_perfil` es **`required` y `maxlength=3950`** (el contador en pantalla dice 4000, el atributo dice 3950). Consecuencia que costó una corrida entera: **no hay forma de vaciarlo**. Un submit con el campo vacío ni siquiera sale del formulario, y la página vuelve mostrando el texto que acaba de negarse a borrar — que el código leyó como *"rejected: \<ese mismo texto\>"*. Solo se reemplaza; para quitarlo de verdad hay que ir a la web.

Regla: **tocar solo el textarea**. Reconstruir o reordenar ese formulario arriesga la cédula y la fecha de nacimiento del registro oficial. (De paso, `cod_mun_nacim` usa la misma numeración de municipios de la cascada documentada arriba.)

## Las cuatro secciones sin tool: formularios reales (2026-09-17)

### Formación complementaria **no es un módulo propio**

El hallazgo que cambia el costo de automatizarla. Solo la **lista** vive en `EnFormacionComple`; todo lo demás es `EnTrayectoriaEscolar` — el mismo módulo que `formacion` — discriminado por `isTrayectoria`:

| Acción | URL |
|---|---|
| lista | `EnFormacionComple/all.do?isTrayectoria=FC` |
| crear | `EnTrayectoriaEscolar/create.do?isTrayectoria=FC` → `insert.do?isTrayectoria=FC` |
| detalle | `EnTrayectoriaEscolar/query.do?isTrayectoria=FC&cod_tray_escolar=N&cod_rh=…` |
| editar | `EnTrayectoriaEscolar/edit.do?isTrayectoria=FC&…` |
| borrar | `EnTrayectoriaEscolar/confirm.do?isTrayectoria=FC&…` |

El botón de crear se llama **"Incluir item"**, no "Crear …" — buscar por `/crear|nuevo/` en esa lista no encuentra nada.

Hay un tercer valor, `FP` (estancias posdoctorales), sobre el mismo módulo.

**Pero los niveles son otros.** `cod_nivel_formacion` en FC ofrece `Y:Otros`, `8:Extensión`, `F:Cursos de corta duración`, `E:MBA` — nada que ver con los de TE (1 Pregrado, 2 Especialización, 3 Maestría…). Reusar `inferNivel` tal cual metería un código que este formulario no acepta.

Campos obligatorios de FC que TE no pide: `nro_horas_semanales` y `nro_mes_inicio`. Opcionales: `nro_promedio_notas`, `nro_tiempo_lleva` + `tpo_tiempo_lleva` (`M`/`S`/`A`). Municipio y programa académico usan los mismos pickers ya resueltos.

### Idiomas — `ReRecursoHumIdioma/create.do` → `insert.do`

El más simple de todos: un select `sgl_idioma` (códigos ISO de 2 letras, `ES`, `EN`…) y cuatro grupos de radio con los mismos tres valores.

| Campo | Valores |
|---|---|
| `tpo_nivel_leer`, `tpo_nivel_escribir`, `tpo_nivel_hablar`, `tpo_nivel_escuchar` | `P` Deficiente · `R` Aceptable · `B` Bueno |

### Líneas de investigación — `EnLineaInv/create.do?decorator=T&null` → `insert.do?decorator=T&null`

Tres campos: `txt_nme_linea`, `sta_activa` (radio) y `txt_objeto` (textarea). Ojo con la URL: el `?decorator=T&null` es literal, y sin él `create.do` responde una página sin formulario.

### Demás trabajos — `EnProdTecnica/create_demasTrabajos.do` → `insert_demasTrabajos.do`

Once campos: `cod_tipo_producto` (hidden, obligatorio), `txt_nme_prod`, `nro_ano_presenta`, `nro_mes_presenta`, `sgl_idioma`, `tpo_medio_divulgacion` (`I` Papel, `H` Internet, `O` Otro), el picker de municipio (`cod_municipio_text` + `cod_municipio` + `cod_rh_municipio` + `sgl_pais`) y `txt_finalidad`.

## El `edit.do` de idiomas no tiene el select

Verificado en vivo el 2026-09-17 sobre `ReRecursoHumIdioma/edit.do?sgl_idioma=EN&cod_rh=…` (→ `update.do`).

El formulario de creación elige el idioma con un `<select name="sgl_idioma">`. El de edición **no lo tiene**: el idioma es la clave del registro y viaja en un `<input type="hidden">`. Por lo demás el form es limpio — no hay duplicados ocultos como en cursos.

Consecuencia: el filler resolvía el nombre del idioma contra las `<option>` del select, no encontraba ninguna, y **se iba sin tocar un solo radio**. El submit devolvía a CvLAC los niveles que ya tenía, CvLAC redirigía como ante cualquier guardado, y el resultado se reportaba como `Updated`.

De ahí sale una regla general, no solo de idiomas:

> **Un submit que no cambió ningún campo del formulario no se envía.**

Salir del formulario es el redirect normal de un guardado, así que un envío que devuelve los valores almacenados es indistinguible de uno que guardó algo. `updateItem` compara los campos antes y después de llenar; si no cambió ninguno, devuelve `failed` con los warnings, que es donde está el motivo real.

Es el mismo tipo de fallo que los duplicados ocultos de cursos: la escritura se ve aplicada en pantalla y llega descartada. La diferencia es que ahora hay una red que lo atrapa sin depender de conocer la rareza de cada formulario.

## El buscador de programas académicos solo ofrece lo ya registrado

Verificado el 2026-09-17 intentando crear una formación complementaria.

`queryPrograma.do` **no consulta un catálogo oficial de programas**: devuelve los que ya existen para esa institución en ese nivel. Para una institución con registros en la cuenta de prueba devuelve exactamente esos, y nada más. Para la Universidad de los Andes en niveles `8`/`F`/`Y`/`E` devuelve cero.

Y el popup (`searchPrograma.do`) tiene **un solo botón, "Buscar"**. No hay ruta para registrar un programa nuevo.

Consecuencia: un `add` de formación complementaria con un programa que CvLAC no conozca para esa institución y ese nivel **no se puede completar**. No es un límite del server: es del formulario.

### Y CvLAC responde 500, no un rechazo

Enviar ese formulario sin el programa resuelto no devuelve *"Seleccione un programa académico"*. Devuelve **HTTP 500** con una excepción de su propio validador:

```
co.gov.colciencias.cvlac.en_trayectoria_escolar.web.EnTrayectoriaEscolarInsertForm.validate(...:505)
```

Como la URL sigue siendo `insert.do`, eso pasaba por "volvió al formulario" y se reportaba como validación fallida — mandando a corregir un formulario que CvLAC nunca llegó a revisar. Se detecta con `isServerErrorMarkup` (ojo: la página de caída, "Server Unavailable", es otra cosa y se distingue).

De ahí sale la segunda regla general, hermana de la del submit sin cambios:

> **Un formulario al que le falta un campo que CvLAC exige no se envía.**

`FillReport.blockers` recoge esos campos; `addItem` y `updateItem` devuelven `failed` nombrándolos, sin llegar a enviar. Fue justamente enviarlo lo que tumbó el validador.

## `findInstitucionId` se queda con la primera coincidencia

Buscar el nombre de una universidad común devolvió **193 instituciones** — una homónima de otro país, sedes, un sindicato y un fondo de empleados. El código toma `items[0]`.

Ninguna de las primeras doce tiene programas en niveles de formación complementaria, y las sedes regionales, que es donde suelen estar registrados, no salen entre ellas.

Riesgo real y silencioso: un `add` de formación o experiencia puede quedar colgado de la institución equivocada sin que nada lo avise.

**Resuelto el 2026-09-17.** `resolveChoice` decide así, y sirve para cualquier picker de CvLAC, no solo instituciones:

| Situación | Qué hace |
|---|---|
| una coincidencia exacta del nombre | la usa, sin preguntar |
| varias exactas, o varias parciales | `needs_confirmation` con los candidatos en `choices`, sin escribir |
| una sola parcial | la usa |
| ninguna | warning, campo vacío (como antes) |

La respuesta vuelve en `data.institucionId`, que salta la búsqueda. El caso corriente —un nombre que coincide exacto— sigue siendo automático: preguntar por él sería ruido. Un nombre escrito tal como está en el catálogo coincide exacto.

## El catálogo de instituciones tiene duplicados exactos

Buscar "Universidad de los Andes" devuelve **seis filas con ese mismo nombre**:

```
id=663      UNIVERSIDAD DE LOS ANDES
id=430868   Universidad de los Andes
id=463458   Universidad de Los Andes
id=506751   Universidad de los Andes
id=1145996  UNIVERSIDAD DE LOS ANDES
id=1164019  Universidad de los Andes
```

No son universidades distintas de países distintos: son duplicados del propio catálogo de CvLAC, creados a lo largo del tiempo. Normalizadas son idénticas, así que **ninguna heurística de texto puede elegir**. La 663 es la canónica (id bajo, nombre en mayúsculas como los registros originales); las demás son ruido.

Antes de `resolveChoice` se tomaba la primera y salía bien por casualidad. Ahora devuelve `needs_confirmation` con las seis, que es lo correcto: qué fila se elige determina bajo qué organización queda el registro, y no hay deshacer.

Para la suite e2e esto significa que un candidato puede ser `{ label, institucionId }` en vez de solo un nombre. La que usa: **Universidad de los Andes 663**.

## Producción bibliográfica, tesis, jurados y producción técnica (2026-09-27)

Reconocimiento del menú de producción bibliográfica, tesis dirigidas, jurados y producción técnica, obtenido **solo leyendo**: GET al menú, a las listas `all*.do` y a los formularios `create*.do`, y POST a los buscadores de catálogo (que no escriben). No se envió ningún formulario.

### URLs

| Sección (nombre en el MCP) | Lista | Crear → enviar |
|---|---|---|
| `articulos` | `EnProdArticulo/all.do` | `EnProdArticulo/create.do` → `insert.do?null` |
| `libros` | `EnLibro/all.do` | `EnLibro/create.do` → `insert.do` |
| `capitulos` | `EnProdCapituloLibro/all.do` | `EnProdCapituloLibro/create.do` → `insert.do` |
| `tesis` | `EnTesisOrientada/all.do` | `EnTesisOrientada/create.do` → `insert.do` |
| `jurados` | `EnTesisOrientada/all_jurado.do?__tipo=A1` | `EnTesisOrientada/create_jurado.do` → `insert_jurado.do` |
| `informesTecnicos` | `EnProdTecnologico/all_trabajo_tecnico.do` | `create_trabajo_tecnico.do` → `insert_trabajo_tecnico.do` |
| `innovacionesProceso` | `EnProdTecnologico/all_proceso.do?__tipo=23` | `create_proceso.do` → `insert_proceso.do` |
| `productosTecnologicos` | `EnProdTecnologico/all_producto_tecnologico.do?__tipo=22` | `create_producto_tecnologico.do` → `insert_producto_tecnologico.do` |
| `consultorias` | `EnProdConsultoria/all_consultoria.do` | `create_consultoria.do` → `insert_consultoria.do` |
| `prototipos` | `EnProdPrototipo/all.do` | `EnProdPrototipo/create.do` → `insert.do` |

Fuera de este reconocimiento (existen en el menú, menos peso o formularios muy distintos): otro artículo publicado (`all_textos.do?__tipo=14`), otros tipos de libro (`EnLibro/all.do?tipo=…`), concepto técnico (exige adjuntar documentos), norma, reglamento, empresa de base tecnológica, diseño industrial y el resto de las ~20 entradas de producción técnica.

### Las listas paginan (afecta también a las secciones ya soportadas)

Las tablas son **JMesa**: `<table class="table" id="<tableId>">`, 15 filas por página por defecto (opciones 15/50/100), y una barra `tr.statusBar` con `Resultados 1 - 9 de 9.`.

- La paginación se controla por URL: `<tableId>_mr_=100` (filas por página) y `<tableId>_p_=2` (página). Verificado: `…all.do?__tipo=2B&cursos_dictados_all_mr_=5` → `Resultados 1 - 5 de 9.`; con `_p_=2` → `Resultados 6 - 9 de 9.`
- **No guarda estado en la sesión**: después de pedir 5 filas, la URL normal vuelve a mostrar 15.
- Consecuencia: con más de 15 ítems en una sección, `read_cvlac` devolvía solo 15, el **bloqueo de duplicados no veía la fila 16 en adelante** (un `add` repetido se escribía) y `update`/`delete` no encontraban la fila. Una hoja de vida senior tiene decenas de artículos: se resuelve antes que cualquier otra cosa (recorrer todas las páginas de una lista, ver `src/browser/jmesa.ts`).

### Formularios

**Artículo** (`cod_tipo_producto` radio: `111` Completo, `112` Corto, `113` Revisión, `114` Caso clínico). Campos: `txt_nme_prod`, `txt_pagina_inicial`, `txt_pagina_final`, `sgl_idioma`, `nro_ano_presenta`, `nro_mes_presenta` (sin opción vacía: preselecciona Enero), revista (`txt_nme_revista` readonly + ocultos `cod_revista`, `cod_revista_otro`, `tpo_revista`), `txt_volumen_revista`, `txt_fasciculo_revista`, `txt_serie_revista`, picker de municipio, `tpo_medio_divulgacion` (`I` Papel, `H` Electrónico), `txt_web_producto`, `txt_doi`.

**Libro** (`cod_tipo_producto` oculto = `134`). `txt_nme_prod`, `nro_ano_presenta`* y `nro_mes_presenta`*, `txt_isbn` (la etiqueta dice `ISBN(*)`), `sgl_pais` (tres letras), `tpo_medio_divulgacion` (`I`/`H`), `tpo_publicacion` radio (`ED` Editorial nacional, `EI` Editorial internacional, `BC` Book Citation Index), editorial (tres `txt_nme_editorial` readonly, `cod_editorial` y un oculto **llamado literalmente `null`** para el código de "editorial otra"), área (`nombre_area`* readonly + `cod_area_conocimiento` oculto), `cod_reconocimiento`, y dos `file` de certificados (`file_CLCDO`, `file_CLRI`).

**Capítulo** (`cod_tipo_producto` oculto = `132`). `txt_nme_prod`, `txt_pagina_inicial`, `txt_pagina_final`, `nro_paginas`, año* y mes*, libro de referencia (`txt_nme_libro` readonly + `cod_libro_ref` + oculto `null`), `txt_serie`, `txt_edicion`, `sgl_pais`, `tpo_medio_divulgacion`, `txt_doi`, área (`nombre_area`* + `cod_area_conocimiento`). La lista muestra: `#`, Título del capítulo, Año, Título del libro, Tipo producto, Categoría, Detalles, Editar, Eliminar.

**Trabajo dirigido / tesis** (`cod_tipo_producto` radio: `61` Tesis de doctorado, `62` Maestría o especialidad clínica, `64` Pregrado, `63` Monografía de especialización, `65` Iniciación científica, `66` Otro tipo). `txt_nme_prod`, inicio (`nro_ano_presenta`, `nro_mes_presenta`), fin (`nro_ano_fin`, `nro_mes_fin`), `tpo_orientacion` (`O` Tutor/director principal, `C` Cotutor/codirector, `A` Asesor), `nro_paginas`, institución (`id_institucion` + `nme_inst`), programa (`nme_programa_academico` + `cod_rh_programa_academico`), `valoracion_obt_tesis` (`6` Aprobada, `5` Distinción meritoria, `7` Distinción laureada; solo visible si la fecha fin ya pasó — lo decide `loadForm()`), y `txt_personas` (oculto: los estudiantes se **vinculan** con un diálogo que busca personas con CvLAC, `/cvlac/exclude/ReProductoRecursoHumano/all.do`).

**Jurado** (`cod_tipo_producto` select: `A15` Pregrado, `A14` Especialización, `A16` Especialidad médica, `A11` Maestría, `A12` Doctorado). `tpo_trab_pres` (`PG` Proyecto de grado/tesis, `TG` Trabajo de grado/tesis, `ED` Examen de calificación doctoral), `txt_nme_prod`, año y mes, `sgl_idioma`, `sgl_pais`, `tpo_medio_divulgacion` (8 valores: `I` Papel, `H` Internet, `O` Otro, …), `txt_web_producto`, `txt_doi`, `txt_nme_orientados` (**texto libre**), institución* (`id_institucion` + `txt_nme_institucion`) y programa* (`txt_nme_programa_acad` + `cod_rh_programa_academico`).

**Producción técnica** (informe técnico, innovación en procesos, producto tecnológico, consultoría, prototipo) comparte esqueleto: `txt_nme_prod`, año/mes, municipio, `txt_disponibilidad` (`Restringido` / `No restringido`), institución (`id_institucion` + `nme_inst`), y un bloque `tpo_prod_tiene` (`N` ninguno, `REG` registro, `PAT` patente, `SEC` secreto empresarial) que despliega sub-formularios `reg_*`, `pat_*`, `sec_*`. **Los `sec_*` vienen con `required` aunque estén ocultos.** Además:
- informe técnico (`cod_tipo_producto` oculto `245`): `sgl_idioma`, `nro_paginas`, `txt_contrato_reg`, y un bloque de proyecto (`cod_proyecto` lista los proyectos del investigador).
- innovación en procesos (oculto `23`): nombre, año y mes obligatorios; `nro_vlr_contrato`.
- producto tecnológico (radio `225` Gen clonado, `226` Base de datos de referencia, `227` Colección biológica, `229` Otro): `txt_nme_comercial`.
- consultoría (radio `241`…`249`): fin (`nro_ano_fin`, `nro_mes_fin`), `nro_duracion`, `txt_contrato_reg`, `sgl_idioma`.
- prototipo (radio `281` Industrial, `282` Servicios): la institución usa **otro** picker (`txt_search` + `sgl_inst`).

### Catálogos (popups)

| Picker | Buscar (POST) | Cuerpo | Opción | Qué escribe |
|---|---|---|---|---|
| Revista | `EnRevista/queryRevista.do?__form=enProdArticuloInsertForm&__nme_revista=txt_nme_revista&__cod_revista=cod_revista&__cod_revista_otro=cod_revista_otro&__tipo_revista=tpo_revista&tpo_busqueda=ES` | `nme_revista=…&txt_issn=…` | `value='0000000000' + código`, texto `(ISSN) NOMBRE` | prefijo `0000000000` → `cod_revista`=resto, `tpo_revista=PD`; si no → `cod_revista_otro`=resto, `tpo_revista=CV` |
| Libro | `EnLibro/queryLibro.do?__form=enProdCapituloLibroInsertForm&__text=txt_nme_libro&__codlibro=cod_libro_ref` | `nme_libro=…&isbn=…` | `value='codRh#codProducto'` | codRh `0000000000` → `cod_libro_ref`; si no → campo `null` |
| Editorial | `EnEditorial/queryEditorial.do?__form=enLibroInsertForm&__text=txt_nme_editorial1&__value=cod_editorial` | `nme_editorial=…` | `value='ED…'` o `'CV…'` | `ED` → `cod_editorial`; `CV` → campo `null` |
| Programa por institución | `EnProgramaAcademico/queryPrograma.do?txt_nme_inst=institucion&__form=<form>&__text=<campo texto>&__value=cod_rh_programa_academico&id_institucion=<id>` | `txt_nme_programa_acad=…` | `value='0000000000-21873'` | el valor **entero** en `cod_rh_programa_academico` |
| Área | `popup/ReProductoAreaCon/areaAll.do?…&crear=T` | — (catálogo en la página) | nivel 2 o 3 | `cod_area_conocimiento` = código, `nombre_area` = `Gran área - Área - Disciplina` |

Observado:
- ISSN con guion encuentra la revista; **hay homónimas** (tres revistas con el mismo nombre pero ISSN distintos): por nombre se pregunta, por ISSN se resuelve.
- La revista no se puede crear desde el popup (solo "revistas especializadas" del catálogo). Sin revista no hay artículo: es un bloqueo, no un campo vacío.
- El programa **sí** existe para instituciones reales: una institución de prueba devolvió 131 programas. Tesis y jurado no tienen el problema de formación complementaria (donde el buscador solo ofrece lo ya registrado).
- Libro y editorial ofrecen "Crear libro" / "Crear editorial" (`EnLibroOtro/create.do`, `EnEditorialOtro/create.do`): eso **escribe** en el catálogo. Fuera de alcance: si no está, bloqueo con instrucción.

### Dos fases por registro

Todos los formularios dicen: *"Al guardar esta información se desplegarán las opciones para registrar coautores, palabras clave, áreas de conocimiento y reconocimientos"*. La segunda fase se abre desde la ficha `query.do` del producto, no desde el formulario de alta.

La inspección se verificó en vivo el **2026-09-28** creando y borrando un artículo marcado para pruebas. No se dejaron datos de prueba en la cuenta.

En la ficha aparecen cuatro acciones, todas como ventanas emergentes:

| Acción | Ventana principal | Guardado | Observaciones |
|---|---|---|---|
| Palabras clave | `ReTrayectoriaEscPalabraClave/all.do` | `ReTrayectoriaEscPalabraCla/update.do` | La lista es ordenable; también permite crear una palabra propia mediante `popup/EnPalabraClave/insert.do` y luego vincularla. |
| Coautores | `ReProductoRecursoHumOtro/all.do` | `ReProductoRecursoHumOtro/update.do` | El investigador aparece automáticamente. La lista inicial contiene perfiles CvLAC ya registrados; “Añadir” abre `popup/ReProductoRecursoHumOtro/rhOtroAll.do`. |
| Áreas | `ReProductoAreaCon/all.do` | `ReProductoAreaCon/update.do` | La ventana de selección usa `areaPopup.do`, un `frameset` con `areaAll.do` y `areaSearchFrame.do`; el catálogo está embebido como `area_0`, `area_1` y `area_2`. |
| Reconocimientos | `ReProductoReconocimiento/all.do` | `ReProductoReconocimiento/insert.do` | “Añadir” abre `popup/ReProductoReconocimiento/reconocimientoAll.do`; ofrece los reconocimientos que ya existen en el currículo. |

Los cuatro módulos envían el listado completo, con prefijo de posición (`1.`, `2.`, …), y no una operación incremental por elemento. El orden es parte de los datos. Las palabras clave, coautores y áreas usan `select multiple`; sus botones marcan todas las opciones antes del `POST`.

Para tesis, `txt_personas` es un campo oculto y la pantalla posterior es distinta: `/cvlac/exclude/ReProductoRecursoHumano/all.do`. Tiene buscador de personas, una acción **Registrar**, y al escoger una persona solicita además `tpoParticipacionPersona` (tipo de participación). La edición de una vinculación usa `tpoParticipacionCoautor`. Esto no debe tratarse como el selector simple de coautores bibliográficos. El estado se lee en `/cvlac/json/ReProductoRecursoHumano/buscar.do`; las mutaciones son `insert.do`, `update.do` y `delete.do`, con `cod_producto`, `cod_rh_otro` y `tpo_participacion`. En la inspección en vivo los tipos fueron `TUT` (Tutor), `ASE` (Asesor), `COT` (Cotutor) y `ORI` (Orientado).

La implementación de `complete_product` conserva automáticamente el perfil propietario (`codRh=0`) y exige `confirm_delete:true` para desvincular otros coautores o estudiantes. Los perfiles de coautores se resuelven desde el catálogo que CvLAC expone en `popup/ReProductoRecursoHumOtro/rhOtroAll.do`; los estudiantes se resuelven con `EnRecursoHumano/buscar.do`. La verificación e2e del 2026-09-28 creó y eliminó artículos y tesis temporales, sin dejar registros de prueba.

`complete_product` es la operación separada y explícita que resuelve el producto por su ficha, lee el estado actual, devuelve `needs_confirmation` ante candidatos ambiguos y solo después envía cada lista completa. Los certificados del libro siguen siendo una carga de archivos independiente (`file_CLCDO` y `file_CLRI`), todavía no automatizada.
