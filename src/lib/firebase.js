import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getAnalytics, logEvent } from 'firebase/analytics';

const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  ...(measurementId ? { measurementId } : {}),
};

const app = initializeApp(firebaseConfig);

// Firestore con persistencia local (IndexedDB) compartida entre pestañas: el bar sigue vendiendo sin internet y
// las escrituras se suben solas al volver. Si el navegador no lo permite (modo privado, IndexedDB bloqueado) el SDK
// avisa por consola y sigue en memoria; si la propia inicialización falla, se usa la instancia por defecto.
let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (err) {
  console.error('No se pudo activar la persistencia local de Firestore; se sigue solo en línea:', err);
  firestore = getFirestore(app);
}
export const db = firestore;
export const auth = getAuth(app);
export const storage = getStorage(app);

// Analytics es opcional: solo si VITE_FIREBASE_MEASUREMENT_ID está definida (y el navegador lo soporta)
let analytics = null;
if (measurementId) {
  try {
    analytics = getAnalytics(app);
  } catch (err) {
    console.error('No se pudo iniciar Analytics:', err);
    analytics = null;
  }
}

// Registra un evento si Analytics está activo; si no, no hace nada.
// Solo se usan tres: reserva_creada, inscripcion_creada, torneo_creado.
export const logEvento = (nombre, params) => {
  if (!analytics) return;
  try {
    logEvent(analytics, nombre, params);
  } catch (err) {
    console.error('No se pudo registrar el evento', nombre, err);
  }
};
