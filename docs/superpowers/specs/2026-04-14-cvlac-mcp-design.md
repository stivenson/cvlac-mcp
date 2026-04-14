# CvLAC MCP Server — Design Spec

**Date:** 2026-04-14  
**Author:** Stivenson Rincón Mora  
**Status:** Draft

---

## 1. Context and Problem

Stivenson mantiene su perfil académico en dos lugares:

1. **stivenson.github.io** — portafolio personal (portafolio canónico, siempre actualizado)
2. **scienti.minciencias.gov.co/cvlac** — registro oficial del sistema CvLAC de MinCiencias

El problema: actualizar CvLAC manualmente es tedioso (muchos formularios, dropdowns, lógica de sesión) y por eso queda desincronizado con el portafolio. El objetivo es un **MCP server** que permita a Claude o cualquier agente IA comparar ambas fuentes y aplicar las actualizaciones pendientes de forma automatizada, con supervisión humana.

---

## 2. What We're Building

Un **servidor MCP custom en TypeScript** (`@modelcontextprotocol/sdk` + `playwright`) que expone herramientas para:

- Autenticarse en CvLAC y mantener sesión
- Leer el estado actual del CvLAC de Stivenson
- Leer el portafolio de stivenson.github.io
- Calcular el diff (qué falta en CvLAC)
- Aplicar actualizaciones sección por sección

El MCP corre localmente (stdio transport), se conecta a Claude Code o cualquier cliente MCP.

---

## 3. Source of Truth: Data Extracted

### Del portafolio (stivenson.github.io)

**Personal:**
- Nombre: Stivenson Rincón Mora
- Título: Systems Engineer & Full Stack Developer
- Ubicación: Cúcuta, Norte de Santander, Colombia

**Formación académica:**
- Maestría en Inteligencia Artificial — Universidad de los Andes (Feb 2024 - Actualidad)
- Ingeniería de Sistemas — Universidad Simón Bolívar (Ago 2009 - Jul 2014)
- Diplomado Desarrollo de Apps Móviles — Universidad Simón Bolívar (Feb 2014 - Jun 2014)

**Experiencia profesional (9 posiciones):**
1. LLMOps — Independiente (Agosto 2025 - Actualidad) — remoto
2. Full Stack Senior Developer — Mo Technologies/Mastercard (Mar 2021 - Jul 2025) — semi-presencial
3. Full Stack Developer — Universidad El Bosque (May 2020 - Feb 2021) — presencial/remoto
4. Full Stack Developer — DXC Technology (Dic 2019 - Abr 2020) — presencial/remoto
5. Full Stack + Cloud — Cuemby LLC (Mar 2017 - Nov 2019) — remoto
6. Full Stack — Miora.co/bewe.io (Oct 2016 - Ene 2017) — presencial
7. Programador Web — Kubesoft (2015-2016) — presencial
8. Freelancer Full Stack — Independiente (Jul 2014 - Sep 2016) — remoto
9. Programador — Universidad Simón Bolívar (Nov 2012 - Jul 2014) — presencial

**Skills técnicas:**
- Lenguajes: Python, JavaScript, TypeScript, Java, Node.js, PHP, Rust
- Frontend: React, React Native, AngularJS, Ionic, Bootstrap, HTML5, CSS3
- AI/ML: LLMs, Machine Learning, Agentes IA, FastMCP, LangChain
- Cloud: AWS, GCP, Lambda, ECS, S3, Terraform, CloudFormation, DigitalOcean, DynamoDB
- DevOps: Kubernetes, Docker, CI/CD, Serverless, GKE, Nginx
- Bases de datos: PostgreSQL, MySQL, Redis, MongoDB, DB2, Elasticsearch

**Logros/Reconocimientos:**
- Exaltación Académica — Ing. de Sistemas por apoyo social en Gramalote
- Experiencia Internacional — Mo Technologies/Mastercard, DXC Technology
- Maestría en IA — Universidad de los Andes (en curso)

**Formación complementaria (cursos):**
- Taller: Planeación y Optimización IA — USB (Nov 2025)
- IBM Coursera: Habilidades interpersonales (Oct 2025)
- Platzi: Cloud Computing AWS (Abr 2021)
- Platzi: AWS Cloud (Nov 2020)
- Platzi: Estrategias Aprendizaje en Línea (Jul 2020)
- SENA: Derechos Humanos y DIH (2015)
- SENA: Mantenimiento Hardware (2014)
- SENA: Microcontroladores I (2013)
- SENA: Proyecto de Vida (2012)

### Del CvLAC (campos del formulario de login — ya conocidos)

**Login form** (URL: `/cvlac/Login/s_login.do`):
- `tpo_nacionalidad` — select (valor: "COL" para Colombiana)
- `sgl_pais_nacim` — select (solo visible si extranjero)
- `txt_nmes_rh` — text (primer nombre: "Stivenson")
- `nro_documento_ident` — text (cédula: "REDACTED_CEDULA")
- `dta_nacimString` — text date (fecha nacimiento)
- `txt_contrasena` — password ("REDACTED_PASSWORD")

