// White line icons for nodes. A node still stores an emoji in `icon` (the data model is unchanged);
// the emoji is only the key that picks which drawing to show.
const P = {
  '🎓': '<path d="M2.5 5h6.5a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5h-7z"/><path d="M21.5 5H15a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5h7z"/>',
  '🌿': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  '💞': '<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/>',
  '🛒': '<path d="M3 4h2.5l2.2 10.5h10.2L20 7.5H6.4"/><circle cx="9.5" cy="18.8" r="1.3"/><circle cx="17" cy="18.8" r="1.3"/>',
  '💡': '<path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/><path d="M9.5 18.5h5M10.5 21h3"/>',
  '💼': '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18"/>',
  '🏋️': '<path d="M6.5 7.5v9M3.5 10v4M17.5 7.5v9M20.5 10v4M6.5 12h11"/>',
  '💰': '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18M7 15h3"/>',
  '✈️': '<path d="M21 3 10 14M21 3l-6.5 18-4-7.5L3 9.5z"/>',
  '🍳': '<path d="M6 3v6.5a2 2 0 0 0 4 0V3M8 3v18M17.5 3c-2 2-3 5-3 8.5h3V21"/>',
  '🚗': '<path d="M4 16.5l1.6-5.3A2.5 2.5 0 0 1 8 9.5h8a2.5 2.5 0 0 1 2.4 1.7l1.6 5.3V19H4z"/><path d="M7.5 16h.01M16.5 16h.01"/>',
  '🏠': '<path d="M3 11.5 12 4l9 7.5M5 10v10h14V10M10 20v-6h4v6"/>',
  '📚': '<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM9 4v16M12.5 9h2.5"/>',
  '🎬': '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.3l5 2.7-5 2.7z"/>',
  '🩺': '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
  '⭐': '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"/>'
};

export function glyph(emoji) {
  const span = document.createElement('span');
  span.className = 'glyph';
  // Fixed markup from the table above, never user text.
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[emoji] || P['⭐']}</svg>`;
  return span;
}
