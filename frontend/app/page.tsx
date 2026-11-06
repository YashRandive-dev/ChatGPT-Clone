'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Code2, FileText, Lock, MessagesSquare, Sparkles, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const features = [
  { icon: Zap, title: 'Real-time streaming', body: 'Answers appear word by word, and you can stop or regenerate at any moment.' },
  { icon: Code2, title: 'Built for code', body: 'Syntax-highlighted code blocks with language labels and one-click copy.' },
  { icon: FileText, title: 'Chat with files', body: 'Attach PDFs, Word documents, text files and images for context-aware answers.' },
  { icon: MessagesSquare, title: 'Never lose a thought', body: 'Every conversation is saved, searchable and organised by date.' },
  { icon: Lock, title: 'Private by design', body: 'HTTP-only sessions, encrypted passwords and strict per-user data isolation.' },
  { icon: Sparkles, title: 'Pick your model', body: 'Switch between the AI models your workspace enables, per conversation.' },
];

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user) router.replace('/chat');
  }, [user, loading, router]);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <ThemeToggle className="hidden md:inline-flex" />
          <Link href="/login" className="rounded-xl px-3.5 py-2 text-sm font-medium text-fg hover:bg-hover">
            Log in
          </Link>
          <Link href="/register" className="rounded-xl bg-fg px-3.5 py-2 text-sm font-medium text-bg hover:opacity-90">
            Sign up
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="relative flex flex-col items-center pt-16 pb-20 text-center sm:pt-24">
          <div className="pointer-events-none absolute inset-x-0 top-10 -z-0 mx-auto h-72 max-w-3xl rounded-full opacity-25 blur-3xl brand-gradient" />
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-fg-2"
          >
            <Sparkles className="h-3.5 w-3.5 text-accent" /> Your thinking partner, always on
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="relative max-w-3xl text-4xl font-semibold tracking-tight text-fg sm:text-6xl"
          >
            Ask anything. <span className="brand-text">Build everything.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative mt-5 max-w-xl text-lg text-muted"
          >
            Kairo is an AI assistant that writes, explains, codes and brainstorms with you — with your files, your history and your
            preferred model.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 font-medium text-accent-fg shadow-sm hover:bg-accent-hover">
              Start chatting free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="rounded-xl border border-border-strong px-5 py-3 font-medium text-fg hover:bg-hover">
              I have an account
            </Link>
          </motion.div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className="rounded-2xl border border-border bg-surface p-6"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-fg">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
            </motion.div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">© {new Date().getFullYear()} Kairo. Built with care.</footer>
    </div>
  );
}
