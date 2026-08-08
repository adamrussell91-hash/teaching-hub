import { apiGet } from '@/api/client';
import type { Block } from '@/schemas';

export interface PublishedClassScheduleRow {
  id: string;
  date: string;
  schedule_order: number;
  lesson_id: string;
  title: string;
  published: boolean;
}

export interface PublishedClass {
  id: string;
  code: string;
  title: string;
  display_name?: string;
  homepage: {
    announcements: Block[];
    resources: Block[];
    custom: Block[];
  };
  current_unit?: { id: string; title: string };
  current_lesson?: { id: string; title: string; lesson_id: string };
  schedule: PublishedClassScheduleRow[];
  active_units: Array<{ id: string; title: string }>;
}

export function fetchPublishedClass(classId: string): Promise<PublishedClass> {
  return apiGet(`/api/published/classes/${classId}`);
}
