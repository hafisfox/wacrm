'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import {
  MIN_PASSWORD_LENGTH,
  passwordLengthError,
} from '@/lib/auth/password-policy';

type LinkState = 'checking' | 'ready' | 'invalid' | 'complete';

export default function ResetPasswordPage() {
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setLinkState(data.session ? 'ready' : 'invalid');
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const lengthError = passwordLengthError(password);
    if (lengthError) {
      setError(lengthError);
      return;
    }
    if (password !== confirm) {
      setError('New password and confirmation do not match');
      return;
    }

    setError(null);
    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      console.error('[reset-password] update failed:', updateError.message);
      setError('This reset link is no longer valid. Request a new one.');
      setSaving(false);
      return;
    }

    await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined);
    setSaving(false);
    setLinkState('complete');
  }

  return (
    <main className="auth-page">
      <Card className="auth-card">
        <CardHeader className="items-center text-center">
          <div className="auth-mark" aria-hidden>
            {linkState === 'complete' ? (
              <CheckCircle2 className="size-6" />
            ) : (
              <KeyRound className="size-6" />
            )}
          </div>
          <CardTitle className="text-xl">
            {linkState === 'complete'
              ? 'Password updated'
              : 'Choose a new password'}
          </CardTitle>
          <CardDescription>
            {linkState === 'complete'
              ? 'Your account is secure. Sign in again with your new password.'
              : `Use at least ${MIN_PASSWORD_LENGTH} characters.`}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {linkState === 'checking' ? (
            <div
              className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" />
              Checking reset link…
            </div>
          ) : null}

          {linkState === 'invalid' ? (
            <div className="space-y-4 text-center">
              <p className="text-muted-foreground text-sm leading-6">
                This password-reset link has expired or has already been used.
              </p>
              <Button
                className="min-h-12 w-full"
                render={<Link href="/forgot-password" />}
              >
                Request a new link
              </Button>
            </div>
          ) : null}

          {linkState === 'complete' ? (
            <Button
              className="min-h-12 w-full"
              render={<Link href="/login?reset=success" />}
            >
              Sign in
            </Button>
          ) : null}

          {linkState === 'ready' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={saving}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">
                  Confirm new password
                </Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  disabled={saving}
                  required
                />
              </div>
              {error ? (
                <p className="auth-alert auth-alert-error" role="alert">
                  {error}
                </p>
              ) : null}
              <Button
                type="submit"
                className="min-h-12 w-full"
                disabled={saving || !password || !confirm}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? 'Updating password…' : 'Update password'}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
