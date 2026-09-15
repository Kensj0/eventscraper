// Skiljer "event klockan 00:00" från "event vars klockslag vi inte vet".
//
// Bakgrund: AI-parsern ombeds returnera start_time som en ISO-8601-sträng. När
// källan bara anger ett datum ("14 september 2026", en ABF-kurssida utan tid)
// returnerar den rimligtvis "2026-09-14" eller "2026-09-14T00:00:00". Båda blir
// 00:00 UTC genom new Date(), vilket renderas som 02:00 svensk sommartid och
// 01:00 vintertid — sajten påstod alltså att ~40 % av utbudet började mitt i
// natten, och skiftet 02:00 → 01:00 vid sommartidens slut den 25 oktober är
// själva kvittot på att det är UTC-midnatt och inte riktiga klockslag.
//
// Tidsstämpeln räknas medvetet INTE om: datumet blir redan rätt i svensk tid
// (Sverige ligger alltid före UTC), och att låta den ligga kvar på dygnets
// början gör att eventet sorteras först på sin dag, vilket är önskvärt. Det är
// bara klockslaget som är påhittat, så det är klockslaget vi flaggar bort.

export function hasExplicitTime(isoValue: string): boolean {
  const value = isoValue.trim();
  if (!value) return false;

  // Rent datum utan tidsdel: "2026-09-14"
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  // Midnatt i valfri skrivning: "...T00:00", "...T00:00:00", "...T00:00:00.000Z",
  // "...T00:00:00+02:00". Ett genuint midnattsevent förekommer i praktiken inte i
  // det här materialet, och att visa "tid ej angiven" för ett sådant vore ett
  // långt mindre fel än att visa 02:00 för varenda datum-bara kurssida.
  if (/T00:00(:00(\.0+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(value)) return false;

  return true;
}
