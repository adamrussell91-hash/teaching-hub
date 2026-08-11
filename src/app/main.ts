import 'katex/dist/katex.min.css';
import { apiGet, ApiClientError } from '@/api/client';
import { fetchSession, logout, renderSignIn, type SessionInfo } from '@/auth/gate';
import {
  renderCanvasStatus,
  renderContextBar,
  renderRailStatus,
  renderTeacherShell,
  type TeacherShellRefs
} from '@/teacher/shell';
import { fetchCurriculum, type CurriculumResponse } from '@/teacher/nav';
import { renderTeacherRail } from '@/teacher/rail';
import { renderTeacherHome as renderHomeCanvas } from '@/teacher/home';
import { openCreateModal } from '@/teacher/create/modal';
import type { CreateKind } from '@/teacher/create/types';
import { mountLessonEditor, type LessonEditorHandle } from '@/teacher/lesson-editor';
import type { TeacherSection } from '@/teacher/section';
import { renderResourcesIndex } from '@/teacher/sections/resources';
import { openDrivePicker } from '@/teacher/drive-picker';
import { createMedia, uploadMediaFile } from '@/teacher/media-api';
import {
  renderScopeSequencesIndex,
  renderScopeTimelineEditor
} from '@/teacher/sections/scope-sequences';
import { renderClassesIndex, renderClassPage, type ClassPageOptions } from '@/teacher/sections/classes';
import { openScheduleUnitModal } from '@/teacher/sections/schedule-unit-modal';
import { renderUnitsIndex, renderUnitStub } from '@/teacher/sections/units';
import { renderLessonsIndex } from '@/teacher/sections/lessons';
import { renderTemplatesPage } from '@/teacher/sections/templates';
import { fetchContentSearch } from '@/teacher/search/api';
import { resolveTodayClassId } from '@/teacher/search/actions';
import { openSearchPanel } from '@/teacher/search/panel';
import { pushRecent } from '@/teacher/search/recent';
import {
  mountStudentLessonView,
  type StudentLessonViewHandle
} from '@/student/lesson-view';
import {
  mountStudentUnitView,
  type StudentUnitViewHandle
} from '@/student/unit-view';
import {
  mountStudentClassView,
  type StudentClassViewHandle
} from '@/student/class-view';
import { navigate, start, type RouteMatch } from './router';

const root = document.querySelector('#app');
if (!(root instanceof HTMLElement)) {
  throw new Error('App root element #app not found');
}

const appRoot = root;

let session: SessionInfo = { authenticated: false };

// Guards against stale async work (e.g. a slow curriculum fetch) clobbering
// the DOM after the user has already navigated to a different route.
let renderToken = 0;

// The seed curriculum doesn't change during a session, so a single teacher
// workspace visit only needs to fetch it once; a fresh fetch is triggered on
// the next render whenever a previous attempt failed.
let curriculumPromise: Promise<CurriculumResponse> | null = null;

// The lesson editor mounted for the current route, if any. Torn down (with a
// best-effort save flush) whenever the route changes.
let lessonEditorHandle: LessonEditorHandle | null = null;

// Latest teacher shell refs (for search create-modal callbacks).
let teacherShellRefs: TeacherShellRefs | null = null;

// The student lesson view mounted for the current public route, if any.
let studentLessonViewHandle: StudentLessonViewHandle | null = null;

// The student unit view mounted for the current public route, if any.
let studentUnitViewHandle: StudentUnitViewHandle | null = null;

// The student class view mounted for the current public route, if any.
let studentClassViewHandle: StudentClassViewHandle | null = null;

// Home dashboard handle (clock interval + create control), if mounted.
let homeHandle: { dispose: () => void } | null = null;

// Scope sequences index handle (create control), if mounted.
let scopeIndexHandle: { dispose?: () => void } | null = null;

// Section index handles (create controls), if mounted.
let classesIndexHandle: { dispose?: () => void } | null = null;
let unitsIndexHandle: { dispose?: () => void } | null = null;
let lessonsIndexHandle: { dispose?: () => void } | null = null;

