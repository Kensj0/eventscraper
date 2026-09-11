import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Parser from 'rss-parser';
import axios from 'axios';

admin.initializeApp();
const db = admin.firestore();

interface AIResponse {
  is_event: boolean;
  title: string;
  description: string;
  start_time: string;
  location: string;
  category: string;
}

// RSS feeds configuration for Dalarna region
const RSS_FEEDS = [
  {
    url: 'https://www.dt.se/feed/rss',
    sourceName: 'Dalarnos Tidning',
  },
  {
    url: 'https://www.falukuriren.se/feed/rss',
    sourceName: 'Falun Kuriren',
  },
  {
    url: 'https://www.borlange.se/feed',
    sourceName: 'Borlänge Stad',
  },
  {
    url: 'https://www.falun.se/feed',
    sourceName: 'Falun Stad',
  },
  {
    url: 'https://www.ludvika.se/feed',
    sourceName: 'Ludvika Kommun',
  },
  {
    url: 'https://www.rattvik.se/feed',
    sourceName: 'Rättvik Kommun',
  },
];

const parser = new Parser();
const MAX_ITEMS_PER_RUN = 10;

async function callAI(title: string, description: string): Promise<AIResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('No AI API key configured');
    return null;
  }

  const prompt = `You are an event parser. Analyze the following text and determine if it describes a specific event with a date/time and location.

Title: ${title}
Description: ${description.substring(0, 500)}

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "is_event": boolean,
  "title": "string",
  "description": "max 2 sentences summary in Swedish",
  "start_time": "ISO-8601 string",
  "location": "string",
  "category": "string (e.g., Konsert, Teater, Sport, Konferens, Utställning, Workshop, Övrigt)"
}`;

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      // Use Anthropic Claude
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-haiku-20240307',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );

      const content = response.data.content[0];
      if (content.type === 'text') {
        const parsed = JSON.parse(content.text);
        return parsed;
      }
      return null;
    } else {
      // Use OpenAI
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const parsed = JSON.parse(response.data.choices[0].message.content);
      return parsed;
    }
  } catch (error) {
    console.error('AI API call failed:', error);
    return null;
  }
}

async function isDuplicate(sourceUrl: string): Promise<boolean> {
  const snapshot = await db
    .collection('events')
    .where('sourceUrl', '==', sourceUrl)
    .limit(1)
    .get();
  return !snapshot.empty;
}

export const ingestRSSFeeds = functions
  .region('europe-west1')
  .pubsub.schedule('0 2 * * *') // Daily at 2 AM Stockholm time
  .timeZone('Europe/Stockholm')
  .onRun(async () => {
    let processedCount = 0;
    let itemsSkipped = 0;
    let feedsProcessed = 0;
    let feedsFailed = 0;

    for (const feed of RSS_FEEDS) {
      try {
        console.log(`Processing feed: ${feed.sourceName} (${feed.url})`);
        const rss = await parser.parseURL(feed.url);
        feedsProcessed++;

        for (const item of rss.items.slice(0, MAX_ITEMS_PER_RUN)) {
          if (processedCount >= MAX_ITEMS_PER_RUN) break;

          const sourceUrl = item.link || '';
          if (!sourceUrl) {
            itemsSkipped++;
            continue;
          }

          // Check for duplicate
          if (await isDuplicate(sourceUrl)) {
            console.log(`Duplicate skipped: ${sourceUrl}`);
            itemsSkipped++;
            continue;
          }

          // Call AI to parse event
          const aiResult = await callAI(item.title || '', item.content || item.summary || '');
          if (!aiResult || !aiResult.is_event) {
            console.log(`Not an event: ${item.title}`);
            itemsSkipped++;
            continue;
          }

          // Save to Firestore
          try {
            await db.collection('events').add({
              sourceUrl,
              sourceName: feed.sourceName,
              title: aiResult.title,
              description: aiResult.description,
              startTime: admin.firestore.Timestamp.fromDate(new Date(aiResult.start_time)),
              location: aiResult.location,
              category: aiResult.category,
              createdAt: admin.firestore.Timestamp.now(),
            });
            console.log(`Event saved: ${aiResult.title}`);
            processedCount++;
          } catch (error) {
            console.error(`Failed to save event: ${error}`);
          }
        }
      } catch (error) {
        console.error(`Failed to process feed ${feed.sourceName}: ${error}`);
        feedsFailed++;
      }
    }

    console.log(`Ingestion complete. Feeds: ${feedsProcessed}/${RSS_FEEDS.length} success. Events processed: ${processedCount}, Skipped: ${itemsSkipped}`);
    return { processed: processedCount, skipped: itemsSkipped, feeds: { success: feedsProcessed, failed: feedsFailed } };
  });
