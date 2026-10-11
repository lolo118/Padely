import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
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

export const db = getFirestore(app);
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