/**
 * Flushes any pending/in-flight autosave for the current lesson editor and
 * only disposes it once that flush has fully settled. Awaiting this (rather
 * than firing-and-forgetting `flush()`) matters: if a save is already in
 * flight when the user navigates away, a follow-up edit can be queued as a
 * resave behind it — disposing before that resave completes would silently
 * drop it.
 */
async function teardownLessonEditor(): Promise<void> {
  const handle = lessonEditorHandle;
  if (!handle) return;
  lessonEditorHandle = null;
  await handle.flush();
  handle.dispose();
}

function teardownStudentLessonView(): void {
  if (!studentLessonViewHandle) return;
  studentLessonViewHandle.dispose();
  studentLessonViewHandle = null;
}

function teardownStudentUnitView(): void {
  if (!studentUnitViewHandle) return;
  studentUnitViewHandle.dispose();
  studentUnitViewHandle = null;
}

function teardownStudentClassView(): void {
  if (!studentClassViewHandle) return;
  studentClassViewHandle.dispose();
  studentClassViewHandle = null;
}

function teardownTeacherHome(): void {
  if (!homeHandle) return;
  homeHandle.dispose();
  homeHandle = null;
}

function teardownScopeIndex(): void {
  if (!scopeIndexHandle) return;
  scopeIndexHandle.dispose?.();
  scopeIndexHandle = null;
}

function teardownClassesIndex(): void {
  if (!classesIndexHandle) return;
  classesIndexHandle.dispose?.();
  classesIndexHandle = null;
}

function teardownUnitsIndex(): void {
  if (!unitsIndexHandle) return;
  unitsIndexHandle.dispose?.();
  unitsIndexHandle = null;
}

function teardownLessonsIndex(): void {
  if (!lessonsIndexHandle) return;
  lessonsIndexHandle.dispose?.();
  lessonsIndexHandle = null;
}

function pathForCreatedEntity(
  kind: CreateKind,
  id: string,
  curriculum: CurriculumResponse
): string {
  switch (kind) {
    case 'class':
      return `/classes/${id}`;
    case 'unit':
      return `/units/${id}`;
    case 'lesson':
      return `/lessons/${id}`;
    case 'scope_sequence': {
      const subject = curriculum.subjects.find((entry) => entry.scope_id === id);
      return subject ? `/scope-sequences/${subject.id}` : '/scope-sequences';
    }
  }
}

async function handleEntityCreated(
  refs: TeacherShellRefs,
  token: number,
  kind: CreateKind,
  id: string
): Promise<void> {
  curriculumPromise = null;
  try {
    const refreshed = await getCurriculum();
    if (token !== renderToken) return;
    navigate(pathForCreatedEntity(kind, id, refreshed));
  } catch (error) {
    if (token !== renderToken) return;
    if (error instanceof ApiClientError && error.code === 'unauthorized') {
      session = { authenticated: false };
      navigate('/sign-in', { replace: true });
      return;
    }
    renderCanvasStatus(
      refs.canvas,
      'Created, but unable to refresh. Please reload to open the new item.'
    );
  }
}

function railCreateClassHandler(
  curriculum: CurriculumResponse,
  refs: TeacherShellRefs,
  token: number
): () => void {
  return () => {
    openCreateModal({
      kind: 'class',
      curriculum,
      onCreated: (kind, id) => handleEntityCreated(refs, token, kind, id)
    });
  };
}

function studentPathForTeacherPath(pathname: string): string | null {
  const match = pathname.match(/^\/(lessons|units|classes)\/([^/]+)\/?$/);
  if (!match) return null;
  return `/s/${match[1]}/${match[2]}`;
}

function createKindForSearchAction(actionId: string): CreateKind | null {
  switch (actionId) {
    case 'new-lesson':
      return 'lesson';
    case 'new-unit':
      return 'unit';
    case 'new-class':
      return 'class';
    case 'new-scope':
      return 'scope_sequence';
    default:
      return null;
  }
}

