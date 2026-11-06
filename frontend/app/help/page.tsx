'use client';

import { useState } from 'react';
import { ChevronDown, Keyboard, LifeBuoy, Mail } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Misc';
import { cn } from '@/lib/utils';

const faqs = [
  { q: 'How do I start a new conversation?', a: 'Click “New chat” in the sidebar (or press Ctrl/⌘ + Shift + O). Your conversation is saved automatically after the first message.' },
  { q: 'Can Kairo read my files?', a: 'Yes. Attach PDF, Word (.docx), text, Markdown, CSV, JSON or image files (up to 10 MB, 5 per message) with the paperclip button, drag-and-drop or paste. The text is extracted securely on the server and sent to the AI as context. Images are analysed by models that support vision.' },
  { q: 'How do I stop or redo a response?', a: 'Press the stop button while a reply is streaming. Use the regenerate button under any AI reply to get a new answer, or edit one of your messages to branch the conversation from that point.' },
  { q: 'Who can see my conversations?', a: 'Only you. Shared links show a read-only copy until you disable them. Administrators can see conversation titles and usage statistics; message content is only visible to admins if your workspace explicitly enables it.' },
  { q: 'Why is a model marked unavailable?', a: 'Your administrator controls which AI models are enabled. Unavailable models cannot be selected; pick another one from the model menu.' },
  { q: 'How do I export or delete my data?', a: 'Go to Settings → Data controls to export all conversations as JSON, delete all chats, or delete your account permanently.' },
];

const shortcuts = [
  ['Send message', 'Enter'],
  ['New line', 'Shift + Enter'],
  ['Search chats', 'Ctrl/⌘ + K'],
  ['New chat', 'Ctrl/⌘ + Shift + O'],
  ['Cancel edit', 'Esc'],
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <PageHeader title="Help & support" description="Answers to common questions and ways to reach us." />
        <Card className="p-2">
          {faqs.map((f, i) => (
            <div key={f.q} className="border-b border-border last:border-0">
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center justify-between gap-4 px-3 py-4 text-left text-sm font-medium text-fg">
                {f.q}
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open === i && 'rotate-180')} />
              </button>
              {open === i && <p className="px-3 pb-4 text-sm leading-relaxed text-muted">{f.a}</p>}
            </div>
          ))}
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-fg">
              <Keyboard className="h-4 w-4 text-accent" /> Keyboard shortcuts
            </h2>
            <ul className="space-y-2 text-sm">
              {shortcuts.map(([label, keys]) => (
                <li key={label} className="flex justify-between gap-3">
                  <span className="text-muted">{label}</span>
                  <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg">{keys}</kbd>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-fg">
              <LifeBuoy className="h-4 w-4 text-accent" /> Contact support
            </h2>
            <p className="text-sm text-muted">Something not working? Use the 👍 / 👎 buttons on replies to send feedback, or email your workspace administrator.</p>
            <a href="mailto:support@kairo.local" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline">
              <Mail className="h-4 w-4" /> support@kairo.local
            </a>
          </Card>
        </div>
      </div>
    </div>
  );
}
