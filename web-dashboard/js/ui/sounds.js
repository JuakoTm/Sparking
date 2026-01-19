// js/ui/sounds.js

const SOUNDS = {
    success: new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'), 
    error:   new Audio('https://assets.mixkit.co/active_storage/sfx/2658/2658-preview.mp3'),   
    pop:     new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'),   
    cancel:  new Audio('https://cdn.freesound.org/previews/242/242501_4414128-lq.mp3')    
};

// Configurar volumen inicial
Object.values(SOUNDS).forEach(audio => audio.volume = 0.4);

export function playSound(type) {
    if (SOUNDS[type]) {
        SOUNDS[type].currentTime = 0; // Reiniciar si ya se estaba reproduciendo
        SOUNDS[type].play().catch(e => console.warn("Audio bloqueado por el navegador:", e));
    }
}