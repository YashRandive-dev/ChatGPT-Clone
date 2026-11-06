'use client';

import { memo, isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CodeBlock } from './CodeBlock';
import { cn } from '@/lib/utils';

function languageOf(node: ReactNode): string {
  if (isValidElement<{ className?: string }>(node)) {
    const match = /language-([\w+#-]+)/.exec(node.props.className ?? '');
    return match?.[1] ?? '';
  }
  return '';
}

const components: Components = {
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    const lang = languageOf(child);
    const inner = isValidElement<{ children?: ReactNode }>(child) ? child.props.children : children;
    return <CodeBlock language={lang}>{inner}</CodeBlock>;
  },
  a({ href, children }) {
    // Only allow safe link protocols; react-markdown already strips javascript: URLs.
    const safe = href && /^(https?:|mailto:|#|\/)/i.test(href) ? href : undefined;
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="table-wrap scroll-thin">
        <table>{children}</table>
      </div>
    );
  },
  img({ src, alt }) {
    // Remote images in model output are shown as links to avoid tracking pixels.
    return typeof src === 'string' && /^https?:/i.test(src) ? (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">
        {alt || src}
      </a>
    ) : null;
  },
};

/**
 * Renders model output as GitHub-flavoured Markdown. Raw HTML is NOT rendered (no
 * rehype-raw), which keeps AI output from injecting scripts or markup (XSS-safe).
 */
export const Markdown = memo(function Markdown({ content, streaming, className }: { content: string; streaming?: boolean; className?: string }) {
  return (
    <div className={cn('markdown', streaming && 'stream-caret-container', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false }]]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
