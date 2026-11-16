
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  Check,
  Clock3,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { db } from "../lib/firebase";
import type { UserProfile, UserRole } from "../types/ui";

interface AdminUserManagementProps {
  search: string;
  setSearch: (value: string) => void;
  notify: (message: string) => void;
}

type ProvisionableRole = Extract<
  UserRole,
  "warehouse_manager" | "supplier"
>;

type SupplierOption = {
  id: string;
  name: string;
  company?: string;
  email?: string;
  userId?: string;
};

const roleChoices: {
  value: ProvisionableRole;
  label: string;
}[] = [
  { value: "warehouse_manager", label: "Warehouse Manager" },
  { value: "supplier", label: "Supplier" },
];

function isRole(value: unknown): value is UserRole {
  return (
    value === "admin" ||
    value === "warehouse_manager" ||
    value === "supplier"
  );
}

function safeErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (code.endsWith("unauthenticated")) {
    return "Your session has expired. Sign in again and retry.";
  }

  if (code.endsWith("permission-denied")) {
    return "Only an active Admin can provision accounts.";
  }

  if (code.endsWith("not-found")) {
    return "The selected account or supplier could not be found.";
  }

  if (code.endsWith("already-exists")) {
    return "A conflicting account or supplier link already exists.";
  }

  if (code.endsWith("invalid-argument")) {
    return "The backend rejected one or more fields. Review the form and try again.";
  }

  return error instanceof Error
    ? error.message
    : "The account could not be provisioned. Please try again.";
}

async function listUserProfiles(): Promise<UserProfile[]> {
  const snapshot = await getDocs(collection(db, "users"));

  return snapshot.docs.flatMap((document) => {
    const data = document.data();

    if (!isRole(data.role)) return [];

    return [
      {
        uid: document.id,
        fullName:
          typeof data.name === "string" ? data.name : "—",
        email:
          typeof data.email === "string" ? data.email : "—",
        role: data.role,
        status:
          data.status === "inactive" ? "inactive" : "active",
        ...(typeof data.company === "string"
          ? { company: data.company }
          : {}),
        ...(data.createdAt &&
        typeof data.createdAt.toDate === "function"
          ? {
              createdAt: data.createdAt.toDate().toISOString(),
            }
          : {}),
      } as UserProfile,
    ];
  });
}

async function listSuppliers(): Promise<SupplierOption[]> {
  const snapshot = await getDocs(collection(db, "suppliers"));

  return snapshot.docs.map((document) => {
    const data = document.data();

    return {
      id: document.id,
      name:
        typeof data.name === "string"
          ? data.name
          : "Unnamed supplier",
      company:
        typeof data.company === "string"
          ? data.company
          : undefined,
      email:
        typeof data.email === "string"
          ? data.email
          : undefined,
      userId:
        typeof data.userId === "string"
          ? data.userId
          : undefined,
    };
  });
}

