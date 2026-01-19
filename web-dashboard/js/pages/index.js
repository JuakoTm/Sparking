// js/pages/index.js
// Código movido desde inline <script> en index.html
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('¡Gracias por tu interés! Te contactaremos pronto.');
    e.target.reset();
  });
});
