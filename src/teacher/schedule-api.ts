import { apiPost } from '@/api/client';
import type { Class, ScheduledLesson } from '@/schemas';

export function postScheduleUnit(
  classId: string,
  body: { unit_id: string; start_date: string; meeting_days?: number[] }
): Promise<{ class: Class; scheduled_lessons: ScheduledLesson[] }> {
  return apiPost(`/api/classes/${classId}/schedule-unit`, body);
}
