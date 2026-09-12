// DEL 2 av källupptäckten: kör functions/src/capability-test.ts mot varje
// candidate-source med status 'new' och skriver resultatet tillbaka —
// 'ready-to-ingest' + verifiedMethod/feedUrl vid träff, annars 'failed'.
// Kör i begränsad parallellitet (CONCURRENCY) istället för sekventiellt
// (254 kandidater × upp till 15s timeout hade annars kunnat ta över en
// timme) eller allt samtidigt (onödigt hårt mot 7 externa webbplatser).
import * as admin from 'firebase-admin';
import { getCandidateSources } from '../src/candidate-sources';
import { testCapability } from '../src/capability-test';

admin.initializeApp();

const CONCURRENCY = 8;

async function main() {
  const candidates = await getCandidateSources('new');
  console.log(`Testar ${candidates.length} kandidater (status 'new')...`);

  let ready = 0;
  let failed = 0;
  const byMethod: Record<string, number> = {};
  const errors: string[] = [];

  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++];
      let result;
      try {
        result = await testCapability(candidate.url);
      } catch (err) {
        errors.push(`${candidate.id}: ${err}`);
        result = null;
      }

      const patch: Record<string, unknown> = { lastVerified: admin.firestore.Timestamp.now() };
      if (result) {
        patch.status = 'ready-to-ingest';
        patch.verifiedMethod = result.method;
        if (result.feedUrl) patch.feedUrl = result.feedUrl;
        ready++;
        byMethod[result.method] = (byMethod[result.method] || 0) + 1;
      } else {
        patch.status = 'failed';
        failed++;
      }

      try {
        await admin.firestore().collection('candidate-sources').doc(candidate.id).set(patch, { merge: true });
      } catch (err) {
        errors.push(`${candidate.id}: kunde inte skriva resultat: ${err}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`Klart: ${ready} ready-to-ingest, ${failed} failed (av ${candidates.length}).`);
  console.log('Per metod (ready-to-ingest):', byMethod);
  if (errors.length > 0) {
    console.log(`Fel under körningen (${errors.length}):`);
    for (const e of errors.slice(0, 20)) console.log(`  - ${e}`);
  }
}

main().catch((err) => {
  console.error('test-candidates.ts kraschade:', err);
  process.exitCode = 1;
});
