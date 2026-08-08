import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  yearKey,
  subjectKey,
  unitKey,
  draftLessonKey,
  publishedLessonKey,
  homeScheduleKey
} from '@/storage/keys';
import { MockStore } from '../../scripts/mock-store';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
);

describe('storage key helpers', () => {
  it('builds draft lesson keys', () => {
    expect(draftLessonKey('lesson_aotfw_008')).toBe(
      'lessons/lesson_aotfw_008'
    );
  });

  it('builds published lesson keys', () => {
    expect(publishedLessonKey('lesson_aotfw_008')).toBe(
      'published/lessons/lesson_aotfw_008'
    );
  });

  it('builds curriculum entity keys', () => {
    expect(yearKey('year_12')).toBe('years/year_12');
    expect(subjectKey('subject_y12_engadv')).toBe(
      'subjects/subject_y12_engadv'
    );
    expect(unitKey('unit_aotfw')).toBe('units/unit_aotfw');
  });

  it('builds home schedule meta key', () => {
    expect(homeScheduleKey()).toBe('meta/home_schedule');
  });
});

describe('MockStore', () => {
  let store: MockStore;

  beforeEach(() => {
    store = new MockStore();
  });

  it('get/set/delete string values', () => {
    store.set('foo', '{"a":1}');
    expect(store.get('foo')).toBe('{"a":1}');
    expect(store.delete('foo')).toBe(true);
    expect(store.get('foo')).toBeUndefined();
    expect(store.delete('foo')).toBe(false);
  });

  it('getJSON/setJSON round-trips objects', () => {
    store.setJSON('years/year_12', { id: 'year_12', title: 'Year 12' });
    expect(store.getJSON('years/year_12')).toEqual({
      id: 'year_12',
      title: 'Year 12'
    });
  });

  it('loadSeed writes curriculum and lessons to draft keys', () => {
    store.loadSeed(seed);

    expect(store.getJSON(yearKey('year_12'))).toMatchObject({
      id: 'year_12'
    });
    expect(store.getJSON(subjectKey('subject_y12_engadv'))).toMatchObject({
      id: 'subject_y12_engadv'
    });
    expect(store.getJSON(unitKey('unit_aotfw'))).toMatchObject({
      id: 'unit_aotfw'
    });
    expect(store.getJSON(draftLessonKey('lesson_aotfw_008'))).toMatchObject({
      id: 'lesson_aotfw_008'
    });
  });

  it('keeps draft and published lesson keys distinct', () => {
    store.loadSeed(seed);

    const draftKey = draftLessonKey('lesson_aotfw_008');
    const publishedKey = publishedLessonKey('lesson_aotfw_008');

    expect(store.get(publishedKey)).toBeUndefined();

    store.setJSON(draftKey, {
      ...(store.getJSON(draftKey) as object),
      title: 'Updated draft title'
    });

    expect(store.getJSON(draftKey)).toMatchObject({
      title: 'Updated draft title'
    });
    expect(store.get(publishedKey)).toBeUndefined();
  });
});
