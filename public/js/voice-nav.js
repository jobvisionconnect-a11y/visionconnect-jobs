/**
 * VisionConnect Voice Navigation Engine - V3 (Fuzzy Key-matching)
 */

document.addEventListener('DOMContentLoaded', () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const voiceBtn = document.getElementById('voice-nav-btn');
    
    if (!SpeechRecognition || !voiceBtn) return;

    let recognition = null;
    let isListening = false;

    function speak(text) {
        if (!window.speechSynthesis) return;
        const msg = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(msg);
    }

    function showStatus(text, isError = false) {
        let el = document.getElementById('voice-status-banner');
        if (!el) {
            el = document.createElement('div');
            el.id = 'voice-status-banner';
            document.body.appendChild(el);
            const style = document.createElement('style');
            style.textContent = `
                #voice-status-banner {
                    position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
                    background: #1a1a2e; color: white; padding: 12px 30px;
                    border-radius: 50px; font-weight: 700; z-index: 10001;
                    box-shadow: 0 5px 20px rgba(0,0,0,0.4); border: 2px solid #0d6e6e;
                    display: none;
                }
                #voice-status-banner.active { display: block; }
            `;
            document.head.appendChild(style);
        }
        el.textContent = text;
        el.style.borderColor = isError ? '#ff4444' : '#0d6e6e';
        el.classList.add('active');
    }

    const commandMap = [
        { keys: ['home', 'landing', 'start', 'main'], url: '/' },
        { keys: ['job', 'search', 'find', 'opening', 'vacancy'], url: '/jobs' },
        { keys: ['login', 'log in', 'signin', 'sign in', 'auth', 'account'], url: '/auth/login' },
        { keys: ['register', 'signup', 'sign up', 'join', 'create'], url: '/auth/register' },
        { keys: ['dash', 'area', 'portal', 'control'], url: '/seeker/dashboard' },
        { keys: ['application', 'applied', 'my application'], url: '/seeker/applications' },
        { keys: ['saved', 'bookmark', 'favourite', 'favorite'], url: '/seeker/saved-jobs' },
        { keys: ['profile', 'info', 'cv', 'resume'], url: '/seeker/profile' },
        { keys: ['logout', 'log out', 'signout', 'sign out', 'exit'], url: '/auth/logout' }
    ];

    voiceBtn.addEventListener('click', () => {
        if (isListening) {
            if (recognition) recognition.stop();
            return;
        }

        recognition = new SpeechRecognition();
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            isListening = true;
            voiceBtn.setAttribute('aria-pressed', 'true');
            showStatus('🎤 Listening...');
            speak('Listening');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.toLowerCase();
            showStatus(`Heard: "${transcript}"`);
            
            let targetUrl = null;
            let matchedKey = null;

            // Deep check against command map
            for (const entry of commandMap) {
                for (const key of entry.keys) {
                    if (transcript.includes(key)) {
                        targetUrl = entry.url;
                        matchedKey = key;
                        break;
                    }
                }
                if (targetUrl) break;
            }

            if (targetUrl) {
                speak(`Opening ${matchedKey}`);
                setTimeout(() => window.location.href = targetUrl, 600);
            } else {
                speak("I didn't recognize that command. Try: home, jobs, login, register, dashboard, applications, saved, profile, or logout.");
                showStatus(`Not recognized: "${transcript}"`, true);
            }
        };

        recognition.onend = () => {
            isListening = false;
            voiceBtn.setAttribute('aria-pressed', 'false');
            setTimeout(() => document.getElementById('voice-status-banner')?.classList.remove('active'), 3000);
        };

        recognition.onerror = (e) => {
            isListening = false;
            showStatus(`Mic Error: ${e.error}`, true);
        };

        recognition.start();
    });
});