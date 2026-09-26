'use client';

import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import type { EventLinkSubmission } from '@/lib/types';

export default function EventLinkQueue() {
  const [links, setLinks] = useState<EventLinkSubmission[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'candidate-sources'), where('type', '==', 'anvandarinskickad'));
    return onSnapshot(q, (snap) => {
      setLinks(
        snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name,
              url: data.url,
              region: data.region,
              submittedBy: data.submittedBy,
              submittedByEmail: data.submittedByEmail,
              status: data.status,
              verifiedMethod: data.verifiedMethod,
              feedUrl: data.feedUrl,
              createdAt: data.createdAt?.toDate?.() ?? new Date(),
            } as EventLinkSubmission;
          })
          .filter((l) => l.status !== 'verified')
      );
    });
  }, []);

  const test = async (id: string) => {
    setError('');
    setBusyId(id);
    try {
      await httpsCallable(functions, 'testEventLink')({ candidateId: id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Testet misslyckades.');
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (link: EventLinkSubmission) => {
    setError('');
    setBusyId(link.id);
    try {
      await setDoc(
        doc(db, 'sources', link.id),
        {
          name: link.name,
          url: link.feedUrl || link.url,
          region: link.region,
          method: link.verifiedMethod,
          enabled: true,
          submittedBy: link.submittedBy,
          submittedByEmail: link.submittedByEmail,
        },
        { merge: true }
      );
      await setDoc(doc(db, 'candidate-sources', link.id), { status: 'verified' }, { merge: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Godkännandet misslyckades.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    if (!confirm('Avvisa den här eventlänken? Den tas bort permanent.')) return;
    await deleteDoc(doc(db, 'candidate-sources', id));
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">Inskickade eventlänkar</h2>
      <p className="mt-1 text-sm text-gray-600">
        Besökares hemsidor, väntar på test och godkännande innan de blir löpande skrapade källor.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-3">
        {links.map((l) => (
          <div key={l.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{l.name || l.url}</p>
                <a href={l.url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline">
                  {l.url}
                </a>
                <p className="mt-1 text-xs text-gray-500">Inskickad av: {l.submittedByEmail}</p>
              </div>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {l.status === 'new' && 'Ej testad'}
                {l.status === 'ready-to-ingest' && `Redo (${l.verifiedMethod})`}
                {l.status === 'failed' && 'Ingen feed hittad'}
              </span>
            </div>
            <div className="mt-3 flex gap-3">
              {l.status !== 'ready-to-ingest' && (
                <button
                  onClick={() => test(l.id)}
                  disabled={busyId === l.id}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  Testa
                </button>
              )}
              {l.status === 'ready-to-ingest' && (
                <button
                  onClick={() => approve(l)}
                  disabled={busyId === l.id}
                  className="rounded-lg bg-[#B5312F] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#933B36] disabled:opacity-50"
                >
                  Godkänn
                </button>
              )}
              <button
                onClick={() => reject(l.id)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                Avvisa
              </button>
            </div>
          </div>
        ))}
        {links.length === 0 && <p className="text-sm text-gray-500">Inga eventlänkar väntar just nu.</p>}
      </div>
    </section>
  );
}
