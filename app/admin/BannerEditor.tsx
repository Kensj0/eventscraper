'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { processBannerImage } from '@/lib/image-utils';
import { DEFAULT_SITE_CONFIG } from '@/lib/types';
import type { SiteConfig } from '@/lib/types';
import HeroBanner from '../components/HeroBanner';

const siteConfigRef = doc(db, 'config', 'site');

export default function BannerEditor() {
  const [remote, setRemote] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [hydrated, setHydrated] = useState(false);
  // Reglagen redigeras lokalt och sparas separat (knappen nedan) — annars
  // skulle draget i sliden hoppa runt varje gång Firestore ekar tillbaka
  // vår egen skrivning. Bilden sparas däremot direkt vid uppladdning (se
  // samma mönster i lokala-tjänster-adminpanelen).
  const [draftX, setDraftX] = useState(DEFAULT_SITE_CONFIG.bannerX);
  const [draftY, setDraftY] = useState(DEFAULT_SITE_CONFIG.bannerY);
  const [draftScrim, setDraftScrim] = useState(DEFAULT_SITE_CONFIG.bannerScrim);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return onSnapshot(siteConfigRef, (snap) => {
      const data = snap.data();
      const next: SiteConfig = {
        bannerImage: data?.bannerImage ?? null,
        bannerX: data?.bannerX ?? DEFAULT_SITE_CONFIG.bannerX,
        bannerY: data?.bannerY ?? DEFAULT_SITE_CONFIG.bannerY,
        bannerScrim: data?.bannerScrim ?? DEFAULT_SITE_CONFIG.bannerScrim,
      };
      setRemote(next);
      if (!hydrated) {
        setDraftX(next.bannerX);
        setDraftY(next.bannerY);
        setDraftScrim(next.bannerScrim);
        setHydrated(true);
      }
    });
    // hydrated läses men ska inte trigga en ny prenumeration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const dataUrl = await processBannerImage(file);
      await setDoc(siteConfigRef, { bannerImage: dataUrl }, { merge: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bilden kunde inte laddas upp.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Ta bort bannerbilden? Sidhuvudet visar då bara en enfärgad bakgrund.')) return;
    setError('');
    try {
      await setDoc(siteConfigRef, { bannerImage: null }, { merge: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bilden kunde inte tas bort.');
    }
  };

  const handleSavePlacement = async () => {
    setError('');
    setSaving(true);
    try {
      await setDoc(
        siteConfigRef,
        { bannerX: draftX, bannerY: draftY, bannerScrim: draftScrim },
        { merge: true }
      );
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Placeringen kunde inte sparas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">Banner</h2>
      <p className="mt-1 text-sm text-gray-600">
        Bilden visas överst på startsidan. Ladda upp en ny, eller finjustera hur den
        aktuella bilden beskärs och hur mörk overlayen är.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
        <HeroBanner
          imageUrl={remote.bannerImage}
          x={draftX}
          y={draftY}
          scrim={draftScrim}
          className="h-48"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#B5312F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#933B36]">
          {uploading ? 'Laddar upp…' : 'Ladda upp bild'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = '';
            }}
          />
        </label>
        {remote.bannerImage && (
          <button
            type="button"
            onClick={handleRemove}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Ta bort bild
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="banner-x" className="flex justify-between text-sm text-gray-700">
            <span>Läge, sidled</span>
            <span className="tabular-nums text-gray-500">{draftX}%</span>
          </label>
          <input
            id="banner-x"
            type="range"
            min={0}
            max={100}
            value={draftX}
            onChange={(e) => {
              setDraftX(Number(e.target.value));
              setDirty(true);
            }}
            className="mt-1 w-full"
          />
        </div>
        <div>
          <label htmlFor="banner-y" className="flex justify-between text-sm text-gray-700">
            <span>Läge, höjd</span>
            <span className="tabular-nums text-gray-500">{draftY}%</span>
          </label>
          <input
            id="banner-y"
            type="range"
            min={0}
            max={100}
            value={draftY}
            onChange={(e) => {
              setDraftY(Number(e.target.value));
              setDirty(true);
            }}
            className="mt-1 w-full"
          />
        </div>
        <div>
          <label htmlFor="banner-scrim" className="flex justify-between text-sm text-gray-700">
            <span>Mörkläggning</span>
            <span className="tabular-nums text-gray-500">{draftScrim}%</span>
          </label>
          <input
            id="banner-scrim"
            type="range"
            min={0}
            max={80}
            value={draftScrim}
            onChange={(e) => {
              setDraftScrim(Number(e.target.value));
              setDirty(true);
            }}
            className="mt-1 w-full"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSavePlacement}
          disabled={saving || !dirty}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Sparar…' : 'Spara placering'}
        </button>
        {dirty && !saving && <span className="text-sm text-amber-600">Osparade ändringar</span>}
      </div>
    </section>
  );
}
