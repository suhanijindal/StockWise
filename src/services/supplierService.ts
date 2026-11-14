import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, getDocs, serverTimestamp
} from "firebase/firestore";
import { db } from "../lib/firebase";

const SUPPLIERS = "suppliers";

export function subscribeToSuppliers(callback: (suppliers: any[]) => void) {
  return onSnapshot(
    query(collection(db, SUPPLIERS), orderBy("name")),
    (snapshot) => {
      callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }
  );
}

export async function addSupplier(data: any) {
  return addDoc(collection(db, SUPPLIERS), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function updateSupplier(id: string, data: any) {
  return updateDoc(doc(db, SUPPLIERS, id), data);
}

export async function deleteSupplier(id: string) {
  const productsWithSupplier = await getDocs(
    query(collection(db, "products"), where("supplierId", "==", id))
  );
  if (!productsWithSupplier.empty) {
    throw new Error("Cannot delete supplier — products are still linked");
  }
  return deleteDoc(doc(db, SUPPLIERS, id));
}