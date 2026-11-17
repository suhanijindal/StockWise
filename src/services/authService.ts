
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
  updateDoc,
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
    await autoLinkSupplierByEmail(
      cred.user.uid,
      cleanEmail,
      name.trim()
    );
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
  email: string,
  displayName = ""
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

    if (claimable.length > 1) {
      console.warn(
        `${claimable.length} supplier records use ${cleanEmail}; link this account manually.`
      );
      return null;
    }

    // Nothing to claim: register this account as its own supplier so it
    // can start receiving purchase orders straight away. The company,
    // phone and address are left blank for the supplier to complete.
    if (claimable.length === 0) {
      const newSupplierRef = doc(collection(db, "suppliers"));

      const fallbackName =
        displayName.trim() || cleanEmail.split("@")[0] || "New supplier";

      // Written one after the other, not as a batch. The security rule
      // for the user document checks that the supplier record exists and
      // belongs to this account, and reads inside a batch see the state
      // from before the batch, so the record has to land first.
      await setDoc(newSupplierRef, {
        name: fallbackName,
        company: fallbackName,
        email: cleanEmail,
        phone: "",
        address: "",
        userId: uid,
        createdAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "users", uid),
        { supplierId: newSupplierRef.id },
        { merge: true }
      );

      return newSupplierRef.id;
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

    // Same ordering requirement as above: claim the supplier record
    // first, then point the user profile at it.
    await updateDoc(supplierDoc.ref, { userId: uid });

    await setDoc(
      doc(db, "users", uid),
      { supplierId: supplierDoc.id },
      { merge: true }
    );

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
