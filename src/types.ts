// ── Portfolio types (parsed from the configured portfolio site) ──────────────

export interface EducationItem {
  institution: string;
  degree: string;
  period: string;
  description?: string;
  /**
   * CvLAC's own `cod_nivel_formacion` code, when the caller knows it. It wins
   * over any inference: the two trayectoria sections use different catalogues,
   * and a name alone cannot always tell them apart.
   */
  nivel?: string;
  /** Month of 1-12. Only formación complementaria asks for it. */
  startMonth?: string;
  /**
   * CvLAC's own institution id. Searching by name can match hundreds of rows;
   * when it does, the write stops and asks, and the answer comes back here.
   */
  institucionId?: string;
}

export interface ExperienceItem {
  company: string;
  role: string;
  period: string;
  modality: string;
  description: string[];
  technologies?: string[];
  /** CvLAC's own institution id, when the name matched several rows. */
  institucionId?: string;
}

export interface CourseItem {
  name: string;
  date: string; // "YYYY-MM" format
  type?: string; // "curso" | "taller"
  emoji?: string;
  color?: string;
  // CvLAC-only fields (EnProdCurso/insert.do). Missing values fall back to
  // cvlac.config.json defaults where one exists, otherwise the field is left
  // empty and a warning is reported.
  tipoProducto?: string; // cod_tipo_producto radio
  participacion?: string; // txt_participacion select
  duracionHoras?: string | number; // nro_duracion
  lugar?: string; // txt_lugar
  idioma?: string; // sgl_idioma
  pais?: string; // sgl_pais
  ciudad?: string;
  codMunicipio?: string;
}

export interface AchievementItem {
  title: string;
  description?: string;
  year?: string; // nro_ano_obtencion
  month?: string; // nro_mes_obtencion
  ambito?: 'N' | 'I'; // tpo_ambito: Nacional | Internacional
}

export interface ProjectItem {
  title: string;
  description: string;
  tipoProyecto: 'ID' | 'IN' | 'EX' | 'CR';
  startYear: string;
  startMonth: string;
  endYear?: string;
  endMonth?: string;
  institution?: string;
  link?: string;
  // Financiación
  tipoFinanciacion?: 'FI' | 'SO'; // Financiado | Solidario
  fuenteFinanciacion?: 'I' | 'E'; // tpo_fuente_finan: Interna | Externa
  tipoParticipacionInstitucion?: 'FI' | 'EJ' | 'FI_EJ'; // Financiadora | Ejecutora | Ambas
  nroActoAdministrativo?: string;
  fechaActoAdministrativo?: string; // DD/MM/YYYY
  valorSinContrapartida?: string; // numeric string
  participacion?: string; // e.g. "Investigador Principal", "Coinvestigador", "Estudiante de pregrado"
}

export interface SoftwareItem {
  name: string;
  year: string;
  month?: string;
  tipoSoftware?: '211' | '212' | '219'; // Computacional | Multimedia | Otra
  url?: string;
  /** Fallback text for every technical textarea CvLAC marks required. */
  description?: string;
  /** Per-textarea text; takes precedence over `description`. */
  descripcionTecnica?: {
    analisis?: string;
    desarrollo?: string;
    implementacion?: string;
    validacion?: string;
    plataforma?: string;
    ambiente?: string;
  };
}

export interface EventoCientificoItem {
  name: string;
  startDate: string; // DD/MM/YYYY
  endDate?: string;  // DD/MM/YYYY
  lugar?: string;
  ciudad?: string;
  codMunicipio?: string; // Código DANE del municipio, p.ej. 11001=Bogotá
  tipoEvento?: string; // OT=Otro, CG=Congreso, EN=Encuentro, SE=Seminario, SI=Simposio, TA=Taller
  ambito?: 'N' | 'I' | 'R'; // Nacional | Internacional | Regional
  rol?: 'PO' | 'PM' | 'OR' | 'AS'; // Ponente | Ponente magistral | Organizador | Asistente
  institution?: string;
  resumen?: string;
}

export interface SkillsData {
  languages: string[];
  frontend: string[];
  ai: string[];
  cloud: string[];
  devops: string[];
  databases: string[];
}

export interface PortfolioData {
  personal: {
    name: string;
    title: string;
    location: string;
  };
  education: EducationItem[];
  experience: ExperienceItem[];
  courses: CourseItem[];
  achievements: AchievementItem[];
  projects: ProjectItem[];
  software: SoftwareItem[];
  eventos: EventoCientificoItem[];
  skills: SkillsData;
}

// ── CvLAC types (scraped from the site) ─────────────────────────────────────

export type CvLACSectionName =
  | 'formacion'
  | 'experiencia'
  | 'cursos'
  | 'reconocimientos'
  | 'proyectos'
  | 'software'
  | 'eventos'
  | 'formacionComple'
  | 'idiomas'
  | 'lineas';

export interface CvLACFormacionItem {
  institution: string;
  degree: string;
  period?: string;
}

