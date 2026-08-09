import { describe, it, expect } from 'vitest';
import { parseEmbedInput, embedFrameSrc } from '@/blocks/embed-url';

describe('parseEmbedInput', () => {
  it('detects Google Slides and derives embed url', () => {
    const parsed = parseEmbedInput(
      'https://docs.google.com/presentation/d/abc123XYZ/edit#slide=id.p'
    );
    expect(parsed).toEqual({
      provider: 'google_slides',
      embed_url: 'https://docs.google.com/presentation/d/abc123XYZ/embed'
    });
  });

  it('detects Google Docs (no embed_url)', () => {
    expect(parseEmbedInput('https://docs.google.com/document/d/doc99/edit')).toEqual({
      provider: 'google_docs'
    });
  });

  it('detects Drive file as pdf', () => {
    expect(parseEmbedInput('https://drive.google.com/file/d/fileABC/view')).toEqual({
      provider: 'pdf'
    });
  });

  it('detects direct pdf urls', () => {
    expect(parseEmbedInput('https://cdn.example.com/notes/week1.pdf')).toEqual({
      provider: 'pdf'
    });
  });

  it('detects Google Maps place with coordinates', () => {
    const parsed = parseEmbedInput(
      'https://www.google.com/maps/place/Sydney/@-33.8688,151.2093,12z'
    );
    expect(parsed?.provider).toBe('google_maps');
    expect(parsed?.embed_url).toContain('output=embed');
    expect(parsed?.embed_url).toContain('-33.8688');
    expect(parsed?.embed_url).toContain('151.2093');
  });

  it('passes through existing maps embed urls', () => {
    const url = 'https://www.google.com/maps/embed?pb=hello';
    expect(parseEmbedInput(url)).toEqual({
      provider: 'google_maps',
      embed_url: url
    });
  });

  it('returns generic for unknown http urls', () => {
    expect(parseEmbedInput('https://example.com/page')).toEqual({
      provider: 'generic'
    });
  });

  it('returns null for empty or non-http', () => {
    expect(parseEmbedInput('')).toBeNull();
    expect(parseEmbedInput('javascript:alert(1)')).toBeNull();
  });
});

describe('embedFrameSrc', () => {
  it('uses embed_url when present', () => {
    expect(
      embedFrameSrc({
        url: 'https://docs.google.com/presentation/d/abc/edit',
        provider: 'google_slides',
        embed_url: 'https://docs.google.com/presentation/d/abc/embed'
      })
    ).toBe('https://docs.google.com/presentation/d/abc/embed');
  });

  it('returns null for card-first providers', () => {
    expect(
      embedFrameSrc({ url: 'https://docs.google.com/document/d/x/edit', provider: 'google_docs' })
    ).toBeNull();
    expect(embedFrameSrc({ url: 'https://x.com/a.pdf', provider: 'pdf' })).toBeNull();
  });

  it('falls back to url for generic', () => {
    expect(embedFrameSrc({ url: 'https://example.com', provider: 'generic' })).toBe(
      'https://example.com'
    );
  });
});
