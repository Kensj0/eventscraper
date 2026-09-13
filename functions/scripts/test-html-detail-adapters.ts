// Manuellt test (inte del av CI) av extractAbfCourse/extractStudieframjandetEvent
// mot riktiga live-sidor innan HTML-adaptern kopplas in i produktionsflödet.
import { extractAbfCourse, extractStudieframjandetEvent } from '../src/html-detail-adapters';

const ABF_URLS = [
  'https://www.abf.se/dalarna/kurs/anhorigtraffar-3946022/',
  'https://www.abf.se/dalarna/kurs/vill-du-lara-dig-beskara-frukttrad-3945504/',
  'https://www.abf.se/dalarna/kurs/brickbandsvavning-3947157/',
];

const SF_URLS = [
  'https://www.studieframjandet.se/dalarnas-lan/gustav-arrangemang/kalenderhandelser/2026/augusti/slojdtraffar/',
  'https://www.studieframjandet.se/dalarnas-lan/gustav-arrangemang/kurser/2026/september/valpkurs---falu-bk-/',
  'https://www.studieframjandet.se/dalarnas-lan/gustav-arrangemang/kalenderhandelser/2026/oktober/bildvisning-faglar-/',
];

async function main() {
  for (const url of ABF_URLS) {
    console.log('ABF:', JSON.stringify(await extractAbfCourse(url), null, 2));
  }
  for (const url of SF_URLS) {
    console.log('Studieframjandet:', JSON.stringify(await extractStudieframjandetEvent(url), null, 2));
  }
}

main().catch((err) => {
  console.error('test-html-detail-adapters.ts kraschade:', err);
  process.exitCode = 1;
});
