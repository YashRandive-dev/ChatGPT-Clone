'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Misc';
import { useToast } from '@/components/ui/Toast';
import { useCountdown } from '@/hooks/useCountdown';
import { useAuth } from '@/lib/auth';
import { ApiError, errorMessage } from '@/lib/api';
import { validateEmail } from '@/lib/validation';
import { authService } from '@/services/authService';
import type { LoginChallenge } from '@/types';

function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';
}

function LoginForm() {
  const { login, verifyLogin, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(params.get('expired') ? 'Your session expired. Please sign in again.' : null);
  const [submitting, setSubmitting] = useState(false);
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [code, setCode] = useState('');
  const cooldown = useCountdown();

  useEffect(() => {
    if (!loading && user) router.replace(safeNext(params.get('next')));
  }, [user, loading, router, params]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = { email: validateEmail(email), password: password ? null : 'Password is required' };
    setErrors(next);
    if (next.email || next.password) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await login(email.trim(), password);
      if ('twoFactorRequired' in result) {
        setChallenge(result);
        setCode('');
        cooldown.start(result.resendInSeconds);
        return;
      }
      router.replace(safeNext(params.get('next')));
    } catch (err) {
      setFormError(errorMessage(err, 'Could not sign in'));
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(value = code) {
    if (!challenge || value.length !== 6 || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await verifyLogin(challenge.challengeToken, value);
      router.replace(safeNext(params.get('next')));
    } catch (err) {
      setFormError(errorMessage(err));
      setCode('');
      if (err instanceof ApiError && (err.code === 'CHALLENGE_EXPIRED' || err.code === 'TOO_MANY_ATTEMPTS')) {
        setChallenge(null);
        setPassword('');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    if (!challenge) return;
    try {
      const res = await authService.loginResend(challenge.challengeToken);
      cooldown.start(res.resendInSeconds);
      toast('A new sign-in code is on its way', 'success');
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  if (challenge) {
    return (
      <AuthLayout title="Two-step verification" subtitle={`Enter the 6-digit sign-in code we sent to ${challenge.email}.`}>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <ShieldCheck className="h-6 w-6" />
          </div>
          {formError && <Alert>{formError}</Alert>}
          <OtpInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} disabled={submitting} error={Boolean(formError)} />
          <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={code.length !== 6}>
            Verify and sign in
          </Button>
          <div className="flex items-center justify-between text-sm text-muted">
            <button
              type="button"
              onClick={() => {
                setChallenge(null);
                setFormError(null);
              }}
              className="flex items-center gap-1 hover:text-fg"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            {cooldown.running ? (
              <span className="tabular-nums">Resend in {cooldown.left}s</span>
            ) : (
              <button type="button" onClick={resend} className="font-medium text-accent hover:underline">
                Resend code
              </button>
            )}
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your conversations."
      footer={
        <>
          Don’t have an account?{' '}
          <Link href="/register" className="font-medium text-accent hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert>{formError}</Alert>}
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="you@example.com" />
        <div>
          <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
          <div className="mt-2 text-right">
            <Link href="/forgot-password" className="text-sm text-accent hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={submitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
