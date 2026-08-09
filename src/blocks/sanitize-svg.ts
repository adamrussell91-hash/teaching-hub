const ALLOWED_TAGS = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'title',
  'desc',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'use',
  'symbol'
]);

const ALLOWED_ATTRS = new Set([
  'id',
  'class',
  'viewbox',
  'xmlns',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'transform',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'width',
  'height',
  'points',
  'text-anchor',
  'font-size',
  'font-family',
  'dx',
  'dy',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'clip-path',
  'mask',
  'href',
  'xlink:href'
]);

const STRIP_TAGS = new Set(['script', 'style']);

function isSafeHref(value: string): boolean {
  const v = value.trim();
  return v.startsWith('#') || v.startsWith('data:image/svg+xml');
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function serializeTagName(tag: string): string {
  // Preserve conventional SVG camelCase in output for known tags.
  const camel: Record<string, string> = {
    lineargradient: 'linearGradient',
    radialgradient: 'radialGradient',
    clippath: 'clipPath'
  };
  return camel[tag] ?? tag;
}

export function sanitizeSvgMarkup(markup: string): string {
  // happy-dom's text/html parser drops SVG children; XML preserves them.
  const doc = new DOMParser().parseFromString(
    `<sanitize-root>${markup}</sanitize-root>`,
    'application/xml'
  );

  if (doc.getElementsByTagName('parsererror').length > 0) {
    return '';
  }

  const root = doc.documentElement;
  if (!root) return '';

  function clean(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (STRIP_TAGS.has(tag)) {
      return '';
    }

    if (!ALLOWED_TAGS.has(tag)) {
      return Array.from(el.childNodes).map(clean).join('');
    }

    const attrs: string[] = [];
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) continue;
      if (!ALLOWED_ATTRS.has(name)) continue;
      if ((name === 'href' || name === 'xlink:href') && !isSafeHref(attr.value)) continue;
      attrs.push(`${attr.name}="${escapeAttr(attr.value)}"`);
    }

    const outTag = serializeTagName(tag);
    const inner = Array.from(el.childNodes).map(clean).join('');
    return `<${outTag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>${inner}</${outTag}>`;
  }

  return Array.from(root.childNodes).map(clean).join('');
}
