// js/auth/auth.js
import { CONFIG } from '../config/config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(CONFIG.SUPABASE.URL, CONFIG.SUPABASE.ANON_KEY);

/**
 * Traduce codigos de error de Auth a espanol amigable
 */
function translateError(code) {
    const errors = {
        'user_already_exists': 'Este correo ya esta registrado.',
        'invalid_credentials': 'Correo o contrasena incorrecta.',
        'email_not_confirmed': 'Debes verificar tu correo primero.',
        'invalid_email': 'El correo no es valido.',
        'weak_password': 'La contrasena es muy debil (minimo 6 caracteres).',
        'over_email_send_rate_limit': 'Demasiados intentos. Intenta mas tarde.'
    };
    return errors[code] || `Error desconocido: ${code}`;
}

// --- FUNCIONES EXPORTABLES ---

export async function registerUser(email, password) {
    try {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
            return { success: false, message: translateError(error.code || error.message) };
        }
        return { success: true, user: data.user, message: 'Cuenta creada. Revisa tu correo.' };
    } catch (error) {
        return { success: false, message: translateError(error.code || error.message) };
    }
}

export async function loginUser(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            return { success: false, message: translateError(error.code || error.message) };
        }

        const user = data.user;
        const session = data.session;
        if (session?.access_token) {
            localStorage.setItem('auth_token', session.access_token);
        }
        
        if (CONFIG.SUPABASE.REQUIRE_EMAIL_CONFIRMATION && !user?.email_confirmed_at) {
            await supabase.auth.signOut();
            localStorage.removeItem('auth_token');
            return { success: false, message: 'Debes verificar tu correo primero.' };
        }

        return { success: true, user };
    } catch (error) {
        return { success: false, message: translateError(error.code || error.message) };
    }
}

export async function logoutUser() {
    try {
        await supabase.auth.signOut();
        localStorage.removeItem('auth_token'); // Limpieza local
        return { success: true };
    } catch (error) {
        console.error("Error al salir:", error);
        return { success: false, error };
    }
}

export async function resetPasswordUser(email) {
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: CONFIG.SUPABASE.RESET_PASSWORD_REDIRECT_TO || window.location.origin,
        });
        if (error) {
            return { success: false, message: translateError(error.code || error.message) };
        }
        return { success: true, message: 'Correo de recuperacion enviado.' };
    } catch (error) {
        return { success: false, message: translateError(error.code || error.message) };
    }
}

/**
 * Observador de estado (Singleton)
 * Se ejecutará cada vez que cambie el estado de auth
 */
export function monitorAuthState(callback) {
    const listener = supabase.auth.onAuthStateChange(async (_event, session) => {
        const user = session?.user || null;
        if (user) {
            localStorage.setItem('auth_token', session.access_token);
            let role = null;
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (!error && data?.role) {
                    role = data.role;
                }
            } catch (_err) {
                // Si falla la consulta de perfil, seguimos con el usuario base
            }

            const normalizedUser = {
                ...user,
                role: role || user?.app_metadata?.role || null
            };

            if (typeof callback === 'function') callback(normalizedUser);
        } else {
            localStorage.removeItem('auth_token');
            if (typeof callback === 'function') callback(null);
        }
    });

    return listener;
}
