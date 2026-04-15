import { describe, it, expect } from 'vitest';
import { normalizePortfolioData } from '../src/extractors/portfolio.js';

describe('normalizePortfolioData', () => {
  it('extracts education items from raw JS bundle text', () => {
    const fakeBundle = `
      {institution:"Universidad de los Andes",degree:"Maestría en Inteligencia Artificial",period:"Febrero 2024 - Actualidad",description:"Enfoque en IA"}
      {institution:"Universidad Simón Bolívar",degree:"Ingeniería de Sistemas",period:"Agosto 2009 - Julio 2014",description:"Exaltación"}
    `;
    const result = normalizePortfolioData(fakeBundle);
    expect(result.education).toHaveLength(2);
    expect(result.education[0].institution).toBe('Universidad de los Andes');
    expect(result.education[0].degree).toBe('Maestría en Inteligencia Artificial');
  });

  it('extracts experience items from raw JS bundle text', () => {
    const fakeBundle = `
      {company:"Mo Technologies (Mastercard - Start Path)",role:"Full Stack - Senior Developer",period:"Marzo 2021 - Julio 2025",modality:"semi-presencial",description:["Desarrollo de productos bancarios"],technologies:["Python"]}
    `;
    const result = normalizePortfolioData(fakeBundle);
    expect(result.experience).toHaveLength(1);
    expect(result.experience[0].company).toBe('Mo Technologies (Mastercard - Start Path)');
    expect(result.experience[0].role).toBe('Full Stack - Senior Developer');
  });

  it('extracts course items with name and date', () => {
    const fakeBundle = `
      {name:"Taller Planeación y Optimización: El Área Transversal de la Inteligencia Artificial (Universidad Simón Bolívar)",emoji:"📋",color:"#1976D2",date:"2025-11",type:"taller"}
      {name:"Curso Práctico de Cloud Computing con AWS (Platzi) - Aprobado abril 2021",emoji:"📚",color:"#7CB342",date:"2021-04",type:"curso"}
    `;
    const result = normalizePortfolioData(fakeBundle);
    expect(result.courses).toHaveLength(2);
    expect(result.courses[0].date).toBe('2025-11');
    expect(result.courses[0].type).toBe('taller');
  });

  it('extracts achievements with description longer than 30 chars', () => {
    const fakeBundle = `
      {title:"Exaltación Académica",description:"Ingeniero de Sistemas con mención por trabajo social en Gramalote"}
    `;
    const result = normalizePortfolioData(fakeBundle);
    expect(result.achievements).toHaveLength(1);
    expect(result.achievements[0].title).toBe('Exaltación Académica');
  });

  it('extracts skills arrays', () => {
    const fakeBundle = `languages:["Python","JavaScript","TypeScript"] frontend:["React","AngularJS"] ai:["LLMs","LangChain"] cloud:["AWS","GCP"] devops:["Docker","Kubernetes"] databases:["PostgreSQL","MySQL"]`;
    const result = normalizePortfolioData(fakeBundle);
    expect(result.skills.languages).toContain('Python');
    expect(result.skills.frontend).toContain('React');
    expect(result.skills.ai).toContain('LLMs');
  });
});
