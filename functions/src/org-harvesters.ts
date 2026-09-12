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
  type: CandidateCategory;
  discoveredFrom: string;
  externalIds?: { ownerId?: string; unitId?: string; [key: string]: string | undefined };
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
            type: 'skola',
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
// Svenska kyrkan — UnitAPI ("Enheter V2", api.svenskakyrkan.se/externwebb),
// nu inkopplad. Kenny registrerade konto och delade nyckeln
// (SVENSKA_KYRKAN_UNIT_API_KEY); OBS annan auth-mekanism än CalendarAPI:s
// Azure APIM-nyckel — den här skickas som header `SvkAuthSvc-ApiKey`, inte
// `Ocp-Apim-Subscription-Key` (verifierat live mot båda API:erna).
//
// OData-API:t (/api-v2/odata/units) har `localAuthorityCode` som exakt
// motsvarar SCB-kommunkoderna i DALARNA_MUNICIPALITIES ovan (bekräftat live,
// t.ex. '2081' = Borlänge) och en `activatedCalendar`-flagga som säger om
// enheten faktiskt publicerar events — filtrerar bort de ~90% av
// församlingarna som inte har det istället för att gissa. Endast 21 enheter
// i hela Dalarna hade activatedCalendar=true vid verifieringstillfället.
// `unitId` är samma id som CalendarAPI:s `owner_id`-filter förväntar sig
// (se calendarapi.json, /event/search) — det är länken mellan de två API:erna.
// ---------------------------------------------------------------------------
const SVENSKA_KYRKAN_UNIT_API_BASE = 'https://api.svenskakyrkan.se/externwebb/api-v2/odata/units';

interface SvenskaKyrkanUnit {
  unitId: number;
  name: string | null;
  websiteAddress: string | null;
  unitType: string | null;
}

async function harvestSvenskaKyrkan(database: RegionDatabase): Promise<HarvestedOrg[]> {
  const apiKey = process.env.SVENSKA_KYRKAN_UNIT_API_KEY;
  if (!apiKey) {
    console.error('Svenska kyrkan: SVENSKA_KYRKAN_UNIT_API_KEY saknas, hoppar över.');
    return [];
  }

  const results: HarvestedOrg[] = [];

  for (const [code, municipalityName] of DALARNA_MUNICIPALITIES) {
    let units: SvenskaKyrkanUnit[];
    try {
      const res = await axios.get(SVENSKA_KYRKAN_UNIT_API_BASE, {
        params: {
          $filter: `localAuthorityCode eq '${code}' and activatedCalendar eq true`,
          $select: 'unitId,name,websiteAddress,unitType',
        },
        headers: { ...REQUEST_HEADERS, 'SvkAuthSvc-ApiKey': apiKey },
        timeout: HTTP_TIMEOUT_MS,
      });
      units = res.data.value as SvenskaKyrkanUnit[];
    } catch (err) {
      console.error(`Svenska kyrkan: kunde inte hämta enheter för ${municipalityName} (${code}):`, err);
      continue;
    }

    for (const unit of units) {
      if (!unit.name || !unit.websiteAddress) continue;
      const unitIdStr = String(unit.unitId);
      results.push({
        id: `kyrka-${unit.unitId}`,
        name: unit.name,
        url: unit.websiteAddress,
        type: 'kyrka',
        discoveredFrom: `${database.name} — UnitAPI (kommun: ${municipalityName})`,
        externalIds: { ownerId: unitIdStr, unitId: unitIdStr },
      });
    }
  }

  return results;
}

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
      type: 'kyrka',
      discoveredFrom: `${database.name} — statisk byggnadslista, url leder till PDF (ej lämplig ingestion-kandidat, se org-harvesters.ts)`,
    });
  });

  return results;
}

