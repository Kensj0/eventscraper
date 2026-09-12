import * as admin from 'firebase-admin';
import axios from 'axios';
import { OrganizationGroup } from './organization-types';

// En "region-database" är inte en enskild organisation utan en KÄLLA SOM
// LISTAR MÅNGA organisationer av en viss typ (ett föreningsregister, en
// nationell katalog med regionfilter, ett officiellt API) — steget före
// candidate-sources i källupptäckten. Se functions/src/candidate-sources.ts.
export interface RegionDatabase {
  id: string;
  region: string;
  organizationGroup: OrganizationGroup;
  name: string;
  url: string;
  // 'yes' = vanlig HTTP GET + statisk HTML/JSON räcker.
  // 'no-js-rendered' = kräver en riktig webbläsarmotor (Angular-SPA, kartwidget osv).
  // 'no-blocked' = svarade inte 200 (t.ex. bot-skydd).
  // 'unknown' = inte bedömd än.
  scrapable: 'yes' | 'no-js-rendered' | 'no-blocked' | 'unknown';
  hasApi: boolean;
  httpStatus?: number;
  lastCheckedAt?: admin.firestore.Timestamp;
  discoveredFrom: string;
  discoveredAt: admin.firestore.Timestamp;
}

function db() {
  return admin.firestore();
}

// Riktig HTTP-verifiering (inte en gissning) — körs vid seed-tid så
// httpStatus/scrapable-fälten speglar databasens faktiska skick just nu.
export async function verifyDatabaseReachable(url: string): Promise<{ status?: number; ok: boolean }> {
  try {
    const res = await axios.get(url, {
      timeout: 10000,
      validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EventScraperDalarna/1.0)' },
    });
    return { status: res.status, ok: res.status === 200 };
  } catch {
    return { ok: false };
  }
}

export async function upsertRegionDatabases(
  databases: Array<
    Pick<
      RegionDatabase,
      'id' | 'region' | 'organizationGroup' | 'name' | 'url' | 'scrapable' | 'hasApi' | 'discoveredFrom'
    >
  >
): Promise<{ checked: number }> {
  const batch = db().batch();
  for (const database of databases) {
    const { id, url, ...rest } = database;
    const { status } = await verifyDatabaseReachable(url);
    batch.set(
      db().collection('region-databases').doc(id),
      {
        ...rest,
        url,
        httpStatus: status ?? null,
        lastCheckedAt: admin.firestore.Timestamp.now(),
        discoveredAt: admin.firestore.Timestamp.now(),
      },
      { merge: true }
    );
  }
  await batch.commit();
  return { checked: databases.length };
}

export async function getRegionDatabases(
  region?: string,
  organizationGroup?: OrganizationGroup
): Promise<RegionDatabase[]> {
  let q: FirebaseFirestore.Query = db().collection('region-databases');
  if (region) q = q.where('region', '==', region);
  if (organizationGroup) q = q.where('organizationGroup', '==', organizationGroup);
  const snapshot = await q.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as RegionDatabase);
}
