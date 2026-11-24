import { useMemo } from 'react';
import { renderSafeHtml } from '@/lib/markdown';
import { cn } from '@/lib/utils';

export function MarkdownContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const html = useMemo(() => renderSafeHtml(content), [content]);

  return (
    <div
      className={cn('prose-user break-words', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