function openTeacherSearch(): void {
  if (!session.authenticated) return;
  if (location.pathname.startsWith('/s/')) return;

  void getCurriculum().then(async (curriculum) => {
    let compositions: Array<{ id: string; title: string }> = [];
    try {
      const res = await apiGet<{ compositions: Array<{ id: string; title: string }> }>(
        '/api/compositions'
      );
      compositions = res.compositions;
    } catch {
      compositions = [];
    }

    const todayClassId = resolveTodayClassId(curriculum);

    openSearchPanel({
      curriculum,
      compositions,
      path: location.pathname,
      hasLessonEditor: Boolean(lessonEditorHandle),
      todayClassId,
      fetchContentSearch,
      onNavigate: (path) => {
        navigate(path);
      },
      onAction: (actionId) => {
        const createKind = createKindForSearchAction(actionId);
        if (createKind) {
          const refs = teacherShellRefs;
          openCreateModal({
            kind: createKind,
            curriculum,
            onCreated: (kind, id) => {
              if (refs) {
                void handleEntityCreated(refs, renderToken, kind, id);
                return;
              }
              curriculumPromise = null;
              void getCurriculum()
                .then((next) => navigate(pathForCreatedEntity(kind, id, next)))
                .catch(() => navigate(pathForCreatedEntity(kind, id, curriculum)));
            }
          });
          return;
        }

        switch (actionId) {
          case 'open-home':
            navigate('/');
            break;
          case 'open-today-class':
            if (todayClassId) navigate(`/classes/${todayClassId}`);
            break;
          case 'open-student-view': {
            const studentPath = studentPathForTeacherPath(location.pathname);
            if (studentPath) window.open(studentPath, '_blank', 'noopener,noreferrer');
            break;
          }
          case 'open-a4':
            lessonEditorHandle?.openA4Preview();
            break;
          case 'publish-lesson':
            lessonEditorHandle?.publish();
            break;
          default:
            break;
        }
      }
    });
  });
}

function mountTeacherRail(
  refs: TeacherShellRefs,
  curriculum: CurriculumResponse,
  token: number,
  activeSection: TeacherSection,
  activeClassId?: string
): void {
  renderTeacherRail(refs.railNav, curriculum, {
    activeSection,
    activeClassId,
    onCreateClass: railCreateClassHandler(curriculum, refs, token),
    onOpenSearch: openTeacherSearch
  });
}

function getCurriculum(): Promise<CurriculumResponse> {
  if (!curriculumPromise) {
    curriculumPromise = fetchCurriculum().catch((error: unknown) => {
      curriculumPromise = null;
      throw error;
    });
  }
  return curriculumPromise;
}

async function handleLogout(): Promise<void> {
  try {
    await logout();
  } catch {
    // Still clear local session so the teacher isn't stuck signed in if the
    // network call fails (cookie may linger until it expires).
  }
  session = { authenticated: false };
  curriculumPromise = null;
  navigate('/sign-in', { replace: true });
}

function mountTeacherShell(): TeacherShellRefs {
  const refs = renderTeacherShell(appRoot, { onLogout: () => handleLogout() });
  teacherShellRefs = refs;
  return refs;
}

async function loadNavAndHandleErrors(
  refs: TeacherShellRefs,
  token: number,
  activeSection: TeacherSection,
  activeClassId: string | undefined,
  onLoaded: (curriculum: CurriculumResponse) => void
): Promise<void> {
  try {
    const curriculum = await getCurriculum();
    if (token !== renderToken) return;
    mountTeacherRail(refs, curriculum, token, activeSection, activeClassId);
    onLoaded(curriculum);
  } catch (error) {
    if (token !== renderToken) return;

    if (error instanceof ApiClientError && error.code === 'unauthorized') {
      session = { authenticated: false };
      navigate('/sign-in', { replace: true });
      return;
    }

    renderRailStatus(refs.railNav, 'Unable to load curriculum.');
    renderCanvasStatus(refs.canvas, 'Unable to load curriculum. Please refresh to try again.');
  }
}

