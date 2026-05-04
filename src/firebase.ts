import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDSkt9-CYX-3I9SjOrAdMhUKsgUrVN0jaw",
  authDomain: "authentic-trading-fecd8.firebaseapp.com",
  projectId: "authentic-trading-fecd8",
  storageBucket: "authentic-trading-fecd8.firebasestorage.app",
  messagingSenderId: "441151778816",
  appId: "1:441151778816:web:66638a34e56f7c0377a8e5",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
