'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MessageSquare, CheckCircle, ArrowLeft } from 'lucide-react';

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(() =>
    searchParams.get('error') === 'invalid_or_expired'
      ? 'That reset link is invalid or has expired. Request a fresh link below.'
      : null
  );
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <main className="auth-page">
        <Card className="auth-card">
          <CardHeader className="items-center text-center">
            <div className="auth-mark">
              <CheckCircle className="text-primary h-6 w-6" />
            </div>
            <CardTitle className="text-foreground text-xl">
              Check your email
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              We&apos;ve sent a password reset link to{' '}
              <span className="text-foreground">{email}</span>. Please check
              your inbox.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button
                variant="outline"
                className="border-border text-foreground/80 hover:bg-muted hover:text-foreground w-full"
              >
                Back to sign in
              </Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <Card className="auth-card">
        <CardHeader className="items-center text-center">
          <div className="auth-mark">
            <MessageSquare className="text-primary h-6 w-6" />
          </div>
          <CardTitle className="text-foreground text-xl">
            Reset password
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter the email you use for Salu Operations and we&apos;ll send you
            a reset link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            {error && (
              <div role="alert" className="auth-alert auth-alert-error">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-foreground/80">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="focus-visible:border-primary focus-visible:ring-primary/20 border-border bg-muted text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 min-h-12 w-full"
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>

          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground/80 mt-6 flex items-center justify-center gap-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<main className="auth-page" aria-busy="true" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