function renderTeacherHomeRoute(token: number): void {
  const refs = mountTeacherShell();
  renderContextBar(refs, { title: 'Home' });
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading home…');

  void loadNavAndHandleErrors(refs, token, 'home', undefined, (curriculum) => {
    teardownTeacherHome();
    homeHandle = renderHomeCanvas(refs.canvas, curriculum, {
      onCreated: (kind, id) => handleEntityCreated(refs, token, kind, id)
    });
  });
}

function renderTeacherClassesRoute(token: number): void {
  const refs = mountTeacherShell();
  renderContextBar(refs, { title: 'Classes' });
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'classes', undefined, (curriculum) => {
    teardownClassesIndex();
    classesIndexHandle = renderClassesIndex(refs.canvas, curriculum, {
      onCreated: (kind, id) => handleEntityCreated(refs, token, kind, id)
    });
  });
}

function renderTeacherClassRoute(classId: string, token: number): void {
  const refs = mountTeacherShell();
  renderContextBar(refs, { title: 'Classes' });
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  let currentCurriculum: CurriculumResponse | undefined;
  let classPageOptions: ClassPageOptions;

  const refreshAfterScheduleMutation = async (): Promise<void> => {
    curriculumPromise = null;
    try {
      const curriculum = await getCurriculum();
      if (token !== renderToken) return;
      currentCurriculum = curriculum;
      mountTeacherRail(refs, curriculum, token, 'classes', classId);
      const cls = curriculum.classes.find((entry) => entry.id === classId);
      if (cls) {
        renderContextBar(refs, { title: cls.code || cls.title });
      }
      renderClassPage(refs.canvas, curriculum, classId, classPageOptions);
    } catch (error) {
      if (token !== renderToken) return;

      if (error instanceof ApiClientError && error.code === 'unauthorized') {
        session = { authenticated: false };
        navigate('/sign-in', { replace: true });
        return;
      }

      renderCanvasStatus(refs.canvas, 'Unable to refresh schedule. Please refresh to try again.');
    }
  };

  classPageOptions = {
    onScheduleMutated: refreshAfterScheduleMutation,
    onScheduleUnit: () => {
      if (!currentCurriculum) return;
      openScheduleUnitModal({
        curriculum: currentCurriculum,
        classId,
        onSuccess: refreshAfterScheduleMutation
      });
    }
  };

  void loadNavAndHandleErrors(refs, token, 'classes', classId, (curriculum) => {
    currentCurriculum = curriculum;
    const cls = curriculum.classes.find((entry) => entry.id === classId);
    if (cls) {
      renderContextBar(refs, { title: cls.code || cls.title });
      pushRecent({
        type: 'class',
        id: cls.id,
        title: cls.code || cls.title,
        opened_at: new Date().toISOString()
      });
    }
    renderClassPage(refs.canvas, curriculum, classId, classPageOptions);
  });
}

function renderTeacherResourcesRoute(token: number): void {
  const refs = mountTeacherShell();
  renderContextBar(refs, { title: 'Resource Library' });
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'resources', undefined, (curriculum) => {
    const mount = (data: CurriculumResponse): void => {
      renderResourcesIndex(refs.canvas, data, {
        refresh: async () => {
          curriculumPromise = null;
          const next = await getCurriculum();
          if (token !== renderToken) return;
          mountTeacherRail(refs, next, token, 'resources');
          mount(next);
        },
        onDrivePick: async () => {
          const pick = await openDrivePicker();
          if (!pick) return;
          if (pick.kind === 'mirror') {
            await uploadMediaFile(pick.file, {
              title: pick.title,
              provider_file_id: pick.provider_file_id
            });
          } else {
            await createMedia({
              title: pick.title,
              provider: 'google_drive',
              media_type: pick.media_type,
              provider_file_id: pick.provider_file_id,
              preview_url: pick.preview_url,
              sharing: pick.sharing
            });
          }
        }
      });
    };
    mount(curriculum);
  });
}

