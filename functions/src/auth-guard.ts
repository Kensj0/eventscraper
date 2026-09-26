import * as functions from 'firebase-functions';

// Delad mellan index.ts (triggerXIngestion), user-content.ts och
// admin-users.ts — egen fil istället för att exportera från index.ts för
// att undvika en cirkulär import (index.ts re-exporterar de andra två).
//
// Sedan publik självregistrering infördes (app/lagg-till-event) räcker inte
// "är inloggad" som admin-koll längre — vilken publik användare som helst
// är då också context.auth != null. admin-claimet sätts en gång av
// functions/scripts/create-admin.ts och ändras aldrig av klientkod.
export function requireAdmin(context: functions.https.CallableContext): void {
  if (!context.auth || context.auth.token.admin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Kräver adminbehörighet.');
  }
}
