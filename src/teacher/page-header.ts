export interface PageHeaderConfig {
  eyebrow: string;
  title: string;
  supporting?: string;
  actions?: HTMLElement[];
}

export function renderPageHeader(host: HTMLElement, config: PageHeaderConfig): HTMLElement {
  const header = document.createElement('header');
  header.className = 'page-header';

  const copy = document.createElement('div');
  copy.className = 'page-header__copy';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'page-header__eyebrow';
  eyebrow.textContent = config.eyebrow;

  const title = document.createElement('h1');
  title.className = 'page-header__title';
  title.textContent = config.title;

  copy.append(eyebrow, title);
  if (config.supporting) {
    const supporting = document.createElement('p');
    supporting.className = 'page-header__supporting';
    supporting.textContent = config.supporting;
    copy.append(supporting);
  }

  header.append(copy);
  if (config.actions && config.actions.length > 0) {
    const actions = document.createElement('div');
    actions.className = 'page-header__actions';
    actions.append(...config.actions);
    header.append(actions);
  }

  host.prepend(header);
  return header;
}
