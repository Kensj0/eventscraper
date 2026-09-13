// Kopierar candidate-sources med status 'ready-to-ingest' (satt av DEL 2:s
// capability-test, functions/src/capability-test.ts) till "sources" —
// verifiedMethod matchar SourceMethod rakt av (se candidate-sources.ts),
// och feedUrl (satt för ical/rss) används som källans url istället för
// sidans egen url om den finns, eftersom det är själva feeden som ska
// pollas. Samma mönster som promote-svenska-kyrkan-sources.ts.
//
// Sätter candidate-sources.status till 'verified' efter promotion så
// skriptet är säkert att köra om utan att skapa dubbletter eller skriva
// över en källa som redan justerats manuellt i "sources".
//
// Hoppar över en kandidat vars feed/url redan pekar på en befintlig,
// aktiverad källa (normaliserat, protokoll/www/trailing-slash oberoende).
// Lärdom från 2026-09-13: flera "skolor" hade ingen egen RSS utan bara
// kommunens sajt-övergripande feed länkad från skolans undersida — DEL 2
// verifierade feeden som "redo" utan att märka att fem andra kandidater
// redan pekade på exakt samma URL, vilket gav 60 dubblett-URL:er i en enda
// ingestion-körning (se dedupe-rss-sources.ts för engångsstädningen).
import * as admin from 'firebase-admin';
import { getCandidateSources } from '../src/candidate-sources';

admin.initializeApp();

function normalize(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

async function main() {
  const candidates = await getCandidateSources('ready-to-ingest');
  console.log(`Hittade ${candidates.length} kandidater med status 'ready-to-ingest'.`);

  const db = admin.firestore();
  const existingSources = await db.collection('sources').where('enabled', '==', true).get();
  const usedFeedUrls = new Set(existingSources.docs.map((doc) => normalize(doc.data().url)));

  const batch = db.batch();
  let promoted = 0;
  for (const candidate of candidates) {
    if (!candidate.verifiedMethod) {
      console.warn(`Hoppar över ${candidate.id}: saknar verifiedMethod trots status 'ready-to-ingest'.`);
      continue;
    }
    const feedUrl = candidate.feedUrl || candidate.url;
    const normalized = normalize(feedUrl);
    if (usedFeedUrls.has(normalized)) {
      console.warn(`Hoppar över ${candidate.id} ("${candidate.name}"): feed ${feedUrl} delas redan av en aktiv källa.`);
      batch.set(
        db.collection('candidate-sources').doc(candidate.id),
        { status: 'failed', lastError: `Delar feed med en redan aktiv källa: ${feedUrl}` },
        { merge: true }
      );
      continue;
    }
    usedFeedUrls.add(normalized);

    batch.set(
      db.collection('sources').doc(candidate.id),
      {
        name: candidate.name,
        url: feedUrl,
        region: candidate.region,
        method: candidate.verifiedMethod,
        enabled: true,
      },
      { merge: true }
    );
    batch.set(db.collection('candidate-sources').doc(candidate.id), { status: 'verified' }, { merge: true });
    promoted++;
  }
  await batch.commit();

  console.log(`Promotade ${promoted} källor till "sources" (${candidates.length - promoted} hoppades över p.g.a. delad feed).`);
}

main().catch((err) => {
  console.error('promote-ready-candidates.ts kraschade:', err);
  process.exitCode = 1;
});
