// Skapar (eller uppdaterar lösenordet för) adminkontot som loggar in på
// /admin (app/admin/page.tsx). Det finns ingen självregistrering — det här
// skriptet är enda sättet att skapa kontot, och du kör det själv lokalt så
// att lösenordet aldrig syns någon annanstans.
//
// Förutsättning: Email/Password måste vara påslaget som inloggningsmetod i
// Firebase Console → Authentication → Sign-in method (kan inte sättas via
// Admin SDK).
//
// Körning mot prod kräver GOOGLE_APPLICATION_CREDENTIALS satt till en
// service account-nyckel (samma mönster som seed-sources.ts):
//   GOOGLE_APPLICATION_CREDENTIALS=/sökväg/till/nyckel.json npx ts-node scripts/create-admin.ts
import * as admin from 'firebase-admin';
import * as readline from 'readline';

admin.initializeApp({ projectId: 'eventscraper-f0588' });

const CODE_ENTER_LF = 10;
const CODE_ENTER_CR = 13;
const CODE_CTRL_C = 3;
const CODE_BACKSPACE = 8;
const CODE_DELETE = 127;

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

// readline har inget inbyggt sätt att dölja inmatning — den här varianten
// skriver "*" istället för det riktiga tecknet, så lösenordet aldrig syns
// i terminalen eller hamnar i shellens historik. Styrtecken (enter/
// backspace/ctrl+c) jämförs via teckenkod istället för litterala
// kontrolltecken i källkoden, för att inte riskera att de tystas eller
// görs om av verktyg som redigerar filen.
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const output = process.stdout;
    let value = '';

    output.write(question);
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const eraseLastChar = String.fromCharCode(CODE_BACKSPACE) + ' ' + String.fromCharCode(CODE_BACKSPACE);

    const onData = (char: string) => {
      const code = char.charCodeAt(0);

      if (code === CODE_ENTER_LF || code === CODE_ENTER_CR) {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener('data', onData);
        rl.close();
        output.write('\n');
        resolve(value);
        return;
      }
      if (code === CODE_CTRL_C) {
        process.exit(1);
      }
      if (code === CODE_BACKSPACE || code === CODE_DELETE) {
        if (value.length > 0) {
          value = value.slice(0, -1);
          output.write(eraseLastChar);
        }
        return;
      }
      value += char;
      output.write('*');
    };

    process.stdin.on('data', onData);
  });
}

async function main() {
  const email = await ask('E-postadress för adminkontot: ');
  if (!email) throw new Error('E-post krävs.');

  const password = await askHidden('Lösenord (minst 6 tecken): ');
  if (password.length < 6) throw new Error('Lösenordet måste vara minst 6 tecken.');

  const confirmPassword = await askHidden('Bekräfta lösenord: ');
  if (password !== confirmPassword) throw new Error('Lösenorden matchar inte.');

  try {
    const existing = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(existing.uid, { password });
    console.log(`Lösenordet uppdaterat för befintligt konto: ${email}`);
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') {
      const user = await admin.auth().createUser({ email, password });
      console.log(`Adminkonto skapat: ${email} (uid: ${user.uid})`);
    } else {
      throw error;
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
