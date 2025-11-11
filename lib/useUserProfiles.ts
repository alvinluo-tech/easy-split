import { useEffect, useState } from 'react';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from './types';

/**
 * Hook to fetch and cache user profiles by UIDs
 * Returns a map of uid -> displayName (or email fallback)
 */
export function useUserProfiles(uids: string[]) {
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!uids || uids.length === 0) return;

    const fetchProfiles = async () => {
      const newProfiles: Record<string, string> = { ...profiles };
      
      for (const uid of uids) {
        // Skip if already cached
        if (newProfiles[uid]) continue;
        
        try {
          const userRef = doc(db, 'users', uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            newProfiles[uid] = data.displayName || data.email || uid;
          } else {
            newProfiles[uid] = uid; // fallback to uid
          }
        } catch (err) {
          console.error('Failed to fetch user profile:', uid, err);
          newProfiles[uid] = uid; // fallback to uid
        }
      }
      
      setProfiles(newProfiles);
    };

    fetchProfiles();
  }, [uids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return profiles;
}

/**
 * Get display name for a single uid
 */
export function getDisplayName(uid: string, profiles: Record<string, string>): string {
  return profiles[uid] || uid;
}
