// Tilt the phone and the background shifts slightly under the cards.
// gamma is left/right tilt, beta is front/back; 45 degrees of beta is a normal holding angle.
const root = document.documentElement;
const clamp = (v) => Math.max(-1, Math.min(1, v));
window.addEventListener('deviceorientation', (e) => {
  if (e.gamma == null || e.beta == null) return;
  root.style.setProperty('--tx', clamp(e.gamma / 35).toFixed(3));
  root.style.setProperty('--ty', clamp((e.beta - 45) / 35).toFixed(3));
});
