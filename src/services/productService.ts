
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
  runTransaction,
} from "firebase/firestore";

import { db } from "../lib/firebase";
import type { Product, StockMovement } from "../types";

const PRODUCTS = "products";
const STOCK_MOVEMENTS = "stockMovements";

type ProductInput = Omit<
  Product,
  "id" | "createdAt" | "updatedAt"
>;

type ProductUpdate = Partial<ProductInput>;

type SubscriptionError = (error: Error) => void;

async function validateUniqueSku(
  sku: string,
  excludeProductId?: string
): Promise<string> {
  const normalizedSku = sku.trim();
  const normalizedValue = normalizedSku.toLowerCase();

  if (!normalizedSku) {
    throw new Error("Product SKU is required.");
  }

  const snapshot = await getDocs(collection(db, PRODUCTS));

  const duplicate = snapshot.docs.some((productDoc) => {
    if (productDoc.id === excludeProductId) return false;

    const existingSku = String(
      productDoc.data().sku ?? ""
    ).trim().toLowerCase();

    return existingSku === normalizedValue;
  });

  if (duplicate) {
    throw new Error("A product with this SKU already exists.");
  }

  return normalizedSku;
}

export function subscribeToProducts(
  callback: (products: Product[]) => void,
  onError?: SubscriptionError
) {
  const q = query(
    collection(db, PRODUCTS),
    orderBy("updatedAt", "desc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const products = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Product[];

      callback(products);
    },
    (error) => {
      console.error("Products subscription failed:", error);
      onError?.(error);
    }
  );
}

