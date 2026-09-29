import { z } from 'zod';
import type { CvLACSectionName } from './types.js';

/**
 * Runtime shape of every item that can be written to CvLAC.
 *
 * These guard two entry points: the `data` argument of the update_section tool
 * (which arrives as untyped JSON from the MCP client) and data/portfolio-extra.json.
 */

export const educationSchema = z.object({
  institution: z.string().min(1),
  degree: z.string().min(1),
  period: z.string(),
  description: z.string().optional(),
  nivel: z.string().optional(),
  startMonth: z.string().optional(),
  institucionId: z.string().optional(),
});

export const experienceSchema = z.object({
  company: z.string().min(1),
  role: z.string(),
  period: z.string(),
  modality: z.string().optional(),
  description: z.array(z.string()).optional(),
  technologies: z.array(z.string()).optional(),
  institucionId: z.string().optional(),
});

export const courseSchema = z.object({
  name: z.string().min(1),
  date: z.string().regex(/^\d{4}(-\d{2})?$/, 'expected YYYY or YYYY-MM'),
  type: z.string().optional(),
  emoji: z.string().optional(),
  color: z.string().optional(),
  /** CvLAC cod_tipo_producto radio value. */
  tipoProducto: z.string().optional(),
  /** CvLAC txt_participacion select value, e.g. 'D' (docente). */
  participacion: z.string().optional(),
  duracionHoras: z.union([z.string(), z.number()]).optional(),
  lugar: z.string().optional(),
  idioma: z.string().optional(),
  pais: z.string().optional(),
  ciudad: z.string().optional(),
  codMunicipio: z.string().optional(),
});

export const achievementSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  year: z.string().regex(/^\d{4}$/).optional(),
  month: z.string().optional(),
  /** tpo_ambito: N=Nacional, I=Internacional. */
  ambito: z.enum(['N', 'I']).optional(),
});

export const projectSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  tipoProyecto: z.enum(['ID', 'IN', 'EX', 'CR']),
  startYear: z.string().regex(/^\d{4}$/),
  startMonth: z.string(),
  endYear: z.string().regex(/^\d{4}$/).optional(),
  endMonth: z.string().optional(),
  institution: z.string().optional(),
  link: z.string().optional(),
  tipoFinanciacion: z.enum(['FI', 'SO']).optional(),
  fuenteFinanciacion: z.enum(['I', 'E']).optional(),
  tipoParticipacionInstitucion: z.enum(['FI', 'EJ', 'FI_EJ']).optional(),
  nroActoAdministrativo: z.string().optional(),
  fechaActoAdministrativo: z.string().optional(),
  valorSinContrapartida: z.string().optional(),
  participacion: z.string().optional(),
  institucionId: z.string().optional(),
});

export const softwareSchema = z.object({
  name: z.string().min(1),
  year: z.string().regex(/^\d{4}$/),
  month: z.string().optional(),
  tipoSoftware: z.enum(['211', '212', '219']).optional(),
  url: z.string().optional(),
  description: z.string().optional(),
  descripcionTecnica: z
    .object({
      analisis: z.string().optional(),
      desarrollo: z.string().optional(),
      implementacion: z.string().optional(),
      validacion: z.string().optional(),
      plataforma: z.string().optional(),
      ambiente: z.string().optional(),
    })
    .optional(),
});

export const eventoSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'expected DD/MM/YYYY'),
  endDate: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/).optional(),
  lugar: z.string().optional(),
  ciudad: z.string().optional(),
  codMunicipio: z.string().optional(),
  tipoEvento: z.string().optional(),
  ambito: z.enum(['N', 'I', 'R']).optional(),
  rol: z.enum(['PO', 'PM', 'OR', 'AS']).optional(),
  institution: z.string().optional(),
  resumen: z.string().optional(),
});

const yearSchema = z.string().regex(/^\d{4}$/, 'año de 4 cifras');
const monthSchema = z.string().regex(/^(0?[1-9]|1[0-2])$/, 'mes 1-12').optional();

const articleSchema = z
  .object({
    title: z.string().min(1),
    year: yearSchema,
    month: monthSchema,
    tipo: z.string().optional(),
    issn: z.string().optional(),
    revista: z.string().optional(),
    revistaId: z.string().optional(),
    volumen: z.string().optional(),
    fasciculo: z.string().optional(),
    serie: z.string().optional(),
    paginaInicial: z.string().optional(),
    paginaFinal: z.string().optional(),
    idioma: z.string().optional(),
    medio: z.string().optional(),
    url: z.string().optional(),
    doi: z.string().optional(),
    ciudad: z.string().optional(),
  })
  .refine((item) => Boolean(item.issn || item.revista || item.revistaId), { message: 'hace falta issn o revista' });

