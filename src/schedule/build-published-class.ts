import { filterBlocksForStudent } from '../blocks/visibility';
import type { Class, ClassHomepage, ScheduledLesson, Unit } from '../schemas';
import type { PublishedClass, PublishedClassScheduleRow } from '../student/published-class';

function normalizeHomepage(homepage: ClassHomepage | undefined): ClassHomepage {
  return {
    announcements: filterBlocksForStudent(homepage?.announcements ?? []),
    resources: filterBlocksForStudent(homepage?.resources ?? []),
    custom: filterBlocksForStudent(homepage?.custom ?? [])
  };
}

export function buildPublishedClass(input: {
  cls: Class;
  units: Unit[];
  lessons: Array<{ id: string; title: string }>;
  scheduled: ScheduledLesson[];
  publishedLessonIds: Set<string>;
}): PublishedClass {
  const { cls, units, lessons, scheduled, publishedLessonIds } = input;

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  const current_unit = cls.current_unit_id
    ? (() => {
        const unit = unitById.get(cls.current_unit_id);
        return unit ? { id: unit.id, title: unit.title } : undefined;
      })()
    : undefined;

  let current_lesson: PublishedClass['current_lesson'];
  if (cls.current_scheduled_lesson_id) {
    const row = scheduled.find((entry) => entry.id === cls.current_scheduled_lesson_id);
    if (row) {
      const lesson = lessonById.get(row.lesson_id);
      if (lesson) {
        current_lesson = {
          id: row.id,
          title: lesson.title,
          lesson_id: row.lesson_id
        };
      }
    }
  }

  const schedule: PublishedClassScheduleRow[] = [...scheduled]
    .sort((a, b) => a.schedule_order - b.schedule_order)
    .map((row) => {
      const lesson = lessonById.get(row.lesson_id);
      return {
        id: row.id,
        date: row.date,
        schedule_order: row.schedule_order,
        lesson_id: row.lesson_id,
        title: lesson?.title ?? row.lesson_id,
        published: publishedLessonIds.has(row.lesson_id)
      };
    });

  const active_units = cls.active_unit_ids
    .map((unitId) => {
      const unit = unitById.get(unitId);
      return unit ? { id: unit.id, title: unit.title } : null;
    })
    .filter((unit): unit is { id: string; title: string } => unit !== null);

  return {
    id: cls.id,
    code: cls.code,
    title: cls.title,
    ...(cls.display_name ? { display_name: cls.display_name } : {}),
    homepage: normalizeHomepage(cls.homepage),
    ...(current_unit ? { current_unit } : {}),
    ...(current_lesson ? { current_lesson } : {}),
    schedule,
    active_units
  };
}
