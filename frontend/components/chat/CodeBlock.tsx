'use client';

import { memo, useRef } from 'react';
import { Check, Copy } from 'lucide-react';
import { useCopy } from '@/hooks/useCopy';

/** Fenced code block with language label and copy button. Children are highlighted nodes. */
export const CodeBlock = memo(function CodeBlock({ language, children }: { language: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const { copied, copy } = useCopy();
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border bg-code-bg">
      <div className="flex items-center justify-between bg-code-header px-3.5 py-1.5 text-xs text-muted">
        <span className="font-mono lowercase">{language || 'text'}</span>
        <button
          type="button"
          onClick={() => copy(ref.current?.innerText ?? '')}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-hover hover:text-fg"
          aria-label={copied ? 'Code copied' : 'Copy code'}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <pre className="code-pre scroll-thin overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code ref={ref} className="hljs font-mono">
          {children}
        </code>
      </pre>
    </div>
  );
});
