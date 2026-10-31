import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Section title with the green marker bar, optional small note, and room on the right for tabs or links. */
export function SectionHeader({
  title,
  note,
  icon,
  children,
}: {
  title: string;
  note?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon}
        <h2 className="truncate font-display text-lg font-bold tracking-tight text-white sm:text-xl">{title}</h2>
        {note ? <span className="hidden text-xs text-zinc-500 sm:inline">{note}</span> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** Small segmented switch (All / Sub / Dub style). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-md border border-[#2a2b2a] bg-[#151615] p-0.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`cursor-pointer rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === t.id ? 'bg-[#3fcf8e] text-[#04120d]' : 'text-zinc-400 hover:text-white'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** A horizontally scrolling poster row with its own title and previous / next buttons. */
export function PosterRow({
  title,
  note,
  icon,
  children,
}: {
  title: string;
  note?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
  };
  return (
    <section className="min-w-0">
      <SectionHeader title={title} note={note} icon={icon}>
        <button
          type="button"
          onClick={() => scroll(-1)}
          aria-label={`Scroll ${title} back`}
          className="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[#2a2b2a] sm:flex bg-[#151615] text-zinc-300 transition-colors hover:border-[#3a3b3a] hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => scroll(1)}
          aria-label={`Scroll ${title} forward`}
          className="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[#2a2b2a] sm:flex bg-[#151615] text-zinc-300 transition-colors hover:border-[#3a3b3a] hover:text-white"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </SectionHeader>
      <div
        ref={ref}
        className="flex items-start gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth pb-1 scrollbar-none snap-x snap-proximity sm:gap-4"
      >
        {children}
      </div>
    </section>
  );
}

/** Width classes shared by every card inside a PosterRow. */
export const ROW_CARD = 'w-[132px] sm:w-[160px] lg:w-[176px] shrink-0 snap-start';
