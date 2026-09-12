import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Parser from 'rss-parser';
import axios from 'axios';
import { scrapeBorlange, scrapeFalun, scrapeLudvika, scrapeRattvik, ScrapedEvent } from './html-scraper';
import { getEnabledSources, updateSourceStatus } from './source-config';
import { runSvenskaKyrkanIngestion } from './svenska-kyrkan-ingestion';

admin.initializeApp();
const db = admin.firestore();

interface AIResponse {
  is_event: boolean;
  title: string;
  description: string;
  start_time: string;
  location: string;
  category: string;
}

// Källkonfiguration (RSS-URL:er, HTML-scraper-mål, enabled/disabled) lever
// nu i Firestore-collectionen "sources" — se functions/src/source-config.ts
// och functions/scripts/seed-sources.js för den initiala Dalarna-listan.
// Detta ersätter den tidigare hårdkodade RSS_FEEDS-konstanten så att en
// källa kan stängas av eller få ny URL utan kodändring/deploy.

// HTML-scraperna själva är fortfarande bespoke funktioner per sajt (DEL 1:s
// generiska selector-drivna metod är pausad), så en källas Firestore-id
// måste peka på en registrerad funktion här.
const HTML_SCRAPERS: Record<string, () => Promise<ScrapedEvent[]>> = {
  'borlange-html': scrapeBorlange,
  'falun-html': scrapeFalun,
  'ludvika-html': scrapeLudvika,
  'rattvik-html': scrapeRattvik,
};

const parser = new Parser();
const MAX_ITEMS_PER_RUN = 10;

// Modeller lyder inte alltid instruktionen "no markdown, no code blocks" —
// strippa ```json ... ``` -inramning innan vi parsar.
function parseAIJson(raw: string): AIResponse | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('Failed to parse AI response as JSON:', raw);
    return null;
  }
}

async function callAI(title: string, description: string, referenceDate?: string): Promise<AIResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('No AI API key configured');
    return null;
  }

  // Utan ett referensdatum kan modellen inte lösa upp datum utan angivet år
  // ("10 september", "Alzheimerdagen") till ett riktigt ISO-datum — och gör
  // rätt i att vägra gissa år, vilket gav start_time: null/"" på annars
  // giltiga event. referenceDate är RSS-postens pubDate när den finns,
  // annars servertiden.
  const effectiveReferenceDate = referenceDate || new Date().toISOString();

  const prompt = `You are an event parser. Analyze the following text and determine if it describes a specific event with a date/time and location.

Reference date (when this text was published/scraped): ${effectiveReferenceDate}
If the text gives a date without a year (e.g. "10 september", or an annual observance like "Alzheimerdagen"), resolve it to the nearest occurrence on or after the reference date — never leave start_time empty just because the year is implicit.

Title: ${title}
Description: ${description.substring(0, 500)}

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "is_event": boolean,
  "title": "string",
  "description": "max 2 sentences summary in Swedish",
  "start_time": "ISO-8601 string",
  "location": "string",
  "category": "string (e.g., Konsert, Teater, Sport, Konferens, Utställning, Workshop, Övrigt)"
}`;

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      // Use Anthropic Claude
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );

      const content = response.data.content[0];
      if (content.type === 'text') {
        return parseAIJson(content.text);
      }
      return null;
    } else {
      // Use OpenAI
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return parseAIJson(response.data.choices[0].message.content);
    }
  } catch (error) {
    console.error('AI API call failed:', error);
    return null;
  }
}

// AI:n returnerar inte alltid ett giltigt ISO-8601-värde för start_time.
// new Date(...) av en trasig sträng ger inte ett fel — bara ett "Invalid
// Date" som tyst blir 1970-01-01 när det skrivs till Firestore. Validera
// innan vi sparar istället för att låta skräpdatum in i databasen.
function parseValidDate(value: unknown): Date | null {
  // new Date(null) / new Date(undefined) coerce to epoch instead of
  // NaN, so a missing/null start_time from the AI would otherwise slip
  // past an isNaN check and silently save as 1970-01-01.
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

// Round-robin genom flera listor så en källa med många träffar inte äter upp
// hela MAX_ITEMS_PER_RUN innan de andra källorna får bidra alls.
function interleave<T>(lists: T[][]): T[] {
  const result: T[] = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (i < list.length) result.push(list[i]);
    }
  }
  return result;
}

