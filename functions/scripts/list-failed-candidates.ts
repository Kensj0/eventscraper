// Debug-hjälp inför HTML-adapter-pilotet (DEL 1 återupptagen, 2026-09-13):
// dumpar namn, typ, url och senaste fel för varje candidate-source med
// status 'failed' (DEL 2:s capability-test hittade varken jsonld/ical/rss)
// så att ett representativt urval kan väljas manuellt för CSS-selectors —
// read-only, samma mönster som list-rss-sources.ts.
import * as admin from 'firebase-admin';
import { getCandidateSources } from '../src/candidate-sources';

admin.initializeApp();

async function main() {
  const failed = await getCandidateSources('failed');
  console.log(`Hittade ${failed.length} kandidater med status 'failed'.`);

  const byType = new Map<string, number>();
  for (const c of failed) byType.set(c.type, (byType.get(c.type) || 0) + 1);
  console.log('Per typ:', Object.fromEntries(byType));

  for (const c of failed) {
    console.log(`${c.type}\t${c.name}\t${c.url}`);
  }
}

main().catch((err) => {
  console.error('list-failed-candidates.ts kraschade:', err);
  process.exitCode = 1;
});
