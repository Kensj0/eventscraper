// Läsbar statusrapport över "events"-collectionen i prod — totalt antal,
// hur många har en källlänk (sourceUrl), hur många är framtida, och en
// nedbrytning per källa (sourceName). Skriver bara till stdout, ingen
// skrivning till Firestore — säkert att köra när som helst.
import * as admin from 'firebase-admin';

admin.initializeApp();

async function main() {
  const snapshot = await admin
    .firestore()
    .collection('events')
    .select('sourceName', 'sourceUrl', 'startTime', 'category')
    .get();

  const now = admin.firestore.Timestamp.now();
  let withLink = 0;
  let future = 0;
  const bySource: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const doc of snapshot.docs) {
    const d = doc.data();
    if (d.sourceUrl) withLink++;
    if (d.startTime && d.startTime.toMillis() > now.toMillis()) future++;
    const source = d.sourceName || 'okänd';
    bySource[source] = (bySource[source] || 0) + 1;
    const category = d.category || 'okänd';
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  console.log(`Totalt antal events: ${snapshot.size}`);
  console.log(`Med källlänk (sourceUrl satt): ${withLink}`);
  console.log(`Framtida (startTime > nu): ${future}`);
  console.log('');
  console.log(`Per källa (${Object.keys(bySource).length} unika):`);
  for (const [name, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}`);
  }
  console.log('');
  console.log('Per kategori:');
  for (const [name, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}`);
  }
}

main().catch((err) => {
  console.error('report-live-stats.ts kraschade:', err);
  process.exitCode = 1;
});
