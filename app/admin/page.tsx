'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import BannerEditor from './BannerEditor';
import ScrapingPanel from './ScrapingPanel';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Fel e-post eller lösenord.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAF8F4] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-bold text-gray-900">Logga in</h1>
        <p className="mt-1 text-sm text-gray-600">EventScraper-administration</p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm text-gray-700">E-post</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm text-gray-700">Lösenord</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-lg bg-[#B5312F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#933B36] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Loggar in…' : 'Logga in'}
        </button>
      </form>
    </main>
  );
}

function Dashboard({ user }: { user: User }) {
  return (
    <main className="min-h-screen bg-[#FAF8F4] pb-16">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-bold text-gray-900">EventScraper-administration</h1>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Logga ut
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <BannerEditor />
        <ScrapingPanel />
      </div>
    </main>
  );
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FAF8F4]">
        <p className="text-gray-500">Laddar…</p>
      </main>
    );
  }

  return user ? <Dashboard user={user} /> : <LoginForm />;
}
