import { describe, it, expect } from 'vitest';
import { SECTION_NAMES } from '../src/types.js';
import { SECTION_SCHEMAS } from '../src/schemas.js';
import { SECTION_LIST } from '../src/browser/navigation.js';

describe('section registry', () => {
  it('has a schema and a list page for every section name', () => {
    for (const name of SECTION_NAMES) {
      expect(SECTION_SCHEMAS[name], name).toBeDefined();
      expect(SECTION_LIST[name], name).toBeDefined();
    }
    expect(Object.keys(SECTION_SCHEMAS).sort()).toEqual([...SECTION_NAMES].sort());
  });
});
