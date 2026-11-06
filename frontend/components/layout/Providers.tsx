'use client';

import { useEffect, type ReactNode } from 'react';
import { ThemeProvider, useTheme } from 'next-themes';
import { SWRConfig } from 'swr';
import { MotionConfig } from 'framer-motion';
import { AuthProvider, useAuth } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import { ToastProvider } from '@/components/ui/Toast';
import { fetcher } from '@/lib/api';
import type { Language } from '@/types';

/** Applies the signed-in user's saved theme preference. */
function ThemeSync() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const pref = user?.preferences.theme;
  useEffect(() => {
    if (pref) setTheme(pref);
  }, [pref, setTheme]);
  return null;
}

/** Applies display preferences (font size, code wrapping, reduced motion) to <html>. */
function PreferenceEffects({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const prefs = user?.preferences;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.font = prefs?.fontSize ?? 'medium';
    root.dataset.codeWrap = String(prefs?.codeWrap ?? false);
    root.dataset.reduceMotion = String(prefs?.reduceMotion ?? false);
  }, [prefs?.fontSize, prefs?.codeWrap, prefs?.reduceMotion]);
  return <MotionConfig reducedMotion={prefs?.reduceMotion ? 'always' : 'user'}>{children}</MotionConfig>;
}

function LanguageBridge({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const lang = (user?.preferences.language ?? 'en') as Language;
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <I18nProvider lang={lang}>{children}</I18nProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SWRConfig value={{ fetcher, shouldRetryOnError: false }}>
        <ToastProvider>
          <AuthProvider>
            <ThemeSync />
            <LanguageBridge>
              <PreferenceEffects>{children}</PreferenceEffects>
            </LanguageBridge>
          </AuthProvider>
        </ToastProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
