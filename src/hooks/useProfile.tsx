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

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    
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

          setProfile({ id: docSnap.id, role: userRole, ...docSnap.data() } as UserProfile);
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfile();
  }, [user]);

  return { profile, loading };
}
