import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from './useAuth';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  tenant_id: string | null;
  branch_id: string | null;
  role?: string;
}

const getInitialProfile = (uid?: string | null) => {
  if (!uid || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`alwan_cached_profile_${uid}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export function useProfile() {
  const { user } = useAuth();
  const cached = getInitialProfile(user?.uid);
  const [profile, setProfile] = useState<UserProfile | null>(cached);
  const [loading, setLoading] = useState(cached ? false : true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const cachedSnapshot = getInitialProfile(user.uid);
    if (!navigator.onLine && cachedSnapshot) {
      setProfile(cachedSnapshot);
      setLoading(false);
      return;
    }
    
    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'profiles', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          let userRole = 'user';
          // Fetch role
          try {
            const { collection, query, where, getDocs } = await import('firebase/firestore');
            const rolesQ = query(collection(db, 'user_roles'), where('user_id', '==', user.uid));
            const rolesSnap = await getDocs(rolesQ);
            if (!rolesSnap.empty) {
              userRole = rolesSnap.docs[0].data().role;
            }
          } catch (err) {
            console.error('Error fetching role:', err);
          }

          const profileData = { id: docSnap.id, role: userRole, ...docSnap.data() } as UserProfile;
          setProfile(profileData);
          try {
            localStorage.setItem(`alwan_cached_profile_${user.uid}`, JSON.stringify(profileData));
          } catch {}
        } else {
          setProfile(cachedSnapshot);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        if (cachedSnapshot) {
          setProfile(cachedSnapshot);
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfile();
  }, [user]);

  return { profile, loading };
}
