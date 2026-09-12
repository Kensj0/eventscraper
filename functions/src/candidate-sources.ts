import * as admin from 'firebase-admin';

// Kandidat-organisationer för källupptäckt (DEL 1) lever i Firestore-
// collectionen "candidate-sources" — separat från "sources" (source-config.ts)
// eftersom en kandidat inte är en verifierad, ingestable källa förrän DEL 2:s
// capability-testning (JSON-LD → iCal → RSS → HTML) har körts mot den.
export type CandidateCategory =
  | 'kommun'
  | 'museum'
  | 'teater'
  | 'arena'
  | 'turism'
  | 'aggregator'
  | 'skola'
  | 'kyrka'
  | 'ideell-organisation'
  | 'bibliotek';

export type CandidateStatus = 'new' | 'ready-to-ingest' | 'verified' | 'failed';

// externalIds: id:n mot organisationens EGNA API:er (om den har några) —
// t.ex. Svenska kyrkans UnitAPI-unitId, som är samma värde CalendarAPI:s
// owner_id-filter förväntar sig (se org-harvesters.ts:harvestSvenskaKyrkan).
// Gör det möjligt att gå API-till-API för denna typ av källa istället för
// att skrapa organisationens webbplats.
export interface CandidateSource {
  id: string;
  name: string;
  url: string;
  region: string;
  type: CandidateCategory;
  source: string;
  externalIds?: {
    ownerId?: string;
    unitId?: string;
    [key: string]: string | undefined;
  };
  discoveredFrom?: string;
  createdAt: admin.firestore.Timestamp;
  lastVerified?: admin.firestore.Timestamp;
  status: CandidateStatus;
}

function db() {
  return admin.firestore();
}

// merge:true så att en redan upptäckt organisation kan köras om (t.ex. med
// uppdaterad URL) utan att tappa ett status som DEL 2 redan satt — status
// sätts bara till 'new' för dokument som inte redan finns.
export async function upsertCandidateSources(
  candidates: Array<
    Pick<CandidateSource, 'id' | 'name' | 'url' | 'region' | 'type' | 'source'> &
      Partial<Pick<CandidateSource, 'discoveredFrom' | 'externalIds'>>
  >
): Promise<{ added: number; updated: number }> {
  const refs = candidates.map((c) => db().collection('candidate-sources').doc(c.id));
  const existing = refs.length > 0 ? await db().getAll(...refs) : [];
  const existingIds = new Set(existing.filter((doc) => doc.exists).map((doc) => doc.id));

  const batch = db().batch();
  for (const candidate of candidates) {
    const { id, ...data } = candidate;
    const patch: Record<string, unknown> = { ...data, createdAt: admin.firestore.Timestamp.now() };
    if (!existingIds.has(id)) {
      patch.status = 'new' satisfies CandidateStatus;
    }
    batch.set(db().collection('candidate-sources').doc(id), patch, { merge: true });
  }
  await batch.commit();
  return { added: candidates.length - existingIds.size, updated: existingIds.size };
}

export async function getCandidateSources(status?: CandidateStatus): Promise<CandidateSource[]> {
  let q: FirebaseFirestore.Query = db().collection('candidate-sources');
  if (status) q = q.where('status', '==', status);
  const snapshot = await q.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CandidateSource);
}
