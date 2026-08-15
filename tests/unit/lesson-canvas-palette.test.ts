import { describe, expect, it } from 'vitest';
import { LESSON_BLOCK_GROUPS } from '@/blocks/create-block';
import {
  INSERT_MENU_DESCRIPTION,
  blockIconSrc,
  lessonPaletteFamilies
} from '@/teacher/lesson-canvas/palette-catalog';

describe('lesson palette catalog', () => {
  it('uses lesson groups, omits collection, and describes every card', () => {
    const families = lessonPaletteFamilies([]);
    expect(families.map((f) => f.id)).toEqual([
      'Basic',
      'Media',
      'Teaching',
      'Learning',
      'Visualisation',
      'Layout',
      'Compositions'
    ]);
    expect(families.find((f) => f.id === 'Layout')?.cards.some((c) => c.kind === 'block' && c.type === 'collection')).toBe(
      false
    );
    for (const group of LESSON_BLOCK_GROUPS) {
      for (const type of group.types) {
        if (type === 'collection') continue;
        expect(INSERT_MENU_DESCRIPTION[type].length).toBeGreaterThan(8);
      }
    }
    expect(blockIconSrc('concept_map')).toBe('/assets/blocks/concept_map.svg');
    expect(blockIconSrc('embed:pdf')).toBe('/assets/blocks/embed-pdf.svg');
  });

  it('hides compositions family when the list is empty', () => {
    const empty = lessonPaletteFamilies([]);
    expect(empty.find((f) => f.id === 'Compositions')?.disabled).toBe(true);
    const withOne = lessonPaletteFamilies([{ id: 'comp_1', title: 'Hook' }]);
    expect(withOne.find((f) => f.id === 'Compositions')?.disabled).toBe(false);
    expect(withOne.find((f) => f.id === 'Compositions')?.cards[0]).toMatchObject({
      kind: 'composition',
      id: 'comp_1',
      title: 'Hook'
    });
  });
});
