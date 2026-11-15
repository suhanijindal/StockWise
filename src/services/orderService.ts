import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
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
  const orderRef = await addDoc(collection(db, "orders"), {
    ...data,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Notify supplier
  const supplierSnap = await getDoc(doc(db, "suppliers", data.supplierId));
  if (supplierSnap.exists()) {
    const supplierUserId = supplierSnap.data().userId;
    if (supplierUserId) {
      await addDoc(collection(db, "notifications"), {
        userId: supplierUserId,
        type: "new_order",
        message: `New purchase order #${orderRef.id.slice(0, 8)} assigned to you`,
        read: false,
        relatedOrderId: orderRef.id,
        createdAt: serverTimestamp(),
      });
    }
  }

  return orderRef;
}

export async function updateOrderStatus(orderId: string, status: string, order: any) {
  await updateDoc(doc(db, "orders", orderId), {
    status,
    updatedAt: serverTimestamp(),
  });

  // Notify based on status
  switch (status) {
    case "approved":
      await addDoc(collection(db, "notifications"), {
        userId: order.supplierId,
        type: "order_update",
        message: `Order #${orderId.slice(0, 8)} has been approved`,
        read: false,
        relatedOrderId: orderId,
        createdAt: serverTimestamp(),
      });
      break;

    case "shipped":
      await addDoc(collection(db, "notifications"), {
        userId: order.createdBy,
        type: "order_update",
        message: `Order #${orderId.slice(0, 8)} has been shipped`,
        read: false,
        relatedOrderId: orderId,
        createdAt: serverTimestamp(),
      });
      break;

    case "delivered": {
      // Notify admins
      const admins = await getDocs(
        query(collection(db, "users"), where("role", "==", "admin"))
      );
      for (const adminDoc of admins.docs) {
        await addDoc(collection(db, "notifications"), {
          userId: adminDoc.id,
          type: "order_update",
          message: `Order #${orderId.slice(0, 8)} delivered`,
          read: false,
          relatedOrderId: orderId,
          createdAt: serverTimestamp(),
        });
      }

      // Auto-update product quantities
      for (const item of order.items) {
        const productRef = doc(db, "products", item.productId);
        const productSnap = await getDoc(productRef);
        if (productSnap.exists()) {
          const currentQty = productSnap.data().quantity || 0;
          const newQty = currentQty + item.quantity;
          await updateDoc(productRef, {
            quantity: newQty,
            updatedAt: serverTimestamp(),
          });
          await addDoc(collection(db, "stockMovements"), {
            productId: item.productId,
            productName: item.productName,
            change: item.quantity,
            reason: "Order delivered",
            previousQuantity: currentQty,
            newQuantity: newQty,
            changedBy: order.createdBy,
            orderId: orderId,
            timestamp: serverTimestamp(),
          });
        }
      }
      break;
    }

    case "rejected":
      await addDoc(collection(db, "notifications"), {
        userId: order.createdBy,
        type: "order_update",
        message: `Order #${orderId.slice(0, 8)} was rejected`,
        read: false,
        relatedOrderId: orderId,
        createdAt: serverTimestamp(),
      });
      break;
  }
}