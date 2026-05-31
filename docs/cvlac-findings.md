# CvLAC — Hallazgos de navegación en vivo

Fuente de verdad obtenida navegando el CvLAC real (cuenta de Stivenson) el 2026-05-30 con el navegador integrado, solo lectura (sin enviar formularios). Las páginas `create.do` se inspeccionaron cargándolas, nunca se hizo submit.

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

**Conclusión:** todos los extractores de `src/extractors/cvlac/` usan los índices correctos. Único ajuste menor: en reconocimientos el código guarda `cells[2]` (que es el AÑO) como `description`.

### Resolución de la ambigüedad de "cursos"

- "Curso de corta duración" (`/cvlac/EnProdCurso/all.do?__tipo=2B`, botón "Crear curso de corta duración dictado") **es donde Stivenson tiene registrados sus cursos del portafolio** (Platzi AWS, IBM Coursera, Taller IA USB, SENA Proyecto de Vida/Microcontroladores, etc.). El código apunta aquí → CORRECTO.
- "Formación complementaria" (`/cvlac/EnFormacionComple/all.do?isTrayectoria=FC`) contiene OTROS ítems (cursos SENA técnicos antiguos: soldadura, instalación de software, etc.). El código define esta URL (`formacionComple`) pero no la usa, y está bien así.

### Experiencia: por qué queda fuera del diff

Los nombres de empresa en CvLAC difieren mucho del portafolio (ej. CvLAC "MO TECNOLOGIAS COLOMBIA SAS" / "bewe software" / "Manpower Professional ltda" vs portafolio "Mo Technologies (Mastercard - Start Path)"). Un match por nombre generaría falsos faltantes. Además el rol/cargo no aparece en la lista (solo en el detalle). Por eso experiencia se gestiona manualmente y se excluye del diff.

## Formularios de creación (`create.do` → POST a `insert.do`)

Todos tienen botón submit con `value="Guardar"` (por eso `clickGuardar` con `getByRole('button', {name:/guardar/i})` funciona).

### formacion — `EnTrayectoriaEscolar/insert.do`
- `cod_nivel_formacion` (select): 1=Pregrado/Universitario, 2=Especialización, 7=Técnico nivel medio, 9=Técnico nivel superior, C=Secundario, B=Primaria (Maestría/Doctorado fuera del corte, presumiblemente 3/4). `inferNivel` del código es consistente.
- `id_institucion` (hidden) + `txt_nme_institucion` (readonly), `txt_nme_programa_acad` (readonly), `txt_nme_titulo_obtenido` (text), `nro_ano_inicio` / `nro_ano_obten` (selects). Código OK.

### cursos — `EnProdCurso/insert.do`
- Código llena: `txt_nme_prod`, `nro_ano_presenta`, `nro_mes_presenta`. OK.
- Campos adicionales posiblemente requeridos que el código NO llena: `cod_tipo_producto` (radio), `txt_participacion` (select Docente/Organizador/Otro), `nro_duracion`, `txt_lugar`, `sgl_idioma`, `sgl_pais`, `cod_municipio_text`. Verificar en prueba de escritura.

### reconocimientos — `EnReconocimiento/insert.do`
- Código llena solo `txt_nme_reconocimiento`. Campos `nro_ano_obtencion` / `nro_mes_obtencion` (y `tpo_ambito` N/I) podrían ser requeridos y no se llenan.

### proyectos — `EnProyecto/insert.do` (BUGS en el código)
- OK: `tpo_proyecto` (radio), `txt_nme_proyecto`, `nro_ano_inicio`/`nro_mes_inicio`/`nro_ano_fin`/`nro_mes_fin`, `nro_valor`, `txt_resumen_proyecto`, institución `nme_inst` (readonly).
- BUG nombres de financiación: real `tpo_fuente_finan` (no `tpo_fuente_financiacion`), `tpo_amb_finan` (radio) y `tpo_rol` (select F/E/C) — el código usa `tpo_tipo_partic_inst` que no existe.
- FALTA `tpo_participacion_proy` (select: IP=Investigador principal, CI=Coinvestigador, AS=Asesor, EP=Estudiante pregrado, EM=Estudiante maestría, ED=Estudiante doctorado), probablemente requerido.
- `dta_acto_admString` es **readonly** → `page.fill` no funcionará; hay que inyectar por JS (forceSetReadonly).

### software — `EnProdSoftware/insert.do`
- OK: `cod_tipo_producto` (radio 211/212/219), `txt_nme_prod`, `nro_ano_presenta`/`nro_mes_presenta`, `txt_web_producto`, `tpo_prod_tiene` (radio, value "N"=Ninguno), textareas `txt_analisis`/`txt_desarrollo`/`txt_implementacion`/`txt_validacion`.
- Textareas adicionales posiblemente requeridas no llenadas: `txt_plataforma`, `txt_ambiente`.

### eventos — `EnEventoCientifico/insert.do`
- OK: `txt_nme_evento`, `tpo_clasificacion` (N/I), `dta_inicioString`/`dta_finString` (readonly→JS), `cod_municipio_text` (readonly, id dinámico `_loc_NNNNN`), `txt_lugar`, checkboxes de rol `tpo_part_ponente`/`tpo_part_ponenteMag`/`tpo_part_organizador`/`tpo_part_asistente`, `txt_nme_institucion` (readonly), `txt_resumen_evento`.
- `tpo_evento` (select): OT=Otro, **CG=Congreso** (no "CO"), EN=Encuentro, SE=Seminario, SI=Simposio, TA=Taller. Corregir el comentario del tipo en `types.ts`.

## Estado actual de datos en CvLAC (referencia)

- formacion: 7 ítems. experiencia: 9. cursos (EnProdCurso): 9. reconocimientos: 5. proyectos: 4. software: 5 (incluye los 3 STATIC del portafolio). eventos: 4 (incluye el Congreso Multimedia STATIC).
