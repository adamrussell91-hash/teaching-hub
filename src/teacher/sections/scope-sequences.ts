import { mountCreateControl } from '@/teacher/create/control';
import type { CreateKind } from '@/teacher/create/types';
import type { CurriculumResponse } from '@/teacher/nav';
import { renderScopeOverview, subjectsWithScope } from '@/teacher/sections/scope-overview';
import {
  renderScopeTimelineEditor,
  type ScopeTimelineEditorOptions
} from '@/teacher/sections/scope-timeline';

export interface ScopeSequencesIndexOptions {
  onCreated?: (kind: CreateKind, id: string) => void | Promise<void>;
}

export function renderScopeSequencesIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options?: ScopeSequencesIndexOptions
): { dispose?: () => void } {
  canvas.replaceChildren();

  const disposers: Array<() => void> = [];

  const header = document.createElement('header');
  header.className = 'scope-sequences-index__header';

  const titleBlock = document.createElement('div');
  titleBlock.className = 'scope-sequences-index__titles';

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = 'Overall Scope & Sequence';

  const yearMeta = document.createElement('p');
  yearMeta.className = 'scope-sequences-index__year';
  const scoped = subjectsWithScope(curriculum);
  const academicYear =
    scoped[0]?.scope.academic_year ??
    curriculum.scope_sequences[0]?.academic_year ??
    curriculum.classes[0]?.academic_year;
  yearMeta.textContent =
    academicYear != null ? `Academic year ${academicYear}` : 'Academic year';

  titleBlock.append(heading, yearMeta);

  const createHost = document.createElement('div');
  createHost.className = 'scope-sequences-index__create create-control';
  createHost.dataset.createHost = '';

  header.append(titleBlock, createHost);

  const createControl = mountCreateControl(createHost, {
    context: 'scope-sequences',
    curriculum,
    onCreated: options?.onCreated ?? (() => undefined)
  });
  disposers.push(createControl.dispose);

  const overviewHost = document.createElement('div');
  overviewHost.className = 'scope-sequences-index__overview';

  canvas.append(header, overviewHost);
  renderScopeOverview(overviewHost, curriculum);

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}

/** @deprecated Prefer renderScopeTimelineEditor — kept as a thin wrapper for callers. */
export function renderScopeSequenceStub(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  subjectId: string,
  options?: ScopeTimelineEditorOptions
): void {
  renderScopeTimelineEditor(canvas, curriculum, subjectId, options);
}

export { renderScopeTimelineEditor } from '@/teacher/sections/scope-timeline';
