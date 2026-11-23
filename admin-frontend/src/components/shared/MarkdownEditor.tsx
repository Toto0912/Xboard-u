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

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|\/)/i.test(trimmed)) {
    return trimmed;
  }
  return '#';
}

function formatInlineMarkdown(text: string): string {
  let out = escapeHtml(text);
  // Inline code first
  const codeTokens: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = codeTokens.length;
    codeTokens.push(
      `<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">${code}</code>`,
    );
    return `\u0000CODE${idx}\u0000`;
  });

  // Images ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    const safe = sanitizeUrl(url);
    return `<img src="${safe}" alt="${alt}" class="my-2 max-h-64 rounded-md border object-contain" />`;
  });

  // Links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const safe = sanitizeUrl(url);
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2">${label}</a>`;
  });

  // Bold, italic, strikethrough
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx) => codeTokens[Number(idx)] ?? '');
  return out;
}

function renderMarkdownToHtml(markdown: string): string {
  if (!markdown.trim()) return '';

  // Extract fenced code blocks first
  const fenceTokens: string[] = [];
  const withPlaceholders = markdown.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = fenceTokens.length;
    fenceTokens.push(
      `<pre class="my-2 overflow-x-auto rounded-md border bg-muted/60 p-3 font-mono text-xs"><code class="language-${escapeHtml(lang)}">${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`,
    );
    return `\n\u0000FENCE${idx}\u0000\n`;
  });

  const lines = withPlaceholders.split(/\r?\n/);
  const html: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const fenceMatch = trimmed.match(/^\u0000FENCE(\d+)\u0000$/);
    if (fenceMatch) {
      closeLists();
      html.push(fenceTokens[Number(fenceMatch[1])] ?? '');
      continue;
    }

    if (!trimmed) {
      closeLists();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      const cls =
        level === 1
          ? 'mt-3 mb-1.5 text-lg font-bold'
          : level === 2
            ? 'mt-2.5 mb-1 text-base font-semibold'
            : 'mt-2 mb-1 text-sm font-semibold';
      html.push(`<h${level} class="${cls}">${formatInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^>\s+/.test(trimmed)) {
      closeLists();
      html.push(
        `<blockquote class="my-2 border-l-2 border-primary/60 pl-3 text-muted-foreground italic">${formatInlineMarkdown(trimmed.replace(/^>\s+/, ''))}</blockquote>`,
      );
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul class="my-1.5 list-disc space-y-1 pl-5">');
        inUl = true;
      }
      html.push(`<li>${formatInlineMarkdown(trimmed.replace(/^[-*+]\s+/, ''))}</li>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol class="my-1.5 list-decimal space-y-1 pl-5">');
        inOl = true;
      }
      html.push(`<li>${formatInlineMarkdown(trimmed.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }

    closeLists();
    html.push(`<p class="my-1.5 leading-relaxed">${formatInlineMarkdown(trimmed)}</p>`);
  }

  closeLists();
  return html.join('\n');
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
              <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            ) : (
              <p className="text-xs text-muted-foreground">{t('common.markdown.emptyPreview')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
