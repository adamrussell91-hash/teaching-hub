import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { readNotionZip, readZipEntry } from '@/import/notion/zip';

const HASH = '1a2b3c4d5e6f7890abcd1234ef567890';

function zipBytes(entries: Record<string, string | Uint8Array>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();
  for (const [path, value] of Object.entries(entries)) {
    encoded[path] = typeof value === 'string' ? encoder.encode(value) : value;
  }
  return zipSync(encoded);
}

describe('readNotionZip', () => {
  it('lists nested markdown pages and skips csv plus mac junk', () => {
    const bytes = zipBytes({
      [`Year 12/Themes ${HASH}.md`]: '# Themes\n',
      [`Year 12/Themes ${HASH}/Notes abcdefabcdefabcdefabcdefabcdefab.md`]: 'Nested',
      'Year 12/Tracker.csv': 'Name,Status\n',
      '__MACOSX/._Themes.md': 'junk',
      'Year 12/.DS_Store': 'junk'
    });

    const { pages } = readNotionZip(bytes);
    expect(pages.map((page) => page.title)).toEqual(['Themes', 'Notes']);
    expect(pages.every((page) => page.markdown.length > 0)).toBe(true);
  });

  it('reads image bytes relative to the page path', () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const bytes = zipBytes({
      [`Memory ${HASH}.md`]: '![x](Memory%20page/photo.png)',
      'Memory page/photo.png': png
    });
    const { files } = readNotionZip(bytes);
    const found = readZipEntry(files, `Memory ${HASH}.md`, 'Memory%20page/photo.png');
    expect(found?.bytes).toEqual(png);
  });

  it('throws on invalid zip bytes', () => {
    expect(() => readNotionZip(new Uint8Array([1, 2, 3, 4]))).toThrow(/Could not read that zip/);
  });
});
