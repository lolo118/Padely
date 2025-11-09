// Importa las funciones necesarias desde la CDN de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";

// Tu configuración web de Firebase (¡Ahora con tus claves reales!)
const firebaseConfig = {
  apiKey: "AIzaSyB4l7csqMhgXFJFQYsikA2z1zCWlkMGv_c",
  authDomain: "padely-fecf8.firebaseapp.com",
  projectId: "padely-fecf8",
  storageBucket: "padely-fecf8.firebasestorage.app",
  messagingSenderId: "627231948848",
  appId: "1:627231948848:web:3ad20bb779b0e4fad2adf5",
  measurementId: "G-R6JD3V4KD9"
};

// Inicializa los servicios de Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // Necesario para auth.js
const db = getFirestore(app); // Necesario para tournaments.js y auth.js
const analytics = getAnalytics(app);

// Exporta los servicios para que los usen los otros módulos
export { app, auth, db, analytics };
