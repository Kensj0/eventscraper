# EventScraper

En webbapplikation som aggregerar event från öppna RSS-flöden, strukturerar informationen med AI, och visar eventen i ett Meetup-liknande gränssnitt.

## Features

- 🔄 Automatisk RSS-läsning från konfigurerade flöden
- 🤖 AI-parser (Claude eller GPT) för att klassificera och sammanfatta event
- 🎯 Intelligent deduplicering baserad på källadress
- 📱 Responsiv UI med Tailwind CSS
- 🔍 Filtrera efter datum och kategori
- ✨ Real-time uppdateringar från Firestore

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + React 18 + TypeScript
- **Styling**: Tailwind CSS + Lucide React Icons
- **Backend**: Firebase Cloud Functions (Pub/Sub scheduler)
- **Database**: Cloud Firestore
- **AI**: Claude 3 Haiku (Anthropic) eller GPT-4o mini (OpenAI)
- **Deployment**: Firebase Hosting

## Setup

### Förutsättningar
- Node.js 20+
- Firebase CLI
- Git

### Installation

1. Klona repot och installera beroenden:
```bash
git clone https://github.com/Kensj0/eventscraper.git
cd eventscraper
npm ci
npm ci --prefix functions
```

2. Kopiera miljövariabler:
```bash
cp .env.local.example .env.local
```

3. Fyll i värdena för Firebase och AI-provider.

4. Starta utvecklingsservern:
```bash
npm run dev
```

Besök http://localhost:3000

### Configuration

#### Firebase
1. Skapa ett Firebase-projekt på console.firebase.google.com
2. Aktivera Firestore Database, Cloud Functions och Hosting
3. Kopiera konfigurationen till `.env.local`

#### AI Provider
Välj antingen Anthropic eller OpenAI och lägg API-nyckel i `.env.local`

#### RSS Feeds
Redigera RSS-feedlistan i `functions/src/index.ts` i variabeln `RSS_FEEDS`

## Deployment

### First time setup
```bash
firebase init
firebase deploy
```

### Deploy efter ändringar
Trigga manuellt via GitHub Actions under "Actions" → "Deploy (manuell)" → "Run workflow"

Välj vad som ska deployas:
- `hosting` - Endast frontend
- `functions` - Endast Cloud Functions
- `hosting,functions` - Båda
- `firestore:rules` - Firestore-regler
- `hosting,functions,firestore:rules` - Allt

## Arkitektur

### Frontend (`app/`)
- `page.tsx` - Huvudsida med event-listning
- `components/EventCard.tsx` - Komponenterför event-kort
- `components/EventFilters.tsx` - Filterkontroller

### Backend (`functions/src/index.ts`)
- Scheduled Function körs dagligen
- Läser RSS-feeds
- Skickar titel + brödtext till AI
- Sparar klassificerade event i Firestore

### Database (Firestore)
```
events/
  - sourceUrl (unique, indexed)
  - sourceName
  - title
  - description
  - startTime (indexed, for queries)
  - location
  - category
  - createdAt
```

## Säkerhet

- Firestore-regler tillåter public read, ingen write från klienter
- Events skapas endast via Cloud Functions
- Hemliga nycklar lagras i GitHub Secrets

## Kostnad

Designad för att hålla sig inom Firebase Free Tier:
- Max 10 event processerade per körning
- Deduplicering minskar databaskrivningar
- AI-prompts är optimerade för minimala tokens

## Lokalt utveckling

```bash
# Typkontroll
npm run typecheck

# Bygg frontend
npm run build

# Starta producerad version
npm start
```

## Troubleshooting

### Events visas inte
1. Kontrollera att Firestore har data: Firebase Console → Firestore
2. Verifiera att Cloud Function kördes: Cloud Functions logs
3. Kontrollera API-nycklar i `.env.local`

### AI-parser misslyckas
1. Verifiera API-nycklar (ANTHROPIC_API_KEY eller OPENAI_API_KEY)
2. Kontrollera Cloud Function logs för fel
3. Säkerställ att prompt är korrekt formaterad

## License

MIT
