import { z } from 'zod';
import { PedagogicalModeSchema } from '../curriculum/pedagogical-mode';
import { CommonFields, IsoDateSchema, TrashFields } from './common';
import { BlockSchema } from './block';
import { CoverSchema } from './cover';
import { isHttpUrl } from '../blocks/url-safety';
import { parseClozeText } from '../blocks/learning-activity';
import { sanitizeSvgMarkup, svgHasMeaningfulContent } from '../blocks/sanitize-svg';
import { validateMindMap, validateConceptMap } from '../blocks/graph-layout';

export const LessonSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('lesson'),
  unit_id: z.string().min(1),
  sequence: z.number().int(),
  blocks: z.array(BlockSchema),
  published_at: IsoDateSchema.optional(),
  cover: CoverSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).max(24).optional(),
  author_id: z.string().min(1).optional(),
  review_status: z.enum(['needs_review', 'none']).optional(),
  syllabus_outcomes: z.array(z.string().min(1).max(32)).max(24).optional(),
  /** Teacher planning metadata; optional for blob/version compatibility. */
  pedagogical_mode: PedagogicalModeSchema.optional()
});

function publishBlockIssues(blocks: z.infer<typeof BlockSchema>[]): string | null {
  for (const block of blocks) {
    if (block.block_type === 'collection') {
      return 'Collection blocks can only be used on class homepages';
    }
    if (block.block_type === 'image') {
      if (!isHttpUrl(block.content.url)) {
        return 'Image blocks need a valid http(s) URL to publish';
      }
      if (block.content.alt_text.trim().length === 0) {
        return 'Image blocks need alt text to publish';
      }
    }
    if (block.block_type === 'gallery') {
      for (const entry of block.content.items) {
        if (!isHttpUrl(entry.url)) {
          return 'Gallery images need a valid http(s) URL to publish';
        }
        if (entry.alt_text.trim().length === 0) {
          return 'Gallery images need alt text to publish';
        }
      }
    }
    if (block.block_type === 'video') {
      if (!block.content.external_id.trim()) {
        return 'Video blocks need a recognised YouTube or Vimeo id to publish';
      }
    }
    if (block.block_type === 'embed') {
      if (!isHttpUrl(block.content.url)) {
        return 'Embed blocks need a valid http(s) URL to publish';
      }
    }
    if (block.block_type === 'html') {
      if (block.content.html.trim().length === 0) {
        return 'HTML blocks need content to publish';
      }
    }
    if (block.block_type === 'html_app') {
      if (block.content.html.trim().length === 0) {
        return 'HTML app blocks need content to publish';
      }
      if (block.content.ai) {
        if (block.content.ai.system.trim().length === 0) {
          return 'HTML app AI lanes need a system / focus prompt to publish';
        }
        if (block.content.ai.model.trim().length === 0) {
          return 'HTML app AI lanes need a model to publish';
        }
      }
    }
    if (block.block_type === 'audio') {
      if (!isHttpUrl(block.content.url)) {
        return 'Audio blocks need a valid http(s) URL to publish';
      }
    }
    if (block.block_type === 'attachment') {
      if (!isHttpUrl(block.content.url)) {
        return 'Attachment blocks need a valid http(s) URL to publish';
      }
      if (block.content.title.trim().length === 0) {
        return 'Attachment blocks need a title to publish';
      }
    }
    if (block.block_type === 'question_set') {
      if (block.content.questions.length === 0) {
        return 'Question set blocks need at least one question to publish';
      }
      for (const question of block.content.questions) {
        if (question.prompt.trim().length === 0) {
          return 'Question set blocks need a non-empty prompt on every question to publish';
        }
        if (question.kind === 'multiple_choice') {
          const options = (question.options ?? []).map((option) => option.trim()).filter(Boolean);
          if (options.length < 2) {
            return 'Multiple choice questions need at least two options to publish';
          }
        }
      }
    }
    if (block.block_type === 'quote') {
      if (block.content.quote.trim().length === 0) {
        return 'Quote blocks need quote text to publish';
      }
    }
    if (block.block_type === 'definition') {
      if (block.content.term.trim().length === 0 || block.content.definition.trim().length === 0) {
        return 'Definition blocks need a term and definition to publish';
      }
    }
    if (block.block_type === 'table') {
      if (block.content.headers.length === 0) {
        return 'Table blocks need at least one header to publish';
      }
    }
    if (block.block_type === 'section') {
      if (block.content.title.trim().length === 0) {
        return 'Section blocks need a title to publish';
      }
      const nested = publishBlockIssues(block.content.blocks);
      if (nested) return nested;
    }
    if (block.block_type === 'columns') {
      for (const col of block.content.columns) {
        const nested = publishBlockIssues(col.blocks);
        if (nested) return nested;
      }
    }
    if (block.block_type === 'timeline') {
      for (const event of block.content.events) {
        if (event.label.trim().length === 0 || event.when.trim().length === 0) {
          return 'Timeline events need a label and when value to publish';
        }
        if (event.image_url !== undefined && event.image_url.trim().length > 0) {
          if (!isHttpUrl(event.image_url)) {
            return 'Timeline event images need a valid http(s) URL to publish';
          }
          if ((event.image_alt ?? '').trim().length === 0) {
            return 'Timeline event images need alt text to publish';
          }
        }
        if (event.link_url !== undefined && event.link_url.trim().length > 0) {
          if (!isHttpUrl(event.link_url)) {
            return 'Timeline event links need a valid http(s) URL to publish';
          }
        }
      }
    }
    if (block.block_type === 'tabs') {
      for (const panel of block.content.tabs) {
        if (panel.label.trim().length === 0) {
          return 'Tabs blocks need a label on every tab to publish';
        }
        const nested = publishBlockIssues(panel.blocks);
        if (nested) return nested;
      }
    }
    if (block.block_type === 'flashcards') {
      for (const card of block.content.cards) {
        if (card.front.trim().length === 0 || card.back.trim().length === 0) {
          return 'Flashcards need front and back text on every card to publish';
        }
      }
    }
    if (block.block_type === 'cloze') {
      const validBlanks = parseClozeText(block.content.text).blanks.filter(
        (blank) => blank.answer.trim().length > 0
      );
      if (validBlanks.length < 1) {
        return 'Cloze blocks need at least one blank to publish';
      }
    }
    if (block.block_type === 'self_check') {
      if (block.content.prompt.trim().length === 0) {
        return 'Self check blocks need a prompt to publish';
      }
      if (block.content.mode === 'reveal' || block.content.mode === 'confidence') {
        if ((block.content.answer ?? '').trim().length === 0) {
          return 'Self check blocks need an answer to publish';
        }
      }
      if (block.content.mode === 'checklist') {
        const items = (block.content.items ?? []).filter((item) => item.label.trim().length > 0);
        if (items.length === 0) {
          return 'Self check checklists need at least one item to publish';
        }
      }
    }
    if (block.block_type === 'chart') {
      for (const series of block.content.series) {
        if (series.points.length === 0) {
          return 'Chart series need at least one point to publish';
        }
        for (const point of series.points) {
          if (!Number.isFinite(point.y)) {
            return 'Chart points need finite y values to publish';
          }
        }
      }
    }
    if (block.block_type === 'equation') {
      if (block.content.latex.trim().length === 0) {
        return 'Equation blocks need LaTeX to publish';
      }
    }
    if (block.block_type === 'diagram') {
      if (block.content.source === 'image') {
        if (!isHttpUrl(block.content.image_url ?? '')) {
          return 'Diagram image needs a valid http(s) URL to publish';
        }
        if ((block.content.image_alt ?? '').trim().length === 0) {
          return 'Diagram image needs alt text to publish';
        }
      } else {
        const cleaned = sanitizeSvgMarkup(block.content.svg_markup ?? '');
        if (!svgHasMeaningfulContent(cleaned)) {
          return 'Diagram SVG needs safe SVG markup to publish';
        }
      }
    }
    if (block.block_type === 'mind_map') {
      const issue = validateMindMap(block.content);
      if (issue) return issue;
    }
    if (block.block_type === 'concept_map') {
      const issue = validateConceptMap(block.content);
      if (issue) return issue;
    }
  }
  return null;
}

export const PublishableLessonSchema = LessonSchema.superRefine((lesson, ctx) => {
  if (lesson.title.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Title is required to publish',
      path: ['title']
    });
  }
  const blockIssue = publishBlockIssues(lesson.blocks);
  if (blockIssue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: blockIssue, path: ['blocks'] });
  }
});

export type Lesson = z.infer<typeof LessonSchema>;
