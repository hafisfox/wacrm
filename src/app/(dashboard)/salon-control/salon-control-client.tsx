'use client';

/* Controlled editors reset their local draft when the selected record changes.
 * Photos can be public Supabase objects or an operator's external fallback URL,
 * so Next Image remote-host allowlisting is intentionally not appropriate here. */
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  ImagePlus,
  Loader2,
  Plus,
  Scissors,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { paiseToRupeesInput, rupeesToPaiseInput } from '@/lib/salu/money-input';
import {
  type AvailabilityRow,
  type ControlRoomData,
  type SalonConfigRow,
  type SalonServiceRow,
  type SalonStylistRow,
  type StylistAvailabilityRow,
  type StylistServiceRow,
} from '@/lib/salu/control-room';
import {
  SKILL_LEVELS,
  WEEKDAYS,
  skillsFromSummary,
} from '@/lib/salu/control-room-shared';
import { cn } from '@/lib/utils';
import { fetchWithTimeout } from '@/lib/http';

const API = '/api/salu/control-room';
const INPUT =
  'h-11 w-full rounded-lg border border-border bg-background/50 px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 sm:h-9';
const TEXTAREA = `${INPUT} h-auto py-2`;
const WEEKDAY_SET = new Set<string>(WEEKDAYS);
const SALON_TABS = ['overview', 'services', 'team', 'schedule'] as const;
type SalonTab = (typeof SALON_TABS)[number];

type Weekday = (typeof WEEKDAYS)[number];
type DraftRule = {
  id?: string;
  day_name: Weekday;
  open_time: string;
  close_time: string;
  slot_interval_minutes: number;
  effective_from?: string;
  effective_to?: string;
};
type AssignmentDraft = {
  enabled: boolean;
  skill_level: string;
  customize: boolean;
  override_duration_minutes: string;
  override_price_rupees: string;
  override_deposit_rupees: string;
  existing?: StylistServiceRow;
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="text-foreground grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
      {hint ? (
        <span className="text-muted-foreground text-xs font-normal">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function StatusToggle({
  checked,
  onChange,
  label = 'Active',
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className="border-border bg-background/40 text-foreground inline-flex min-h-11 items-center gap-2 rounded-lg border px-2.5 text-xs sm:min-h-8">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-primary size-4"
      />
      {label}
    </label>
  );
}

function money(value: number) {
  return `₹${Math.round(value / 100).toLocaleString('en-IN')}`;
}

function humanSkill(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Qualified';
}

function slug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'stylist'
  );
}

function weekdayForDate(value: string): Weekday {
  const day = new Date(`${value}T00:00:00Z`).getUTCDay();
  return WEEKDAYS[(day + 6) % 7];
}

function isManagedPhoto(url: string) {
  return /\/storage\/v1\/object\/public\/salu-stylist-photos\/stylists\//.test(
    url
  );
}

function emptyWeek(): Record<Weekday, DraftRule[]> {
  return {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Sunday: [],
  };
}

function weekFromRows(
  rows: Array<AvailabilityRow | StylistAvailabilityRow>,
  scope: 'salon' | 'stylist'
) {
  const week = emptyWeek();
  rows
    .filter(
      (row) =>
        row.active &&
        !row.blackout_date &&
        WEEKDAY_SET.has(row.day_name) &&
        (scope === 'stylist' || ('service_id' in row && !row.service_id))
    )
    .forEach((row) => {
      const day = row.day_name as Weekday;
      week[day].push({
        id:
          'availability_id' in row
            ? row.availability_id
            : row.stylist_availability_id,
        day_name: day,
        open_time: row.open_time,
        close_time: row.close_time,
        slot_interval_minutes: row.slot_interval_minutes ?? 30,
        effective_from: 'effective_from' in row ? row.effective_from : '',
        effective_to: 'effective_to' in row ? row.effective_to : '',
      });
    });
  return week;
}

function defaultRule(day: Weekday): DraftRule {
  return {
    day_name: day,
    open_time: '10:00',
    close_time: '18:00',
    slot_interval_minutes: 30,
  };
}

