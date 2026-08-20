'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import {
  MIN_PASSWORD_LENGTH,
  passwordLengthError,
} from '@/lib/auth/password-policy';

// `useSearchParams` opts the component out of static prerendering
// unless wrapped in Suspense — same pattern as /login.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const searchParams = useSearchParams();
  // When the user lands here from `/join/<token>` we carry the
  // invite token in the query so we can send them to the redeem
  // step after account creation instead of dropping them on /dashboard.
  const inviteToken = searchParams.get('invite');
  const nextPath = safeNextPath(searchParams.get('next'));

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const lengthError = passwordLengthError(password);
    if (lengthError) {
      setError(lengthError);
      return;
    }

    setLoading(true);

    try {
      const signupRes = await fetchWithTimeout('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName,
          email,
          password,
        }),
      });

      if (!signupRes.ok) {
        const payload = (await signupRes.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(payload.error || 'Could not create account');
        setLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      if (inviteToken) {
        router.push(`/join/${encodeURIComponent(inviteToken)}`);
      } else {
        router.push(nextPath);
      }
    } catch (err) {
      console.error('[signup] request failed:', err);
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
            {inviteToken ? 'Create account & join' : 'Create account'}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {inviteToken
              ? 'Create your account, then accept the invitation to join your team.'
              : 'Create the operations workspace for your salon team.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            {error && (
              <div className="auth-alert auth-alert-error" role="alert">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName" className="text-foreground/80">
                Full name
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="focus-visible:border-primary focus-visible:ring-primary/20 border-border bg-muted text-foreground placeholder:text-muted-foreground"
              />
            </div>

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
              <Label htmlFor="password" className="text-foreground/80">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                required
                className="focus-visible:border-primary focus-visible:ring-primary/20 border-border bg-muted text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword" className="text-foreground/80">
                Confirm password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                required
                className="focus-visible:border-primary focus-visible:ring-primary/20 border-border bg-muted text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 min-h-12 w-full"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <p className="text-muted-foreground mt-6 text-center text-sm">
            Already have an account?{' '}
            <Link
              href={
                inviteToken
                  ? `/login?invite=${encodeURIComponent(inviteToken)}`
                  : `/login?next=${encodeURIComponent(nextPath)}`
              }
              className="text-primary hover:text-primary/80"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
