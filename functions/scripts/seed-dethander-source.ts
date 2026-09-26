// Engångsseed: lägger till dethanderidalarna.se som en riktig, aktiverad
// källa (method:'dethander-dalarna', se functions/src/dethander-ingestion.ts)
// och flippar Kennys ursprungliga eventlänk-inskick (candidate-sources,
// type:'anvandarinskickad', den som testCapability() korrekt märkte
// 'failed' eftersom sajten är en ren client-renderad SPA) till 'verified' —
// samma mönster som promote-ready-candidates.ts, så EventLinkQueue inte
// fortsätter visa den som en olöst "failed"-post trots att den nu är löst
// via en dedikerad adapter istället för jsonld/ical/rss.
import * as admin from 'firebase-admin';

admin.initializeApp({ projectId: 'eventscraper-f0588' });

async function main() {
  const db = admin.firestore();

  await db.collection('sources').doc('dethander-dalarna').set(
    {
      name: 'Det händer i Dalarna',
      url: 'https://dethanderidalarna.se/',
      region: 'Dalarna',
      method: 'dethander-dalarna',
      enabled: true,
    },
    { merge: true }
  );
  console.log('Källa "dethander-dalarna" skapad/uppdaterad i sources.');

  const candidates = await db
    .collection('candidate-sources')
    .where('type', '==', 'anvandarinskickad')
    .where('url', '==', 'https://dethanderidalarna.se/')
    .get();
  for (const doc of candidates.docs) {
    await doc.ref.set({ status: 'verified' }, { merge: true });
    console.log(`candidate-sources/${doc.id} flippad till 'verified'.`);
  }
}

main().catch((err) => {
  console.error('seed-dethander-source.ts kraschade:', err);
  process.exitCode = 1;
});
