import { AlertTriangle } from "lucide-react";

import { ContactsClient } from "./contacts-client";

import { loadSaluCustomersPage } from "@/lib/salu/queries";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  try {
    const { customers, metrics } = await loadSaluCustomersPage();
    return <ContactsClient customers={customers} metrics={metrics} />;
  } catch (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
          <div>
            <h1 className="text-lg font-semibold text-white">
              Unable to load customers
            </h1>
            <p className="mt-2 text-sm text-red-100">
              {error instanceof Error
                ? error.message
                : "A database error occurred."}
            </p>
            <p className="mt-3 text-sm text-slate-300">
              Run{" "}
              <code className="rounded bg-slate-950 px-1.5 py-0.5">
                npm run setup:salu-env
              </code>
              , then{" "}
              <code className="rounded bg-slate-950 px-1.5 py-0.5">
                npm run check:salu-setup
              </code>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }
}