export function SalonControlClient({
  initialData,
}: {
  initialData: ControlRoomData;
}) {
  const canEdit = useCan('edit-settings');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: SalonTab = SALON_TABS.includes(requestedTab as SalonTab)
    ? (requestedTab as SalonTab)
    : 'overview';
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState('');
  const [serviceEditor, setServiceEditor] = useState<
    SalonServiceRow | 'new' | null
  >(null);
  const [stylistEditor, setStylistEditor] = useState<
    SalonStylistRow | 'new' | null
  >(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    path: string;
    label: string;
  } | null>(null);

  useEffect(() => setData(initialData), [initialData]);

  const activeServices = useMemo(
    () => data.services.filter((service) => service.active),
    [data.services]
  );
  const activeStylists = useMemo(
    () => data.stylists.filter((stylist) => stylist.active),
    [data.stylists]
  );

  async function request(
    path: string,
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    body?: unknown,
    busyKey = path
  ) {
    if (!canEdit) return false;
    setSaving(busyKey);
    try {
      const response = await fetchWithTimeout(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = (await response.json()) as
        | ControlRoomData
        | { error?: string };
      if (!response.ok)
        throw new Error(
          'error' in result ? result.error : 'Could not save changes'
        );
      setData(result as ControlRoomData);
      return true;
    } catch (error) {
      console.error('[salon] save failed:', error);
      toast.error('Could not save changes. Please try again.');
      return false;
    } finally {
      setSaving('');
    }
  }

  async function refresh() {
    setSaving('refresh');
    try {
      const response = await fetchWithTimeout(API);
      const result = (await response.json()) as
        | ControlRoomData
        | { error?: string };
      if (!response.ok)
        throw new Error('error' in result ? result.error : 'Could not refresh');
      setData(result as ControlRoomData);
      toast.success('Salon setup refreshed');
    } catch (error) {
      console.error('[salon] refresh failed:', error);
      toast.error('Could not refresh salon information. Please try again.');
    } finally {
      setSaving('');
    }
  }

  async function reorder(
    entity: 'services' | 'stylists',
    id: string,
    direction: -1 | 1
  ) {
    const ids =
      entity === 'services'
        ? data.services.map((service) => service.service_id)
        : data.stylists.map((stylist) => stylist.stylist_id);
    const index = ids.indexOf(id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= ids.length) return;
    [ids[index], ids[destination]] = [ids[destination], ids[index]];
    await request(`${API}/order`, 'PUT', { entity, ids }, `order:${entity}`);
  }

  function selectTab(value: string) {
    if (!SALON_TABS.includes(value as SalonTab)) return;
    const next = new URLSearchParams(searchParams.toString());
    if (value === 'overview') next.delete('tab');
    else next.set('tab', value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  async function confirmRemoval() {
    if (!pendingRemoval) return;
    const { path, label } = pendingRemoval;
    if (await request(path, 'DELETE', undefined, `remove:${label}`)) {
      toast.success(`${label} deactivated`);
      setPendingRemoval(null);
    }
  }

  async function saveStylist(
    payload: Record<string, unknown>,
    assignments: Record<string, AssignmentDraft>,
    photo: File | null,
    oldImageUrl: string,
    isNew: boolean
  ) {
    const stylistId = String(
      payload.stylist_id || slug(String(payload.stylist_name || ''))
    );
    let uploadedUrl = '';
    let imageUrl = String(payload.image_url || '');
    // Whether the stylist row itself committed. Once it has, it points
    // at `uploadedUrl`, so the photo is no longer ours to roll back —
    // see the catch below.
    let stylistCommitted = false;
    setSaving('stylist-save');
    try {
      if (photo) {
        const form = new FormData();
        form.set('stylist_id', stylistId);
        form.set('image', photo);
        const upload = await fetchWithTimeout(`${API}/stylist-photo`, {
          method: 'POST',
          body: form,
        });
        const result = (await upload.json()) as {
          image_url?: string;
          error?: string;
        };
        if (!upload.ok || !result.image_url)
          throw new Error(result.error || 'Photo upload failed');
        uploadedUrl = result.image_url;
        imageUrl = uploadedUrl;
      }
      const saved = await fetchWithTimeout(`${API}/stylists`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          stylist_id: stylistId,
          image_url: imageUrl,
        }),
      });
      const next = (await saved.json()) as ControlRoomData | { error?: string };
      if (!saved.ok)
        throw new Error(
          'error' in next ? next.error : 'Could not save stylist'
        );
      stylistCommitted = true;
      setData(next as ControlRoomData);

      for (const [serviceId, assignment] of Object.entries(assignments)) {
        const wasEnabled = assignment.existing?.active ?? false;
        if (!assignment.enabled && !wasEnabled) continue;
        const mappingSaved = await fetchWithTimeout(`${API}/stylist-services`, {
          method: assignment.existing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stylist_service_id: assignment.existing?.stylist_service_id,
            stylist_id: stylistId,
            service_id: serviceId,
            active: assignment.enabled,
            skill_level: assignment.skill_level,
            override_duration_minutes: assignment.customize
              ? assignment.override_duration_minutes
              : '',
            override_price_paise: assignment.customize
              ? rupeesToPaiseInput(assignment.override_price_rupees)
              : '',
            override_deposit_paise: assignment.customize
              ? rupeesToPaiseInput(assignment.override_deposit_rupees)
              : '',
            flow_order:
              activeServices.findIndex(
                (service) => service.service_id === serviceId
              ) + 1,
          }),
        });
        const mappingNext = (await mappingSaved.json()) as
          | ControlRoomData
          | { error?: string };
        if (!mappingSaved.ok) {
          throw new Error(
            'error' in mappingNext
              ? mappingNext.error
              : 'Could not save service coverage'
          );
        }
        setData(mappingNext as ControlRoomData);
      }
      if (
        oldImageUrl &&
        oldImageUrl !== imageUrl &&
        isManagedPhoto(oldImageUrl)
      ) {
        fetchWithTimeout(`${API}/stylist-photo`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: oldImageUrl }),
        }).catch(() => undefined);
      }
      toast.success(isNew ? 'Stylist added' : 'Stylist updated');
      return true;
    } catch (error) {
      // Only reclaim the upload when it is genuinely orphaned. This
      // used to fire unconditionally, so a failure in the service-
      // coverage loop below deleted a photo the *already-saved*
      // stylist row was pointing at — leaving a permanently broken
      // image URL that no retry could repair.
      if (uploadedUrl && !stylistCommitted) {
        fetchWithTimeout(`${API}/stylist-photo`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: uploadedUrl }),
        }).catch(() => undefined);
      }
      console.error('[salon] stylist save failed:', error);
      // Be honest about a partial save. Saying "could not save stylist"
      // when the stylist *did* save sends the user to re-enter a form
      // whose changes already landed.
      toast.error(
        stylistCommitted
          ? 'Stylist saved, but their services could not be updated. Please try again.'
          : 'Could not save stylist. Please try again.'
      );
      return false;
    } finally {
      setSaving('');
    }
  }

  const blockers = [
    data.readiness.missing_stylist_images
      ? `${data.readiness.missing_stylist_images} active stylist${data.readiness.missing_stylist_images === 1 ? '' : 's'} need a photo`
      : '',
    data.readiness.unmapped_active_stylists
      ? `${data.readiness.unmapped_active_stylists} stylist${data.readiness.unmapped_active_stylists === 1 ? '' : 's'} need service coverage`
      : '',
    data.readiness.unmapped_active_services
      ? `${data.readiness.unmapped_active_services} service${data.readiness.unmapped_active_services === 1 ? '' : 's'} need a stylist`
      : '',
  ].filter(Boolean);

  return (
    <div className="ops-page text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="border-border flex flex-col gap-3 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Scissors className="text-primary size-5" />
              <h1 className="text-foreground text-2xl font-semibold">Salon</h1>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage the customer-facing services, team, and booking schedule in
              one place.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={refresh}
            disabled={saving === 'refresh'}
          >
            {saving === 'refresh' ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Clock3 />
            )}
            Refresh
          </Button>
        </header>

        {blockers.length ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="font-medium text-amber-100">
              Before customers can book
            </p>
            <ul className="mt-2 grid gap-1 text-sm text-amber-200/85 sm:grid-cols-2">
              {blockers.map((blocker) => (
                <li key={blocker}>• {blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {!canEdit ? (
          <div className="border-primary/25 bg-primary-soft text-foreground rounded-xl border px-4 py-3 text-sm">
            You have read-only access. An owner or admin can change salon
            details, services, team members, and schedules.
          </div>
        ) : null}

        <Tabs value={activeTab} onValueChange={selectTab}>
          <TabsList className="border-border bg-card flex h-12 w-full justify-start gap-1 overflow-x-auto border p-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <SalonDetails
              config={data.config}
              disabled={!canEdit}
              saving={saving === 'config'}
              onSave={(payload) =>
                request(`${API}/config`, 'PATCH', payload, 'config')
              }
            />
          </TabsContent>
          <TabsContent value="services" className="mt-4">
            <section className="grid gap-4">
              <SectionHeader
                icon={Scissors}
                title="Services"
                description="What customers can book. Price labels are generated automatically from the price."
                action={
                  <Button
                    disabled={!canEdit}
                    className="min-h-11"
                    onClick={() => setServiceEditor('new')}
                  >
                    <Plus /> Add service
                  </Button>
                }
              />
              <div className="grid gap-3">
                {data.services.map((service, index) => (
                  <ServiceCard
                    key={service.service_id}
                    service={service}
                    index={index}
                    lastIndex={data.services.length - 1}
                    disabled={!canEdit}
                    onEdit={() => setServiceEditor(service)}
                    onMove={(direction) =>
                      reorder('services', service.service_id, direction)
                    }
                    onDeactivate={() =>
                      setPendingRemoval({
                        path: `${API}/services?service_id=${encodeURIComponent(service.service_id)}`,
                        label: service.service_name,
                      })
                    }
                  />
                ))}
              </div>
            </section>
          </TabsContent>
          <TabsContent value="team" className="mt-4">
            <section className="grid gap-4">
              <SectionHeader
                icon={UserRound}
                title="Team"
                description="Profiles, customer-facing specialties, and the services each stylist can perform."
                action={
                  <Button
                    disabled={!canEdit}
                    className="min-h-11"
                    onClick={() => setStylistEditor('new')}
                  >
                    <Plus /> Add stylist
                  </Button>
                }
              />
              <div className="grid gap-4 lg:grid-cols-2">
                {data.stylists.map((stylist, index) => (
                  <StylistCard
                    key={stylist.stylist_id}
                    stylist={stylist}
                    mappings={data.stylistServices.filter(
                      (mapping) =>
                        mapping.stylist_id === stylist.stylist_id &&
                        mapping.active
                    )}
                    services={data.services}
                    index={index}
                    lastIndex={data.stylists.length - 1}
                    disabled={!canEdit}
                    onEdit={() => setStylistEditor(stylist)}
                    onMove={(direction) =>
                      reorder('stylists', stylist.stylist_id, direction)
                    }
                    onDeactivate={() =>
                      setPendingRemoval({
                        path: `${API}/stylists?stylist_id=${encodeURIComponent(stylist.stylist_id)}`,
                        label: stylist.stylist_name,
                      })
                    }
                  />
                ))}
              </div>
            </section>
          </TabsContent>
          <TabsContent value="schedule" className="mt-4">
            <SchedulePanel
              data={data}
              disabled={!canEdit}
              saving={saving}
              onRequest={request}
              activeStylists={activeStylists}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ServiceEditor
        open={serviceEditor !== null}
        service={
          serviceEditor === 'new' ? undefined : (serviceEditor ?? undefined)
        }
        disabled={!canEdit}
        busy={saving === 'service-save'}
        onOpenChange={(open) => !open && setServiceEditor(null)}
        onSave={async (payload) => {
          const success = await request(
            `${API}/services`,
            serviceEditor === 'new' ? 'POST' : 'PATCH',
            payload,
            'service-save'
          );
          if (success) setServiceEditor(null);
          return success;
        }}
      />
      <StylistEditor
        open={stylistEditor !== null}
        stylist={
          stylistEditor === 'new' ? undefined : (stylistEditor ?? undefined)
        }
        services={activeServices}
        mappings={data.stylistServices}
        disabled={!canEdit}
        busy={saving === 'stylist-save'}
        onOpenChange={(open) => !open && setStylistEditor(null)}
        onSave={async (payload, assignments, photo, oldImageUrl) => {
          const saved = await saveStylist(
            payload,
            assignments,
            photo,
            oldImageUrl,
            stylistEditor === 'new'
          );
          if (saved) setStylistEditor(null);
          return saved;
        }}
      />
      <Dialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {pendingRemoval?.label}?</DialogTitle>
            <DialogDescription>
              Customers will no longer be able to select it. Existing bookings
              will remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemoval(null)}>
              Keep active
            </Button>
            <Button
              variant="destructive"
              disabled={saving.startsWith('remove:')}
              onClick={confirmRemoval}
            >
              {saving.startsWith('remove:') ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Scissors;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="text-primary size-5" />
          <h2 className="text-foreground text-lg font-semibold">{title}</h2>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}

function SalonDetails({
  config,
  disabled,
  saving,
  onSave,
}: {
  config: SalonConfigRow;
  disabled: boolean;
  saving: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [form, setForm] = useState(config);
  useEffect(() => setForm(config), [config]);
  const dirty = JSON.stringify(form) !== JSON.stringify(config);
  function update(key: keyof SalonConfigRow, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onSave({ ...form })) toast.success('Salon details updated');
  }
  return (
    <Card className="bg-card/60">
      <CardHeader>
        <CardTitle>Salon details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
          <Field label="Salon name">
            <input
              className={INPUT}
              value={form.salon_name}
              disabled={disabled}
              onChange={(event) => update('salon_name', event.target.value)}
            />
          </Field>
          <Field label="Timezone">
            <select
              className={INPUT}
              value={form.timezone}
              disabled={disabled}
              onChange={(event) => update('timezone', event.target.value)}
            >
              <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
              <option value="Asia/Dubai">Dubai (Asia/Dubai)</option>
              <option value="Asia/Singapore">Singapore (Asia/Singapore)</option>
            </select>
          </Field>
          <Field label="Owner WhatsApp number">
            <input
              className={INPUT}
              value={form.owner_number}
              placeholder="+91…"
              disabled={disabled}
              onChange={(event) => update('owner_number', event.target.value)}
            />
          </Field>
          <Field label="Default language">
            <input
              className={INPUT}
              value={form.default_language}
              disabled={disabled}
              onChange={(event) =>
                update('default_language', event.target.value)
              }
            />
          </Field>
          <div className="lg:col-span-2">
            <Field label="Salon address">
              <textarea
                className={TEXTAREA}
                rows={2}
                value={form.address}
                disabled={disabled}
                onChange={(event) => update('address', event.target.value)}
              />
            </Field>
          </div>
          <div className="border-border bg-background/40 rounded-lg border p-3 lg:col-span-2">
            <p className="text-foreground text-sm font-medium">
              Customer-facing booking hours
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              These are generated from the main weekly schedule so customer
              messages and booking slots stay aligned.
            </p>
            <p className="text-foreground mt-2 text-sm">
              {config.hours ||
                'Set your weekly schedule to generate customer hours.'}
            </p>
          </div>
          <details className="border-border rounded-lg border p-3 lg:col-span-2">
            <summary className="text-foreground cursor-pointer text-sm font-medium">
              Customer reply instructions
            </summary>
            <div className="mt-3">
              <Field
                label="Reply instructions"
                hint="Optional notes for how customer questions should be handled."
              >
                <textarea
                  className={TEXTAREA}
                  rows={4}
                  value={form.bot_policy_text}
                  disabled={disabled}
                  onChange={(event) =>
                    update('bot_policy_text', event.target.value)
                  }
                />
              </Field>
            </div>
          </details>
          <div className="flex flex-col items-end gap-2 lg:col-span-2">
            <p className="text-muted-foreground text-xs" aria-live="polite">
              {dirty ? 'Unsaved changes' : 'All details saved'}
            </p>
            <Button
              className="min-h-11"
              disabled={disabled || saving || !dirty}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Check />} Save
              details
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ServiceCard({
  service,
  index,
  lastIndex,
  disabled,
  onEdit,
  onMove,
  onDeactivate,
}: {
  service: SalonServiceRow;
  index: number;
  lastIndex: number;
  disabled: boolean;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onDeactivate: () => void;
}) {
  return (
    <Card className={cn('bg-card/60', !service.active && 'opacity-60')}>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-foreground font-semibold">
              {service.service_name}
            </h3>
            <Badge variant={service.active ? 'default' : 'outline'}>
              {service.active ? 'Active' : 'Inactive'}
            </Badge>
            {service.payment_required ? (
              <Badge variant="outline">
                Deposit {money(service.deposit_paise)}
              </Badge>
            ) : (
              <Badge variant="outline">No deposit</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {service.duration_minutes} min ·{' '}
            {service.price_display || money(service.price_paise)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            className="size-11 sm:size-7"
            title="Move up"
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="size-11 sm:size-7"
            title="Move down"
            disabled={disabled || index === lastIndex}
            onClick={() => onMove(1)}
          >
            <ChevronDown />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-7"
            disabled={disabled}
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            variant="destructive"
            size="icon-sm"
            className="size-11 sm:size-7"
            title="Deactivate"
            disabled={disabled || !service.active}
            onClick={onDeactivate}
          >
            <Trash2 />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceEditor({
  open,
  service,
  disabled,
  busy,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  service?: SalonServiceRow;
  disabled: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('60');
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [payment, setPayment] = useState(true);
  const [active, setActive] = useState(true);
  const [customLabel, setCustomLabel] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => {
    setName(service?.service_name ?? '');
    setDuration(String(service?.duration_minutes ?? 60));
    setPrice(paiseToRupeesInput(service?.price_paise ?? 0));
    setDeposit(paiseToRupeesInput(service?.deposit_paise ?? 0));
    setPayment(service?.payment_required ?? true);
    setActive(service?.active ?? true);
    setCustomLabel(service?.price_display ?? '');
    setNotes(service?.notes ?? '');
  }, [service, open]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const pricePaise = Number(rupeesToPaiseInput(price) || 0);
    const depositPaise = payment ? Number(rupeesToPaiseInput(deposit) || 0) : 0;
    if (depositPaise > pricePaise && pricePaise > 0) {
      toast.error('Deposit cannot be greater than the service price');
      return;
    }
    await onSave({
      service_id: service?.service_id,
      service_name: name,
      duration_minutes: duration,
      price_paise: pricePaise,
      deposit_paise: depositPaise,
      payment_required: payment,
      active,
      price_display: customLabel,
      payment_label: payment ? 'Deposit required' : '',
      flow_order: service?.flow_order ?? 999,
      notes,
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {service ? `Edit ${service.service_name}` : 'Add service'}
          </DialogTitle>
          <DialogDescription>
            Start with the booking essentials. Less common controls are kept out
            of the way.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Service name">
              <input
                className={INPUT}
                required
                value={name}
                disabled={disabled}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Duration">
              <select
                className={INPUT}
                value={duration}
                disabled={disabled}
                onChange={(event) => setDuration(event.target.value)}
              >
                {[15, 30, 45, 60, 75, 90, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutes
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Customer price (₹)">
              <input
                className={INPUT}
                type="number"
                min="0"
                step="0.01"
                value={price}
                disabled={disabled}
                onChange={(event) => setPrice(event.target.value)}
              />
            </Field>
            <Field label="Deposit (₹)" hint="Set 0 for no deposit">
              <input
                className={INPUT}
                type="number"
                min="0"
                step="0.01"
                value={deposit}
                disabled={disabled || !payment}
                onChange={(event) => setDeposit(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusToggle
              checked={active}
              onChange={setActive}
              disabled={disabled}
            />
            <StatusToggle
              checked={payment}
              onChange={setPayment}
              label="Take deposit"
              disabled={disabled}
            />
          </div>
          <details className="border-border rounded-lg border p-3">
            <summary className="text-foreground cursor-pointer text-sm font-medium">
              Advanced settings
            </summary>
            <div className="mt-3 grid gap-3">
              <Field
                label="Customer price label"
                hint="Leave blank to show the exact price above."
              >
                <input
                  className={INPUT}
                  value={customLabel}
                  disabled={disabled}
                  placeholder={price ? `₹${price}` : 'For example: From ₹1,200'}
                  onChange={(event) => setCustomLabel(event.target.value)}
                />
              </Field>
              <Field label="Internal notes">
                <textarea
                  className={TEXTAREA}
                  rows={2}
                  value={notes}
                  disabled={disabled}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
            </div>
          </details>
          <DialogFooter>
            <Button
              type="submit"
              className="min-h-11"
              disabled={disabled || busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              {service ? 'Save service' : 'Add service'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StylistCard({
  stylist,
  mappings,
  services,
  index,
  lastIndex,
  disabled,
  onEdit,
  onMove,
  onDeactivate,
}: {
  stylist: SalonStylistRow;
  mappings: StylistServiceRow[];
  services: SalonServiceRow[];
  index: number;
  lastIndex: number;
  disabled: boolean;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onDeactivate: () => void;
}) {
  const serviceNames = mappings
    .map(
      (mapping) =>
        services.find((service) => service.service_id === mapping.service_id)
          ?.service_name
    )
    .filter(Boolean);
  return (
    <Card
      className={cn(
        'bg-card/60 overflow-hidden',
        !stylist.active && 'opacity-60'
      )}
    >
      <CardContent className="p-0">
        <div className="flex gap-4 p-4">
          <PhotoPreview
            src={stylist.image_url}
            alt={stylist.image_alt || stylist.stylist_name}
            fallback={stylist.stylist_name}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-foreground font-semibold">
                {stylist.stylist_name}
              </h3>
              <Badge variant={stylist.active ? 'default' : 'outline'}>
                {stylist.active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-foreground/80 mt-1 text-sm">
              {stylist.specialty || 'No primary specialty yet'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {skillsFromSummary(stylist.skills_summary).map((skill) => (
                <Badge key={skill} variant="outline">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="border-border border-t px-4 py-3">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Bookable services
          </p>
          <p className="text-foreground/80 mt-1 text-sm">
            {serviceNames.length
              ? serviceNames.join(' · ')
              : 'No services assigned'}
          </p>
        </div>
        <div className="border-border bg-background/20 flex flex-wrap justify-end gap-2 border-t p-3">
          <Button
            variant="outline"
            size="icon-sm"
            className="size-11 sm:size-7"
            title="Move up"
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="size-11 sm:size-7"
            title="Move down"
            disabled={disabled || index === lastIndex}
            onClick={() => onMove(1)}
          >
            <ChevronDown />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-7"
            disabled={disabled}
            onClick={onEdit}
          >
            Manage profile
          </Button>
          <Button
            variant="destructive"
            size="icon-sm"
            className="size-11 sm:size-7"
            title="Deactivate"
            disabled={disabled || !stylist.active}
            onClick={onDeactivate}
          >
            <Trash2 />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PhotoPreview({
  src,
  alt,
  fallback,
}: {
  src: string;
  alt: string;
  fallback: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (!src || broken)
    return (
      <div className="bg-primary/15 text-primary flex size-16 shrink-0 items-center justify-center rounded-xl text-lg font-semibold">
        {fallback.charAt(0).toUpperCase()}
      </div>
    );
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      className="ring-border size-16 shrink-0 rounded-xl object-cover ring-1"
    />
  );
}

function StylistEditor({
  open,
  stylist,
  services,
  mappings,
  disabled,
  busy,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  stylist?: SalonStylistRow;
  services: SalonServiceRow[];
  mappings: StylistServiceRow[];
  disabled: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    payload: Record<string, unknown>,
    assignments: Record<string, AssignmentDraft>,
    photo: File | null,
    oldImageUrl: string
  ) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [active, setActive] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [notes, setNotes] = useState('');
  const [assignments, setAssignments] = useState<
    Record<string, AssignmentDraft>
  >({});
  useEffect(() => {
    const current = Object.fromEntries(
      services.map((service) => {
        const existing = mappings.find(
          (mapping) =>
            mapping.stylist_id === stylist?.stylist_id &&
            mapping.service_id === service.service_id
        );
        return [
          service.service_id,
          {
            enabled: existing?.active ?? false,
            skill_level: existing?.skill_level || 'skilled',
            customize: Boolean(
              existing?.override_duration_minutes ||
              existing?.override_price_paise ||
              existing?.override_deposit_paise
            ),
            override_duration_minutes: existing?.override_duration_minutes
              ? String(existing.override_duration_minutes)
              : '',
            override_price_rupees: paiseToRupeesInput(
              existing?.override_price_paise
            ),
            override_deposit_rupees: paiseToRupeesInput(
              existing?.override_deposit_paise
            ),
            existing,
          },
        ];
      })
    );
    setName(stylist?.stylist_name ?? '');
    setSpecialty(stylist?.specialty ?? '');
    setBio(stylist?.bio ?? '');
    setSkills(skillsFromSummary(stylist?.skills_summary));
    setSkillInput('');
    setActive(stylist?.active ?? true);
    setImageUrl(stylist?.image_url ?? '');
    setFile(null);
    setPreview('');
    setNotes(stylist?.notes ?? '');
    setAssignments(current);
  }, [open, stylist, services, mappings]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );
  function addSkill() {
    const next = skillInput.trim().replace(/,/g, '');
    if (
      next &&
      !skills.some((skill) => skill.toLowerCase() === next.toLowerCase())
    )
      setSkills((current) => [...current, next]);
    setSkillInput('');
  }
  function updateAssignment(serviceId: string, next: Partial<AssignmentDraft>) {
    setAssignments((current) => ({
      ...current,
      [serviceId]: { ...current[serviceId], ...next },
    }));
  }
  function choosePhoto(next: File | null) {
    if (!next) return;
    if (!['image/jpeg', 'image/png'].includes(next.type)) {
      toast.error('Use a JPG or PNG photo');
      return;
    }
    if (next.size > 5 * 1024 * 1024) {
      toast.error('Stylist photos must be 5 MB or smaller');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await onSave(
      {
        stylist_id: stylist?.stylist_id || slug(name),
        stylist_name: name,
        specialty,
        bio,
        skills,
        active,
        image_url: imageUrl,
        notes,
        flow_order: stylist?.flow_order ?? 999,
      },
      assignments,
      file,
      stylist?.image_url ?? ''
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {stylist ? `Manage ${stylist.stylist_name}` : 'Add stylist'}
          </DialogTitle>
          <DialogDescription>
            Create the profile customers see, then choose exactly which services
            this stylist can perform.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-[auto_1fr_1fr]">
            <div className="grid content-start gap-2">
              <PhotoPreview
                src={preview || imageUrl}
                alt={name || 'Stylist photo'}
                fallback={name || 'S'}
              />
              <input
                id="stylist-photo"
                type="file"
                accept="image/jpeg,image/png"
                className="sr-only"
                disabled={disabled}
                onChange={(event) =>
                  choosePhoto(event.target.files?.[0] ?? null)
                }
              />
              <label htmlFor="stylist-photo">
                <span className="border-border text-foreground hover:bg-muted inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border px-2.5 text-xs">
                  <ImagePlus className="size-3.5" />
                  {imageUrl || preview ? 'Change photo' : 'Upload photo'}
                </span>
              </label>
              {imageUrl || preview ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={disabled}
                  onClick={() => {
                    if (preview) URL.revokeObjectURL(preview);
                    setPreview('');
                    setFile(null);
                    setImageUrl('');
                  }}
                >
                  <X /> Remove
                </Button>
              ) : null}
            </div>
            <Field label="Stylist name">
              <input
                className={INPUT}
                required
                value={name}
                disabled={disabled}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Primary specialty">
              <input
                className={INPUT}
                value={specialty}
                placeholder="For example: Color and hair spa"
                disabled={disabled}
                onChange={(event) => setSpecialty(event.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Expertise tags"
            hint="Press Enter or Add after each expertise area."
          >
            <div className="border-border bg-background/50 rounded-lg border p-2">
              <div className="flex flex-wrap gap-1">
                {skills.map((skill) => (
                  <Badge key={skill} variant="outline">
                    {skill}
                    <button
                      type="button"
                      className="ml-1"
                      disabled={disabled}
                      onClick={() =>
                        setSkills((current) =>
                          current.filter((item) => item !== skill)
                        )
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  value={skillInput}
                  disabled={disabled}
                  placeholder="Add an expertise area"
                  onChange={(event) => setSkillInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addSkill();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={disabled || !skillInput.trim()}
                  onClick={addSkill}
                >
                  Add
                </Button>
              </div>
            </div>
          </Field>
          <Field label="Short bio">
            <textarea
              className={TEXTAREA}
              rows={2}
              value={bio}
              disabled={disabled}
              placeholder="A short, customer-friendly introduction"
              onChange={(event) => setBio(event.target.value)}
            />
          </Field>
          <StatusToggle
            checked={active}
            onChange={setActive}
            disabled={disabled}
          />
          <section className="border-border rounded-xl border p-4">
            <div>
              <h3 className="text-foreground font-medium">
                Services and expertise
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Select the services this stylist can book. Price and duration
                inherit from the service unless you customise them.
              </p>
            </div>
            <div className="mt-4 grid gap-3">
              {services.map((service) => {
                const assignment = assignments[service.service_id];
                return (
                  <div
                    key={service.service_id}
                    className="border-border bg-background/30 rounded-lg border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="text-foreground flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          className="accent-primary size-4"
                          checked={assignment?.enabled ?? false}
                          disabled={disabled}
                          onChange={(event) =>
                            updateAssignment(service.service_id, {
                              enabled: event.target.checked,
                            })
                          }
                        />
                        {service.service_name}
                        <span className="text-muted-foreground text-sm font-normal">
                          {service.duration_minutes} min ·{' '}
                          {money(service.price_paise)}
                        </span>
                      </label>
                      {assignment?.enabled ? (
                        <select
                          className="border-border bg-background text-foreground h-8 rounded-lg border px-2 text-sm"
                          value={
                            SKILL_LEVELS.includes(
                              assignment.skill_level as (typeof SKILL_LEVELS)[number]
                            )
                              ? assignment.skill_level
                              : '__custom'
                          }
                          disabled={disabled}
                          onChange={(event) =>
                            updateAssignment(service.service_id, {
                              skill_level:
                                event.target.value === '__custom'
                                  ? assignment.skill_level
                                  : event.target.value,
                            })
                          }
                        >
                          {!SKILL_LEVELS.includes(
                            assignment.skill_level as (typeof SKILL_LEVELS)[number]
                          ) ? (
                            <option value="__custom">
                              {humanSkill(assignment.skill_level)}
                            </option>
                          ) : null}
                          {SKILL_LEVELS.map((level) => (
                            <option key={level} value={level}>
                              {humanSkill(level)}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                    {assignment?.enabled ? (
                      <details className="mt-3">
                        <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
                          Customise this service for this stylist
                        </summary>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <StatusToggle
                            checked={assignment.customize}
                            label="Use custom values"
                            disabled={disabled}
                            onChange={(customize) =>
                              updateAssignment(service.service_id, {
                                customize,
                              })
                            }
                          />
                          {assignment.customize ? (
                            <>
                              <Field label="Duration (min)">
                                <input
                                  className={INPUT}
                                  type="number"
                                  min="5"
                                  value={assignment.override_duration_minutes}
                                  disabled={disabled}
                                  onChange={(event) =>
                                    updateAssignment(service.service_id, {
                                      override_duration_minutes:
                                        event.target.value,
                                    })
                                  }
                                />
                              </Field>
                              <Field label="Price (₹)">
                                <input
                                  className={INPUT}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={assignment.override_price_rupees}
                                  disabled={disabled}
                                  onChange={(event) =>
                                    updateAssignment(service.service_id, {
                                      override_price_rupees: event.target.value,
                                    })
                                  }
                                />
                              </Field>
                              <Field label="Deposit (₹)">
                                <input
                                  className={INPUT}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={assignment.override_deposit_rupees}
                                  disabled={disabled}
                                  onChange={(event) =>
                                    updateAssignment(service.service_id, {
                                      override_deposit_rupees:
                                        event.target.value,
                                    })
                                  }
                                />
                              </Field>
                            </>
                          ) : null}
                        </div>
                      </details>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
          <details className="border-border rounded-lg border p-3">
            <summary className="text-foreground cursor-pointer text-sm font-medium">
              Advanced profile settings
            </summary>
            <div className="mt-3 grid gap-3">
              <Field
                label="External image URL"
                hint="Use only when an image cannot be uploaded to Supabase."
              >
                <input
                  className={INPUT}
                  type="url"
                  value={imageUrl}
                  disabled={disabled || Boolean(file)}
                  placeholder="https://…"
                  onChange={(event) => setImageUrl(event.target.value)}
                />
              </Field>
              <Field label="Internal notes">
                <textarea
                  className={TEXTAREA}
                  rows={2}
                  value={notes}
                  disabled={disabled}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
            </div>
          </details>
          <DialogFooter>
            <Button
              type="submit"
              className="min-h-11"
              disabled={disabled || busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              {stylist ? 'Save stylist' : 'Add stylist'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SchedulePanel({
  data,
  disabled,
  saving,
  onRequest,
  activeStylists,
}: {
  data: ControlRoomData;
  disabled: boolean;
  saving: string;
  onRequest: (
    path: string,
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    body?: unknown,
    busyKey?: string
  ) => Promise<boolean>;
  activeStylists: SalonStylistRow[];
}) {
  const [stylistId, setStylistId] = useState(
    activeStylists[0]?.stylist_id ?? ''
  );
  const [custom, setCustom] = useState(false);
  const [closureDate, setClosureDate] = useState('');
  const [closureStylist, setClosureStylist] = useState('');
  const [closureNotes, setClosureNotes] = useState('');
  useEffect(() => {
    if (!activeStylists.some((stylist) => stylist.stylist_id === stylistId))
      setStylistId(activeStylists[0]?.stylist_id ?? '');
  }, [activeStylists, stylistId]);
  const salonRows = data.availability.filter(
    (row) => row.active && !row.blackout_date && !row.service_id
  );
  const stylistRows = data.stylistAvailability.filter(
    (row) => row.active && !row.blackout_date && row.stylist_id === stylistId
  );
  const hasCustom = stylistRows.length > 0;
  useEffect(() => setCustom(hasCustom), [stylistId, hasCustom]);
  const exceptions = [
    ...data.availability.map((row) => ({ ...row, scope: 'Salon' })),
    ...data.stylistAvailability.map((row) => ({
      ...row,
      scope:
        activeStylists.find((stylist) => stylist.stylist_id === row.stylist_id)
          ?.stylist_name || 'Stylist',
    })),
  ].filter((row) => row.active && row.blackout_date);
  async function saveClosure(event: FormEvent) {
    event.preventDefault();
    if (!closureDate) return;
    const day = weekdayForDate(closureDate);
    const isStylist = Boolean(closureStylist);
    const result = await onRequest(
      `${API}/${isStylist ? 'stylist-availability' : 'availability'}`,
      'POST',
      isStylist
        ? {
            stylist_id: closureStylist,
            day_name: day,
            open_time: '00:00',
            close_time: '00:05',
            slot_interval_minutes: 30,
            blackout_date: closureDate,
            active: true,
            notes: closureNotes,
          }
        : {
            day_name: day,
            open_time: '00:00',
            close_time: '00:05',
            slot_interval_minutes: 30,
            blackout_date: closureDate,
            service_id: '',
            active: true,
            notes: closureNotes,
          },
      'closure'
    );
    if (result) {
      setClosureDate('');
      setClosureNotes('');
      toast.success('Closure added');
    }
  }
  return (
    <section className="grid gap-6">
      <SectionHeader
        icon={CalendarClock}
        title="Booking schedule"
        description="Open days, booking hours, slot spacing, and temporary closures. Weekend slots follow this schedule."
        action={null}
      />
      <ScheduleGrid
        key={`salon-${data.availability.map((row) => `${row.availability_id}:${row.updated_at}`).join('|')}`}
        title="Salon weekly hours"
        description="These are the default hours used by every stylist who follows the salon schedule."
        initialRows={salonRows}
        scope="salon"
        disabled={disabled}
        saving={saving === 'salon-schedule'}
        onSave={(rules, deactivateIds) =>
          onRequest(
            `${API}/schedule`,
            'PUT',
            { scope: 'salon', rules, deactivate_ids: deactivateIds },
            'salon-schedule'
          )
        }
      />
      <Card className="bg-card/60">
        <CardHeader>
          <CardTitle>Stylist schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Stylist">
            <select
              className={INPUT}
              value={stylistId}
              disabled={disabled || !activeStylists.length}
              onChange={(event) => setStylistId(event.target.value)}
            >
              {activeStylists.map((stylist) => (
                <option key={stylist.stylist_id} value={stylist.stylist_id}>
                  {stylist.stylist_name}
                </option>
              ))}
            </select>
          </Field>
          <div className="border-border bg-background/30 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-foreground font-medium">
                {custom ? 'Custom weekly hours' : 'Following salon hours'}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {custom
                  ? 'Days without a custom range are closed for this stylist.'
                  : 'The salon hours above are used until a custom schedule is saved.'}
              </p>
            </div>
            <StatusToggle
              checked={custom}
              label="Use custom hours"
              disabled={disabled || !stylistId}
              onChange={async (next) => {
                if (next) {
                  setCustom(true);
                  return;
                }
                if (
                  await onRequest(
                    `${API}/schedule`,
                    'PUT',
                    {
                      scope: 'stylist',
                      stylist_id: stylistId,
                      rules: [],
                      deactivate_ids: stylistRows.map(
                        (row) => row.stylist_availability_id
                      ),
                    },
                    'stylist-schedule'
                  )
                ) {
                  setCustom(false);
                  toast.success('Stylist now follows salon hours');
                }
              }}
            />
          </div>
          {custom ? (
            <ScheduleGrid
              key={`stylist-${stylistId}-${stylistRows.map((row) => `${row.stylist_availability_id}:${row.updated_at}`).join('|')}`}
              title="Custom weekly availability"
              description="Copy the salon schedule, then adjust only the days this stylist works."
              initialRows={stylistRows}
              copyRows={salonRows}
              scope="stylist"
              disabled={disabled}
              saving={saving === 'stylist-schedule'}
              onSave={(rules, deactivateIds) =>
                onRequest(
                  `${API}/schedule`,
                  'PUT',
                  {
                    scope: 'stylist',
                    stylist_id: stylistId,
                    rules,
                    deactivate_ids: deactivateIds,
                  },
                  'stylist-schedule'
                )
              }
            />
          ) : null}
        </CardContent>
      </Card>
      <Card className="bg-card/60">
        <CardHeader>
          <CardTitle>Temporary closures</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={saveClosure}
            className="grid gap-3 lg:grid-cols-[1fr_1fr_2fr_auto]"
          >
            <Field label="Date">
              <input
                className={INPUT}
                type="date"
                value={closureDate}
                disabled={disabled}
                onChange={(event) => setClosureDate(event.target.value)}
              />
            </Field>
            <Field label="Applies to">
              <select
                className={INPUT}
                value={closureStylist}
                disabled={disabled}
                onChange={(event) => setClosureStylist(event.target.value)}
              >
                <option value="">Entire salon</option>
                {activeStylists.map((stylist) => (
                  <option key={stylist.stylist_id} value={stylist.stylist_id}>
                    {stylist.stylist_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason (optional)">
              <input
                className={INPUT}
                value={closureNotes}
                disabled={disabled}
                placeholder="For example: public holiday"
                onChange={(event) => setClosureNotes(event.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button
                className="min-h-11 w-full lg:w-auto"
                disabled={disabled || saving === 'closure'}
              >
                {saving === 'closure' ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Plus />
                )}{' '}
                Add closure
              </Button>
            </div>
          </form>
          <div className="mt-5 grid gap-2">
            {exceptions.length ? (
              exceptions.map((row) => (
                <div
                  key={
                    'availability_id' in row
                      ? row.availability_id
                      : row.stylist_availability_id
                  }
                  className="border-border flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="text-foreground font-medium">
                    {row.blackout_date}
                  </span>
                  <span className="text-muted-foreground">
                    {row.scope}
                    {row.notes ? ` · ${row.notes}` : ''}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                No temporary closures scheduled.
              </p>
            )}
          </div>
          <details className="border-border mt-4 rounded-lg border p-3">
            <summary className="text-foreground cursor-pointer text-sm font-medium">
              Advanced scheduling notes
            </summary>
            <p className="text-muted-foreground mt-2 text-sm">
              Existing service-specific rules and effective date windows are
              retained. The weekly grids edit normal hours only, keeping
              temporary booking rules safe.
            </p>
          </details>
        </CardContent>
      </Card>
    </section>
  );
}

function ScheduleGrid({
  title,
  description,
  initialRows,
  copyRows,
  scope,
  disabled,
  saving,
  onSave,
}: {
  title: string;
  description: string;
  initialRows: Array<AvailabilityRow | StylistAvailabilityRow>;
  copyRows?: Array<AvailabilityRow | StylistAvailabilityRow>;
  scope: 'salon' | 'stylist';
  disabled: boolean;
  saving: boolean;
  onSave: (rules: DraftRule[], deactivateIds: string[]) => Promise<boolean>;
}) {
  const initialWeek = useMemo(
    () => weekFromRows(initialRows, scope),
    [initialRows, scope]
  );
  const [week, setWeek] = useState(initialWeek);
  useEffect(() => setWeek(initialWeek), [initialWeek]);
  const dirty = JSON.stringify(week) !== JSON.stringify(initialWeek);
  const knownIds = useMemo(
    () =>
      initialRows.map((row) =>
        'availability_id' in row
          ? row.availability_id
          : row.stylist_availability_id
      ),
    [initialRows]
  );
  function setDay(day: Weekday, next: DraftRule[]) {
    setWeek((current) => ({ ...current, [day]: next }));
  }
  function copy(day: Weekday, days: Weekday[]) {
    const source = week[day].length ? week[day] : [defaultRule(day)];
    setWeek((current) => ({
      ...current,
      ...Object.fromEntries(
        days.map((target) => [
          target,
          source.map((rule, index) => ({
            ...rule,
            id: current[target][index]?.id,
            day_name: target,
          })),
        ])
      ),
    }));
  }
  async function save() {
    if (!dirty) {
      toast.message('No schedule changes to save');
      return;
    }
    const draftRules = WEEKDAYS.flatMap((day) => week[day]);
    const activeIds = new Set(
      draftRules.map((rule) => rule.id).filter(Boolean)
    );
    const deactivateIds = knownIds.filter((id) => !activeIds.has(id));
    const rules = draftRules.map((rule) =>
      scope === 'salon'
        ? { ...rule, availability_id: rule.id }
        : { ...rule, stylist_availability_id: rule.id }
    );
    if (await onSave(rules, deactivateIds)) toast.success(`${title} saved`);
  }
  return (
    <Card className="bg-card/60">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 sm:min-h-7"
              disabled={disabled}
              onClick={() => copy('Monday', WEEKDAYS.slice(1) as Weekday[])}
            >
              Copy Monday to all days
            </Button>
            {copyRows ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-7"
                disabled={disabled}
                onClick={() =>
                  setWeek(
                    Object.fromEntries(
                      Object.entries(weekFromRows(copyRows, 'salon')).map(
                        ([day, rules]) => [
                          day,
                          rules.map((rule) => ({ ...rule, id: undefined })),
                        ]
                      )
                    ) as Record<Weekday, DraftRule[]>
                  )
                }
              >
                Copy salon hours
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        {WEEKDAYS.map((day) => {
          const rules = week[day];
          return (
            <div
              key={day}
              className="border-border bg-background/30 grid gap-3 rounded-lg border p-3 md:grid-cols-[120px_1fr_auto]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-foreground font-medium">{day}</span>
                <StatusToggle
                  checked={Boolean(rules.length)}
                  label={rules.length ? 'Open' : 'Closed'}
                  disabled={disabled}
                  onChange={(open) =>
                    setDay(
                      day,
                      open ? (rules.length ? rules : [defaultRule(day)]) : []
                    )
                  }
                />
              </div>
              <div className="grid gap-2">
                {rules.map((rule, index) => (
                  <div
                    key={rule.id || `${day}-${index}`}
                    className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_110px_auto]"
                  >
                    <input
                      className={INPUT}
                      type="time"
                      aria-label={`${day} opening time ${index + 1}`}
                      value={rule.open_time}
                      disabled={disabled}
                      onChange={(event) =>
                        setDay(
                          day,
                          rules.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, open_time: event.target.value }
                              : item
                          )
                        )
                      }
                    />
                    <input
                      className={INPUT}
                      type="time"
                      aria-label={`${day} closing time ${index + 1}`}
                      value={rule.close_time}
                      disabled={disabled}
                      onChange={(event) =>
                        setDay(
                          day,
                          rules.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, close_time: event.target.value }
                              : item
                          )
                        )
                      }
                    />
                    <select
                      className={`${INPUT} col-span-2 sm:col-span-1`}
                      aria-label={`${day} slot interval ${index + 1}`}
                      value={rule.slot_interval_minutes}
                      disabled={disabled}
                      onChange={(event) =>
                        setDay(
                          day,
                          rules.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  slot_interval_minutes: Number(
                                    event.target.value
                                  ),
                                }
                              : item
                          )
                        )
                      }
                    >
                      {[15, 20, 30, 45, 60].map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes} min slots
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="col-span-2 min-h-11 justify-self-end sm:col-span-1 sm:min-h-7"
                      title="Remove time range"
                      disabled={disabled}
                      onClick={() =>
                        setDay(
                          day,
                          rules.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 w-full md:min-h-7 md:w-auto"
                disabled={disabled || !rules.length}
                onClick={() =>
                  setDay(day, [
                    ...rules,
                    {
                      ...defaultRule(day),
                      open_time: rules.at(-1)?.close_time || '10:00',
                      close_time: '18:00',
                    },
                  ])
                }
              >
                <Plus /> Add range
              </Button>
            </div>
          );
        })}
        <div className="flex flex-col items-end gap-2 pt-2">
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {dirty ? 'Unsaved schedule changes' : 'Schedule is saved'}
          </p>
          <Button
            className="min-h-11 w-full sm:w-auto"
            disabled={disabled || saving || !dirty}
            onClick={save}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Check />} Save
            weekly hours
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
