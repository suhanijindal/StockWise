import {
  collection, doc, query, where, orderBy,
  onSnapshot, updateDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../lib/firebase";

export function subscribeToNotifications(userId: string, callback: (notifs: any[]) => void) {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function markAsRead(notificationId: string) {
  return updateDoc(doc(db, "notifications", notificationId), {
    read: true,
  });
}