
import { useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "../../services/AuthContext";

import {
  updateOrderStatus,
  confirmOrderReceipt,
} from "../../services/orderService";

import type {
  PurchaseOrder,
  OrderStatus,
} from "../../types";

type Props = {
  order: PurchaseOrder;
  role: "admin" | "warehouse_manager" | "supplier";
  onClose: () => void;
};

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

const supplierActions: Record<
  OrderStatus,
  { status: OrderStatus; label: string }[]
> = {
  Pending: [
    { status: "Approved", label: "Accept order" },
    { status: "Rejected", label: "Reject order" },
  ],
  Approved: [
    { status: "Processing", label: "Start processing" },
  ],
  Processing: [
    { status: "Shipped", label: "Mark as shipped" },
  ],
  Shipped: [
    { status: "Delivered", label: "Mark as delivered" },
  ],
  Delivered: [],
  Rejected: [],
};

function formatDate(value: any) {
  if (!value) return "—";

  const date = value.toDate
    ? value.toDate()
    : new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : orderDate.format(date);
}

export function OrderBadge({
  order,
}: {
  order: PurchaseOrder;
}) {
  const state = order.receiptConfirmed
    ? "Received"
    : order.status;

  return (
    <span className={`badge ${state.toLowerCase()}`}>
      {state}
    </span>
  );
}

export function OrderDetails({
  order,
  role,
  onClose,
}: Props) {
  const { user } = useAuth();

  const [received, setReceived] = useState<
    Record<string, string>
  >({});

  const [confirmingRejection, setConfirmingRejection] =
    useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const orderId = order.id;

  const availableActions =
    role === "supplier"
      ? supplierActions[order.status] ?? []
      : [];

  const canReceive =
    role === "warehouse_manager" &&
    order.status === "Delivered" &&
    !order.receiptConfirmed;

  async function perform(action: () => Promise<void>) {
    setError("");
    setBusy(true);

    try {
      await action();
      setConfirmingRejection(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save the order update.",
      );
    } finally {
      setBusy(false);
    }
  }

  function updateStatus(status: OrderStatus) {
    if (!orderId) {
      setError("Order ID is missing.");
      return;
    }

    if (status === "Rejected" && !confirmingRejection) {
      setConfirmingRejection(true);
      return;
    }

    void perform(() => updateOrderStatus(orderId, status));
  }

  function confirmReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canReceive || !orderId || !user) return;

    const receivedItems = order.items.map((item) => ({
      productId: item.productId,
      receivedQuantity: Number(
        received[item.productId] ?? item.orderedQuantity,
      ),
    }));

    const invalidItem = receivedItems.some(
      (item, index) =>
        !Number.isInteger(item.receivedQuantity) ||
        item.receivedQuantity < 0 ||
        item.receivedQuantity > order.items[index].orderedQuantity,
    );

    if (invalidItem) {
      setError(
        "Enter valid received quantities for all products.",
      );
      return;
    }

    void perform(() =>
      confirmOrderReceipt(
        orderId,
        receivedItems,
        user.uid,
      ),
    );
  }

  return (
    <div className="panel">
      <div className="section-heading">
        <div>
          <div className="heading-with-badge">
            <h2>Order #{order.orderNumber}</h2>
            <OrderBadge order={order} />
          </div>

          <p className="muted">
            {order.supplierName} · {formatDate(order.createdAt)}
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {order.status === "Delivered" &&
        !order.receiptConfirmed && (
          <p className="notice">
            Delivered by the supplier. Awaiting warehouse confirmation.
          </p>
        )}

      {order.receiptConfirmed && (
        <p className="notice">
          Receipt confirmed {formatDate(order.confirmedAt)}.
        </p>
      )}

      <div className="scroll-table">
        <table>
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Ordered</th>

              {(canReceive || order.receiptConfirmed) && (
                <th scope="col">Received</th>
              )}

              <th scope="col" className="numeric">
                Unit price
              </th>
            </tr>
          </thead>

          <tbody>
            {order.items.map((item) => (
              <tr key={item.productId}>
                <td>{item.productName}</td>
                <td>{item.orderedQuantity}</td>

                {canReceive && (
                  <td>
                    <input
                      aria-label={`Received quantity for ${item.productName}`}
                      type="number"
                      min="0"
                      max={item.orderedQuantity}
                      step="1"
                      required
                      disabled={busy}
                      value={
                        received[item.productId] ??
                        String(item.orderedQuantity)
                      }
                      onChange={(event) =>
                        setReceived((previous) => ({
                          ...previous,
                          [item.productId]: event.target.value,
                        }))
                      }
                    />
                  </td>
                )}

                {order.receiptConfirmed && (
                  <td>{item.receivedQuantity ?? 0}</td>
                )}

                <td className="numeric">
                  {money.format(item.unitPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="numeric">
        <strong>
          Order total {money.format(order.totalAmount)}
        </strong>
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {canReceive && (
        <form onSubmit={confirmReceipt}>
          <div className="panel-footer">
            <p className="muted">
              Enter the quantities received. Confirming adds
              those units to inventory and closes the order.
            </p>

            <button
              type="submit"
              className="primary"
              disabled={busy}
            >
              {busy ? "Confirming..." : "Confirm receipt"}
            </button>
          </div>
        </form>
      )}

      {availableActions.length > 0 && (
        <div className="panel-footer">
          {confirmingRejection ? (
            <>
              <p>
                Are you sure you want to reject this order?
              </p>

              <div className="actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmingRejection(false)}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => updateStatus("Rejected")}
                >
                  Confirm rejection
                </button>
              </div>
            </>
          ) : (
            <div className="actions push-right">
              {availableActions.map(({ status, label }) => (
                <button
                  type="button"
                  key={status}
                  className={
                    status === "Rejected" ? "danger" : "primary"
                  }
                  disabled={busy}
                  onClick={() => updateStatus(status)}
                >
                  {busy ? "Saving..." : label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
