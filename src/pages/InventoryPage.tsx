
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import type { Product, Supplier, StockMovement } from "../types";

import {
  subscribeToProducts,
  addProductWithInitialStock,
  updateProduct,
  deleteProduct as deleteProductService,
  adjustStock,
  subscribeToStockMovements,
} from "../services/productService";

import { subscribeToSuppliers } from "../services/supplierService";
import { auth } from "../lib/firebase";

import {
  Search,
  Plus,
  Package,
  AlertTriangle,
  Boxes,
  Pencil,
  Trash2,
  X,
  TrendingUp,
  History,
  ArrowUpRight,
  ArrowDownRight,
  PlusCircle,
  MinusCircle,
} from "lucide-react";

type ProductFormData = {
  name: string;
  sku: string;
  category: string;
  quantity: number;
  minStockThreshold: number;
  price: number;
  supplierId: string;
};

type AdjustmentType = "add" | "remove";

const emptyForm: ProductFormData = {
  name: "",
  sku: "",
  category: "Electronics",
  quantity: 0,
  minStockThreshold: 5,
  price: 0,
  supplierId: "",
};

const categories = [
  "Electronics",
  "Furniture",
  "Stationery",
  "Accessories",
  "Other",
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

function formatDate(timestamp: StockMovement["timestamp"]): string {
  if (!timestamp) return "—";

  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toLocaleString("en-IN");
  }

  return "—";
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustmentProductId, setAdjustmentProductId] = useState("");
  const [adjustmentType, setAdjustmentType] =
    useState<AdjustmentType>("add");
  const [adjustmentQuantity, setAdjustmentQuantity] = useState(1);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentError, setAdjustmentError] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  // Subscribe to Firestore collections.
  useEffect(() => {
    let productsLoaded = false;
    let suppliersLoaded = false;
    let movementsLoaded = false;
    let active = true;

    const updateLoading = () => {
      if (
        active &&
        productsLoaded &&
        suppliersLoaded &&
        movementsLoaded
      ) {
        setLoading(false);
      }
    };

    const handleSubscriptionError = (subscriptionError: Error) => {
      if (!active) return;

      console.error(
        "Inventory data subscription error:",
        subscriptionError
      );

      setPageError(
        subscriptionError.message.includes("permission-denied") ||
          subscriptionError.message.includes(
            "Missing or insufficient permissions"
          )
          ? "You don't have permission to access inventory data. Please check your account permissions."
          : `Unable to load inventory data: ${subscriptionError.message}`
      );

      setLoading(false);
    };

    const unsubscribeProducts = subscribeToProducts(
      (data) => {
        if (!active) return;
        setProducts(data);
        productsLoaded = true;
        updateLoading();
      },
      handleSubscriptionError
    );

    const unsubscribeSuppliers = subscribeToSuppliers(
      (data) => {
        if (!active) return;
        setSuppliers(data);
        suppliersLoaded = true;
        updateLoading();
      },
      handleSubscriptionError
    );

    const unsubscribeMovements = subscribeToStockMovements(
      (data) => {
        if (!active) return;
        setStockMovements(data);
        movementsLoaded = true;
        updateLoading();
      },
      handleSubscriptionError
    );

    return () => {
      active = false;
      unsubscribeProducts();
      unsubscribeSuppliers();
      unsubscribeMovements();
    };
  }, []);

  // Statistics.
  const lowStock = useMemo(
    () =>
      products.filter(
        (product) =>
          Number(product.quantity ?? 0) <=
          Number(product.minStockThreshold ?? 0)
      ),
    [products]
  );

  const totalUnits = useMemo(
    () =>
      products.reduce(
        (total, product) =>
          total + Number(product.quantity ?? 0),
        0
      ),
    [products]
  );

  const totalValue = useMemo(
    () =>
      products.reduce(
        (total, product) =>
          total +
          Number(product.quantity ?? 0) *
            Number(product.price ?? 0),
        0
      ),
    [products]
  );

  // Search and category filtering.
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const query = search.toLowerCase().trim();

      const supplier = suppliers.find(
        (item) => item.id === product.supplierId
      );

      const matchesSearch =
        String(product.name ?? "").toLowerCase().includes(query) ||
        String(product.sku ?? "").toLowerCase().includes(query) ||
        String(product.category ?? "").toLowerCase().includes(query) ||
        (supplier?.company?.toLowerCase().includes(query) ?? false);

      const matchesCategory =
        category === "All" || product.category === category;

      return matchesSearch && matchesCategory;
    });
  }, [products, suppliers, search, category]);

  // Open add product form.
  const openAddForm = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      supplierId: suppliers[0]?.id ?? "",
    });
    setError("");
    setPageError("");
    setShowForm(true);
  };

  // Open edit product form.
  const openEditForm = (product: Product) => {
    setEditingId(product.id);

    setForm({
      name: product.name ?? "",
      sku: product.sku ?? "",
      category: product.category ?? "Other",
      quantity: Number(product.quantity ?? 0),
      minStockThreshold: Number(product.minStockThreshold ?? 0),
      price: Number(product.price ?? 0),
      supplierId: product.supplierId ?? "",
    });

    setError("");
    setPageError("");
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  };

  // Add or edit product.
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const name = String(form.name ?? "").trim();
    const sku = String(form.sku ?? "").trim();
    const categoryValue = String(form.category ?? "").trim();

    // Validate required fields.
    if (!name || !sku || !categoryValue) {
      setError("Product name, SKU and category are required.");
      return;
    }

    // Validate duplicate SKU safely.
    const normalizedSku = sku.toLowerCase();

    const duplicateSku = products.some(
      (product) =>
        String(product.sku ?? "").trim().toLowerCase() ===
          normalizedSku &&
        product.id !== editingId
    );

    if (duplicateSku) {
      setError("This SKU already exists. Please use a unique SKU.");
      return;
    }

    // Validate numeric values.
    if (
      !Number.isInteger(form.quantity) ||
      !Number.isInteger(form.minStockThreshold) ||
      form.quantity < 0 ||
      form.minStockThreshold < 0
    ) {
      setError(
        "Quantity and minimum stock must be non-negative whole numbers."
      );
      return;
    }

    if (!Number.isFinite(form.price) || form.price < 0) {
      setError("Price must be a valid non-negative number.");
      return;
    }

    // Validate supplier.
    if (!form.supplierId) {
      setError("Please select a supplier.");
      return;
    }

    const selectedSupplier = suppliers.find(
      (supplier) => supplier.id === form.supplierId
    );

    if (!selectedSupplier) {
      setError("The selected supplier does not exist.");
      return;
    }

    // Editing: make sure product still exists.
    const existingProduct = editingId
      ? products.find((product) => product.id === editingId)
      : undefined;

    if (editingId && !existingProduct) {
      setError("Product no longer exists. Please refresh and try again.");
      return;
    }

    const userId = auth.currentUser?.uid;

    if (!editingId && form.quantity > 0 && !userId) {
      setError("You must be logged in to record initial stock.");
      return;
    }

    // Prepare the Firestore payload only after validation.
    const cleanedForm = {
      name,
      sku,
      category: categoryValue,
      quantity: form.quantity,
      minStockThreshold: form.minStockThreshold,
      price: form.price,
      supplierId: form.supplierId,
      supplierName: selectedSupplier.name,
    };

    setSaving(true);

    try {
      if (editingId && existingProduct) {
        // Quantity is changed only through stock adjustment.
        await updateProduct(editingId, {
          ...cleanedForm,
          quantity: existingProduct.quantity,
        });
      } else {
        await addProductWithInitialStock(cleanedForm, userId);
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      setError("");
    } catch (err) {
      console.error("Unable to save product:", err);
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Delete product.
  const handleDeleteProduct = async (id: string) => {
    const product = products.find((item) => item.id === id);
    if (!product) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${product.name}?`
    );

    if (!confirmed) return;

    setPageError("");

    try {
      await deleteProductService(id);
    } catch (err) {
      console.error("Unable to delete product:", err);
      setPageError(getErrorMessage(err));
    }
  };

  // Open stock adjustment modal.
  const openAdjustment = (
    product: Product,
    type: AdjustmentType
  ) => {
    setAdjustmentProductId(product.id);
    setAdjustmentType(type);
    setAdjustmentQuantity(1);
    setAdjustmentReason("");
    setAdjustmentError("");
    setShowAdjustment(true);
  };

  const closeAdjustment = () => {
    if (adjusting) return;

    setShowAdjustment(false);
    setAdjustmentProductId("");
    setAdjustmentQuantity(1);
    setAdjustmentReason("");
    setAdjustmentError("");
  };

  const selectedAdjustmentProduct = products.find(
    (product) => product.id === adjustmentProductId
  );

  const previewQuantity = selectedAdjustmentProduct
    ? adjustmentType === "add"
      ? selectedAdjustmentProduct.quantity + adjustmentQuantity
      : selectedAdjustmentProduct.quantity - adjustmentQuantity
    : 0;

  const validAdjustmentQuantity =
    Number.isInteger(adjustmentQuantity) &&
    adjustmentQuantity > 0;

  // Apply stock adjustment.
  const handleStockAdjustment = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    setAdjustmentError("");

    const product = products.find(
      (item) => item.id === adjustmentProductId
    );

    if (!product) {
      setAdjustmentError("Product not found.");
      return;
    }

    if (!validAdjustmentQuantity) {
      setAdjustmentError(
        "Please enter a valid whole number greater than zero."
      );
      return;
    }

    if (!adjustmentReason.trim()) {
      setAdjustmentError("Please provide a reason for this adjustment.");
      return;
    }

    if (
      adjustmentType === "remove" &&
      adjustmentQuantity > product.quantity
    ) {
      setAdjustmentError(
        "Cannot remove more stock than currently available."
      );
      return;
    }

    const userId = auth.currentUser?.uid;

    if (!userId) {
      setAdjustmentError("You must be logged in to adjust stock.");
      return;
    }

    const change =
      adjustmentType === "add"
        ? adjustmentQuantity
        : -adjustmentQuantity;

    setAdjusting(true);

    try {
      await adjustStock(
        product.id,
        change,
        adjustmentReason.trim(),
        product.quantity,
        product.name,
        userId,
        product.minStockThreshold
      );

      setShowAdjustment(false);
      setAdjustmentProductId("");
      setAdjustmentQuantity(1);
      setAdjustmentReason("");
      setAdjustmentError("");
    } catch (err) {
      console.error("Stock adjustment failed:", err);
      setAdjustmentError(getErrorMessage(err));
    } finally {
      setAdjusting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64 text-slate-500">
        Loading inventory data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#14294B]">
            Inventory Management
          </h1>

          <p className="text-slate-500 text-sm mt-1">
            Manage products and monitor stock levels.
          </p>
        </div>

        <button
          onClick={openAddForm}
          disabled={suppliers.length === 0}
          className="flex items-center gap-2 bg-[#2563EB] text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={18} />
          Add Product
        </button>
      </div>

      {pageError && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 text-sm">
          {pageError}
        </div>
      )}

      {suppliers.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm">
          Add a supplier in Supplier Management before creating a product.
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Products"
          value={products.length}
          icon={<Package />}
        />

        <StatCard
          title="Total Stock Units"
          value={totalUnits}
          icon={<Boxes />}
        />

        <StatCard
          title="Low Stock Items"
          value={lowStock.length}
          icon={<AlertTriangle />}
          warning={lowStock.length > 0}
        />

        <StatCard
          title="Inventory Value"
          value={`₹${totalValue.toLocaleString("en-IN")}`}
          icon={<TrendingUp />}
        />
      </div>

      {/* Product inventory */}
      <div className="bg-white rounded-xl border border-blue-100 shadow-sm">
        <div className="p-5 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="font-semibold text-lg text-[#14294B]">
              Product Inventory
            </h2>

            <p className="text-sm text-slate-500">
              View and manage all your products.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-3 text-slate-400"
              />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                className="border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="All">All Categories</option>

              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-5 pb-3 text-xs text-slate-500">
          Showing {filteredProducts.length} of {products.length} products
        </div>

        {/* Product table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#F3F7FF] text-slate-600">
              <tr>
                <th className="px-5 py-4">Product</th>
                <th className="px-5 py-4">SKU</th>
                <th className="px-5 py-4">Category</th>
                <th className="px-5 py-4">Quantity</th>
                <th className="px-5 py-4">Price</th>
                <th className="px-5 py-4">Supplier</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredProducts.map((product) => {
                const supplier = suppliers.find(
                  (item) => item.id === product.supplierId
                );

                const isLow =
                  product.quantity <= product.minStockThreshold;

                return (
                  <tr
                    key={product.id}
                    className="border-t border-slate-100 hover:bg-blue-50/40"
                  >
                    <td className="px-5 py-4 font-medium text-[#14294B]">
                      {product.name}
                    </td>

                    <td className="px-5 py-4 text-slate-500">
                      {product.sku || "—"}
                    </td>

                    <td className="px-5 py-4">
                      {product.category}
                    </td>

                    <td className="px-5 py-4 font-semibold">
                      {product.quantity}
                    </td>

                    <td className="px-5 py-4">
                      ₹{Number(product.price ?? 0).toLocaleString("en-IN")}
                    </td>

                    <td className="px-5 py-4">
                      {supplier?.company ?? "Unassigned"}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          isLow
                            ? "bg-red-100 text-red-600"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {isLow ? "Low Stock" : "In Stock"}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openAdjustment(product, "add")}
                          title="Add stock"
                          className="text-green-600 hover:text-green-800"
                        >
                          <PlusCircle size={18} />
                        </button>

                        <button
                          onClick={() => openAdjustment(product, "remove")}
                          title="Remove stock"
                          disabled={product.quantity === 0}
                          className="text-orange-500 hover:text-orange-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <MinusCircle size={18} />
                        </button>

                        <button
                          onClick={() => openEditForm(product)}
                          title="Edit product"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Pencil size={17} />
                        </button>

                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          title="Delete product"
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center py-10 text-slate-500"
                  >
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock movement history */}
      <div className="bg-white rounded-xl border border-blue-100 shadow-sm">
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History size={20} className="text-blue-600" />

            <h2 className="font-semibold text-lg text-[#14294B]">
              Stock Movement History
            </h2>
          </div>

          <p className="text-sm text-slate-500 mt-1">
            Track additions and removals of inventory stock.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#F3F7FF] text-slate-600">
              <tr>
                <th className="px-5 py-4">Product</th>
                <th className="px-5 py-4">Previous Stock</th>
                <th className="px-5 py-4">Change</th>
                <th className="px-5 py-4">New Stock</th>
                <th className="px-5 py-4">Reason</th>
                <th className="px-5 py-4">Date</th>
              </tr>
            </thead>

            <tbody>
              {stockMovements.map((movement) => (
                <tr
                  key={movement.id}
                  className="border-t border-slate-100"
                >
                  <td className="px-5 py-4 font-medium text-[#14294B]">
                    {movement.productName}
                  </td>

                  <td className="px-5 py-4">
                    {movement.previousQuantity}
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={`flex items-center gap-1 font-semibold ${
                        movement.change >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {movement.change >= 0 ? (
                        <ArrowUpRight size={16} />
                      ) : (
                        <ArrowDownRight size={16} />
                      )}

                      {movement.change > 0 ? "+" : ""}
                      {movement.change}
                    </span>
                  </td>

                  <td className="px-5 py-4 font-semibold">
                    {movement.newQuantity}
                  </td>

                  <td className="px-5 py-4 text-slate-600">
                    {movement.reason}
                  </td>

                  <td className="px-5 py-4 text-slate-500 whitespace-nowrap">
                    {formatDate(movement.timestamp)}
                  </td>
                </tr>
              ))}

              {stockMovements.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-10 text-slate-500"
                  >
                    No stock movements recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit product modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 border-b">
              <div>
                <h2 className="text-xl font-bold text-[#14294B]">
                  {editingId ? "Edit Product" : "Add New Product"}
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Enter product information below.
                </p>
              </div>

              <button
                onClick={closeForm}
                disabled={saving}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <FormField label="Product Name">
                <input
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm((previous) => ({
                      ...previous,
                      name: e.target.value,
                    }))
                  }
                  placeholder="Enter product name"
                  className="form-input"
                />
              </FormField>

              <FormField label="SKU">
                <input
                  required
                  value={form.sku}
                  onChange={(e) =>
                    setForm((previous) => ({
                      ...previous,
                      sku: e.target.value,
                    }))
                  }
                  placeholder="Example: ELEC004"
                  className="form-input"
                />
              </FormField>

              <FormField label="Category">
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((previous) => ({
                      ...previous,
                      category: e.target.value,
                    }))
                  }
                  className="form-input"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Quantity">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    disabled={Boolean(editingId)}
                    value={form.quantity}
                    onChange={(e) =>
                      setForm((previous) => ({
                        ...previous,
                        quantity: Number(e.target.value),
                      }))
                    }
                    className="form-input disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </FormField>

                <FormField label="Minimum Stock">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={form.minStockThreshold}
                    onChange={(e) =>
                      setForm((previous) => ({
                        ...previous,
                        minStockThreshold: Number(e.target.value),
                      }))
                    }
                    className="form-input"
                  />
                </FormField>
              </div>

              {editingId && (
                <p className="text-xs text-slate-500 -mt-2">
                  To change stock quantity, use the Add Stock or Remove
                  Stock actions in the inventory table.
                </p>
              )}

              <FormField label="Unit Price (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.price}
                  onChange={(e) =>
                    setForm((previous) => ({
                      ...previous,
                      price: Number(e.target.value),
                    }))
                  }
                  className="form-input"
                />
              </FormField>

              <FormField label="Supplier">
                <select
                  required
                  value={form.supplierId}
                  onChange={(e) =>
                    setForm((previous) => ({
                      ...previous,
                      supplierId: e.target.value,
                    }))
                  }
                  className="form-input"
                >
                  <option value="">Select Supplier</option>

                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.company} — {supplier.name}
                    </option>
                  ))}
                </select>
              </FormField>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save Changes"
                      : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock adjustment modal */}
      {showAdjustment && selectedAdjustmentProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-5 border-b">
              <div>
                <h2 className="text-xl font-bold text-[#14294B]">
                  {adjustmentType === "add"
                    ? "Add Stock"
                    : "Remove Stock"}
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  {selectedAdjustmentProduct.name}
                </p>
              </div>

              <button
                onClick={closeAdjustment}
                disabled={adjusting}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={22} />
              </button>
            </div>

            <form
              onSubmit={handleStockAdjustment}
              className="p-5 space-y-4"
            >
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-slate-600">
                  Current available stock
                </p>

                <p className="text-2xl font-bold text-[#14294B] mt-1">
                  {selectedAdjustmentProduct.quantity} units
                </p>
              </div>

              <FormField label="Adjustment Type">
                <select
                  value={adjustmentType}
                  onChange={(e) => {
                    setAdjustmentType(e.target.value as AdjustmentType);
                    setAdjustmentReason("");
                    setAdjustmentError("");
                  }}
                  className="form-input"
                >
                  <option value="add">Add Stock</option>
                  <option value="remove">Remove Stock</option>
                </select>
              </FormField>

              <FormField label="Quantity">
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={adjustmentQuantity}
                  onChange={(e) =>
                    setAdjustmentQuantity(Number(e.target.value))
                  }
                  className="form-input"
                />
              </FormField>

              <FormField label="Reason for Adjustment">
                <select
                  required
                  value={adjustmentReason}
                  onChange={(e) =>
                    setAdjustmentReason(e.target.value)
                  }
                  className="form-input"
                >
                  <option value="">Select reason</option>

                  {adjustmentType === "add" ? (
                    <>
                      <option value="New purchase">New purchase</option>
                      <option value="Returned goods">Returned goods</option>
                      <option value="Stock correction">Stock correction</option>
                      <option value="Other">Other</option>
                    </>
                  ) : (
                    <>
                      <option value="Damaged goods">Damaged goods</option>
                      <option value="Order dispatch">Order dispatch</option>
                      <option value="Stock correction">Stock correction</option>
                      <option value="Expired goods">Expired goods</option>
                      <option value="Other">Other</option>
                    </>
                  )}
                </select>
              </FormField>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">
                    Current quantity
                  </span>

                  <span>{selectedAdjustmentProduct.quantity}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">
                    Adjustment
                  </span>

                  <span
                    className={
                      adjustmentType === "add"
                        ? "text-green-600 font-semibold"
                        : "text-red-600 font-semibold"
                    }
                  >
                    {adjustmentType === "add" ? "+" : "-"}
                    {adjustmentQuantity || 0}
                  </span>
                </div>

                <div className="border-t pt-2 flex justify-between font-semibold">
                  <span>New quantity</span>

                  <span
                    className={
                      validAdjustmentQuantity && previewQuantity >= 0
                        ? "text-[#14294B]"
                        : "text-red-600"
                    }
                  >
                    {validAdjustmentQuantity ? previewQuantity : "--"}
                  </span>
                </div>
              </div>

              {adjustmentError && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg">
                  {adjustmentError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAdjustment}
                  disabled={adjusting}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={adjusting}
                  className={`px-5 py-2 text-white rounded-lg disabled:opacity-50 ${
                    adjustmentType === "add"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-orange-500 hover:bg-orange-600"
                  }`}
                >
                  {adjusting ? "Processing..." : "Confirm Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable statistics card.
function StatCard({
  title,
  value,
  icon,
  warning = false,
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
  warning?: boolean;
}) {
  return (
    <div className="bg-white border border-blue-100 rounded-xl p-5 shadow-sm">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-slate-500">{title}</p>

          <h2
            className={`text-2xl font-bold mt-2 ${
              warning ? "text-red-600" : "text-[#14294B]"
            }`}
          >
            {value}
          </h2>
        </div>

        <div
          className={`p-3 rounded-lg ${
            warning
              ? "bg-red-50 text-red-600"
              : "bg-blue-50 text-[#2563EB]"
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// Reusable form field.
function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-slate-700">
        {label}
      </label>

      {children}
    </div>
  );
}
