// Taxonomi för organisationstyper som källupptäckten letar efter.
// Grupperna styr vilka söksökningar/databaser DEL 2 (discover-databases.ts)
// letar efter per region — se functions/src/region-databases.ts.
export type OrganizationGroup =
  | 'kulturell'
  | 'idrott'
  | 'social'
  | 'kommersiell'
  | 'offentlig'
  | 'hobby';

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
  | 'konstforening';

export const ORGANIZATION_TYPES: Record<OrganizationGroup, OrganizationType[]> = {
  kulturell: ['museum', 'teater', 'konsertplats', 'biograf'],
  idrott: ['idrottsforening', 'gym', 'traningscentral'],
  social: ['kyrka', 'ideell-organisation', 'workshop-kurs'],
  kommersiell: ['hotell', 'restaurang', 'bar', 'cafe'],
  offentlig: ['bibliotek', 'kommun', 'skola'],
  hobby: ['dansforening', 'musikforening', 'konstforening'],
};

export const ORGANIZATION_GROUPS = Object.keys(ORGANIZATION_TYPES) as OrganizationGroup[];
