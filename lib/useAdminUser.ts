import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './firebase';

/**
 * Sedan publik självregistrering infördes (app/lagg-till-event) räcker inte
 * "inloggad" som admin-koll på klienten längre — vilken publik besökare som
 * helst kan vara inloggad i samma webbläsare. Läser samma admin:true-claim
 * som backend (auth-guard.ts/firestore.rules) redan litar på, så huvudvyns
 * redigera/ta bort-knappar bara syns för ett konto som faktiskt får använda
 * dem — inte bara för att man råkar vara inloggad.
 */
export function useAdminUser(): { user: User | null; isAdmin: boolean; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      const token = await u.getIdTokenResult();
      setIsAdmin(token.claims.admin === true);
      setLoading(false);
    });
  }, []);

  return { user, isAdmin, loading };
}
