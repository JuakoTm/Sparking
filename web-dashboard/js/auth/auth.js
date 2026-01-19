// js/auth/auth.js
import { CONFIG } from '../config/config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    sendEmailVerification,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Inicializar Firebase
// Asegúrate de que CONFIG.FIREBASE esté definido en config.js
const app = initializeApp(CONFIG.FIREBASE);
const auth = getAuth(app);

/**
 * Traduce códigos de error de Firebase a español amigable
 */
function translateError(code) {
    const errors = {
        'auth/email-already-in-use': 'Este correo ya está registrado.',
        'auth/invalid-email': 'El correo no es válido.',
        'auth/weak-password': 'La contraseña es muy débil (mínimo 6 caracteres).',
        'auth/user-not-found': 'Usuario no encontrado.',
        'auth/wrong-password': 'Contraseña incorrecta.',
        'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.'
    };
    return errors[code] || `Error desconocido: ${code}`;
}

// --- FUNCIONES EXPORTABLES ---

export async function registerUser(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        return { success: true, user: userCredential.user, message: "Cuenta creada. Revisa tu correo." };
    } catch (error) {
        return { success: false, message: translateError(error.code) };
    }
}

export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        if (!user.emailVerified) {
            // Opcional: Permitir login sin verificar o bloquearlo
            // await signOut(auth);
        return { success: false, message: "Debes verificar tu correo primero." };
        }
        return { success: true, user };
    } catch (error) {
        return { success: false, message: translateError(error.code) };
    }
}

export async function logoutUser() {
    try {
        await signOut(auth);
        localStorage.removeItem('auth_token'); // Limpieza local
        return { success: true };
    } catch (error) {
        console.error("Error al salir:", error);
        return { success: false, error };
    }
}

export async function resetPasswordUser(email) {
    try {
        await sendPasswordResetEmail(auth, email);
        return { success: true, message: "Correo de recuperación enviado." };
    } catch (error) {
        return { success: false, message: translateError(error.code) };
    }
}

/**
 * Observador de estado (Singleton)
 * Se ejecutará cada vez que cambie el estado de auth
 */
export function monitorAuthState(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const token = await user.getIdToken();
            localStorage.setItem('auth_token', token);
            callback(user);
        } else {
            localStorage.removeItem('auth_token');
            callback(null);
        }
    });
}