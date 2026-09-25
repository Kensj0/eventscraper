// DEL 1 återupptagen (2026-09-13), avgränsat till de mallar som faktiskt går
// att skrapa: promotar candidate-sources med status 'failed' vars url matchar
// en registrerad domän-adapter (se html-detail-adapters.ts — idag abf.se och
// studieframjandet.se, 114 av 236 misslyckade kandidater) till riktiga
// "sources" med method:'html'. Samma form/idempotens som
// promote-ready-candidates.ts: candidate.id återanvänds som sources-dok-id,
// och candidate-sources.status sätts till 'verified' så skriptet är säkert
// att köra om.
//
// dalabiblioteken.se (43, typ "bibliotek") och de spridda skol-kandidaterna
// (57) omfattas MEDVETET INTE — dalabiblioteken.se:s "Evenemang"-sektion är
// en Axiell Arena-portlet som server-renderar bara en spinner och hämtar
// listan via JS efter sidladdning (ingen dokumenterad publik JSON-endpoint
// hittad), och skol-kandidaterna är för spridda över olika kommun-mallar för
// att motivera en gemensam adapter i denna omgång.
//
// Passar samtidigt på att städa de 20 "kyrka"-kandidaterna (samtliga
// svenskakyrkan.se) — de är samma församlingar som redan ligger live i
// "sources" via den separata Svenska kyrkan CalendarAPI-integrationen
// (svenska-kyrkan-ingestion.ts, method:'svenska-kyrkan-calendar'), bara
// kvarglömda som 'failed' candidate-sources sedan innan den byggdes. Får
// INTE promotas som HTML-källor (skulle skrapa samma händelser en gång till
// via en sämre kanal och duplicera dem) — märks istället med en förklarande
// lastError så framtida körningar av detta skript inte råkar plocka upp dem.
import * as admin from 'firebase-admin';
import { getCandidateSources } from '../src/candidate-sources';
import { detailPageAdapterFor } from '../src/html-detail-adapters';

admin.initializeApp({ projectId: 'eventscraper-f0588' });

async function main() {
  const failed = await getCandidateSources('failed');
  const eligible = failed.filter((c) => detailPageAdapterFor(c.url) !== null);
  const churchDuplicates = failed.filter((c) => c.type === 'kyrka' && c.url.includes('svenskakyrkan.se'));
  console.log(
    `Hittade ${failed.length} kandidater med status 'failed', ${eligible.length} matchar en registrerad HTML-adapter, ${churchDuplicates.length} är redan täckta av Svenska kyrkan-CalendarAPI:t.`
  );

  const db = admin.firestore();
  const batch = db.batch();
  for (const candidate of eligible) {
    batch.set(
      db.collection('sources').doc(candidate.id),
      {
        name: candidate.name,
        url: candidate.url,
        region: candidate.region,
        method: 'html',
        enabled: true,
      },
      { merge: true }
    );
    batch.set(db.collection('candidate-sources').doc(candidate.id), { status: 'verified' }, { merge: true });
  }
  for (const candidate of churchDuplicates) {
    batch.set(
      db.collection('candidate-sources').doc(candidate.id),
      {
        status: 'verified',
        lastError:
          'Redan ingested via Svenska kyrkan CalendarAPI (se sources, method: svenska-kyrkan-calendar) — denna HTML-kandidat är överflödig.',
      },
      { merge: true }
    );
  }
  await batch.commit();

  console.log(
    `Promotade ${eligible.length} källor till "sources" (method: 'html'). Märkte ${churchDuplicates.length} kyrko-dubbletter som redan täckta.`
  );
}

main().catch((err) => {
  console.error('promote-html-detail-candidates.ts kraschade:', err);
  process.exitCode = 1;
});
