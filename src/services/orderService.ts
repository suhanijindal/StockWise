import {
  collection, doc, addDoc, updateDoc,
  query, where, orderBy, onSnapshot, serverTimestamp
} from "firebase/firestore";
import { db } from "../lib/firebase";

export function subscribeToOrders(callback: (orders: any[]) => void) {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function subscribeToSupplierOrders(supplierId: string, callback: (orders: any[]) => void) {
  const q = query(
    collection(db, "orders"),
    where("supplierId", "==", supplierId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function createOrder(data: any) {
  return addDoc(collection(db, "orders"), {
    ...data,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateOrderStatus(orderId: string, status: string) {
  return updateDoc(doc(db, "orders", orderId), {
    status,
    updatedAt: serverTimestamp(),
  });
}