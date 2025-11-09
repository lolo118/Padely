import { app, auth, db } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js"; 
import { registerUser, loginUser, logoutUser, onAuthStateChanged } from './auth.js';
import { saveTournament, loadTournaments } from './tournaments.js';
import { openModal, closeModal, showPage } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  let selectedRole = 'player';
  let currentUserData = null; 
  let selectedModality = ''; 
  let currentWizardStep = 1; 

  // --- DEFINICIONES DE ELEMENTOS GLOBALES ---
  const sidebar = document.getElementById('sidebar');
  const menuOverlay = document.getElementById('menu-overlay');
  const menuToggleBtn = document.getElementById('menu-toggle');

  // --- FUNCIÓN PARA CERRAR MENÚ MÓVIL ---
  const closeMenu = () => {
    if (sidebar && menuOverlay) {
        sidebar.classList.add('-translate-x-full');
        sidebar.classList.remove('translate-x-0');
        menuOverlay.classList.add('hidden');
    }
  };

  // --- NAVEGACIÓN Y MODALES ---
  
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      // Resalta el link activo
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      e.currentTarget.classList.add('active');
      
      // Muestra la página
      const pageId = e.currentTarget.dataset.page;
      showPage(pageId);

      // (CORREGIDO) Cierra el menú móvil si está abierto
      if (!menuOverlay.classList.contains('hidden')) {
        closeMenu();
      }
    });
  });

  // ***** INICIO DE LA MODIFICACIÓN (Arreglo Menú Móvil) *****
  // --- LÓGICA DEL MENÚ MÓVIL ---
  if (menuToggleBtn && sidebar && menuOverlay) {
    // 1. Abrir el menú
    menuToggleBtn.addEventListener('click', () => {
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('translate-x-0');
        menuOverlay.classList.remove('hidden');
    });

    // 2. Cerrar al hacer clic en el overlay
    menuOverlay.addEventListener('click', closeMenu);
  }
  // ***** FIN DE LA MODIFICACIÓN *****

  document.getElementById('login-btn').addEventListener('click', () => {
    document.getElementById('login-error').classList.add('hidden');
    openModal('login-modal');
  });

  document.getElementById('register-btn').addEventListener('click', () => {
    document.getElementById('role-selection-step').classList.remove('hidden');
    document.getElementById('form-steps').classList.add('hidden');
    document.querySelectorAll('.register-form').forEach(form => form.classList.add('hidden'));
    document.getElementById('register-prompt-message').classList.add('hidden'); 
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
      resetWizardForm();
    });
  }
  
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            const modalId = e.currentTarget.dataset.modalId;
            closeModal(modalId);
            if (modalId === 'create-tournament-wizard') {
                resetWizardForm();
            }
        }
    });
  });

  const togglePasswordBtn = document.getElementById('toggle-password');
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
        const passwordInput = document.getElementById('password');
        const icon = togglePasswordBtn.querySelector('i');
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        } else {
            passwordInput.type = 'password';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
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

  const resetWizardForm = () => {
    document.getElementById('wizard-tournament-name').value = '';
    document.getElementById('wizard-start-datetime').value = '';
    document.getElementById('wizard-end-datetime').value = '';
    document.getElementById('wizard-location').value = '';
    document.getElementById('wizard-price').value = '';
    document.getElementById('wizard-deadline').value = '';
    document.getElementById('wizard-tiebreak').value = '';
    document.querySelectorAll('input[name="branch"]:checked').forEach(checkbox => { checkbox.checked = false; });
    document.querySelectorAll('.category-checkbox:checked').forEach(checkbox => { checkbox.checked = false; });
    document.getElementById('format-sets-best-of').value = '3';
    document.getElementById('format-tiebreak').value = 'normal';
    document.getElementById('format-punto-oro').checked = true;
    document.querySelectorAll('.modality-card').forEach(c => c.classList.remove('selected'));
    selectedModality = '';
    updateWizardStep(1);
  };

  const generateWizardSummary = () => {
    const summaryContainer = document.getElementById('wizard-summary');
    const getData = (id, defaultValue = 'No especificado') => {
        const value = document.getElementById(id).value;
        return value || defaultValue;
    };
    const getCheckedData = (selector, joiner = ', ') => {
        const items = Array.from(document.querySelectorAll(selector))
                           .map(cb => cb.value);
        return items.length ? items.join(joiner) : 'No especificadas';
    };
    const formatDate = (dateString) => {
        if (!dateString) return 'No especificada';
        try {
            const date = new Date(dateString);
            return date.toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' }) + ' hs';
        } catch (e) {
            return dateString;
        }
    };
    const data = {
        name: getData('wizard-tournament-name'),
        modality: selectedModality ? (selectedModality.charAt(0).toUpperCase() + selectedModality.slice(1)) : 'No especificada',
        startDate: formatDate(getData('wizard-start-datetime', null)),
        location: getData('wizard-location'),
        branches: getCheckedData('input[name="branch"]:checked'),
        categories: getCheckedData('.category-checkbox:checked'),
        price: getData('wizard-price', 'Gratis'),
        deadline: formatDate(getData('wizard-deadline', null)),
        sets: document.getElementById('format-sets-best-of').options[document.getElementById('format-sets-best-of').selectedIndex].text,
        tiebreak: document.getElementById('format-tiebreak').options[document.getElementById('format-tiebreak').selectedIndex].text,
        goldenPoint: document.getElementById('format-punto-oro').checked ? 'Sí' : 'No'
    };
    summaryContainer.innerHTML = `
        <div class="space-y-3">
            <h4 class="text-lg font-semibold text-white">${data.name}</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><strong class="text-gray-400">Modalidad:</strong> ${data.modality}</div>
                <div><strong class="text-gray-400">Lugar:</strong> ${data.location}</div>
                <div><strong class="text-gray-400">Inicio:</strong> ${data.startDate}</div>
                <div><strong class="text-gray-400">Inscripción:</strong> $${data.price}</div>
                <div class="col-span-2"><strong class="text-gray-400">Ramas:</strong> ${data.branches}</div>
                <div class="col-span-2"><strong class="text-gray-400">Categorías:</strong> ${data.categories}</div>
                <div class="col-span-2 pt-2 border-t border-gray-700 mt-2"><strong class="text-gray-400">Formato:</strong> ${data.sets}, ${data.tiebreak}, Punto de Oro: ${data.goldenPoint}.</div>
            </div>
        </div>
    `;
  };

  const updateWizardStep = (newStep) => {
    if (newStep === 5) {
        generateWizardSummary();
    }
    currentWizardStep = newStep;
    document.querySelectorAll('.wizard-step').forEach(step => step.classList.remove('active'));
    const activeStep = document.getElementById(`step-${newStep}`);
    if (activeStep) { activeStep.classList.add('active'); }
    const progressBar = document.getElementById('wizard-progress');
    const progressPercentage = (newStep - 1) * 25; 
    progressBar.style.width = `${progressPercentage}%`;
    document.getElementById('current-step-indicator').textContent = `Paso ${newStep} / 5`;
    const prevBtn = document.querySelector('.wizard-prev');
    const nextBtn = document.querySelector('.wizard-next');
    const finishBtn = document.getElementById('wizard-finish');
    prevBtn.disabled = (newStep === 1);
    nextBtn.classList.toggle('hidden', newStep === 5);
    finishBtn.classList.toggle('hidden', newStep !== 5);
  };

  document.querySelector('.wizard-next').addEventListener('click', () => {
    if (currentWizardStep < 5) { updateWizardStep(currentWizardStep + 1); }
  });
  document.querySelector('.wizard-prev').addEventListener('click', () => {
    if (currentWizardStep > 1) { updateWizardStep(currentWizardStep - 1); }
  });
  
  const openTournamentWizard = () => {
    resetWizardForm(); 
    openModal('create-tournament-wizard');
  };

  document.querySelectorAll('.modality-card').forEach(card => {
    card.addEventListener('click', e => {
      selectedModality = e.currentTarget.dataset.modality;
      const modalityName = e.currentTarget.querySelector('h4').textContent;
      document.querySelectorAll('.modality-card').forEach(c => c.classList.remove('selected'));
      e.currentTarget.classList.add('selected');
      document.getElementById('selected-modality-label').textContent = modalityName;
      document.querySelectorAll('[data-modality-options]').forEach(opt => {
        opt.classList.add('hidden');
      });
      const optionsToShow = document.querySelector(`[data-modality-options="${selectedModality}"]`);
      const placeholder = document.getElementById('no-options-placeholder');
      if (optionsToShow) {
        optionsToShow.classList.remove('hidden');
        placeholder.classList.add('hidden');
      } else {
        placeholder.classList.remove('hidden');
      }
    });
  });

  const checkTournamentCreationAccess = () => {
    return currentUserData && (currentUserData.role === 'organizer' || currentUserData.role === 'club');
  };

  const createTournamentBtn = document.getElementById('create-tournament-btn');
  if (createTournamentBtn) {
    createTournamentBtn.addEventListener('click', () => {
      if (checkTournamentCreationAccess()) {
        openTournamentWizard();
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
        openTournamentWizard();
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
      toggleButtonSpinner(wizardFinishBtn, true); 
      const branches = [];
      document.querySelectorAll('input[name="branch"]:checked').forEach(checkbox => { branches.push(checkbox.value); });
      const categories = [];
      document.querySelectorAll('.category-checkbox:checked').forEach(checkbox => { categories.push(checkbox.value); });
      const tournamentData = {
        organizerId: currentUserData.uid,
        organizerName: currentUserData.name || currentUserData.email,
        name: document.getElementById('wizard-tournament-name').value,
        modality: selectedModality, 
        startDate: document.getElementById('wizard-start-datetime').value,
        endDate: document.getElementById('wizard-end-datetime').value,
        location: document.getElementById('wizard-location').value,
        branches: branches, categories: categories, 
        price: document.getElementById('wizard-price').value || 0,
        registrationDeadline: document.getElementById('wizard-deadline').value,
        sets: document.getElementById('format-sets-best-of').value,
        tiebreak: document.getElementById('format-tiebreak').value,
        goldenPoint: document.getElementById('format-punto-oro').checked,
        createdAt: new Date(), status: 'Activo' 
      };
      try {
        await saveTournament(tournamentData);
        closeModal('create-tournament-wizard');
        await loadAndRenderTournaments(); 
      } catch (error) {
        console.error("Error saving tournament: ", error);
      } finally {
        toggleButtonSpinner(wizardFinishBtn, false); 
      }
    });
  }

  // --- FORMULARIOS DE AUTENTICACIÓN ---

  const toggleButtonSpinner = (button, show) => {
    const spinner = button.querySelector('.spinner');
    const text = button.querySelector('.button-text');
    if (show) {
      button.disabled = true;
      spinner.classList.remove('hidden');
      if (text) text.classList.add('hidden');
    } else {
      button.disabled = false;
      spinner.classList.add('hidden');
      if (text) text.classList.remove('hidden');
    }
  };

  const showAuthError = (error, elementId) => {
    const errorElement = document.getElementById(elementId);
    let message = 'Ocurrió un error. Inténtalo de nuevo.';
    switch (error.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
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
      const submitButton = e.submitter; 
      toggleButtonSpinner(submitButton, true); 
      document.getElementById('login-error').classList.add('hidden');
      const email = e.target.username.value;
      const password = e.target.password.value;
      try {
        await loginUser(email, password);
        closeModal('login-modal');
      } catch (error) {
        showAuthError(error, 'login-error');
      } finally {
        toggleButtonSpinner(submitButton, false); 
      }
    });
  }

  const registerFormPlayer = document.getElementById('register-form-player');
  if (registerFormPlayer) {
    registerFormPlayer.addEventListener('submit', async (e) => {
      e.preventDefault(); 
      const submitButton = e.submitter;
      toggleButtonSpinner(submitButton, true); 
      document.getElementById('register-error').classList.add('hidden');
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
        showAuthError(error, 'register-error');
      } finally {
        toggleButtonSpinner(submitButton, false); 
      }
    });
  }
  
  const registerFormOrganizer = document.getElementById('register-form-organizer');
  if (registerFormOrganizer) {
    registerFormOrganizer.addEventListener('submit', async (e) => {
      e.preventDefault(); 
      const submitButton = e.submitter;
      toggleButtonSpinner(submitButton, true); 
      document.getElementById('register-error').classList.add('hidden');
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
        showAuthError(error, 'register-error');
      } finally {
        toggleButtonSpinner(submitButton, false); 
      }
    });
  }
  
  const registerFormClub = document.getElementById('register-form-club');
  if (registerFormClub) {
    registerFormClub.addEventListener('submit', async (e) => {
      e.preventDefault(); 
      const submitButton = e.submitter;
      toggleButtonSpinner(submitButton, true); 
      document.getElementById('register-error').classList.add('hidden');
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
        showAuthError(error, 'register-error');
      } finally {
        toggleButtonSpinner(submitButton, false); 
      }
    });
  }
  
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await logoutUser(); } 
      catch (error) { console.error("Error logging out: ", error); }
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
    const tournamentsGrid = document.querySelector('#page-tournaments .grid');
    const loader = document.getElementById('tournament-loader'); 
    
    if (tournamentsGrid) {
      const addCard = document.getElementById('add-tournament-card');
      tournamentsGrid.innerHTML = ''; 
      if (addCard) { tournamentsGrid.appendChild(addCard); }
      loader.classList.remove('hidden'); 
      try {
        const querySnapshot = await loadTournaments();
        if (querySnapshot.empty) { 
          console.log("No se encontraron torneos.");
        }
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
      } finally {
        loader.classList.add('hidden'); 
      }
    }
  };
});