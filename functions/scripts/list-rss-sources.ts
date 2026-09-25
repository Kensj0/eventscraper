// Debug-hjälp: skriver ut varje RSS-källas namn + url (feed-url, satt vid
// promotion) — read-only, för att undersöka varför skol-RSS-flödena gav
// 60 duplicerade URL:er inom en enda ingestion-körning (se check-ingestion-
// loggen 2026-09-13).
import * as admin from 'firebase-admin';

admin.initializeApp({ projectId: 'eventscraper-f0588' });

async function main() {
  const snapshot = await admin.firestore().collection('sources').where('method', '==', 'rss').get();
  for (const doc of snapshot.docs) {
    const d = doc.data();
    console.log(`${d.name}\t${d.url}`);
  }
}

main().catch((err) => {
  console.error('list-rss-sources.ts kraschade:', err);
  process.exitCode = 1;
});
