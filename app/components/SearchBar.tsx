'use client';

import { Search, MapPin } from 'lucide-react';

export default function SearchBar({
  searchText,
  onSearchTextChange,
  city,
  onCityChange,
}: {
  searchText: string;
  onSearchTextChange: (value: string) => void;
  city: string;
  onCityChange: (value: string) => void;
}) {
  return (
    <div className="mb-6 flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm sm:flex-row sm:rounded-full">
      <div className="flex flex-1 items-center gap-3 px-5 py-3">
        <Search className="h-5 w-5 shrink-0 text-gray-400" />
        <input
          type="text"
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
          placeholder="Sök event"
          className="w-full min-w-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
      </div>

      <div className="hidden w-px bg-gray-200 sm:block" />
      <div className="h-px bg-gray-200 sm:hidden" />

      <div className="flex flex-1 items-center gap-3 px-5 py-3">
        <MapPin className="h-5 w-5 shrink-0 text-gray-400" />
        <input
          type="text"
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          placeholder="Ort"
          className="w-full min-w-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-center p-2 sm:pr-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-500 text-white">
          <Search className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
