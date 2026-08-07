'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquare, User, UsersRound, Palette } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TemplateManager } from '@/components/settings/template-manager';
import { ProfileForm } from '@/components/settings/profile-form';
import { PasswordForm } from '@/components/settings/password-form';
import { SessionsCard } from '@/components/settings/sessions-card';
import { MembersTab } from '@/components/settings/members-tab';
import { AppearanceTab } from '@/components/settings/appearance-tab';

const TAB_VALUES = ['profile', 'templates', 'members', 'appearance'] as const;
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

  // These were technical maintenance tabs. Preserve old links without
  // resurfacing configuration screens the owner should not need.
  const isRetiredSystemTab = queryTab === 'system' || queryTab === 'whatsapp';
  useEffect(() => {
    if (isRetiredSystemTab) router.replace('/settings?tab=profile');
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
        <h1 className="ops-page-heading">Settings</h1>
        <p className="ops-page-description">
          Manage your account, team, message templates, and display.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => onChange(v as TabValue)}>
        <TabsList className="border-border bg-card flex h-12 w-full [scrollbar-width:none] justify-start gap-1 overflow-x-auto border p-1 [&::-webkit-scrollbar]:hidden">
          <TabsTrigger
            value="profile"
            className="data-active:text-primary text-muted-foreground data-active:bg-muted min-w-24 shrink-0"
          >
            <User className="size-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="data-active:text-primary text-muted-foreground data-active:bg-muted min-w-36 shrink-0"
          >
            <MessageSquare className="size-4" />
            Message templates
          </TabsTrigger>
          <TabsTrigger
            value="members"
            className="data-active:text-primary text-muted-foreground data-active:bg-muted min-w-28 shrink-0"
          >
            <UsersRound className="size-4" />
            Team
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
