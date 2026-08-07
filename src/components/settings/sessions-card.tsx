'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, LogOut } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export function SessionsCard() {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const onConfirm = async () => {
    setSigningOut(true);
    try {
      // scope: 'global' revokes every refresh token for this user
      // across all devices; the next auth-state change on this tab
      // triggers the usual redirect.
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) {
        console.error('[sessions] sign-out failed:', error);
        toast.error('Could not sign out. Please try again.');
        return;
      }
      router.replace('/login');
      router.refresh();
    } catch (err) {
      console.error('[sessions] sign-out failed:', err);
      toast.error('Could not sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <Card className="bg-card/40">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <LogOut className="text-primary size-4" />
            Active sessions
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Sign out of every device where you&apos;re logged in — including
            this one. Useful if you lost a laptop or shared your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setOpen(true)}
          >
            <LogOut className="size-4" />
            Sign out of all devices
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out everywhere?</DialogTitle>
            <DialogDescription>
              Every device logged into this account will be signed out and will
              need to log in again. You will be redirected to the login page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => setOpen(false)}
              disabled={signingOut}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-11"
              onClick={onConfirm}
              disabled={signingOut}
            >
              {signingOut ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing out…
                </>
              ) : (
                'Sign out everywhere'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
