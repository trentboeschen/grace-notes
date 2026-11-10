// --- Authentication gate & account controls ---
// Loaded before app.js. Exposes window.SNAuth = { ready, isAuthenticated, handleUnauthorized }.
(function () {
    const API = 'api/login.php';
    const FLAG = 'snAuthed'; // Remembers sign-in so the app opens offline. Not a credential.

    const $ = (id) => document.getElementById(id);
    const overlay = $('auth-overlay'), form = $('auth-form'), title = $('auth-title'), help = $('auth-help');
    const pw = $('auth-password'), confirmPw = $('auth-confirm'), msg = $('auth-msg'), submit = $('auth-submit');

    let authed = false;
    let mode = 'login';
    let pending = null;
    let everAuthed = false; // init() runs the first sync; only re-sign-ins need to kick one.

    const setFlag = (on) => { try { on ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG); } catch (e) {} };
    const getFlag = () => { try { return localStorage.getItem(FLAG) === '1'; } catch (e) { return false; } };

    // Keep a reference to the real fetch; the wrapper below watches API responses for 401s.
    const rawFetch = window.fetch.bind(window);
    async function api(method, body) {
        const opts = { method, credentials: 'same-origin', cache: 'no-store', headers: {} };
        if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
        const res = await rawFetch(API, opts);
        let data = {};
        try { data = await res.json(); } catch (e) {}
        return { ok: res.ok, status: res.status, data };
    }

    function waitForAuth() {
        if (!pending) { let resolve; const promise = new Promise((r) => { resolve = r; }); pending = { promise, resolve }; }
        return pending.promise;
    }

    function finishAuth() {
        authed = true; setFlag(true);
        overlay.classList.add('hidden');
        pw.value = ''; confirmPw.value = '';
        if (pending) { pending.resolve(); pending = null; }
        if (everAuthed && typeof processSyncQueue === 'function') processSyncQueue();
        everAuthed = true;
    }

    function showOverlay(newMode, message) {
        mode = newMode;
        const setup = mode === 'setup', offline = mode === 'offline';
        title.textContent = setup ? 'Set a password' : offline ? 'Offline' : 'Sign in';
        let helpText = setup
            ? 'First-time setup: choose the password for these notes. You will enter it once on each device.'
            : offline ? 'Connect to the internet to sign in on this device.'
            : 'Enter your password to use your notes on this device.';
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
        if (!offline && location.protocol !== 'https:' && !local) {
            helpText += ' Warning: this site is not using HTTPS, so your password is sent unencrypted.';
        }
        help.textContent = helpText;
        pw.classList.toggle('hidden', offline); pw.required = !offline;
        pw.setAttribute('autocomplete', setup ? 'new-password' : 'current-password');
        confirmPw.classList.toggle('hidden', !setup); confirmPw.required = setup;
        submit.textContent = setup ? 'Save Password' : offline ? 'Retry' : 'Sign In';
        msg.textContent = message || '';
        overlay.classList.remove('hidden');
        if (!offline) setTimeout(() => pw.focus(), 50);
    }

    async function check() {
        let r = null;
        try { r = await api('GET'); } catch (e) {}
        if (!r || !r.ok) {
            // Offline or server trouble: trust a previous sign-in so local notes stay usable.
            if (getFlag()) finishAuth(); else showOverlay('offline', r ? 'The server reported an error.' : '');
            return;
        }
        if (r.data.authenticated) finishAuth();
        else { authed = false; setFlag(false); showOverlay(r.data.configured ? 'login' : 'setup'); }
    }

    function handleUnauthorized() {
        if (!authed) return; // Already prompting.
        authed = false; setFlag(false);
        waitForAuth();
        check();
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (mode === 'offline') { check(); return; }
        if (mode === 'setup' && pw.value !== confirmPw.value) { msg.textContent = 'Passwords do not match.'; return; }
        submit.disabled = true; msg.textContent = '';
        try {
            const r = await api('POST', { action: mode, password: pw.value });
            if (r.ok) finishAuth();
            else if (r.data.auth === 'login' && mode === 'setup') showOverlay('login', 'A password has already been set. Sign in instead.');
            else if (r.data.auth === 'setup' && mode === 'login') showOverlay('setup');
            else { msg.textContent = r.data.message || 'Sign-in failed.'; pw.select(); }
        } catch (err) {
            msg.textContent = 'Could not reach the server.';
        } finally {
            submit.disabled = false;
        }
    });

    // While the overlay is up, keep the app's keyboard shortcuts and context menu out of the way.
    const blockWhileOpen = (e) => { if (!overlay.classList.contains('hidden')) e.stopImmediatePropagation(); };
    window.addEventListener('keydown', blockWhileOpen, true);
    window.addEventListener('contextmenu', blockWhileOpen, true);

    // Any other API call answered with 401 (e.g. signed out elsewhere) brings the sign-in screen back.
    window.fetch = async (...args) => {
        const res = await rawFetch(...args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
            if (res.status === 401 && /(^|\/)api\/(?!login\.php)/.test(url)) handleUnauthorized();
        } catch (e) {}
        return res;
    };

    // --- Account section in Preferences ---
    const acctMsg = $('acct-msg');
    const say = (text, ok) => { if (!acctMsg) return; acctMsg.textContent = text; acctMsg.classList.toggle('ok', !!ok); };

    const btnChange = $('btn-change-password');
    if (btnChange) btnChange.addEventListener('click', async (e) => {
        e.preventDefault();
        const current = $('acct-current'), next = $('acct-new');
        if (!current.value || !next.value) { say('Enter your current and new password.'); return; }
        try {
            const r = await api('POST', { action: 'change_password', password: current.value, new_password: next.value });
            if (r.ok) { current.value = ''; next.value = ''; say('Password changed. Other devices have been signed out.', true); }
            else say(r.data.message || 'Could not change password.');
        } catch (err) { say('Could not reach the server.'); }
    });

    const btnOthers = $('btn-signout-others');
    if (btnOthers) btnOthers.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm('Sign out every other browser and device? They will need the password again.')) return;
        try {
            const r = await api('POST', { action: 'logout_others' });
            say(r.ok ? 'All other devices have been signed out.' : (r.data.message || 'Could not sign out other devices.'), r.ok);
        } catch (err) { say('Could not reach the server.'); }
    });

    const btnSignout = $('btn-signout');
    if (btnSignout) btnSignout.addEventListener('click', async (e) => {
        e.preventDefault();
        let unsynced = 0;
        try { unsynced = await db.sync_queue.count(); } catch (err) {}
        const warn = unsynced ? `\n\nWarning: ${unsynced} change(s) have not synced yet and will be lost.` : '';
        if (!confirm('Sign out of this device? Notes stored in this browser will be removed (they stay on the server).' + warn)) return;
        try {
            const r = await api('POST', { action: 'logout' });
            if (!r.ok) throw new Error();
        } catch (err) { say('Connect to the internet to sign out.'); return; }
        setFlag(false);
        ['lastSyncTime', 'lastActiveNote', 'lastAutoBackup'].forEach((k) => { try { localStorage.removeItem(k); } catch (err) {} });
        try { db.close(); await Dexie.delete('SpareNotes'); } catch (err) {}
        location.href = location.pathname;
    });

    const ready = waitForAuth();
    check();
    window.SNAuth = { ready, isAuthenticated: () => authed, handleUnauthorized };
})();
