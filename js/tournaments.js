import { collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { db } from './firebase.js';

// Function to save a new tournament to Firestore
const saveTournament = (tournamentData) => {
  return addDoc(collection(db, 'tournaments'), tournamentData);
};

// Function to load all tournaments from Firestore
const loadTournaments = () => {
  return getDocs(collection(db, 'tournaments'));
};

export { saveTournament, loadTournaments };
