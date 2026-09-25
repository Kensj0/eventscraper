// Kompletterar discover-databases.ts + discover-organizations.ts för
// organisationsgrupperna "uteliv" och "halsa-andlighet" (se
// organization-types.ts). Skälet till att detta är ett separat script:
// för dessa grupper finns INGET regionalt register att gå via (se den
// utförliga kommentaren i discover-databases.ts) — varje venue nedan är
// istället en enskild, namngiven organisation som hittades genom direkt
// research 2026-09-19, samma sätt som dethanderidalarna.se ursprungligen
// lades till i DEL 1 Steg 1.
//
// Detta är alltså INTE en generell "hitta alla pubar i Dalarna"-lösning —
// det finns ingen sådan lista att hämta från. Att täcka fler pubar,
// nattklubbar, yogastudior etc kräver att fler enskilda venues läggs till
// här manuellt, en och en, i takt med att de blir kända.
import * as admin from 'firebase-admin';
import { upsertCandidateSources } from '../src/candidate-sources';
import type { CandidateCategory } from '../src/candidate-sources';

admin.initializeApp({ projectId: 'eventscraper-f0588' });

const DISCOVERED = 'Manuell research 2026-09-19 — enskild namngiven organisation, inget regionalt register finns för denna kategori (se discover-databases.ts)';

interface VenueCandidate {
  id: string;
  name: string;
  url: string;
  type: CandidateCategory;
  note: string;
}

const VENUES: VenueCandidate[] = [
  {
    id: 'dalhalla',
    name: 'Dalhalla',
    url: 'https://www.dalhalla.se',
    type: 'konsertscen',
    note: 'Utomhuskonsertarena i nedlagt kalkbrott utanför Rättvik — opera, klassiskt, pop/rock hela sommarhalvåret',
  },
  {
    id: 'orsa-rovdjurspark',
    name: 'Orsa Rovdjurspark (Orsa Grönklitt)',
    url: 'https://www.orsagronklitt.se',
    type: 'djurpark',
    note: 'Europas största rovdjurspark, del av Orsa Grönklitt-anläggningen',
  },
  {
    id: 'leksand-sommarland',
    name: 'Leksand Sommarland',
    url: 'https://leksandsommarland.se',
    type: 'nojespark',
    note: 'Nöjes- och vattenpark i Leksand',
  },
];

async function main() {
  const { added, updated } = await upsertCandidateSources(
    VENUES.map((v) => ({
      id: v.id,
      name: v.name,
      url: v.url,
      region: 'Dalarna',
      type: v.type,
      source: 'discover-venues-manual',
      discoveredFrom: `${DISCOVERED} — ${v.note}`,
    }))
  );

  console.log(`discover-venues.ts: ${added} nya, ${updated} uppdaterade candidate-sources.`);
  console.log('OBS: detta täcker INTE pubar, nattklubbar, restaurangscener, moskéer, tempel,');
  console.log('retreat-center eller yogastudior — inget hittat värt att lägga in ännu, se');
  console.log('kommentaren i discover-databases.ts för varför inget register finns för dessa.');
}

main().catch((err) => {
  console.error('discover-venues.ts kraschade:', err);
  process.exitCode = 1;
});
