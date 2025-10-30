import { app, auth, db } from './firebase.js';
// Importamos getDoc y doc para leer datos de Firestore
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js"; 
import { registerUser, loginUser, logoutUser, onAuthStateChanged } from './auth.js';
import { saveTournament, loadTournaments } from './tournaments.js';
import { openModal, closeModal, showPage } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  let selectedRole = 'player';
  let currentUserData = null; // Estado global para guardar los datos del usuario logueado

  // --- NAVEGACIÓN Y MODALES ---
  
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = e.currentTarget.dataset.page;
      showPage(pageId);
    });
  });

  document.getElementById('login-btn').addEventListener('click', () => openModal('login-modal'));

  document.getElementById('register-btn').addEventListener('click', () => {
    document.getElementById('role-selection-step').classList.remove('hidden');
    document.getElementById('form-steps').classList.add('hidden');
    document.querySelectorAll('.register-form').forEach(form => form.classList.add('hidden'));
    document.getElementById('register-prompt-message').classList.add('hidden'); 
    openModal('register-modal');
  });

  // Listener para los botones de cerrar de Login y Registro
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = e.currentTarget.closest('.modal-overlay').id;
      closeModal(modalId);
    });
  });

  // AÑADIDO: Listener específico para el botón de cerrar del WIZARD
  const closeWizardBtn = document.getElementById('close-wizard-btn');
  if (closeWizardBtn) {
    closeWizardBtn.addEventListener('click', () => {
      closeModal('create-tournament-wizard');
    });
  }

  // --- LÓGICA DE REGISTRO ---
  document.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', (e) => {
      selectedRole = e.currentTarget.dataset.role;
      document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
      e.currentTarget.classList.add('selected');
      document.getElementById('role-selection-step').classList.add('hidden');
      const formId = `register-form-${selectedRole}`;
      const formToShow = document.getElementById(formId);
      
      if (formToShow) {
        document.querySelectorAll('.register-form').forEach(form => form.classList.add('hidden'));
        formToShow.classList.remove('hidden');
        document.getElementById('form-steps').classList.remove('hidden');
      } else {
        console.warn(`No se encontró el formulario: ${formId}. Implementación pendiente.`);
        document.getElementById('role-selection-step').classList.remove('hidden');
      }
    });
  });

  document.querySelector('.back-to-roles').addEventListener('click', () => {
    document.getElementById('form-steps').classList.add('hidden');
    document.getElementById('role-selection-step').classList.remove('hidden');
    document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  });

  // --- CREACIÓN DE TORNEOS (MODIFICADO) ---

  const checkTournamentCreationAccess = () => {
    if (currentUserData && (currentUserData.role === 'organizer' || currentUserData.role === 'club')) {
      return true;
    }
    return false;
  };

  const createTournamentBtn = document.getElementById('create-tournament-btn');
  if (createTournamentBtn) {
    createTournamentBtn.addEventListener('click', () => {
      if (checkTournamentCreationAccess()) {
        openModal('create-tournament-wizard');
      } else {
        document.getElementById('register-prompt-message').classList.remove('hidden');
        openModal('register-modal');
      }
    });
  }

  const addTournamentCard = document.getElementById('add-tournament-card');
  if (addTournamentCard) {
    addTournamentCard.addEventListener('click', () => {
      if (checkTournamentCreationAccess()) {
        openModal('create-tournament-wizard');
      } else {
        document.getElementById('register-prompt-message').classList.remove('hidden');
        openModal('register-modal');
      }
    });
  }

  const wizardFinishBtn = document.getElementById('wizard-finish');
  if (wizardFinishBtn) {
    wizardFinishBtn.addEventListener('click', async () => {
      const tournamentData = {
        name: document.getElementById('wizard-tournament-name').value,
      };
      try {
        await saveTournament(tournamentData);
        closeModal('create-tournament-wizard');
      } catch (error) {
        console.error("Error saving tournament: ", error);
      }
    });
  }

  // --- FORMULARIOS DE AUTENTICACIÓN ---
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = e.target.username.value;
      const password = e.target.password.value;
      try {
        await loginUser(email, password);
        closeModal('login-modal');
      } catch (error) {
        console.error("Error logging in: ", error);
      }
    });
  }

  const registerForm = document.getElementById('register-form-player');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = e.target.email.value;
      const password = e.target.password.value;
      const nombre = e.target.nombre.value;
      const apellido = e.target.apellido.value;
      const nivel = e.target.nivel.value;
      const additionalData = {
        name: nombre,
        lastName: apellido,
        level: nivel,
        role: selectedRole
      };
      try {
        await registerUser(email, password, additionalData);
        closeModal('register-modal');
      } catch (error) {
        console.error("Error registering: ", error);
      }
    });
  }
  
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await logoutUser();
      } catch (error) {
        console.error("Error logging out: ", error);
      }
    });
  }

  // --- ESTADO DE AUTENTICACIÓN ---
  onAuthStateChanged(async (user) => {
    const userProfile = document.getElementById('user-profile');
    const registerBtn = document.getElementById('register-btn');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (user) {
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          currentUserData = { uid: user.uid, ...userDoc.data() };
        } else {
          console.warn("Usuario autenticado pero sin datos en Firestore.");
          currentUserData = { uid: user.uid, email: user.email, role: 'player' };
        }

        userProfile.classList.remove('hidden');
        registerBtn.classList.add('hidden');
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');

        document.getElementById('user-name').textContent = currentUserData.name || currentUserData.email;
        document.getElementById('user-initials').textContent = (currentUserData.name || currentUserData.email).charAt(0).toUpperCase();
        document.getElementById('user-role').textContent = currentUserData.role ? (currentUserData.role.charAt(0).toUpperCase() + currentUserData.role.slice(1)) : 'Jugador';

        loadAndRenderTournaments();

      } catch (error) {
        console.error("Error al obtener datos de usuario:", error);
        currentUserData = null;
      }
      
    } else {
      currentUserData = null; 

      userProfile.classList.add('hidden');
      registerBtn.classList.remove('hidden');
      loginBtn.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
    }
  });

  // --- Carga de Torneos (Funciones Helper) ---
  const createTournamentCard = (tournament) => {
    const card = document.createElement('div');
    card.className = 'tournament-card glass-card rounded-xl p-5 shadow-lg transition-all duration-300';
    card.innerHTML = `
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="font-bold text-white text-lg">${tournament.name}</h3>
          <p class="text-gray-400 text-sm mt-1">${tournament.category || 'Categoría no especificada'}</p>
        </div>
        <span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded-full">Activo</span>
      </div>
      <div class="flex items-center text-gray-400 text-sm mb-4">
        <i class="fas fa-calendar-alt mr-2"></i>
        <span>${tournament.date || 'Fecha no especificada'}</span>
      </div>
      <button class="mt-4 w-full btn-tertiary py-2 rounded-lg text-sm font-medium">Ver Detalles</button>
    `;
    return card;
  };

  const loadAndRenderTournaments = async () => {
    const tournamentsGrid = document.querySelector('#page-tournaments .grid');
    if (tournamentsGrid) {
      tournamentsGrid.innerHTML = '';
      const addTournamentCard = document.getElementById('add-tournament-card');
      if (addTournamentCard) {
        tournamentsGrid.appendChild(addTournamentCard);
      }

      try {
        const querySnapshot = await loadTournaments();
        querySnapshot.forEach((doc) => {
          const tournament = doc.data();
          const card = createTournamentCard(tournament);
          tournamentsGrid.insertBefore(card, addTournamentCard);
        });
      } catch (error) {
        console.error("Error loading tournaments: ", error);
      }
    }
  };
});
