'use client';

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import type { Event } from '@/lib/types';

// Datetime-local vill ha lokal tid utan tidszon ("2026-09-27T14:00"), inte
// event.startTime.toISOString() (som är UTC och skulle visa fel klockslag i
// fältet). Motsvarande tillbakakonvertering (new Date(value).toISOString())
// sker i handleSubmit och tolkas av <input> respektive JS alltid i
// webbläsarens egen tidszon — samma antagande (svensk tid) som resten av
// sajten redan gör, se event-time.ts.
function toLocalDatetimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EditEventModal({
  event,
  onClose,
  onSaved,
}: {
  event: Event;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: event.title,
    description: event.description,
    startTime: toLocalDatetimeInputValue(event.startTime),
    location: event.location,
    category: event.category,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await httpsCallable(functions, 'updateEvent')({
        eventId: event.id,
        title: form.title,
        description: form.description,
        startTime: new Date(form.startTime).toISOString(),
        location: form.location,
        category: form.category,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara ändringarna.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
      >
        <h3 className="font-bold text-gray-900">Redigera event</h3>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm text-gray-700">Titel</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
            />
          </div>
          <div>
            <label className="text-sm text-gray-700">Beskrivning</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
            />
          </div>
          <div>
            <label className="text-sm text-gray-700">Datum &amp; tid</label>
            <input
              required
              type="datetime-local"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
            />
          </div>
          <div>
            <label className="text-sm text-gray-700">Plats</label>
            <input
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
            />
          </div>
          <div>
            <label className="text-sm text-gray-700">Kategori</label>
            <input
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            Avbryt
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#B5312F] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#933B36] disabled:opacity-50"
          >
            {submitting ? 'Sparar…' : 'Spara'}
          </button>
        </div>
      </form>
    </div>
  );
}
