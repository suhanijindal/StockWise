
import {
  collection,
  doc,
  addDoc,
  getDoc,
  writeBatch,
  updateDoc,
  runTransaction,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";

import { auth, db } from "../lib/firebase";

import type {
  Order,
  PurchaseOrder,
  OrderStatus,
  OrderItem,
} from "../types";

const ORDERS_COLLECTION = "orders";
const PRODUCTS_COLLECTION = "products";
const SUPPLIERS_COLLECTION = "suppliers";
const STOCK_MOVEMENTS_COLLECTION = "stockMovements";
const NOTIFICATIONS_COLLECTION = "notifications";

// ==========================================
// 1. LEGACY CREATE ORDER
// ==========================================

export const createOrder = async (
  orderData: Record<string, any>,
): Promise<string> => {
  const docRef = await addDoc(
    collection(db, ORDERS_COLLECTION),
    {
      ...orderData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  );

  return docRef.id;
};

// ==========================================
// 2. SUBSCRIBE TO ALL ORDERS
// ==========================================

export const subscribeToOrders = (
  callback: (orders: Order[]) => void,
) => {
  const q = query(
    collection(db, ORDERS_COLLECTION),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Order[];

    callback(orders);
  });
};

// ==========================================
// 3. SUBSCRIBE TO SUPPLIER ORDERS
// ==========================================


export const subscribeToSupplierOrders = (
  supplierId: string,
  callback: (orders: Order[]) => void,
) => {
  const q = query(
    collection(db, ORDERS_COLLECTION),
    where("supplierId", "==", supplierId),
  );

  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Order[];

    // Sort locally to avoid requiring a composite Firestore index.
    orders.sort((a: any, b: any) => {
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });

    callback(orders);
  });
};


// ==========================================
// 4. CREATE PURCHASE ORDER
// Creates the order and notification atomically.
// ==========================================

export const createPurchaseOrder = async (
  orderData: Omit<
    PurchaseOrder,
    | "id"
    | "createdAt"
    | "updatedAt"
    | "receiptConfirmed"
    | "status"
  >,
): Promise<string> => {
  if (!orderData.items || orderData.items.length === 0) {
    throw new Error(
      "Purchase order must contain at least one product.",
    );
  }

  if (!orderData.supplierId) {
    throw new Error("Supplier ID is missing.");
  }

  const productIds = new Set<string>();

  for (const item of orderData.items) {
    if (productIds.has(item.productId)) {
      throw new Error(
        `Duplicate product: ${item.productName}.`,
      );
    }

    productIds.add(item.productId);

    if (
      !Number.isInteger(item.orderedQuantity) ||
      item.orderedQuantity <= 0
    ) {
      throw new Error(
        `Invalid quantity for ${item.productName}.`,
      );
    }

    if (
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice < 0
    ) {
      throw new Error(
        `Invalid price for ${item.productName}.`,
      );
    }
  }

  // Resolve supplier document to its linked Auth UID.

  const supplierRef = doc(
    db,
    SUPPLIERS_COLLECTION,
    orderData.supplierId,
  );

  const supplierSnap = await getDoc(supplierRef);

  if (!supplierSnap.exists()) {
    throw new Error("Selected supplier does not exist.");
  }

  const supplierData = supplierSnap.data();
  const supplierUserId = supplierData.userId;

  if (
    typeof supplierUserId !== "string" ||
    !supplierUserId.trim()
  ) {
    throw new Error(
      "This supplier has no linked login account. Ask the administrator to link the supplier account.",
    );
  }

  const orderRef = doc(collection(db, ORDERS_COLLECTION));
  const notificationRef = doc(
    collection(db, NOTIFICATIONS_COLLECTION),
  );

  const batch = writeBatch(db);

  batch.set(orderRef, {
    ...orderData,
    status: "Pending",
    receiptConfirmed: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(notificationRef, {
    userId: supplierUserId,
    recipientRole: "supplier",
    title: "New Purchase Order",
    message: `Order ${orderData.orderNumber} has been assigned to you.`,
    type: "order_created",
    relatedId: orderRef.id,
    read: false,
    createdAt: serverTimestamp(),
  });

  await batch.commit();

  return orderRef.id;
};

// ==========================================
// 5. UPDATE ORDER STATUS
// ==========================================


export const updateOrderStatus = async (
  orderId: string,
  newStatus: OrderStatus | string,
  extraData?: any,
): Promise<void> => {
  const allowedStatuses: OrderStatus[] = [
    "Pending",
    "Approved",
    "Processing",
    "Shipped",
    "Delivered",
    "Rejected",
  ];

  const normalizedStatus = allowedStatuses.find(
    (status) => status.toLowerCase() === String(newStatus).toLowerCase(),
  );

  if (!normalizedStatus) {
    throw new Error(`Invalid order status: ${newStatus}`);
  }

  const orderRef = doc(db, ORDERS_COLLECTION, orderId);

  await updateDoc(orderRef, {
    status: normalizedStatus,
    ...(extraData?.rejectionReason
      ? { rejectionReason: extraData.rejectionReason }
      : {}),
    updatedAt: serverTimestamp(),
  });

  // Supplier-driven transitions are reported to the warehouse team.
  // A delivery is reported back to the supplier instead.
  const notifySupplier = normalizedStatus === "Delivered";

  let supplierUserId: string | null = null;

  if (notifySupplier) {
    supplierUserId = await resolveSupplierUserId(orderId, extraData);
  }

  await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
    // userId null marks a genuine role broadcast; anything addressed to
    // one account carries that account's UID instead.
    ...(notifySupplier
      ? { userId: supplierUserId, recipientRole: "supplier" }
      : { userId: null, recipientRole: "warehouse_manager" }),
    title: `Order ${normalizedStatus}`,
    message: `Order #${orderId.slice(0, 6)} status updated to ${normalizedStatus}.`,
    type: "order_status",
    relatedId: orderId,
    read: false,
    createdAt: serverTimestamp(),
  });
};

