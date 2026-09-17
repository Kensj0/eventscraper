'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import EventCard from './components/EventCard';
import EventFilters from './components/EventFilters';
import SearchBar from './components/SearchBar';
import { DALARNA_MUNICIPALITIES, isMunicipality, matchesMunicipality } from '@/lib/dalarna';
import type { Event } from '@/lib/types';

// Event som skrevs före timeKnown-fältet saknar det. De datum-bara bland dem
// ligger på exakt UTC-midnatt (se functions/src/event-time.ts), så de går att
// känna igen i efterhand — det sparar en bakåtfyllning av produktionsdatan.
// Nya event litar på det sparade fältet.
function resolveTimeKnown(data: { timeKnown?: boolean }, startTime: Date): boolean {
  if (typeof data.timeKnown === 'boolean') return data.timeKnown;
  return !(
    startTime.getUTCHours() === 0 &&
    startTime.getUTCMinutes() === 0 &&
    startTime.getUTCSeconds() === 0
  );
}

export default function Home() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'today' | 'weekend' | 'all'>('all');
  const [searchText, setSearchText] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    const eventsCollection = collection(db, 'events');
    const now = new Date();
    
    // Only fetch future events
    const q = query(
      eventsCollection,
      where('startTime', '>=', Timestamp.fromDate(now)),
      orderBy('startTime', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eventData: Event[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const startTime = data.startTime.toDate();
        eventData.push({
          id: doc.id,
          sourceUrl: data.sourceUrl,
          sourceName: data.sourceName,
          title: data.title,
          description: data.description,
          startTime,
          timeKnown: resolveTimeKnown(data, startTime),
          location: data.location,
          category: data.category,
          createdAt: data.createdAt.toDate(),
        });
      });
      setEvents(eventData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Plats + källnamn slås ihop till en sträng eftersom källan ofta bär orten när
  // platsen bara är ett lokalnamn ("Brittgården" / "Älvdalens församling").
  const placeHaystack = (event: Event) => `${event.location} ${event.sourceName}`;

  const matchesCity = (event: Event) => {
    if (!city.trim()) return true;
    if (isMunicipality(city)) return matchesMunicipality(placeHaystack(event), city);
    return placeHaystack(event).toLowerCase().includes(city.trim().toLowerCase());
  };

  const matchesSearch = (event: Event) => {
    if (!searchText) return true;
    const haystack = `${event.title} ${event.description}`.toLowerCase();
    return haystack.includes(searchText.toLowerCase());
  };

  const matchesCategory = (event: Event) =>
    !selectedCategory || event.category === selectedCategory;

  const matchesDateFilter = (event: Event, filter: 'today' | 'weekend' | 'all') => {
    if (filter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return event.startTime >= today && event.startTime < tomorrow;
    }

    if (filter === 'weekend') {
      const dayOfWeek = event.startTime.getDay();
      return dayOfWeek === 5 || dayOfWeek === 6; // Friday or Saturday
    }

    return true;
  };

  const matchesEverythingButCity = (event: Event) =>
    matchesCategory(event) && matchesSearch(event) && matchesDateFilter(event, dateFilter);

  // Räknas före ortsfiltret, annars hade den valda kommunen visat sitt eget antal
  // och alla andra noll.
  const eventsBeforeCity = events.filter(matchesEverythingButCity);
  const cityCounts = Object.fromEntries(
    DALARNA_MUNICIPALITIES.map((municipality) => [
      municipality,
      eventsBeforeCity.filter((event) => matchesMunicipality(placeHaystack(event), municipality))
        .length,
    ])
  );

  const filteredEvents = eventsBeforeCity.filter(matchesCity);

  const categories = Array.from(new Set(events.map((e) => e.category)));

  // Räknas givet övriga aktiva filter (samma princip som cityCounts ovan) —
  // annars visar t.ex. varje annan kategori "0" så fort en kategori är vald.
  const eventsForDateCounts = events.filter(
    (event) => matchesCategory(event) && matchesSearch(event)
  );
  const dateFilterCounts: Record<'today' | 'weekend' | 'all', number> = {
    today: eventsForDateCounts.filter((event) => matchesDateFilter(event, 'today')).length,
    weekend: eventsForDateCounts.filter((event) => matchesDateFilter(event, 'weekend')).length,
    all: eventsForDateCounts.length,
  };

  const eventsForCategoryCounts = events.filter(
    (event) => matchesSearch(event) && matchesDateFilter(event, dateFilter)
  );
  const categoryFilterCounts = Object.fromEntries(
    categories.map((category) => [
      category,
      eventsForCategoryCounts.filter((event) => event.category === category).length,
    ])
  );

  return (
    <main className="min-h-screen bg-[#FAF8F4]">
      <header className="sticky top-0 z-40 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">EventScraper</h1>
          <p className="mt-1 text-gray-600">Hitta lokala event från RSS-flöden</p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <SearchBar
          searchText={searchText}
          onSearchTextChange={setSearchText}
          city={city}
          onCityChange={setCity}
          cityCounts={cityCounts}
        />

        <EventFilters
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          dateFilterCounts={dateFilterCounts}
          categoryFilterCounts={categoryFilterCounts}
        />

        {loading ? (
          <div className="py-12 text-center">
            <p className="text-gray-500">Laddar event...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-500">Inga event att visa med de valda filtren.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
