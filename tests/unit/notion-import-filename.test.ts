import { describe, expect, it } from 'vitest';
import { parseNotionExportPath } from '@/import/notion/filename';

const HASH = '1a2b3c4d5e6f7890abcd1234ef567890';

describe('parseNotionExportPath', () => {
  it('reads title and 32-char Notion id from the filename', () => {
    expect(parseNotionExportPath(`Memory and Identity ${HASH}.md`)).toEqual({
      title: 'Memory and Identity',
      page_id: HASH,
      export_path: `Memory and Identity ${HASH}.md`
    });
  });

  it('keeps nested zip paths and normalises slashes', () => {
    const parsed = parseNotionExportPath(`Year 12\\Unit\\Themes ${HASH}.md`);
    expect(parsed.title).toBe('Themes');
    expect(parsed.page_id).toBe(HASH);
    expect(parsed.export_path).toBe(`Year 12/Unit/Themes ${HASH}.md`);
  });

  it('uses a path-based id when the filename has no hash', () => {
    expect(parseNotionExportPath('notes/Intro.md')).toEqual({
      title: 'Intro',
      page_id: 'path:notes/Intro.md',
      export_path: 'notes/Intro.md'
    });
  });

  it('decodes URI-encoded filenames', () => {
    expect(parseNotionExportPath(`Memory%20and%20Identity%20${HASH}.md`).title).toBe(
      'Memory and Identity'
    );
  });
});
