import axios from 'axios';
import * as admin from 'firebase-admin';
import { getEnabledSources, updateSourceStatus } from './source-config';
import { hasExplicitTime } from './event-time';
import { rewriteDescription } from './description-rewriter';

// dethanderidalarna.se är i sig en Dalarna-eventaggregator (byggd på Supabase),
// utan publikt dokumenterat API. SUPABASE_ANON_KEY nedan är INTE en hemlighet
// — Supabase-appens egen JS-bundle skickar samma anon-nyckel till varje
// besökares webbläsare (rollen "anon" i JWT-payloaden), det är hela poängen
// med en anon-nyckel. Hittad genom att läsa den publikt levererade bundlen,
// inte genom att kringgå någon autentisering. Kenny godkände explicit att
// bygga mot den 2026-09-26, medveten om att det är odokumenterad åtkomst
// (ingen ToS, kan sluta fungera utan förvarning om de stramar åt RLS eller
// roterar nyckeln — hanteras då som vilken annan trasig källa som helst,
// via updateSourceStatus/lastError).
const SUPABASE_URL = 'https://kmtzosutghdcfelpzcol.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttdHpvc3V0Z2hkY2ZlbHB6Y29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMTI2MTgsImV4cCI6MjA5Mjc4ODYxOH0.4t1ofvvVJKwsZSOexQIMaIRqY57ZMaVm549VhazSBGs';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_EVENTS_PER_RUN = 50;

interface DethanderEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  location: string | null;
  municipality: string | null;
  category: string | null;
  organizer: string | null;
  source_name: string | null;
}

async function fetchUpcomingEvents(): Promise<DethanderEvent[]> {
  const nowIso = new Date().toISOString();
  const res = await axios.get(`${SUPABASE_URL}/rest/v1/events`, {
    params: {
      select: 'id,title,description,starts_at,location,municipality,category,organizer,source_name',
      is_published: 'eq.true',
      starts_at: `gte.${nowIso}`,
      order: 'starts_at.asc',
      limit: MAX_EVENTS_PER_RUN,
    },
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    timeout: REQUEST_TIMEOUT_MS,
  });
  return (res.data as DethanderEvent[]) || [];
}

async function isDuplicateExternalId(externalId: string): Promise<boolean> {
  const snapshot = await admin
    .firestore()
    .collection('events')
    .where('externalId', '==', externalId)
    .limit(1)
    .get();
  return !snapshot.empty;
}

async function logIngestionRun(log: {
  type: 'dethander-dalarna';
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

export async function runDethanderIngestion(trigger: 'scheduled' | 'manual' = 'manual') {
  const startedAt = Date.now();
  const db = admin.firestore();
  let processed = 0;
  let skipped = 0;
  let aiCallCount = 0;
  let duplicateUrlsWithinRun = 0;
  const errors: string[] = [];
  const sourcesFailed: string[] = [];
  const seenIds = new Set<string>();

  // Precis en källa i praktiken (samma "sources"-mönster som Svenska kyrkan
  // ändå), så SourceManager/ScrapingPanel kan visa/pausa den som alla andra.
  const sources = await getEnabledSources('dethander-dalarna');
  if (sources.length === 0) {
    return { processed: 0, skipped: 0, sourcesFailed: [] };
  }
  const source = sources[0];

  let events: DethanderEvent[];
  try {
    events = await fetchUpcomingEvents();
    await updateSourceStatus(source.id, { success: true, eventsFound: events.length });
  } catch (error) {
    sourcesFailed.push(source.name);
    errors.push(`Kunde inte hämta events från dethanderidalarna.se: ${error}`);
    await updateSourceStatus(source.id, { success: false, error: String(error) });
    events = [];
  }

  for (const event of events) {
    if (processed >= MAX_EVENTS_PER_RUN) break;

    const externalId = `dethander-dalarna:${event.id}`;
    // Alltid en riktig, klickbar sida på dethanderidalarna.se — till skillnad
    // från deras egen source_url (pekar på originalarrangören, t.ex.
    // leksandsif.se, som kan vara trasig/inaktuell). Samma lärdom som
    // Svenska kyrkan-fixet: dedupe-id och visningslänk hålls isär.
    const sourceUrl = `https://dethanderidalarna.se/event/${event.id}`;

    if (seenIds.has(externalId)) duplicateUrlsWithinRun++;
    seenIds.add(externalId);

    if (await isDuplicateExternalId(externalId)) {
      skipped++;
      continue;
    }

    const startDate = new Date(event.starts_at);
    if (isNaN(startDate.getTime())) {
      errors.push(`Ogiltigt start-datum för "${event.title}" (${event.id})`);
      skipped++;
      continue;
    }

    aiCallCount++;
    const description = await rewriteDescription(event.title, event.description || '');
    if (description === null) {
      errors.push(`Kunde inte skriva om beskrivning för "${event.title}" — hoppar över`);
      skipped++;
      continue;
    }

    try {
      await db.collection('events').add({
        sourceUrl,
        externalId,
        sourceName: event.organizer || event.source_name || 'Det händer i Dalarna',
        title: event.title,
        description,
        startTime: admin.firestore.Timestamp.fromDate(startDate),
        timeKnown: hasExplicitTime(event.starts_at),
        location: event.location || event.municipality || 'Dalarna',
        category: event.category || 'Övrigt',
        createdAt: admin.firestore.Timestamp.now(),
      });
      console.log(`Event saved: ${event.title}`);
      processed++;
    } catch (error) {
      errors.push(`Kunde inte spara event "${event.title}": ${error}`);
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(`Det händer i Dalarna-ingestion klar. Events: ${processed} sparade, ${skipped} överhoppade.`);

  await logIngestionRun({
    type: 'dethander-dalarna',
    trigger,
    processed,
    skipped,
    errors,
    sources: [source.name],
    sourcesFailed,
    duration_ms: durationMs,
    api_usage: { calls: aiCallCount },
    duplicateUrlsWithinRun,
  });

  return { processed, skipped, sourcesFailed };
}
