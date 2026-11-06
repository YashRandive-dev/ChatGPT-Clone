import Link from 'next/link';
import { LogoMark } from '@/components/ui/Logo';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark size={44} />
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted">The page you are looking for does not exist or was moved.</p>
      <Link href="/chat" className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover">
        Back to Kairo
      </Link>
    </main>
  );
}
