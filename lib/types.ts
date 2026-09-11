export interface Event {
  id: string;
  sourceUrl: string;
  sourceName: string;
  title: string;
  description: string;
  startTime: Date;
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
