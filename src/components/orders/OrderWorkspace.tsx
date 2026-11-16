
import { useEffect, useState } from "react";

import { OrderDetails } from "./OrderDetails";
import { OrderForm } from "./OrderForm";

import { useAuth } from "../../services/AuthContext";

import {
  subscribeToOrders,
  subscribeToSupplierOrders,
} from "../../services/orderService";

import type {Order, PurchaseOrder, OrderStatus } from "../../types";

type OrderFilter = OrderStatus | "all" | "received";

const orderStatuses: OrderStatus[] = [
  "Pending",
  "Approved",
  "Processing",
  "Shipped",
  "Delivered",
  "Rejected",
];

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const orderDate = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function OrderWorkspace() {
  const { user, role, loading: authLoading } = useAuth();

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filter, setFilter] = useState<OrderFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    setOrders([]);
    setSelectedId(null);
    setCreating(false);
    setLoading(true);
    setError("");

    if (!user || !role) {
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let active = true;

    const handleOrders = (data: Order[]) => {
      if (!active) return;

      setOrders(data as PurchaseOrder[]);
      setLoading(false);
    };

    if (role === "admin" || role === "warehouse_manager") {
      unsubscribe = subscribeToOrders(handleOrders);
    } else if (role === "supplier") {
      if (!user.supplierId) {
        setError(
          "Your supplier account is not linked to a supplier record. Please contact the administrator.",
        );
        setLoading(false);
      } else {
        unsubscribe = subscribeToSupplierOrders(
          user.supplierId,
          handleOrders,
        );
      }
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [user?.uid, user?.supplierId, role, authLoading]);

  const selectedOrder = orders.find(
    (order) => order.id === selectedId,
  );

  const filteredOrders = orders.filter((order) => {
    if (filter === "all") return true;
    if (filter === "received") return order.receiptConfirmed;
    return order.status === filter;
  });

  const supplierView = role === "supplier";

  if (authLoading) {
    return <p className="muted">Loading account...</p>;
  }

  if (!user || !role) {
    return <p className="error">Please log in to view orders.</p>;
  }

  return (
    <section className="workspace">
      <div className="section-heading">
        <div>
          <h1>{supplierView ? "My orders" : "Purchase orders"}</h1>

          <p className="muted">
            {supplierView
              ? "View assigned orders and update their progress."
              : "Create supplier orders and confirm received stock."}
          </p>
        </div>

        {!supplierView && !creating && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              setSelectedId(null);
              setCreating(true);
            }}
          >
            New order
          </button>
        )}
      </div>

      {creating && (
        <OrderForm
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setFilter("all");
            setSelectedId(id);
            setCreating(false);
          }}
        />
      )}

      {selectedOrder && !creating && (
        <OrderDetails
          key={selectedOrder.id}
          order={selectedOrder}
          role={role}
          onClose={() => setSelectedId(null)}
        />
      )}

      <div className="panel">
        <div className="section-heading filter">
          <h2>
            Order list{" "}
            <span className="count">{filteredOrders.length}</span>
          </h2>

          <div className="filter-control">
            <label htmlFor="order-filter">Status</label>

            <select
              id="order-filter"
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as OrderFilter)
              }
            >
              <option value="all">All orders</option>

              {orderStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}

              <option value="received">Received</option>
            </select>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        {loading ? (
          <p className="muted empty">Loading orders...</p>
        ) : filteredOrders.length === 0 ? (
          <p className="muted empty">
            {error
              ? ""
              : filter === "all"
                ? supplierView
                  ? "You have no assigned orders yet."
                  : "No purchase orders yet. Create one to get started."
                : "No orders match this status."}
          </p>
        ) : (
          <div className="scroll-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Order</th>

                  {!supplierView && (
                    <th scope="col">Supplier</th>
                  )}

                  <th scope="col">Created</th>
                  <th scope="col">Status</th>

                  <th scope="col" className="numeric">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => {
                          setCreating(false);
                          setSelectedId(order.id ?? null);
                        }}
                      >
                        #{order.orderNumber}
                      </button>
                    </td>

                    {!supplierView && (
                      <td>{order.supplierName}</td>
                    )}

                    <td>
                      {order.createdAt?.toDate
                        ? orderDate.format(
                            order.createdAt.toDate(),
                          )
                        : "—"}
                    </td>

                    <td>
                      <span className="order-status">
                        {order.receiptConfirmed
                          ? "Received"
                          : order.status}
                      </span>
                    </td>

                    <td className="numeric">
                      {money.format(order.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
