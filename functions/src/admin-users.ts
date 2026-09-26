import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { requireAdmin } from './auth-guard';

function db() {
  return admin.firestore();
}

// Tar bort ett uids event-submissions/candidate-sources (deras "eventlänkar")
// — ALDRIG redan godkänt innehåll i events/sources, som är självständiga
// dokument utan ägarfält. Delas mellan deleteUser (admin) och
// deleteMyAccount (självservice) så cascade-logiken bara finns på ett ställe.
async function deleteOwnedContent(uid: string): Promise<void> {
  const [submissions, links] = await Promise.all([
    db().collection('event-submissions').where('submittedBy', '==', uid).get(),
    db().collection('candidate-sources').where('submittedBy', '==', uid).get(),
  ]);
  const batch = db().batch();
  for (const doc of [...submissions.docs, ...links.docs]) batch.delete(doc.ref);
  if (submissions.size + links.size > 0) await batch.commit();
}

// admin.auth().listUsers() paginerar 1000 åt gången — för en publik sajts
// användarbas i det här skedet räcker en enda sida (1000) gott och väl.
// searchEmail filtreras klientsidan i den här funktionen (inte i Auth-API:t,
// som inte har fritextsök) — adminpanelens UserManager gör om samma sök vid
// varje tangenttryck, så filtreringen hålls här istället för att skicka hela
// listan till klienten varje gång.
export const listUsers = functions
  .region('europe-west1')
  .https.onCall(async (data: { searchEmail?: string }, context) => {
    requireAdmin(context);
    const result = await admin.auth().listUsers(1000);
    const search = (data.searchEmail ?? '').trim().toLowerCase();
    const users = result.users
      .filter((u) => !search || (u.email ?? '').toLowerCase().includes(search))
      .map((u) => ({
        uid: u.uid,
        email: u.email ?? '',
        isAdmin: u.customClaims?.admin === true,
        createdAt: u.metadata.creationTime,
      }));
    return { users };
  });

export const deleteUser = functions
  .region('europe-west1')
  .https.onCall(async (data: { uid?: string; cascadeDelete?: boolean }, context) => {
    requireAdmin(context);
    const uid = data.uid;
    if (!uid) {
      throw new functions.https.HttpsError('invalid-argument', 'uid krävs.');
    }
    if (uid === context.auth!.uid) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Kan inte ta bort sitt eget adminkonto härifrån.'
      );
    }
    if (data.cascadeDelete) await deleteOwnedContent(uid);
    await admin.auth().deleteUser(uid);
    return { deleted: true };
  });

// Självservice — kräver bara att man är inloggad (vilken kontotyp som
// helst), agerar ALLTID på det egna context.auth.uid. Tar aldrig emot ett
// uid-argument, så det finns ingen väg att radera någon annans konto här.
export const deleteMyAccount = functions
  .region('europe-west1')
  .https.onCall(async (data: { cascadeDelete?: boolean }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Inloggning krävs.');
    }
    const uid = context.auth.uid;
    if (data.cascadeDelete) await deleteOwnedContent(uid);
    await admin.auth().deleteUser(uid);
    return { deleted: true };
  });
