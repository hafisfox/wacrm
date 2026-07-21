import { AlertTriangle } from 'lucide-react';

import { ContactsClient } from './contacts-client';

import { loadSaluCustomersPage } from '@/lib/salu/queries';

export const dynamic = 'force-dynamic';

export default async function ContactsPage() {
  let pageData: Awaited<ReturnType<typeof loadSaluCustomersPage>> | null = null;
  let loadError: unknown = null;

  try {
    pageData = await loadSaluCustomersPage();
  } catch (error) {
    loadError = error;
  }

  if (loadError || !pageData) {
    return <ContactsSetupError error={loadError} />;
  }

  return (
    <ContactsClient
      customers={pageData.customers}
      metrics={pageData.metrics}
      total={pageData.total}
    />
  );
}

function ContactsSetupError({ error }: { error: unknown }) {
  return (
    <div className="border-destructive/30 bg-destructive/10 rounded-xl border p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h1 className="text-foreground text-lg font-semibold">
            Unable to load customers
          </h1>
          <p className="text-foreground/80 mt-2 text-sm">
            {error instanceof Error
              ? error.message
              : 'A database error occurred.'}
          </p>
          <p className="text-foreground/80 mt-3 text-sm">
            Run{' '}
            <code className="bg-background rounded px-1.5 py-0.5">
              npm run setup:salu-env
            </code>
            , then{' '}
            <code className="bg-background rounded px-1.5 py-0.5">
              npm run check:salu-setup
            </code>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
