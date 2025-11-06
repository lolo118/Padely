import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged as firebaseOnAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from './firebase.js';

// Function to handle user registration
const registerUser = (email, password) => {
  return createUserWithEmailAndPassword(auth, email, password);
};

// Function to handle user login
const loginUser = (email, password) => {
  return signInWithEmailAndPassword(auth, email, password);
};

// Function to handle user logout
const logoutUser = () => {
  return signOut(auth);
};

// Function to get the current user's authentication state
const onAuthStateChanged = (callback) => {
  return firebaseOnAuthStateChanged(auth, callback);
};

export { registerUser, loginUser, logoutUser, onAuthStateChanged };
