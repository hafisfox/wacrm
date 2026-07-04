"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  CalendarClock,
  Clock,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Scissors,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useCan } from "@/hooks/use-can";
import { cn } from "@/lib/utils";
import type {
  AvailabilityRow,
  ControlRoomData,
  SalonConfigRow,
  SalonServiceRow,
  SalonStylistRow,
  StylistAvailabilityRow,
  StylistServiceRow,
} from "@/lib/salu/control-room";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const API_BASE = "/api/salu/control-room";

type MutateMethod = "POST" | "PATCH" | "DELETE";

function formPayload(form: HTMLFormElement) {
  const formData = new FormData(form);
  const payload: Record<string, FormDataEntryValue> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key);
    const value = values[values.length - 1];
    if (value !== undefined) payload[key] = value;
  }
  return payload;
}

function boolField(name: string, checked: boolean, disabled: boolean) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-md border border-slate-800 bg-slate-950/40 px-3 text-xs text-slate-300">
      <input type="hidden" name={name} value="false" />
      <input
        name={name}
        type="checkbox"
        value="true"
        defaultChecked={checked}
        disabled={disabled}
        className="h-4 w-4 rounded border-slate-700 bg-slate-950"
      />
      Active
    </label>
  );
}

function money(value: number) {
  return `Rs ${Math.round(value / 100).toLocaleString("en-IN")}`;
}