/**
 * Best-effort lookup of the Auth UID behind an order's supplier, so a
 * notification can be addressed to that supplier directly. Returns null
 * when the supplier has no linked login account.
 */
const resolveSupplierUserId = async (
  orderId: string,
  known?: any,
): Promise<string | null> => {
  try {
    let supplierId = known?.supplierId;

    if (typeof supplierId !== "string" || !supplierId) {
      const orderSnap = await getDoc(
        doc(db, ORDERS_COLLECTION, orderId),
      );

      supplierId = orderSnap.exists()
        ? orderSnap.data().supplierId
        : null;
    }

    if (typeof supplierId !== "string" || !supplierId) {
      return null;
    }

    const supplierSnap = await getDoc(
      doc(db, SUPPLIERS_COLLECTION, supplierId),
    );

    const userId = supplierSnap.exists()
      ? supplierSnap.data().userId
      : null;

    return typeof userId === "string" && userId.trim()
      ? userId
      : null;
  } catch (error) {
    console.error("Could not resolve supplier recipient:", error);
    return null;
  }
};


// ==========================================
// 6. CONFIRM ORDER RECEIPT
// Updates inventory, order and stock history
// in one Firestore transaction.
// ==========================================

export const confirmOrderReceipt = async (
  orderId: string,
  receivedItems: {
    productId: string;
    receivedQuantity: number;
  }[],
  warehouseManagerUid: string,
): Promise<void> => {
  // Ensure the caller is the currently authenticated user.
  // Firestore Security Rules must additionally verify their role.

  if (
    !auth.currentUser ||
    auth.currentUser.uid !== warehouseManagerUid
  ) {
    throw new Error(
      "You are not authorized to confirm this receipt.",
    );
  }

  await runTransaction(db, async (transaction) => {
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    const orderSnap = await transaction.get(orderRef);

    if (!orderSnap.exists()) {
      throw new Error("Purchase order does not exist.");
    }

    const order = orderSnap.data() as PurchaseOrder;

    // The warehouse confirms receipt of a shipment. Marking the order
    // Delivered, restocking inventory and writing the stock movement all
    // happen inside this one transaction, so stock can never move
    // without the order being delivered (and vice versa).
    if (
      order.status !== "Shipped" &&
      order.status !== "Delivered"
    ) {
      throw new Error(
        "Order must be marked as Shipped by the supplier before confirming receipt.",
      );
    }

    if (order.receiptConfirmed) {
      throw new Error(
        "Order receipt has already been confirmed.",
      );
    }

    if (
      !Array.isArray(order.items) ||
      order.items.length === 0
    ) {
      throw new Error("Purchase order has no products.");
    }

    if (!receivedItems.length) {
      throw new Error(
        "No received quantities were provided.",
      );
    }

    // Validate order items and prevent duplicate products.

    const orderProductIds = new Set<string>();

    for (const item of order.items) {
      if (
        !item.productId ||
        orderProductIds.has(item.productId)
      ) {
        throw new Error(
          "Purchase order contains duplicate or invalid products.",
        );
      }

      orderProductIds.add(item.productId);

      if (
        !Number.isInteger(item.orderedQuantity) ||
        item.orderedQuantity <= 0
      ) {
        throw new Error(
          `Invalid ordered quantity for ${item.productName}.`,
        );
      }
    }

    // Validate received quantities.

    const receivedMap = new Map<string, number>();

    for (const item of receivedItems) {
      if (
        !Number.isInteger(item.receivedQuantity) ||
        item.receivedQuantity < 0
      ) {
        throw new Error(
          "Received quantities must be non-negative integers.",
        );
      }

      if (receivedMap.has(item.productId)) {
        throw new Error(
          "Duplicate product in received items.",
        );
      }

      const orderedItem = order.items.find(
        (ordered) => ordered.productId === item.productId,
      );

      if (!orderedItem) {
        throw new Error(
          "Received product does not belong to this order.",
        );
      }

      if (
        item.receivedQuantity >
        orderedItem.orderedQuantity
      ) {
        throw new Error(
          `Received quantity for ${orderedItem.productName} cannot exceed the ordered quantity.`,
        );
      }

      receivedMap.set(
        item.productId,
        item.receivedQuantity,
      );
    }

    if (receivedMap.size !== order.items.length) {
      throw new Error(
        "Received products do not match the purchase order.",
      );
    }

    // Read the supplier before any writes so the delivery notification
    // can be addressed to their login account.

    let supplierUserId: string | null = null;

    if (order.supplierId) {
      const supplierSnap = await transaction.get(
        doc(db, SUPPLIERS_COLLECTION, order.supplierId),
      );

      const linkedId = supplierSnap.exists()
        ? supplierSnap.data().userId
        : null;

      supplierUserId =
        typeof linkedId === "string" && linkedId.trim()
          ? linkedId
          : null;
    }

    // Read every product before performing any writes.

    const productRefs = order.items.map((item) =>
      doc(db, PRODUCTS_COLLECTION, item.productId),
    );

    const productSnaps = await Promise.all(
      productRefs.map((ref) => transaction.get(ref)),
    );

    const updatedItems: OrderItem[] = order.items.map(
      (item) => ({
        ...item,
        receivedQuantity: receivedMap.get(item.productId)!,
      }),
    );

    // Prepare inventory updates.

    const stockUpdates = order.items.map(
      (item, index) => {
        const productSnap = productSnaps[index];

        if (!productSnap.exists()) {
          throw new Error(
            `Product ${item.productName} does not exist.`,
          );
        }

        const productData = productSnap.data();

        const currentQuantity = Number(
          productData.quantity ?? 0,
        );

        if (
          !Number.isInteger(currentQuantity) ||
          currentQuantity < 0
        ) {
          throw new Error(
            `Invalid inventory quantity for ${item.productName}.`,
          );
        }

        const receivedQuantity =
          receivedMap.get(item.productId)!;

        return {
          item,
          productRef: productRefs[index],
          productName: productData.name,
          currentQuantity,
          receivedQuantity,
          newQuantity:
            currentQuantity + receivedQuantity,
        };
      },
    );

    // Apply stock and stock movement writes.

    for (const update of stockUpdates) {
      if (update.receivedQuantity === 0) continue;

      transaction.update(update.productRef, {
        quantity: update.newQuantity,
        updatedAt: serverTimestamp(),
      });

      const movementRef = doc(
        collection(db, STOCK_MOVEMENTS_COLLECTION),
      );

      transaction.set(movementRef, {
        productId: update.item.productId,
        productName: update.productName,
        change: update.receivedQuantity,
        previousQuantity: update.currentQuantity,
        newQuantity: update.newQuantity,
        reason: `Purchase Order #${order.orderNumber} Receipt`,
        orderId,
        changedBy: warehouseManagerUid,
        timestamp: serverTimestamp(),
      });
    }

    // Confirm the order.

    transaction.update(orderRef, {
      items: updatedItems,
      status: "Delivered",
      receiptConfirmed: true,
      confirmedAt: serverTimestamp(),
      confirmedBy: warehouseManagerUid,
      updatedAt: serverTimestamp(),
    });

    // Tell the supplier their delivery was received.
    if (supplierUserId) {
      const notificationRef = doc(
        collection(db, NOTIFICATIONS_COLLECTION),
      );

      transaction.set(notificationRef, {
        userId: supplierUserId,
        recipientRole: "supplier",
        title: "Delivery Confirmed",
        message: `Order ${order.orderNumber} was received and confirmed by the warehouse.`,
        type: "order_update",
        relatedId: orderId,
        read: false,
        createdAt: serverTimestamp(),
      });
    }
  });
};
