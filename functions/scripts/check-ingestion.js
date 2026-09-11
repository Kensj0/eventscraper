// Läser senaste RSS-ingestion-loggen från Firestore (skriven av
// logIngestionRun i src/index.ts) och letar efter anomalier. Körs från
// .github/workflows/check-ingestion.yml med GOOGLE_APPLICATION_CREDENTIALS
// satt till en service account-nyckel (samma som deploy.yml använder).
//
// Om något ser fel ut: skriver en rapport till GITHUB_STEP_SUMMARY och
// avslutar med exitcode 1, så att GitHub Actions egna
// misslyckad-körning-notis (e-post) skickas — ingen extra
// email-integration behövs.
const fs = require('fs');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minuter

function evaluateAnomalies(log) {
  const anomalies = [];

  if (log.processed === 0) {
    anomalies.push('processed === 0 (inga event sparades den här körningen)');
  }
  if (log.skipped > log.processed) {
    anomalies.push(`skipped (${log.skipped}) > processed (${log.processed})`);
  }
  if ((log.errors || []).length > 0) {
    anomalies.push(`${log.errors.length} fel loggade under körningen`);
  }
  if (typeof log.duration_ms === 'number' && log.duration_ms > MAX_DURATION_MS) {
    anomalies.push(`körningen tog ${(log.duration_ms / 1000).toFixed(0)}s (> 5 minuter)`);
  }
  if ((log.duplicateUrlsWithinRun || 0) > 0) {
    anomalies.push(
      `${log.duplicateUrlsWithinRun} URL(er) förekom mer än en gång i samma körning`
    );
  }
  if ((log.sourcesFailed || []).length > 0) {
    anomalies.push(`${log.sourcesFailed.length} källa/källor kunde inte processas: ${log.sourcesFailed.join(', ')}`);
  }

  return anomalies;
}

function recommend(log, anomalies) {
  const text = anomalies.join(' ');
  const tips = [];

  if (/processed === 0/.test(text) || /fel loggade/.test(text)) {
    tips.push(
      '- Kontrollera att ANTHROPIC_API_KEY (eller OPENAI_API_KEY) faktiskt är satt som GitHub Secret och skrivs till functions/.env vid deploy.'
    );
  }
  if (/URL\(er\) förekom/.test(text)) {
    tips.push('- Granska käll-datan (RSS-feed/scraper) för dubbletter, och isDuplicate()-logiken i index.ts.');
  }
  if (/> 5 minuter/.test(text)) {
    tips.push('- Överväg att sänka MAX_ITEMS_PER_RUN eller undersök varför AI-anropen tar ovanligt lång tid.');
  }
  if (/källa\/källor kunde inte processas/.test(text)) {
    tips.push('- Kontrollera att käll-URL:erna fortfarande fungerar och att ingen HTML-struktur/RSS-format ändrats.');
  }
  if (tips.length === 0) {
    tips.push('- Se loggen ovan för detaljer.');
  }

  if ((log.api_usage || {}).calls === 0 && log.processed === 0) {
    tips.push('- api_usage.calls är 0 — inga AI-anrop gjordes alls, sannolikt inte en AI-relaterad orsak.');
  }

  return tips.join('\n');
}

function writeSummary(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  }
}

async function main() {
  // Enkel orderBy (inget where) så ingen composite index behövs — vi letar
  // upp den senaste RSS-loggen bland de senaste posterna i klientkod istället.
  const snapshot = await db
    .collection('ingestion_logs')
    .orderBy('timestamp', 'desc')
    .limit(5)
    .get();

  const rssDoc = snapshot.docs.find((doc) => doc.data().type === 'rss');

  if (!rssDoc) {
    writeSummary(
      '# Ingestion-kontroll\n\n⚠️ Ingen RSS-ingestion-logg hittades alls i `ingestion_logs`. Kördes ingestRSSFeedsManual verkligen, och skrev den en logg?'
    );
    process.exitCode = 1;
    return;
  }

  const log = rssDoc.data();
  const timestamp = log.timestamp && log.timestamp.toDate ? log.timestamp.toDate().toISOString() : 'okänd tid';
  const anomalies = evaluateAnomalies(log);

  const lines = [];
  lines.push('# Ingestion-kontroll');
  lines.push('');
  lines.push(`Körning: ${timestamp} (trigger: ${log.trigger || 'okänd'})`);
  lines.push(`processed=${log.processed} skipped=${log.skipped} duration=${log.duration_ms}ms api_calls=${(log.api_usage || {}).calls}`);
  lines.push('');

  if (anomalies.length === 0) {
    lines.push('✅ Inga anomalier hittades.');
    writeSummary(lines.join('\n'));
    return;
  }

  lines.push('## ⚠️ Anomalier hittade');
  for (const a of anomalies) lines.push(`- ${a}`);
  lines.push('');
  lines.push('## Logg från körningen');
  lines.push('```json');
  lines.push(JSON.stringify(log, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Rekommendation');
  lines.push(recommend(log, anomalies));

  writeSummary(lines.join('\n'));
  process.exitCode = 1;
}

main().catch((err) => {
  writeSummary(`# Ingestion-kontroll\n\n⚠️ check-ingestion.js kraschade: ${err}`);
  process.exitCode = 1;
});
