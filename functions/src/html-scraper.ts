import axios from 'axios';
import * as cheerio from 'cheerio';

// HTML-scrapers för Dalarna-kommunernas webbplatser.
//
// Varje kommun bygger sin evenemangssida på en annan plattform, så varje
// scraper är skräddarsydd efter vad som faktiskt går att extrahera:
//
//  - Borlänge: Sitevision-widgeten "Soleil eventListing" server-renderar en
//    komplett JSON-payload (AppRegistry.registerInitialState) med titel,
//    beskrivning, ISO-datum och kategori. Vi parsar den JSON:en direkt
//    istället för att lita på CSS-klasser (de är hashade/byggda och kan
//    ändras vid varje deploy, t.ex. "item-w36au1").
//  - Falun: en Citybreak-driven lista ("lp-visit-list") som server-renderas
//    med stabila BEM-klassnamn och ett <time datetime="..."> med fullt
//    ISO-8601 + tidszon. Skrapas med vanliga cheerio-selektorer.
//  - Ludvika: har ingen strukturerad kalender. "Evenemang"-menyn länkar till
//    fristående Sitevision-artiklar (en per tradition/event) utan
//    maskinläsbart datum i listvyn. Vi hämtar artiklarna och skickar
//    rubrik + ingress vidare till AI-parsern (callAI i index.ts), som redan
//    är byggd för att extrahera datum ur fri text.
//  - Rättvik: har ingen egen evenemangssida alls – kommunens webbplats
//    länkar rakt ut till visitdalarna.se/evenemangen, som är en Vue.js-app
//    (v-cloak, v-for, <% %>) där listan renderas klientsidan efter att
//    JavaScript körts. axios+cheerio ser bara det tomma app-skalet, så
//    scrapeRattvik() returnerar en tom lista med en förklarande logg
//    istället för att låtsas ha fungerande selektorer. Att skrapa den
//    riktiga datan kräver en headless browser (t.ex. Puppeteer), vilket är
//    utanför scopet för den här Cloud Function-baserade lösningen.

export interface ScrapedEvent {
  title: string;
  description: string;
  startTime: string; // ISO-8601 om känt, annars '' (AI-parsern får då gissa från texten)
  location: string;
  url: string;
  sourceName: string;
}

export const HTTP_TIMEOUT_MS = 15000;
export const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; EventScraperDalarna/1.0)',
};
const SITE_ITEM_LIMIT = 10;

export async function fetchHtml(url: string): Promise<string> {
  const response = await axios.get(url, {
    timeout: HTTP_TIMEOUT_MS,
    headers: REQUEST_HEADERS,
  });
  return response.data;
}

// Extraherar ett balanserat JSON-objekt som börjar vid `startIdx` (positionen
// för dess inledande "{"). Behövs eftersom regex inte klarar nästlade
// klamrar/citattecken i den inbäddade AppRegistry-payloaden.
function extractBalancedJson(text: string, startIdx: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(startIdx, i + 1);
      }
    }
  }

  return null;
}

// Sverige växlar mellan CET (+01:00) och CEST (+02:00). Sitevision-widgeten
// levererar tider utan offset (t.ex. "2026-09-12T10:00"), så vi räknar ut
// rätt offset själva (sommartid = sista sön i mars 01:00 UTC till sista sön
// i oktober 01:00 UTC) istället för att gissa och riskera fel tidszon.
function toStockholmISOString(naiveLocal: string): string {
  const [datePart, timePart] = naiveLocal.split('T');
  if (!datePart || !timePart) return naiveLocal;

  const year = Number(datePart.slice(0, 4));
  const lastSunday = (month: number): number => {
    const d = new Date(Date.UTC(year, month + 1, 0)); // sista dagen i månaden
    const dow = d.getUTCDay();
    return d.getUTCDate() - dow;
  };

  const dstStartUTC = Date.UTC(year, 2, lastSunday(2), 1, 0, 0); // sista sön mars, 01:00 UTC
  const dstEndUTC = Date.UTC(year, 9, lastSunday(9), 1, 0, 0); // sista sön okt, 01:00 UTC
  const naiveUTC = Date.UTC(
    year,
    Number(datePart.slice(5, 7)) - 1,
    Number(datePart.slice(8, 10)),
    Number(timePart.slice(0, 2)),
    Number(timePart.slice(3, 5))
  );

  const isDst = naiveUTC >= dstStartUTC && naiveUTC < dstEndUTC;
  return `${naiveLocal}:00${isDst ? '+02:00' : '+01:00'}`;
}

