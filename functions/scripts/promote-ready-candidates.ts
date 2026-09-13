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
import * as admin from 'firebase-admin';
import { getCandidateSources } from '../src/candidate-sources';

admin.initializeApp();

async function main() {
  const candidates = await getCandidateSources('ready-to-ingest');
  console.log(`Hittade ${candidates.length} kandidater med status 'ready-to-ingest'.`);

  const db = admin.firestore();
  const batch = db.batch();
  for (const candidate of candidates) {
    if (!candidate.verifiedMethod) {
      console.warn(`Hoppar över ${candidate.id}: saknar verifiedMethod trots status 'ready-to-ingest'.`);
      continue;
    }
    batch.set(
      db.collection('sources').doc(candidate.id),
      {
        name: candidate.name,
        url: candidate.feedUrl || candidate.url,
        region: candidate.region,
        method: candidate.verifiedMethod,
        enabled: true,
      },
      { merge: true }
    );
    batch.set(db.collection('candidate-sources').doc(candidate.id), { status: 'verified' }, { merge: true });
  }
  await batch.commit();

  console.log(`Promotade ${candidates.length} källor till "sources".`);
}

main().catch((err) => {
  console.error('promote-ready-candidates.ts kraschade:', err);
  process.exitCode = 1;
});