**Secciones editables en CvLAC (del manual):**
1. Datos generales / Identificación
2. Dirección residencial
3. Dirección profesional
4. Formación académica
5. Formación complementaria
6. Experiencia profesional
7. Líneas de investigación
8. Áreas de actuación
9. Idiomas
10. Actividades de formación (asesorías, cursos corta duración, tutoría)
11. Actividades como evaluador
12. Apropiación social y circulación del conocimiento
13. Producción artística y cultural
14. Producción bibliográfica (artículos, libros, capítulos)
15. Producción técnica y tecnológica (software, consultoría, prototipos)
16. Proyectos
17. Reconocimientos

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────┐
│                  MCP Client                         │
│          (Claude Code / Claude Desktop)             │
└──────────────────┬──────────────────────────────────┘
                   │ stdio (JSON-RPC)
┌──────────────────▼──────────────────────────────────┐
│              cvlac-mcp server                       │
│  ┌──────────────────────────────────────────────┐   │
│  │            Tool Router                      │   │
│  │  login | read_cvlac | read_portfolio |       │   │
│  │  diff  | update_section | get_status         │   │
│  └───────────────┬──────────────────────────────┘   │
│  ┌───────────────▼──────────────────────────────┐   │
│  │         BrowserSession (Playwright)          │   │
│  │  - Persistent context (session storage)      │   │
│  │  - Cookie persistence across calls           │   │
│  │  - Auto-reconnect if session expired         │   │
│  └───────────────┬──────────────────────────────┘   │
│  ┌───────────────▼──────────────────────────────┐   │
│  │        Portfolio Extractor                   │   │
│  │  - Fetch stivenson.github.io                 │   │
│  │  - Parse React bundle for data               │   │
│  │  - Return structured PortfolioData           │   │
│  └──────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────┐  │
│  │        Diff Engine                           │   │
│  │  - Compare CvLAC vs Portfolio               │   │
│  │  - Return list of missing/outdated items    │   │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 5. MCP Tools (API Surface)

### Tool 1: `login`
Autentica en CvLAC y persiste la sesión en disco.
- **Input:** `{ force?: boolean }` — si `force=true`, hace login aunque haya sesión guardada
- **Output:** `{ success: boolean, message: string }`
- **Behavior:** Lee sesión de `~/.cvlac-session.json`. Si existe y es válida, la reutiliza. Si no, navega al formulario de login, llena los campos y guarda la sesión.

### Tool 2: `read_cvlac`
Extrae el estado actual de una o todas las secciones del CvLAC.
- **Input:** `{ section?: 'formacion' | 'experiencia' | 'cursos' | 'reconocimientos' | 'produccion_bibliografica' | 'produccion_tecnica' | 'proyectos' | 'all' }`
- **Output:** `{ section: string, items: object[] }`
- **Behavior:** Navega a la sección dentro de la interfaz autenticada, extrae los items existentes.

### Tool 3: `read_portfolio`
Lee y parsea el portafolio de stivenson.github.io.
- **Input:** `{}`
- **Output:** `PortfolioData` — objeto estructurado con toda la info del portafolio

### Tool 4: `diff`
Compara CvLAC vs portafolio y devuelve lo que falta.
- **Input:** `{ section?: string }` — opcional, por defecto todas
- **Output:** `{ missing: DiffItem[], outdated: DiffItem[], upToDate: DiffItem[] }`
- **Behavior:** Llama internamente a `read_cvlac` + `read_portfolio` y hace la comparación

### Tool 5: `update_section`
Aplica una actualización específica al CvLAC.
- **Input:** `{ section: string, action: 'add' | 'update' | 'delete', data: object }`
- **Output:** `{ success: boolean, message: string, screenshot?: string }`
- **Behavior:** Navega al formulario de la sección, llena los campos, hace submit. Toma screenshot para confirmación.

### Tool 6: `sync`
Wrapper de alto nivel: hace diff completo y aplica todas las actualizaciones pendientes con confirmación.
- **Input:** `{ dry_run?: boolean, sections?: string[] }`
- **Output:** `{ applied: number, skipped: number, errors: string[], report: string }`
- **Behavior:** Con `dry_run=true` solo muestra el diff sin aplicar cambios.

### Tool 7: `screenshot`
Toma un screenshot del estado actual del browser (útil para debugging).
- **Input:** `{}`
- **Output:** `{ base64: string }`

---

## 6. File Structure

