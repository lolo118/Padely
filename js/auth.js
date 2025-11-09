// Importa las funciones de Auth
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged as firebaseOnAuthStateChanged // Renombramos el import
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

// Importa las funciones de Firestore que necesitaremos
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// Importa las instancias de auth y db desde firebase.js
import { auth, db } from './firebase.js';

/**
 * Registra un nuevo usuario en Firebase Auth y guarda sus datos en Firestore.
 * @param {string} email - El email del usuario.
 * @param {string} password - La contraseña del usuario.
 * @param {object} additionalData - Datos adicionales para guardar en Firestore (ej. { name, role, level }).
 * @returns {Promise<UserCredential>}
 */
const registerUser = async (email, password, additionalData) => {
  try {
    // 1. Crear el usuario en Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Crear un documento en Firestore en la colección "users"
    // Usamos el UID del usuario como ID del documento
    const userDocRef = doc(db, "users", user.uid);

    // 3. Guardar los datos
    await setDoc(userDocRef, {
      uid: user.uid,
      email: user.email,
      ...additionalData, // Añade los datos extra (nombre, rol, nivel, etc.)
      createdAt: new Date() // Opcional: guardar fecha de creación
    });

    return userCredential;
  } catch (error) {
    console.error("Error durante el registro:", error.code, error.message);
    throw error;
  }
};

// Función para manejar el login de usuario (sin cambios por ahora)
const loginUser = (email, password) => {
  return signInWithEmailAndPassword(auth, email, password);
};

// Función para manejar el logout de usuario
const logoutUser = () => {
  return signOut(auth);
};

// Función para observar el estado de autenticación (corregida)
// Usamos el import renombrado 'firebaseOnAuthStateChanged'
const onAuthStateChanged = (callback) => {
  return firebaseOnAuthStateChanged(auth, callback);
};

export { registerUser, loginUser, logoutUser, onAuthStateChanged };
