'use client';

import { motion } from 'framer-motion';
import { Code2, GraduationCap, Lightbulb, Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useT, type TKey } from '@/lib/i18n';
import { greetingKey } from '@/lib/utils';
import { LogoMark } from '@/components/ui/Logo';

const suggestions: { icon: typeof Code2; title: TKey; prompt: TKey; color: string }[] = [
  { icon: GraduationCap, title: 'suggest.explain', prompt: 'suggest.explain.prompt', color: 'text-violet' },
  { icon: Code2, title: 'suggest.code', prompt: 'suggest.code.prompt', color: 'text-accent' },
  { icon: Lightbulb, title: 'suggest.ideas', prompt: 'suggest.ideas.prompt', color: 'text-warning' },
  { icon: Mail, title: 'suggest.email', prompt: 'suggest.email.prompt', color: 'text-danger' },
];

export function WelcomeScreen({ onPick, showSuggestions = true }: { onPick: (prompt: string) => void; showSuggestions?: boolean }) {
  const { user } = useAuth();
  const { t } = useT();
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <div className="flex flex-col items-center px-4 text-center">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.4 }}>
        <LogoMark size={48} />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mt-5 text-2xl font-semibold tracking-tight text-fg sm:text-3xl"
      >
        {t(`greeting.${greetingKey()}`)}
        {firstName ? `, ${firstName}` : ''}
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-2 text-muted">
        {t('welcome.subtitle')}
      </motion.p>
      {showSuggestions && (
      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {suggestions.map(({ icon: Icon, title, prompt, color }, i) => (
          <motion.button
            key={title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 + i * 0.05 }}
            onClick={() => onPick(t(prompt))}
            className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-soft"
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${color}`} />
            <span>
              <span className="block text-sm font-medium text-fg">{t(title)}</span>
              <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{t(prompt)}</span>
            </span>
          </motion.button>
        ))}
      </div>
      )}
    </div>
  );
}
