'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { OtpInput } from '@/components/ui/OtpInput';
import { Button } from '@/components/ui/Button';
import { Alert, Spinner } from '@/components/ui/Misc';
import { useToast } from '@/components/ui/Toast';
import { useCountdown } from '@/hooks/useCountdown';
import { authService } from '@/services/authService';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function VerifyEmail() {
  const { user, loading, config, setUser, logout } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [done, setDone] = useState(false);
  const cooldown = useCountdown(params.get('sent') ? config?.otp.resendCooldownSeconds ?? 60 : 0);
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/chat';

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent('/verify-email')}`);
  }, [loading, user, router]);

  async function submit(value = code) {
    if (value.length !== 6 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authService.verifyEmail(value);
      setUser(res.user);
      setDone(true);
      setTimeout(() => router.replace(next), 1200);
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setResending(true);
    setError(null);
    try {
      const res = await authService.resendVerification();
      cooldown.start(res.resendInSeconds ?? 60);
      setCode('');
      toast('A new code is on its way', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RESEND_COOLDOWN') cooldown.start((err.details as { retryAfter?: number })?.retryAfter ?? 60);
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
  }

  if (loading || !user) {
    return (
      <AuthLayout title="Verify your email">
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </AuthLayout>
    );
  }

  if (done || user.emailVerified) {
    return (
      <AuthLayout title="Email verified">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <p className="text-sm text-fg-2">
            <strong>{user.email}</strong> is verified. You’re all set.
          </p>
          <Button onClick={() => router.replace(next)}>Continue to Kairo</Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Check your email"
      subtitle={`Enter the 6-digit code we sent to ${user.email}. It expires in ${config?.otp.ttlMinutes ?? 10} minutes.`}
      footer={
        <span className="flex flex-col items-center gap-2">
          {!config?.requireEmailVerification && (
            <Link href={next} className="font-medium text-accent hover:underline">
              Skip for now
            </Link>
          )}
          <span>
            Wrong email?{' '}
            <Link href="/profile" className="font-medium text-accent hover:underline">
              Change it
            </Link>{' '}
            or{' '}
            <button onClick={() => void logout()} className="font-medium text-accent hover:underline">
              sign out
            </button>
          </span>
        </span>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <MailCheck className="h-6 w-6" />
        </div>
        {error && <Alert>{error}</Alert>}
        <OtpInput value={code} onChange={setCode} onComplete={(v) => void submit(v)} disabled={submitting} error={Boolean(error)} />
        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={code.length !== 6}>
          Verify email
        </Button>
        <p className="text-center text-sm text-muted">
          Didn’t get it? Check spam, or{' '}
          {cooldown.running ? (
            <span className="tabular-nums">resend in {cooldown.left}s</span>
          ) : (
            <button type="button" onClick={resend} disabled={resending} className="font-medium text-accent hover:underline disabled:opacity-60">
              {resending ? 'sending…' : 'resend the code'}
            </button>
          )}
        </p>
      </form>
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