const jurySchema = z.object({
  title: z.string().min(1), nivel: z.string().min(1), tipoTrabajo: z.string().optional(), year: yearSchema,
  month: monthSchema, orientado: z.string().min(1), institucion: z.string().min(1), institucionId: z.string().optional(),
  programa: z.string().min(1), programaId: z.string().optional(), idioma: z.string().optional(), pais: z.string().optional(),
  medio: z.string().optional(), url: z.string().optional(), doi: z.string().optional(),
});

const thesisSchema = z.object({
  title: z.string().min(1), tipo: z.string().min(1), rol: z.string().optional(), year: yearSchema, month: monthSchema,
  yearEnd: yearSchema.optional(), monthEnd: monthSchema, paginas: z.string().regex(/^\d+$/).optional(),
  institucion: z.string().min(1), institucionId: z.string().optional(), programa: z.string().min(1), programaId: z.string().optional(),
  valoracion: z.string().optional(), estudiantes: z.array(z.string()).optional(),
});

const chapterSchema = z.object({
  title: z.string().min(1), bookTitle: z.string().min(1), isbn: z.string().optional(), libroId: z.string().optional(),
  year: yearSchema, month: monthSchema, paginaInicial: z.string().optional(), paginaFinal: z.string().optional(),
  paginas: z.string().optional(), serie: z.string().optional(), edicion: z.string().optional(), pais: z.string().optional(),
  medio: z.string().optional(), doi: z.string().optional(), area: z.string().min(1), areaId: z.string().optional(),
});

const bookSchema = z.object({
  title: z.string().min(1), isbn: z.string().min(10), year: yearSchema, month: monthSchema,
  editorial: z.string().min(1), editorialId: z.string().optional(), publicacion: z.string().optional(), pais: z.string().optional(),
  medio: z.string().optional(), area: z.string().min(1), areaId: z.string().optional(),
  certificateCLCDO: z.string().min(1).optional(), certificateCLRI: z.string().min(1).optional(),
});

const technicalSchema = z.object({
  title: z.string().min(1), tipo: z.string().optional(), year: yearSchema, month: monthSchema,
  yearEnd: yearSchema.optional(), monthEnd: monthSchema, disponibilidad: z.string().optional(), institucion: z.string().optional(),
  institucionId: z.string().optional(), proyectoId: z.string().optional(), ciudad: z.string().optional(), idioma: z.string().optional(), paginas: z.string().optional(),
  contrato: z.string().optional(), duracion: z.string().optional(), valorContrato: z.string().regex(/^\d+$/).optional(), nombreComercial: z.string().optional(),
});

const idiomaSchema = z.object({
  language: z.string().min(1),
  level: z.string().optional(),
  read: z.string().optional(),
  write: z.string().optional(),
  speak: z.string().optional(),
  listen: z.string().optional(),
});

const lineaSchema = z.object({
  name: z.string().min(1),
  active: z.boolean().optional(),
  objective: z.string().optional(),
});

const demasTrabajoSchema = z.object({
  name: z.string().min(1),
  year: z.string().regex(/^\d{4}$/, 'año de 4 cifras'),
  month: z.string().optional(),
  idioma: z.string().optional(),
  medio: z.string().optional(),
  finalidad: z.string().optional(),
  ciudad: z.string().optional(),
});

export const SECTION_SCHEMAS: Record<CvLACSectionName, z.ZodType> = {
  formacion: educationSchema,
  formacionComple: educationSchema,
  experiencia: experienceSchema,
  cursos: courseSchema,
  reconocimientos: achievementSchema,
  proyectos: projectSchema,
  software: softwareSchema,
  eventos: eventoSchema,
  idiomas: idiomaSchema,
  lineas: lineaSchema,
  demasTrabajos: demasTrabajoSchema,
  articulos: articleSchema,
  jurados: jurySchema,
  tesis: thesisSchema,
  capitulos: chapterSchema,
  libros: bookSchema,
  informesTecnicos: technicalSchema,
  innovacionesProceso: technicalSchema,
  productosTecnologicos: technicalSchema,
  consultorias: technicalSchema,
  prototipos: technicalSchema,
};

export const portfolioExtraSchema = z.object({
  projects: z.array(projectSchema).default([]),
  software: z.array(softwareSchema).default([]),
  eventos: z.array(eventoSchema).default([]),
});

export type PortfolioExtra = z.infer<typeof portfolioExtraSchema>;

/** Renders zod issues as one line per bad field, for messages shown to the user. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ');
}
