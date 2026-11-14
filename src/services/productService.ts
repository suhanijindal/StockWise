import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp
} from "firebase/firestore";
import { db } from "../lib/firebase";

const PRODUCTS = "products";
const STOCK_MOVEMENTS = "stockMovements";

export function subscribeToProducts(callback: (products: any[]) => void) {
  const q = query(collection(db, PRODUCTS), orderBy("updatedAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function addProduct(data: any) {
  return addDoc(collection(db, PRODUCTS), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateProduct(id: string, data: any) {
  return updateDoc(doc(db, PRODUCTS, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProduct(id: string) {
  return deleteDoc(doc(db, PRODUCTS, id));
}

export async function adjustStock(
  productId: string,
  change: number,
  reason: string,
  currentQuantity: number,
  productName: string,
  userId: string
) {
  const newQuantity = currentQuantity + change;

  await updateDoc(doc(db, PRODUCTS, productId), {
    quantity: newQuantity,
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, STOCK_MOVEMENTS), {
    productId,
    productName,
    change,
    reason,
    previousQuantity: currentQuantity,
    newQuantity,
    changedBy: userId,
    timestamp: serverTimestamp(),
  });
}