export interface CvLACExperienciaItem {
  company: string;
  role: string;
  period?: string;
}

export interface CvLACCursoItem {
  name: string;
  date?: string;
}

export interface CvLACReconocimientoItem {
  title: string;
  year?: string;
}

export interface CvLACProyectoItem {
  title: string;
}

export interface CvLACSoftwareItem {
  name: string;
}

export interface CvLACEventoItem {
  name: string;
}

export interface CvLACData {
  formacion: CvLACFormacionItem[];
  experiencia: CvLACExperienciaItem[];
  cursos: CvLACCursoItem[];
  reconocimientos: CvLACReconocimientoItem[];
  proyectos: CvLACProyectoItem[];
  software: CvLACSoftwareItem[];
  eventos: CvLACEventoItem[];
  formacionComple: CvLACFormacionItem[];
  idiomas: CvLACIdiomaItem[];
  lineas: CvLACLineaItem[];
}

// ── Diff types ───────────────────────────────────────────────────────────────

export interface DiffItem {
  section: CvLACSectionName;
  action: 'add' | 'update';
  label: string;
  data: unknown;
  /** Label of the CvLAC item this was matched against, when there was one. */
  matchedLabel?: string;
}

/** How closely a portfolio item matched something already in CvLAC. */
export type MatchType = 'exact' | 'same' | 'similar' | 'none';

/** One row of a CvLAC picker, offered so a person can say which was meant. */
export interface ChoiceOption {
  id: string;
  label: string;
}

/** A picker whose search did not settle on one row. */
export interface AmbiguousChoice {
  /** Which picker: "institución", "municipio"… */
  field: string;
  /** What was searched for. */
  value: string;
  options: ChoiceOption[];
}

export interface SimilarCandidate {
  label: string;
  matchType: Exclude<MatchType, 'none'>;
}

/**
 * A portfolio item that resembles one or more CvLAC entries closely enough that
 * writing it could create a duplicate. Never applied automatically.
 */
export interface SimilarDiffItem extends DiffItem {
  candidates: SimilarCandidate[];
}

export interface DiffResult {
  missing: DiffItem[];
  toUpdate: DiffItem[];
  similar: SimilarDiffItem[];
  upToDate: DiffItem[];
}

/** What a caller passes to add or edit a language. */
export interface LanguageInput {
  language: string;
  /** Sets the four skills at once when the individual ones are absent. */
  level?: string;
  read?: string;
  write?: string;
  speak?: string;
  listen?: string;
}

/** What a caller passes to add or edit a research line. */
export interface ResearchLineInput {
  name: string;
  /** CvLAC stores this as T/F and preselects neither; it defaults to active. */
  active?: boolean;
  objective?: string;
}

/** One language with the four levels CvLAC grades separately. */
export interface CvLACIdiomaItem {
  language: string;
  read: string;
  write: string;
  speak: string;
  listen: string;
}

/** A research line. Its list view carries only the name. */
export interface CvLACLineaItem {
  name: string;
}

// ── Update types ─────────────────────────────────────────────────────────────

export interface UpdateRequest {
  section: CvLACSectionName;
  action: 'add' | 'update' | 'delete';
  data: unknown;
  /**
   * Allow an `add` to proceed even though CvLAC already holds a matching item.
   * Without it, such an add returns status 'needs_confirmation' and writes nothing.
   */
  confirmDuplicate?: boolean;
  /**
   * Let a `delete` through. Without it, a delete returns 'needs_confirmation'
   * and removes nothing: CvLAC has no undo, and the label that finds the row is
   * matched loosely enough to hit a neighbour.
   */
  confirmDelete?: boolean;
}

/**
 * `unverified` is not a softer `failed`: it means the write was sent and this
 * server could not read back whether CvLAC kept it — which is what happens when
 * the site goes down mid-submit. Reporting those as failures was wrong twice
 * over, because CvLAC had stored them.
 */
export type UpdateStatus = 'ok' | 'failed' | 'needs_confirmation' | 'unverified';

export interface UpdateResult {
  /** True only when status is 'ok'. Kept for callers that just check success. */
  success: boolean;
  status: UpdateStatus;
  message: string;
  /** Fields that could not be filled, one line each. Present on success too. */
  warnings?: string[];
  /** Existing CvLAC items that blocked an add; set when status is 'needs_confirmation'. */
  similar?: SimilarCandidate[];
  /** Pickers that matched several rows; set when status is 'needs_confirmation'. */
  choices?: AmbiguousChoice[];
  screenshotBase64?: string;
}

// ── Detail types ─────────────────────────────────────────────────────────────

/** One label/value pair read off a CvLAC record page. */
export interface CvLACDetailField {
  label: string;
  value: string;
}

export interface CvLACDetail {
  section: CvLACSectionName;
  /** The label searched for in the section's list. */
  label: string;
  found: boolean;
  url?: string;
  fields: CvLACDetailField[];
  /** The page's raw text, returned only when no field pair could be read. */
  text?: string;
  message?: string;
}
