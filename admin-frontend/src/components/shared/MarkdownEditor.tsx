import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bold,
  Code,
  Columns2,
  Eye,
  FileCode2,
  Heading,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  PencilLine,
  Quote,
  Strikethrough,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type ViewMode = 'edit' | 'split' | 'preview';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export function renderMarkdownToHtml(markdown: string): string {
  const parsed = marked.parse(markdown, { async: false, breaks: true, gfm: true });
  const fragment = DOMPurify.sanitize(parsed, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'start'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i,
  });
  for (const img of fragment.querySelectorAll('img[src]')) {
    if (!/^(?:https?:\/\/|\/(?!\/))/i.test(img.getAttribute('src')!)) img.removeAttribute('src');
  }
  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight = 'min-h-[260px]',
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ViewMode>('edit');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const renderedHtml = useMemo(() => renderMarkdownToHtml(value), [value]);

  const wrapSelection = (before: string, after = '', fallback = '') => {
    const el = textareaRef.current;
    if (!el) {
      onChange(`${value}${before}${fallback}${after}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || fallback;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + before.length + selected.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const prefixLine = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(`${value}${value && !value.endsWith('\n') ? '\n' : ''}${prefix}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const next = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + prefix.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const toolbarButtons = [
    { icon: Heading, title: t('common.markdown.heading'), onClick: () => prefixLine('## ') },
    { icon: Bold, title: t('common.markdown.bold'), onClick: () => wrapSelection('**', '**', 'bold') },
    { icon: Italic, title: t('common.markdown.italic'), onClick: () => wrapSelection('*', '*', 'italic') },
    { icon: Strikethrough, title: t('common.markdown.strike'), onClick: () => wrapSelection('~~', '~~', 'text') },
    { icon: List, title: t('common.markdown.ul'), onClick: () => prefixLine('- ') },
    { icon: ListOrdered, title: t('common.markdown.ol'), onClick: () => prefixLine('1. ') },
    { icon: Quote, title: t('common.markdown.quote'), onClick: () => prefixLine('> ') },
    { icon: Code, title: t('common.markdown.code'), onClick: () => wrapSelection('`', '`', 'code') },
    {
      icon: FileCode2,
      title: t('common.markdown.codeBlock'),
      onClick: () => wrapSelection('\n```\n', '\n```\n', 'code'),
    },
    {
      icon: Link2,
      title: t('common.markdown.link'),
      onClick: () => wrapSelection('[', '](https://example.com)', 'link'),
    },
    {
      icon: ImageIcon,
      title: t('common.markdown.image'),
      onClick: () => wrapSelection('![', '](https://example.com/image.png)', 'alt'),
    },
  ];

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b bg-muted/40 px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-0.5">
          {toolbarButtons.map((btn) => {
            const Icon = btn.icon;
            return (
              <Button
                key={btn.title}
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={btn.title}
                disabled={mode === 'preview'}
                onClick={btn.onClick}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 rounded-md border bg-background/60 p-0.5">
          <Button
            type="button"
            variant={mode === 'edit' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => setMode('edit')}
          >
            <PencilLine className="h-3 w-3" />
            {t('common.markdown.edit')}
          </Button>
          <Button
            type="button"
            variant={mode === 'split' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => setMode('split')}
          >
            <Columns2 className="h-3 w-3" />
            {t('common.markdown.split')}
          </Button>
          <Button
            type="button"
            variant={mode === 'preview' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => setMode('preview')}
          >
            <Eye className="h-3 w-3" />
            {t('common.markdown.preview')}
          </Button>
        </div>
      </div>

      <div className={mode === 'split' ? 'grid md:grid-cols-2 md:divide-x' : ''}>
        {mode !== 'preview' && (
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`${minHeight} resize-y rounded-none border-0 bg-transparent font-mono text-xs focus-visible:ring-0`}
          />
        )}
        {mode !== 'edit' && (
          <div className={`${minHeight} max-h-[380px] overflow-y-auto p-3 text-sm text-foreground`}>
            {renderedHtml ? (
              <div className="space-y-2 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h1]:text-lg [&_h2]:text-base [&_h3]:font-semibold [&_img]:max-h-64 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            ) : (
              <p className="text-xs text-muted-foreground">{t('common.markdown.emptyPreview')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