async function isDuplicate(sourceUrl: string): Promise<boolean> {
  const snapshot = await db
    .collection('events')
    .where('sourceUrl', '==', sourceUrl)
    .limit(1)
    .get();
  return !snapshot.empty;
}

interface IngestionLogData {
  type: 'rss' | 'html';
  trigger: 'scheduled' | 'manual';
  processed: number;
  skipped: number;
  errors: string[];
  sources: string[];
  sourcesFailed: string[];
  duration_ms: number;
  api_usage: { calls: number };
  duplicateUrlsWithinRun: number;
}

// Skriver en post per körning till ingestion_logs, för monitoring/alerting
// (se .github/workflows/check-ingestion.yml). Får aldrig krascha själva
// ingestion-körningen om skrivningen misslyckas.
async function logIngestionRun(log: IngestionLogData): Promise<void> {
  try {
    await db.collection('ingestion_logs').add({
      ...log,
      timestamp: admin.firestore.Timestamp.now(),
    });
  } catch (error) {
    console.error('Failed to write ingestion log:', error);
  }
}

// Ingestion kan ta ett tag med 10 sekventiella AI-anrop — default Cloud
// Functions-timeout är 60s, vilket ligger under vår egen 5-minuters
// anomali-gräns (se check-ingestion.yml). Höj till 300s så en långsam men
// frisk körning inte hinner dödas av plattformen innan den ens loggas.
const INGESTION_RUNTIME_OPTS = { timeoutSeconds: 300 };

// Scheduled trigger (daily at 2 AM)
export const ingestRSSFeeds = functions
  .region('europe-west1')
  .runWith(INGESTION_RUNTIME_OPTS)
  .pubsub.schedule('0 2 * * *') // Daily at 2 AM Stockholm time
  .timeZone('Europe/Stockholm')
  .onRun(async () => {
    return await runIngestion('scheduled');
  });

// HTTP trigger for manual testing
export const ingestRSSFeedsManual = functions
  .region('europe-west1')
  .runWith(INGESTION_RUNTIME_OPTS)
  .https.onRequest(async (req, res) => {
    // Basic auth check (use ?key=your-secret-key)
    const key = req.query.key || req.body.key;
    if (key !== process.env.INGEST_SECRET_KEY && key !== 'test-local') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await runIngestion('manual');
    res.status(200).json(result);
  });

// HTTP trigger for manual testing of the HTML scrapers
export const scrapeHTMLSources = functions
  .region('europe-west1')
  .runWith(INGESTION_RUNTIME_OPTS)
  .https.onRequest(async (req, res) => {
    const key = req.query.key || req.body.key;
    if (key !== process.env.INGEST_SECRET_KEY && key !== 'test-local') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await runHTMLIngestion();
    res.status(200).json(result);
  });

// Scheduled trigger (daily at 3 AM, en timme efter RSS/HTML så de inte
// tävlar om samma Cloud Functions-instans-kvot)
export const ingestSvenskaKyrkanEvents = functions
  .region('europe-west1')
  .runWith(INGESTION_RUNTIME_OPTS)
  .pubsub.schedule('0 3 * * *')
  .timeZone('Europe/Stockholm')
  .onRun(async () => {
    return await runSvenskaKyrkanIngestion('scheduled');
  });

// HTTP trigger for manual testing
export const ingestSvenskaKyrkanEventsManual = functions
  .region('europe-west1')
  .runWith(INGESTION_RUNTIME_OPTS)
  .https.onRequest(async (req, res) => {
    const key = req.query.key || req.body.key;
    if (key !== process.env.INGEST_SECRET_KEY && key !== 'test-local') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await runSvenskaKyrkanIngestion('manual');
    res.status(200).json(result);
  });

