// js/app.js
import { authService } from './auth-service.js';
import { tournamentService } from './tournament-service.js';
import { uiManager } from './ui-manager.js';
import { stateManager } from './state-manager.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inicializar los servicios
  // uiManager se suscribe al estado para actualizar la pantalla automáticamente
  uiManager.init();       
  // authService empieza a escuchar si el usuario está logueado o no
  authService.initAuthListener(); 

  // 2. Configurar Navegación Global
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = e.currentTarget.dataset.page;
      uiManager.showPage(pageId);
    });
  });

  // 3. Configurar Apertura de Modales Principales
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      uiManager.hideError('login-error');
      uiManager.openModal('login-modal');
    });
  }

  const registerBtn = document.getElementById('register-btn');
  if (registerBtn) {
    registerBtn.addEventListener('click', () => {
      uiManager.hideError('register-error');
      // Asegurarnos de que el modal empiece en el paso de selección de rol
      const roleStep = document.getElementById('role-selection-step');
      const formSteps = document.getElementById('form-steps');
      const msg = document.getElementById('register-prompt-message');
      
      if (roleStep) roleStep.classList.remove('hidden');
      if (formSteps) formSteps.classList.add('hidden');
      if (msg) msg.classList.add('hidden'); // Ocultar mensaje de advertencia si se abre normal
      
      // Ocultar formularios individuales
      document.querySelectorAll('.register-form').forEach(f => f.classList.add('hidden'));
      
      uiManager.openModal('register-modal');
    });
  }
  
  // Configurar cierre de modales (Botones X y Fondo Oscuro)
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = e.currentTarget.closest('.modal-overlay').id;
      uiManager.closeModal(modalId);
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            uiManager.closeModal(e.currentTarget.id);
        }
    });
  });

  // 4. Configurar Formularios de Autenticación
  
  // Login
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.submitter;
      uiManager.toggleSpinner(submitBtn, true);
      uiManager.hideError('login-error');

      try {
        await authService.login(
          e.target.username.value,
          e.target.password.value
        );
        uiManager.closeModal('login-modal');
      } catch (error) {
        uiManager.showError('login-error', error.message || 'Error al iniciar sesión');
      } finally {
        uiManager.toggleSpinner(submitBtn, false);
      }
    });
  }

  // Configuración genérica para los 3 formularios de registro
  const setupRegisterForm = (formId, role) => {
    const form = document.getElementById(formId);
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.submitter;
        uiManager.toggleSpinner(submitBtn, true);
        uiManager.hideError('register-error');

        // Recopilar datos del formulario
        const formData = {
          email: e.target.email.value,
          password: e.target.password.value,
          confirmPassword: e.target.confirmPassword.value,
          role: role,
          // Campos opcionales (usamos optional chaining ?. por seguridad)
          name: e.target.nombre ? `${e.target.nombre.value} ${e.target.apellido.value}` : undefined,
          level: e.target.nivel?.value,
          orgName: e.target.orgName?.value,
          contactName: e.target.contactName?.value,
          clubName: e.target.clubName?.value,
          address: e.target.address?.value,
          city: e.target.city?.value,
          phone: e.target.phone?.value
        };

        try {
          await authService.register(formData);
          uiManager.closeModal('register-modal');
          console.log("¡Registro exitoso!");
        } catch (error) {
          uiManager.showError('register-error', error.message || 'Error en el registro');
        } finally {
          uiManager.toggleSpinner(submitBtn, false);
        }
      });
    }
  };

  setupRegisterForm('register-form-player', 'player');
  setupRegisterForm('register-form-organizer', 'organizer');
  setupRegisterForm('register-form-club', 'club');

  // Logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await authService.logout();
    });
  }
  
  // Funcionalidad de "Ver Contraseña"
  const togglePassBtn = document.getElementById('toggle-password');
  if (togglePassBtn) {
      togglePassBtn.addEventListener('click', () => {
          const input = document.getElementById('password');
          const icon = togglePassBtn.querySelector('i');
          if (input.type === "password") {
              input.type = "text";
              icon.classList.remove('fa-eye-slash');
              icon.classList.add('fa-eye');
          } else {
              input.type = "password";
              icon.classList.remove('fa-eye');
              icon.classList.add('fa-eye-slash');
          }
      });
  }


  // 5. Configurar Wizard de Torneos
  // -----------------------------------------------------------
  // Aunque hemos movido la lógica de "guardar" al servicio,
  // la lógica de "navegación del wizard" (paso 1, 2, 3...) sigue siendo de UI,
  // por lo que la mantendremos aquí encapsulada para no complicar más.
  
  setupWizardLogic();

});

/**
 * Función auxiliar para encapsular toda la lógica del Wizard de creación
 */
