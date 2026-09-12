import * as admin from 'firebase-admin';

// Källkonfiguration lever i Firestore (collection "sources") istället för
// en konstant i koden, så att en källa kan stängas av/på eller bytas URL
// utan en ny deploy. "method" täcker redan de fyra strategier DEL 1
// (functions/src/sources/, pausad tills en riktig JSON-LD/iCal-källa finns)
// är tänkt att implementera — idag används bara 'rss' och 'html'.
export type SourceMethod = 'jsonld' | 'ical' | 'rss' | 'html' | 'svenska-kyrkan-calendar';

export interface SourceConfig {
  id: string;
  name: string;
  url: string;
  region: string;
  method: SourceMethod;
  selectors?: Record<string, string>;
  enabled: boolean;
  lastSuccess?: admin.firestore.Timestamp;
  lastError?: string;
  eventsFound?: number;
  // Satt för method:'svenska-kyrkan-calendar' — samma ownerId som redan
  // populerades på candidate-sources av UnitAPI-harvestern (org-harvesters.ts),
  // och exakt det värde CalendarAPI:s owner_id-filter förväntar sig.
  externalIds?: {
    ownerId?: string;
    [key: string]: string | undefined;
  };
}

function db() {
  // admin.firestore() är en singleton knuten till appen som
  // admin.initializeApp() i index.ts redan satt upp — säkert att anropa
  // igen här utan att initiera om.
  return admin.firestore();
}

// Två likhetsfilter (method + enabled) kräver inget kompositindex i
// Firestore — det behövs bara vid range/orderBy-kombinationer.
export async function getEnabledSources(method: SourceMethod): Promise<SourceConfig[]> {
  const snapshot = await db()
    .collection('sources')
    .where('method', '==', method)
    .where('enabled', '==', true)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as SourceConfig));
}

// Skriver senaste körningsstatus tillbaka till källans egen post. Får
// aldrig krascha ingestion-körningen om skrivningen misslyckas — samma
// princip som logIngestionRun i index.ts.
export async function updateSourceStatus(
  id: string,
  update: { success: boolean; error?: string; eventsFound?: number }
): Promise<void> {
  try {
    const patch: Record<string, unknown> = {};
    if (update.success) {
      patch.lastSuccess = admin.firestore.Timestamp.now();
      patch.lastError = admin.firestore.FieldValue.delete();
    } else {
      patch.lastError = update.error || 'Unknown error';
    }
    if (typeof update.eventsFound === 'number') {
      patch.eventsFound = update.eventsFound;
    }
    await db().collection('sources').doc(id).set(patch, { merge: true });
  } catch (error) {
    console.error(`Failed to update source status for ${id}:`, error);
  }
}