// ---------------------------------------------------------------------------
// RF-SISU Dalarna och Dalabiblioteken — undersökta men INTE riktiga "en
// databas med många organisationer" på det sätt Skolverket/Svenska kyrkans
// UnitAPI är, och därför fortfarande self-harvestade nedan:
//
// - RF-SISU Dalarna har inte en publik medlemsföreningslista på sin egen
//   sajt (kollat rfsisu.se/distrikt/dalarna och sökt efter röstlängd/
//   årsmöteshandlingar). Den nationella "Hitta inom idrottsrörelsen" HAR de
//   ~900 föreningarna, men är ett rent JS-sökformulär utan öppet API — det
//   riktiga bakomliggande API:et (IdrottOnline, devportal.idrottonline.se)
//   kräver att man är specialidrottsförbund eller registrerad partner
//   ("please do not sign up" annars, verifierat live) — en policy-spärr,
//   inte en teknisk sådan. Inte löst här.
// - Dalabiblioteken är en delad LÅNTAGARPORTAL (Axiell Arena, BankID-inlogg
//   för kontofunktioner) för de 15 kommunbibliotekens gemensamma katalog —
//   inte en sida som länkar ut till 15 separata bibliotekswebbplatser.
//
// Den ärliga harvesten för dessa två är därför "databasen ÄR sin egen enda
// organisation" — lägg till den direkt i candidate-sources istället för att
// låtsas extrahera en lista som inte finns.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ABF Dalarna — riktig kurskatalog, statisk HTML, ingen JS-rendering krävd.
// /dalarna/kurs-sok/?type=course&page=N är WordPress-server-renderad (helt
// annan plattform än SV/Studiefrämjandet), redan Dalarna-scopad via
// url-prefixet /dalarna/. Verifierat live: sida 1 gav 9 kort, sida 7 gav 0
// (bortom sista sidan) — loopen stannar på första tomma sidan istället för
// ett hårdkodat sidantal, så den håller även när kursutbudet växer/krymper.
// ---------------------------------------------------------------------------
const ABF_SEARCH_URL = 'https://www.abf.se/dalarna/kurs-sok/';
const ABF_MAX_PAGES = 30; // säkerhetstak, verkligt sidantal var 6 vid verifiering

