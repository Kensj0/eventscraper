// DEL 1 av källupptäckten: samlar in namn + webbadress för organisationer i
// Dalarna och skriver dem till Firestore-collectionen "candidate-sources"
// (se functions/src/candidate-sources.ts). Varje kandidat får status
// "pending" tills DEL 2:s capability-testning (JSON-LD → iCal → RSS → HTML)
// avgör om den blir "ready-to-ingest".
//
// Listan nedan är manuellt research:ad och URL-verifierad (2026-09-12), inte
// hämtad från ett generiskt scraping-flöde — se avvägningen i
// discoveredFrom-fälten och rapporten till Kenny för varför:
//
// - SCB:s företagsregister (nyligen avgiftsfritt, se scb.se/vara-tjanster/
//   oppna-data/) listar ALLA registrerade företag/organisationer i Sverige,
//   men innehåller varken webbadress eller någon signal om vilka som
//   producerar publika evenemang — att gå den vägen hade krävt en egen,
//   betydligt större efterforskning (org-nummer → hitta webbplats) utan
//   given avkastning.
// - Kommunernas egna föreningsregister (t.ex. Älvdalens, via
//   alvdalen.actorsmartbook.se) är Angular-SPA:er bakom inloggning/sök —
//   inte skrapbara med ett enkelt HTTP-anrop. Flera Dalarna-kommuner verkar
//   dela samma "ActorSmartBook"-plattform, vilket är värt att undersöka
//   vidare i en senare iteration (kräver en riktig webbläsarmotor).
// - "Det händer i Dalarna" (dethanderidalarna.se) är en oberoende
//   evenemangsaggregator som redan gör mycket av samma jobb — dess "om
//   oss"-sida namnger sina egna källor (Visit Falun, Falu kommun, Falu Bio/
//   Svenska Bio, Magasinet, Dalateatern, Dalarnas museum), vilket gav flera
//   av kandidaterna nedan. Den är själv en bra kandidat att testa i DEL 2.
import * as admin from 'firebase-admin';
import { upsertCandidateSources, CandidateCategory } from '../src/candidate-sources';

admin.initializeApp();

const DISCOVERED_2026_09_12 = 'Manuell research 2026-09-12 (WebSearch/WebFetch, URL-verifierad)';

interface Organization {
  id: string;
  name: string;
  url: string;
  category: CandidateCategory;
  discoveredFrom: string;
}

const ORGANIZATIONS: Organization[] = [
  // Dalarnas 15 kommuner. borlange-kommun/falun-kommun/rattvik-kommun/
  // ludvika-kommun finns redan i "sources" (RSS eller HTML) — de tas ändå
  // med här för spårbarhet, DEL 2 kan då se att de redan är verifierade.
  { id: 'avesta-kommun', name: 'Avesta kommun', url: 'https://www.avesta.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'borlange-kommun', name: 'Borlänge kommun', url: 'https://www.borlange.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'falu-kommun', name: 'Falu kommun', url: 'https://www.falun.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'gagnefs-kommun', name: 'Gagnefs kommun', url: 'https://www.gagnef.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'hedemora-kommun', name: 'Hedemora kommun', url: 'https://www.hedemora.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'leksands-kommun', name: 'Leksands kommun', url: 'https://www.leksand.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'ludvika-kommun', name: 'Ludvika kommun', url: 'https://www.ludvika.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'malung-salens-kommun', name: 'Malung-Sälens kommun', url: 'https://www.malung-salen.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'mora-kommun', name: 'Mora kommun', url: 'https://www.morakommun.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'orsa-kommun', name: 'Orsa kommun', url: 'https://www.orsa.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'rattviks-kommun', name: 'Rättviks kommun', url: 'https://www.rattvik.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'smedjebackens-kommun', name: 'Smedjebackens kommun', url: 'https://www.smedjebacken.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'saters-kommun', name: 'Säters kommun', url: 'https://www.sater.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'vansbro-kommun', name: 'Vansbro kommun', url: 'https://www.vansbro.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },
  { id: 'alvdalens-kommun', name: 'Älvdalens kommun', url: 'https://www.alvdalen.se', category: 'kommun', discoveredFrom: DISCOVERED_2026_09_12 },

  // Kultur-/evenemangsorganisationer, upptäckta via dethanderidalarna.se/om-oss
  { id: 'dalarnas-museum', name: 'Dalarnas museum', url: 'https://dalarnasmuseum.se', category: 'museum', discoveredFrom: `${DISCOVERED_2026_09_12} — namngiven på dethanderidalarna.se/om-oss` },
  { id: 'dalateatern', name: 'Dalateatern', url: 'https://dalateatern.se', category: 'teater', discoveredFrom: `${DISCOVERED_2026_09_12} — namngiven på dethanderidalarna.se/om-oss` },
  { id: 'magasinet-falun', name: 'Magasinet Falun', url: 'https://magasinetfalun.se', category: 'arena', discoveredFrom: `${DISCOVERED_2026_09_12} — namngiven på dethanderidalarna.se/om-oss` },
  { id: 'visit-dalarna', name: 'Visit Dalarna', url: 'https://www.visitdalarna.se', category: 'turism', discoveredFrom: `${DISCOVERED_2026_09_12} — regional turistorganisation, Citybreak-backend (se [[del1-source-adapter-design]]: ingen Event-JSON-LD)` },
  { id: 'det-hander-i-dalarna', name: 'Det händer i Dalarna', url: 'https://dethanderidalarna.se', category: 'aggregator', discoveredFrom: `${DISCOVERED_2026_09_12} — oberoende evenemangsaggregator för hela länet` },
];

async function main() {
  const { added, updated } = await upsertCandidateSources(
    ORGANIZATIONS.map((org) => ({ ...org, region: 'Dalarna' }))
  );
  console.log(
    `Källupptäckt DEL 1: ${ORGANIZATIONS.length} organisationer bearbetade ` +
      `(${added} nya, ${updated} redan kända — uppdaterade utan att röra status) ` +
      `i "candidate-sources".`
  );
}

main().catch((err) => {
  console.error('discover-organizations.ts kraschade:', err);
  process.exitCode = 1;
});