// Shared HTML-scraping ingestion logic — samma AI-parsing/dedup-pipeline som RSS.
// Exporteras (utöver att användas av scrapeHTMLSources ovan) så den kan
// testas direkt med ett litet Node-skript utan att gå via functions-emulatorn.
export async function runHTMLIngestion() {
  const startedAt = Date.now();
  let processedCount = 0;
  let itemsSkipped = 0;
  let aiCallCount = 0;
  let duplicateUrlsWithinRun = 0;
  const errors: string[] = [];
  const sourcesFailed: string[] = [];
  const seenUrls = new Set<string>();
  const sourceNamesAttempted = new Set<string>();

  const htmlSources = await getEnabledSources('html');

  const scraperRuns = await Promise.allSettled(
    htmlSources.map((source) => {
      const scraper = HTML_SCRAPERS[source.id];
      if (!scraper) {
        return Promise.reject(new Error(`No scraper registered for source id "${source.id}"`));
      }
      return scraper();
    })
  );

  const perSourceEvents: ScrapedEvent[][] = [];
  for (let i = 0; i < scraperRuns.length; i++) {
    const run = scraperRuns[i];
    const source = htmlSources[i];
    if (run.status === 'fulfilled') {
      perSourceEvents.push(run.value);
      for (const event of run.value) sourceNamesAttempted.add(event.sourceName);
      await updateSourceStatus(source.id, { success: true, eventsFound: run.value.length });
    } else {
      const msg = `HTML scraper failed for ${source.name} (${source.id}): ${run.reason}`;
      console.error(msg);
      errors.push(msg);
      sourcesFailed.push(source.name);
      await updateSourceStatus(source.id, { success: false, error: String(run.reason) });
    }
  }

  // Varva källorna istället för att lägga dem efter varandra — annars äter
  // Borlänge+Falun (16 event tillsammans) upp hela MAX_ITEMS_PER_RUN innan
  // Ludvika eller Rättvik någonsin hinner bidra med ett enda event.
  const scrapedEvents = interleave(perSourceEvents);

  for (const event of scrapedEvents.slice(0, MAX_ITEMS_PER_RUN)) {
    if (!event.url) {
      itemsSkipped++;
      continue;
    }

    if (seenUrls.has(event.url)) duplicateUrlsWithinRun++;
    seenUrls.add(event.url);

    if (await isDuplicate(event.url)) {
      console.log(`Duplicate skipped: ${event.url}`);
      itemsSkipped++;
      continue;
    }

    const descriptionWithHints = event.startTime
      ? `${event.description}\nDatum/tid: ${event.startTime}\nPlats: ${event.location}`
      : `${event.description}\nPlats: ${event.location}`;

    aiCallCount++;
    const aiResult = await callAI(event.title, descriptionWithHints);
    if (!aiResult) {
      const msg = `AI call failed for "${event.title}" (${event.sourceName})`;
      console.error(msg);
      errors.push(msg);
      itemsSkipped++;
      continue;
    }
    if (!aiResult.is_event) {
      console.log(`Not an event: ${event.title}`);
      itemsSkipped++;
      continue;
    }

    const startDate = parseValidDate(aiResult.start_time);
    if (!startDate) {
      const msg = `Invalid start_time from AI for "${event.title}": "${aiResult.start_time}"`;
      console.warn(msg);
      errors.push(msg);
      itemsSkipped++;
      continue;
    }

    try {
      await db.collection('events').add({
        sourceUrl: event.url,
        sourceName: event.sourceName,
        title: aiResult.title,
        description: aiResult.description,
        startTime: admin.firestore.Timestamp.fromDate(startDate),
        location: aiResult.location,
        category: aiResult.category,
        createdAt: admin.firestore.Timestamp.now(),
      });
      console.log(`Event saved: ${aiResult.title}`);
      processedCount++;
    } catch (error) {
      const msg = `Failed to save event "${aiResult.title}": ${error}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `HTML ingestion complete. Events processed: ${processedCount}, Skipped: ${itemsSkipped}, Failed sources: ${sourcesFailed.length}`
  );

  await logIngestionRun({
    type: 'html',
    trigger: 'manual',
    processed: processedCount,
    skipped: itemsSkipped,
    errors,
    sources: Array.from(sourceNamesAttempted),
    sourcesFailed,
    duration_ms: durationMs,
    api_usage: { calls: aiCallCount },
    duplicateUrlsWithinRun,
  });

  return { processed: processedCount, skipped: itemsSkipped, sourcesFailed };
}

// Shared ingestion logic
async function runIngestion(trigger: 'scheduled' | 'manual') {
    const startedAt = Date.now();
    let processedCount = 0;
    let itemsSkipped = 0;
    let feedsProcessed = 0;
    let feedsFailed = 0;
    let aiCallCount = 0;
    let duplicateUrlsWithinRun = 0;
    const errors: string[] = [];
    const sourcesFailed: string[] = [];
    const seenUrls = new Set<string>();

    const rssSources = await getEnabledSources('rss');

    for (const feed of rssSources) {
      let eventsFoundThisFeed = 0;
      try {
        console.log(`Processing feed: ${feed.name} (${feed.url})`);
        const rss = await parser.parseURL(feed.url);
        feedsProcessed++;

        for (const item of rss.items.slice(0, MAX_ITEMS_PER_RUN)) {
          if (processedCount >= MAX_ITEMS_PER_RUN) break;

          const sourceUrl = item.link || '';
          if (!sourceUrl) {
            itemsSkipped++;
            continue;
          }

          if (seenUrls.has(sourceUrl)) duplicateUrlsWithinRun++;
          seenUrls.add(sourceUrl);

          // Check for duplicate
          if (await isDuplicate(sourceUrl)) {
            console.log(`Duplicate skipped: ${sourceUrl}`);
            itemsSkipped++;
            continue;
          }

          // Call AI to parse event
          aiCallCount++;
          const aiResult = await callAI(
            item.title || '',
            item.content || item.summary || '',
            item.pubDate || item.isoDate
          );
          if (!aiResult) {
            const msg = `AI call failed for "${item.title}" (${feed.name})`;
            console.error(msg);
            errors.push(msg);
            itemsSkipped++;
            continue;
          }
          if (!aiResult.is_event) {
            console.log(`Not an event: ${item.title}`);
            itemsSkipped++;
            continue;
          }

          const startDate = parseValidDate(aiResult.start_time);
          if (!startDate) {
            const msg = `Invalid start_time from AI for "${item.title}": "${aiResult.start_time}"`;
            console.warn(msg);
            errors.push(msg);
            itemsSkipped++;
            continue;
          }

          // Save to Firestore
          try {
            await db.collection('events').add({
              sourceUrl,
              sourceName: feed.name,
              title: aiResult.title,
              description: aiResult.description,
              startTime: admin.firestore.Timestamp.fromDate(startDate),
              location: aiResult.location,
              category: aiResult.category,
              createdAt: admin.firestore.Timestamp.now(),
            });
            console.log(`Event saved: ${aiResult.title}`);
            processedCount++;
            eventsFoundThisFeed++;
          } catch (error) {
            const msg = `Failed to save event "${aiResult.title}": ${error}`;
            console.error(msg);
            errors.push(msg);
          }
        }

        await updateSourceStatus(feed.id, { success: true, eventsFound: eventsFoundThisFeed });
      } catch (error) {
        const msg = `Failed to process feed ${feed.name}: ${error}`;
        console.error(msg);
        errors.push(msg);
        sourcesFailed.push(feed.name);
        feedsFailed++;
        await updateSourceStatus(feed.id, { success: false, error: String(error) });
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(`Ingestion complete. Feeds: ${feedsProcessed}/${rssSources.length} success. Events processed: ${processedCount}, Skipped: ${itemsSkipped}`);

    await logIngestionRun({
      type: 'rss',
      trigger,
      processed: processedCount,
      skipped: itemsSkipped,
      errors,
      sources: rssSources.map((f) => f.name),
      sourcesFailed,
      duration_ms: durationMs,
      api_usage: { calls: aiCallCount },
      duplicateUrlsWithinRun,
    });

    return { processed: processedCount, skipped: itemsSkipped, feeds: { success: feedsProcessed, failed: feedsFailed } };
}
