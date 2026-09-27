import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin } from './auth-guard';

// Admin-callables för att redigera/ta bort enskilda, redan publicerade
// events direkt från huvudvyn (app/page.tsx) — events skrivs annars ALDRIG
// direkt av klienten (firestore.rules: allow create, update, delete: if
// false), samma princip som approveEventSubmission/ingestion-pipelinen är
// de enda skrivvägarna in. Detta är den enda skrivvägen ut/om.

function db() {
  return admin.firestore();
}

export const updateEvent = functions
  .region('europe-west1')
  .https.onCall(
    async (
      data: {
        eventId?: string;
        title?: string;
        description?: string;
        startTime?: string;
        location?: string;
        category?: string;
      },
      context
    ) => {
      requireAdmin(context);
      const eventId = data.eventId;
      if (!eventId) {
        throw new functions.https.HttpsError('invalid-argument', 'eventId krävs.');
      }

      const ref = db().collection('events').doc(eventId);
      const snap = await ref.get();
      if (!snap.exists) {
        throw new functions.https.HttpsError('not-found', 'Eventet hittades inte.');
      }

      const patch: Record<string, unknown> = {};
      if (typeof data.title === 'string') patch.title = data.title;
      if (typeof data.description === 'string') patch.description = data.description;
      if (typeof data.location === 'string') patch.location = data.location;
      if (typeof data.category === 'string') patch.category = data.category;
      if (typeof data.startTime === 'string') {
        const date = new Date(data.startTime);
        if (isNaN(date.getTime())) {
          throw new functions.https.HttpsError('invalid-argument', 'Ogiltigt startdatum.');
        }
        patch.startTime = Timestamp.fromDate(date);
        // En admin som redigerar ett datum/tid via formuläret har alltid
        // angett ett riktigt klockslag (inte AI-gissat) — till skillnad från
        // ingestionens hasExplicitTime-härledning.
        patch.timeKnown = true;
      }

      await ref.set(patch, { merge: true });
      return { updated: true };
    }
  );

export const deleteEvent = functions
  .region('europe-west1')
  .https.onCall(async (data: { eventId?: string }, context) => {
    requireAdmin(context);
    const eventId = data.eventId;
    if (!eventId) {
      throw new functions.https.HttpsError('invalid-argument', 'eventId krävs.');
    }
    await db().collection('events').doc(eventId).delete();
    return { deleted: true };
  });
