import {
  yearKey,
  subjectKey,
  unitKey,
  draftLessonKey
} from '../src/storage/keys';

export type SeedData = {
  years: unknown[];
  subjects: unknown[];
  units: unknown[];
  lessons: unknown[];
};

export class MockStore {
  private readonly blobs = new Map<string, string>();

  get(key: string): string | undefined {
    return this.blobs.get(key);
  }

  set(key: string, value: string): void {
    this.blobs.set(key, value);
  }

  delete(key: string): boolean {
    return this.blobs.delete(key);
  }

  getJSON<T = unknown>(key: string): T | undefined {
    const raw = this.get(key);
    if (raw === undefined) {
      return undefined;
    }
    return JSON.parse(raw) as T;
  }

  setJSON(key: string, value: unknown): void {
    this.set(key, JSON.stringify(value));
  }

  listKeys(prefix = ''): string[] {
    return [...this.blobs.keys()].filter((key) => key.startsWith(prefix));
  }

  loadSeed(seed: SeedData): void {
    for (const year of seed.years) {
      const id = (year as { id: string }).id;
      this.setJSON(yearKey(id), year);
    }

    for (const subject of seed.subjects) {
      const id = (subject as { id: string }).id;
      this.setJSON(subjectKey(id), subject);
    }

    for (const unit of seed.units) {
      const id = (unit as { id: string }).id;
      this.setJSON(unitKey(id), unit);
    }

    for (const lesson of seed.lessons) {
      const id = (lesson as { id: string }).id;
      this.setJSON(draftLessonKey(id), lesson);
    }
  }
}
