// DEL 1, Steg 2 av källupptäckten: hittar DATABASER (källor som listar
// många organisationer av en viss typ) per organisationsgrupp för en
// region — se functions/src/region-databases.ts och organization-types.ts.
//
// VIKTIGT — samma avvägning som discover-organizations.ts (DEL 1, Steg 1):
// listan nedan kommer från manuell research denna session (WebSearch/
// WebFetch mot sökfraser som "föreningar i Dalarna lista webbplats",
// "kulturella evenemang Dalarna databas", "kyrkor i Dalarna officiell
// lista" osv, en gång per organisationsgrupp) — INTE från ett program som
// själv söker på webben. Att göra det senare autonomt (nattligt, för nya
// regioner) kräver en sök-API-nyckel (Google Custom Search/Bing/SerpAPI
// eller liknost) som inte finns konfigurerad i projektet idag — det är ett
// litet arkitekturval (vilken leverantör, kostnad) värt att lägga fram för
// Kenny snarare än att tyst välja och skapa en ny extern tjänst/nyckel.
//
// Vad scriptet GÖR göra på riktigt: varje databas nedan HTTP-verifieras
// (riktig GET, inte en gissning) vid körning via
// region-databases.ts:verifyDatabaseReachable, så httpStatus/scrapable
// speglar databasens faktiska skick just nu.
import * as admin from 'firebase-admin';
import { upsertRegionDatabases } from '../src/region-databases';
import type { OrganizationGroup } from '../src/organization-types';

admin.initializeApp();

const DISCOVERED = 'Manuell research 2026-09-12 (WebSearch per organisationsgrupp), HTTP-verifierad vid seed';

interface DatabaseCandidate {
  id: string;
  organizationGroup: OrganizationGroup;
  name: string;
  url: string;
  scrapable: 'yes' | 'no-js-rendered' | 'no-blocked' | 'unknown';
  hasApi: boolean;
  discoveredFrom: string;
}

