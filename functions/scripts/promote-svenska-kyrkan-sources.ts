// Kopierar de 20 församlingarna (candidate-sources, type:'kyrka',
// source:'svenska-kyrkan-sok-forsamling') till "sources"-collectionen som
// riktiga, aktiverade ingestion-källor — method:'svenska-kyrkan-calendar',
// med externalIds.ownerId vidarebefordrat (samma unitId som UnitAPI-
// harvestern satte, och som CalendarAPI:s owner_id-filter förväntar sig).
// Enda "quality-filter"-avvägningen (kontrast mot RSS-kandidaterna, se
// candidate-sources status): CalendarAPI är en riktig dedikerad kalender
// för samtliga 20, så alla aktiveras direkt — ingen A/B/C-gradering behövs
// här som för de allmänna nyhetsflödena.
import * as admin from 'firebase-admin';
import { getCandidateSources } from '../src/candidate-sources';

admin.initializeApp();

async function main() {
  const candidates = await getCandidateSources();
  const churches = candidates.filter(
    (c) => c.type === 'kyrka' && c.source === 'svenska-kyrkan-sok-forsamling' && c.externalIds?.ownerId
  );

  console.log(`Hittade ${churches.length} församlingar med ownerId att promota.`);

  const batch = admin.firestore().batch();
  for (const church of churches) {
    batch.set(
      admin.firestore().collection('sources').doc(church.id),
      {
        name: church.name,
        url: church.url,
        region: church.region,
        method: 'svenska-kyrkan-calendar',
        enabled: true,
        externalIds: { ownerId: church.externalIds!.ownerId },
      },
      { merge: true }
    );
  }
  await batch.commit();

  console.log(`Skrev ${churches.length} källor till "sources".`);
}

main().catch((err) => {
  console.error('promote-svenska-kyrkan-sources.ts kraschade:', err);
  process.exitCode = 1;
});
