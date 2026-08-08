export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'item'
  );
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultScopeTerms(weekCount = 40) {
  const termWeeks = weekCount / 4;
  return [1, 2, 3, 4].map((term_number) => {
    const start_week = (term_number - 1) * termWeeks + 1;
    const end_week = term_number * termWeeks;
    return {
      id: `term_t${term_number}`,
      title: `Term ${term_number}`,
      term_number,
      start_week,
      end_week
    };
  });
}
