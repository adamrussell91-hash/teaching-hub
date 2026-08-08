import { describe, it, expect } from 'vitest';
import { MediaSchema } from '@/schemas/media';

const sample = {
  id: 'media_ono_extract',
  type: 'media' as const,
  title: 'Ono Extract',
  slug: 'ono_extract',
  provider: 'external' as const,
  media_type: 'pdf' as const,
  mime_type: 'application/pdf',
  file_name: 'ono-extract.pdf',
  preview_url: 'https://example.com/ono-extract.pdf',
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1 as const
};

describe('MediaSchema', () => {
  it('accepts a valid media record', () => {
    expect(MediaSchema.parse(sample).id).toBe('media_ono_extract');
  });

  it('rejects invalid provider', () => {
    expect(() => MediaSchema.parse({ ...sample, provider: 'dropbox' })).toThrow();
  });

  it('rejects invalid media_type', () => {
    expect(() => MediaSchema.parse({ ...sample, media_type: 'audio' })).toThrow();
  });
});
