import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, getDocs, serverTimestamp
} from "firebase/firestore";

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
  userId: string,
  minStockThreshold: number
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

  // Low stock alert
  if (newQuantity <= minStockThreshold) {
    const usersSnap = await getDocs(
      query(collection(db, "users"), where("role", "in", ["admin", "warehouse_manager"]))
    );
    for (const userDoc of usersSnap.docs) {
      await addDoc(collection(db, "notifications"), {
        userId: userDoc.id,
        type: "low_stock",
        message: `Low stock: ${productName} has ${newQuantity} units (threshold: ${minStockThreshold})`,
        read: false,
        relatedProductId: productId,
        createdAt: serverTimestamp(),
      });
    }
  }
}