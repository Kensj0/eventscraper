// Engångsmigrering för buggen där svenska-kyrkan-calendar-ingestion (innan
// fixen i src/svenska-kyrkan-ingestion.ts) sparade det syntetiska dedupe-id:t
// "svenska-kyrkan-calendar:<id>" direkt i sourceUrl — och EventCard.tsx
// renderar sourceUrl rakt av som <a href>, så de blev döda länkar i produktion
// (560 av 769 events vid upptäckten 2026-09-26).
//
// För varje sådant event:
//  1. Flyttar det befintliga sourceUrl-värdet till ett nytt externalId-fält
//     (så framtida körningars dedupe-koll mot externalId fortfarande känner
//     igen eventet och inte importerar en dubblett).
//  2. Sätter sourceUrl till församlingens riktiga webbplats (sources.url för
//     motsvarande källa, matchad på sourceName) — samma fallback som den nya
//     ingestion-koden använder för nya events.
//
// Skriver bara events som redan matchar det gamla mönstret; rör inga andra
// fält. Läser sources en gång och slår upp per sourceName.
import * as admin from 'firebase-admin';

admin.initializeApp({ projectId: 'eventscraper-f0588' });

async function main() {
  const db = admin.firestore();

  const sourcesSnap = await db.collection('sources').where('method', '==', 'svenska-kyrkan-calendar').get();
  const urlByName = new Map<string, string>();
  for (const doc of sourcesSnap.docs) {
    const d = doc.data();
    if (d.name && d.url) urlByName.set(d.name, d.url);
  }
  console.log(`${urlByName.size} svenska-kyrkan-calendar-källor inlästa.`);

  const eventsSnap = await db.collection('events').get();
  const toFix = eventsSnap.docs.filter((doc) => /^svenska-kyrkan-calendar:/.test(doc.data().sourceUrl || ''));
  console.log(`${toFix.length} events matchar det gamla döda-länk-mönstret.`);

  let fixed = 0;
  let missingSourceUrl = 0;
  const batchSize = 400; // Firestore-gräns 500 writes/batch, marginal för säkerhets skull
  for (let i = 0; i < toFix.length; i += batchSize) {
    const batch = db.batch();
    for (const doc of toFix.slice(i, i + batchSize)) {
      const d = doc.data();
      const realUrl = urlByName.get(d.sourceName);
      if (!realUrl) {
        missingSourceUrl++;
        console.warn(`  Ingen källa hittad för sourceName "${d.sourceName}" (event ${doc.id}) — hoppar över.`);
        continue;
      }
      batch.update(doc.ref, { externalId: d.sourceUrl, sourceUrl: realUrl });
      fixed++;
    }
    await batch.commit();
  }

  console.log(`Klart. ${fixed} events fixade, ${missingSourceUrl} kunde inte matchas mot en källa.`);
}

main().catch((err) => {
  console.error('backfill-svenska-kyrkan-links.ts kraschade:', err);
  process.exitCode = 1;
});
