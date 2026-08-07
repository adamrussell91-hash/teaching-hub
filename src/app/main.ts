import { fetchSession, renderSignIn, type SessionInfo } from '@/auth/gate';
import { navigate, start, type RouteMatch } from './router';

const root = document.querySelector('#app');
if (!(root instanceof HTMLElement)) {
  throw new Error('App root element #app not found');
}

const appRoot = root;

let session: SessionInfo = { authenticated: false };

function renderTeacherHome(): void {
  appRoot.replaceChildren();

  const heading = document.createElement('h1');
  heading.textContent = 'Teacher workspace';
  appRoot.append(heading);
}

function renderTeacherLesson(lessonId: string): void {
  appRoot.replaceChildren();

  const heading = document.createElement('h1');
  heading.textContent = 'Lesson editor';
  const detail = document.createElement('p');
  detail.textContent = lessonId;
  appRoot.append(heading, detail);
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

function renderRoute(match: RouteMatch): void {
  switch (match.name) {
    case 'teacher-home':
      renderTeacherHome();
      break;
    case 'teacher-lesson':
      renderTeacherLesson(match.params.lessonId);
      break;
    case 'student-lesson':
      renderStudentLesson(match.params.lessonId);
      break;
    default:
      break;
  }
}

async function handleRoute(match: RouteMatch): Promise<void> {
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

  renderRoute(match);
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
