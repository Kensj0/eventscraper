// Manuellt testskript för HTML-scraperna. Körs lokalt utan emulator/AI-nyckel
// för att snabbt verifiera att varje kommuns scraper faktiskt hämtar riktig
// data. Körs med: npx ts-node src/test-html-scraper.ts
import { scrapeBorlange, scrapeFalun, scrapeLudvika, scrapeRattvik } from './html-scraper';

async function main() {
  const scrapers: Array<[string, () => Promise<unknown[]>]> = [
    ['Borlänge', scrapeBorlange],
    ['Falun', scrapeFalun],
    ['Ludvika', scrapeLudvika],
    ['Rättvik', scrapeRattvik],
  ];

  let totalOk = 0;
  let totalEmpty = 0;

  for (const [name, scraper] of scrapers) {
    console.log(`\n=== ${name} ===`);
    try {
      const events = await scraper();
      console.log(`${events.length} event(s) hittade`);
      console.log(JSON.stringify(events.slice(0, 2), null, 2));
      if (events.length > 0) totalOk++;
      else totalEmpty++;
    } catch (error) {
      console.error(`FEL för ${name}:`, error);
      totalEmpty++;
    }
  }

  console.log(`\nSammanfattning: ${totalOk} källor gav data, ${totalEmpty} gav inget/fel.`);
}

main();
