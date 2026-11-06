'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Misc';
import { useToast } from '@/components/ui/Toast';
import { useCountdown } from '@/hooks/useCountdown';
import { authService } from '@/services/authService';
import { ApiError, errorMessage } from '@/lib/api';
import { validateEmail } from '@/lib/validation';
import { saveResetSession } from '@/lib/resetSession';
import { StepDots } from '@/components/ui/StepDots';

/** Password recovery, steps 1–2: request a code by email, then verify it. Step 3 is /reset-password. */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cooldown = useCountdown();

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    const err = validateEmail(email);
    setEmailError(err);
    if (err) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authService.forgotPassword(email.trim());
      cooldown.start(res.resendInSeconds);
      setCode('');
      setStep('code');
      if (step === 'code') toast('If the account exists, a new code was sent', 'success');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(value = code) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authService.verifyResetCode(email.trim(), value);
      saveResetSession({ token: res.resetToken, email: email.trim(), expiresAt: Date.now() + res.expiresInSeconds * 1000 });
      router.push('/reset-password');
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
      if (err instanceof ApiError && (err.code === 'TOO_MANY_ATTEMPTS' || err.code === 'CODE_EXPIRED')) cooldown.start(0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={step === 'email' ? 'Forgot your password?' : 'Enter your code'}
      subtitle={
        step === 'email'
          ? 'Enter your account email and we’ll send you a 6-digit verification code.'
          : `If an account exists for ${email}, we sent a 6-digit code. It expires in 10 minutes.`
      }
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <StepDots step={step === 'email' ? 1 : 2} />
      {step === 'email' ? (
        <form onSubmit={requestCode} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} autoFocus />
          <Button type="submit" className="w-full" size="lg" loading={busy}>
            Send code
          </Button>
        </form>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <KeyRound className="h-6 w-6" />
          </div>
          {error && <Alert>{error}</Alert>}
          <OtpInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} disabled={busy} error={Boolean(error)} />
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>
            Verify code
          </Button>
          <div className="flex items-center justify-between text-sm text-muted">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setError(null);
              }}
              className="flex items-center gap-1 hover:text-fg"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Change email
            </button>
            {cooldown.running ? (
              <span className="tabular-nums">Resend in {cooldown.left}s</span>
            ) : (
              <button type="button" onClick={() => void requestCode()} disabled={busy} className="font-medium text-accent hover:underline">
                Resend code
              </button>
            )}
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
