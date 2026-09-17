'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Search, MapPin, X } from 'lucide-react';
import { DALARNA_MUNICIPALITIES } from '@/lib/dalarna';

export default function SearchBar({
  searchText,
  onSearchTextChange,
  city,
  onCityChange,
  cityCounts,
}: {
  searchText: string;
  onSearchTextChange: (value: string) => void;
  city: string;
  onCityChange: (value: string) => void;
  /** Antal träffar per kommun givet övriga aktiva filter — se page.tsx. */
  cityCounts: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const cityFieldRef = useRef<HTMLDivElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // Kommunerna filtreras medan man skriver, men fältet accepterar vad som helst:
  // ~40 % av eventen saknar kommunnamn i platsen, så fritext ("Kaplansgården")
  // måste fortsätta fungera vid sidan av kommunvalet.
  const query = city.trim().toLowerCase();
  const options = DALARNA_MUNICIPALITIES.filter(
    (m) => !query || m.toLowerCase().includes(query)
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!cityFieldRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const choose = (municipality: string) => {
    onCityChange(municipality);
    setOpen(false);
    setHighlighted(-1);
  };

  const onCityKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlighted(0);
      } else {
        setHighlighted((i) => (i + 1) % Math.max(options.length, 1));
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (event.key === 'Enter' && open && highlighted >= 0 && options[highlighted]) {
      event.preventDefault();
      choose(options[highlighted]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setHighlighted(-1);
    }
  };

  return (
    <form
      role="search"
      onSubmit={(event) => {
        // Filtreringen sker redan medan man skriver. Knappen finns för att stänga
        // ner tangentbordet på mobil och bekräfta sökningen — inte för att utlösa den.
        event.preventDefault();
        setOpen(false);
        cityInputRef.current?.blur();
      }}
      className="mb-6 flex flex-col overflow-visible rounded-2xl border border-gray-200 bg-white shadow-sm sm:flex-row sm:items-center sm:rounded-full"
    >
      <div className="flex flex-1 items-center gap-3 px-5 py-3">
        <Search className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
        <input
          type="text"
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
          placeholder="Sök evenemang"
          aria-label="Sök evenemang"
          className="w-full min-w-0 bg-transparent text-base text-gray-900 placeholder:text-gray-500 focus:outline-none sm:text-sm"
        />
        {searchText && (
          <button
            type="button"
            onClick={() => onSearchTextChange('')}
            aria-label="Rensa sökord"
            className="shrink-0 rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="hidden h-8 w-px bg-gray-200 sm:block" />
      <div className="h-px bg-gray-200 sm:hidden" />

      <div ref={cityFieldRef} className="relative flex flex-1 items-center gap-3 px-5 py-3">
        <MapPin className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
        <input
          ref={cityInputRef}
          type="text"
          value={city}
          onChange={(e) => {
            onCityChange(e.target.value);
            setOpen(true);
            setHighlighted(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onCityKeyDown}
          placeholder="Alla orter"
          aria-label="Ort"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && highlighted >= 0 ? `${listboxId}-option-${highlighted}` : undefined
          }
          autoComplete="off"
          className="w-full min-w-0 bg-transparent text-base text-gray-900 placeholder:text-gray-500 focus:outline-none sm:text-sm"
        />
        {city && (
          <button
            type="button"
            onClick={() => {
              onCityChange('');
              cityInputRef.current?.focus();
            }}
            aria-label="Rensa ort"
            className="shrink-0 rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {open && options.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Kommuner i Dalarna"
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          >
            {options.map((municipality, index) => {
              const count = cityCounts[municipality] ?? 0;
              return (
                <li
                  key={municipality}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={city === municipality}
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(municipality)}
                  className={`flex cursor-pointer items-center justify-between px-4 py-2 text-sm ${
                    highlighted === index ? 'bg-[#FDF1F0]' : ''
                  } ${count === 0 ? 'text-gray-400' : 'text-gray-900'}`}
                >
                  <span>{municipality}</span>
                  <span className="text-xs tabular-nums text-gray-500">{count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-center p-2">
        <button
          type="submit"
          aria-label="Sök"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#B5312F] text-white transition-colors hover:bg-[#933B36] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B5312F] focus-visible:ring-offset-2"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
