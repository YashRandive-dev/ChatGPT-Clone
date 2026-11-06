import { RequireAuth } from '@/components/layout/RequireAuth';
import { AdminShell } from '@/components/admin/AdminShell';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth admin>
      <AdminShell>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AdminShell>
    </RequireAuth>
  );
}
