'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import type { EventSubmission } from '@/lib/types';

export default function SubmissionQueue() {
  const [submissions, setSubmissions] = useState<EventSubmission[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'event-submissions'), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => {
      setSubmissions(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title,
            description: data.description,
            startTime: data.startTime?.toDate?.() ?? new Date(),
            location: data.location,
            category: data.category,
            sourceUrl: data.sourceUrl,
            submittedBy: data.submittedBy,
            submittedByEmail: data.submittedByEmail,
            status: data.status,
            createdAt: data.createdAt?.toDate?.() ?? new Date(),
          } as EventSubmission;
        })
      );
    });
  }, []);

  const act = async (id: string, kind: 'approve' | 'reject') => {
    setError('');
    setBusyId(id);
    try {
      const call = httpsCallable(functions, kind === 'approve' ? 'approveEventSubmission' : 'rejectEventSubmission');
      await call({ submissionId: id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Något gick fel.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">Inskickade event</h2>
      <p className="mt-1 text-sm text-gray-600">
        {submissions.length} väntar på granskning.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-3">
        {submissions.map((s) => (
          <div key={s.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{s.title}</p>
                <p className="text-xs text-gray-500">
                  {s.startTime.toLocaleString('sv-SE')} · {s.location}
                </p>
                <p className="text-xs text-gray-500">Inskickad av: {s.submittedByEmail}</p>
              </div>
              <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-blue-700 hover:underline">
                Länk ↗
              </a>
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-gray-700">{s.description}</p>
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => act(s.id, 'approve')}
                disabled={busyId === s.id}
                className="rounded-lg bg-[#B5312F] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#933B36] disabled:opacity-50"
              >
                Godkänn
              </button>
              <button
                onClick={() => act(s.id, 'reject')}
                disabled={busyId === s.id}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Avvisa
              </button>
            </div>
          </div>
        ))}
        {submissions.length === 0 && <p className="text-sm text-gray-500">Inget väntar just nu.</p>}
      </div>
    </section>
  );
}