function TextInput({
  name,
  defaultValue,
  placeholder,
  disabled,
  type = "text",
  className,
  min,
}: {
  name: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  disabled: boolean;
  type?: string;
  className?: string;
  min?: number;
}) {
  return (
    <input
      name={name}
      type={type}
      defaultValue={defaultValue ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      className={cn(
        "h-9 w-full rounded-md border border-slate-800 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition focus:border-primary/60 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}

function TextArea({
  name,
  defaultValue,
  placeholder,
  disabled,
  rows = 3,
}: {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  disabled: boolean;
  rows?: number;
}) {
  return (
    <textarea
      name={name}
      defaultValue={defaultValue ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      className="w-full resize-y rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary/60 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

function SelectField({
  name,
  defaultValue,
  disabled,
  children,
}: {
  name: string;
  defaultValue?: string | null;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      disabled={disabled}
      className="h-9 w-full rounded-md border border-slate-800 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition focus:border-primary/60 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </select>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  count,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <span>{title}</span>
      {typeof count === "number" && (
        <Badge variant="outline" className="border-slate-700 text-slate-300">
          {count}
        </Badge>
      )}
    </div>
  );
}

function SaveButton({
  disabled,
  busy,
  label = "Save",
}: {
  disabled: boolean;
  busy: boolean;
  label?: string;
}) {
  return (
    <Button type="submit" size="sm" disabled={disabled || busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save />}
      {label}
    </Button>
  );
}

export function SalonControlClient({
  initialData,
}: {
  initialData: ControlRoomData;
}) {
  const canEdit = useCan("edit-settings");
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const activeStylists = useMemo(
    () => data.stylists.filter((row) => row.active),
    [data.stylists],
  );
  const activeServices = useMemo(
    () => data.services.filter((row) => row.active),
    [data.services],
  );

  async function reload() {
    setSaving("refresh");
    setError("");
    try {
      const response = await fetch(API_BASE);
      const next = (await response.json()) as ControlRoomData | { error: string };
      if (!response.ok) throw new Error("error" in next ? next.error : "Refresh failed");
      setData(next as ControlRoomData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setSaving("");
    }
  }

  async function mutate(
    path: string,
    method: MutateMethod,
    body?: Record<string, unknown>,
    busyKey = path,
  ) {
    if (!canEdit) return;
    setSaving(busyKey);
    setError("");
    try {
      const response = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const next = (await response.json()) as ControlRoomData | { error: string };
      if (!response.ok) throw new Error("error" in next ? next.error : "Update failed");
      setData(next as ControlRoomData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving("");
    }
  }

  function submit(
    event: FormEvent<HTMLFormElement>,
    path: string,
    method: "POST" | "PATCH",
    busyKey: string,
  ) {
    event.preventDefault();
    mutate(path, method, formPayload(event.currentTarget), busyKey);
  }

  const disabled = !canEdit;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-normal text-white">
                Salon Control
              </h1>
              <Badge
                variant={data.readiness.ready ? "default" : "destructive"}
                className="h-6"
              >
                {data.readiness.ready ? "Ready" : "Needs Setup"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Supabase is the source of truth for salon setup and booking operations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!canEdit && (
              <Badge variant="outline" className="border-slate-700 text-slate-300">
                <Eye className="h-3 w-3" />
                Read-only
              </Badge>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reload}
              disabled={saving === "refresh"}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", saving === "refresh" && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <ReadinessStrip data={data} />

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-2 gap-1 bg-slate-900 p-1 sm:grid-cols-3 lg:grid-cols-6">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="mapping">Mappings</TabsTrigger>
            <TabsTrigger value="hours">Salon Hours</TabsTrigger>
            <TabsTrigger value="stylist-hours">Stylist Hours</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4">
            <ConfigPanel
              config={data.config}
              disabled={disabled}
              busy={saving === "config"}
              onSubmit={(event) => submit(event, `${API_BASE}/config`, "PATCH", "config")}
            />
          </TabsContent>

          <TabsContent value="services" className="mt-4">
            <ServicesPanel
              rows={data.services}
              disabled={disabled}
              saving={saving}
              onSubmit={submit}
              onDelete={(id) =>
                mutate(
                  `${API_BASE}/services?service_id=${encodeURIComponent(id)}`,
                  "DELETE",
                  undefined,
                  `delete-service:${id}`,
                )
              }
            />
          </TabsContent>

          <TabsContent value="staff" className="mt-4">
            <StylistsPanel
              rows={data.stylists}
              disabled={disabled}
              saving={saving}
              onSubmit={submit}
              onDelete={(id) =>
                mutate(
                  `${API_BASE}/stylists?stylist_id=${encodeURIComponent(id)}`,
                  "DELETE",
                  undefined,
                  `delete-stylist:${id}`,
                )
              }
            />
          </TabsContent>

          <TabsContent value="mapping" className="mt-4">
            <MappingsPanel
              rows={data.stylistServices}
              stylists={activeStylists}
              services={activeServices}
              disabled={disabled}
              saving={saving}
              onSubmit={submit}
              onDelete={(id) =>
                mutate(
                  `${API_BASE}/stylist-services?stylist_service_id=${encodeURIComponent(id)}`,
                  "DELETE",
                  undefined,
                  `delete-mapping:${id}`,
                )
              }
            />
          </TabsContent>

          <TabsContent value="hours" className="mt-4">
            <AvailabilityPanel
              rows={data.availability}
              services={activeServices}
              disabled={disabled}
              saving={saving}
              onSubmit={submit}
              onDelete={(id) =>
                mutate(
                  `${API_BASE}/availability?availability_id=${encodeURIComponent(id)}`,
                  "DELETE",
                  undefined,
                  `delete-availability:${id}`,
                )
              }
            />
          </TabsContent>

          <TabsContent value="stylist-hours" className="mt-4">
            <StylistAvailabilityPanel
              rows={data.stylistAvailability}
              stylists={activeStylists}
              disabled={disabled}
              saving={saving}
              onSubmit={submit}
              onDelete={(id) =>
                mutate(
                  `${API_BASE}/stylist-availability?stylist_availability_id=${encodeURIComponent(id)}`,
                  "DELETE",
                  undefined,
                  `delete-stylist-availability:${id}`,
                )
              }
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function ReadinessStrip({ data }: { data: ControlRoomData }) {
  const items = [
    ["Services", data.readiness.active_services, Scissors],
    ["Stylists", data.readiness.active_stylists, UserRound],
    ["Mappings", data.readiness.active_mappings, CalendarClock],
    [
      "Hours",
      data.readiness.availability_rules +
        data.readiness.stylist_availability_rules,
      Clock,
    ],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, value, Icon]) => (
        <div
          key={label}
          className="min-h-24 rounded-lg border border-slate-800 bg-slate-900/70 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-400">{label}</span>
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
        </div>
      ))}
    </div>
  );
}

function ConfigPanel({
  config,
  disabled,
  busy,
  onSubmit,
}: {
  config: SalonConfigRow;
  disabled: boolean;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Card className="rounded-lg border-slate-800 bg-slate-900/70">
      <CardHeader>
        <CardTitle>
          <SectionTitle icon={Scissors} title="Salon Details" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-3 lg:grid-cols-2">
          <TextInput name="salon_name" defaultValue={config.salon_name} disabled={disabled} placeholder="Salon name" />
          <TextInput name="timezone" defaultValue={config.timezone} disabled={disabled} placeholder="Timezone" />
          <TextInput name="owner_number" defaultValue={config.owner_number} disabled={disabled} placeholder="Owner WhatsApp number" />
          <TextInput name="default_language" defaultValue={config.default_language} disabled={disabled} placeholder="Default language" />
          <div className="lg:col-span-2">
            <TextArea name="address" defaultValue={config.address} disabled={disabled} rows={2} placeholder="Address" />
          </div>
          <div className="lg:col-span-2">
            <TextArea name="hours" defaultValue={config.hours} disabled={disabled} rows={2} placeholder="Public hours text" />
          </div>
          <div className="lg:col-span-2">
            <TextArea name="bot_policy_text" defaultValue={config.bot_policy_text} disabled={disabled} rows={4} placeholder="Bot policy" />
          </div>
          <div className="flex justify-end lg:col-span-2">
            <SaveButton disabled={disabled} busy={busy} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ServicesPanel({
  rows,
  disabled,
  saving,
  onSubmit,
  onDelete,
}: {
  rows: SalonServiceRow[];
  disabled: boolean;
  saving: string;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    path: string,
    method: "POST" | "PATCH",
    busyKey: string,
  ) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <Card className="rounded-lg border-slate-800 bg-slate-900/70">
        <CardHeader>
          <CardTitle>
            <SectionTitle icon={Plus} title="New Service" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => onSubmit(event, `${API_BASE}/services`, "POST", "new-service")}
            className="grid gap-3 lg:grid-cols-6"
          >
            <TextInput name="service_name" disabled={disabled} placeholder="Service" className="lg:col-span-2" />
            <TextInput name="duration_minutes" type="number" min={5} disabled={disabled} placeholder="Minutes" />
            <TextInput name="price_display" disabled={disabled} placeholder="Display price" />
            <TextInput name="price_paise" type="number" min={0} disabled={disabled} placeholder="Price paise" />
            <TextInput name="deposit_paise" type="number" min={0} disabled={disabled} placeholder="Deposit paise" />
            <div className="flex justify-end lg:col-span-6">
              <SaveButton disabled={disabled} busy={saving === "new-service"} label="Add" />
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-3">
        {rows.map((row) => (
          <ServiceRow
            key={row.service_id}
            row={row}
            disabled={disabled}
            busy={saving === `service:${row.service_id}`}
            deleting={saving === `delete-service:${row.service_id}`}
            onSubmit={onSubmit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceRow({
  row,
  disabled,
  busy,
  deleting,
  onSubmit,
  onDelete,
}: {
  row: SalonServiceRow;
  disabled: boolean;
  busy: boolean;
  deleting: boolean;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    path: string,
    method: "POST" | "PATCH",
    busyKey: string,
  ) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <form
      onSubmit={(event) =>
        onSubmit(event, `${API_BASE}/services`, "PATCH", `service:${row.service_id}`)
      }
      className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
    >
      <input type="hidden" name="service_id" value={row.service_id} />
      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_auto]">
        <TextInput name="service_name" defaultValue={row.service_name} disabled={disabled} />
        <TextInput name="duration_minutes" type="number" min={5} defaultValue={row.duration_minutes} disabled={disabled} />
        <TextInput name="price_display" defaultValue={row.price_display || money(row.price_paise)} disabled={disabled} />
        <TextInput name="price_paise" type="number" min={0} defaultValue={row.price_paise} disabled={disabled} />
        <TextInput name="deposit_paise" type="number" min={0} defaultValue={row.deposit_paise} disabled={disabled} />
        <TextInput name="flow_order" type="number" min={0} defaultValue={row.flow_order} disabled={disabled} />
        <div className="flex gap-2">
          {boolField("active", row.active, disabled)}
          <input type="hidden" name="payment_required" value="false" />
          <label className="flex h-9 items-center gap-2 rounded-md border border-slate-800 bg-slate-950/40 px-3 text-xs text-slate-300">
            <input name="payment_required" type="checkbox" value="true" defaultChecked={row.payment_required} disabled={disabled} className="h-4 w-4 rounded border-slate-700 bg-slate-950" />
            Pay
          </label>
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <TextInput name="payment_label" defaultValue={row.payment_label} disabled={disabled} placeholder="Payment label" />
        <TextInput name="notes" defaultValue={row.notes} disabled={disabled} placeholder="Notes" />
        <div className="flex justify-end gap-2">
          <SaveButton disabled={disabled} busy={busy} />
          <Button type="button" variant="destructive" size="icon-sm" title="Deactivate" disabled={disabled || deleting} onClick={() => onDelete(row.service_id)}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </div>
      </div>
    </form>
  );
}

function StylistsPanel({
  rows,
  disabled,
  saving,
  onSubmit,
  onDelete,
}: {
  rows: SalonStylistRow[];
  disabled: boolean;
  saving: string;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    path: string,
    method: "POST" | "PATCH",
    busyKey: string,
  ) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <Card className="rounded-lg border-slate-800 bg-slate-900/70">
        <CardHeader>
          <CardTitle>
            <SectionTitle icon={Plus} title="New Stylist" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => onSubmit(event, `${API_BASE}/stylists`, "POST", "new-stylist")}
            className="grid gap-3 lg:grid-cols-4"
          >
            <TextInput name="stylist_name" disabled={disabled} placeholder="Name" />
            <TextInput name="specialty" disabled={disabled} placeholder="Specialty" />
            <TextInput name="image_url" disabled={disabled} placeholder="Image URL" />
            <TextInput name="flow_order" type="number" min={0} disabled={disabled} placeholder="Order" />
            <div className="flex justify-end lg:col-span-4">
              <SaveButton disabled={disabled} busy={saving === "new-stylist"} label="Add" />
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <StylistRow
            key={row.stylist_id}
            row={row}
            disabled={disabled}
            busy={saving === `stylist:${row.stylist_id}`}
            deleting={saving === `delete-stylist:${row.stylist_id}`}
            onSubmit={onSubmit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function StylistRow({
  row,
  disabled,
  busy,
  deleting,
  onSubmit,
  onDelete,
}: {
  row: SalonStylistRow;
  disabled: boolean;
  busy: boolean;
  deleting: boolean;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    path: string,
    method: "POST" | "PATCH",
    busyKey: string,
  ) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <form
      onSubmit={(event) =>
        onSubmit(event, `${API_BASE}/stylists`, "PATCH", `stylist:${row.stylist_id}`)
      }
      className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
    >
      <input type="hidden" name="stylist_id" value={row.stylist_id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput name="stylist_name" defaultValue={row.stylist_name} disabled={disabled} />
        <TextInput name="specialty" defaultValue={row.specialty} disabled={disabled} />
        <TextInput name="image_url" defaultValue={row.image_url} disabled={disabled} placeholder="Image URL" />
        <TextInput name="image_alt" defaultValue={row.image_alt} disabled={disabled} placeholder="Image alt" />
        <TextInput name="skills_summary" defaultValue={row.skills_summary} disabled={disabled} placeholder="Skills" />
        <TextInput name="flow_order" type="number" min={0} defaultValue={row.flow_order} disabled={disabled} />
      </div>
      <div className="mt-3">
        <TextArea name="bio" defaultValue={row.bio} disabled={disabled} rows={2} placeholder="Bio" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <TextInput name="notes" defaultValue={row.notes} disabled={disabled} placeholder="Notes" />
        <div className="flex justify-end gap-2">
          {boolField("active", row.active, disabled)}
          <SaveButton disabled={disabled} busy={busy} />
          <Button type="button" variant="destructive" size="icon-sm" title="Deactivate" disabled={disabled || deleting} onClick={() => onDelete(row.stylist_id)}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </div>
      </div>
    </form>
  );
}

function MappingsPanel({
  rows,
  stylists,
  services,
  disabled,
  saving,
  onSubmit,
  onDelete,
}: {
  rows: StylistServiceRow[];
  stylists: SalonStylistRow[];
  services: SalonServiceRow[];
  disabled: boolean;
  saving: string;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    path: string,
    method: "POST" | "PATCH",
    busyKey: string,
  ) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <Card className="rounded-lg border-slate-800 bg-slate-900/70">
        <CardHeader>
          <CardTitle>
            <SectionTitle icon={Plus} title="New Mapping" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MappingForm
            disabled={disabled}
            busy={saving === "new-mapping"}
            stylists={stylists}
            services={services}
            onSubmit={(event) => onSubmit(event, `${API_BASE}/stylist-services`, "POST", "new-mapping")}
          />
        </CardContent>
      </Card>
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={row.stylist_service_id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <MappingForm
              row={row}
              disabled={disabled}
              busy={saving === `mapping:${row.stylist_service_id}`}
              stylists={stylists}
              services={services}
              onSubmit={(event) => onSubmit(event, `${API_BASE}/stylist-services`, "PATCH", `mapping:${row.stylist_service_id}`)}
              onDelete={() => onDelete(row.stylist_service_id)}
              deleting={saving === `delete-mapping:${row.stylist_service_id}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MappingForm({
  row,
  disabled,
  busy,
  stylists,
  services,
  onSubmit,
  onDelete,
  deleting,
}: {
  row?: StylistServiceRow;
  disabled: boolean;
  busy: boolean;
  stylists: SalonStylistRow[];
  services: SalonServiceRow[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr_0.7fr_0.7fr_0.7fr_0.7fr_auto]">
      {row && <input type="hidden" name="stylist_service_id" value={row.stylist_service_id} />}
      <SelectField name="stylist_id" defaultValue={row?.stylist_id} disabled={disabled}>
        <option value="">Stylist</option>
        {stylists.map((stylist) => (
          <option key={stylist.stylist_id} value={stylist.stylist_id}>
            {stylist.stylist_name}
          </option>
        ))}
      </SelectField>
      <SelectField name="service_id" defaultValue={row?.service_id} disabled={disabled}>
        <option value="">Service</option>
        {services.map((service) => (
          <option key={service.service_id} value={service.service_id}>
            {service.service_name}
          </option>
        ))}
      </SelectField>
      <TextInput name="override_duration_minutes" type="number" min={5} defaultValue={row?.override_duration_minutes ?? ""} disabled={disabled} placeholder="Minutes" />
      <TextInput name="override_price_paise" type="number" min={0} defaultValue={row?.override_price_paise ?? ""} disabled={disabled} placeholder="Price" />
      <TextInput name="override_deposit_paise" type="number" min={0} defaultValue={row?.override_deposit_paise ?? ""} disabled={disabled} placeholder="Deposit" />
      <TextInput name="skill_level" defaultValue={row?.skill_level ?? ""} disabled={disabled} placeholder="Skill" />
      <div className="flex justify-end gap-2">
        {boolField("active", row?.active ?? true, disabled)}
        <SaveButton disabled={disabled} busy={busy} label={row ? "Save" : "Add"} />
        {row && onDelete && (
          <Button type="button" variant="destructive" size="icon-sm" title="Deactivate" disabled={disabled || deleting} onClick={onDelete}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        )}
      </div>
      <TextInput name="flow_order" type="number" min={0} defaultValue={row?.flow_order ?? ""} disabled={disabled} placeholder="Order" className="lg:col-span-1" />
      <TextInput name="notes" defaultValue={row?.notes ?? ""} disabled={disabled} placeholder="Notes" className="lg:col-span-6" />
    </form>
  );
}

function AvailabilityPanel({
  rows,
  services,
  disabled,
  saving,
  onSubmit,
  onDelete,
}: {
  rows: AvailabilityRow[];
  services: SalonServiceRow[];
  disabled: boolean;
  saving: string;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    path: string,
    method: "POST" | "PATCH",
    busyKey: string,
  ) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <Card className="rounded-lg border-slate-800 bg-slate-900/70">
        <CardHeader>
          <CardTitle>
            <SectionTitle icon={Clock} title="New Salon Hours" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AvailabilityForm
            disabled={disabled}
            busy={saving === "new-availability"}
            services={services}
            onSubmit={(event) => onSubmit(event, `${API_BASE}/availability`, "POST", "new-availability")}
          />
        </CardContent>
      </Card>
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={row.availability_id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <AvailabilityForm
              row={row}
              disabled={disabled}
              busy={saving === `availability:${row.availability_id}`}
              services={services}
              onSubmit={(event) => onSubmit(event, `${API_BASE}/availability`, "PATCH", `availability:${row.availability_id}`)}
              onDelete={() => onDelete(row.availability_id)}
              deleting={saving === `delete-availability:${row.availability_id}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function AvailabilityForm({
  row,
  disabled,
  busy,
  services,
  onSubmit,
  onDelete,
  deleting,
}: {
  row?: AvailabilityRow;
  disabled: boolean;
  busy: boolean;
  services: SalonServiceRow[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 lg:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_1fr_1fr_auto]">
      {row && <input type="hidden" name="availability_id" value={row.availability_id} />}
      <SelectField name="day_name" defaultValue={row?.day_name} disabled={disabled}>
        <option value="">Day</option>
        {WEEKDAYS.map((day) => (
          <option key={day} value={day}>
            {day}
          </option>
        ))}
      </SelectField>
      <TextInput name="open_time" type="time" defaultValue={row?.open_time ?? ""} disabled={disabled} />
      <TextInput name="close_time" type="time" defaultValue={row?.close_time ?? ""} disabled={disabled} />
      <TextInput name="slot_interval_minutes" type="number" min={5} defaultValue={row?.slot_interval_minutes ?? 30} disabled={disabled} placeholder="Interval" />
      <TextInput name="blackout_date" type="date" defaultValue={row?.blackout_date ?? ""} disabled={disabled} />
      <SelectField name="service_id" defaultValue={row?.service_id} disabled={disabled}>
        <option value="">All services</option>
        {services.map((service) => (
          <option key={service.service_id} value={service.service_id}>
            {service.service_name}
          </option>
        ))}
      </SelectField>
      <div className="flex justify-end gap-2">
        {boolField("active", row?.active ?? true, disabled)}
        <SaveButton disabled={disabled} busy={busy} label={row ? "Save" : "Add"} />
        {row && onDelete && (
          <Button type="button" variant="destructive" size="icon-sm" title="Deactivate" disabled={disabled || deleting} onClick={onDelete}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        )}
      </div>
      <TextInput name="notes" defaultValue={row?.notes ?? ""} disabled={disabled} placeholder="Notes" className="lg:col-span-7" />
    </form>
  );
}

function StylistAvailabilityPanel({
  rows,
  stylists,
  disabled,
  saving,
  onSubmit,
  onDelete,
}: {
  rows: StylistAvailabilityRow[];
  stylists: SalonStylistRow[];
  disabled: boolean;
  saving: string;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    path: string,
    method: "POST" | "PATCH",
    busyKey: string,
  ) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <Card className="rounded-lg border-slate-800 bg-slate-900/70">
        <CardHeader>
          <CardTitle>
            <SectionTitle icon={CalendarClock} title="New Stylist Availability" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StylistAvailabilityForm
            disabled={disabled}
            busy={saving === "new-stylist-availability"}
            stylists={stylists}
            onSubmit={(event) =>
              onSubmit(
                event,
                `${API_BASE}/stylist-availability`,
                "POST",
                "new-stylist-availability",
              )
            }
          />
        </CardContent>
      </Card>
      <WeeklyAvailabilityGrid rows={rows} stylists={stylists} />
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={row.stylist_availability_id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <StylistAvailabilityForm
              row={row}
              disabled={disabled}
              busy={saving === `stylist-availability:${row.stylist_availability_id}`}
              stylists={stylists}
              onSubmit={(event) =>
                onSubmit(
                  event,
                  `${API_BASE}/stylist-availability`,
                  "PATCH",
                  `stylist-availability:${row.stylist_availability_id}`,
                )
              }
              onDelete={() => onDelete(row.stylist_availability_id)}
              deleting={saving === `delete-stylist-availability:${row.stylist_availability_id}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function StylistAvailabilityForm({
  row,
  disabled,
  busy,
  stylists,
  onSubmit,
  onDelete,
  deleting,
}: {
  row?: StylistAvailabilityRow;
  disabled: boolean;
  busy: boolean;
  stylists: SalonStylistRow[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr_0.75fr_0.75fr_0.7fr_0.9fr_0.9fr_auto]">
      {row && <input type="hidden" name="stylist_availability_id" value={row.stylist_availability_id} />}
      <SelectField name="stylist_id" defaultValue={row?.stylist_id} disabled={disabled}>
        <option value="">Stylist</option>
        {stylists.map((stylist) => (
          <option key={stylist.stylist_id} value={stylist.stylist_id}>
            {stylist.stylist_name}
          </option>
        ))}
      </SelectField>
      <SelectField name="day_name" defaultValue={row?.day_name} disabled={disabled}>
        <option value="">Day</option>
        {WEEKDAYS.map((day) => (
          <option key={day} value={day}>
            {day}
          </option>
        ))}
      </SelectField>
      <TextInput name="open_time" type="time" defaultValue={row?.open_time ?? ""} disabled={disabled} />
      <TextInput name="close_time" type="time" defaultValue={row?.close_time ?? ""} disabled={disabled} />
      <TextInput name="slot_interval_minutes" type="number" min={5} defaultValue={row?.slot_interval_minutes ?? 30} disabled={disabled} placeholder="Interval" />
      <TextInput name="effective_from" type="date" defaultValue={row?.effective_from ?? ""} disabled={disabled} />
      <TextInput name="effective_to" type="date" defaultValue={row?.effective_to ?? ""} disabled={disabled} />
      <div className="flex justify-end gap-2">
        {boolField("active", row?.active ?? true, disabled)}
        <SaveButton disabled={disabled} busy={busy} label={row ? "Save" : "Add"} />
        {row && onDelete && (
          <Button type="button" variant="destructive" size="icon-sm" title="Deactivate" disabled={disabled || deleting} onClick={onDelete}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        )}
      </div>
      <TextInput name="blackout_date" type="date" defaultValue={row?.blackout_date ?? ""} disabled={disabled} />
      <TextInput name="notes" defaultValue={row?.notes ?? ""} disabled={disabled} placeholder="Notes" className="lg:col-span-7" />
    </form>
  );
}

function WeeklyAvailabilityGrid({
  rows,
  stylists,
}: {
  rows: StylistAvailabilityRow[];
  stylists: SalonStylistRow[];
}) {
  const activeRows = rows.filter((row) => row.active && !row.blackout_date);
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/60">
      <div className="grid min-w-[760px] grid-cols-[160px_repeat(7,minmax(92px,1fr))]">
        <div className="border-b border-slate-800 p-3 text-xs font-medium uppercase text-slate-500">
          Stylist
        </div>
        {WEEKDAYS.map((day) => (
          <div key={day} className="border-b border-l border-slate-800 p-3 text-xs font-medium uppercase text-slate-500">
            {day.slice(0, 3)}
          </div>
        ))}
        {stylists.map((stylist) => (
          <div key={stylist.stylist_id} className="contents">
            <div className="border-b border-slate-800 p-3 text-sm font-medium text-white">
              {stylist.stylist_name}
            </div>
            {WEEKDAYS.map((day) => {
              const slots = activeRows.filter(
                (row) =>
                  row.stylist_id === stylist.stylist_id &&
                  row.day_name.toLowerCase() === day.toLowerCase(),
              );
              return (
                <div key={day} className="min-h-16 border-b border-l border-slate-800 p-2">
                  {slots.length ? (
                    <div className="flex flex-col gap-1">
                      {slots.map((slot) => (
                        <span
                          key={slot.stylist_availability_id}
                          className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200"
                        >
                          {slot.open_time}-{slot.close_time}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-600">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
