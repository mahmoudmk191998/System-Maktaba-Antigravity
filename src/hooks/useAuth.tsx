import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { auth } from '@/lib/firebase';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { claimPendingStaffInvitation } from '@/services/auth/staffProvisioning.service';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          await claimPendingStaffInvitation(currentUser);
        } catch (error) {
          console.error('Staff invitation provisioning failed:', error);
          // Never let a partially provisioned invited employee fall through to
          // first-user tenant bootstrap with unintended admin authority.
          await firebaseSignOut(auth).catch(() => {});
          if (active) {
            setUser(null);
            setLoading(false);
          }
          return;
        }
      }

      if (active) {
        setUser(currentUser);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