function renderTeacherTemplatesRoute(token: number): void {
  const refs = mountTeacherShell();
  renderContextBar(refs, { title: 'Templates' });
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'templates', undefined, (curriculum) => {
    renderTemplatesPage(refs.canvas, curriculum, {
      onCreated: async () => {
        curriculumPromise = null;
      }
    });
  });
}

function renderTeacherScopeSequencesRoute(token: number): void {
  const refs = mountTeacherShell();
  renderContextBar(refs, { title: 'Scope & Sequences' });
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'scope-sequences', undefined, (curriculum) => {
    teardownScopeIndex();
    scopeIndexHandle = renderScopeSequencesIndex(refs.canvas, curriculum, {
      onCreated: (kind, id) => handleEntityCreated(refs, token, kind, id)
    });
  });
}

function renderTeacherScopeSequenceRoute(subjectId: string, token: number): void {
  const refs = mountTeacherShell();
  renderContextBar(refs, { title: 'Scope & Sequence' });
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  const selectedNoteId =
    new URLSearchParams(window.location.search).get('selectNote') ?? undefined;

  void loadNavAndHandleErrors(refs, token, 'scope-sequences', undefined, (curriculum) => {
    const subject = curriculum.subjects.find((entry) => entry.id === subjectId);
    if (subject) {
      renderContextBar(refs, { title: subject.title });
    }
    renderScopeTimelineEditor(refs.canvas, curriculum, subjectId, {
      selectedNoteId
    });
  });
}

function renderTeacherUnitsRoute(token: number): void {
  const refs = mountTeacherShell();
  renderContextBar(refs, { title: 'Units' });
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'units', undefined, (curriculum) => {
    teardownUnitsIndex();
    unitsIndexHandle = renderUnitsIndex(refs.canvas, curriculum, {
      onCreated: (kind, id) => handleEntityCreated(refs, token, kind, id)
    });
  });
}

function renderTeacherUnitRoute(unitId: string, token: number): void {
  const refs = mountTeacherShell();
  renderContextBar(refs, { title: 'Units' });
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'units', undefined, (curriculum) => {
    const unit = curriculum.units.find((entry) => entry.id === unitId);
    if (unit) {
      renderContextBar(refs, { title: unit.title });
      pushRecent({
        type: 'unit',
        id: unit.id,
        title: unit.title,
        opened_at: new Date().toISOString()
      });
    }
    renderUnitStub(refs.canvas, curriculum, unitId);
  });
}

function renderTeacherLessonsRoute(token: number): void {
  const refs = mountTeacherShell();
  renderContextBar(refs, { title: 'Lessons' });
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading…');

  void loadNavAndHandleErrors(refs, token, 'lessons', undefined, (curriculum) => {
    teardownLessonsIndex();
    lessonsIndexHandle = renderLessonsIndex(refs.canvas, curriculum, {
      onCreated: (kind, id) => handleEntityCreated(refs, token, kind, id)
    });
  });
}

function renderTeacherLessonRoute(lessonId: string, token: number): void {
  const refs = mountTeacherShell();
  renderRailStatus(refs.railNav, 'Loading curriculum…');

  // The lesson editor owns the context bar title (and Save/Publish controls)
  // once the draft loads, so the curriculum load below is only used to
  // populate and highlight the rail nav.
  lessonEditorHandle = mountLessonEditor({
    refs,
    lessonId,
    isStale: () => token !== renderToken
  });

  void loadNavAndHandleErrors(refs, token, 'lessons', undefined, (curriculum) => {
    const lesson = curriculum.lessons.find((entry) => entry.id === lessonId);
    if (!lesson) return;
    pushRecent({
      type: 'lesson',
      id: lesson.id,
      title: lesson.title || 'Untitled lesson',
      opened_at: new Date().toISOString()
    });
  });
}

