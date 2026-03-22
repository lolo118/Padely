import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export const registerUser = async (email, password, nombre) => {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    nombre,
    email,
    role: "jugador",
    createdAt: new Date(),
  });
  return user;
};

export const loginUser = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  const { user } = await signInWithPopup(auth, provider);
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      nombre: user.displayName,
      email: user.email,
      role: "jugador",
      createdAt: new Date(),
    });
  }
  return user;
};

export const logoutUser = () => signOut(auth);

export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);
