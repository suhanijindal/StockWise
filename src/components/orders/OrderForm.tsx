
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { subscribeToProducts } from "../../services/productService";
import { subscribeToSuppliers } from "../../services/supplierService";
import { createPurchaseOrder } from "../../services/orderService";
import { useAuth } from "../../services/AuthContext";

import type { Product, Supplier } from "../../types";

type Props = {
  onCreated: (id: string) => void;
  onCancel: () => void;
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function OrderForm({ onCreated, onCancel }: Props) {
  const { user, role } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [supplierId, setSupplierId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let productsLoaded = false;
    let suppliersLoaded = false;

    const checkLoaded = () => {
      if (productsLoaded && suppliersLoaded) {
        setLoading(false);
      }
    };

    const unsubscribeProducts = subscribeToProducts(
      (data) => {
        setProducts(data);
        productsLoaded = true;
        checkLoaded();
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    const unsubscribeSuppliers = subscribeToSuppliers(
      (data) => {
        setSuppliers(data);
        suppliersLoaded = true;
        checkLoaded();
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeProducts();
      unsubscribeSuppliers();
    };
  }, []);

  const availableProducts = useMemo(
    () => products.filter((product) => product.supplierId === supplierId),
    [products, supplierId]
  );

  const selectedProducts = availableProducts.filter(
    (product) => Number(quantities[product.id]) > 0
  );

  const total = selectedProducts.reduce(
    (sum, product) =>
      sum + product.price * Number(quantities[product.id]),
    0
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!user || role !== "warehouse_manager" && role !== "admin") {
      setError("You are not authorized to create purchase orders.");
      return;
    }

    if (!supplierId) {
      setError("Please select a supplier.");
      return;
    }

    if (selectedProducts.length === 0) {
      setError("Add at least one product quantity.");
      return;
    }

    const invalidQuantity = selectedProducts.some((product) => {
      const quantity = Number(quantities[product.id]);
      return !Number.isInteger(quantity) || quantity <= 0;
    });

    if (invalidQuantity) {
      setError("All quantities must be positive whole numbers.");
      return;
    }

    const supplier = suppliers.find((item) => item.id === supplierId);

    if (!supplier) {
      setError("Selected supplier could not be found.");
      return;
    }

    setSaving(true);

    try {
      const orderNumber = `PO-${Date.now()}`;

      const orderId = await createPurchaseOrder({
        orderNumber,
        supplierId: supplier.id,
        supplierName: supplier.name,
        createdBy: user.uid,
        items: selectedProducts.map((product) => ({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          orderedQuantity: Number(quantities[product.id]),
          receivedQuantity: 0,
          unitPrice: product.price,
        })),
        totalAmount: total,
      });

      onCreated(orderId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create the purchase order."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="panel">Loading suppliers and products...</div>;
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2>New order</h2>

      <fieldset className="form-fields" disabled={saving}>
        <label htmlFor="supplier">Supplier</label>

        <select
          id="supplier"
          required
          value={supplierId}
          onChange={(event) => {
            setSupplierId(event.target.value);
            setQuantities({});
            setError("");
          }}
        >
          <option value="">Choose a supplier</option>

          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>

        {suppliers.length === 0 && (
          <p className="muted">No suppliers found.</p>
        )}

        {supplierId && availableProducts.length === 0 && (
          <p className="muted">
            This supplier has no products available.
          </p>
        )}

        {availableProducts.length > 0 && (
          <fieldset className="product-fields">
            <legend>Order quantities</legend>

            <p className="muted">
              Enter a quantity for each product you want to order.
            </p>

            {availableProducts.map((product) => (
              <label
                key={product.id}
                className="product-line"
                htmlFor={`order-quantity-${product.id}`}
              >
                <span>
                  <strong>{product.name}</strong>
                  <br />
                  <span className="muted">
                    {product.sku} · {money.format(product.price)} each
                  </span>
                </span>

                <input
                  id={`order-quantity-${product.id}`}
                  aria-label={`Order quantity for ${product.name}`}
                  type="number"
                  min="1"
                  step="1"
                  value={quantities[product.id] ?? ""}
                  placeholder="Qty"
                  onChange={(event) =>
                    setQuantities({
                      ...quantities,
                      [product.id]: event.target.value,
                    })
                  }
                />
              </label>
            ))}
          </fieldset>
        )}
      </fieldset>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="panel-footer">
        <strong>Order total: {money.format(total)}</strong>

        <div className="actions">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="primary"
            disabled={saving || selectedProducts.length === 0}
          >
            {saving ? "Submitting..." : "Submit order"}
          </button>
        </div>
      </div>
    </form>
  );
}