const DATABASES: DatabaseCandidate[] = [
  // Kulturell — evenemangsaggregatorer som täcker många arrangörer på en gång.
  {
    id: 'det-hander-i-dalarna',
    organizationGroup: 'kulturell',
    name: 'Det händer i Dalarna',
    url: 'https://dethanderidalarna.se',
    scrapable: 'yes',
    hasApi: false,
    discoveredFrom: `${DISCOVERED} — oberoende länstäckande evenemangsaggregator, redan känd från DEL 1 Steg 1`,
  },
  {
    id: 'evenemangskalender-se-dalarna',
    organizationGroup: 'kulturell',
    name: 'Evenemangskalender.se (region: Dalarna)',
    url: 'https://www.evenemangskalender.se/bladdra?flik=Alla&region=Dalarna',
    scrapable: 'unknown',
    hasApi: false,
    discoveredFrom: `${DISCOVERED} — nationell evenemangsportal med regionfilter; sidan gav 0 träffar vid testfetch, oklart om serverrenderad eller JS-beroende`,
  },

  // Idrott — nationella/regionala idrottsförbundets egna kataloger.
  {
    id: 'rf-hitta-idrottsrorelsen',
    organizationGroup: 'idrott',
    name: 'Riksidrottsförbundet – Hitta inom idrottsrörelsen',
    url: 'https://www.rf.se/om-riksidrottsforbundet/hitta-inom-idrottsrorelsen',
    scrapable: 'no-js-rendered',
    hasApi: false,
    discoveredFrom: `${DISCOVERED} — nationell sökbar katalog över alla idrottsföreningar, filtrerbar på kommun; rent HTML-sökformulär, ingen publik API`,
  },
  {
    id: 'rf-sisu-dalarna',
    organizationGroup: 'idrott',
    name: 'RF-SISU Dalarna',
    url: 'https://www.rfsisu.se/distrikt/dalarna',
    scrapable: 'yes',
    hasApi: false,
    discoveredFrom: `${DISCOVERED} — regionalt idrottsdistrikt, ~900 föreningar i Dalarna enligt egen uppgift, ingen direktlänkad medlemslista hittad än`,
  },

  // Social — kyrka + studieförbund (workshop/kurs).
  {
    id: 'svenska-kyrkan-sok-forsamling',
    organizationGroup: 'social',
    name: 'Svenska kyrkan – Sök församling',
    url: 'https://www.svenskakyrkan.se/sokforsamling',
    scrapable: 'no-js-rendered',
    hasApi: false,
    discoveredFrom: `${DISCOVERED} — nationell sökbar församlings-/pastoratskatalog, filtrerbar på ort`,
  },
  {
    id: 'sv-dalarna',
    organizationGroup: 'social',
    name: 'Studieförbundet Vuxenskolan – Dalarna',
    url: 'https://www.sv.se/avdelningar/sv-dalarna',
    scrapable: 'yes',
    hasApi: false,
    discoveredFrom: `${DISCOVERED} — regional studieförbunds-avdelning, egna kurser/cirklar i alla 15 kommuner`,
  },
  {
    id: 'abf-dalarna',
    organizationGroup: 'social',
    name: 'ABF Dalarna',
    url: 'https://www.abf.se/dalarna',
    scrapable: 'yes',
    hasApi: false,
    discoveredFrom: `${DISCOVERED} — tre lokalavdelningar i Dalarna (Borlänge-Nedansiljan, Dala Finnmark, Södra-Östra Dalarna)`,
  },
  {
    id: 'studieframjandet',
    organizationGroup: 'social',
    name: 'Studiefrämjandet (region Mitt, inkl. Dalarna)',
    url: 'https://www.studieframjandet.se',
    scrapable: 'yes',
    hasApi: false,
    discoveredFrom: `${DISCOVERED} — täcker Dalarna + Värmland/Örebro/Gävleborg som en gemensam region ("Mitt")`,
  },

  // Offentlig — skola (riktig API!) och bibliotek.
  {
    id: 'skolverket-skolenhetsregistret',
    organizationGroup: 'offentlig',
    name: 'Skolverket – Skolenhetsregistret API v2',
    url: 'https://api.skolverket.se/skolenhetsregistret/swagger-ui/index.html',
    scrapable: 'yes',
    hasApi: true,
    discoveredFrom: `${DISCOVERED} — officiell REST-API (JSON/XML), uppdateras dagligen, bästa fyndet: en riktig databas att fråga programmatiskt, inte bara skrapa`,
  },
  {
    id: 'dalabiblioteken',
    organizationGroup: 'offentlig',
    name: 'Dalabiblioteken',
    url: 'https://dalabiblioteken.se/dalabiblioteken',
    scrapable: 'yes',
    hasApi: false,
    discoveredFrom: `${DISCOVERED} — samarbetsportal för folkbiblioteken i alla 15 Dalarna-kommuner; själva listan ligger under en "Våra bibliotek"-undersida, inte på denna URL`,
  },

  // Hobby — konst/musik/dans-föreningar, mestadels bakom kart-widgets.
  {
    id: 'konstforeningar-se',
    organizationGroup: 'hobby',
    name: 'Riksförbundet Sveriges Konstföreningar',
    url: 'https://konstforeningar.se',
    scrapable: 'no-js-rendered',
    hasApi: false,
    discoveredFrom: `${DISCOVERED} — nationell katalog över ~610 konstföreningar, men medlemslistan visas via en Google Maps-widget, inte statisk HTML`,
  },
  {
    id: 'dans-se',
    organizationGroup: 'hobby',
    name: 'Dans.se',
    url: 'https://dans.se',
    scrapable: 'unknown',
    hasApi: false,
    discoveredFrom: `${DISCOVERED} — administrations-/bokningsplattform för dansföreningar och dansarrangörer, oklart om en publik medlemslista finns`,
  },

  // Kommersiell — ingen oberoende regiontäckande databas hittad bortom
  // Visit Dalarnas egna "äta & dricka"/"boende"-sidor (redan under
  // visitdalarna.se, som finns som candidate-source sedan DEL 1 Steg 1).
];

async function main() {
  const byGroup = DATABASES.reduce<Record<string, number>>((acc, d) => {
    acc[d.organizationGroup] = (acc[d.organizationGroup] || 0) + 1;
    return acc;
  }, {});

  const { checked } = await upsertRegionDatabases(
    DATABASES.map((d) => ({ ...d, region: 'Dalarna' }))
  );

  console.log(`Källupptäckt DEL 1 Steg 2: ${checked} databaser HTTP-verifierade och skrivna till "region-databases".`);
  console.log('Per organisationsgrupp:', byGroup);
  console.log('OBS: ingen "kommersiell"-databas hittad bortom Visit Dalarnas egna sidor — se kommentar i scriptet.');
}

main().catch((err) => {
  console.error('discover-databases.ts kraschade:', err);
  process.exitCode = 1;
});
