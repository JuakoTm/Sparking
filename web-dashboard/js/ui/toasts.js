// js/ui/toasts.js

/**
 * Muestra una notificación flotante (Toast)
 * @param {string} message - El texto a mostrar
 * @param {string} type - 'success' | 'error' | 'info'
 */
export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return; // Si no existe el contenedor en el HTML, no hacemos nada

    const toast = document.createElement('div');
    
    // Colores según tipo (Usando Tailwind)
    const colors = {
        success: 'bg-emerald-500 text-white shadow-emerald-200',
        error: 'bg-rose-500 text-white shadow-rose-200',
        info: 'bg-blue-500 text-white shadow-blue-200'
    };
    
    const colorClass = colors[type] || colors.info;

    toast.className = `${colorClass} px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 transform transition-all duration-300 translate-y-10 opacity-0`;
    toast.innerHTML = `
        <i class="fa-solid ${type === 'success' ? 'fa-check' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-info-circle'}"></i>
        <span class="font-medium text-sm">${message}</span>
    `;

    container.appendChild(toast);

    // Animación de entrada
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    });

    // Animación de salida y eliminación
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}