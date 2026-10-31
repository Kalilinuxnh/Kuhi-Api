import React from 'react';

/** Basic shimmering placeholder block. Size and shape come from className. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-md ${className}`} />;
}

/** Placeholder grid of poster cards (matches the search / catalog grid). */
export function PosterGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading results"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 min-[1700px]:grid-cols-8 gap-x-3 sm:gap-x-4 gap-y-6"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col">
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          <Skeleton className="h-3 w-4/5 mt-3" />
          <Skeleton className="h-2.5 w-1/2 mt-2" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder cards for a horizontal poster row. */
export function PosterRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-[132px] sm:w-[160px] lg:w-[176px] shrink-0 flex flex-col">
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          <Skeleton className="h-3 w-4/5 mt-3" />
        </div>
      ))}
    </>
  );
}

/** Rows used inside the live search popup. */
export function SearchRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div role="status" aria-label="Searching" className="p-1.5 space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2.5">
          <Skeleton className="w-11 h-16 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Full-page placeholder shown while a title or the player is being prepared. */
export function PageSkeleton({ variant = 'detail' }: { variant?: 'detail' | 'player' }) {
  return (
    <div role="status" aria-label="Loading" className="flex-1 min-h-screen bg-[#0c0d0c] text-zinc-100 flex flex-col">
      {/* top bar */}
      <div className="px-4 sm:px-8 py-3.5 flex items-center gap-3 border-b border-white/5">
        <Skeleton className="w-9 h-9 rounded-xl" />
        <Skeleton className="h-3.5 w-40" />
      </div>

      {variant === 'player' ? (
        <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
          <Skeleton className="w-full aspect-video rounded-2xl" />
          <div className="rounded-2xl border border-white/5 p-4 space-y-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-9 w-32 rounded-xl" />
              <Skeleton className="h-9 w-40 rounded-xl" />
            </div>
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full shrink-0" />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ) : (
        <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 items-start">
            <div className="md:col-span-4 flex justify-center">
              <Skeleton className="w-full max-w-[260px] aspect-[3/4.4] rounded-3xl" />
            </div>
            <div className="md:col-span-8 space-y-5">
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
              <Skeleton className="h-12 w-44 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
