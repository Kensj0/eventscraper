// Seedar Firestore-collectionen "sources" med de nuvarande 4 RSS-feederna
// och 6 HTML-scraperna för Dalarna, så att index.ts:s getEnabledSources()
// hittar samma källor som tidigare låg hårdkodade i RSS_FEEDS/HTML_SCRAPERS.
// orsa-rovdjurspark-html och leksand-sommarland-html tillkom 2026-09-20 via
// källupptäckt DEL 1/2 (discover-venues.ts hittade venuen, ingen RSS/iCal
// fanns, så bespoke HTML-scraper i html-scraper.ts istället).
//
// Körning mot emulator:
//   firebase emulators:start --only firestore
//   (i en annan terminal, från functions/)
//   FIRESTORE_EMULATOR_HOST=localhost:8080 npx ts-node scripts/seed-sources.ts
//
// Körning mot prod kräver GOOGLE_APPLICATION_CREDENTIALS satt till en
// service account-nyckel (samma mönster som check-ingestion.js).
import * as admin from 'firebase-admin';
import { SourceConfig } from '../src/source-config';

admin.initializeApp();
const db = admin.firestore();

type SeedSource = Omit<SourceConfig, 'lastSuccess' | 'lastError' | 'eventsFound'>;

const SOURCES: SeedSource[] = [
  {
    id: 'falukuriren-rss',
    name: 'Falun Kuriren',
    url: 'https://www.falukuriren.se/feeds/feed.xml',
    region: 'Dalarna',
    method: 'rss',
    enabled: true,
  },
  {
    id: 'borlange-rss',
    name: 'Borlänge Stad',
    url: 'https://www.borlange.se/feed',
    region: 'Dalarna',
    method: 'rss',
    enabled: true,
  },
  {
    id: 'falun-rss',
    name: 'Falun Stad',
    url: 'https://www.falun.se/rss',
    region: 'Dalarna',
    method: 'rss',
    enabled: true,
  },
  {
    id: 'rattvik-rss',
    name: 'Rättvik Kommun',
    url: 'https://www.rattvik.se/rss',
    region: 'Dalarna',
    method: 'rss',
    enabled: true,
  },
  {
    id: 'borlange-html',
    name: 'Borlänge Stad (HTML)',
    url: 'https://www.borlange.se',
    region: 'Dalarna',
    method: 'html',
    enabled: true,
  },
  {
    id: 'falun-html',
    name: 'Falun Stad (HTML)',
    url: 'https://www.falun.se',
    region: 'Dalarna',
    method: 'html',
    enabled: true,
  },
  {
    id: 'ludvika-html',
    name: 'Ludvika Kommun (HTML)',
    url: 'https://www.ludvika.se',
    region: 'Dalarna',
    method: 'html',
    enabled: true,
  },
  {
    id: 'rattvik-html',
    name: 'Rättvik Kommun (HTML)',
    url: 'https://www.rattvik.se',
    region: 'Dalarna',
    method: 'html',
    enabled: true,
  },
  {
    id: 'orsa-rovdjurspark-html',
    name: 'Orsa Rovdjurspark (HTML)',
    url: 'https://www.orsagronklitt.se/evenemang/',
    region: 'Dalarna',
    method: 'html',
    enabled: true,
  },
  {
    id: 'leksand-sommarland-html',
    name: 'Leksand Sommarland (HTML)',
    url: 'https://leksandsommarland.se/hander-i-parken/',
    region: 'Dalarna',
    method: 'html',
    enabled: true,
  },
];

async function main() {
  const batch = db.batch();
  for (const source of SOURCES) {
    const { id, ...data } = source;
    batch.set(db.collection('sources').doc(id), data, { merge: true });
  }
  await batch.commit();
  console.log(`Seedade ${SOURCES.length} källor i "sources"-collectionen.`);
}

main().catch((err) => {
  console.error('seed-sources.ts kraschade:', err);
  process.exitCode = 1;
});
