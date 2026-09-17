'use client';

import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import type { IngestionLog, IngestionType, SchedulingConfig } from '@/lib/types';

const schedulingRef = doc(db, 'config', 'scheduling');

interface SourceTypeDef {
  key: keyof SchedulingConfig;
  logType: IngestionType;
  title: string;
  description: string;
  callableName: string;
}

const SOURCE_TYPES: SourceTypeDef[] = [
  {
    key: 'rssEnabled',
    logType: 'rss',
    title: 'RSS-flöden',
    description: 'Dagligen 02:00',
    callableName: 'triggerRSSIngestion',
  },
  {
    key: 'htmlEnabled',
    logType: 'html',
    title: 'HTML-källor',
    description: 'Dagligen 04:00',
    callableName: 'triggerHTMLIngestion',
  },
  {
    key: 'svenskaKyrkanEnabled',
    logType: 'svenska-kyrkan-calendar',
    title: 'Svenska kyrkan',
    description: 'Dagligen 03:00',
    callableName: 'triggerSvenskaKyrkanIngestion',
  },
];

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just nu';
  if (minutes < 60) return `${minutes} min sedan`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h sedan`;
  const days = Math.round(hours / 24);
  return `${days} d sedan`;
}

function SourceCard({ def }: { def: SourceTypeDef }) {
  const [enabled, setEnabled] = useState(true);
  const [lastLog, setLastLog] = useState<IngestionLog | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    return onSnapshot(schedulingRef, (snap) => {
      const value = snap.data()?.[def.key];
      setEnabled(value !== false);
    });
  }, [def.key]);

  useEffect(() => {
    const q = query(
      collection(db, 'ingestion_logs'),
      where('type', '==', def.logType),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
    return onSnapshot(q, (snap) => {
      const docSnap = snap.docs[0];
      if (!docSnap) {
        setLastLog(null);
        return;
      }
      const data = docSnap.data();
      setLastLog({
        id: docSnap.id,
        type: data.type,
        trigger: data.trigger,
        processed: data.processed,
        skipped: data.skipped,
        errors: data.errors ?? [],
        sourcesFailed: data.sourcesFailed ?? [],
        duration_ms: data.duration_ms,
        timestamp: data.timestamp?.toDate?.() ?? new Date(),
      });
    });
  }, [def.logType]);

  const toggleEnabled = async (next: boolean) => {
    setEnabled(next);
    await setDoc(schedulingRef, { [def.key]: next }, { merge: true });
  };

  const runNow = async () => {
    setRunning(true);
    setResult('');
    setError('');
    try {
      const call = httpsCallable(functions, def.callableName);
      const response = await call();
      const data = response.data as { processed?: number; skipped?: number };
      setResult(`Klart: ${data.processed ?? 0} sparade, ${data.skipped ?? 0} hoppade över.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Körningen misslyckades.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">{def.title}</h3>
          <p className="text-xs text-gray-500">{def.description}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-gray-600">
          <span>{enabled ? 'Aktiv' : 'Pausad'}</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => toggleEnabled(e.target.checked)}
            className="h-4 w-4 accent-[#B5312F]"
          />
        </label>
      </div>

      <div className="mt-3 text-sm text-gray-600">
        {lastLog ? (
          <>
            <p>
              Senast körd {formatRelativeTime(lastLog.timestamp)} ({lastLog.trigger === 'manual' ? 'manuellt' : 'schemalagt'})
            </p>
            <p className="tabular-nums">
              {lastLog.processed} sparade · {lastLog.skipped} hoppade över
              {lastLog.sourcesFailed.length > 0 && ` · ${lastLog.sourcesFailed.length} källor misslyckades`}
            </p>
          </>
        ) : (
          <p>Ingen körning loggad ännu.</p>
        )}
      </div>

      <button
        type="button"
        onClick={runNow}
        disabled={running}
        className="mt-4 rounded-lg bg-[#B5312F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#933B36] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? 'Kör…' : 'Kör nu'}
      </button>

      {result && <p className="mt-2 text-sm text-green-700">{result}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function ScrapingPanel() {
  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">Scraping</h2>
      <p className="mt-1 text-sm text-gray-600">
        Kör en källtyp manuellt, eller pausa dess dagliga automatkörning.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {SOURCE_TYPES.map((def) => (
          <SourceCard key={def.key} def={def} />
        ))}
      </div>
    </section>
  );
}
