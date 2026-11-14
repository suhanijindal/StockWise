import { Timestamp } from "firebase/firestore";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "warehouse_manager" | "supplier";
  createdAt: Timestamp;
}

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

export interface Order {
  id: string;
  supplierId: string;
  createdBy: string;
  status: "pending" | "approved" | "processing" | "shipped" | "delivered" | "rejected";
  items: OrderItem[];
  totalAmount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface Notification {
  id: string;
  userId: string;
  type: "low_stock" | "new_order" | "order_update";
  message: string;
  read: boolean;
  relatedOrderId?: string;
  relatedProductId?: string;
  createdAt: Timestamp;
}

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