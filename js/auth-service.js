// js/auth-service.js
import { auth, db } from './firebase.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { stateManager } from './state-manager.js';
import { validators } from './validators.js';

export const authService = {

    /**
     * Inicializa el escuchador de estado de autenticación.
     */
    initAuthListener: () => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        const userData = { uid: user.uid, ...userDoc.data() };
                        stateManager.setState({ currentUserData: userData });
                    } else {
                        stateManager.setState({ currentUserData: { uid: user.uid, email: user.email, role: 'player' } });
                    }
                } catch (error) {
                    console.error("Error al obtener datos de usuario:", error);
                }
            } else {
                stateManager.setState({ currentUserData: null, tournaments: [] });
            }
        });
    },

    /**
     * Login con validación.
     */
    login: async (email, password) => {
        if (!validators.isValidEmail(email)) {
            throw { code: 'custom/invalid-email', message: 'El email no es válido.' };
        }
        if (!validators.isNotEmpty(password)) {
            throw { code: 'custom/empty-password', message: 'Ingresa tu contraseña.' };
        }

        stateManager.setNestedState('loading', 'auth', true);
        stateManager.setNestedState('errors', 'auth', null);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            return true;
        } catch (error) {
            stateManager.setNestedState('errors', 'auth', error);
            throw error;
        } finally {
            stateManager.setNestedState('loading', 'auth', false);
        }
    },

    /**
     * Registro con validación de seguridad.
     */
    register: async (formData) => {
        const { email, password, confirmPassword, role, ...otherData } = formData;

        // Validaciones de Seguridad (Prioridad 2)
        if (!validators.isValidEmail(email)) {
            throw { code: 'custom/invalid-email', message: 'El email no es válido.' };
        }
        if (!validators.isValidPassword(password)) {
            throw { code: 'custom/weak-password', message: 'La contraseña debe tener al menos 6 caracteres.' };
        }
        if (!validators.passwordsMatch(password, confirmPassword)) {
            throw { code: 'custom/password-mismatch', message: 'Las contraseñas no coinciden.' };
        }

        stateManager.setNestedState('loading', 'auth', true);
        stateManager.setNestedState('errors', 'auth', null);

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Guardar perfil en Firestore con timestamp del servidor (Prioridad 4)
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                email: user.email,
                role: role,
                ...otherData,
                createdAt: serverTimestamp()
            });

            return true;
        } catch (error) {
            stateManager.setNestedState('errors', 'auth', error);
            throw error;
        } finally {
            stateManager.setNestedState('loading', 'auth', false);
        }
    },

    logout: async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    }
};