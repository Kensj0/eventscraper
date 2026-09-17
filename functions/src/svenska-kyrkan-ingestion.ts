import axios from 'axios';
import * as admin from 'firebase-admin';
import { getEnabledSources, updateSourceStatus, SourceConfig } from './source-config';
import { hasExplicitTime } from './event-time';

// Svenska kyrkans CalendarAPI (se calendarapi.json-specen Kenny delade,
// och org-harvesters.ts:harvestSvenskaKyrkan som populerade
// externalIds.ownerId via UnitAPI) — en RIKTIG dedikerad kalender-API, till
// skillnad från RSS-kandidaternas allmänna nyhets-/bloggflöden (se
// kvalitetsklassificeringen: 0 av 18 RSS-kandidater var en dedikerad
// kalender). owner_id i sökningen är exakt samma värde som UnitAPI:s
// unitId, sparat på source-dokumentets externalIds.ownerId.
const CALENDAR_API_BASE = 'https://svk-apim-prod.azure-api.net/calendar/v1';
const REQUEST_TIMEOUT_MS = 15000;
// Höjd 2026-09-17 från 10: med ~17 aktiva församlingar över CalendarAPI:t
// (en riktig, dedikerad kalender — ingen skrapningskostnad) körde varje
// enda daglig körning i taket, med en dokumenterad kö på 6-62 dubbletter
// plus en helt oräknad svans (loopen bryter direkt vid taket, så allt
// därefter i den varvade listan undersöks inte ens). 10/dag var alltså
// långt under vad källorna faktiskt levererar.
const MAX_EVENTS_PER_RUN = 50;
const EVENTS_PER_OWNER_LIMIT = 20; // CalendarAPI:s "limit"-param, max 50 — gott om marginal per körning

interface CalendarApiEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  place?: { name?: string };
  categories?: Array<{ name?: string }>;
  links?: Array<{ url?: string }>;
}

async function searchEvents(ownerId: string): Promise<CalendarApiEvent[]> {
  const apiKey = process.env.SVENSKA_KYRKAN_CALENDAR_API_KEY;
  if (!apiKey) throw new Error('SVENSKA_KYRKAN_CALENDAR_API_KEY saknas');

  const res = await axios.get(`${CALENDAR_API_BASE}/event/search`, {
    params: {
      owner_id: ownerId,
      from: 'now',
      duration: '90d', // kommande ~3 månader, inte obegränsat framåt
      expand: 'categories,place',
      limit: EVENTS_PER_OWNER_LIMIT,
    },
    headers: { 'Ocp-Apim-Subscription-Key': apiKey },
    timeout: REQUEST_TIMEOUT_MS,
  });
  return (res.data.result as CalendarApiEvent[]) || [];
}

