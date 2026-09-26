'use client';

import { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { addDoc, collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/lib/firebase';

function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(
        mode === 'login' ? 'Fel e-post eller lösenord.' : 'Kunde inte skapa kontot (e-posten kanske redan finns).'
      );
      void err;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAF8F4] px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">{mode === 'login' ? 'Logga in' : 'Skapa konto'}</h1>
        <p className="mt-1 text-sm text-gray-600">för att lägga till event på EventScraper</p>

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
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
          {submitting ? 'Ett ögonblick…' : mode === 'login' ? 'Logga in' : 'Skapa konto'}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="mt-3 w-full text-center text-sm text-gray-600 hover:underline"
        >
          {mode === 'login' ? 'Inget konto än? Skapa ett' : 'Har du redan ett konto? Logga in'}
        </button>
      </form>
    </main>
  );
}

const EMPTY_EVENT = { title: '', description: '', startTime: '', location: '', category: '', sourceUrl: '' };

function EventForm({ user }: { user: User }) {
  const [form, setForm] = useState(EMPTY_EVENT);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'event-submissions'), {
        title: form.title,
        description: form.description,
        startTime: Timestamp.fromDate(new Date(form.startTime)),
        location: form.location,
        category: form.category || 'Övrigt',
        sourceUrl: form.sourceUrl,
        submittedBy: user.uid,
        submittedByEmail: user.email ?? '',
        status: 'pending',
        createdAt: Timestamp.now(),
      });
      setForm(EMPTY_EVENT);
      setDone(true);
    } catch (err) {
      setError('Kunde inte skicka in eventet. Försök igen.');
      void err;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          required
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      <div>
        <label className="text-sm text-gray-700">Länk till eventet</label>
        <input
          required
          type="url"
          placeholder="https://…"
          value={form.sourceUrl}
          onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-green-700">Tack! Ditt event granskas nu och dyker upp på sajten när det är godkänt.</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-[#B5312F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#933B36] disabled:opacity-50"
      >
        {submitting ? 'Skickar…' : 'Skicka in event'}
      </button>
    </form>
  );
}

function EventLinkForm({ user }: { user: User }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'candidate-sources'), {
        name: name || url,
        url,
        region: 'Dalarna',
        type: 'anvandarinskickad',
        source: 'user-submission',
        submittedBy: user.uid,
        submittedByEmail: user.email ?? '',
        status: 'new',
        createdAt: Timestamp.now(),
      });
      setUrl('');
      setName('');
      setDone(true);
    } catch (err) {
      setError('Kunde inte skicka in länken. Försök igen.');
      void err;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm text-gray-700">Din organisations namn</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
        />
      </div>
      <div>
        <label className="text-sm text-gray-700">Länk till er eventsida</label>
        <input
          required
          type="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B5312F] focus:outline-none focus:ring-1 focus:ring-[#B5312F]"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && (
        <p className="text-sm text-green-700">
          Tack! Vi granskar länken och börjar hämta era event automatiskt så fort den är godkänd.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-[#B5312F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#933B36] disabled:opacity-50"
      >
        {submitting ? 'Skickar…' : 'Skicka in länk'}
      </button>
    </form>
  );
}

function DeleteAccount({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<{ events: number; links: number } | null>(null);
  const [cascade, setCascade] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const openDialog = async () => {
    setError('');
    const [events, links] = await Promise.all([
      getDocs(query(collection(db, 'event-submissions'), where('submittedBy', '==', user.uid))),
      getDocs(query(collection(db, 'candidate-sources'), where('submittedBy', '==', user.uid))),
    ]);
    setCounts({ events: events.size, links: links.size });
    setOpen(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await httpsCallable(functions, 'deleteMyAccount')({ cascadeDelete: cascade });
      // Admin SDK-raderingen ogiltigförklarar inte den redan cachade
      // klient-sessionen omedelbart — signOut() rensar den lokalt direkt så
      // sidan genast visar AuthForm igen istället för att vänta på nästa
      // token-refresh.
      await signOut(auth);
    } catch (err) {
      setError('Kunde inte ta bort kontot. Försök igen.');
      void err;
      setDeleting(false);
    }
  };

  return (
    <div className="mt-8 border-t border-gray-200 pt-6">
      <button onClick={openDialog} className="text-sm text-red-600 hover:underline">
        Radera mitt konto
      </button>

      {open && counts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h3 className="font-bold text-gray-900">Radera ditt konto?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Du har {counts.events} inskickade event och {counts.links} inskickade eventlänkar.
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} className="h-4 w-4 accent-[#B5312F]" />
              Ta bort dessa också
            </label>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
                Avbryt
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Tar bort…' : 'Radera konto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubmitPage({ user }: { user: User }) {
  const [tab, setTab] = useState<'event' | 'link'>('event');

  return (
    <main className="min-h-screen bg-[#FAF8F4] pb-16">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Lägg till event</h1>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Logga ut
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex gap-2 border-b border-gray-200 pb-4">
            <button
              onClick={() => setTab('event')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'event' ? 'bg-[#B5312F] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Ett event
            </button>
            <button
              onClick={() => setTab('link')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'link' ? 'bg-[#B5312F] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Min hemsidas eventsida
            </button>
          </div>

          <div className="mt-6">
            {tab === 'event' ? <EventForm user={user} /> : <EventLinkForm user={user} />}
          </div>
        </div>

        <DeleteAccount user={user} />
      </div>
    </main>
  );
}

export default function LaggTillEventPage() {
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

  return user ? <SubmitPage user={user} /> : <AuthForm />;
}
