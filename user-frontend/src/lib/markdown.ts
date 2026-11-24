import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderSafeHtml(raw: string): string {
  if (!raw) return '';
  const parsed = marked.parse(raw, { async: false }) as string;
  return DOMPurify.sanitize(parsed, {
    ADD_ATTR: ['target', 'rel', 'class'],
  });
}
