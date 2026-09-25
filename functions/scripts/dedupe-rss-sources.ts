// Engångsfix: 2026-09-13 visade check-ingestion.yml 60 dubbletts-URL:er i
// samma körning efter att de 18 DEL 2-verifierade skolkällorna promotades.
// Orsak (bekräftad via list-rss-sources): flera "skolor" har ingen egen
// RSS — DEL 2:s capability-test hittade bara kommunens sajt-övergripande
// feed länkad från skolans undersida (t.ex. fem Rättviks-skolor pekar alla
// på https://www.rattvik.se/rss, samma feed som redan finns som källan
// "Rättvik Kommun"; fem Gagnef-skolor pekar alla på https://www.gagnef.se/feed/).
// Stänger av alla utom en (den mest "kommun-lika" om någon finns) per
// unik feed-URL, så vi slutar polla samma feed flera gånger per körning.
import * as admin from 'firebase-admin';

admin.initializeApp({ projectId: 'eventscraper-f0588' });

function normalize(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

async function main() {
  const snapshot = await admin.firestore().collection('sources').where('method', '==', 'rss').get();

  const byFeed = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const doc of snapshot.docs) {
    const key = normalize(doc.data().url);
    if (!byFeed.has(key)) byFeed.set(key, []);
    byFeed.get(key)!.push(doc);
  }

  const batch = admin.firestore().batch();
  let disabledCount = 0;

  for (const [feedUrl, docs] of byFeed) {
    if (docs.length <= 1) continue;

    // Föredra att behålla en källa vars namn faktiskt är en kommun/stad —
    // resten är per definition inte specifika till den egna organisationen.
    const sorted = [...docs].sort((a, b) => {
      const aIsMunicipal = /kommun|stad/i.test(a.data().name) ? 0 : 1;
      const bIsMunicipal = /kommun|stad/i.test(b.data().name) ? 0 : 1;
      return aIsMunicipal - bIsMunicipal;
    });
    const [keep, ...drop] = sorted;

    console.log(
      `Delad feed ${feedUrl}: behåller "${keep.data().name}", stänger av ${drop.map((d) => `"${d.data().name}"`).join(', ')}`
    );

    for (const doc of drop) {
      batch.set(
        doc.ref,
        {
          enabled: false,
          lastError: `Avstängd 2026-09-13: delar RSS-feed (${feedUrl}) med källan "${keep.data().name}" — DEL 2 hittade bara kommunens sajt-övergripande feed, inte en egen för denna organisation.`,
        },
        { merge: true }
      );
      disabledCount++;
    }
  }

  await batch.commit();
  console.log(`Stängde av ${disabledCount} källor som delade RSS-feed med en annan redan aktiv källa.`);
}

main().catch((err) => {
  console.error('dedupe-rss-sources.ts kraschade:', err);
  process.exitCode = 1;
});
