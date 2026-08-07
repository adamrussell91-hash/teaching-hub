export interface TeacherShellRefs {
  root: HTMLElement;
  rail: HTMLElement;
  railNav: HTMLElement;
  main: HTMLElement;
  contextBar: HTMLElement;
  canvas: HTMLElement;
}

/**
 * Builds the teacher chrome (rail / main / context bar / canvas) and returns
 * references to the mount points callers render into. Replaces any existing
 * content in `root`.
 */
export function renderTeacherShell(root: HTMLElement): TeacherShellRefs {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'teacher-layout';

  const rail = document.createElement('nav');
  rail.className = 'teacher-layout__rail';
  rail.setAttribute('aria-label', 'Curriculum navigation');

  const brand = document.createElement('p');
  brand.className = 'teacher-layout__rail-brand';
  brand.textContent = 'Teaching Hub';

  const railNav = document.createElement('div');
  railNav.className = 'teacher-layout__rail-nav';

  rail.append(brand, railNav);

  const main = document.createElement('div');
  main.className = 'teacher-layout__main';

  const contextBar = document.createElement('div');
  contextBar.className = 'teacher-layout__context-bar';

  const canvas = document.createElement('div');
  canvas.className = 'teacher-layout__canvas';

  main.append(contextBar, canvas);
  layout.append(rail, main);
  root.append(layout);

  return { root, rail, railNav, main, contextBar, canvas };
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
