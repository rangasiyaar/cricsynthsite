"use client";
// Firebase Auth for the site. The web config is public by design (it identifies the project; access is
// enforced by Auth and the Firestore rules), so it lives in the code rather than in secrets.
import { getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, type Auth, type User } from "firebase/auth";
import { useEffect, useState } from "react";

const CONFIG = {
  apiKey: "AIzaSyCS3d9wd0kfNrQ5vZqXx1agjTqwCHKtLcU",
  authDomain: "cricsynthesis.firebaseapp.com",
  projectId: "cricsynthesis",
  storageBucket: "cricsynthesis.firebasestorage.app",
  messagingSenderId: "738796128383",
  appId: "1:738796128383:web:805a11670433963e73d74a",
};

export function auth(): Auth {
  return getAuth(getApps()[0] ?? initializeApp(CONFIG));
}

/** The signed-in user; undefined while Firebase is still checking. */
export function useUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth(), setUser), []);
  return user;
}

/** Pro during the launch beta: every signed-in account. Paid plans will use a custom claim instead. */
export function usePro(): boolean | undefined {
  const user = useUser();
  return user === undefined ? undefined : user !== null;
}
