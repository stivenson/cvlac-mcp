// ── Portfolio types (from stivenson.github.io) ──────────────────────────────

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
  type: string; // "curso" | "taller"
  emoji?: string;
  color?: string;
}

export interface AchievementItem {
  title: string;
  description: string;
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
  fuenteFinanciacion?: 'IN' | 'EX'; // Interna | Externa
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
}

export interface EventoCientificoItem {
  name: string;
  startDate: string; // DD/MM/YYYY
  endDate?: string;  // DD/MM/YYYY
  lugar?: string;
  ciudad?: string;
  codMunicipio?: string; // Código DANE: 54001=Cúcuta, 11001=Bogotá, 05001=Medellín
  tipoEvento?: string; // OT=Otro, CO=Congreso, SE=Seminario, TA=Taller
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
}

export interface DiffResult {
  missing: DiffItem[];
  upToDate: DiffItem[];
}

// ── Update types ─────────────────────────────────────────────────────────────

export interface UpdateRequest {
  section: CvLACSectionName;
  action: 'add' | 'update' | 'delete';
  data: unknown;
}

export interface UpdateResult {
  success: boolean;
  message: string;
  screenshotBase64?: string;
}
