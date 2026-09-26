// Läs-endast diagnostik: hur många events i prod har en sourceUrl som INTE
// är en riktig http(s)-länk (t.ex. det syntetiska
// "svenska-kyrkan-calendar:<id>"-fallbacket i svenska-kyrkan-ingestion.ts)?
import * as admin from 'firebase-admin';

admin.initializeApp({ projectId: 'eventscraper-f0588' });

async function main() {
  const snapshot = await admin
    .firestore()
    .collection('events')
    .select('sourceName', 'sourceUrl', 'title', 'startTime')
    .get();

  const bad: Array<{ id: string; title: string; sourceName: string; sourceUrl: string }> = [];
  for (const doc of snapshot.docs) {
    const d = doc.data();
    const url = d.sourceUrl || '';
    if (!/^https?:\/\//.test(url)) {
      bad.push({ id: doc.id, title: d.title, sourceName: d.sourceName, sourceUrl: url });
    }
  }

  console.log(`Totalt: ${snapshot.size} events, ${bad.length} utan riktig http(s)-länk.`);
  for (const b of bad) {
    console.log(`  [${b.id}] ${b.sourceName}: "${b.title}" -> ${b.sourceUrl}`);
  }
}

main().catch((err) => {
  console.error('check-dead-links.ts kraschade:', err);
  process.exitCode = 1;
});
