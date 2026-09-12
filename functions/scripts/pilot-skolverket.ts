// Pilot: kan Skolverkets Skolenhetsregister API (den enda riktiga,
// programmatiska databasen från DEL 1 Steg 2 — se region-databases.ts,
// id "skolverket-skolenhetsregistret") faktiskt användas för att hämta
// riktiga organisationer med webbadress? Testas mot ett fåtal Dalarna-
// kommuner innan Steg 3 byggs om för att läsa alla region-databases
// generellt.
//
// API-formen (upptäckt via OpenAPI-specen på
// api.skolverket.se/skolenhetsregistret/skolenhetsregistret_v2_openapi.yaml):
//   GET /v2/school-units?municipality_code=<kommunkod>
//     -> lätt lista: {schoolUnitCode, name, status}, INGEN url.
//   GET /v2/school-units/{schoolUnitCode}
//     -> detaljer inklusive `url` (nullable — många skolor saknar egen sida).
// Kräver alltså ett anrop per skola för att få webbadressen, inte bara ett
// listanrop.
import * as admin from 'firebase-admin';
import axios from 'axios';
import { upsertCandidateSources } from '../src/candidate-sources';

admin.initializeApp();

const API_BASE = 'https://api.skolverket.se/skolenhetsregistret/v2';
const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; EventScraperDalarna/1.0)' };

// SCB-kommunkoder, Dalarnas län. Uppdraget nämner uttryckligen "Borlänge,
// Falun, Ludvika, Rättvik etc" — de fyra ligger därför FÖRST, resten av
// länets 15 kommuner efter. En vanlig Record<string,string> med
// heltalsliknande nycklar ('2080' osv) hade sorterats numeriskt av
// JavaScript (Object.entries ignorerar insättningsordning för sådana
// nycklar) — därför en array av tupler istället, som garanterar ordningen.
const DALARNA_MUNICIPALITIES: Array<[code: string, name: string]> = [
  ['2081', 'Borlänge'],
  ['2080', 'Falun'],
  ['2085', 'Ludvika'],
  ['2031', 'Rättvik'],
  ['2082', 'Säter'],
  ['2083', 'Hedemora'],
  ['2084', 'Avesta'],
  ['2061', 'Smedjebacken'],
  ['2062', 'Mora'],
  ['2034', 'Orsa'],
  ['2039', 'Älvdalen'],
  ['2029', 'Leksand'],
  ['2021', 'Vansbro'],
  ['2023', 'Malung-Sälen'],
  ['2026', 'Gagnef'],
];

interface SchoolUnitListItem {
  schoolUnitCode: string;
  name: string;
  status: string;
}

interface SchoolUnitDetail {
  displayName: string;
  url: string | null;
  municipalityCode: string;
  status: string;
}

async function fetchSchoolUnits(municipalityCode: string): Promise<SchoolUnitListItem[]> {
  const res = await axios.get(`${API_BASE}/school-units`, {
    params: { municipality_code: municipalityCode },
    headers: REQUEST_HEADERS,
    timeout: 15000,
  });
  return res.data.data.attributes as SchoolUnitListItem[];
}

async function fetchSchoolUnitDetail(schoolUnitCode: string): Promise<SchoolUnitDetail> {
  const res = await axios.get(`${API_BASE}/school-units/${schoolUnitCode}`, {
    headers: REQUEST_HEADERS,
    timeout: 15000,
  });
  return res.data.data.attributes as SchoolUnitDetail;
}

async function main() {
  let totalFound = 0;
  let totalActive = 0;
  const withUrl: Array<{ id: string; name: string; url: string; municipality: string }> = [];
  const errors: string[] = [];

  for (const [code, municipalityName] of DALARNA_MUNICIPALITIES) {
    let units: SchoolUnitListItem[];
    try {
      units = await fetchSchoolUnits(code);
    } catch (err) {
      errors.push(`Kunde inte hämta skolenheter för ${municipalityName} (${code}): ${err}`);
      continue;
    }
    totalFound += units.length;
    const active = units.filter((u) => u.status === 'AKTIV');
    totalActive += active.length;

    // Max 4 med url PER kommun så slutresultatet faktiskt speglar flera av
    // de efterfrågade kommunerna (Borlänge, Falun, Ludvika, Rättvik) istället
    // för att fyllas helt av den första kommunen i listan — och en total-
    // gräns så vi inte detalj-hämtar samtliga ~400+ aktiva skolenheter i
    // länet i en engångskörning; pilotens syfte är att bevisa mönstret funkar.
    let foundInThisMunicipality = 0;
    for (const unit of active) {
      if (withUrl.length >= 20 || foundInThisMunicipality >= 4) break;
      try {
        const detail = await fetchSchoolUnitDetail(unit.schoolUnitCode);
        if (detail.url && detail.url.trim().length > 0) {
          withUrl.push({
            id: `skola-${unit.schoolUnitCode}`,
            name: detail.displayName,
            url: detail.url,
            municipality: municipalityName,
          });
          foundInThisMunicipality++;
        }
      } catch (err) {
        errors.push(`Kunde inte hämta detaljer för skolenhet ${unit.schoolUnitCode} (${unit.name}): ${err}`);
      }
    }
    if (withUrl.length >= 20) break;
  }

  console.log(`Skolenheter hittade totalt (alla statusar): ${totalFound}`);
  console.log(`Varav AKTIV: ${totalActive}`);
  console.log(`Skolor med icke-tom url-fält (av de vi detalj-kollade): ${withUrl.length}`);
  if (errors.length > 0) {
    console.log(`Fel under körningen (${errors.length}):`);
    for (const e of errors) console.log(`  - ${e}`);
  }

  const chosen = withUrl.slice(0, 10);
  if (chosen.length < 5) {
    console.log(`Endast ${chosen.length} skolor med url hittades — under målet på 5-10. Seedar ändå det som finns.`);
  }

  const { added, updated } = await upsertCandidateSources(
    chosen.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      region: 'Dalarna',
      type: 'skola',
      source: 'skolverket-skolenhetsregistret',
      discoveredFrom: `Skolverkets Skolenhetsregister API v2 (pilot 2026-09-12), kommun: ${s.municipality}`,
    }))
  );

  console.log(`Seedade ${chosen.length} skolor i "candidate-sources" (${added} nya, ${updated} redan kända).`);
  console.log('Valda skolor:');
  for (const s of chosen) console.log(`  - ${s.name} (${s.municipality}): ${s.url}`);
}

main().catch((err) => {
  console.error('pilot-skolverket.ts kraschade:', err);
  process.exitCode = 1;
});
