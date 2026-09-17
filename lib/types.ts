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

export interface SiteConfig {
  bannerImage: string | null;
  /** Object-position i procent (0-100), samma princip som CSS object-position. */
  bannerX: number;
  bannerY: number;
  /** Mörkläggning ovanpå bilden i procent (0-80), för läsbar vit text. */
  bannerScrim: number;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  bannerImage: null,
  bannerX: 50,
  bannerY: 50,
  bannerScrim: 40,
};

export type IngestionType = 'rss' | 'html' | 'svenska-kyrkan-calendar';

export interface SchedulingConfig {
  rssEnabled: boolean;
  htmlEnabled: boolean;
  svenskaKyrkanEnabled: boolean;
}

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  rssEnabled: true,
  htmlEnabled: true,
  svenskaKyrkanEnabled: true,
};

export interface IngestionLog {
  id: string;
  type: IngestionType;
  trigger: 'scheduled' | 'manual';
  processed: number;
  skipped: number;
  errors: string[];
  sourcesFailed: string[];
  duration_ms: number;
  timestamp: Date;
}
