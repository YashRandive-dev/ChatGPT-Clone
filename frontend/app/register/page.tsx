'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Misc';
import { PasswordStrength } from '@/components/ui/PasswordStrength';
import { useAuth } from '@/lib/auth';
import { ApiError, errorMessage } from '@/lib/api';
import { validateEmail, validatePassword } from '@/lib/validation';

export default function RegisterPage() {
  const { register, user, loading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [justRegistered, setJustRegistered] = useState(false);
  useEffect(() => {
    if (!loading && user && !justRegistered) router.replace(user.emailVerified ? '/chat' : '/verify-email');
  }, [user, loading, router, justRegistered]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = {
      name: form.name.trim() ? null : 'Name is required',
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      confirm: form.password === form.confirm ? null : 'Passwords do not match',
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSubmitting(true);
    setFormError(null);
    try {
      setJustRegistered(true);
      await register(form.name.trim(), form.email.trim(), form.password);
      // A 6-digit code was emailed; confirm it before chatting.
      router.replace('/verify-email?sent=1');
    } catch (err) {
      setJustRegistered(false);
      if (err instanceof ApiError && err.status === 409) setErrors((e) => ({ ...e, email: err.message }));
      else setFormError(errorMessage(err, 'Could not create your account'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start chatting with Kairo in seconds."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert>{formError}</Alert>}
        <Input label="Name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} placeholder="Ada Lovelace" maxLength={80} />
        <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="you@example.com" />
        <div>
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
            hint="At least 8 characters, including a letter and a number."
          />
          <PasswordStrength password={form.password} />
        </div>
        <Input label="Confirm password" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
        <Button type="submit" className="w-full" size="lg" loading={submitting}>
          Create account
        </Button>
        <p className="text-center text-xs text-muted">We’ll email you a 6-digit code to verify your address.</p>
      </form>
    </AuthLayout>
  );
}
