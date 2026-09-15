export interface Event {
  id: string;
  sourceUrl: string;
  sourceName: string;
  title: string;
  description: string;
  startTime: Date;
  /**
   * Falskt när källan bara angav ett datum, inget klockslag. Sätts av
   * ingestionen (functions/src/event-time.ts); för äldre dokument utan fältet
   * härleds det i page.tsx. Kortet visar då "Tid ej angiven" istället för den
   * påhittade UTC-midnattstiden.
   */
  timeKnown: boolean;
  location: string;
  category: string;
  createdAt: Date;
}

export interface EventFormData {
  title: string;
  description: string;
  startTime: string;
  location: string;
  category: string;
}
