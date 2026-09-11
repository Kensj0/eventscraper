'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import EventCard from './components/EventCard';
import EventFilters from './components/EventFilters';
import type { Event } from '@/lib/types';

export default function Home() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'today' | 'weekend' | 'all'>('all');

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
        eventData.push({
          id: doc.id,
          sourceUrl: data.sourceUrl,
          sourceName: data.sourceName,
          title: data.title,
          description: data.description,
          startTime: data.startTime.toDate(),
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

  const filteredEvents = events.filter((event) => {
    if (selectedCategory && event.category !== selectedCategory) {
      return false;
    }

    if (dateFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return event.startTime >= today && event.startTime < tomorrow;
    }

    if (dateFilter === 'weekend') {
      const eventDate = new Date(event.startTime);
      const dayOfWeek = eventDate.getDay();
      return dayOfWeek === 5 || dayOfWeek === 6; // Friday or Saturday
    }

    return true;
  });

  const categories = Array.from(new Set(events.map((e) => e.category)));

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">EventScraper</h1>
          <p className="mt-1 text-gray-600">Hitta lokala event från RSS-flöden</p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EventFilters
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
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
