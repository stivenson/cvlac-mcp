import { session } from '../browser/session.js';
import { URLS } from '../browser/navigation.js';
import { extractFormacion } from '../extractors/cvlac/formacion.js';
import { extractExperiencia } from '../extractors/cvlac/experiencia.js';
import { extractCursos } from '../extractors/cvlac/cursos.js';
import { extractReconocimientos } from '../extractors/cvlac/reconocimientos.js';
import { extractProyectos } from '../extractors/cvlac/proyectos.js';
import { extractSoftware } from '../extractors/cvlac/software.js';
import { extractEventos } from '../extractors/cvlac/eventos.js';
import { extractFormacionComple } from '../extractors/cvlac/formacion-comple.js';
import { extractIdiomas } from '../extractors/cvlac/idiomas.js';
import { extractLineas } from '../extractors/cvlac/lineas.js';
import { extractDemasTrabajos } from '../extractors/cvlac/demas-trabajos.js';
import { extractArticulos, extractCapitulos, extractJurados, extractLibros, extractTecnica, extractTesis } from '../extractors/cvlac/productos.js';
import type { CvLACData, CvLACSectionName } from '../types.js';

export async function readCvlacTool(
  section?: CvLACSectionName | 'all'
): Promise<Partial<CvLACData>> {
  await session.login();

  const page = await session.getPage();
  const target = section ?? 'all';
  const result: Partial<CvLACData> = {};

  if (target === 'formacion' || target === 'all') {
    result.formacion = await extractFormacion(page);
  }
  if (target === 'experiencia' || target === 'all') {
    result.experiencia = await extractExperiencia(page);
  }
  if (target === 'cursos' || target === 'all') {
    result.cursos = await extractCursos(page);
  }
  if (target === 'reconocimientos' || target === 'all') {
    result.reconocimientos = await extractReconocimientos(page);
  }
  if (target === 'proyectos' || target === 'all') {
    result.proyectos = await extractProyectos(page);
  }
  if (target === 'software' || target === 'all') {
    result.software = await extractSoftware(page);
  }
  if (target === 'eventos' || target === 'all') {
    result.eventos = await extractEventos(page);
  }
  if (target === 'formacionComple' || target === 'all') {
    result.formacionComple = await extractFormacionComple(page);
  }
  if (target === 'idiomas' || target === 'all') {
    result.idiomas = await extractIdiomas(page);
  }
  if (target === 'lineas' || target === 'all') {
    result.lineas = await extractLineas(page);
  }
  if (target === 'demasTrabajos' || target === 'all') {
    result.demasTrabajos = await extractDemasTrabajos(page);
  }
  if (target === 'articulos' || target === 'all') {
    result.articulos = await extractArticulos(page);
  }
  if (target === 'jurados' || target === 'all') result.jurados = await extractJurados(page);
  if (target === 'tesis' || target === 'all') result.tesis = await extractTesis(page);
  if (target === 'capitulos' || target === 'all') result.capitulos = await extractCapitulos(page);
  if (target === 'libros' || target === 'all') result.libros = await extractLibros(page);
  if (target === 'informesTecnicos' || target === 'all') result.informesTecnicos = await extractTecnica(page, 'informesTecnicos', URLS.informesTecnicos);
  if (target === 'innovacionesProceso' || target === 'all') result.innovacionesProceso = await extractTecnica(page, 'innovacionesProceso', URLS.innovacionesProceso);
  if (target === 'productosTecnologicos' || target === 'all') result.productosTecnologicos = await extractTecnica(page, 'productosTecnologicos', URLS.productosTecnologicos);
  if (target === 'consultorias' || target === 'all') result.consultorias = await extractTecnica(page, 'consultorias', URLS.consultorias);
  if (target === 'prototipos' || target === 'all') result.prototipos = await extractTecnica(page, 'prototipos', URLS.prototipos);

  await page.close();
  return result;
}