export function AdminUserManagement({
  search,
  setSearch,
  notify,
}: AdminUserManagementProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const [role, setRole] = useState("All roles");
  const [dialogOpen, setDialogOpen] = useState(false);

  const [uid, setUid] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [targetRole, setTargetRole] =
    useState<ProvisionableRole>("warehouse_manager");

  const [company, setCompany] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const submittingRef = useRef(false);

  const refreshUsers = async () => {
    setUsers(await listUserProfiles());
  };

  const refreshSuppliers = async () => {
    setSuppliers(await listSuppliers());
  };

  useEffect(() => {
    let mounted = true;

    setLoadingList(true);

    listUserProfiles()
      .then((profiles) => {
        if (mounted) setUsers(profiles);
      })
      .catch((error) => {
        console.error("Loading user profiles failed:", error);

        if (mounted) {
          notify(
            "Unable to load user profiles. Check your connection and Admin access."
          );
        }
      })
      .finally(() => {
        if (mounted) setLoadingList(false);
      });

    return () => {
      mounted = false;
    };
  }, [notify]);

  useEffect(() => {
    if (!dialogOpen || targetRole !== "supplier") return;

    let mounted = true;

    setLoadingSuppliers(true);

    listSuppliers()
      .then((data) => {
        if (mounted) setSuppliers(data);
      })
      .catch((error) => {
        console.error("Loading suppliers failed:", error);

        if (mounted) {
          setFormError("Unable to load supplier records.");
        }
      })
      .finally(() => {
        if (mounted) setLoadingSuppliers(false);
      });

    return () => {
      mounted = false;
    };
  }, [dialogOpen, targetRole]);

  const shown = users.filter(
    (user) =>
      (role === "All roles" || user.role === role) &&
      `${user.fullName} ${user.email} ${user.role}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  const activeCount = users.filter(
    (user) => user.status === "active"
  ).length;

  const changeRole = async (
    target: UserProfile,
    nextRole: UserRole
  ) => {
    if (target.role === nextRole) return;

    const previous = users;

    setUsers((current) =>
      current.map((user) =>
        user.uid === target.uid
          ? { ...user, role: nextRole }
          : user
      )
    );

    try {
      await updateDoc(doc(db, "users", target.uid), {
        role: nextRole,
      });

      notify(
        `${target.fullName} is now a ${nextRole.replace("_", " ")}.`
      );
    } catch (error) {
      console.error("Role update failed:", error);
      setUsers(previous);
      notify("Role update failed. Only an admin can change roles.");
    }
  };

  const toggleUser = async (target: UserProfile) => {
    const nextStatus =
      target.status === "active" ? "inactive" : "active";

    const previous = users;

    setUsers((current) =>
      current.map((user) =>
        user.uid === target.uid
          ? { ...user, status: nextStatus }
          : user
      )
    );

    try {
      await updateDoc(doc(db, "users", target.uid), {
        status: nextStatus,
      });

      notify(
        `${target.fullName} was ${
          nextStatus === "active" ? "activated" : "deactivated"
        }.`
      );
    } catch (error) {
      console.error("Account status update failed:", error);
      setUsers(previous);
      notify("Account status change failed. Only an admin can do this.");
    }
  };

  const openDialog = () => {
    setUid("");
    setFullName("");
    setEmail("");
    setTargetRole("warehouse_manager");
    setCompany("");
    setSelectedSupplierId("");
    setFormError("");
    setFormSuccess("");
    setDialogOpen(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submittingRef.current) return;

    const cleanUid = uid.trim();
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanCompany = company.trim();

    if (!cleanUid || cleanUid.length > 128 || cleanUid !== uid) {
      setFormError("Enter a valid Firebase Authentication UID.");
      return;
    }

    if (
      !cleanName ||
      cleanName.length > 120 ||
      /[\u0000-\u001f\u007f]/.test(cleanName)
    ) {
      setFormError("Enter a valid full name.");
      return;
    }

    if (
      !cleanEmail ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)
    ) {
      setFormError("Enter a valid email address.");
      return;
    }

    if (
      cleanCompany.length > 120 ||
      /[\u0000-\u001f\u007f]/.test(cleanCompany)
    ) {
      setFormError("Company must be 120 characters or fewer.");
      return;
    }

    if (targetRole === "supplier" && !selectedSupplierId) {
      setFormError("Select the supplier record to link to this account.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setFormError("");
    setFormSuccess("");

    try {
      const userRef = doc(db, "users", cleanUid);
      const existingUser = await getDoc(userRef);

      // Existing self-registered supplier accounts are allowed,
      // but existing accounts with other roles cannot be overwritten.
      if (existingUser.exists()) {
        const existingData = existingUser.data();

        if (
          targetRole !== "supplier" ||
          existingData.role !== "supplier"
        ) {
          setFormError(
            "This account already has a profile with a different role."
          );
          return;
        }

        if (
          typeof existingData.email !== "string" ||
          existingData.email.trim().toLowerCase() !== cleanEmail
        ) {
          setFormError(
            "The email address does not match the registered account."
          );
          return;
        }

        if (
          existingData.supplierId &&
          existingData.supplierId !== selectedSupplierId
        ) {
          setFormError(
            "This account is already linked to a different supplier."
          );
          return;
        }
      }

      let supplierRef:
        | ReturnType<typeof doc>
        | undefined;

      let supplierName = "";

      if (targetRole === "supplier") {
        supplierRef = doc(db, "suppliers", selectedSupplierId);

        const supplierSnapshot = await getDoc(supplierRef);

        if (!supplierSnapshot.exists()) {
          setFormError("The selected supplier record no longer exists.");
          return;
        }

        const supplierData = supplierSnapshot.data();

        if (
          supplierData.userId &&
          supplierData.userId !== cleanUid
        ) {
          setFormError(
            "This supplier is already linked to another user account."
          );
          return;
        }

        supplierName =
          typeof supplierData.name === "string"
            ? supplierData.name
            : "Unnamed supplier";
      }

      const batch = writeBatch(db);

      batch.set(
        userRef,
        {
          name: cleanName,
          email: cleanEmail,
          role: targetRole,
          status: "active",
          ...(cleanCompany ? { company: cleanCompany } : {}),
          ...(targetRole === "supplier"
            ? { supplierId: selectedSupplierId }
            : {}),
          ...(!existingUser.exists()
            ? { createdAt: serverTimestamp() }
            : {}),
        },
        { merge: true }
      );

      if (supplierRef) {
        batch.update(supplierRef, {
          userId: cleanUid,
        });
      }

      await batch.commit();

      setFormSuccess(
        targetRole === "supplier"
          ? `Supplier account linked successfully to ${supplierName}.`
          : "Warehouse Manager profile provisioned successfully."
      );

      try {
        await Promise.all([
          refreshUsers(),
          refreshSuppliers(),
        ]);
      } catch (refreshError) {
        console.error("List refresh failed:", refreshError);

        setFormSuccess(
          "Profile saved successfully, but the lists could not refresh. Close and reopen this screen to retry."
        );
      }
    } catch (error) {
      console.error("User provisioning/linking failed:", error);
      setFormError(safeErrorMessage(error));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRATION · TEAM ACCESS"
        title="User management"
        subtitle="Manage your team, roles, and access to Stockwise."
        action={
          <button className="button primary" onClick={openDialog}>
            <Plus size={17} /> Invite user
          </button>
        }
      />

      <div className="user-metrics">
        <div>
          <Users size={17} />
          <span>All users</span>
          <b>{users.length}</b>
        </div>

        <div>
          <ShieldCheck size={17} />
          <span>Active users</span>
          <b>{activeCount}</b>
        </div>

        <div>
          <Clock3 size={17} />
          <span>Pending invites</span>
          <b>0</b>
        </div>
      </div>

      <div className="panel listing-panel">
        <div className="listing-toolbar">
          <div>
            <h3>Team members</h3>
            <p>Firebase user profiles</p>
          </div>

          <div className="table-tools">
            <label className="table-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search users"
              />
            </label>

            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option>All roles</option>
              <option value="admin">Administrator</option>
              <option value="warehouse_manager">Warehouse manager</option>
              <option value="supplier">Supplier</option>
            </select>

            <button
              className="button secondary filter-button"
              onClick={() =>
                notify(
                  "Additional filters can be supplied by the user management module."
                )
              }
            >
              <SlidersHorizontal size={16} /> Filter
            </button>
          </div>
        </div>

        <div className="table-scroll">
          <table className="data-table user-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" aria-label="Select all users" />
                </th>
                <th>NAME</th>
                <th>ROLE</th>
                <th>STATUS</th>
                <th>COMPANY</th>
                <th>LAST ACTIVE</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {shown.map((user) => (
                <tr key={user.uid}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${user.fullName}`}
                    />
                  </td>

                  <td>
                    <div className="person-cell">
                      <div className="avatar avatar-small">
                        {user.fullName
                          .split(" ")
                          .map((word) => word[0])
                          .slice(0, 2)
                          .join("")}
                      </div>

                      <span>
                        <b>{user.fullName}</b>
                        <small>{user.email}</small>
                      </span>
                    </div>
                  </td>

                  <td>
                    <select
                      className="role-select"
                      aria-label={`Role for ${user.fullName}`}
                      value={user.role}
                      onChange={(event) =>
                        changeRole(
                          user,
                          event.target.value as UserRole
                        )
                      }
                    >
                      <option value="admin">Administrator</option>
                      <option value="warehouse_manager">
                        Warehouse Manager
                      </option>
                      <option value="supplier">Supplier</option>
                    </select>
                  </td>

                  <td>
                    <span className={`status-pill ${user.status}`}>
                      <i />
                      {user.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td>{user.company || "—"}</td>

                  <td>
                    {user.createdAt
                      ? new Date(user.createdAt).toLocaleDateString()
                      : "—"}
                  </td>

                  <td>
                    <button
                      className="row-menu"
                      onClick={() => toggleUser(user)}
                      title={
                        user.status === "active"
                          ? "Deactivate user"
                          : "Activate user"
                      }
                    >
                      •••
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {loadingList && (
            <div className="user-list-message">
              Loading user profiles…
            </div>
          )}

          {!loadingList && shown.length === 0 && (
            <div className="user-list-message">
              {users.length
                ? "No users match these filters."
                : "No user profiles found."}
            </div>
          )}
        </div>

        <div className="table-footer">
          <span>
            Showing <b>{shown.length}</b> users
          </span>

          <div>
            <button
              className="button secondary small-button"
              disabled
            >
              Previous
            </button>

            <button
              className="button secondary small-button"
              disabled
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="integration-note">
        <ShieldCheck size={18} />
        <span>
          <b>Role changes are protected</b>
          <small>
            Writes go to the Firestore users collection and are enforced by
            your security rules. Only an admin account can change a role.
          </small>
        </span>
      </div>

      {dialogOpen && (
        <div
          className="provision-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !submitting
            ) {
              setDialogOpen(false);
            }
          }}
        >
          <section
            className="provision-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="provision-title"
          >
            <div className="provision-heading">
              <div>
                <span className="section-kicker">
                  TRUSTED USER PROVISIONING
                </span>

                <h2 id="provision-title">Add a team member</h2>

                <p>
                  Provision an existing Firebase Authentication account.
                </p>
              </div>

              <button
                className="icon-btn"
                aria-label="Close"
                disabled={submitting}
                onClick={() => setDialogOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {formSuccess && (
              <div className="provision-feedback success" role="status">
                <Check size={16} />
                {formSuccess}
              </div>
            )}

            {formError && (
              <div className="provision-feedback error" role="alert">
                {formError}
              </div>
            )}

            <form onSubmit={submit} noValidate>
              <label>
                Firebase Authentication UID

                <input
                  autoComplete="off"
                  value={uid}
                  onChange={(event) => setUid(event.target.value)}
                  maxLength={128}
                  required
                  placeholder="Paste the existing account UID"
                  disabled={submitting}
                />

                <small>
                  Find the UID in Firebase Console → Authentication → Users.
                  The account must already exist.
                </small>
              </label>

              <label>
                Full name

                <input
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  maxLength={120}
                  required
                  placeholder="Full name"
                  disabled={submitting}
                />
              </label>

              <label>
                Email address

                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={160}
                  required
                  placeholder="name@company.com"
                  disabled={submitting}
                />
              </label>

              <label>
                Role

                <select
                  value={targetRole}
                  onChange={(event) => {
                    setTargetRole(
                      event.target.value as ProvisionableRole
                    );
                    setSelectedSupplierId("");
                    setFormError("");
                  }}
                  disabled={submitting}
                >
                  {roleChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>

              {targetRole === "supplier" && (
                <label>
                  Link supplier record

                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(event) => {
                      setSelectedSupplierId(event.target.value);
                      setFormError("");
                    }}
                    disabled={submitting || loadingSuppliers}
                  >
                    <option value="">
                      {loadingSuppliers
                        ? "Loading suppliers..."
                        : "Select supplier"}
                    </option>

                    {suppliers
                      .filter(
                        (supplier) =>
                          !supplier.userId ||
                          supplier.userId === uid.trim()
                      )
                      .map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                          {supplier.company
                            ? ` — ${supplier.company}`
                            : ""}
                        </option>
                      ))}
                  </select>

                  <small>
                    Connects the login account to an existing supplier
                    record. Already-linked suppliers are excluded.
                  </small>
                </label>
              )}

              <label>
                Company <span className="optional-label">Optional</span>

                <input
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  maxLength={120}
                  placeholder="Company or supplier name"
                  disabled={submitting}
                />
              </label>

              <div className="provision-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={submitting}
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="button primary"
                  disabled={submitting || loadingSuppliers}
                >
                  {submitting ? (
                    <>
                      <span className="button-spinner" />
                      Provisioning…
                    </>
                  ) : (
                    "Provision user"
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function PageTitle({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action: ReactNode;
}) {
  return (
    <div className="page-title-row">
      <div>
        <span className="section-kicker">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="title-actions">{action}</div>
    </div>
  );
}
