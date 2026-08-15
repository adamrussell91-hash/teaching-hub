export interface TeacherShellRefs {
  root: HTMLElement;
  rail: HTMLElement;
  railNav: HTMLElement;
  main: HTMLElement;
  contextBar: HTMLElement;
  canvas: HTMLElement;
  jobsHost: HTMLElement;
  logoutButton: HTMLButtonElement | null;
}

export interface TeacherShellOptions {
  onLogout?: () => void | Promise<void>;
}

/**
 * Builds the teacher chrome (rail / main / context bar / canvas) and returns
 * references to the mount points callers render into. Replaces any existing
 * content in `root`.
 */
export function renderTeacherShell(
  root: HTMLElement,
  options: TeacherShellOptions = {}
): TeacherShellRefs {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'teacher-layout';

  const rail = document.createElement('nav');
  rail.className = 'teacher-layout__rail';
  rail.setAttribute('aria-label', 'Curriculum navigation');

  const brandRow = document.createElement('div');
  brandRow.className = 'teacher-layout__rail-brand-row';

  const brand = document.createElement('p');
  brand.className = 'teacher-layout__rail-brand';
  brand.textContent = 'Teaching Hub';

  const jobsHost = document.createElement('div');
  jobsHost.className = 'teacher-layout__jobs';
  jobsHost.dataset.jobsHost = '';

  let logoutButton: HTMLButtonElement | null = null;
  if (options.onLogout) {
    logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.className = 'teacher-layout__logout';
    logoutButton.textContent = 'Sign out';
    logoutButton.addEventListener('click', () => {
      if (!logoutButton) return;
      logoutButton.disabled = true;
      void Promise.resolve(options.onLogout?.()).finally(() => {
        if (logoutButton) logoutButton.disabled = false;
      });
    });
    brandRow.append(brand, jobsHost, logoutButton);
  } else {
    brandRow.append(brand, jobsHost);
  }

  const railNav = document.createElement('div');
  railNav.className = 'teacher-layout__rail-nav';

  rail.append(brandRow, railNav);

  const main = document.createElement('div');
  main.className = 'teacher-layout__main';

  const contextBar = document.createElement('div');
  contextBar.className = 'teacher-layout__context-bar';
  contextBar.hidden = true;

  const canvas = document.createElement('div');
  canvas.className = 'teacher-layout__canvas';

  main.append(contextBar, canvas);
  layout.append(rail, main);
  root.append(layout);

  return { root, rail, railNav, main, contextBar, canvas, jobsHost, logoutButton };
}

export interface ContextBarConfig {
  title: string;
  /** Placeholder text for the save-state indicator; wired up fully in Task 15. */
  saveState?: string;
}

/**
 * Renders the context bar title + a stable save-state slot. Task 15's
 * save/publish controls locate the slot via `[data-save-slot]`.
 */
export function renderContextBar(refs: TeacherShellRefs, config: ContextBarConfig): void {
  refs.contextBar.hidden = false;
  refs.contextBar.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'teacher-layout__context-bar-title';
  title.textContent = config.title;

  const saveSlot = document.createElement('span');
  saveSlot.className = 'teacher-layout__context-bar-save-slot';
  saveSlot.dataset.saveSlot = 'true';
  saveSlot.textContent = config.saveState ?? '';

  refs.contextBar.append(title, saveSlot);
}

/** Renders a lightweight status line into the rail nav mount point. */
export function renderRailStatus(railNav: HTMLElement, text: string): void {
  railNav.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__rail-status';
  status.textContent = text;
  railNav.append(status);
}

/** Renders a lightweight status line into the canvas mount point. */
export function renderCanvasStatus(canvas: HTMLElement, text: string): void {
  canvas.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__canvas-status';
  status.textContent = text;
  canvas.append(status);
}
