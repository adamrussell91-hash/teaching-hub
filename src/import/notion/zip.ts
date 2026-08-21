import { unzipSync } from 'fflate';
import { parseNotionExportPath, type NotionExportPageId } from './filename';

export interface NotionZipPage extends NotionExportPageId {
  markdown: string;
}

export interface NotionZipContents {
  pages: NotionZipPage[];
  files: Map<string, Uint8Array>;
}

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function shouldSkipEntry(path: string): boolean {
  const normalized = normalizeZipPath(path);
  if (normalized.endsWith('/')) return true;
  if (normalized.startsWith('__MACOSX/')) return true;
  if (normalized.split('/').some((part) => part === '.DS_Store')) return true;
  return false;
}

export function readNotionZip(bytes: Uint8Array): NotionZipContents {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch {
    throw new Error('Could not read that zip');
  }

  const files = new Map<string, Uint8Array>();
  for (const [rawPath, data] of Object.entries(unzipped)) {
    const path = normalizeZipPath(rawPath);
    if (shouldSkipEntry(path)) continue;
    files.set(path, data);
  }

  const pages: NotionZipPage[] = [];
  for (const [path, data] of files) {
    if (!path.toLowerCase().endsWith('.md')) continue;
    pages.push({
      ...parseNotionExportPath(path),
      markdown: new TextDecoder().decode(data)
    });
  }

  pages.sort((a, b) => a.export_path.localeCompare(b.export_path));
  return { pages, files };
}

export function readZipEntry(
  files: Map<string, Uint8Array>,
  fromPagePath: string,
  relative: string
): { path: string; bytes: Uint8Array } | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(relative);
    } catch {
      return relative;
    }
  })();
  const dir = fromPagePath.includes('/') ? fromPagePath.slice(0, fromPagePath.lastIndexOf('/')) : '';
  const candidates = [relative, decoded, `${dir}/${relative}`, `${dir}/${decoded}`]
    .map((path) => normalizeZipPath(path).replace(/\/+/g, '/'))
    .filter(Boolean);
  for (const path of candidates) {
    const bytes = files.get(path);
    if (bytes) return { path, bytes };
  }
  return null;
}
