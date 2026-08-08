function renderPlaceholder(canvas: HTMLElement, title: string, message: string): void {
  canvas.replaceChildren();
  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = title;
  const body = document.createElement('p');
  body.className = 'teacher-layout__canvas-status';
  body.textContent = message;
  canvas.append(heading, body);
}

export function renderResourcesPlaceholder(canvas: HTMLElement): void {
  renderPlaceholder(canvas, 'Resource Library', 'Resource Library is coming next.');
}
