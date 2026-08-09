import { emptyColumnsForPreset } from '@/blocks/column-presets';
import type { Block } from '@/schemas/block';

type ColumnsBlock = Extract<Block, { block_type: 'columns' }>;
type SectionBlock = Extract<Block, { block_type: 'section' }>;
type TabsBlock = Extract<Block, { block_type: 'tabs' }>;

export const NEW_BLOCK_TYPES = [
  'rich_text',
  'heading',
  'callout',
  'quote',
  'divider',
  'definition',
  'code',
  'html',
  'image',
  'video',
  'embed',
  'audio',
  'attachment',
  'accordion',
  'table',
  'question_set',
  'columns',
  'section',
  'spacer',
  'tabs'
] as const;

export type NewBlockType = (typeof NEW_BLOCK_TYPES)[number];

export const NEW_BLOCK_LABEL: Record<NewBlockType, string> = {
  rich_text: 'Rich text',
  heading: 'Heading',
  callout: 'Callout',
  quote: 'Quote',
  divider: 'Divider',
  definition: 'Definition',
  code: 'Code',
  html: 'HTML',
  image: 'Image',
  video: 'Video',
  embed: 'Embed',
  audio: 'Audio',
  attachment: 'Attachment',
  accordion: 'Accordion',
  table: 'Table',
  question_set: 'Question set',
  columns: 'Columns',
  section: 'Section',
  spacer: 'Spacer',
  tabs: 'Tabs'
};

export const BLOCK_GROUPS: Array<{ label: string; types: readonly NewBlockType[] }> = [
  {
    label: 'Basic',
    types: ['rich_text', 'heading', 'callout', 'quote', 'divider', 'definition', 'code', 'html']
  },
  {
    label: 'Media',
    types: ['image', 'video', 'embed', 'audio', 'attachment']
  },
  {
    label: 'Teaching',
    types: ['accordion', 'table', 'question_set']
  },
  {
    label: 'Layout',
    types: ['section', 'columns', 'spacer', 'tabs']
  }
];

/** Block types allowed inside a columns cell */
export const COLUMN_CHILD_TYPES = NEW_BLOCK_TYPES.filter(
  (t) => t !== 'columns' && t !== 'section' && t !== 'tabs'
);

/** Block types allowed inside a section */
export const SECTION_CHILD_TYPES = NEW_BLOCK_TYPES.filter((t) => t !== 'section');

/** Block types allowed inside a tabs panel */
export const TAB_CHILD_TYPES = NEW_BLOCK_TYPES.filter(
  (t) => t !== 'tabs' && t !== 'section'
);
function nowIso(): string {
  return new Date().toISOString();
}

export function createBlock(type: NewBlockType, id: string): Block {
  const shared = {
    id,
    type: 'block' as const,
    visibility: 'student_teacher' as const,
    layout: {},
    print: {},
    settings: {},
    created_at: nowIso(),
    updated_at: nowIso(),
    schema_version: 1 as const
  };

  switch (type) {
    case 'rich_text':
      return { ...shared, block_type: 'rich_text', variant: 'medium', content: { html: '' } };
    case 'heading':
      return { ...shared, block_type: 'heading', variant: 'section', content: { text: '' } };
    case 'callout':
      return {
        ...shared,
        block_type: 'callout',
        variant: 'medium',
        content: { style: 'information', body: '' }
      };
    case 'image':
      return {
        ...shared,
        block_type: 'image',
        variant: 'large',
        content: { url: '', alt_text: '' }
      };
    case 'video':
      return {
        ...shared,
        block_type: 'video',
        variant: 'large',
        content: { provider: 'youtube', external_id: '' }
      };
    case 'embed':
      return {
        ...shared,
        block_type: 'embed',
        variant: 'large',
        content: { url: '' }
      };
    case 'html':
      return {
        ...shared,
        block_type: 'html',
        variant: 'medium',
        content: { html: '' }
      };
    case 'quote':
      return {
        ...shared,
        block_type: 'quote',
        variant: 'medium',
        content: { quote: '' }
      };
    case 'divider':
      return {
        ...shared,
        block_type: 'divider',
        variant: 'medium',
        content: {}
      };
    case 'definition':
      return {
        ...shared,
        block_type: 'definition',
        variant: 'medium',
        content: { term: '', definition: '' }
      };
    case 'code':
      return {
        ...shared,
        block_type: 'code',
        variant: 'medium',
        content: { code: '' }
      };
    case 'audio':
      return {
        ...shared,
        block_type: 'audio',
        variant: 'medium',
        content: { url: '' }
      };
    case 'attachment':
      return {
        ...shared,
        block_type: 'attachment',
        variant: 'medium',
        content: { url: '', title: '' }
      };
    case 'accordion':
      return {
        ...shared,
        block_type: 'accordion',
        variant: 'medium',
        content: { items: [{ title: '', body: '' }] }
      };
    case 'table':
      return {
        ...shared,
        block_type: 'table',
        variant: 'large',
        content: {
          headers: ['Column 1', 'Column 2', 'Column 3'],
          rows: [['', '', '']]
        }
      };
    case 'question_set':
      return {
        ...shared,
        block_type: 'question_set',
        variant: 'medium',
        content: {
          questions: [{ id: `${id}_q1`, prompt: '', kind: 'short_answer' }]
        }
      };
    case 'columns':
      return {
        ...shared,
        block_type: 'columns',
        variant: 'medium',
        content: {
          preset: '50-50',
          columns: emptyColumnsForPreset('50-50') as ColumnsBlock['content']['columns']
        }
      };
    case 'section':
      return {
        ...shared,
        block_type: 'section',
        variant: 'medium',
        content: { title: '', blocks: [] }
      };
    case 'spacer':
      return {
        ...shared,
        block_type: 'spacer',
        variant: 'medium',
        content: { size: 'medium' }
      };
    case 'tabs':
      return {
        ...shared,
        block_type: 'tabs',
        variant: 'medium',
        content: {
          tabs: [
            { id: `${id}_t1`, label: '', blocks: [] },
            { id: `${id}_t2`, label: '', blocks: [] },
            { id: `${id}_t3`, label: '', blocks: [] }
          ]
        }
      };
  }
}

export function cloneBlockWithNewIds(
  block: Block,
  nextId: () => string,
  now: () => string = () => new Date().toISOString()
): Block {
  const stamp = now();
  const cloned = structuredClone(block) as Block;
  cloned.id = nextId();
  cloned.created_at = stamp;
  cloned.updated_at = stamp;

  if (cloned.block_type === 'columns') {
    cloned.content = {
      ...cloned.content,
      columns: cloned.content.columns.map((col) => ({
        ...col,
        blocks: col.blocks.map((child) =>
          cloneBlockWithNewIds(child, nextId, now)
        ) as typeof col.blocks
      }))
    };
  } else if (cloned.block_type === 'section') {
    cloned.content = {
      ...cloned.content,
      blocks: cloned.content.blocks.map((child) =>
        cloneBlockWithNewIds(child, nextId, now)
      ) as SectionBlock['content']['blocks']
    };
  } else if (cloned.block_type === 'tabs') {
    cloned.content = {
      tabs: cloned.content.tabs.map((panel) => ({
        id: nextId(),
        label: panel.label,
        blocks: panel.blocks.map((child) =>
          cloneBlockWithNewIds(child, nextId, now)
        ) as TabsBlock['content']['tabs'][number]['blocks']
      }))
    };
  }
  return cloned;
}
