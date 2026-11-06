'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LogoMark } from '@/components/ui/Logo';

/** Client-side route guard. The API independently enforces auth on every request. */
export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading, config } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (config?.requireEmailVerification && !user.emailVerified) router.replace(`/verify-email?next=${encodeURIComponent(pathname)}`);
    else if (admin && user.role !== 'admin') router.replace('/chat');
  }, [user, loading, admin, router, pathname, config]);

  if (loading || !user || (admin && user.role !== 'admin') || (config?.requireEmailVerification && !user.emailVerified)) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <LogoMark size={40} className="animate-pulse" />
      </div>
    );
  }
  return <>{children}</>;
}
