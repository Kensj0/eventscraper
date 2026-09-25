// DEL 1, Steg 3 av källupptäckten: läser region-databases (Steg 2 — källor
// som listar MÅNGA organisationer, se functions/src/region-databases.ts)
// och kör en harvester per databas för att extrahera enskilda organisationer
// med namn + webbadress, som sedan skrivs till candidate-sources (Steg 1,
// functions/src/candidate-sources.ts). Ersätter den tidigare hårdkodade
// 20-organisationers-listan — de 20 finns kvar orörda i Firestore, bara
// själva scriptets sätt att HITTA nya organisationer har bytts ut.
//
// Harvestrarna själva (en per region-database-id) lever i
// functions/src/org-harvesters.ts — se den filen för API-detaljer och
// medvetna kvalitetsavvägningar per källa. En region-database utan
// matchande harvester loggas som "ingen harvester implementerad än" istället
// för att tyst hoppas över — se rapport till Kenny för vilka som återstår
// (RF-SISU, studieförbunden, Dalabiblioteken, m.fl.).
import * as admin from 'firebase-admin';
import { getRegionDatabases } from '../src/region-databases';
import { upsertCandidateSources } from '../src/candidate-sources';
import { HARVESTERS } from '../src/org-harvesters';

admin.initializeApp({ projectId: 'eventscraper-f0588' });

async function main() {
  const databases = await getRegionDatabases('Dalarna');
  console.log(`Väckte ${databases.length} region-databases för Dalarna.`);

  let totalHarvested = 0;
  let totalAdded = 0;
  let totalUpdated = 0;
  const perDatabase: Record<string, number> = {};
  const noHarvester: string[] = [];
  const failed: string[] = [];

  for (const database of databases) {
    const harvester = HARVESTERS[database.id];
    if (!harvester) {
      noHarvester.push(database.name);
      continue;
    }

    let orgs;
    try {
      orgs = await harvester(database);
    } catch (err) {
      console.error(`Harvester för ${database.name} (${database.id}) kraschade:`, err);
      failed.push(database.name);
      continue;
    }

    perDatabase[database.name] = orgs.length;
    totalHarvested += orgs.length;

    if (orgs.length > 0) {
      const { added, updated } = await upsertCandidateSources(
        orgs.map((org) => ({ ...org, region: 'Dalarna', source: database.id }))
      );
      totalAdded += added;
      totalUpdated += updated;
    }
  }

  console.log(`Totalt hittade organisationer: ${totalHarvested} (${totalAdded} nya, ${totalUpdated} redan kända).`);
  console.log('Per databas:', perDatabase);
  if (noHarvester.length > 0) {
    console.log(`Ingen harvester implementerad än för: ${noHarvester.join(', ')}`);
  }
  if (failed.length > 0) {
    console.log(`Harvester kraschade för: ${failed.join(', ')}`);
  }
}

main().catch((err) => {
  console.error('discover-organizations.ts kraschade:', err);
  process.exitCode = 1;
});
