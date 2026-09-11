import { Calendar, MapPin, ExternalLink } from 'lucide-react';
import type { Event } from '@/lib/types';

export default function EventCard({ event }: { event: Event }) {
  const formatDate = (date: Date) => {
    const days = ['SÖN', 'MÅN', 'TIS', 'ONS', 'TOR', 'FRE', 'LÖR'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAJ', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEC'];
    const day = days[date.getDay()];
    const date_num = date.getDate();
    const month = months[date.getMonth()];
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}, ${date_num} ${month} ${hours}:${minutes}`;
  };

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-md transition-shadow hover:shadow-lg">
      <div className="border-l-4 border-blue-500 p-4">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Calendar className="h-4 w-4" />
            {formatDate(event.startTime)}
          </div>
          <span className="inline-block rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
            {event.category}
          </span>
        </div>

        <h3 className="mb-2 text-lg font-bold text-gray-900">{event.title}</h3>

        <p className="mb-3 text-sm text-gray-600 line-clamp-2">{event.description}</p>

        <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="h-4 w-4" />
          <span className="truncate">{event.location}</span>
        </div>

        <div className="mb-3 text-xs text-gray-500">
          Källa: {event.sourceName}
        </div>

        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
        >
          Gå till eventet
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