async function harvestABF(database: RegionDatabase): Promise<HarvestedOrg[]> {
  const results: HarvestedOrg[] = [];

  for (let page = 1; page <= ABF_MAX_PAGES; page++) {
    let $: cheerio.CheerioAPI;
    try {
      const res = await axios.get(ABF_SEARCH_URL, {
        params: { type: 'course', page },
        headers: REQUEST_HEADERS,
        timeout: HTTP_TIMEOUT_MS,
      });
      $ = cheerio.load(res.data);
    } catch (err) {
      console.error(`ABF Dalarna: kunde inte hämta kurssök sida ${page}:`, err);
      break;
    }

    const cards = $('article.CourseCard');
    if (cards.length === 0) break; // sista sidan passerad

    cards.each((_, el) => {
      const name = $(el).find('h3.CourseCard-title').first().text().trim();
      const url = $(el).find('footer.CourseCard-footer a[href]').first().attr('href');
      if (!name || !url) return;
      const slug = url.split('/').filter(Boolean).pop();
      results.push({
        id: `abf-${slug}`,
        name,
        url,
        type: 'kurs',
        discoveredFrom: `${database.name} — kurssök sida ${page}`,
      });
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Studiefrämjandet — ingen fungerande region-filtrering i sökformuläret,
// men webbplatsens EGEN sitemap.xml listar varje kurs/kalenderhändelse med
// länet redan i url-sökvägen (t.ex. /dalarnas-lan/.../kurser/...), så ingen
// gissning krävs. Verifierat live: 92 url:er innehåller "/dalarnas-lan/",
// varav 91 är enskilda aktivitetssidor (kurser + kalenderhändelser) och en
// är själva länets landningssida (utesluten).
// ---------------------------------------------------------------------------
const STUDIEFRAMJANDET_SITEMAP = 'https://www.studieframjandet.se/sitemap.xml';

async function harvestStudieframjandet(database: RegionDatabase): Promise<HarvestedOrg[]> {
  let activityUrls: string[];
  try {
    const res = await axios.get(STUDIEFRAMJANDET_SITEMAP, { headers: REQUEST_HEADERS, timeout: HTTP_TIMEOUT_MS });
    const $ = cheerio.load(res.data, { xmlMode: true });
    const allUrls = $('url > loc')
      .map((_, el) => $(el).text().trim())
      .get();
    activityUrls = allUrls.filter(
      (url) => url.includes('/dalarnas-lan/') && (url.includes('/kurser/') || url.includes('/kalenderhandelser/'))
    );
  } catch (err) {
    console.error('Studiefrämjandet: kunde inte hämta sitemap.xml:', err);
    return [];
  }

  const results: HarvestedOrg[] = [];
  for (const url of activityUrls) {
    try {
      const res = await axios.get(url, { headers: REQUEST_HEADERS, timeout: HTTP_TIMEOUT_MS });
      const $ = cheerio.load(res.data);
      const name = $('h1').first().text().trim();
      if (!name) continue;
      // Hela url-sökvägen (utan domän) som id — sitemapens loc är redan
      // garanterat unik, så det finns ingen kollisionsrisk att hantera.
      const id = new URL(url).pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-');
      results.push({
        id: `studieframjandet-${id}`,
        name,
        url,
        type: 'kurs',
        discoveredFrom: `${database.name} — sitemap.xml (Dalarnas län)`,
      });
    } catch (err) {
      console.error(`Studiefrämjandet: kunde inte hämta ${url}:`, err);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Dalabiblioteken — den delade Axiell Arena-portalen (dalabiblioteken.se) är
// själv ingen katalog över organisationer, men undersidan /vara-bibliotek
// (redan flaggad i discover-databases.ts som "själva listan ligger under en
// 'Våra bibliotek'-undersida") ÄR en riktig lista: 40+ enskilda BIBLIOTEKS-
// FILIALER (inte bara 15 kommunnivå — t.ex. Bjursås/Björbo/Boda/Torsång är
// egna filialer inom Falun/Gagnef/Borlänge-kommunerna), statisk HTML, ingen
// JS-rendering krävd. Verifierat live. Varje filial har en egen detaljsida
// på dalabiblioteken.se (t.ex. /-/bjursas-bibliotek), inte en extern
// kommunbibliotek-webbplats — url:en pekar alltså in i samma delade portal,
// vilket är korrekt: det finns ingen annan webbplats per filial.
// ---------------------------------------------------------------------------
const DALABIBLIOTEKEN_BRANCHES_URL = 'https://dalabiblioteken.se/vara-bibliotek';

async function harvestDalabiblioteken(database: RegionDatabase): Promise<HarvestedOrg[]> {
  let $: cheerio.CheerioAPI;
  try {
    const res = await axios.get(DALABIBLIOTEKEN_BRANCHES_URL, { headers: REQUEST_HEADERS, timeout: HTTP_TIMEOUT_MS });
    $ = cheerio.load(res.data);
  } catch (err) {
    console.error('Dalabiblioteken: kunde inte hämta /vara-bibliotek:', err);
    return [];
  }

  const results: HarvestedOrg[] = [];
  const seen = new Set<string>();

  $('a.branch-list-container').each((_, el) => {
    const href = $(el).attr('href');
    const name = $(el).find('h2').first().text().trim();
    if (!href || !name || seen.has(href)) return;
    seen.add(href);
    // href är t.ex. ".../-/bjursas-bibliotek#/?location=..." — slug mellan
    // sista "/-/ " och en eventuell "#" är unik per filial.
    const slug = href.split('/-/')[1]?.split(/[#?]/)[0];
    if (!slug) return;
    results.push({
      id: `bibliotek-${slug}`,
      name,
      url: href.split('#')[0],
      type: 'bibliotek',
      discoveredFrom: `${database.name} — vara-bibliotek (filiallista)`,
    });
  });

  return results;
}

// SV Dalarna får INTE samma behandling som ABF/Studiefrämjandet ovan — sv.se
// har inget url-baserat länfilter (kurssidor ligger under /kurser-och-
// evenemang/ utan region i sökvägen, 4086 st nationellt enligt sitemap.axd)
// och sidans eget filter-API (/api/productFilter, en Litium-e-handelsplattform
// där kurser är modellerade som "produkter") svarar 500 på anrop utan en
// fullständig webbläsarsession — verifierat live, inte löst här. Förblir
// self-harvestad (se harvestSelf nedan) tills antingen API:et knäcks eller
// en headless-browser-lösning byggs (samma avvägning som RF-SISU).
function harvestSelf(type: CandidateCategory): Harvester {
  return async (database: RegionDatabase): Promise<HarvestedOrg[]> => [
    {
      id: database.id,
      name: database.name,
      url: database.url,
      type,
      discoveredFrom: `${database.name} — databasen visade sig vara en enskild organisation, inte en katalog över flera (se org-harvesters.ts)`,
    },
  ];
}

export const HARVESTERS: Record<string, Harvester> = {
  'skolverket-skolenhetsregistret': harvestSkolverket,
  'svenska-kyrkan-sok-forsamling': harvestSvenskaKyrkan,
  'rf-sisu-dalarna': harvestSelf('ideell-organisation'),
  'sv-dalarna': harvestSelf('ideell-organisation'),
  'abf-dalarna': harvestABF,
  'studieframjandet': harvestStudieframjandet,
  'dalabiblioteken': harvestDalabiblioteken,
};
