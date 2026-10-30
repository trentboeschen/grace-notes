#!/bin/bash

echo "🧹 Cleaning up old files..."
rm -rf vendor/* api/* *.php *.js *.css *.json *.svg .htaccess

echo "🚀 Building Minimalist PWA Notes with Images & Links..."

mkdir -p api
mkdir -p vendor/fonts

echo "📦 Downloading vendored dependencies..."
curl -sS -L -o vendor/dexie-4.0.8.js "https://unpkg.com/dexie@4.0.8/dist/dexie.js"
curl -sS -L -o vendor/turndown-7.1.2.js "https://unpkg.com/turndown@7.1.2/dist/turndown.js"
curl -sS -L -o vendor/html-docx-0.3.1.js "https://unpkg.com/html-docx-js@0.3.1/dist/html-docx.js"
curl -sS -L -o vendor/html2pdf-0.10.1.js "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"
curl -sS -L -o vendor/medium-editor.min.js "https://cdn.jsdelivr.net/npm/medium-editor@5.23.3/dist/js/medium-editor.min.js"
curl -sS -L -o vendor/medium-editor.min.css "https://cdn.jsdelivr.net/npm/medium-editor@5.23.3/dist/css/medium-editor.min.css"
curl -sS -L -o vendor/medium-editor-theme.min.css "https://cdn.jsdelivr.net/npm/medium-editor@5.23.3/dist/css/themes/beagle.min.css"

echo "🔤 Downloading vendored fonts..."
curl -sS -L -o vendor/fonts/open-sans.woff2 "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.20/files/open-sans-latin-400-normal.woff2"
curl -sS -L -o vendor/fonts/roboto.woff2 "https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.14/files/roboto-latin-400-normal.woff2"
curl -sS -L -o vendor/fonts/opendyslexic.otf "https://raw.githubusercontent.com/antijingoist/opendyslexic/master/compiled/OpenDyslexic-Regular.otf"

echo "🖼️ Generating App Icon..."
cat << 'EOF' > icon.svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 20h9"/>
  <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>
  <path d="m15 5 3 3"/>
</svg>
EOF

echo "🔒 Generating .htaccess..."
cat << 'EOF' > .htaccess
<IfModule mod_rewrite.c>
  RewriteEngine Off
</IfModule>
DirectoryIndex index.php
<FilesMatch "\.(sqlite|db)$">
  <IfModule mod_authz_core.c>
    Require all denied
  </IfModule>
  <IfModule !mod_authz_core.c>
    Order allow,deny
    Deny from all
  </IfModule>
</FilesMatch>
<Files "sw.js">
  <IfModule mod_headers.c>
    Header set Cache-Control "no-cache, no-store, must-revalidate"
  </IfModule>
</Files>
EOF

echo "📄 Generating index.php..."
cat << 'EOF' > index.php
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="color-scheme" content="light dark">
    <title>Notes</title>
    <link rel="icon" type="image/svg+xml" href="icon.svg">
    <link rel="apple-touch-icon" href="icon.svg">
    <link rel="manifest" href="manifest.json">
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="vendor/medium-editor.min.css">
    <link rel="stylesheet" href="vendor/medium-editor-theme.min.css">
</head>
<body>
    <div id="library-view" class="view hidden">
        <ul id="note-list"></ul>
    </div>

    <div id="editor-view" class="view">
        <div id="editor" class="editable"></div>
    </div>

    <div id="sync-status" title="Sync Status"></div>
    
    <!-- Hidden file input for image uploads -->
    <input type="file" id="file-image-upload" accept="image/*" class="hidden">

    <ul id="context-menu" class="hidden">
        <li id="ctx-toggle-view">← Library</li>
        <li id="ctx-new-note">+ New Note</li>
        <li class="separator"></li>
        <li id="ctx-insert-image" class="ctx-editor-only">Insert Image</li>
        <li class="separator ctx-editor-only"></li>
        <li class="ctx-export" data-format="txt">Export .txt</li>
        <li class="ctx-export" data-format="md">Export .md</li>
        <li class="ctx-export" data-format="docx">Export .docx</li>
        <li class="ctx-export" data-format="pdf">Export .pdf</li>
        <li class="separator"></li>
        <li id="ctx-preferences">Preferences</li>
        <li id="ctx-delete-note">Delete Note</li>
    </ul>

    <!-- Preferences Modal -->
    <div id="preferences-modal" class="hidden">
        <div class="modal-content">
            <h2>Preferences</h2>
            <div class="pref-group">
                <label>Font: 
                    <select id="pref-font">
                        <option value="system">System Default</option>
                        <option value="'Open Sans'">Open Sans</option>
                        <option value="'Roboto'">Roboto</option>
                        <option value="'OpenDyslexic'">OpenDyslexic</option>
                    </select>
                </label>
                <label>Size (px): <input type="number" id="pref-size" min="10" max="32" value="16"></label>
            </div>
            <div class="pref-group">
                <h3>Light Mode Colors</h3>
                <label>Background: <input type="color" id="pref-light-bg"></label>
                <label>Text: <input type="color" id="pref-light-text"></label>
            </div>
            <div class="pref-group">
                <h3>Dark Mode Colors</h3>
                <label>Background: <input type="color" id="pref-dark-bg"></label>
                <label>Text: <input type="color" id="pref-dark-text"></label>
            </div>
            <div class="modal-actions">
                <button id="btn-save-prefs">Save</button>
                <button id="btn-close-prefs" class="btn-secondary">Cancel</button>
            </div>
        </div>
    </div>

    <script src="vendor/dexie-4.0.8.js"></script>
    <script src="vendor/medium-editor.min.js"></script>
    <script src="vendor/turndown-7.1.2.js"></script>
    <script src="vendor/html-docx-0.3.1.js"></script>
    <script src="vendor/html2pdf-0.10.1.js"></script>
    <script src="app.js" defer></script>
</body>
</html>
EOF

echo "🎨 Generating style.css..."
cat << 'EOF' > style.css
@font-face { font-family: 'Open Sans'; src: url('vendor/fonts/open-sans.woff2') format('woff2'); }
@font-face { font-family: 'Roboto'; src: url('vendor/fonts/roboto.woff2') format('woff2'); }
@font-face { font-family: 'OpenDyslexic'; src: url('vendor/fonts/opendyslexic.otf') format('opentype'); }

:root {
    --light-bg: #ffffff; --light-text: #1a1a1a; --dark-bg: #121212; --dark-text: #e0e0e0;
    --app-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --app-font-size: 16px;
    --bg-color: var(--light-bg); --text-color: var(--light-text); --ui-color: #e0e0e0; --hover-bg: rgba(0,0,0,0.05); --delete-color: #d9534f;
    --link-color: #0066cc;
}

@media (prefers-color-scheme: dark) {
    :root { --bg-color: var(--dark-bg); --text-color: var(--dark-text); --ui-color: #333333; --hover-bg: rgba(255,255,255,0.05); --delete-color: #ff6b6b; --link-color: #5ea8ff; }
}

body { 
    margin: 0; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); 
    font-family: var(--app-font); font-size: var(--app-font-size); background-color: var(--bg-color); color: var(--text-color); 
    transition: background-color 0.3s, color 0.3s; min-height: 100vh; 
}
.hidden { display: none !important; }
a { color: var(--link-color); text-decoration: none; border-bottom: 1px dotted var(--link-color); cursor: pointer; }
img { max-width: 100%; height: auto; border-radius: 4px; margin: 1rem 0; display: block; }
#editor { max-width: 800px; margin: 2rem auto; padding: 1rem; min-height: 80vh; outline: none; color: var(--text-color); }
#sync-status { position: fixed; bottom: 1rem; right: 1rem; width: 8px; height: 8px; border-radius: 50%; background-color: grey; opacity: 0.5; z-index: 50; transition: background-color 0.3s; }
#note-list { list-style: none; padding: 0; margin: 0; max-width: 800px; margin: 2rem auto; }
#note-list li { padding: 1rem; border-bottom: 1px solid var(--ui-color); cursor: pointer; transition: background 0.2s; }
#note-list li:hover { background: var(--hover-bg); }

#context-menu { position: absolute; background: var(--bg-color); border: 1px solid var(--ui-color); box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 8px; padding: 0.5rem 0; margin: 0; list-style: none; z-index: 10000; min-width: 160px; }
#context-menu li { padding: 0.5rem 1.2rem; cursor: pointer; font-size: 14px; user-select: none; }
#context-menu li:hover { background: var(--hover-bg); }
#context-menu .separator { height: 1px; background: var(--ui-color); margin: 0.5rem 0; padding: 0; cursor: default; }
#ctx-delete-note { color: var(--delete-color); }
#preferences-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 20000; display: flex; align-items: center; justify-content: center; }
.modal-content { background: var(--bg-color); padding: 2rem; border-radius: 8px; width: 300px; border: 1px solid var(--ui-color); }
.modal-content h2 { margin-top: 0; font-size: 1.2rem; border-bottom: 1px solid var(--ui-color); padding-bottom: 0.5rem; }
.modal-content h3 { font-size: 0.9rem; margin-bottom: 0.5rem; color: var(--text-color); opacity: 0.7;}
.pref-group { margin-bottom: 1.5rem; }
.pref-group label { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; font-size: 14px; }
.pref-group select, .pref-group input[type="number"] { background: var(--bg-color); color: var(--text-color); border: 1px solid var(--ui-color); border-radius: 4px; padding: 2px 5px; }
.pref-group input[type="color"] { border: none; width: 24px; height: 24px; cursor: pointer; padding: 0; background: transparent;}
.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
.modal-actions button { background: var(--text-color); color: var(--bg-color); border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-size: 14px; }
.modal-actions .btn-secondary { background: transparent; color: var(--text-color); border: 1px solid var(--ui-color); }
EOF

echo "⚙️ Generating app.js..."
cat << 'EOF' > app.js
function loadPreferences() {
    const defaultPrefs = { font: 'system', size: '16', lightBg: '#ffffff', lightText: '#1a1a1a', darkBg: '#121212', darkText: '#e0e0e0' };
    const prefs = JSON.parse(localStorage.getItem('appPreferences')) || defaultPrefs;
    const root = document.documentElement;
    if(prefs.font !== 'system') root.style.setProperty('--app-font', prefs.font);
    else root.style.setProperty('--app-font', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
    root.style.setProperty('--app-font-size', prefs.size + 'px');
    root.style.setProperty('--light-bg', prefs.lightBg); root.style.setProperty('--light-text', prefs.lightText);
    root.style.setProperty('--dark-bg', prefs.darkBg); root.style.setProperty('--dark-text', prefs.darkText);
    let metaLight = document.querySelector('meta[media="(prefers-color-scheme: light)"]');
    let metaDark = document.querySelector('meta[media="(prefers-color-scheme: dark)"]');
    if(metaLight) metaLight.setAttribute('content', prefs.lightBg);
    if(metaDark) metaDark.setAttribute('content', prefs.darkBg);
    return prefs;
}
loadPreferences(); 

const db = new Dexie("NotesApp");
db.version(1).stores({ notes: 'id, title, content, updated_at, deleted', sync_queue: 'id, action' });

const editor = new MediumEditor('#editor', {
    placeholder: { text: 'Right-click anywhere for tools. Start writing...', hideOnClick: false },
    toolbar: { buttons: ['bold', 'italic', 'underline', 'anchor', 'h2', 'h3', 'quote'] },
    anchor: { linkValidation: true, placeholderText: 'Paste or type a link', targetCheckbox: true, targetCheckboxText: 'Open in new window' }
});

let currentNoteId = null; let saveTimeout = null; let contextTargetNoteId = null; let savedSelection = null;
const libraryView = document.getElementById('library-view'); const editorView = document.getElementById('editor-view');
const noteList = document.getElementById('note-list'); const syncStatus = document.getElementById('sync-status');
const contextMenu = document.getElementById('context-menu'); const prefsModal = document.getElementById('preferences-modal');

const ctxToggleView = document.getElementById('ctx-toggle-view'); const ctxNewNote = document.getElementById('ctx-new-note');
const ctxDeleteNote = document.getElementById('ctx-delete-note'); const ctxPreferences = document.getElementById('ctx-preferences');
const ctxInsertImage = document.getElementById('ctx-insert-image'); const fileImageUpload = document.getElementById('file-image-upload');
const ctxExports = document.querySelectorAll('.ctx-export'); const ctxEditorOnly = document.querySelectorAll('.ctx-editor-only');

// Native selection saving function
function saveCursorPosition() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) return sel.getRangeAt(0).cloneRange();
    return null;
}

// Native selection restoring function
function restoreCursorPosition(range) {
    if (range) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

document.addEventListener('contextmenu', (e) => {
    if(e.target.closest('.modal-content')) return; 
    e.preventDefault(); contextTargetNoteId = null;
    
    // Save cursor position natively
    if (!editorView.classList.contains('hidden')) savedSelection = saveCursorPosition();
    
    if (libraryView.classList.contains('hidden')) {
        contextTargetNoteId = currentNoteId; ctxToggleView.textContent = '← Library';
        ctxExports.forEach(el => el.style.display = 'block');
        ctxEditorOnly.forEach(el => el.style.display = 'block');
        ctxDeleteNote.style.display = currentNoteId ? 'block' : 'none';
    } else {
        ctxToggleView.textContent = '→ Active Note'; ctxExports.forEach(el => el.style.display = 'none');
        ctxEditorOnly.forEach(el => el.style.display = 'none');
        const clickedLi = e.target.closest('#note-list li');
        if (clickedLi) { contextTargetNoteId = clickedLi.dataset.id; ctxDeleteNote.style.display = 'block'; } else { ctxDeleteNote.style.display = 'none'; }
    }
    contextMenu.classList.remove('hidden');
    let x = e.pageX, y = e.pageY;
    const menuWidth = contextMenu.offsetWidth || 160, menuHeight = contextMenu.offsetHeight || 300;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
    contextMenu.style.left = `${x}px`; contextMenu.style.top = `${y}px`;
});
document.addEventListener('click', (e) => { if (e.target.closest('#context-menu') === null) contextMenu.classList.add('hidden'); });

ctxInsertImage.addEventListener('click', () => { contextMenu.classList.add('hidden'); fileImageUpload.click(); });
fileImageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height; const max = 1200;
            if (w > max || h > max) { if (w > h) { h *= max / w; w = max; } else { w *= max / h; h = max; } }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            
            document.getElementById('editor').focus();
            restoreCursorPosition(savedSelection);
            document.execCommand('insertHTML', false, `<img src="${dataUrl}" alt="embedded image">`);
            fileImageUpload.value = ""; 
            saveLocal();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

ctxToggleView.addEventListener('click', () => { contextMenu.classList.add('hidden'); if (libraryView.classList.contains('hidden')) showLibrary(); else if (currentNoteId) showEditor(currentNoteId); });
ctxNewNote.addEventListener('click', () => { contextMenu.classList.add('hidden'); createNewNote(); });
ctxDeleteNote.addEventListener('click', async () => {
    contextMenu.classList.add('hidden'); if (!contextTargetNoteId || !confirm("Are you sure you want to delete this note?")) return;
    const note = await db.notes.get(contextTargetNoteId);
    if (note) { note.deleted = 1; note.updated_at = Date.now(); await db.notes.put(note); await db.sync_queue.put({ id: contextTargetNoteId, action: 'upsert' }); }
    if (currentNoteId === contextTargetNoteId) showLibrary(); else renderLibrary();
    processSyncQueue();
});
ctxExports.forEach(btn => { btn.addEventListener('click', (e) => { contextMenu.classList.add('hidden'); handleExport(e.target.getAttribute('data-format')); }); });

ctxPreferences.addEventListener('click', () => {
    contextMenu.classList.add('hidden');
    const prefs = JSON.parse(localStorage.getItem('appPreferences')) || { font: 'system', size: '16', lightBg: '#ffffff', lightText: '#1a1a1a', darkBg: '#121212', darkText: '#e0e0e0' };
    document.getElementById('pref-font').value = prefs.font; document.getElementById('pref-size').value = prefs.size;
    document.getElementById('pref-light-bg').value = prefs.lightBg; document.getElementById('pref-light-text').value = prefs.lightText;
    document.getElementById('pref-dark-bg').value = prefs.darkBg; document.getElementById('pref-dark-text').value = prefs.darkText;
    prefsModal.classList.remove('hidden');
});
document.getElementById('btn-close-prefs').addEventListener('click', () => prefsModal.classList.add('hidden'));
document.getElementById('btn-save-prefs').addEventListener('click', () => {
    const prefs = { font: document.getElementById('pref-font').value, size: document.getElementById('pref-size').value, lightBg: document.getElementById('pref-light-bg').value, lightText: document.getElementById('pref-light-text').value, darkBg: document.getElementById('pref-dark-bg').value, darkText: document.getElementById('pref-dark-text').value };
    localStorage.setItem('appPreferences', JSON.stringify(prefs)); loadPreferences(); prefsModal.classList.add('hidden');
});

function showEditor(id) { currentNoteId = id; localStorage.setItem('lastActiveNote', id); libraryView.classList.add('hidden'); editorView.classList.remove('hidden'); setTimeout(() => document.getElementById('editor').focus(), 50); }
function showLibrary() { currentNoteId = null; localStorage.removeItem('lastActiveNote'); editorView.classList.add('hidden'); libraryView.classList.remove('hidden'); renderLibrary(); }
async function createNewNote() { const newId = crypto.randomUUID(); editor.setContent(''); showEditor(newId); }
async function loadNote(id) { const note = await db.notes.get(id); if (note && !note.deleted) { editor.setContent(note.content); showEditor(id); } else showLibrary(); }
async function saveLocal() {
    if (!currentNoteId) return; syncStatus.style.backgroundColor = 'goldenrod';
    const content = editor.getContent(); const tempDiv = document.createElement('div'); tempDiv.innerHTML = content;
    const title = (tempDiv.textContent || tempDiv.innerText || "").split('\n')[0].substring(0, 40) || "Untitled Note";
    await db.notes.put({ id: currentNoteId, title: title, content: content, updated_at: Date.now(), deleted: 0 }); await db.sync_queue.put({ id: currentNoteId, action: 'upsert' });
    setTimeout(() => { syncStatus.style.backgroundColor = 'green'; }, 300);
}
async function renderLibrary() {
    noteList.innerHTML = ''; const notes = await db.notes.where('deleted').equals(0).reverse().sortBy('updated_at');
    notes.forEach(note => { const li = document.createElement('li'); li.dataset.id = note.id; li.textContent = note.title; li.onclick = () => loadNote(note.id); noteList.appendChild(li); });
}
function handleExport(format) {
    if (!format) return; const contentHTML = editor.getContent(); const tempDiv = document.createElement('div'); tempDiv.innerHTML = contentHTML; const plainText = tempDiv.innerText || tempDiv.textContent || "";
    let title = (plainText.split('\n')[0].substring(0, 40) || "Note").replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const triggerDownload = (blob, ext) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${title}.${ext}`; a.click(); URL.revokeObjectURL(url); };
    if (format === 'txt') { triggerDownload(new Blob([plainText], { type: 'text/plain' }), 'txt'); } else if (format === 'md') { const turndownService = new TurndownService(); triggerDownload(new Blob([turndownService.turndown(contentHTML)], { type: 'text/markdown' }), 'md'); } else if (format === 'docx') { const docxContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' + contentHTML + '</body></html>'; const converted = htmlDocx.asBlob(docxContent); triggerDownload(converted, 'docx'); } else if (format === 'pdf') { html2pdf().set({ margin: 1, filename: `${title}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } }).from(contentHTML).save(); }
}
editor.subscribe('editableInput', () => { clearTimeout(saveTimeout); saveTimeout = setTimeout(saveLocal, 500); });

async function processSyncQueue() {
    if (!navigator.onLine) { syncStatus.style.backgroundColor = 'red'; return; } syncStatus.style.backgroundColor = 'goldenrod';
    try {
        const queue = await db.sync_queue.toArray(); const changesToSync = [];
        for (const item of queue) { const note = await db.notes.get(item.id); if (note) changesToSync.push({ id: item.id, action: 'upsert', note: note }); }
        const lastSyncTime = parseInt(localStorage.getItem('lastSyncTime') || '0', 10);
        const response = await fetch('api/sync.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: changesToSync, last_sync: lastSyncTime }) });
        if (response.ok) {
            const result = await response.json(); await db.sync_queue.bulkDelete(queue.map(item => item.id));
            if (result.server_notes && result.server_notes.length > 0) {
                for (const remoteNote of result.server_notes) {
                    const localNote = await db.notes.get(remoteNote.id);
                    if (!localNote || remoteNote.updated_at > localNote.updated_at) { await db.notes.put(remoteNote); if (currentNoteId === remoteNote.id) { if (remoteNote.deleted == 1) showLibrary(); else editor.setContent(remoteNote.content); } }
                }
                if (libraryView.classList.contains('hidden') === false) renderLibrary();
            }
            localStorage.setItem('lastSyncTime', result.server_timestamp); syncStatus.style.backgroundColor = 'green';
        } else throw new Error("Server Error");
    } catch (error) { syncStatus.style.backgroundColor = 'red'; }
}
setInterval(processSyncQueue, 5000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
async function init() { const lastActive = localStorage.getItem('lastActiveNote'); if (lastActive) await loadNote(lastActive); else showLibrary(); processSyncQueue(); }
init();
EOF

echo "📱 Generating manifest.json..."
cat << 'EOF' > manifest.json
{
    "name": "Minimal Notes",
    "short_name": "Notes",
    "start_url": ".",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#ffffff",
    "icons": [
        {
            "src": "icon.svg",
            "sizes": "any",
            "type": "image/svg+xml",
            "purpose": "any maskable"
        }
    ]
}
EOF

echo "🌐 Generating sw.js..."
cat << 'EOF' > sw.js
const CACHE_NAME = 'notes-pwa-v13';
const APP_SHELL = [
    './', 'index.php', 'style.css', 'app.js', 'icon.svg',
    'vendor/dexie-4.0.8.js', 'vendor/medium-editor.min.js', 'vendor/medium-editor.min.css', 'vendor/medium-editor-theme.min.css', 'vendor/turndown-7.1.2.js', 'vendor/html-docx-0.3.1.js', 'vendor/html2pdf-0.10.1.js',
    'vendor/fonts/open-sans.woff2', 'vendor/fonts/roboto.woff2', 'vendor/fonts/opendyslexic.otf'
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))); });
self.addEventListener('fetch', (e) => { e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request))); });
EOF

echo "🗄️ Generating api/sync.php..."
cat << 'EOF' > api/sync.php
<?php
header('Content-Type: application/json');
try {
    $db = new PDO('sqlite:' . __DIR__ . '/database.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);$db->exec("CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT, content TEXT, updated_at INTEGER, deleted INTEGER DEFAULT 0)");
    $input = file_get_contents('php://input'); $data = json_decode($input, true);
    $server_timestamp = round(microtime(true) * 1000);$client_last_sync = isset($data['last_sync']) ? (int)$data['last_sync'] : 0;
    $db->beginTransaction();
    if (!empty($data['changes'])) {
        $stmtUpsert =$db->prepare("INSERT INTO notes (id, title, content, updated_at, deleted) VALUES (:id, :title, :content, :updated_at, :deleted) ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, updated_at = excluded.updated_at, deleted = excluded.deleted WHERE excluded.updated_at > notes.updated_at");
        foreach ($data['changes'] as$change) {
            if ($change['action'] === 'upsert' && isset($change['note'])) {
                $note = $change['note'];$stmtUpsert->execute([':id' => $note['id'], ':title' => $note['title'], ':content' => $note['content'], ':updated_at' => $note['updated_at'], ':deleted' => isset($note['deleted']) ? $note['deleted'] : 0]);
            }
        }
    }
    $db->commit();
    $stmtPull =$db->prepare("SELECT id, title, content, updated_at, deleted FROM notes WHERE updated_at > :last_sync");
    $stmtPull->execute([':last_sync' =>$client_last_sync]);
    $server_notes =$stmtPull->fetchAll(PDO::FETCH_ASSOC);
    foreach($server_notes as &$n) { $n['updated_at'] = (int)$n['updated_at']; $n['deleted'] = (int)$n['deleted']; }
    echo json_encode(["status" => "success", "server_timestamp" => $server_timestamp, "server_notes" => $server_notes]);
} catch (Exception $e) {
    if (isset($db) && $db->inTransaction())$db->rollBack();
    http_response_code(500); echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>
EOF

echo "✅ App generation complete! Cursor insertion bug fixed."
