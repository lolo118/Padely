// js/state-manager.js

/**
 * Un objeto simple (usando el patrón "observable") para gestionar el estado global de la app.
 * Esto nos permite desacoplar los componentes.
 * Ej: auth-service actualiza el 'user', y ui-manager "escucha" ese cambio para actualizar la UI.
 */
class StateManager {
  constructor() {
    this.state = {
      currentUserData: null,   // Guarda los datos del usuario logueado (ej. { uid, email, role, name })
      tournaments: [],         // Lista de torneos cargados
      currentPage: 'home',     // La página que se está viendo
      isModalOpen: null,     // Qué modal está abierto (ej. 'login-modal', 'register-modal', null)
      loading: {               // Estado de carga para spinners
        auth: false,           // Para login/registro
        tournaments: false     // Para la grilla de torneos
      },
      errors: {                // Errores para mostrar en la UI
        auth: null,            // Para login/registro
        tournament: null
      }
    };
    this.listeners = []; // Funciones que "escuchan" los cambios
  }

  /**
   * Se suscribe a los cambios de estado.
   * @param {function} listener - La función que se ejecutará cuando el estado cambie.
   * @returns {function} - Una función para "desuscribirse".
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => { // Devuelve una función de "unsubscribe"
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notifica a todos los "listeners" que el estado ha cambiado.
   */
  notify() {
    // Hacemos una copia inmutable para evitar mutaciones accidentales
    const stateCopy = JSON.parse(JSON.stringify(this.state));
    this.listeners.forEach(listener => listener(stateCopy));
  }

  /**
   * Actualiza una parte del estado y notifica a los listeners.
   * @param {object} newState - Un objeto con las claves/valores del estado a actualizar.
   */
  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.notify();
  }

  /**
   * Actualiza un estado anidado (como 'loading' o 'errors') de forma segura.
   * @param {string} key - La clave principal (ej. 'loading', 'errors')
   * @param {string} subkey - La sub-clave (ej. 'auth', 'tournaments')
   * @param {*} value - El nuevo valor.
   */
  setNestedState(key, subkey, value) {
    if (this.state[key] === undefined) {
        console.error(`Estado principal "${key}" no existe.`);
        return;
    }
    this.state[key] = { ...this.state[key], [subkey]: value };
    this.notify();
  }

  /**
   * Obtiene una copia "snapshot" del estado actual.
   * @returns {object}
   */
  getState() {
    // Devuelve una copia para evitar mutaciones directas
    return JSON.parse(JSON.stringify(this.state));
  }
  
  /**
   * Getter específico para saber si se puede crear un torneo.
   * @returns {boolean}
   */
  canCreateTournament() {
    const user = this.state.currentUserData;
    return user && (user.role === 'organizer' || user.role === 'club');
  }
}

// Creamos una instancia única (Singleton) y la exportamos
export const stateManager = new StateManager();