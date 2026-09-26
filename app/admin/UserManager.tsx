'use client';

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface AdminUser {
  uid: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

export default function UserManager() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [cascade, setCascade] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const runSearch = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await httpsCallable<{ searchEmail?: string }, { users: AdminUser[] }>(functions, 'listUsers')({
        searchEmail: search,
      });
      setUsers(result.data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sökningen misslyckades.');
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError('');
    try {
      await httpsCallable(functions, 'deleteUser')({ uid: pendingDelete.uid, cascadeDelete: cascade });
      setUsers((prev) => prev?.filter((u) => u.uid !== pendingDelete.uid) ?? null);
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ta bort användaren.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">Användare</h2>
      <p className="mt-1 text-sm text-gray-600">Sök på e-post för att hantera registrerade konton.</p>

      <div className="mt-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          placeholder="Sök e-post…"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
        />
        <button
          onClick={runSearch}
          disabled={loading}
          className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? 'Söker…' : 'Sök'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {users && (
        <div className="mt-4 space-y-2">
          {users.map((u) => (
            <div key={u.uid} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {u.email} {u.isAdmin && <span className="ml-1 text-xs text-gray-500">(admin)</span>}
                </p>
                <p className="text-xs text-gray-500">Registrerad {new Date(u.createdAt).toLocaleDateString('sv-SE')}</p>
              </div>
              {!u.isAdmin && (
                <button onClick={() => { setPendingDelete(u); setCascade(true); }} className="text-xs font-semibold text-red-600 hover:underline">
                  Ta bort
                </button>
              )}
            </div>
          ))}
          {users.length === 0 && <p className="text-sm text-gray-500">Inga träffar.</p>}
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h3 className="font-bold text-gray-900">Ta bort {pendingDelete.email}?</h3>
            <p className="mt-2 text-sm text-gray-600">Kontot raderas permanent.</p>
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} className="h-4 w-4 accent-[#B5312F]" />
              Ta bort personens inskickade event och eventlänkar också
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setPendingDelete(null)} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
                Avbryt
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Tar bort…' : 'Ta bort konto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
