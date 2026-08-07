'use client';

// Error boundary for every signed-in salon route. Before this existed
// an uncaught render error replaced the whole app with Next's default
// screen and the only way out was a manual reload.
//
// Note the prop is `unstable_retry`, not the `reset` of older App
// Router versions — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard] render error:', error);
  }, [error]);

  return (
    <div className="ops-page">
      <div className="border-destructive/30 bg-destructive/10 rounded-xl border p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-foreground text-lg font-semibold">
              Something went wrong on this page
            </h1>
            <p className="text-foreground/80 mt-2 text-sm">
              You can choose another section below, or try this page again.
            </p>

            {error.digest ? (
              <p className="text-muted-foreground mt-3 font-mono text-xs">
                Support reference: {error.digest}
              </p>
            ) : null}

            <Button className="mt-4 min-h-11" onClick={() => unstable_retry()}>
              <RotateCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