export async function scrapeBorlange(): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  const baseUrl = 'https://www.borlange.se';

  try {
    const html = await fetchHtml(`${baseUrl}/uppleva-och-gora/evenemang/evenemangskalender`);

    const marker = 'AppRegistry.registerInitialState(';
    let searchFrom = 0;
    let payload: { items?: Array<Record<string, unknown>> } | null = null;

    while (true) {
      const markerIdx = html.indexOf(marker, searchFrom);
      if (markerIdx === -1) break;

      const braceIdx = html.indexOf('{', markerIdx + marker.length);
      if (braceIdx === -1) break;

      const jsonStr = extractBalancedJson(html, braceIdx);
      searchFrom = braceIdx + 1;
      if (!jsonStr || !jsonStr.includes('"items":[')) continue;

      try {
        payload = JSON.parse(jsonStr);
        break;
      } catch {
        continue;
      }
    }

    if (!payload || !Array.isArray(payload.items)) {
      console.warn('Borlänge: hittade ingen event-JSON i sidan (layout kan ha ändrats)');
      return events;
    }

    for (const item of payload.items.slice(0, SITE_ITEM_LIMIT)) {
      const title = String((item as any).title || '').trim();
      const uri = String((item as any).uri || '');
      const isoFull = (item as any).start?.iso?.full as string | undefined;
      const categories = ((item as any).fields || [])
        .flatMap((f: any) => (Array.isArray(f.value) ? f.value : [f.value]))
        .filter(Boolean)
        .join(', ');
      const desc = String((item as any).desc || '').trim();

      if (!title || !uri) continue;

      events.push({
        title,
        description: categories ? `${desc}\nKategori: ${categories}` : desc,
        startTime: isoFull ? toStockholmISOString(isoFull) : '',
        location: 'Borlänge', // exakt plats/adress finns inte i listdatan
        url: new URL(uri, baseUrl).href,
        sourceName: 'Borlänge Stad',
      });
    }

    console.log(`✓ Borlänge: ${events.length} event hittade`);
  } catch (error) {
    console.error('Borlänge scrape failed:', error);
  }

  return events;
}

export async function scrapeFalun(): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  const baseUrl = 'https://www.falun.se';

  try {
    const html = await fetchHtml(`${baseUrl}/gora--uppleva/det-hander-i-falun/evenemang.html`);
    const $ = cheerio.load(html);

    $('.lp-visit-list__item-wrapper')
      .slice(0, SITE_ITEM_LIMIT)
      .each((_i, elem) => {
        const $item = $(elem);
        const linkEl = $item.find('.lp-visit-list__item__link').first();
        const title = linkEl.text().trim();
        const url = linkEl.attr('href') || '';
        const isoDateTime = $item.find('time.lp-visit-list-date').first().attr('datetime') || '';
        const category = $item.find('.lp-visit-list__item__category').first().text().trim();

        if (!title || !url) return;

        events.push({
          title,
          description: category ? `Kategori: ${category}` : '',
          startTime: isoDateTime,
          location: 'Falun', // exakt plats/adress finns inte i listvyn
          url,
          sourceName: 'Falun Stad',
        });
      });

    console.log(`✓ Falun: ${events.length} event hittade`);
  } catch (error) {
    console.error('Falun scrape failed:', error);
  }

  return events;
}

export async function scrapeLudvika(): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  const baseUrl = 'https://www.ludvika.se';
  const hubPath = '/uppleva-och-gora/turism-evenemang-sevardheter';

  try {
    const hubHtml = await fetchHtml(`${baseUrl}${hubPath}`);
    const $hub = cheerio.load(hubHtml);

    const articleUrls = new Set<string>();
    $hub('a[href*="/turism-evenemang-sevardheter/"]').each((_i, elem) => {
      const href = $hub(elem).attr('href') || '';
      if (!href) return;
      const absolute = new URL(href, baseUrl).href;
      // Hoppa över själva nav-hubben, bara ta undersidor.
      if (absolute === new URL(hubPath, baseUrl).href) return;
      articleUrls.add(absolute);
    });

    const urlsToFetch = Array.from(articleUrls).slice(0, SITE_ITEM_LIMIT);

    const articles = await Promise.allSettled(
      urlsToFetch.map(async (url) => {
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);
        const title = $('h1.heading').first().text().trim() || $('h1').first().text().trim();
        const description =
          $('p.preamble').first().text().trim() || $('p.normal').first().text().trim();
        return { url, title, description };
      })
    );

    for (const result of articles) {
      if (result.status !== 'fulfilled') continue;
      const { url, title, description } = result.value;
      if (!title) continue;

      events.push({
        title,
        description,
        // Inget maskinläsbart datum i Ludvikas Sitevision-artiklar – AI-parsern
        // (callAI) får försöka extrahera ett datum ur titel/ingress istället.
        startTime: '',
        location: 'Ludvika',
        url,
        sourceName: 'Ludvika Kommun',
      });
    }

    console.log(
      `✓ Ludvika: ${events.length} sidor hittade (osäker datumextraktion, ingen strukturerad kalender)`
    );
  } catch (error) {
    console.error('Ludvika scrape failed:', error);
  }

  return events;
}

export async function scrapeRattvik(): Promise<ScrapedEvent[]> {
  // rattvik.se har ingen egen evenemangssida – den enda länken på
  // startsidan pekar ut till visitdalarna.se/evenemangen, som renderar hela
  // listan i en Vue.js-app (v-cloak/v-for/<% %>-direktiv syns i rå-HTML:en,
  // inga faktiska event-noder). axios+cheerio kör ingen JavaScript, så det
  // finns inget att skrapa här utan en headless browser. Vi loggar det
  // tydligt istället för att låtsas ha fungerande selektorer.
  console.warn(
    'Rättvik: hoppar över — kommunen har ingen egen kalender, och visitdalarna.se/evenemangen renderas klientsidan (Vue.js). Kräver headless browser för att skrapas.'
  );
  return [];
}