function setupWizardLogic() {
    let currentStep = 1;
    let selectedModality = '';

    // 1. Abrir el Wizard (con chequeo de permisos)
    const openWizard = () => {
        if (stateManager.canCreateTournament()) {
             resetWizardUI();
             uiManager.openModal('create-tournament-wizard');
        } else {
            // Mostrar modal de registro con advertencia
            const msg = document.getElementById('register-prompt-message');
            if(msg) msg.classList.remove('hidden');
            uiManager.openModal('register-modal');
        }
    };

    const createBtn = document.getElementById('create-tournament-btn');
    if(createBtn) createBtn.addEventListener('click', openWizard);
    
    const addCard = document.getElementById('add-tournament-card');
    if(addCard) addCard.addEventListener('click', openWizard);

    // 2. Selección de Modalidad (Paso 1)
    document.querySelectorAll('.modality-card').forEach(card => {
        card.addEventListener('click', e => {
            selectedModality = e.currentTarget.dataset.modality;
            const modalityName = e.currentTarget.querySelector('h4').textContent;
            
            // UI Update
            document.querySelectorAll('.modality-card').forEach(c => c.classList.remove('selected'));
            e.currentTarget.classList.add('selected');
            
            // Preparar Paso 3 (Opciones dinámicas)
            const label = document.getElementById('selected-modality-label');
            if(label) label.textContent = modalityName;
            
            document.querySelectorAll('[data-modality-options]').forEach(opt => opt.classList.add('hidden'));
            const optionsToShow = document.querySelector(`[data-modality-options="${selectedModality}"]`);
            const placeholder = document.getElementById('no-options-placeholder');
            
            if (optionsToShow) {
                optionsToShow.classList.remove('hidden');
                if(placeholder) placeholder.classList.add('hidden');
            } else {
                if(placeholder) placeholder.classList.remove('hidden');
            }
        });
    });

    // 3. Navegación (Siguiente / Anterior)
    const updateStepUI = (newStep) => {
        if (newStep === 5) generateSummary(); // Generar resumen al llegar al final

        currentStep = newStep;
        // Ocultar/Mostrar pasos
        document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
        const activeStep = document.getElementById(`step-${newStep}`);
        if(activeStep) activeStep.classList.add('active');
        
        // Barra de progreso
        const bar = document.getElementById('wizard-progress');
        if(bar) bar.style.width = `${(newStep - 1) * 25}%`;
        
        // Indicador de texto
        const ind = document.getElementById('current-step-indicator');
        if(ind) ind.textContent = `Paso ${newStep} / 5`;
        
        // Botones
        const prevBtn = document.querySelector('.wizard-prev');
        const nextBtn = document.querySelector('.wizard-next');
        const finishBtn = document.getElementById('wizard-finish');
        
        if(prevBtn) prevBtn.disabled = (newStep === 1);
        if(nextBtn) nextBtn.classList.toggle('hidden', newStep === 5);
        if(finishBtn) finishBtn.classList.toggle('hidden', newStep !== 5);
    };

    document.querySelector('.wizard-next')?.addEventListener('click', () => {
        if (currentStep < 5) updateStepUI(currentStep + 1);
    });
    
    document.querySelector('.wizard-prev')?.addEventListener('click', () => {
        if (currentStep > 1) updateStepUI(currentStep - 1);
    });

    // 4. Resumen (Paso 5)
    const generateSummary = () => {
        const container = document.getElementById('wizard-summary');
        if(!container) return;
        
        // Helper para obtener valores seguros
        const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
        const formatD = (d) => { try { return new Date(d).toLocaleString(); } catch{ return d; }};
        
        // Recopilar
        const branches = Array.from(document.querySelectorAll('input[name="branch"]:checked')).map(c => c.value).join(', ');
        const cats = Array.from(document.querySelectorAll('.category-checkbox:checked')).map(c => c.value).join(', ');
        
        container.innerHTML = `
            <div class="space-y-2 text-sm">
                <p><strong class="text-white">Torneo:</strong> ${val('wizard-tournament-name')}</p>
                <p><strong class="text-white">Modalidad:</strong> ${selectedModality.toUpperCase()}</p>
                <p><strong class="text-white">Fecha:</strong> ${formatD(val('wizard-start-datetime'))}</p>
                <p><strong class="text-white">Lugar:</strong> ${val('wizard-location')}</p>
                <p><strong class="text-white">Categorías:</strong> ${cats || 'Ninguna'}</p>
                <p><strong class="text-white">Ramas:</strong> ${branches || 'Ninguna'}</p>
                <p><strong class="text-white">Precio:</strong> $${val('wizard-price') || 'Gratis'}</p>
            </div>
        `;
    };

    // 5. Finalizar y Guardar (Usando el TournamentService)
    const finishBtn = document.getElementById('wizard-finish');
    if (finishBtn) {
        finishBtn.addEventListener('click', async () => {
            uiManager.toggleSpinner(finishBtn, true);
            
            // Recolectar datos finales
            const branches = Array.from(document.querySelectorAll('input[name="branch"]:checked')).map(c => c.value);
            const categories = Array.from(document.querySelectorAll('.category-checkbox:checked')).map(c => c.value);
            const user = stateManager.getState().currentUserData;

            const tournamentData = {
                organizerId: user.uid,
                organizerName: user.name || user.email,
                name: document.getElementById('wizard-tournament-name').value,
                modality: selectedModality,
                startDate: document.getElementById('wizard-start-datetime').value,
                endDate: document.getElementById('wizard-end-datetime').value,
                location: document.getElementById('wizard-location').value,
                price: document.getElementById('wizard-price').value,
                registrationDeadline: document.getElementById('wizard-deadline').value,
                branches: branches,
                categories: categories,
                // Configs adicionales
                sets: document.getElementById('format-sets-best-of')?.value,
                tiebreak: document.getElementById('format-tiebreak')?.value,
                goldenPoint: document.getElementById('format-punto-oro')?.checked
            };

            try {
                await tournamentService.saveTournament(tournamentData);
                uiManager.closeModal('create-tournament-wizard');
                // Resetear el form para la próxima
                resetWizardUI(); 
                console.log("Torneo creado exitosamente");
            } catch (error) {
                alert(error.message); // Feedback simple por ahora
            } finally {
                uiManager.toggleSpinner(finishBtn, false);
            }
        });
    }

    // Helper para limpiar el wizard
    const resetWizardUI = () => {
        document.getElementById('wizard-tournament-name').value = '';
        document.getElementById('wizard-start-datetime').value = '';
        // ... (limpiar resto de campos si se desea)
        selectedModality = '';
        document.querySelectorAll('.modality-card').forEach(c => c.classList.remove('selected'));
        updateStepUI(1);
    };
}