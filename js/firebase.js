// Import the necessary Firebase functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// Your web app's Firebase configuration
// !!! IMPORTANT: THIS IS A PLACEHOLDER CONFIGURATION !!!
// To get your own Firebase credentials, follow these steps:
// 1. Go to the Firebase console: https://console.firebase.google.com/
// 2. Create a new project or select an existing one.
// 3. In your project, go to Project Settings (gear icon).
// 4. In the "General" tab, scroll down to "Your apps".
// 5. Click on the "Web" icon (</>) to create a new web app or get your existing config.
// 6. Copy the `firebaseConfig` object and paste it here.
// IMPORTANT: Replace with your actual Firebase project credentials
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export the Firebase services for use in other modules
export { app, auth, db };
