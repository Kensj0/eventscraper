// Taxonomi för organisationstyper som källupptäckten letar efter.
// Grupperna styr vilka söksökningar/databaser DEL 2 (discover-databases.ts)
// letar efter per region — se functions/src/region-databases.ts.
export type OrganizationGroup =
  | 'kulturell'
  | 'idrott'
  | 'social'
  | 'kommersiell'
  | 'offentlig'
  | 'hobby'
  | 'uteliv'
  | 'halsa-andlighet';

export type OrganizationType =
  | 'museum'
  | 'teater'
  | 'konsertplats'
  | 'biograf'
  | 'idrottsforening'
  | 'gym'
  | 'traningscentral'
  | 'kyrka'
  | 'ideell-organisation'
  | 'workshop-kurs'
  | 'hotell'
  | 'restaurang'
  | 'bar'
  | 'cafe'
  | 'bibliotek'
  | 'kommun'
  | 'skola'
  | 'dansforening'
  | 'musikforening'
  | 'konstforening'
  // uteliv — se functions/scripts/discover-venues.ts
  | 'pub'
  | 'nattklubb'
  | 'camping'
  | 'djurpark'
  | 'konsertscen'
  | 'nojespark'
  // halsa-andlighet — se functions/scripts/discover-venues.ts
  | 'buddhistiskt-tempel'
  | 'moske'
  | 'retreat-center'
  | 'yogastudio'
  | 'halsohem';

export const ORGANIZATION_TYPES: Record<OrganizationGroup, OrganizationType[]> = {
  kulturell: ['museum', 'teater', 'konsertplats', 'biograf'],
  idrott: ['idrottsforening', 'gym', 'traningscentral'],
  social: ['kyrka', 'ideell-organisation', 'workshop-kurs'],
  kommersiell: ['hotell', 'restaurang', 'bar', 'cafe'],
  offentlig: ['bibliotek', 'kommun', 'skola'],
  hobby: ['dansforening', 'musikforening', 'konstforening'],
  uteliv: ['pub', 'nattklubb', 'camping', 'djurpark', 'konsertscen', 'nojespark'],
  'halsa-andlighet': ['buddhistiskt-tempel', 'moske', 'retreat-center', 'yogastudio', 'halsohem', 'gym'],
};

export const ORGANIZATION_GROUPS = Object.keys(ORGANIZATION_TYPES) as OrganizationGroup[];
