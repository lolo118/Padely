import { app, auth, db } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js"; 
import { registerUser, loginUser, logoutUser, onAuthStateChanged } from './auth.js';
import { saveTournament, loadTournaments } from './tournaments.js';
import { openModal, closeModal, showPage } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  let selectedRole = 'player';
  let currentUserData = null; 
  let selectedModality = ''; 
  let currentWizardStep = 1; // Variable para el estado del wizard

  // --- NAVEGACIÓN Y MODALES ---
  
  // (CORREGIDO - Error 3: Feedback de Navegación)
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Quitar 'active' de todos los links
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      // Añadir 'active' solo al clickeado
      e.currentTarget.classList.add('active');
      
      const pageId = e.currentTarget.dataset.page;
      showPage(pageId);
    });
  });

  document.getElementById('login-btn').addEventListener('click', () => {
    // Limpiar errores de login al abrir
    document.getElementById('login-error').classList.add('hidden');
    openModal('login-modal');
  });

  document.getElementById('register-btn').addEventListener('click', () => {
    document.getElementById('role-selection-step').classList.remove('hidden');
    document.getElementById('form-steps').classList.add('hidden');
    document.querySelectorAll('.register-form').forEach(form => form.classList.add('hidden'));
    document.getElementById('register-prompt-message').classList.add('hidden'); 
    // Limpiar errores de registro al abrir
    document.getElementById('register-error').classList.add('hidden');
    openModal('register-modal');
  });

  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = e.currentTarget.closest('.modal-overlay').id;
      closeModal(modalId);
    });
  });

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
      if (selectedRole === 'club') {
        e.currentTarget.querySelector('h3').textContent = 'Club';
      }
      
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

  // --- CREACIÓN DE TORNEOS ---

  // (CORREGIDO - Error 1: Lógica del Wizard)
  const updateWizardStep = (newStep) => {
    currentWizardStep = newStep;

    // Ocultar todos los pasos
    document.querySelectorAll('.wizard-step').forEach(step => step.classList.remove('active'));
    // Mostrar el paso actual
    const activeStep = document.getElementById(`step-${newStep}`);
    if (activeStep) {
      activeStep.classList.add('active');
    }

    // Actualizar barra de progreso
    const progressBar = document.getElementById('wizard-progress');
    const progressPercentage = (newStep - 1) * 25; // 0, 25, 50, 75, 100
    progressBar.style.width = `${progressPercentage}%`;

    // Actualizar indicador de texto
    document.getElementById('current-step-indicator').textContent = `Paso ${newStep} / 5`;

    // Controlar visibilidad de botones
    const prevBtn = document.querySelector('.wizard-prev');
    const nextBtn = document.querySelector('.wizard-next');
    const finishBtn = document.getElementById('wizard-finish');

    if (newStep === 1) {
      prevBtn.disabled = true;
    } else {
      prevBtn.disabled = false;
    }

    if (newStep === 5) {
      nextBtn.classList.add('hidden');
      finishBtn.classList.remove('hidden');
    } else {
      nextBtn.classList.remove('hidden');
      finishBtn.classList.add('hidden');
    }
  };

  // Listeners para botones del wizard
  document.querySelector('.wizard-next').addEventListener('click', () => {
    if (currentWizardStep < 5) {
      updateWizardStep(currentWizardStep + 1);
    }
  });

  document.querySelector('.wizard-prev').addEventListener('click', () => {
    if (currentWizardStep > 1) {
      updateWizardStep(currentWizardStep - 1);
    }
  });
  
  // Resetea el wizard al abrirlo
  const openTournamentWizard = () => {
    updateWizardStep(1); // Ir al paso 1
    // (Opcional: aquí iría la lógica de limpiar el formulario)
    openModal('create-tournament-wizard');
  };

  document.querySelectorAll('.modality-card').forEach(card => {
    card.addEventListener('click', e => {
      selectedModality = e.currentTarget.dataset.modality;
      document.querySelectorAll('.modality-card').forEach(c => c.classList.remove('selected'));
      e.currentTarget.classList.add('selected');
    });
  });

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
        openTournamentWizard(); // Usar la nueva función
      } else {
        document.getElementById('register-prompt-message').classList.remove('hidden');
        document.getElementById('register-error').classList.add('hidden');
        openModal('register-modal');
      }
    });
  }

  const addTournamentCard = document.getElementById('add-tournament-card');
  if (addTournamentCard) {
    addTournamentCard.addEventListener('click', () => {
      if (checkTournamentCreationAccess()) {
        openTournamentWizard(); // Usar la nueva función
      } else {
        document.getElementById('register-prompt-message').classList.remove('hidden');
        document.getElementById('register-error').classList.add('hidden');
        openModal('register-modal');
      }
    });
  }

  const wizardFinishBtn = document.getElementById('wizard-finish');
  if (wizardFinishBtn) {
    wizardFinishBtn.addEventListener('click', async () => {
      // (Lógica de guardar torneo sin cambios)
      const branches = [];
      document.querySelectorAll('input[name="branch"]:checked').forEach(checkbox => {
        branches.push(checkbox.value);
      });
      const categories = [];
      document.querySelectorAll('.category-checkbox:checked').forEach(checkbox => {
        categories.push(checkbox.value);
      });
      const tournamentData = {
        organizerId: currentUserData.uid,
        organizerName: currentUserData.name || currentUserData.email,
        name: document.getElementById('wizard-tournament-name').value,
        modality: selectedModality, 
        startDate: document.getElementById('wizard-start-datetime').value,
        endDate: document.getElementById('wizard-end-datetime').value,
        location: document.getElementById('wizard-location').value,
        branches: branches, 
        categories: categories, 
        price: document.getElementById('wizard-price').value || 0,
        registrationDeadline: document.getElementById('wizard-deadline').value,
        sets: document.getElementById('format-sets-best-of').value,
        tiebreak: document.getElementById('format-tiebreak').value,
        goldenPoint: document.getElementById('format-punto-oro').checked,
        createdAt: new Date(),
        status: 'Activo' 
      };
      try {
        await saveTournament(tournamentData);
        closeModal('create-tournament-wizard');
        await loadAndRenderTournaments(); 
      } catch (error) {
        console.error("Error saving tournament: ", error);
      }
    });
  }

  // --- FORMULARIOS DE AUTENTICACIÓN ---

  // (CORREGIDO - Error 2: Feedback de Errores)
  const showAuthError = (error, elementId) => {
    const errorElement = document.getElementById(elementId);
    let message = 'Ocurrió un error. Inténtalo de nuevo.';
    switch (error.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        message = 'Email o contraseña incorrectos.';
        break;
      case 'auth/invalid-email':
        message = 'El formato del email es incorrecto.';
        break;
      case 'auth/email-already-in-use':
        message = 'Este email ya está registrado.';
        break;
      case 'auth/weak-password':
        message = 'La contraseña debe tener al menos 6 caracteres.';
        break;
    }
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
  };

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      document.getElementById('login-error').classList.add('hidden'); // Ocultar error previo
      const email = e.target.username.value;
      const password = e.target.password.value;
      try {
        await loginUser(email, password);
        closeModal('login-modal');
      } catch (error) {
        showAuthError(error, 'login-error'); // Mostrar error
      }
    });
  }

  // Listener para JUGADOR
  const registerFormPlayer = document.getElementById('register-form-player');
  if (registerFormPlayer) {
    registerFormPlayer.addEventListener('submit', async (e) => {
      e.preventDefault(); 
      document.getElementById('register-error').classList.add('hidden'); // Ocultar error previo
      const email = e.target.email.value;
      const password = e.target.password.value;
      const nombre = e.target.nombre.value;
      const apellido = e.target.apellido.value;
      const nivel = e.target.nivel.value;
      const additionalData = { name: `${nombre} ${apellido}`, level: nivel, role: selectedRole };
      try {
        await registerUser(email, password, additionalData);
        closeModal('register-modal');
      } catch (error) {
        showAuthError(error, 'register-error'); // Mostrar error
      }
    });
  }
  
  // Listener para ORGANIZADOR
  const registerFormOrganizer = document.getElementById('register-form-organizer');
  if (registerFormOrganizer) {
    registerFormOrganizer.addEventListener('submit', async (e) => {
      e.preventDefault(); 
      document.getElementById('register-error').classList.add('hidden'); // Ocultar error previo
      const email = e.target.email.value;
      const password = e.target.password.value;
      const orgName = e.target.orgName.value;
      const contactName = e.target.contactName.value;
      const phone = e.target.phone.value;
      const additionalData = { name: orgName, contactName: contactName, phone: phone, role: selectedRole };
      try {
        await registerUser(email, password, additionalData);
        closeModal('register-modal');
      } catch (error) {
        showAuthError(error, 'register-error'); // Mostrar error
      }
    });
  }
  
  // Listener para CLUB
  const registerFormClub = document.getElementById('register-form-club');
  if (registerFormClub) {
    registerFormClub.addEventListener('submit', async (e) => {
      e.preventDefault(); 
      document.getElementById('register-error').classList.add('hidden'); // Ocultar error previo
      const email = e.target.email.value;
      const password = e.target.password.value;
      const clubName = e.target.clubName.value;
      const address = e.target.address.value;
      const city = e.target.city.value;
      const phone = e.target.phone.value;
      const additionalData = { name: clubName, address: address, city: city, phone: phone, role: selectedRole };
      try {
        await registerUser(email, password, additionalData);
        closeModal('register-modal');
      } catch (error) {
        showAuthError(error, 'register-error'); // Mostrar error
      }
    });
  }
  
  // Botón de Logout
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
          currentUserData = { uid: user.uid, email: user.email, role: 'player' };
        }
        userProfile.classList.remove('hidden');
        registerBtn.classList.add('hidden');
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        document.getElementById('user-name').textContent = currentUserData.name || currentUserData.email;
        document.getElementById('user-initials').textContent = (currentUserData.name || currentUserData.email).charAt(0).toUpperCase();
        const role = currentUserData.role || 'player';
        document.getElementById('user-role').textContent = role.charAt(0).toUpperCase() + role.slice(1);
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
    // (Función sin cambios)
    const card = document.createElement('div');
    card.className = 'tournament-card glass-card rounded-xl p-5 shadow-lg transition-all duration-300';
    let displayDate = 'Fecha no especificada';
    if (tournament.startDate) {
      try {
        const date = new Date(tournament.startDate);
        displayDate = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
      } catch(e) { displayDate = tournament.startDate; }
    }
    const categoriesText = tournament.categories && tournament.categories.length > 0 
      ? tournament.categories.join(' - ') 
      : 'Categorías no especificadas';
    card.innerHTML = `
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="font-bold text-white text-lg">${tournament.name}</h3>
          <p class="text-gray-400 text-sm mt-1">${categoriesText}</p>
        </div>
        <span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded-full">${tournament.status || 'Activo'}</span>
      </div>
      <div class="flex items-center text-gray-400 text-sm mb-4">
        <i class="fas fa-calendar-alt mr-2"></i>
        <span>${displayDate}</span>
      </div>
      <div class="flex items-center text-gray-400 text-sm mb-4">
        <i class="fas fa-map-marker-alt mr-2"></i>
        <span>${tournament.location || 'Lugar no especificado'}</span>
      </div>
      <button class="mt-4 w-full btn-tertiary py-2 rounded-lg text-sm font-medium">Ver Detalles</button>
    `;
    return card;
  };

  const loadAndRenderTournaments = async () => {
    // (Función sin cambios)
    const tournamentsGrid = document.querySelector('#page-tournaments .grid');
    if (tournamentsGrid) {
      const addCard = document.getElementById('add-tournament-card');
      tournamentsGrid.innerHTML = ''; 
      if (addCard) { tournamentsGrid.appendChild(addCard); }
      try {
        const querySnapshot = await loadTournaments();
        if (querySnapshot.empty) { return; }
        querySnapshot.forEach((doc) => {
          const tournament = doc.data();
          const card = createTournamentCard(tournament);
          if (addCard) {
            tournamentsGrid.insertBefore(card, addCard);
          } else {
            tournamentsGrid.appendChild(card);
          }
        });
      } catch (error) {
        console.error("Error loading tournaments: ", error);
      }
    }
  };
});
