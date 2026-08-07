import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LegalSection = {
  title: string;
  body: string[];
};

type LegalShellProps = {
  title: string;
  eyebrow: string;
  summary: string;
  sections: LegalSection[];
  relatedHref: string;
  relatedLabel: string;
};

export const LEGAL_LAST_UPDATED = 'July 17, 2026';
export const SALU_CONTACT_EMAIL = 'salutechn8n@gmail.com';
export const SALU_ADDRESS = 'Salu Salon, MG Road, Kochi, Kerala, India';

export function LegalShell({
  title,
  eyebrow,
  summary,
  sections,
  relatedHref,
  relatedLabel,
}: LegalShellProps) {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-5 py-8 sm:px-8 sm:py-12">
        <header className="border-border flex flex-col gap-6 border-b pb-8">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                '-ml-2'
              )}
            >
              <ArrowLeft className="size-4" />
              Salu Salon
            </Link>
            <Badge variant="outline">Last updated: {LEGAL_LAST_UPDATED}</Badge>
          </div>

          <div className="flex max-w-3xl flex-col gap-3">
            <p className="text-primary text-sm font-medium tracking-normal">
              {eyebrow}
            </p>
            <h1 className="text-foreground text-3xl font-semibold tracking-normal sm:text-4xl">
              {title}
            </h1>
            <p className="text-muted-foreground text-base leading-7">
              {summary}
            </p>
          </div>
        </header>

        <div className="grid gap-8">
          {sections.map((section) => (
            <section key={section.title} className="grid gap-3">
              <h2 className="text-xl font-semibold tracking-normal">
                {section.title}
              </h2>
              <div className="text-muted-foreground grid gap-3 text-sm leading-7 sm:text-base">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="border-border text-muted-foreground flex flex-col gap-4 border-t pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            Questions:{' '}
            <a
              className="text-primary hover:underline"
              href={`mailto:${SALU_CONTACT_EMAIL}`}
            >
              {SALU_CONTACT_EMAIL}
            </a>
          </p>
          <Link
            href={relatedHref}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {relatedLabel}
          </Link>
        </footer>
      </div>
    </main>
  );
}
