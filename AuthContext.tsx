import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  updateUserPassword: (newPass: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isActualAdmin: boolean;
  isHeadOfDepartment: boolean;
  isSpecialtyManager: boolean;
  isTeacher: boolean;
  activeRole: UserRole | null;
  setImpersonatedRole: (role: UserRole | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonatedRole, setImpersonatedRole] = useState<UserRole | null>(null);

  useEffect(() => {
    let isLocalSessionActive = false;
    
    // Check Local Storage for teacher session
    const localUid = localStorage.getItem('teacher_uid');
    if (localUid) {
      isLocalSessionActive = true;
      getDoc(doc(db, 'users', localUid)).then((userDoc) => {
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          if (userData.isActive === false) {
            localStorage.removeItem('teacher_uid');
            setUser(null);
          } else {
            setUser({ id: userDoc.id, ...userData } as User);
          }
          setLoading(false);
        } else {
          localStorage.removeItem('teacher_uid');
          setLoading(false);
        }
      }).catch(err => {
        console.error("Local storage login failed:", err);
        setLoading(false);
      });
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Logged in with Google / Firebase natively
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          // Ensure hardcoded admins have the admin role
          if ((firebaseUser.email === 't.mansouri@lagh-univ.dz' || firebaseUser.email === 'taharmansouri32@gmail.com') && userData.role !== 'admin') {
            const updatedUser = { ...userData, role: 'admin' as UserRole };
            await setDoc(doc(db, 'users', firebaseUser.uid), updatedUser);
            setUser({ id: userDoc.id, ...updatedUser });
          } else {
            setUser({ id: userDoc.id, ...userData } as User);
          }
        } else {
          // Check if the email exists in any other document (e.g. created by admin but UID not yet matched)
          const q = query(collection(db, 'users'), where('email', '==', firebaseUser.email?.toLowerCase()));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            // Found a document with this email but different ID (probably email-based ID)
            const existingDoc = querySnapshot.docs[0];
            const existingData = existingDoc.data() as User;
            
            // Migrate the document to use the real UID as the ID
            const newUser: User = {
              ...existingData,
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || existingData.displayName,
            };
            
            await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
            if (existingDoc.id !== firebaseUser.uid) {
              await deleteDoc(doc(db, 'users', existingDoc.id));
            }
            
            setUser({ id: firebaseUser.uid, ...newUser });
          } else {
            // Check if this is the hardcoded admin
            if (firebaseUser.email === 't.mansouri@lagh-univ.dz' || firebaseUser.email === 'taharmansouri32@gmail.com') {
              const newUser: User = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || '',
                role: 'admin',
              };
              await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
              setUser(newUser);
            } else {
              // NOT AUTHORIZED: Email not found in teachers list
              await signOut(auth);
              setUser(null);
              // We'll handle the error message in the login component
              const error = new Error('NOT_AUTHORIZED');
              (error as any).code = 'auth/not-authorized';
              console.error('User not in authorized list:', firebaseUser.email);
            }
          }
        }
        setLoading(false);
      } else {
        // No firebase user
        if (!localStorage.getItem('teacher_uid')) {
          setUser(null);
          setImpersonatedRole(null);
        }
        if (!isLocalSessionActive) {
          setLoading(false);
        }
      }
    });

    return unsubscribe;
  }, []);

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      
      if (firebaseUser) {
        // Check if authorized
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (!userDoc.exists()) {
          const q = query(collection(db, 'users'), where('email', '==', firebaseUser.email?.toLowerCase()));
          const querySnapshot = await getDocs(q);
          
          if (querySnapshot.empty && 
              firebaseUser.email !== 't.mansouri@lagh-univ.dz' && 
              firebaseUser.email !== 'taharmansouri32@gmail.com') {
            await signOut(auth);
            const error = new Error('NOT_AUTHORIZED');
            (error as any).code = 'auth/not-authorized';
            throw error;
          }
        }
      }
    } catch (error: any) {
      const blockedPopup = error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request';
      if (blockedPopup) {
        console.warn('Popup sign-in blocked or cancelled, falling back to redirect:', error);
        const provider = new GoogleAuthProvider();
        await signInWithRedirect(auth, provider);
      } else {
        console.error('Login error:', error);
        throw error;
      }
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      // Direct Firestore authentication
      const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase().trim()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        const error = new Error('NOT_FOUND');
        (error as any).code = 'auth/user-not-found';
        throw error;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data() as User;

      if (userData.password !== pass) {
        const error = new Error('WRONG_PASSWORD');
        (error as any).code = 'auth/wrong-password';
        throw error;
      }

      // Check authorization
      if (userData.isActive === false) {
         const error = new Error('ACCOUNT_DISABLED');
         (error as any).code = 'auth/user-disabled';
         throw error;
      }

      // Success! Set local session and user state
      localStorage.setItem('teacher_uid', userDoc.id);
      setUser({ id: userDoc.id, ...userData });
      
    } catch (error: any) {
      console.error('Login with email error:', error);
      throw error;
    }
  };

  const updateUserPassword = async (newPass: string) => {
    if (auth.currentUser) {
      try {
        await updatePassword(auth.currentUser, newPass);
        await setDoc(doc(db, 'users', auth.currentUser.uid), { password: newPass }, { merge: true });
      } catch (error: any) {
        console.error('Update password error:', error);
        throw error;
      }
    } else if (user) {
      try {
        await updateDoc(doc(db, 'users', user.id!), { password: newPass });
      } catch (error) {
        console.error('Update local password error:', error);
        throw error;
      }
    }
  };

  const logout = async () => {
    localStorage.removeItem('teacher_uid');
    setUser(null);
    setImpersonatedRole(null);
    await signOut(auth);
  };

  const actualRole = user?.role || null;
  const activeRole = (actualRole === 'admin' && impersonatedRole) ? impersonatedRole : actualRole;

  const value = {
    user,
    loading,
    login,
    loginWithEmail,
    updateUserPassword,
    logout,
    isAdmin: activeRole === 'admin' || activeRole === 'vice_admin',
    isActualAdmin: actualRole === 'admin' || actualRole === 'vice_admin',
    isHeadOfDepartment: actualRole === 'admin',
    isSpecialtyManager: activeRole === 'specialty_manager',
    isTeacher: activeRole === 'teacher' || activeRole === 'specialty_manager',
    activeRole,
    setImpersonatedRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
