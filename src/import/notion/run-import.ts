import { createBlock } from '@/blocks/create-block';
import { nextBlockIdFactory } from '@/teacher/lesson-canvas/drop';
import { ApiClientError } from '@/api/client';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import { markdownToBlocks } from './markdown-to-blocks';
import { readNotionZip, readZipEntry } from './zip';

function missingImage(id: string, label: string): Block {
  const block = createBlock('rich_text', id);
  if (block.block_type !== 'rich_text') return block;
  block.content.html = `<p>Missing image: ${label}</p>`;
  return block;
}

export interface NotionImportDeps {
  postLesson: (body: { title: string; unit_id: string }) => Promise<Lesson>;
  getLesson: (id: string) => Promise<Lesson>;
  putLesson: (lesson: Lesson) => Promise<Lesson>;
  uploadImage: (file: File) => Promise<{ url: string }>;
}

export interface NotionImportExisting {
  id: string;
  unit_id: string;
  origin?: Lesson['origin'];
}

export interface NotionImportResult {
  imported: number;
  updated: number;
  failed: number;
  errors: string[];
}

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif'
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function mimeForPath(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_MIME[ext] ?? null;
}

function fileName(path: string): string {
  return path.split('/').pop() || 'image';
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'unauthorized';
}

async function resolveImages(
  blocks: Block[],
  pagePath: string,
  files: Map<string, Uint8Array>,
  cache: Map<string, string>,
  uploadImage: NotionImportDeps['uploadImage']
): Promise<Block[]> {
  const out: Block[] = [];
  for (const block of blocks) {
    if (block.block_type !== 'image') {
      out.push(block);
      continue;
    }
    const src = block.content.url;
    if (!src || isHttpUrl(src)) {
      out.push(block);
      continue;
    }
    const found = readZipEntry(files, pagePath, src);
    const mime = found ? mimeForPath(found.path) : null;
    if (!found || !mime) {
      out.push(missingImage(block.id, block.content.alt_text || src));
      continue;
    }
    try {
      let url = cache.get(found.path);
      if (!url) {
        const blob = new Blob([found.bytes as BlobPart], { type: mime });
        const file = new File([blob], fileName(found.path), { type: mime });
        url = (await uploadImage(file)).url;
        cache.set(found.path, url);
      }
      out.push({
        ...block,
        content: { ...block.content, url, alt_text: block.content.alt_text || fileName(found.path) }
      });
    } catch {
      out.push(missingImage(block.id, block.content.alt_text || src));
    }
  }
  return out;
}

export async function runNotionImport(options: {
  zipBytes: Uint8Array;
  unitId: string;
  existing: NotionImportExisting[];
  deps: NotionImportDeps;
  onProgress?: (done: number, total: number) => void;
}): Promise<NotionImportResult> {
  const { pages, files } = readNotionZip(options.zipBytes);
  const result: NotionImportResult = { imported: 0, updated: 0, failed: 0, errors: [] };
  if (pages.length === 0) return result;

  const cache = new Map<string, string>();
  let done = 0;

  for (const page of pages) {
    try {
      const nextId = nextBlockIdFactory(`block_${page.page_id.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'notion'}`, []);
      const mapped = markdownToBlocks(page.markdown, { title: page.title, nextId });
      const blocks = await resolveImages(mapped, page.export_path, files, cache, options.deps.uploadImage);
      const origin = {
        source: 'notion_export' as const,
        page_id: page.page_id,
        export_path: page.export_path
      };
      const match = options.existing.find(
        (lesson) => lesson.unit_id === options.unitId && lesson.origin?.page_id === page.page_id
      );

      if (match) {
        const current = await options.deps.getLesson(match.id);
        const updated = await options.deps.putLesson({
          ...current,
          title: page.title,
          blocks,
          origin,
          updated_at: new Date().toISOString()
        });
        match.origin = updated.origin;
        result.updated += 1;
      } else {
        const created = await options.deps.postLesson({
          title: page.title,
          unit_id: options.unitId
        });
        const written = await options.deps.putLesson({
          ...created,
          title: page.title,
          blocks,
          origin,
          updated_at: new Date().toISOString()
        });
        options.existing.push({
          id: written.id,
          unit_id: written.unit_id,
          origin: written.origin
        });
        result.imported += 1;
      }
    } catch (error) {
      if (isUnauthorized(error)) throw error;
      result.failed += 1;
      result.errors.push(`${page.title}: ${error instanceof Error ? error.message : 'import failed'}`);
    }
    done += 1;
    options.onProgress?.(done, pages.length);
  }

  return result;
}
