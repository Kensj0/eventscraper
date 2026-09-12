import axios from 'axios';
import * as cheerio from 'cheerio';
import { SourceMethod } from './source-config';

// DEL 2 av källupptäckten: avgör om en candidate-source faktiskt går att
// mata in via befintliga metoder (JSON-LD → iCal → RSS → HTML, samma
// fallback-ordning som var tänkt för DEL 1:s pausade adapter-kedja, se
// del1-source-adapter-design-minnet). Testar EN sida per kandidat och letar
// efter riktiga, verifierbara signaler — ingen gissning: en påstådd iCal-
// eller RSS-länk hämtas alltid på riktigt och kontrolleras innehålla
// BEGIN:VCALENDAR respektive en <rss>/<feed>-rot innan den godkänns.
//
// 'html' ingår MEDVETET INTE som ett automatiskt positivt resultat här —
// HTML-skrapning kräver selectors (se SourceConfig.selectors) som bara en
// människa kan sätta rimligt (vilken CSS-klass är titeln? datumet?). En
// kandidat utan jsonld/ical/rss returneras därför som `null`, inte 'html'.

const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; EventScraperDalarna/1.0)' };
const HTTP_TIMEOUT_MS = 15000;

export interface CapabilityResult {
  method: Extract<SourceMethod, 'jsonld' | 'ical' | 'rss'>;
  feedUrl?: string;
}

export async function testCapability(url: string): Promise<CapabilityResult | null> {
  let html: string;
  try {
    const res = await axios.get(url, {
      headers: REQUEST_HEADERS,
      timeout: HTTP_TIMEOUT_MS,
      validateStatus: () => true,
    });
    if (res.status !== 200 || typeof res.data !== 'string') return null;
    html = res.data;
  } catch {
    return null;
  }

  const $ = cheerio.load(html);

  const jsonLdBlocks = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).contents().text())
    .get();
  if (jsonLdBlocks.some(containsEventType)) {
    return { method: 'jsonld' };
  }

  const icalHref = $('link[type="text/calendar"]').attr('href') || $('a[href$=".ics"]').first().attr('href');
  if (icalHref) {
    const feedUrl = new URL(icalHref, url).toString();
    if (await verifyIcalFeed(feedUrl)) return { method: 'ical', feedUrl };
  }

  const rssHref =
    $('link[type="application/rss+xml"]').attr('href') || $('link[type="application/atom+xml"]').attr('href');
  if (rssHref) {
    const feedUrl = new URL(rssHref, url).toString();
    if (await verifyRssFeed(feedUrl)) return { method: 'rss', feedUrl };
  }

  return null;
}

function containsEventType(jsonText: string): boolean {
  try {
    return jsonNodeHasEventType(JSON.parse(jsonText));
  } catch {
    // Trasig/icke-standard JSON (vanligt i handskriven JSON-LD) — fall
    // tillbaka på en textmatchning istället för att ge upp helt.
    return /"@type"\s*:\s*"Event"/.test(jsonText);
  }
}

function jsonNodeHasEventType(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(jsonNodeHasEventType);
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const type = obj['@type'];
    if (type === 'Event' || (Array.isArray(type) && type.includes('Event'))) return true;
    if (obj['@graph']) return jsonNodeHasEventType(obj['@graph']);
    return false;
  }
  return false;
}

async function verifyIcalFeed(feedUrl: string): Promise<boolean> {
  try {
    const res = await axios.get(feedUrl, {
      headers: REQUEST_HEADERS,
      timeout: HTTP_TIMEOUT_MS,
      validateStatus: () => true,
    });
    return res.status === 200 && typeof res.data === 'string' && res.data.includes('BEGIN:VCALENDAR');
  } catch {
    return false;
  }
}

async function verifyRssFeed(feedUrl: string): Promise<boolean> {
  try {
    const res = await axios.get(feedUrl, {
      headers: REQUEST_HEADERS,
      timeout: HTTP_TIMEOUT_MS,
      validateStatus: () => true,
    });
    return (
      res.status === 200 && typeof res.data === 'string' && (/<rss[\s>]/.test(res.data) || /<feed[\s>]/.test(res.data))
    );
  } catch {
    return false;
  }
}
