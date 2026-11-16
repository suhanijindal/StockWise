
import { Timestamp } from "firebase/firestore";

// USER
export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "warehouse_manager" | "supplier";
  createdAt: Timestamp;
}

// PRODUCT
export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  minStockThreshold: number;
  price: number;
  supplierId: string;
  supplierName: string;
  imageUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// SUPPLIER
export interface Supplier {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  userId?: string;
  createdAt: Timestamp;
}

// LEGACY ORDER
// Kept for compatibility with existing mock data and dashboard.

export interface Order {
  id?: string;
  [key: string]: any;
}

// PURCHASE ORDER STATUS
export type OrderStatus =
  | "Pending"
  | "Approved"
  | "Processing"
  | "Shipped"
  | "Delivered"
  | "Rejected";

// PURCHASE ORDER ITEM
export interface OrderItem {
  productId: string;
  productName: string;
  sku?: string;
  orderedQuantity: number;
  receivedQuantity?: number;
  unitPrice: number;
}

// PURCHASE ORDER
export interface PurchaseOrder {
  id?: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  createdBy: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  notes?: string;
  rejectionReason?: string;
  receiptConfirmed: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  confirmedAt?: Timestamp;
  confirmedBy?: string;
}

// NOTIFICATION
export interface Notification {
  id: string;
  userId?: string;
  recipientId?: string;
  recipientRole?: "supplier" | "warehouse_manager" | "admin";
  title?: string;
  type:
    | "low_stock"
    | "new_order"
    | "order_update"
    | "order_created"
    | "order_status";
  message: string;
  read: boolean;
  relatedId?: string;
  relatedOrderId?: string;
  relatedProductId?: string;
  createdAt: Timestamp;
}

// STOCK MOVEMENT
export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  change: number;
  reason: string;
  previousQuantity: number;
  newQuantity: number;
  changedBy: string;
  orderId?: string;
  timestamp: Timestamp;
}
