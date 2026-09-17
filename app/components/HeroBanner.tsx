import type { ReactNode } from 'react';

// Delad mellan den publika headern (page.tsx) och adminpanelens
// förhandsvisning (admin/page.tsx) — så att "det du ser är det besökaren
// får" garanterat stämmer, istället för två separata implementationer som
// kan glida isär.
export default function HeroBanner({
  imageUrl,
  x,
  y,
  scrim,
  className = '',
  rightSlot,
}: {
  imageUrl: string | null;
  x: number;
  y: number;
  scrim: number;
  className?: string;
  /** Renderas till höger om titeln, t.ex. sökfältet — dolt under sm eftersom
   * bannerns höjd inte ger plats åt det på mobil (se page.tsx). */
  rightSlot?: ReactNode;
}) {
  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      {imageUrl ? (
        <>
          <div
            className="absolute inset-0 bg-cover"
            style={{ backgroundImage: `url('${imageUrl}')`, backgroundPosition: `${x}% ${y}%` }}
            aria-hidden="true"
          />
          {scrim > 0 && (
            <div
              className="absolute inset-0"
              style={{ backgroundColor: `rgba(0,0,0,${(scrim / 100).toFixed(2)})` }}
              aria-hidden="true"
            />
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-[#B5312F]" aria-hidden="true" />
      )}
      <div className="relative mx-auto flex h-full max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-3xl font-bold text-white drop-shadow-sm sm:text-4xl">EventScraper</h1>
          <p className="mt-2 text-white/90 drop-shadow-sm">Hitta lokala event från RSS-flöden</p>
        </div>
        {rightSlot && <div className="hidden w-full max-w-md shrink-0 sm:block">{rightSlot}</div>}
      </div>
    </div>
  );
}
