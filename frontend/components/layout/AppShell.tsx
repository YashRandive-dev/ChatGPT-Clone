'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, SquarePen } from 'lucide-react';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { IconButton } from '@/components/ui/Button';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useT } from '@/lib/i18n';

interface NavCtx {
  collapsed: boolean;
  toggleCollapsed: () => void;
  closeMobile: () => void;
  MobileHeaderSlot: (props: { children: ReactNode }) => ReactNode;
}

const NavContext = createContext<NavCtx>({
  collapsed: false,
  toggleCollapsed: () => undefined,
  closeMobile: () => undefined,
  MobileHeaderSlot: () => null,
});
export const useMobileNav = () => useContext(NavContext);

const STORAGE_KEY = 'kairo:sidebar-collapsed';

/**
 * App frame: persistent sidebar on desktop (collapsible), slide-out drawer on tablet/mobile.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery('(min-width: 768px)', true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [headerEl, setHeaderEl] = useState<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const { t } = useT();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  }, []);

  const MobileHeaderSlot = useCallback(
    ({ children }: { children: ReactNode }) => (headerEl && !isDesktop ? createPortal(children, headerEl) : null),
    [headerEl, isDesktop],
  );

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, closeMobile: () => setMobileOpen(false), MobileHeaderSlot }),
    [collapsed, toggleCollapsed, MobileHeaderSlot],
  );

  return (
    <NavContext.Provider value={value}>
      <div className="flex h-dvh w-full overflow-hidden bg-bg">
        {/* Desktop sidebar */}
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 64 : 268 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
          className="hidden h-full shrink-0 overflow-hidden border-r border-border bg-sidebar md:block"
        >
          <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
        </motion.aside>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileOpen && !isDesktop && (
            <>
              <motion.div className="fixed inset-0 z-40 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
              <motion.aside
                className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[300px] border-r border-border bg-sidebar shadow-2xl"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={{ left: 0.3, right: 0 }}
                onDragEnd={(_, info) => info.offset.x < -80 && setMobileOpen(false)}
              >
                <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} mobile />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <main className="flex h-full min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between gap-1 border-b border-border px-2 md:hidden">
            <IconButton label="Open menu" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </IconButton>
            <div ref={setHeaderEl} className="flex min-w-0 flex-1 justify-center" />
            <Link href="/chat" aria-label={t('sidebar.newChat')} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg">
              <SquarePen className="h-5 w-5" />
            </Link>
          </header>
          <div className="min-h-0 flex-1">{children}</div>
        </main>
      </div>
    </NavContext.Provider>
  );
}
