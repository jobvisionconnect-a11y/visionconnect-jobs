/**
 * VisionConnect Accessibility Engine
 * Uses event listeners to avoid CSP issues with inline onclick
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ Accessibility Engine Loaded');
    
    const html = document.documentElement;
    const fontBtn = document.getElementById('a11y-font-cycle');
    const contrastBtn = document.getElementById('a11y-contrast-toggle');
    
    // 1. FONT CYCLING
    if (fontBtn) {
        fontBtn.addEventListener('click', () => {
            if (html.classList.contains('font-size-xlarge')) {
                html.classList.remove('font-size-xlarge', 'font-size-large');
                fontBtn.setAttribute('aria-pressed', 'false');
            } else if (html.classList.contains('font-size-large')) {
                html.classList.replace('font-size-large', 'font-size-xlarge');
                fontBtn.setAttribute('aria-pressed', 'true');
            } else {
                html.classList.add('font-size-large');
                fontBtn.setAttribute('aria-pressed', 'true');
            }
            localStorage.setItem('vconnect_font', html.className);
        });
    }

    // 2. CONTRAST TOGGLE
    if (contrastBtn) {
        contrastBtn.addEventListener('click', () => {
            const isHigh = html.classList.toggle('high-contrast');
            contrastBtn.setAttribute('aria-pressed', isHigh);
            localStorage.setItem('vconnect_contrast', isHigh);
        });
    }

    // 3. APPLY SAVED PREFERENCES
    const savedFont = localStorage.getItem('vconnect_font');
    if (savedFont) html.className = savedFont;
    
    const savedContrast = localStorage.getItem('vconnect_contrast');
    if (savedContrast === 'true') html.classList.add('high-contrast');
});