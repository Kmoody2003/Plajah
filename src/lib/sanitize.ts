/**
 * Minimal HTML sanitizer using the browser's own DOMParser.
 * Strips <script>, <iframe>, <object>, <embed>, <form>, <input> and all
 * on* event-handler attributes. Safe for rendering externally-sourced HTML
 * (fediverse statuses, rich-text articles) without adding a dependency.
 *
 * For full sanitization coverage, replace with DOMPurify.
 */

const FORBIDDEN_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed',
  'form', 'input', 'button', 'base', 'link', 'meta',
  'noscript', 'template', 'slot',
]);

const FORBIDDEN_ATTRS_PREFIX = ['on']; // strips all on* attributes

function stripNode(node: Element): void {
  // Remove disallowed tags
  const tag = node.tagName.toLowerCase();
  if (FORBIDDEN_TAGS.has(tag)) {
    node.parentNode?.removeChild(node);
    return;
  }

  // Strip dangerous attributes
  const toRemove: string[] = [];
  for (const attr of Array.from(node.attributes)) {
    const name = attr.name.toLowerCase();
    if (FORBIDDEN_ATTRS_PREFIX.some(p => name.startsWith(p))) toRemove.push(attr.name);
    if (name === 'href' || name === 'src' || name === 'action') {
      const val = attr.value.trim().toLowerCase();
      if (val.startsWith('javascript:') || val.startsWith('data:text/html')) {
        toRemove.push(attr.name);
      }
    }
  }
  toRemove.forEach(n => node.removeAttribute(n));

  // Recurse into children (iterate copy because we may mutate)
  Array.from(node.children).forEach(stripNode);
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  Array.from(doc.body.children).forEach(stripNode);
  return doc.body.innerHTML;
}
