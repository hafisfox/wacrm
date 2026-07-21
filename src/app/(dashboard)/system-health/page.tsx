import { SystemHealthPanel } from '@/components/settings/system-health-panel';

export const dynamic = 'force-dynamic';

export default function SystemHealthPage() {
  return (
    <div className="ops-page">
      <div>
        <p className="ops-eyebrow">Operational readiness</p>
        <h1 className="text-foreground text-2xl font-bold">System Health</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          n8n production workflow status and dashboard bridge readiness.
        </p>
      </div>

      <SystemHealthPanel />
    </div>
  );
}
