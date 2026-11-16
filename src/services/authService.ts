
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../lib/firebase";
import type { User as FirebaseUser } from "firebase/auth";


export async function signup(
  email: string,
  password: string,
  name: string,
  _role: string
) {
  const cleanEmail = email.trim().toLowerCase();

  const cred = await createUserWithEmailAndPassword(
    auth,
    cleanEmail,
    password
  );

  await setDoc(doc(db, "users", cred.user.uid), {
    email: cleanEmail,
    name: name.trim(),
    role: "supplier",
    status: "active",
    createdAt: serverTimestamp(),
  });

  return cred.user;
}


export async function login(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  return signOut(auth);
}

export async function getUserRole(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data().role : null;
}

export function onAuthChange(
  callback: (user: FirebaseUser | null) => void
) {
  return onAuthStateChanged(auth, callback);
}
