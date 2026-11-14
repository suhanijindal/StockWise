import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDnbHplCxzdXSrtgeoK-vM2rohoglxFqnw",
  authDomain: "ccsa-c7a2d.firebaseapp.com",
  projectId: "ccsa-c7a2d",
  storageBucket: "ccsa-c7a2d.firebasestorage.app",
  messagingSenderId: "360045799750",
  appId: "1:360045799750:web:2f4f26d3e7481fdbd29d47"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);