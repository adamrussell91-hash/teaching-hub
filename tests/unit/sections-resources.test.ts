import { describe, it, expect, beforeEach } from 'vitest';
import { openUrlForMedia, renderResourcesIndex } from '@/teacher/sections/resources';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Media } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

const baseMedia: Omit<Media, 'id' | 'title' | 'slug' | 'preview_url' | 'download_url'> = {
  type: 'media',
  provider: 'external',
  media_type: 'pdf',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const mediaWithPreview: Media = {
  ...baseMedia,
  id: 'media_ono_extract',
  title: 'AoTFW Extract',
  slug: 'aotfw_extract',
  preview_url: 'https://example.com/ono-extract.pdf'
};

const mediaWithoutUrl: Media = {
  ...baseMedia,
  id: 'media_no_url',
  title: 'Zebra Notes',
  slug: 'zebra_notes',
  media_type: 'other'
};

const mediaArchived: Media = {
  ...baseMedia,
  id: 'media_archived',
  title: 'Archived Item',
  slug: 'archived_item',
  status: 'archived',
  preview_url: 'https://example.com/archived.pdf'
};

const curriculum: CurriculumResponse = {
  years: [],
  subjects: [],
  units: [],
  lessons: [],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [mediaWithoutUrl, mediaWithPreview, mediaArchived],
  schedule_anchor_date: '2026-08-12'
};

describe('resources section', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    canvas = document.createElement('div');
  });

  it('prefers preview_url over download_url', () => {
    const media: Media = {
      ...baseMedia,
      id: 'media_both',
      title: 'Both URLs',
      slug: 'both_urls',
      preview_url: 'https://example.com/preview.pdf',
      download_url: 'https://example.com/download.pdf'
    };
    expect(openUrlForMedia(media)).toBe('https://example.com/preview.pdf');
  });

  it('falls back to download_url when preview_url is absent', () => {
    const media: Media = {
      ...baseMedia,
      id: 'media_download',
      title: 'Download Only',
      slug: 'download_only',
      download_url: 'https://example.com/download.pdf'
    };
    expect(openUrlForMedia(media)).toBe('https://example.com/download.pdf');
  });

  it('returns undefined when no URL is present', () => {
    expect(openUrlForMedia(mediaWithoutUrl)).toBeUndefined();
  });

  it('returns undefined for non-http URLs', () => {
    const media: Media = {
      ...baseMedia,
      id: 'media_bad',
      title: 'Bad Link',
      slug: 'bad_link',
      preview_url: 'javascript:alert(1)'
    };
    expect(openUrlForMedia(media)).toBeUndefined();
  });

  it('lists active media titles sorted and Open when URL present', () => {
    renderResourcesIndex(canvas, curriculum);

    expect(canvas.querySelector('.home-heading')?.textContent).toBe('Resource Library');

    const titles = [...canvas.querySelectorAll('.lesson-list__title')].map(
      (node) => node.textContent
    );
    expect(titles).toEqual(['AoTFW Extract', 'Zebra Notes']);

    const openLinks = canvas.querySelectorAll<HTMLAnchorElement>('.lesson-list__open');
    expect(openLinks).toHaveLength(1);
    expect(openLinks[0]?.getAttribute('href')).toBe('https://example.com/ono-extract.pdf');
    expect(openLinks[0]?.target).toBe('_blank');
    expect(openLinks[0]?.rel).toBe('noopener noreferrer');
    expect(openLinks[0]?.textContent).toBe('Open');

    const meta = canvas.querySelector('.lesson-list__meta');
    expect(meta?.textContent).toBe('pdf · external');
  });

  it('shows empty copy when no active media', () => {
    renderResourcesIndex(canvas, { ...curriculum, media: [] });
    expect(canvas.textContent).toContain('No resources yet.');
  });
});
