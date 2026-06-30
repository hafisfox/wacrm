import { SystemHealthPanel } from "@/components/settings/system-health-panel";

export const dynamic = "force-dynamic";

export default function SystemHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">System Health</h1>
        <p className="mt-1 text-sm text-slate-400">
          n8n production workflow status and dashboard bridge readiness.
        </p>
      </div>

      <SystemHealthPanel />
    </div>
  );
}
