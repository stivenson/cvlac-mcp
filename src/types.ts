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
  skills: SkillsData;
}

// ── CvLAC types (scraped from the site) ─────────────────────────────────────

export type CvLACSectionName =
  | 'formacion'
  | 'experiencia'
  | 'cursos'
  | 'reconocimientos';

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
  description?: string;
}

export interface CvLACData {
  formacion: CvLACFormacionItem[];
  experiencia: CvLACExperienciaItem[];
  cursos: CvLACCursoItem[];
  reconocimientos: CvLACReconocimientoItem[];
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
