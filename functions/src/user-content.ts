import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { testCapability } from './capability-test';
import { requireAdmin } from './auth-guard';

// Admin-callables för de två publika inskicksvägarna i app/lagg-till-event:
// enskilda event (event-submissions) och "eventlänkar" (candidate-sources,
// type:'anvandarinskickad').

function db() {
  return admin.firestore();
}

// Kör samma testCapability() som functions/scripts/test-candidates.ts kör i
// batch för källupptäckten, men mot EN enskild candidate-sources-post från
// adminpanelens EventLinkQueue ("Testa"-knappen).
export const testEventLink = functions
  .region('europe-west1')
  .https.onCall(async (data: { candidateId?: string }, context) => {
    requireAdmin(context);
    const candidateId = data.candidateId;
    if (!candidateId) {
      throw new functions.https.HttpsError('invalid-argument', 'candidateId krävs.');
    }

    const ref = db().collection('candidate-sources').doc(candidateId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Eventlänken hittades inte.');
    }
    const url = snap.data()?.url as string | undefined;
    if (!url) {
      throw new functions.https.HttpsError('failed-precondition', 'Eventlänken saknar url.');
    }

    const result = await testCapability(url);
    const patch: Record<string, unknown> = { lastVerified: Timestamp.now() };
    if (result) {
      patch.status = 'ready-to-ingest';
      patch.verifiedMethod = result.method;
      if (result.feedUrl) patch.feedUrl = result.feedUrl;
    } else {
      patch.status = 'failed';
    }
    await ref.set(patch, { merge: true });
    return { ready: !!result, method: result?.method ?? null };
  });

// Godkänner en väntande event-submissions-post: kopierar den till "events"
// (samma fältform som runHTMLIngestion/runIngestion i index.ts skriver,
// se index.ts:492-502) och markerar inskicket som godkänt. events skrivs
// aldrig direkt av klienten (firestore.rules) — det här är den enda vägen
// in för användarinskickade event, precis som ingestion-pipelinen är den
// enda vägen för skrapade.
export const approveEventSubmission = functions
  .region('europe-west1')
  .https.onCall(async (data: { submissionId?: string }, context) => {
    requireAdmin(context);
    const submissionId = data.submissionId;
    if (!submissionId) {
      throw new functions.https.HttpsError('invalid-argument', 'submissionId krävs.');
    }

    const ref = db().collection('event-submissions').doc(submissionId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Inskicket hittades inte.');
    }
    const sub = snap.data()!;
    if (sub.status !== 'pending') {
      throw new functions.https.HttpsError('failed-precondition', 'Inskicket är redan hanterat.');
    }

    await db().collection('events').add({
      sourceUrl: sub.sourceUrl,
      sourceName: sub.submittedByEmail ? `Inskickat av ${sub.submittedByEmail}` : 'Inskickat av besökare',
      title: sub.title,
      description: sub.description,
      startTime: sub.startTime,
      timeKnown: true,
      location: sub.location,
      category: sub.category,
      createdAt: Timestamp.now(),
    });
    await ref.set(
      { status: 'approved', reviewedAt: Timestamp.now(), reviewedBy: context.auth!.uid },
      { merge: true }
    );
    return { approved: true };
  });

export const rejectEventSubmission = functions
  .region('europe-west1')
  .https.onCall(async (data: { submissionId?: string }, context) => {
    requireAdmin(context);
    const submissionId = data.submissionId;
    if (!submissionId) {
      throw new functions.https.HttpsError('invalid-argument', 'submissionId krävs.');
    }
    await db()
      .collection('event-submissions')
      .doc(submissionId)
      .set(
        { status: 'rejected', reviewedAt: Timestamp.now(), reviewedBy: context.auth!.uid },
        { merge: true }
      );
    return { rejected: true };
  });
