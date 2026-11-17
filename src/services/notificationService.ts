
import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../lib/firebase";
import type { Notification } from "../types";

type NotificationRole =
  | "supplier"
  | "warehouse_manager"
  | "admin";

interface CreateNotificationData {
  /** Firebase Authentication UID, NOT supplier document ID. */
  recipientId?: string;
  recipientRole?: NotificationRole;
  title: string;
  message: string;
  type: Notification["type"];
  relatedId?: string;
}

export async function createNotification(
  data: CreateNotificationData,
) {
  return addDoc(collection(db, "notifications"), {
    userId: data.recipientId ?? null,
    recipientRole: data.recipientRole ?? null,
    title: data.title,
    message: data.message,
    type: data.type,
    relatedId: data.relatedId ?? null,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToNotifications(
  userId: string,
  callback: (notifs: Notification[]) => void,
  role?: NotificationRole,
  onError?: (error: Error) => void,
) {
  let userNotifications: Notification[] = [];
  let roleNotifications: Notification[] = [];

  let active = true;

  const notify = () => {
    if (!active) return;

    const merged = new Map<string, Notification>();

    [...userNotifications, ...roleNotifications].forEach(
      (item) => {
        merged.set(item.id, item);
      },
    );

    const sorted = Array.from(merged.values()).sort(
      (a, b) => {
        const timeA = a.createdAt?.toMillis?.() ?? 0;
        const timeB = b.createdAt?.toMillis?.() ?? 0;
        return timeB - timeA;
      },
    );

    callback(sorted);
  };

  const handleError = (error: Error) => {
    if (active) {
      console.error("Notification subscription failed:", error);
      onError?.(error);
    }
  };

  // No orderBy here on purpose: combining where() with orderBy() would
  // require a composite Firestore index. Results are sorted in notify().
  const userQuery = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
  );

  const unsubscribeUser = onSnapshot(
    userQuery,
    (snapshot) => {
      userNotifications = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Notification[];

      notify();
    },
    handleError,
  );

  let unsubscribeRole = () => {};

  if (role) {
    const roleQuery = query(
      collection(db, "notifications"),
      where("recipientRole", "==", role),
    );

    unsubscribeRole = onSnapshot(
      roleQuery,
      (snapshot) => {
        roleNotifications = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Notification[];

        notify();
      },
      handleError,
    );
  }

  return () => {
    active = false;
    unsubscribeUser();
    unsubscribeRole();
  };
}

export async function markAsRead(
  notificationId: string,
): Promise<void> {
  await updateDoc(
    doc(db, "notifications", notificationId),
    {
      read: true,
    },
  );
}
