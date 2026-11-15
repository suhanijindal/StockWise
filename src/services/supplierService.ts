
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "../lib/firebase";
import type { Supplier } from "../types";

const SUPPLIERS = "suppliers";
const PRODUCTS = "products";

type SupplierInput = Omit<Supplier, "id" | "createdAt">;
type SupplierUpdate = Partial<SupplierInput>;
type SubscriptionError = (error: Error) => void;

export function subscribeToSuppliers(
  callback: (suppliers: Supplier[]) => void,
  onError?: SubscriptionError
) {
  return onSnapshot(
    query(collection(db, SUPPLIERS), orderBy("name")),
    (snapshot) => {
      const suppliers = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Supplier[];

      callback(suppliers);
    },
    (error) => {
      console.error("Suppliers subscription failed:", error);
      onError?.(error);
    }
  );
}

export async function addSupplier(data: SupplierInput) {
  return addDoc(collection(db, SUPPLIERS), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function updateSupplier(
  id: string,
  data: SupplierUpdate
) {
  const supplierRef = doc(db, SUPPLIERS, id);

  // If the supplier name is unchanged, update only the supplier document.
  if (data.name === undefined) {
    return updateDoc(supplierRef, data);
  }

  // Find all products linked to this supplier.
  const linkedProducts = await getDocs(
    query(
      collection(db, PRODUCTS),
      where("supplierId", "==", id)
    )
  );

  // Firestore batches support a maximum of 500 writes.
  // One write is reserved for the supplier document.
  if (linkedProducts.size > 499) {
    throw new Error(
      "This supplier has too many linked products to rename in one operation."
    );
  }

  // Update supplier and linked product names atomically.
  const batch = writeBatch(db);

  batch.update(supplierRef, data);

  linkedProducts.docs.forEach((productDoc) => {
    batch.update(productDoc.ref, {
      supplierName: data.name,
    });
  });

  return batch.commit();
}

export async function deleteSupplier(id: string) {
  // Check linked products.
  const linkedProducts = await getDocs(
    query(
      collection(db, PRODUCTS),
      where("supplierId", "==", id)
    )
  );

  if (!linkedProducts.empty) {
    throw new Error(
      `Cannot delete supplier — ${linkedProducts.size} product(s) are still linked to this supplier. Reassign those products first.`
    );
  }

  // Check purchase order history.
  const linkedOrders = await getDocs(
    query(
      collection(db, "orders"),
      where("supplierId", "==", id)
    )
  );

  if (!linkedOrders.empty) {
    throw new Error(
      `Cannot delete supplier — this supplier is linked to ${linkedOrders.size} purchase order(s).`
    );
  }

  return deleteDoc(doc(db, SUPPLIERS, id));
}