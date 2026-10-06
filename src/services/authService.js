import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { doc, setDoc, getDoc, addDoc, collection } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export const registerUser = async (email, password, datos) => {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);

  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    nombre: datos.nombre,
    email,
    role: [datos.tipo],
    provincia: datos.provincia || "",
    nacimiento: datos.nacimiento || "",
    genero: datos.genero || "",
    nivel: datos.nivel || "",
    createdAt: new Date(),
  });

  if (datos.tipo === "organizador") {
    try {
      await addDoc(collection(db, "organizers"), {
        ownerUid: user.uid,
        nombre: datos.entidad,
        telefono: datos.telefono || "",
        whatsapp: datos.whatsapp || "",
        email: email,
        bio: datos.bio || "",
        ciudad: datos.ciudad || "",
        provincia: datos.provincia || "",
        instagram: datos.instagram || "",
        facebook: datos.facebook || "",
        website: datos.website || "",
        logo: "",
        status: "activo",
        createdAt: new Date(),
      });
    } catch (err) {
      console.error("error creando organizador:", err);
    }
  }

  if (datos.tipo === "club") {
    await addDoc(collection(db, "clubs"), {
      ownerUid: user.uid,
      nombre: datos.entidad,
      direccion: datos.direccion || "",
      ciudad: datos.ciudad || "",
      telefono: datos.telefono || "",
      logo: "",
      createdAt: new Date(),
    });
  }

  return user;
};

export const loginUser = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

// Crea users/{uid} (rol jugador) si todavía no existe, por ejemplo al entrar con Google por primera vez
export const ensureUserDoc = async (user) => {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      nombre: user.displayName || "",
      email: user.email || "",
      role: ["jugador"],
      createdAt: new Date(),
    });
  }
  return user;
};

// Devuelve el usuario, o null si el navegador bloqueó el popup y se inició el flujo por redirect
// (la página navega a Google; al volver, handleRedirectResult completa el login).
export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const { user } = await signInWithPopup(auth, provider);
    await ensureUserDoc(user);
    return user;
  } catch (err) {
    if (err?.code !== "auth/popup-blocked") throw err;
    try {
      await signInWithRedirect(auth, provider);
      return null;
    } catch (redirectErr) {
      console.error("Error iniciando el redirect de Google:", redirectErr);
      const e = new Error("popup-and-redirect-failed");
      e.code = "auth/popup-blocked";
      throw e;
    }
  }
};

export const handleRedirectResult = async () => {
  const result = await getRedirectResult(auth);
  if (result?.user) {
    await ensureUserDoc(result.user);
    return result.user;
  }
  return null;
};

export const logoutUser = () => signOut(auth);

export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

export const getUserData = async (uid) => {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data();
};
