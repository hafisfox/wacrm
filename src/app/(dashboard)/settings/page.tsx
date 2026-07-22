'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CircleCheck,
  Settings,
  MessageSquare,
  User,
  UsersRound,
  Palette,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
import { ProfileForm } from '@/components/settings/profile-form';
import { PasswordForm } from '@/components/settings/password-form';
import { SessionsCard } from '@/components/settings/sessions-card';
import { MembersTab } from '@/components/settings/members-tab';
import { AppearanceTab } from '@/components/settings/appearance-tab';

const TAB_VALUES = [
  'profile',
  'whatsapp',
  'templates',
  'members',
  'appearance',
] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(v: string | null): v is TabValue {
  return !!v && (TAB_VALUES as readonly string[]).includes(v);
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the single source of truth for the active tab — no
  // local state, no sync effect. A previous revision duplicated this
  // into `useState` + a sync effect, which tripped React 19's
  // set-state-in-effect rule and was also redundant.
  const queryTab = searchParams.get('tab');
  const tab: TabValue = isTabValue(queryTab) ? queryTab : 'profile';

  // System health was duplicated here as a `system` tab and at
  // /system-health. /system-health won — it is what the sidebar and the
  // dashboard quick-link point at. Old ?tab=system bookmarks forward
  // there instead of silently landing on Profile, which is why the tab
  // was retired with a redirect rather than just deleted.
  const isRetiredSystemTab = queryTab === 'system';
  useEffect(() => {
    if (isRetiredSystemTab) router.replace('/system-health');
  }, [isRetiredSystemTab, router]);

  // Skip the frame that would otherwise flash the Profile tab before
  // the redirect above lands.
  if (isRetiredSystemTab) return null;

  const onChange = (next: TabValue) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="ops-page">
      <div>
        <h1 className="text-foreground text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage operator access, WhatsApp maintenance, and n8n health.
        </p>
      </div>

      <section className="ops-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="bg-primary/10 text-primary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
            <CircleCheck className="size-4" />
          </div>
          <div>
            <p className="ops-section-title">WhatsApp stays n8n-managed</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Daily replies and booking automation continue through n8n. Meta
              credentials are only needed for template maintenance.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
          Live workflow mode
        </span>
      </section>

      <Tabs value={tab} onValueChange={(v) => onChange(v as TabValue)}>
        <TabsList className="border-border bg-card flex w-full [scrollbar-width:none] justify-start gap-1 overflow-x-auto border p-1 [&::-webkit-scrollbar]:hidden">
          <TabsTrigger
            value="profile"
            className="data-active:text-primary text-muted-foreground data-active:bg-muted min-w-24 shrink-0"
          >
            <User className="size-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="whatsapp"
            className="data-active:text-primary text-muted-foreground data-active:bg-muted min-w-36 shrink-0"
          >
            <Settings className="size-4" />
            WhatsApp Config
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="data-active:text-primary text-muted-foreground data-active:bg-muted min-w-28 shrink-0"
          >
            <MessageSquare className="size-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger
            value="members"
            className="data-active:text-primary text-muted-foreground data-active:bg-muted min-w-28 shrink-0"
          >
            <UsersRound className="size-4" />
            Members
          </TabsTrigger>
          <TabsTrigger
            value="appearance"
            className="data-active:text-primary text-muted-foreground data-active:bg-muted min-w-28 shrink-0"
          >
            <Palette className="size-4" />
            Appearance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileForm />
          <PasswordForm />
          <SessionsCard />
        </TabsContent>

        <TabsContent value="whatsapp">
          <WhatsAppConfig />
        </TabsContent>

        <TabsContent value="templates">
          <TemplateManager />
        </TabsContent>

        <TabsContent value="members">
          <MembersTab />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