```
cvlac-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point, MCP server setup
│   ├── server.ts             # Tool registration and routing
│   ├── browser/
│   │   ├── session.ts        # BrowserSession class (Playwright lifecycle)
│   │   └── navigation.ts     # URL constants, navigation helpers
│   ├── tools/
│   │   ├── login.ts          # login tool implementation
│   │   ├── read-cvlac.ts     # read_cvlac tool
│   │   ├── read-portfolio.ts # read_portfolio tool
│   │   ├── diff.ts           # diff tool
│   │   ├── update-section.ts # update_section tool
│   │   ├── sync.ts           # sync tool
│   │   └── screenshot.ts     # screenshot tool
│   ├── extractors/
│   │   ├── portfolio.ts      # Parses stivenson.github.io bundle
│   │   └── cvlac/
│   │       ├── formacion.ts
│   │       ├── experiencia.ts
│   │       ├── cursos.ts
│   │       ├── reconocimientos.ts
│   │       └── produccion.ts
│   └── types.ts              # Shared TypeScript interfaces
├── .env.example              # CVLAC_PASSWORD, etc.
└── .gitignore
```

---

## 7. Key Technical Decisions

### Sesión persistente
Playwright guardará el `storageState` (cookies + localStorage) en `~/.cvlac-session.json` después de cada login exitoso. En cada tool call se verifica si la sesión es válida navegando a `/cvlac/EnRecursoHumano/inicio.do` y comprobando el título de la página.

### Login flow (campos exactos del formulario)
```
POST /cvlac/Login/s_login.do
- tpo_nacionalidad = "COL"
- txt_nmes_rh = "Stivenson"
- nro_documento_ident = "REDACTED_CEDULA"
- txt_contrasena = "REDACTED_PASSWORD"
```
La fecha de nacimiento solo aparece para algunos tipos de documento. El campo `dta_nacimString` se llena si el servidor lo solicita.

### Credenciales
Las credenciales se leen de variables de entorno (`CVLAC_NOMBRE`, `CVLAC_CEDULA`, `CVLAC_PASSWORD`) o de un archivo `.env` local. **Nunca se hardcodean en el código.**

### Portfolio parsing
El bundle de stivenson.github.io es una React SPA. El extractor hace `fetch` de la URL, descarga el JS bundle y usa regex/parsing para extraer los arrays de datos (`experience`, `education`, `courses`, `achievements`, `skills`). Esto es frágil si el bundle cambia — se versiona el hash del bundle para detectar cambios.

### Secciones prioritarias (MVP)
Para el MVP se implementan las secciones más relevantes para Stivenson:
1. Formación académica
2. Formación complementaria (cursos)
3. Experiencia profesional
4. Reconocimientos

Las demás secciones (producción bibliográfica, proyectos, etc.) se implementan en iteraciones posteriores ya que requieren formularios más complejos.

### Diff logic
- **Formación:** match por institución + grado (normalizado a lowercase, sin tildes)
- **Experiencia:** match por empresa + rol (normalizado)
- **Cursos:** match por nombre del curso (normalizado)
- **Reconocimientos:** match por título

---

## 8. CvLAC URL Structure (confirmed + inferred)

```
Base: https://scienti.minciencias.gov.co/cvlac/

Login:           /cvlac/Login/pre_s_login.do   (GET - mostrar form)
                 /cvlac/Login/s_login.do        (POST - autenticar)
Inicio:          /cvlac/EnRecursoHumano/inicio.do
Datos generales: /cvlac/EnRecursoHumano/datosGenerales.do
Formación:       /cvlac/EnRecursoHumano/formacionAcademica.do
Experiencia:     /cvlac/EnRecursoHumano/experienciaProfesional.do
Cursos:          /cvlac/EnRecursoHumano/formacionComplementaria.do
Reconocimientos: /cvlac/EnRecursoHumano/reconocimientos.do
Producción bib.: /cvlac/EnProduccionBibliografica/...
Proyectos:       /cvlac/EnProyecto/...
```
> Nota: Los paths exactos de las secciones internas serán confirmados durante la implementación con Playwright (headful mode para inspectar).

---

## 9. Verification Plan

1. **Unit tests:** Probar el diff engine con datos mock (portfolio vs cvlac state)
2. **Integration test — login:** Ejecutar el tool `login` y verificar que llega a `/inicio.do`
3. **Integration test — read:** Ejecutar `read_cvlac({ section: 'formacion' })` y verificar que devuelve los items actuales
4. **Integration test — diff:** Ejecutar `diff({ section: 'formacion' })` contra el portafolio real
5. **Integration test — update:** Ejecutar `update_section` con un item de prueba (formación complementaria dummy), verificar screenshot confirmatorio, luego eliminarlo
6. **End-to-end:** Ejecutar `sync({ dry_run: true })` y revisar el reporte completo antes de aplicar cambios reales

---

## 10. Out of Scope (v1)

- Producción artística y cultural
- Apropiación social y circulación del conocimiento
- Actividades como evaluador
- Participación en grupos de investigación
- Publicación en Publindex o GrupLAC
- UI gráfica — todo interacción vía Claude/MCP

---

## 11. Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x",
    "playwright": "^1.x",
    "dotenv": "^16.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "tsx": "^4.x",
    "vitest": "^1.x"
  }
}
```
