'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Misc';
import { PasswordStrength } from '@/components/ui/PasswordStrength';
import { StepDots } from '@/components/ui/StepDots';
import { authService } from '@/services/authService';
import { errorMessage } from '@/lib/api';
import { validatePassword } from '@/lib/validation';
import { clearResetSession, readResetSession } from '@/lib/resetSession';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';

/** Password recovery, step 3: choose a new password using the verified reset session. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { setUser } = useAuth();
  const [session, setSession] = useState<ReturnType<typeof readResetSession> | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setSession(readResetSession()), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const next = { password: validatePassword(password), confirm: password === confirm ? null : 'Passwords do not match' };
    setErrors(next);
    if (next.password || next.confirm) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await authService.resetPassword(session.token, password);
      clearResetSession();
      setUser(null);
      toast('Password updated. Sign in with your new password.', 'success');
      router.replace('/login');
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (session === undefined) return null;

  if (!session) {
    return (
      <AuthLayout title="Reset session expired" subtitle="For your security, password reset sessions last 15 minutes and work only once.">
        <Link href="/forgot-password" className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-accent font-medium text-accent-fg hover:bg-accent-hover">
          Get a new code
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle={`Code verified for ${session.email}. You’ll be signed out of all devices.`}
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <StepDots step={3} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert>{formError}</Alert>}
        <div>
          <Input label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} autoFocus />
          <PasswordStrength password={password} />
        </div>
        <Input label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <Button type="submit" className="w-full" size="lg" loading={submitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
