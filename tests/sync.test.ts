import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DiffResult, UpdateRequest, UpdateResult } from '../src/types.js';

const diffTool = vi.fn<() => Promise<DiffResult>>();
const updateSectionTool = vi.fn<(req: UpdateRequest) => Promise<UpdateResult>>();

vi.mock('../src/tools/diff.js', () => ({ diffTool: () => diffTool() }));
vi.mock('../src/tools/update-section.js', () => ({
  updateSectionTool: (req: UpdateRequest) => updateSectionTool(req),
}));

const { syncTool } = await import('../src/tools/sync.js');

const emptyDiff: DiffResult = { missing: [], toUpdate: [], similar: [], upToDate: [] };

function diff(overrides: Partial<DiffResult> = {}): DiffResult {
  return { ...emptyDiff, ...overrides };
}

const okResult: UpdateResult = { success: true, status: 'ok', message: 'Added' };

beforeEach(() => {
  diffTool.mockReset();
  updateSectionTool.mockReset();
  updateSectionTool.mockResolvedValue(okResult);
});

describe('syncTool dry run', () => {
  it('writes nothing and says so', async () => {
    diffTool.mockResolvedValue(
      diff({ missing: [{ section: 'cursos', action: 'add', label: 'Curso A', data: {} }] })
    );
    const result = await syncTool({ dryRun: true });
    expect(updateSectionTool).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.report).toContain('Dry run');
  });

  it('reports the four buckets with their counts', async () => {
    diffTool.mockResolvedValue(
      diff({
        missing: [{ section: 'cursos', action: 'add', label: 'Curso A', data: {} }],
        toUpdate: [
          { section: 'formacion', action: 'update', label: 'Grado B', data: {}, matchedLabel: 'Grado B viejo' },
        ],
        similar: [
          {
            section: 'reconocimientos',
            action: 'add',
            label: 'Mención C',
            data: {},
            candidates: [{ label: 'Mención C bis', matchType: 'similar' }],
          },
        ],
        upToDate: [{ section: 'software', action: 'add', label: 'App D', data: {} }],
      })
    );
    const { report } = await syncTool({ dryRun: true });
    expect(report).toContain('**Faltantes (1):**');
    expect(report).toContain('**A actualizar (1):**');
    expect(report).toContain('Requieren decisión — parecidos a ítems ya existentes (1)');
    expect(report).toContain('**Al día (1):**');
    expect(report).toContain('ya en CvLAC: Mención C bis');
    expect(report).toContain('en CvLAC: Grado B viejo');
  });

  it('returns the similar items so a caller can drive the decisions', async () => {
    const similar = [
      {
        section: 'cursos' as const,
        action: 'add' as const,
        label: 'Curso A',
        data: {},
        candidates: [{ label: 'Curso A bis', matchType: 'similar' as const }],
      },
    ];
    diffTool.mockResolvedValue(diff({ similar }));
    const result = await syncTool({ dryRun: true });
    expect(result.needsConfirmation).toEqual(similar);
  });
});

describe('syncTool applying', () => {
  it('applies missing and toUpdate, and never the similar ones', async () => {
    diffTool.mockResolvedValue(
      diff({
        missing: [{ section: 'cursos', action: 'add', label: 'Curso A', data: { name: 'A' } }],
        toUpdate: [{ section: 'formacion', action: 'update', label: 'Grado B', data: { degree: 'B' } }],
        similar: [
          {
            section: 'reconocimientos',
            action: 'add',
            label: 'Mención C',
            data: {},
            candidates: [{ label: 'Mención C bis', matchType: 'similar' }],
          },
        ],
      })
    );
    const result = await syncTool();
    expect(updateSectionTool).toHaveBeenCalledTimes(2);
    const sections = updateSectionTool.mock.calls.map(([req]) => req.section);
    expect(sections).toEqual(['cursos', 'formacion']);
    expect(result.applied).toBe(2);
    expect(result.needsConfirmation).toHaveLength(1);
  });

  it('always passes confirmDuplicate:false as a second line of defence', async () => {
    diffTool.mockResolvedValue(
      diff({ missing: [{ section: 'cursos', action: 'add', label: 'Curso A', data: {} }] })
    );
    await syncTool();
    expect(updateSectionTool.mock.calls[0][0].confirmDuplicate).toBe(false);
  });

  it('moves an item to needsConfirmation when update_section blocks the write', async () => {
    diffTool.mockResolvedValue(
      diff({ missing: [{ section: 'cursos', action: 'add', label: 'Curso A', data: {} }] })
    );
    updateSectionTool.mockResolvedValue({
      success: false,
      status: 'needs_confirmation',
      message: 'ya existe algo parecido',
      similar: [{ label: 'Curso A bis', matchType: 'similar' }],
    });
    const result = await syncTool();
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.needsConfirmation).toHaveLength(1);
    expect(result.needsConfirmation[0].candidates).toEqual([
      { label: 'Curso A bis', matchType: 'similar' },
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.report).toContain('requiere decisión');
  });

  it('keeps going after a failure and collects the reason', async () => {
    diffTool.mockResolvedValue(
      diff({
        missing: [
          { section: 'cursos', action: 'add', label: 'Curso A', data: {} },
          { section: 'cursos', action: 'add', label: 'Curso B', data: {} },
        ],
      })
    );
    updateSectionTool
      .mockResolvedValueOnce({
        success: false,
        status: 'failed',
        message: 'Form validation failed: falta el año',
        warnings: ['nro_ano_presenta: sin valor'],
      })
      .mockResolvedValueOnce(okResult);
    const result = await syncTool();
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toContain('falta el año');
    expect(result.errors[0]).toContain('nro_ano_presenta');
  });

  it('surfaces warnings from a successful write', async () => {
    diffTool.mockResolvedValue(
      diff({ missing: [{ section: 'cursos', action: 'add', label: 'Curso A', data: {} }] })
    );
    updateSectionTool.mockResolvedValue({
      success: true,
      status: 'ok',
      message: 'Added',
      warnings: ['sgl_idioma: sin valor'],
    });
    const { report } = await syncTool();
    expect(report).toContain('avisos: sgl_idioma: sin valor');
  });
});

describe('syncTool section filter', () => {
  it('limits both the report and the writes to the requested sections', async () => {
    diffTool.mockResolvedValue(
      diff({
        missing: [
          { section: 'cursos', action: 'add', label: 'Curso A', data: {} },
          { section: 'software', action: 'add', label: 'App B', data: {} },
        ],
      })
    );
    const result = await syncTool({ sections: ['cursos'] });
    expect(updateSectionTool).toHaveBeenCalledTimes(1);
    expect(updateSectionTool.mock.calls[0][0].section).toBe('cursos');
    expect(result.report).toContain('Secciones: cursos');
    expect(result.report).not.toContain('App B');
  });

  it('treats an empty section list as no filter', async () => {
    diffTool.mockResolvedValue(
      diff({ missing: [{ section: 'cursos', action: 'add', label: 'Curso A', data: {} }] })
    );
    await syncTool({ sections: [] });
    expect(updateSectionTool).toHaveBeenCalledTimes(1);
  });
});