function renderStudentLessonRoute(
  lessonId: string,
  token: number,
  classId?: string
): void {
  studentLessonViewHandle = mountStudentLessonView({
    root: appRoot,
    lessonId,
    classId,
    isStale: () => token !== renderToken
  });
}

function renderStudentUnitRoute(unitId: string, token: number): void {
  studentUnitViewHandle = mountStudentUnitView({
    root: appRoot,
    unitId,
    isStale: () => token !== renderToken
  });
}

function renderStudentClassRoute(classId: string, token: number): void {
  studentClassViewHandle = mountStudentClassView({
    root: appRoot,
    classId,
    isStale: () => token !== renderToken
  });
}

function renderRoute(match: RouteMatch, token: number): void {
  switch (match.name) {
    case 'teacher-home':
      renderTeacherHomeRoute(token);
      break;
    case 'teacher-classes':
      renderTeacherClassesRoute(token);
      break;
    case 'teacher-class':
      renderTeacherClassRoute(match.params.classId, token);
      break;
    case 'teacher-resources':
      renderTeacherResourcesRoute(token);
      break;
    case 'teacher-templates':
      renderTeacherTemplatesRoute(token);
      break;
    case 'teacher-scope-sequences':
      renderTeacherScopeSequencesRoute(token);
      break;
    case 'teacher-scope-sequence':
      renderTeacherScopeSequenceRoute(match.params.subjectId, token);
      break;
    case 'teacher-units':
      renderTeacherUnitsRoute(token);
      break;
    case 'teacher-unit':
      renderTeacherUnitRoute(match.params.unitId, token);
      break;
    case 'teacher-lessons':
      renderTeacherLessonsRoute(token);
      break;
    case 'teacher-lesson':
      renderTeacherLessonRoute(match.params.lessonId, token);
      break;
    case 'student-lesson':
      renderStudentLessonRoute(match.params.lessonId, token);
      break;
    case 'student-class-lesson':
      renderStudentLessonRoute(match.params.lessonId, token, match.params.classId);
      break;
    case 'student-unit':
      renderStudentUnitRoute(match.params.unitId, token);
      break;
    case 'student-class':
      renderStudentClassRoute(match.params.classId, token);
      break;
    default:
      break;
  }
}

async function handleRoute(match: RouteMatch): Promise<void> {
  renderToken += 1;
  const token = renderToken;

  // Every route change navigates away from whatever was previously mounted,
  // so flush any pending lesson edits — and wait for that flush to settle —
  // before tearing the editor down.
  await teardownLessonEditor();
  teardownTeacherHome();
  teardownScopeIndex();
  teardownClassesIndex();
  teardownUnitsIndex();
  teardownLessonsIndex();
  teardownStudentLessonView();
  teardownStudentUnitView();
  teardownStudentClassView();

  if (match.requiresAuth && !session.authenticated) {
    navigate('/sign-in', { replace: true });
    return;
  }

  if (match.name === 'sign-in') {
    if (session.authenticated) {
      navigate('/', { replace: true });
      return;
    }

    renderSignIn(appRoot, {
      onSuccess: (nextSession) => {
        session = nextSession;
        navigate('/');
      }
    });
    return;
  }

  renderRoute(match, token);
}

async function init(): Promise<void> {
  try {
    session = await fetchSession();
  } catch {
    session = { authenticated: false };
  }

  window.addEventListener('beforeunload', () => {
    // Browsers don't support awaiting async work in `beforeunload`, so this
    // remains a best-effort attempt for an actual tab close/reload; the
    // awaited flush in `teardownLessonEditor` covers in-app navigation.
    void lessonEditorHandle?.flush();
  });

  window.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
    if (!session.authenticated) return;
    if (location.pathname.startsWith('/s/')) return;
    event.preventDefault();
    openTeacherSearch();
  });

  start((match) => {
    void handleRoute(match);
  });
}

void init();