// Godkänt designbeslut från DEL 1 (se del1-source-adapter-design-minnet):
// beskrivningen får ALDRIG sparas ordagrann av juridiska skäl, oavsett hur
// strukturerad källan är — så till skillnad från title/start/location (som
// tas rakt av här, redan strukturerade och inte upphovsrättskänsliga) måste
// description alltid gå genom en AI-omskrivning. Misslyckas det (ingen
// nyckel, AI-fel) returneras null och eventet HOPPAS ÖVER — att falla
// tillbaka på originaltexten hade varit exakt det beslutet förbjuder.
// En tom originalbeskrivning har dock inget ordagrant att skydda, så den
// får passera direkt utan AI-anrop.
async function rewriteDescription(title: string, rawDescription: string): Promise<string | null> {
  if (!rawDescription.trim()) return '';

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Skriv om följande evenemangsbeskrivning med egna ord på svenska, max 2 meningar. Återge INTE originaltexten ordagrant.

Titel: ${title}
Originalbeskrivning: ${rawDescription.substring(0, 500)}

Svara ENDAST med den omskrivna texten, ingen extra formatering eller citattecken.`;

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model: 'claude-haiku-4-5-20251001', max_tokens: 150, messages: [{ role: 'user', content: prompt }] },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );
      const content = response.data.content[0];
      return content.type === 'text' ? content.text.trim() : null;
    } else {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.3 },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );
      const text = response.data.choices[0]?.message?.content;
      return typeof text === 'string' ? text.trim() : null;
    }
  } catch (error) {
    console.error('rewriteDescription misslyckades:', error);
    return null;
  }
}

async function isDuplicateSourceUrl(sourceUrl: string): Promise<boolean> {
  const snapshot = await admin
    .firestore()
    .collection('events')
    .where('sourceUrl', '==', sourceUrl)
    .limit(1)
    .get();
  return !snapshot.empty;
}

// Egen skrivning till ingestion_logs (samma dokumentform som
// index.ts:logIngestionRun) istället för att importera den — index.ts
// importerar den här filen för att koppla in Cloud Functions-exporten, så
// ett omvänt import hade gett en cirkulär modul-referens. Får aldrig
// krascha själva ingestion-körningen om skrivningen misslyckas, samma
// princip som originalet.
async function logIngestionRun(log: {
  type: 'svenska-kyrkan-calendar';
  trigger: 'scheduled' | 'manual';
  processed: number;
  skipped: number;
  errors: string[];
  sources: string[];
  sourcesFailed: string[];
  duration_ms: number;
  api_usage: { calls: number };
  duplicateUrlsWithinRun: number;
}): Promise<void> {
  try {
    await admin
      .firestore()
      .collection('ingestion_logs')
      .add({ ...log, timestamp: admin.firestore.Timestamp.now() });
  } catch (error) {
    console.error('Failed to write ingestion log:', error);
  }
}

export async function runSvenskaKyrkanIngestion(trigger: 'scheduled' | 'manual' = 'manual') {
  const startedAt = Date.now();
  const db = admin.firestore();
  let processed = 0;
  let skipped = 0;
  let aiCallCount = 0;
  let duplicateUrlsWithinRun = 0;
  const errors: string[] = [];
  const sourcesFailed: string[] = [];
  const seenUrls = new Set<string>();

  const sources = await getEnabledSources('svenska-kyrkan-calendar');

  const perSource: Array<{ source: SourceConfig; events: CalendarApiEvent[] }> = [];
  for (const source of sources) {
    const ownerId = source.externalIds?.ownerId;
    if (!ownerId) {
      sourcesFailed.push(source.name);
      errors.push(`${source.name}: saknar externalIds.ownerId`);
      await updateSourceStatus(source.id, { success: false, error: 'Saknar externalIds.ownerId' });
      continue;
    }
    try {
      const events = await searchEvents(ownerId);
      perSource.push({ source, events });
      await updateSourceStatus(source.id, { success: true, eventsFound: events.length });
    } catch (error) {
      sourcesFailed.push(source.name);
      errors.push(`Kunde inte hämta events för ${source.name}: ${error}`);
      await updateSourceStatus(source.id, { success: false, error: String(error) });
    }
  }

  // Varva mellan församlingarna istället för att köra dem i tur och ordning
  // — samma princip som interleave() för RSS/HTML i index.ts, så en enda
  // stor församlings kalender inte äter upp hela körningens budget.
  const interleaved: Array<{ source: SourceConfig; event: CalendarApiEvent }> = [];
  const maxLen = Math.max(0, ...perSource.map((p) => p.events.length));
  for (let i = 0; i < maxLen; i++) {
    for (const p of perSource) {
      if (i < p.events.length) interleaved.push({ source: p.source, event: p.events[i] });
    }
  }

  for (const { source, event } of interleaved) {
    if (processed >= MAX_EVENTS_PER_RUN) break;

    // CalendarAPI ger ingen garanterad publik webbsida per event (till
    // skillnad från RSS/HTML) — links[] är valfri. Ett stabilt syntetiskt
    // id (prefixat så det aldrig krockar med en riktig url) håller
    // isDuplicateSourceUrl fungerande ändå.
    const sourceUrl = event.links?.[0]?.url || `svenska-kyrkan-calendar:${event.id}`;

    if (seenUrls.has(sourceUrl)) duplicateUrlsWithinRun++;
    seenUrls.add(sourceUrl);

    if (await isDuplicateSourceUrl(sourceUrl)) {
      skipped++;
      continue;
    }

    const startDate = new Date(event.start);
    if (isNaN(startDate.getTime())) {
      errors.push(`Ogiltigt start-datum för "${event.title}" (${event.id})`);
      skipped++;
      continue;
    }

    aiCallCount++;
    const description = await rewriteDescription(event.title, event.description || '');
    if (description === null) {
      errors.push(`Kunde inte skriva om beskrivning för "${event.title}" (${source.name}) — hoppar över`);
      skipped++;
      continue;
    }

    try {
      await db.collection('events').add({
        sourceUrl,
        sourceName: source.name,
        title: event.title,
        description,
        startTime: admin.firestore.Timestamp.fromDate(startDate),
        // CalendarAPI:t ger normalt riktiga klockslag, men heldagsposter
        // förekommer — härleds från strängen istället för att antas.
        timeKnown: hasExplicitTime(event.start),
        location: event.place?.name || source.name,
        category: event.categories?.[0]?.name || 'Kyrka',
        createdAt: admin.firestore.Timestamp.now(),
      });
      console.log(`Event saved: ${event.title}`);
      processed++;
    } catch (error) {
      errors.push(`Kunde inte spara event "${event.title}": ${error}`);
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `Svenska kyrkan-ingestion klar. Församlingar: ${sources.length - sourcesFailed.length}/${sources.length} lyckades. Events: ${processed} sparade, ${skipped} överhoppade.`
  );

  await logIngestionRun({
    type: 'svenska-kyrkan-calendar',
    trigger,
    processed,
    skipped,
    errors,
    sources: sources.map((s) => s.name),
    sourcesFailed,
    duration_ms: durationMs,
    api_usage: { calls: aiCallCount },
    duplicateUrlsWithinRun,
  });

  return { processed, skipped, sourcesFailed };
}
