import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

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

// Sesión anónima para pedir desde el QR de la cancha sin cuenta de Padely (Authentication → Sign-in method →
// Anonymous tiene que estar habilitado en la consola). Si ya hay una sesión (real o anónima) se reutiliza.
export const entrarAnonimo = async () => {
  if (auth.currentUser) return auth.currentUser;
  const { user } = await signInAnonymously(auth);
  return user;
};
// Storage (subir fotos y logos) y Analytics se cargan recién cuando se usan (P3-13: fuera del bundle inicial)
let storagePromesa = null;
export const getStorageLazy = () => (storagePromesa ||= import('firebase/storage').then(({ getStorage }) => getStorage(app)));
// Callables (us-central1): recalcularReporte
export const functions = getFunctions(app, 'us-central1');

// Analytics es opcional: solo si VITE_FIREBASE_MEASUREMENT_ID está definida (y el navegador lo soporta). Se carga
// aparte (import dinámico) para no sumar al bundle inicial.
const analyticsPromesa = measurementId
  ? import('firebase/analytics')
      .then(({ getAnalytics, logEvent }) => ({ analytics: getAnalytics(app), logEvent }))
      .catch((err) => {
        console.error('No se pudo iniciar Analytics:', err);
        return null;
      })
  : Promise.resolve(null);

// Registra un evento si Analytics está activo; si no, no hace nada.
// Solo se usan tres: reserva_creada, inscripcion_creada, torneo_creado.
export const logEvento = (nombre, params) => {
  analyticsPromesa.then((a) => {
    if (!a) return;
    try {
      a.logEvent(a.analytics, nombre, params);
    } catch (err) {
      console.error('No se pudo registrar el evento', nombre, err);
    }
  });
};
