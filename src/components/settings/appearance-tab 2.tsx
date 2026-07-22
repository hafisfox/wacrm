'use client';

// ============================================================
// AppearanceTab
//
// The picker for the five colour themes defined in globals.css.
// `useTheme` and the THEMES catalog shipped a while back but had no
// UI attached, so the only way to change theme was editing
// localStorage by hand. This is that missing surface.
//
// The choice is per-browser (localStorage), not per-account — it is a
// display preference, not a team setting, and ThemeProvider already
// syncs it across tabs.
// ============================================================

import { Check } from 'lucide-react';

import { useTheme } from '@/hooks/use-theme';
import { THEMES, type ThemeId } from '@/lib/themes';
import { cn } from '@/lib/utils';

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="ops-surface p-4">
      <div className="mb-1">
        <h2 className="ops-section-title">Colour theme</h2>
        <p className="ops-help mt-1">
          Applies instantly and is remembered on this browser. Everyone on the
          team can pick their own.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Colour theme"
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {THEMES.map((entry) => (
          <ThemeCard
            key={entry.id}
            id={entry.id}
            name={entry.name}
            tagline={entry.tagline}
            swatch={entry.swatch}
            selected={theme === entry.id}
            onSelect={setTheme}
          />
        ))}
      </div>
    </section>
  );
}

function ThemeCard({
  id,
  name,
  tagline,
  swatch,
  selected,
  onSelect,
}: {
  id: ThemeId;
  name: string;
  tagline: string;
  swatch: string;
  selected: boolean;
  onSelect: (id: ThemeId) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(id)}
      className={cn(
        'ops-focus-ring group flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary-soft'
          : 'border-border bg-background/60 hover:border-primary/40 hover:bg-muted'
      )}
    >
      <span
        aria-hidden
        className="mt-0.5 size-8 shrink-0 rounded-lg ring-1 ring-black/20"
        style={{ background: swatch }}
      />
      <span className="min-w-0 flex-1">
        <span className="text-foreground flex items-center gap-1.5 text-sm font-medium">
          {name}
          {selected ? (
            <Check className="text-primary size-3.5" aria-hidden />
          ) : null}
        </span>
        <span className="text-muted-foreground mt-1 block text-xs leading-5">
          {tagline}
        </span>
      </span>
    </button>
  );
}
