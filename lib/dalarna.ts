// Dalarnas 15 kommuner, för ortsväljaren i SearchBar.
//
// Varför alias-tabellen finns: bara ungefär 60 % av eventens `location` innehåller
// faktiskt ett kommunnamn. Resten är bara ett lokalnamn — "Brittgården",
// "Grangärde kyrka", "Tandådalens fjällkyrka", "Stefansgården". En kommunväljare
// som bara substring-matchade `location` mot kommunnamnet hade därför tyst dolt
// stora delar av utbudet och fått kommuner att se tomma ut, vilket är värre än
// fritextfältet den ersätter (en dropdown lovar fullständighet på ett sätt som ett
// fritextfält inte gör).
//
// Två saker täcker upp det:
//   1. Varje kommun matchas även mot sina tätorter/kyrkbyar (Grangärde → Ludvika).
//   2. Matchningen görs mot `location` + `sourceName`, eftersom källnamnet nästan
//      alltid bär orten när platsen inte gör det ("Älvdalens församling",
//      "Rättvik Kommun", "Hedemora, Husby och Garpenbergs församling").
//
// Genitiv-s behöver inga egna alias — "Älvdalens församling" innehåller redan
// "Älvdalen" som delsträng.

export const DALARNA_MUNICIPALITIES = [
  'Avesta',
  'Borlänge',
  'Falun',
  'Gagnef',
  'Hedemora',
  'Leksand',
  'Ludvika',
  'Malung-Sälen',
  'Mora',
  'Orsa',
  'Rättvik',
  'Smedjebacken',
  'Säter',
  'Vansbro',
  'Älvdalen',
] as const;

export type Municipality = (typeof DALARNA_MUNICIPALITIES)[number];

// Extra matchtermer per kommun: tätorter, kyrkbyar och namnformer som förekommer i
// den riktiga datan. Medvetet utelämnade är termer som är korta eller tvetydiga nog
// att ge falska träffar som delsträng (t.ex. "Nås" och "Boda", som lever inuti helt
// andra ord) — hellre en missad träff än en felplacerad.
const MUNICIPALITY_ALIASES: Record<string, string[]> = {
  Borlänge: ['Idkerberget', 'Torsång', 'Ornäs'],
  // "Falu" täcker "Falu Kristine församling", "Falu Kuriren" och "Falu gruva".
  Falun: ['Falu', 'Bjursås', 'Svärdsjö', 'Enviken', 'Grycksbo'],
  Gagnef: ['Djurås', 'Floda', 'Mockfjärd', 'Björbo', 'Dala-Floda'],
  Hedemora: ['Långshyttan', 'Husby', 'Garpenberg', 'Vikmanshyttan'],
  Leksand: ['Insjön', 'Siljansnäs', 'Tällberg', 'Djura'],
  Ludvika: ['Grangärde', 'Fredriksberg', 'Säfsnäs', 'Gränge', 'Nyhammar', 'Sunnansjö', 'Blötberget'],
  'Malung-Sälen': ['Malung', 'Sälen', 'Lima', 'Transtrand', 'Tandådalen', 'Öje', 'Yttermalung'],
  Mora: ['Våmhus', 'Venjan', 'Sollerön', 'Nusnäs'],
  Orsa: ['Skattungbyn'],
  Rättvik: ['Furudal', 'Vikarbyn', 'Bingsjö'],
  Smedjebacken: ['Söderbärke', 'Norrbärke'],
  Säter: ['Gustafs', 'Stora Skedvi', 'Skedvi', 'Säterbygden'],
  Vansbro: ['Dala-Järna', 'Äppelbo', 'Björbo'],
  Älvdalen: ['Särna', 'Idre', 'Storsätern', 'Evertsberg', 'Åsen'],
};

export function isMunicipality(value: string): boolean {
  return DALARNA_MUNICIPALITIES.some((m) => m.toLowerCase() === value.trim().toLowerCase());
}

/**
 * Matchar ett event mot en kommun. `haystack` ska vara location + sourceName —
 * se kommentaren överst om varför källnamnet måste ingå.
 */
export function matchesMunicipality(haystack: string, municipality: string): boolean {
  const canonical = DALARNA_MUNICIPALITIES.find(
    (m) => m.toLowerCase() === municipality.trim().toLowerCase()
  );
  if (!canonical) return false;

  const terms = [canonical, ...(MUNICIPALITY_ALIASES[canonical] ?? [])];
  const lowered = haystack.toLowerCase();
  return terms.some((term) => lowered.includes(term.toLowerCase()));
}
