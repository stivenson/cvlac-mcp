// ── Portfolio types (parsed from the configured portfolio site) ──────────────

export interface EducationItem {
  institution: string;
  degree: string;
  period: string;
  description?: string;
}

export interface ExperienceItem {
  company: string;
  role: string;
  period: string;
  modality: string;
  description: string[];
  technologies?: string[];
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
  | 'eventos';

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
}

export type UpdateStatus = 'ok' | 'failed' | 'needs_confirmation';

export interface UpdateResult {
  /** True only when status is 'ok'. Kept for callers that just check success. */
  success: boolean;
  status: UpdateStatus;
  message: string;
  /** Fields that could not be filled, one line each. Present on success too. */
  warnings?: string[];
  /** Existing CvLAC items that blocked an add; set when status is 'needs_confirmation'. */
  similar?: SimilarCandidate[];
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
