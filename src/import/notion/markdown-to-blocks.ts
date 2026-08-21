import { createBlock } from '@/blocks/create-block';
import { CalloutStyleSchema, type Block } from '@/schemas/block';
import type { z } from 'zod';

type CalloutStyle = z.infer<typeof CalloutStyleSchema>;

export interface MarkdownToBlocksOptions {
  title: string;
  nextId: () => string;
}

const CALLOUT_CUES: Array<{ cue: RegExp; style: CalloutStyle }> = [
  { cue: /^[💡ℹ️ℹ]/u, style: 'information' },
  { cue: /^[⚠️⚠]/u, style: 'warning' },
  { cue: /^[❗‼️]/u, style: 'important' },
  { cue: /^[📝📌]/u, style: 'remember' },
  { cue: /^[✨]/u, style: 'extension' },
  { cue: /^[🧱]/u, style: 'scaffold' },
  { cue: /^[👀]/u, style: 'example' }
];

const IMAGE_LINE = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*$/;
const LIST_LINE = /^\s*(?:[-*+]|\d+\.)\s+(.+)$/;
const DIVIDER_LINE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_SEP = /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function inlineToHtml(text: string): string {
  const escaped = escapeHtml(text);
  const parts: string[] = [];
  const token =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|((?<!\*)\*[^*]+\*(?!\*))|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(escaped))) {
    parts.push(escaped.slice(last, match.index));
    const [full, code, strong, em, link] = match;
    if (code) parts.push(`<code>${code.slice(1, -1)}</code>`);
    else if (strong) parts.push(`<strong>${strong.slice(2, -2)}</strong>`);
    else if (em) parts.push(`<em>${em.slice(1, -1)}</em>`);
    else if (link) {
      const inner = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(link);
      parts.push(inner ? `<a href="${inner[2]}">${inner[1]}</a>` : full);
    }
    last = match.index + full.length;
  }
  parts.push(escaped.slice(last));
  return parts.join('');
}

function headingVariant(hashes: string): 'page' | 'section' | 'subsection' {
  if (hashes.length <= 1) return 'page';
  if (hashes.length === 2) return 'section';
  return 'subsection';
}

function stripQuote(line: string): string {
  return line.replace(/^>\s?/, '');
}

function calloutStyle(text: string): CalloutStyle | null {
  const trimmed = text.trim();
  for (const { cue, style } of CALLOUT_CUES) {
    if (cue.test(trimmed)) return style;
  }
  return null;
}

function stripCalloutCue(text: string): string {
  return text.replace(/^[💡ℹ️ℹ⚠️⚠❗‼️📝📌✨🧱👀]\s*/u, '').trim();
}

function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index] ?? '';
  const sep = lines[index + 1] ?? '';
  return header.includes('|') && TABLE_SEP.test(sep);
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function fill<T extends Block>(block: T, content: T['content'], extra?: Partial<T>): T {
  return { ...block, ...extra, content: { ...block.content, ...content } };
}

export function markdownToBlocks(markdown: string, options: MarkdownToBlocksOptions): Block[] {
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  const push = (type: Parameters<typeof createBlock>[0], content: Record<string, unknown>, extra?: Record<string, unknown>): void => {
    const block = createBlock(type, options.nextId());
    blocks.push(fill(block, content as never, extra as never));
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.trim().startsWith('```')) {
      const info = line.trim().slice(3).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      push('code', { code: body.join('\n'), ...(info ? { language: info } : {}) });
      continue;
    }

    if (DIVIDER_LINE.test(line)) {
      push('divider', {});
      i += 1;
      continue;
    }

    const heading = HEADING_LINE.exec(line);
    if (heading) {
      const text = heading[2].trim();
      const skipTitle =
        heading[1].length === 1 && text.toLowerCase() === options.title.trim().toLowerCase();
      if (!skipTitle) {
        push('heading', { text }, { variant: headingVariant(heading[1]) });
      }
      i += 1;
      continue;
    }

    const image = IMAGE_LINE.exec(line);
    if (image) {
      push('image', { url: image[2].trim(), alt_text: image[1].trim() });
      i += 1;
      continue;
    }

    if (/<details\b/i.test(line)) {
      const chunk: string[] = [line];
      if (!/<\/details>/i.test(line)) {
        i += 1;
        while (i < lines.length && !/<\/details>/i.test(lines[i])) {
          chunk.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) {
          chunk.push(lines[i]);
        }
      }
      i += 1;
      const html = chunk.join('\n');
      const summary = /<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(html)?.[1]?.trim() ?? 'Toggle';
      const body = html
        .replace(/<details[^>]*>/i, '')
        .replace(/<\/details>/i, '')
        .replace(/<summary[^>]*>[\s\S]*?<\/summary>/i, '')
        .trim();
      const last = blocks[blocks.length - 1];
      if (last?.block_type === 'accordion') {
        last.content.items.push({ title: summary, body });
      } else {
        push('accordion', { items: [{ title: summary, body }] });
      }
      continue;
    }

    if (isTableStart(lines, i)) {
      const headers = splitRow(lines[i] ?? '');
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').includes('|') && !TABLE_SEP.test(lines[i] ?? '')) {
        rows.push(splitRow(lines[i] ?? ''));
        i += 1;
      }
      push('table', { headers, rows });
      continue;
    }

    if (LIST_LINE.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && LIST_LINE.test(lines[i] ?? '')) {
        items.push(inlineToHtml(LIST_LINE.exec(lines[i] ?? '')?.[1] ?? ''));
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      push('rich_text', {
        html: `<${tag}>${items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`
      });
      continue;
    }

    if (line.startsWith('>')) {
      const quoted: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('>')) {
        quoted.push(stripQuote(lines[i] ?? ''));
        i += 1;
      }
      const joined = quoted.join('\n').trim();
      const style = calloutStyle(quoted[0] ?? '');
      if (style) {
        push('callout', { style, body: stripCalloutCue(joined) });
      } else {
        push('quote', { quote: joined });
      }
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? '';
      if (!current.trim()) break;
      if (current.trim().startsWith('```')) break;
      if (DIVIDER_LINE.test(current)) break;
      if (HEADING_LINE.test(current)) break;
      if (IMAGE_LINE.test(current)) break;
      if (current.startsWith('>')) break;
      if (LIST_LINE.test(current)) break;
      if (isTableStart(lines, i)) break;
      if (/<details\b/i.test(current)) break;
      para.push(current.trim());
      i += 1;
    }
    push('rich_text', { html: `<p>${inlineToHtml(para.join(' '))}</p>` });
  }

  return blocks;
}
