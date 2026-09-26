'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SourceListItem } from '@/lib/types';

function SourceRow({ source }: { source: SourceListItem }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(source.name);
  const [url, setUrl] = useState(source.url);
  const [saving, setSaving] = useState(false);

  const toggleEnabled = () =>
    setDoc(doc(db, 'sources', source.id), { enabled: !source.enabled }, { merge: true });

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'sources', source.id), { name, url }, { merge: true });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Ta bort källan "${source.name}"? Den slutar bevakas direkt.`)) return;
    await deleteDoc(doc(db, 'sources', source.id));
  };

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2 pr-3">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          <div>
            <p className="font-medium text-gray-900">{source.name}</p>
            {source.submittedByEmail && (
              <p className="text-xs text-gray-500">Inskickad av: {source.submittedByEmail}</p>
            )}
          </div>
        )}
      </td>
      <td className="py-2 pr-3">
        {editing ? (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          <a href={source.url} target="_blank" rel="noreferrer" className="text-sm text-blue-700 hover:underline">
            {source.url}
          </a>
        )}
      </td>
      <td className="py-2 pr-3 text-sm text-gray-500">{source.method}</td>
      <td className="py-2 pr-3">
        <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={source.enabled}
            onChange={toggleEnabled}
            className="h-4 w-4 accent-[#B5312F]"
          />
          {source.enabled ? 'Aktiv' : 'Avaktiverad'}
        </label>
      </td>
      <td className="py-2 text-right">
        {editing ? (
          <div className="flex justify-end gap-2">
            <button onClick={save} disabled={saving} className="text-xs font-semibold text-[#B5312F] hover:underline">
              Spara
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:underline">
              Avbryt
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditing(true)} className="text-xs text-gray-600 hover:underline">
              Redigera
            </button>
            <button onClick={remove} className="text-xs text-red-600 hover:underline">
              Ta bort
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function SourceManager() {
  const [sources, setSources] = useState<SourceListItem[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'sources'), (snap) => {
      setSources(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? '',
            url: data.url ?? '',
            region: data.region ?? '',
            method: data.method ?? '',
            enabled: data.enabled !== false,
            submittedBy: data.submittedBy,
            submittedByEmail: data.submittedByEmail,
          } as SourceListItem;
        })
      );
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) => s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));
  }, [sources, search]);

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Källor</h2>
          <p className="mt-1 text-sm text-gray-600">{sources.length} källor totalt.</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök namn eller url…"
          className="w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="pb-2 pr-3 font-medium">Namn</th>
              <th className="pb-2 pr-3 font-medium">Url</th>
              <th className="pb-2 pr-3 font-medium">Metod</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <SourceRow key={s.id} source={s} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="py-6 text-center text-sm text-gray-500">Inga källor matchar sökningen.</p>}
      </div>
    </section>
  );
}
