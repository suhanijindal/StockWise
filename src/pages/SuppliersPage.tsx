
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import type { Supplier } from "../types";
import {
  subscribeToSuppliers,
  addSupplier,
  updateSupplier,
  deleteSupplier as deleteSupplierService,
} from "../services/supplierService";

import { useAuth } from "../services/AuthContext";

import {
  Search,
  Plus,
  Users,
  Pencil,
  Trash2,
  Mail,
  Phone,
  X,
  Building2,
  MapPin,
} from "lucide-react";

const emptyForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  address: "",
};

type SupplierForm = typeof emptyForm;

export default function SuppliersPage() {
  // Only admins register or edit supplier records. Warehouse managers
  // need the list to raise purchase orders, but read-only.
  const { role } = useAuth();
  const canManageSuppliers = role === "admin";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);

  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Subscribe to suppliers from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToSuppliers(
      (data) => {
        setSuppliers(data);
        setLoading(false);
        setPageError("");
      },
      (subscriptionError) => {
        console.error("Supplier subscription failed:", subscriptionError);
        setPageError(
          "Unable to load suppliers. Check your account permissions and try again."
        );
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredSuppliers = suppliers.filter((supplier) => {
    const query = search.toLowerCase().trim();

    return (
      supplier.name.toLowerCase().includes(query) ||
      supplier.company.toLowerCase().includes(query) ||
      supplier.email.toLowerCase().includes(query) ||
      supplier.phone.toLowerCase().includes(query) ||
      supplier.address.toLowerCase().includes(query)
    );
  });

  const uniqueCompanies = new Set(
    suppliers.map((supplier) => supplier.company.toLowerCase().trim())
  ).size;

  const openAddForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  };

  const openEditForm = (supplier: Supplier) => {
    setEditingId(supplier.id);

    setForm({
      name: supplier.name,
      company: supplier.company,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
    });

    setError("");
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  };

  const normalizePhone = (phone: string) => {
    return phone.replace(/\D/g, "").slice(-10);
  };

  const validateForm = () => {
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();

    if (
      !form.name.trim() ||
      !form.company.trim() ||
      !email ||
      !phone ||
      !form.address.trim()
    ) {
      return "Please fill in all fields.";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return "Please enter a valid email address.";
    }

    if (
      !/^\+?[\d\s()-]+$/.test(phone) ||
      normalizePhone(phone).length !== 10
    ) {
      return "Please enter a valid 10-digit phone number.";
    }

    const duplicateEmail = suppliers.some(
      (supplier) =>
        supplier.email.toLowerCase().trim() === email &&
        supplier.id !== editingId
    );

    if (duplicateEmail) {
      return "A supplier with this email already exists.";
    }

    const duplicatePhone = suppliers.some(
      (supplier) =>
        normalizePhone(supplier.phone) === normalizePhone(phone) &&
        supplier.id !== editingId
    );

    if (duplicatePhone) {
      return "A supplier with this phone number already exists.";
    }

    return "";
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const cleanedForm: SupplierForm = {
      name: form.name.trim(),
      company: form.company.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      address: form.address.trim(),
    };

    setSaving(true);
    setError("");

    try {
      if (editingId) {
        await updateSupplier(editingId, cleanedForm);
      } else {
        await addSupplier(cleanedForm);
      }

      // Firestore subscription updates the supplier list automatically.
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (err) {
      console.error("Failed to save supplier:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while saving the supplier."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    const supplier = suppliers.find((item) => item.id === id);

    if (!supplier || deletingId) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${supplier.name}?`
    );

    if (!confirmed) return;

    setDeletingId(id);
    setPageError("");

    try {
      await deleteSupplierService(id);
    } catch (err) {
      console.error("Failed to delete supplier:", err);

      setPageError(
        err instanceof Error
          ? err.message
          : "Unable to delete supplier. Please try again."
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">

      {/* Heading */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#14294B]">
            Supplier Management
          </h1>

          <p className="text-sm text-slate-500 mt-1">
            Manage supplier information and relationships.
          </p>
        </div>

        {canManageSuppliers && (
          <button
            onClick={openAddForm}
            className="flex items-center gap-2 bg-[#2563EB] text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={18} />
            Add Supplier
          </button>
        )}
      </div>

      {/* Error message */}
      {pageError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
          {pageError}
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title="Total Suppliers"
          value={suppliers.length}
          icon={<Users size={22} />}
        />

        <StatCard
          title="Companies Represented"
          value={uniqueCompanies}
          icon={<Building2 size={22} />}
        />
      </div>

      {/* Supplier directory */}
      <div className="bg-white rounded-xl border border-blue-100 shadow-sm">

        <div className="p-5 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="font-semibold text-lg text-[#14294B]">
              Supplier Directory
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              View and manage registered suppliers.
            </p>
          </div>

          <div className="relative">
            <Search
              size={17}
              className="absolute left-3 top-3 text-slate-400"
            />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search suppliers..."
              className="border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-500 w-full sm:w-72"
            />
          </div>
        </div>

        <div className="px-5 pb-3 text-xs text-slate-500">
          Showing {filteredSuppliers.length} of {suppliers.length} suppliers
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#F3F7FF] text-slate-600">
              <tr>
                <th className="px-5 py-4">Supplier</th>
                <th className="px-5 py-4">Company</th>
                <th className="px-5 py-4">Email</th>
                <th className="px-5 py-4">Phone</th>
                <th className="px-5 py-4">Location</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    Loading suppliers...
                  </td>
                </tr>
              ) : filteredSuppliers.map((supplier) => (
                <tr
                  key={supplier.id}
                  className="border-t border-slate-100 hover:bg-blue-50/40 transition"
                >
                  <td className="px-5 py-4 font-medium text-[#14294B]">
                    {supplier.name}
                  </td>

                  <td className="px-5 py-4">
                    {supplier.company}
                  </td>

                  <td className="px-5 py-4 text-slate-500">
                    <div className="flex items-center gap-2">
                      <Mail size={15} />
                      {supplier.email}
                    </div>
                  </td>

                  <td className="px-5 py-4 text-slate-500">
                    <div className="flex items-center gap-2">
                      <Phone size={15} />
                      {supplier.phone}
                    </div>
                  </td>

                  <td className="px-5 py-4 text-slate-500">
                    <div className="flex items-center gap-2">
                      <MapPin size={15} />
                      {supplier.address}
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex gap-3">
                      {canManageSuppliers && (
                        <>
                          <button
                            onClick={() => openEditForm(supplier)}
                            title="Edit supplier"
                            className="text-blue-600 hover:text-blue-800"
                            disabled={deletingId === supplier.id}
                          >
                            <Pencil size={17} />
                          </button>

                          <button
                            onClick={() => handleDeleteSupplier(supplier.id)}
                            title="Delete supplier"
                            className="text-red-500 hover:text-red-700 disabled:opacity-40"
                            disabled={deletingId !== null}
                          >
                            {deletingId === supplier.id ? (
                              <span className="text-xs">...</span>
                            ) : (
                              <Trash2 size={17} />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filteredSuppliers.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-12 text-slate-500"
                  >
                    <Users
                      size={32}
                      className="mx-auto mb-2 text-slate-300"
                    />

                    <p className="font-medium">No suppliers found</p>

                    <p className="text-xs mt-1">
                      Try another search or add a new supplier.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            <div className="flex justify-between items-center p-5 border-b">
              <div>
                <h2 className="text-xl font-bold text-[#14294B]">
                  {editingId ? "Edit Supplier" : "Add New Supplier"}
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Enter supplier details below.
                </p>
              </div>

              <button
                onClick={closeForm}
                disabled={saving}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-40"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {[
                { label: "Supplier Name", field: "name", type: "text" },
                { label: "Company Name", field: "company", type: "text" },
                { label: "Email Address", field: "email", type: "email" },
                { label: "Phone Number", field: "phone", type: "tel" },
                { label: "Location", field: "address", type: "text" },
              ].map((item) => (
                <div key={item.field}>
                  <label className="block text-sm font-medium mb-1 text-slate-700">
                    {item.label}
                  </label>

                  <input
                    type={item.type}
                    required
                    disabled={saving}
                    value={form[item.field as keyof SupplierForm]}
                    onChange={(e) => {
                      setForm((previous) => ({
                        ...previous,
                        [item.field]: e.target.value,
                      }));
                      setError("");
                    }}
                    placeholder={`Enter ${item.label.toLowerCase()}`}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-blue-500 disabled:bg-slate-50"
                  />
                </div>
              ))}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2">
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
                  className="px-5 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save Changes"
                      : "Add Supplier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-blue-100 p-5 shadow-sm">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <h2 className="text-2xl font-bold mt-2 text-[#14294B]">
            {value}
          </h2>
        </div>

        <div className="bg-blue-50 text-blue-600 p-3 rounded-lg">
          {icon}
        </div>
      </div>
    </div>
  );
}
