import * as cheerio from 'cheerio';
import { ScrapedEvent, fetchHtml } from './html-scraper';

// HTML-adapter för candidate-sources DEL 2 inte kunde verifiera (varken
// jsonld/ical/rss) — DEL 1 återupptagen 2026-09-13, men bara för de fall där
// en handfull sajt-mallar täcker många kandidater samtidigt (se
// list-failed-candidates.ts: 114 av 236 misslyckade kandidater är enskilda
// kurs/evenemangs-sidor på abf.se eller studieframjandet.se, byggda på samma
// mall). Till skillnad från de fyra kommun-scraperna i html-scraper.ts (en
// funktion = en listsida med flera event) är varje candidate-source här sin
// EGEN detaljsida med ETT event — dispatchas per domän i index.ts, inte per
// källa (se detailPageAdapterFor).
//
// dalabiblioteken.se undersöktes också (43 kandidater, typ "bibliotek") men
// dess "Evenemang"-sektion är Axiell Arenas calendar-event-list-portlet, som
// server-renderar bara en loading-spinner och hämtar den riktiga listan via
// JS efter sidladdning (ingen dokumenterad publik JSON-endpoint hittad) —
// samma "kräver headless browser"-kategori som Rättviks visitdalarna.se-länk
// och RF:s nationella idrottsklubbsök. Lämnad orörd, inte adapterad här.

export async function extractAbfCourse(url: string): Promise<ScrapedEvent | null> {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content')?.trim() || $('h1').first().text().trim();
    if (!title) return null;

    const description = $('meta[name="description"]').attr('content')?.trim() || '';

    // "Kursdatum"/"Plats" ligger i en <li><h3>Rubrik</h3><p>Värde</p></li>-grid
    // där CSS-klasserna är delade mellan alla rubriker — måste matchas på
    // rubrikens TEXT, inte klass.
    const gridValue = (heading: string): string => {
      let value = '';
      $('.HeroBlock-CourseInfo-Grid li').each((_i, li) => {
        const $li = $(li);
        if ($li.find('h3.HeroBlock-CourseInfo-Heading').first().text().trim() === heading) {
          value = $li.find('.HeroBlock-CourseInfo-Text').first().text().trim();
        }
      });
      return value;
    };

    // datetime-attributet saknar tidszon ("2026-09-14 13:30:00" — svensk
    // lokal tid, inget UTC-offset). new Date(...) av en sådan sträng tolkas
    // som lokal tid för miljön koden körs i, vilket ger fel resultat med två
    // timmars fel i en Cloud Function som kör i UTC (verifierat: lokalt
    // testkörning på denna, UTC+2-maskin, gav en annan (fel) UTC-tid än vad
    // en UTC-miljö skulle ge för samma sträng). Skickar därför den lästa
    // Kursdatum-texten ("14 september 2026") som hint till AI-parsern
    // istället för att själv bygga ett ISO-datum — samma mönster som
    // Studiefrämjandet-adaptern och Ludvika i html-scraper.ts.
    const kursdatumText = gridValue('Kursdatum');
    const location = gridValue('Plats');

    return {
      title,
      description: kursdatumText ? `${description}\nDatum: ${kursdatumText}` : description,
      startTime: '',
      location: location || 'Dalarna',
      url,
      sourceName: 'ABF Dalarna',
    };
  } catch (error) {
    console.error(`ABF-kurs-skrapning misslyckades för ${url}:`, error);
    return null;
  }
}

export async function extractStudieframjandetEvent(url: string): Promise<ScrapedEvent | null> {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content')?.trim() || $('h1').first().text().trim();
    if (!title) return null;

    const bodyText = $('.c-editorial').first().text().trim();
    const description = bodyText || $('meta[name="description"]').attr('content')?.trim() || '';

    // Inget maskinläsbart <time datetime>, bara fri text i en
    // nyckel/värde-lista (.c-articlemeta__list__item__key + ...__value) —
    // "Start": "tisdag 25 augusti 2026", "Tid": "17:30 - 20:00". Skickas
    // vidare som text-hint (samma mönster som Ludvika i html-scraper.ts) så
    // AI-parsern (callAI, som redan får ett referensdatum) löser upp det,
    // istället för att vi försöker datum-parsa svensk fritext själva.
    const metaValue = (key: string): string => {
      let value = '';
      $('.c-articlemeta__list__item').each((_i, item) => {
        const $item = $(item);
        if ($item.find('.c-articlemeta__list__item__key').first().text().trim() === key) {
          value = $item.find('.c-articlemeta__list__item__value').first().text().trim().replace(/\s+/g, ' ');
        }
      });
      return value;
    };
    const start = metaValue('Start');
    const tid = metaValue('Tid');
    const dateHint = [start, tid].filter(Boolean).join(', kl. ');

    return {
      title,
      description: dateHint ? `${description}\nDatum/tid: ${dateHint}` : description,
      startTime: '',
      location: 'Dalarna', // ingen egen platsrubrik i denna mall, bara i löptexten
      url,
      sourceName: 'Studiefrämjandet Dalarna',
    };
  } catch (error) {
    console.error(`Studieframjandet-event-skrapning misslyckades för ${url}:`, error);
    return null;
  }
}

export function detailPageAdapterFor(url: string): ((url: string) => Promise<ScrapedEvent | null>) | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  if (hostname.endsWith('abf.se')) return extractAbfCourse;
  if (hostname.endsWith('studieframjandet.se')) return extractStudieframjandetEvent;
  return null;
}
