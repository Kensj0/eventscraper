import { Calendar, MapPin } from 'lucide-react';
import type { Event } from '@/lib/types';

export default function EventCard({ event }: { event: Event }) {
  const formatDate = (date: Date, timeKnown: boolean) => {
    const days = ['SÖN', 'MÅN', 'TIS', 'ONS', 'TOR', 'FRE', 'LÖR'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAJ', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEC'];
    const day = days[date.getDay()];
    const date_num = date.getDate();
    const month = months[date.getMonth()];

    // Listan sträcker sig över årsskiften (det finns event i 2027), och utan
    // årtal går "1 FEB" inte att skilja från nästa vecka. Innevarande år är
    // underförstått och skulle bara vara brus på varje kort.
    const year = date.getFullYear() !== new Date().getFullYear() ? ` ${date.getFullYear()}` : '';

    // Källan angav bara ett datum — visa inte den påhittade midnattstiden.
    if (!timeKnown) return `${day}, ${date_num} ${month}${year} · Tid ej angiven`;

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}, ${date_num} ${month}${year} ${hours}:${minutes}`;
  };

  return (
    <a
      href={event.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-md transition-shadow hover:shadow-lg"
    >
      <div className="border-l-4 border-[#B5312F] p-4 flex flex-col h-full">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Calendar className="h-4 w-4" />
            {formatDate(event.startTime, event.timeKnown)}
          </div>
          <span className="inline-block rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-[#B5312F]">
            {event.category}
          </span>
        </div>

        <h3 className="mb-2 text-lg font-bold text-gray-900 group-hover:text-[#B5312F] transition-colors">{event.title}</h3>

        <p className="mb-3 text-sm text-gray-600 line-clamp-2">{event.description}</p>

        <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="h-4 w-4" />
          <span className="truncate">{event.location}</span>
        </div>

        <div className="mt-auto text-xs text-gray-500">
          Källa: {event.sourceName}
        </div>
      </div>
    </a>
  );
}
