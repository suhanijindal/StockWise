
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../lib/firebase";
import type { User as FirebaseUser } from "firebase/auth";


const VALID_ROLES = [
  "admin",
  "warehouse_manager",
  "supplier",
] as const;

export type SignupRole = (typeof VALID_ROLES)[number];

function isSignupRole(value: string): value is SignupRole {
  return (VALID_ROLES as readonly string[]).includes(value);
}

export async function signup(
  email: string,
  password: string,
  name: string,
  role: string
) {
  if (!isSignupRole(role)) {
    throw new Error(
      `Invalid role "${role}". Expected one of: ${VALID_ROLES.join(", ")}.`
    );
  }

  const cleanEmail = email.trim().toLowerCase();

  const cred = await createUserWithEmailAndPassword(
    auth,
    cleanEmail,
    password
  );

  await setDoc(doc(db, "users", cred.user.uid), {
    email: cleanEmail,
    name: name.trim(),
    role,
    status: "active",
    createdAt: serverTimestamp(),
  });

  // Claim the matching supplier record, if an admin has already created
  // one for this email address. Best-effort: signup still succeeds when
  // there is no match and the account is linked manually later.
  if (role === "supplier") {
    await autoLinkSupplierByEmail(cred.user.uid, cleanEmail);
  }

  return cred.user;
}


/**
 * Connects a supplier login to the supplier record that carries the same
 * email address, writing both halves of the link:
 *
 *   users/{uid}.supplierId  ->  the supplier document
 *   suppliers/{id}.userId   ->  the Auth UID
 *
 * An administrator still creates the supplier record; this only saves
 * them from linking each account by hand afterwards. The link is only
 * made when exactly one unlinked supplier matches, so an ambiguous or
 * already-claimed record always falls back to manual linking.
 *
 * Returns the supplier document ID when a link was made, otherwise null.
 * Never throws: a failure here must not break signing up or signing in.
 */
export async function autoLinkSupplierByEmail(
  uid: string,
  email: string
): Promise<string | null> {
  const cleanEmail = email.trim().toLowerCase();

  if (!uid || !cleanEmail) return null;

  try {
    const matches = await getDocs(
      query(
        collection(db, "suppliers"),
        where("email", "==", cleanEmail)
      )
    );

    const claimable = matches.docs.filter((match) => {
      const linked = match.data().userId;
      // Free, or already pointing at this very account.
      return (
        typeof linked !== "string" || !linked.trim() || linked === uid
      );
    });

    if (claimable.length !== 1) {
      if (claimable.length > 1) {
        console.warn(
          `${claimable.length} supplier records use ${cleanEmail}; link this account manually.`
        );
      }
      return null;
    }

    const supplierDoc = claimable[0];

    if (supplierDoc.data().userId === uid) {
      // Supplier side is already linked; make sure the user side is too.
      await setDoc(
        doc(db, "users", uid),
        { supplierId: supplierDoc.id },
        { merge: true }
      );

      return supplierDoc.id;
    }

    const batch = writeBatch(db);

    batch.update(supplierDoc.ref, { userId: uid });
    batch.set(
      doc(db, "users", uid),
      { supplierId: supplierDoc.id },
      { merge: true }
    );

    await batch.commit();

    return supplierDoc.id;
  } catch (error) {
    console.error("Automatic supplier linking failed:", error);
    return null;
  }
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
