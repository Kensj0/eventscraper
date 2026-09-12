import axios from 'axios';
import * as cheerio from 'cheerio';
import { RegionDatabase } from './region-databases';
import { CandidateCategory } from './candidate-sources';

// En harvester går från EN region-database (se region-databases.ts) till
// organisationer med namn+url, redo för candidate-sources.ts:upsertCandidateSources.
// Registret nedan mappar region-databases dokument-id -> harvester-funktion.
// Ett dokument utan matchande nyckel har ingen harvester implementerad än
// (RF-SISU, studieförbunden, Dalabiblioteken m.fl. — se rapport).
export interface HarvestedOrg {
  id: string;
  name: string;
  url: string;
  category: CandidateCategory;
  discoveredFrom: string;
}

export type Harvester = (database: RegionDatabase) => Promise<HarvestedOrg[]>;

const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; EventScraperDalarna/1.0)' };
const HTTP_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Skolverkets Skolenhetsregister API v2 — se scripts/pilot-skolverket.ts för
// hur API-formen upptäcktes. Listendpointen saknar url, så varje skola kräver
// ett eget detaljanrop — därav taket per kommun för att hålla en full
// länstäckande körning inom rimlig tid.
// ---------------------------------------------------------------------------
const SKOLVERKET_API_BASE = 'https://api.skolverket.se/skolenhetsregistret/v2';
const MAX_SCHOOLS_PER_MUNICIPALITY = 5;

// SCB-kommunkoder, Dalarnas län — array av tupler med avsikt (se
// pilot-skolverket.ts-kommentaren om varför inte Record<string,string>:
// heltalsliknande nycklar sorteras om numeriskt av Object.entries).
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

interface SkolverketListItem {
  schoolUnitCode: string;
  name: string;
  status: string;
}

async function harvestSkolverket(database: RegionDatabase): Promise<HarvestedOrg[]> {
  const results: HarvestedOrg[] = [];

  for (const [code, municipalityName] of DALARNA_MUNICIPALITIES) {
    let units: SkolverketListItem[];
    try {
      const res = await axios.get(`${SKOLVERKET_API_BASE}/school-units`, {
        params: { municipality_code: code },
        headers: REQUEST_HEADERS,
        timeout: HTTP_TIMEOUT_MS,
      });
      units = res.data.data.attributes as SkolverketListItem[];
    } catch (err) {
      console.error(`Skolverket: kunde inte hämta skolenheter för ${municipalityName} (${code}):`, err);
      continue;
    }

    const active = units.filter((u) => u.status === 'AKTIV');
    let foundHere = 0;
    for (const unit of active) {
      if (foundHere >= MAX_SCHOOLS_PER_MUNICIPALITY) break;
      try {
        const detailRes = await axios.get(`${SKOLVERKET_API_BASE}/school-units/${unit.schoolUnitCode}`, {
          headers: REQUEST_HEADERS,
          timeout: HTTP_TIMEOUT_MS,
        });
        const detail = detailRes.data.data.attributes as { displayName: string; url: string | null };
        if (detail.url && detail.url.trim().length > 0) {
          results.push({
            id: `skola-${unit.schoolUnitCode}`,
            name: detail.displayName,
            url: detail.url,
            category: 'skola',
            discoveredFrom: `${database.name} (kommun: ${municipalityName})`,
          });
          foundHere++;
        }
      } catch (err) {
        console.error(`Skolverket: kunde inte hämta detaljer för ${unit.schoolUnitCode} (${unit.name}):`, err);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Svenska kyrkan — AVSIKTLIGT INTE registrerad i HARVESTERS nedan, se
// harvestSvenskaKyrkanHeritagePages() längre ner för varför. Två öppna
// frågor kvar innan den här databasen är värd att koppla in:
//
// 1. Den riktiga UnitAPI:n/kalender-API:n (api.svenskakyrkan.se) har
//    gudstjänst-/aktivitetsdata men kräver ett registrerat konto +
//    API-nyckel — inte gjort här, det är ett "måste signera något"-beslut
//    för Kenny, inte något att tyst skapa.
// 2. Alternativet utan nyckel (crawla svenskakyrkan.se:s sitemap-index,
//    ~1203 per-pastorat-sitemaps, för att hitta varje pastorats egna
//    hemsida, t.ex. svenskakyrkan.se/falun) är tekniskt möjligt men mycket
//    tyngre än de andra harvestrarna (hundratals HTTP-anrop bara för att
//    hitta ~15-20 Dalarna-pastorat) — inte byggt än, se rapport.
// ---------------------------------------------------------------------------

// Byggd, testad och sedan AVSTÄNGD: extraherar kyrkonamn korrekt från
// svenskakyrkan.se/vasterasstift/kyrkor-i-dalarna (statisk, ingen JS krävs
// trots <svk-accordion-item>-taggarna), men varje länk visade sig — efter
// att sidans <base href="/default.aspx?id=930549"> respekterats korrekt —
// 301-omdirigera till en NEDLADDNINGSBAR PDF (byggnadens kulturhistoria från
// 2004–2006), inte till en webbsida. Verifierat manuellt (curl -L) för
// "Aspeboda kyrka": slutdestination är .../filer/.../c4619fdf-....pdf.
// Helt oanvändbart som ingestion-kandidat (ingen RSS/JSON-LD/HTML att
// skrapa ur en PDF), så trots att namn-extraktionen fungerar hålls den HÄR
// UTANFÖR HARVESTERS-registret för att inte skräpa ner candidate-sources
// med döda länkar. Kvar som referens om Kenny ändå vill ha namnen (utan url).
async function harvestSvenskaKyrkanHeritagePages(database: RegionDatabase): Promise<HarvestedOrg[]> {
  const pageUrl = 'https://www.svenskakyrkan.se/vasterasstift/kyrkor-i-dalarna';
  const res = await axios.get(pageUrl, { headers: REQUEST_HEADERS, timeout: HTTP_TIMEOUT_MS });
  const $ = cheerio.load(res.data);
  const baseHref = $('base').attr('href'); // t.ex. "/default.aspx?id=930549" — relativa länkar på sidan löser mot roten, INTE mot sidans egen URL
  const results: HarvestedOrg[] = [];
  const seen = new Set<string>();

  $('svk-accordion-item').each((_, el) => {
    const name = $(el).find('h3[slot="title"]').first().text().trim();
    const href = $(el).find('a[href*="default.aspx"]').first().attr('href');
    if (!name || !href || seen.has(name)) return;
    seen.add(name);
    const absoluteUrl = new URL(href, new URL(baseHref || '/', pageUrl)).toString();
    results.push({
      id: `kyrka-${name.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/^-+|-+$/g, '')}`,
      name,
      url: absoluteUrl, // OBS: pekar på en PDF, inte en webbsida — se kommentar ovan
      category: 'kyrka',
      discoveredFrom: `${database.name} — statisk byggnadslista, url leder till PDF (ej lämplig ingestion-kandidat, se org-harvesters.ts)`,
    });
  });

  return results;
}

export const HARVESTERS: Record<string, Harvester> = {
  'skolverket-skolenhetsregistret': harvestSkolverket,
};
