// js/tournament-service.js
import { db } from './firebase.js';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { stateManager } from './state-manager.js';
import { validators } from './validators.js';

export const tournamentService = {

  /**
   * Carga todos los torneos desde Firestore.
   */
  loadTournaments: async () => {
    stateManager.setNestedState('loading', 'tournaments', true);
    
    try {
      // Ordenamos por fecha de creación descendente (los más nuevos primero)
      const q = query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const tournaments = [];
      querySnapshot.forEach((doc) => {
        tournaments.push({ id: doc.id, ...doc.data() });
      });
      
      stateManager.setState({ tournaments: tournaments });
      return tournaments;
    } catch (error) {
      console.error("Error cargando torneos:", error);
      stateManager.setNestedState('errors', 'tournament', 'Error al cargar los torneos.');
      throw error;
    } finally {
      stateManager.setNestedState('loading', 'tournaments', false);
    }
  },

  /**
   * Guarda un nuevo torneo con validación.
   */
  saveTournament: async (tournamentData) => {
    // 1. Validaciones básicas (Prioridad 2)
    if (!validators.isNotEmpty(tournamentData.name)) {
        throw new Error("El nombre del torneo es obligatorio.");
    }
    if (!validators.isDateInFuture(tournamentData.startDate)) {
        throw new Error("La fecha de inicio debe ser en el futuro.");
    }
    if (tournamentData.categories.length === 0) {
        throw new Error("Debes seleccionar al menos una categoría.");
    }

    stateManager.setNestedState('loading', 'tournaments', true);

    try {
      // 2. Añadir timestamp del servidor (Prioridad 4)
      const dataToSave = {
        ...tournamentData,
        createdAt: serverTimestamp(),
        status: 'open' // Estado inicial por defecto
      };

      const docRef = await addDoc(collection(db, 'tournaments'), dataToSave);
      console.log("Torneo creado con ID: ", docRef.id);
      
      // Recargar la lista para que aparezca el nuevo
      await tournamentService.loadTournaments();
      
      return docRef.id;
    } catch (error) {
      console.error("Error guardando torneo: ", error);
      throw error;
    } finally {
      stateManager.setNestedState('loading', 'tournaments', false);
    }
  }
};