export async function addProduct(data: ProductInput) {
  return addDoc(collection(db, PRODUCTS), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}


export async function addProductWithInitialStock(
  data: ProductInput,
  userId?: string
) {
  const initialQuantity = data.quantity;

  if (!Number.isInteger(initialQuantity) || initialQuantity < 0) {
    throw new Error("Initial stock must be a non-negative whole number.");
  }

  if (initialQuantity > 0 && !userId) {
    throw new Error("You must be logged in to record initial stock.");
  }

  const validatedSku = await validateUniqueSku(data.sku);

  const productRef = doc(collection(db, PRODUCTS));

  const movementRef =
    initialQuantity > 0
      ? doc(collection(db, STOCK_MOVEMENTS))
      : null;

  await runTransaction(db, async (transaction) => {
    transaction.set(productRef, {
      ...data,
      sku: validatedSku,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (movementRef && userId) {
      transaction.set(movementRef, {
        productId: productRef.id,
        productName: data.name,
        change: initialQuantity,
        reason: "Initial stock",
        previousQuantity: 0,
        newQuantity: initialQuantity,
        changedBy: userId,
        timestamp: serverTimestamp(),
      });
    }
  });

  // Create low-stock notifications after the successful transaction.
  if (
    initialQuantity > 0 &&
    initialQuantity <= data.minStockThreshold
  ) {
    try {
      const usersSnap = await getDocs(
        query(
          collection(db, "users"),
          where("role", "in", ["admin", "warehouse_manager"])
        )
      );

      await Promise.all(
        usersSnap.docs.map((userDoc) =>
          addDoc(collection(db, "notifications"), {
            userId: userDoc.id,
            type: "low_stock",
            message: `Low stock: ${data.name} has ${initialQuantity} units (threshold: ${data.minStockThreshold})`,
            read: false,
            relatedProductId: productRef.id,
            createdAt: serverTimestamp(),
          })
        )
      );
    } catch (error) {
      console.error(
        "Product created, but low-stock notifications failed:",
        error
      );
    }
  }

  return productRef;
}

export async function updateProduct(
  id: string,
  data: ProductUpdate
) {
  const validatedSku =
    data.sku !== undefined
      ? await validateUniqueSku(data.sku, id)
      : undefined;

  return updateDoc(doc(db, PRODUCTS, id), {
    ...data,
    ...(validatedSku !== undefined && { sku: validatedSku }),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProduct(id: string) {
  // Check whether the product is referenced in stock history.
  const movementsSnapshot = await getDocs(
    query(
      collection(db, STOCK_MOVEMENTS),
      where("productId", "==", id)
    )
  );

  if (!movementsSnapshot.empty) {
    throw new Error(
      "Cannot delete this product because it has stock movement history."
    );
  }

  // Check whether the product is referenced in purchase orders.
  const ordersSnapshot = await getDocs(collection(db, "orders"));

  const hasOrderHistory = ordersSnapshot.docs.some((orderDoc) => {
    const items = orderDoc.data().items;

    return (
      Array.isArray(items) &&
      items.some(
        (item: { productId?: string }) => item.productId === id
      )
    );
  });

  if (hasOrderHistory) {
    throw new Error(
      "Cannot delete this product because it is linked to a purchase order."
    );
  }

  // Delete only when no historical references exist.
  return deleteDoc(doc(db, PRODUCTS, id));
}


// Atomic stock adjustment using a Firestore transaction
export async function adjustStock(
  productId: string,
  change: number,
  reason: string,
  _currentQuantity: number,
  productName: string,
  userId: string,
  minStockThreshold: number
) {
  if (!Number.isInteger(change) || change === 0) {
    throw new Error("Stock change must be a non-zero whole number.");
  }

  if (!reason.trim()) {
    throw new Error("Please provide a reason for the stock adjustment.");
  }

  const productRef = doc(db, PRODUCTS, productId);
  let newQuantity = 0;
  let previousQuantity = 0;
  let actualProductName = productName;
  let actualThreshold = minStockThreshold;

  await runTransaction(db, async (transaction) => {
    const productSnapshot = await transaction.get(productRef);

    if (!productSnapshot.exists()) {
      throw new Error("Product not found.");
    }

    const productData = productSnapshot.data();

    const currentQuantity = Number(productData.quantity ?? 0);
    previousQuantity = currentQuantity;

    if (!Number.isInteger(currentQuantity)) {
      throw new Error("Stored stock quantity is invalid.");
    }

    newQuantity = currentQuantity + change;

    if (newQuantity < 0) {
      throw new Error("Stock quantity cannot be negative.");
    }

    actualProductName = productData.name || productName;
    actualThreshold = Number(
      productData.minStockThreshold ?? minStockThreshold
    );

    const movementRef = doc(collection(db, STOCK_MOVEMENTS));

    transaction.update(productRef, {
      quantity: newQuantity,
      updatedAt: serverTimestamp(),
    });

    transaction.set(movementRef, {
      productId,
      productName: actualProductName,
      change,
      reason: reason.trim(),
      previousQuantity: currentQuantity,
      newQuantity,
      changedBy: userId,
      timestamp: serverTimestamp(),
    });
  });

  // Create low-stock notifications after the transaction succeeds.
  // Notification failure should not undo a successful stock adjustment.
  if ( previousQuantity > actualThreshold && newQuantity <= actualThreshold) {
    try {
      const usersSnap = await getDocs(
        query(
          collection(db, "users"),
          where("role", "in", ["admin", "warehouse_manager"])
        )
      );

      await Promise.all(
        usersSnap.docs.map((userDoc) =>
          addDoc(collection(db, "notifications"), {
            userId: userDoc.id,
            type: "low_stock",
            message: `Low stock: ${actualProductName} has ${newQuantity} units (threshold: ${actualThreshold})`,
            read: false,
            relatedProductId: productId,
            createdAt: serverTimestamp(),
          })
        )
      );
    } catch (error) {
      console.error("Stock updated, but low-stock notifications failed:", error);
    }
  }
}

export function subscribeToStockMovements(
  callback: (movements: StockMovement[]) => void,
  onError?: SubscriptionError
) {
  const q = query(
    collection(db, STOCK_MOVEMENTS),
    orderBy("timestamp", "desc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const movements = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as StockMovement[];

      callback(movements);
    },
    (error) => {
      console.error("Stock movements subscription failed:", error);
      onError?.(error);
    }
  );
}
