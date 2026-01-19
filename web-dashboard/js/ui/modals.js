// js/ui/modals.js

/**
 * Abre un modal por su ID aplicando las clases de animación
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.warn(`Modal ${modalId} no encontrado`);
        return;
    }

    modal.classList.remove('hidden');
    // Pequeño delay para permitir transición CSS
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        
        // Buscar el contenedor del modal (puede ser el segundo hijo si hay backdrop)
        const contentBox = modal.querySelector('[role="dialog"]') || modal.querySelector('.scale-95') || modal.lastElementChild;
        if (contentBox && contentBox !== modal.firstElementChild) {
            contentBox.classList?.remove('scale-95');
            contentBox.classList?.add('scale-100');
        }
    }, 10);
}

/**
 * Cierra un modal
 */
export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.add('opacity-0');
    const content = modal.firstElementChild;
    if (content) {
        content.classList.add('scale-95');
        content.classList.remove('scale-100');
    }

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300); // Debe coincidir con la duración de transition-all en CSS
}

/**
 * Lógica específica para el modal de confirmación
 */
export function showConfirmModal(message, onConfirm) {
    const modal = document.getElementById('custom-confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    const btnYes = document.getElementById('btn-confirm-yes');
    const btnNo = document.getElementById('btn-confirm-cancel');

    if (!modal || !msgEl || !btnYes || !btnNo) return;

    msgEl.textContent = message;
    
    // Limpiamos listeners previos para no duplicar ejecuciones
    const newBtnYes = btnYes.cloneNode(true);
    const newBtnNo = btnNo.cloneNode(true);
    btnYes.parentNode.replaceChild(newBtnYes, btnYes);
    btnNo.parentNode.replaceChild(newBtnNo, btnNo);

    // Asignar nuevos eventos
    newBtnYes.addEventListener('click', () => {
        onConfirm();
        closeModal('custom-confirm-modal');
    });

    newBtnNo.addEventListener('click', () => {
        closeModal('custom-confirm-modal');
    });

    openModal('custom-confirm-modal');
}