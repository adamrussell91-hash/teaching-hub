import { ApiClientError } from '@/api/client';
import { fetchSession, renderSignIn, type SessionInfo } from '@/auth/gate';
import {
  renderCanvasStatus,
  renderContextBar,
  renderRailStatus,
  renderTeacherShell,
  type TeacherShellRefs
} from '@/teacher/shell';
import { fetchCurriculum, renderCurriculumNav, type CurriculumResponse } from '@/teacher/nav';
import { renderTeacherHome as renderHomeCanvas } from '@/teacher/home';
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

function getCurriculum(): Promise<CurriculumResponse> {
  if (!curriculumPromise) {
    curriculumPromise = fetchCurriculum().catch((error: unknown) => {
      curriculumPromise = null;
      throw error;
    });
  }
  return curriculumPromise;
}

async function loadNavAndHandleErrors(
  refs: TeacherShellRefs,
  token: number,
  activeLessonId: string | undefined,
  onLoaded: (curriculum: CurriculumResponse) => void
): Promise<void> {
  try {
    const curriculum = await getCurriculum();
    if (token !== renderToken) return;
    renderCurriculumNav(refs.railNav, curriculum, { activeLessonId });
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
  const refs = renderTeacherShell(appRoot);
  renderContextBar(refs, { title: 'Teacher workspace' });
  renderRailStatus(refs.railNav, 'Loading curriculum…');
  renderCanvasStatus(refs.canvas, 'Loading lessons…');

  void loadNavAndHandleErrors(refs, token, undefined, (curriculum) => {
    renderHomeCanvas(refs.canvas, curriculum);
  });
}

function renderTeacherLessonRoute(lessonId: string, token: number): void {
  const refs = renderTeacherShell(appRoot);
  renderContextBar(refs, { title: 'Untitled lesson' });
  renderRailStatus(refs.railNav, 'Loading curriculum…');

  const placeholder = document.createElement('p');
  placeholder.className = 'teacher-layout__canvas-status';
  placeholder.textContent = 'Lesson editor coming in Task 15.';
  refs.canvas.append(placeholder);

  void loadNavAndHandleErrors(refs, token, lessonId, (curriculum) => {
    const summary = curriculum.lessons.find((lesson) => lesson.id === lessonId);
    renderContextBar(refs, { title: summary?.title ?? lessonId });
  });
}

function renderStudentLesson(lessonId: string): void {
  appRoot.replaceChildren();

  const surface = document.createElement('div');
  surface.className = 'student-surface';

  const header = document.createElement('header');
  header.className = 'student-surface__header';
  header.textContent = 'Teaching Hub';

  const content = document.createElement('div');
  content.className = 'student-surface__content';

  const title = document.createElement('h1');
  title.className = 'student-surface__title';
  title.textContent = 'Student lesson';

  const detail = document.createElement('p');
  detail.textContent = `${lessonId} (placeholder until Task 16)`;

  content.append(title, detail);
  surface.append(header, content);
  appRoot.append(surface);
}

function renderRoute(match: RouteMatch, token: number): void {
  switch (match.name) {
    case 'teacher-home':
      renderTeacherHomeRoute(token);
      break;
    case 'teacher-lesson':
      renderTeacherLessonRoute(match.params.lessonId, token);
      break;
    case 'student-lesson':
      renderStudentLesson(match.params.lessonId);
      break;
    default:
      break;
  }
}

async function handleRoute(match: RouteMatch): Promise<void> {
  renderToken += 1;
  const token = renderToken;

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

  start((match) => {
    void handleRoute(match);
  });
}

void init();
