const PAGE_ID = /\s([0-9a-f]{32})$/i;

export interface NotionExportPageId {
  title: string;
  page_id: string;
  export_path: string;
}

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function decodeStem(stem: string): string {
  try {
    return decodeURIComponent(stem);
  } catch {
    return stem;
  }
}

export function parseNotionExportPath(path: string): NotionExportPageId {
  const export_path = normalizeZipPath(path);
  const base = export_path.split('/').pop() ?? export_path;
  const stem = decodeStem(base.replace(/\.md$/i, ''));
  const match = PAGE_ID.exec(stem);
  if (match) {
    const title = stem.slice(0, match.index).replace(/\s+/g, ' ').trim() || 'Untitled';
    return { title, page_id: match[1].toLowerCase(), export_path };
  }
  const title = stem.replace(/\s+/g, ' ').trim() || 'Untitled';
  return { title, page_id: `path:${export_path}`, export_path };
}
