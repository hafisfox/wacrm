'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
import { MessageSquare, UsersRound } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/http';
import { safeNextPath } from '@/lib/auth/redirects';

function isEmailNotConfirmed(message: string): boolean {
  return message.toLowerCase().includes('email not confirmed');
}

// `useSearchParams` opts the component out of static prerendering
// unless it sits under a Suspense boundary. We split the form into
// a child component so the outer page can prerender the chrome
// (background, card frame) while the form hydrates with the query
// string on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  // Forwarded from `/join/<token>` when the visitor already has an
  // account. After a successful sign-in we send them to the join
  // page to accept rather than to /dashboard.
  const inviteToken = searchParams.get('invite');
  const nextPath = safeNextPath(searchParams.get('next'));
  const resetComplete = searchParams.get('reset') === 'success';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const goNext = () => {
      if (inviteToken) {
        router.push(`/join/${encodeURIComponent(inviteToken)}`);
      } else {
        router.push(nextPath);
      }
    };

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (isEmailNotConfirmed(error.message)) {
          const confirmRes = await fetchWithTimeout('/api/auth/confirm-login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email,
              password,
            }),
          });

          if (!confirmRes.ok) {
            const payload = (await confirmRes.json().catch(() => ({}))) as {
              error?: string;
            };
            setError(payload.error || error.message);
            setLoading(false);
            return;
          }

          const { error: retryError } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
          });

          if (retryError) {
            setError(retryError.message);
            setLoading(false);
            return;
          }

          goNext();
          return;
        }

        setError(error.message);
        setLoading(false);
        return;
      }

      goNext();
    } catch (err) {
      console.error('[login] request failed:', err);
      setError('Could not reach the auth service');
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <Card className="auth-card">
        <CardHeader className="items-center text-center">
          <div className="bg-primary/10 mb-2 flex h-12 w-12 items-center justify-center rounded-xl">
            {inviteToken ? (
              <UsersRound className="text-primary h-6 w-6" />
            ) : (
              <MessageSquare className="text-primary h-6 w-6" />
            )}
          </div>
          <CardTitle className="text-foreground text-xl">
            {inviteToken ? 'Sign in to accept' : 'Welcome back'}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {inviteToken
              ? "Sign in and we'll take you to the invitation."
              : 'Sign in to manage bookings, customer conversations, and your salon team.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <form onSubmit={handleLogin} className="flex min-w-0 flex-col gap-4">
            {resetComplete ? (
              <div className="auth-alert auth-alert-success" role="status">
                Password updated. Sign in with your new password.
              </div>
            ) : null}
            {error && (
              <div className="auth-alert auth-alert-error" role="alert">
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

            <div className="flex flex-col gap-2">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <Label htmlFor="password" className="text-foreground/80">
                  Password
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-primary hover:text-primary/80 shrink-0 text-sm"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="focus-visible:border-primary focus-visible:ring-primary/20 border-border bg-muted text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 h-12 w-full disabled:opacity-50 sm:h-10"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <p className="text-muted-foreground mt-6 text-center text-sm">
            Don&apos;t have an account?{' '}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : `/signup?next=${encodeURIComponent(nextPath)}`
              }
              className="text-primary hover:text-primary/80"
            >
              Create account
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
