export function formatStudentDate(iso: string): string {
  const trimmed = iso.trim();
  if (!trimmed) return '';
  const [year, month, day] = trimmed.split('-').map(Number);
  if (!year || !month || !day) return trimmed;
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
