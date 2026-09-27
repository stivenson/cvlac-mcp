import type { SectionConfig } from '../form-kit.js';
import { articulosSection } from './articulo.js';
import { juradosSection } from './jurado.js';
import { tesisSection } from './tesis.js';
import { capitulosSection } from './capitulo.js';
import { librosSection } from './libro.js';
import { TECNICA_SECTIONS } from './tecnica.js';

export const PRODUCT_SECTIONS = {
  articulos: articulosSection,
  jurados: juradosSection,
  tesis: tesisSection,
  capitulos: capitulosSection,
  libros: librosSection,
  ...TECNICA_SECTIONS,
} satisfies Record<string, SectionConfig>;
