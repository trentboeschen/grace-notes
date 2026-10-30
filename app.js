// --- High-Priority Ctrl+K Interceptor ---
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();           // Block MediumEditor
        e.stopImmediatePropagation();  // Block anything else on this frame
        
        let x = window.innerWidth / 2, y = window.innerHeight / 2;
        
        // Snap to text cursor coordinates
        const sel = window.getSelection();
        if (sel.rangeCount > 0 && typeof editorView !== 'undefined' && !editorView.classList.contains('hidden')) {
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            if (rect.x !== 0 && rect.y !== 0) { x = rect.left; y = rect.bottom; }
        }
        
        const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
        (document.activeElement || document.body).dispatchEvent(ev);
        
        if (typeof menuFocusedIndex !== 'undefined') {
            menuFocusedIndex = 0;
            if (typeof updateMenuFocus === 'function') setTimeout(updateMenuFocus, 10);
        }
    }
}, true); // 'true' forces the capture phase




function loadPreferences() {
    const defaultPrefs = { font: 'system', size: '16', lightBg: '#ffffff', lightText: '#1a1a1a', darkBg: '#121212', darkText: '#e0e0e0', backupPath: '' };
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
    toolbar: { buttons: ['bold', 'italic', 'underline', 'anchor', 'h2', 'h3', 'quote', 'pre'] },
    anchor: { linkValidation: true, placeholderText: 'Paste or type a link', targetCheckbox: true, targetCheckboxText: 'Open in new window' },
    paste: {
        forcePlainText: false,
        cleanPastedHTML: true,
        cleanAttrs: ['class', 'style', 'dir'],
        cleanTags: ['meta', 'span'] 
    }
});

let currentNoteId = null; let saveTimeout = null; let contextTargetNoteId = null; let savedSelection = null;
let contextTargetCell = null;

const libraryView = document.getElementById('library-view'); const editorView = document.getElementById('editor-view');
const editorDOM = document.getElementById('editor');
const noteList = document.getElementById('note-list'); const syncStatus = document.getElementById('sync-status');
const contextMenu = document.getElementById('context-menu'); const prefsModal = document.getElementById('preferences-modal');

const imgToolbar = document.getElementById('image-toolbar');
const resizeSlider = document.getElementById('img-resize-slider');
let activeImage = null;

const ctxToggleView = document.getElementById('ctx-toggle-view');
const ctxRevisions = document.getElementById('ctx-revisions'); const ctxNewNote = document.getElementById('ctx-new-note');
const ctxDeleteNote = document.getElementById('ctx-delete-note'); const ctxTags = document.getElementById('ctx-tags'); const ctxPreferences = document.getElementById('ctx-preferences');
const ctxInsertImage = document.getElementById('ctx-insert-image'); const fileImageUpload = document.getElementById('file-image-upload');
const ctxInsertTable = document.getElementById('ctx-insert-table');
const ctxExports = document.querySelectorAll('.ctx-export'); const ctxEditorOnly = document.querySelectorAll('.ctx-editor-only');
const ctxTableOnly = document.querySelectorAll('.ctx-table-only');

const btnAddRowAbove = document.getElementById('ctx-add-row-above');
const btnAddRowBelow = document.getElementById('ctx-add-row-below');
const btnAddColLeft = document.getElementById('ctx-add-col-left');
const btnAddColRight = document.getElementById('ctx-add-col-right');
const btnDelRow = document.getElementById('ctx-del-row');
const btnDelCol = document.getElementById('ctx-del-col');
const btnDelTable = document.getElementById('ctx-del-table');

function saveCursorPosition() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) return sel.getRangeAt(0).cloneRange();
    return null;
}
function restoreCursorPosition(range) {
    if (range) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
}

function getCellIndex(td) { return Array.from(td.parentNode.children).indexOf(td); }

document.addEventListener('contextmenu', (e) => {
    if(e.target.closest('.modal-content') || e.target.closest('#image-toolbar')) return; 
    e.preventDefault(); contextTargetNoteId = null;
    
    if (!editorView.classList.contains('hidden')) savedSelection = saveCursorPosition();
    
    contextTargetCell = e.target.closest('td, th');
    const generalSeparators = document.querySelectorAll('#context-menu .separator:not(.ctx-table-only)');
    
    if (libraryView.classList.contains('hidden')) {
        contextTargetNoteId = currentNoteId; 
        
        if (contextTargetCell) {
            // Table-specific ONLY
            ctxTableOnly.forEach(el => el.style.display = 'block');
            ctxEditorOnly.forEach(el => el.style.display = 'none');
            ctxExports.forEach(el => el.style.display = 'none');
            ctxToggleView.style.display = 'none';
            ctxNewNote.style.display = 'none';
            ctxPreferences.style.display = 'none';
            ctxDeleteNote.style.display = 'none';
            if(ctxTags) ctxTags.style.display = 'none';
            generalSeparators.forEach(el => el.style.display = 'none');
        } else {
            // General Editor Menu
            ctxTableOnly.forEach(el => el.style.display = 'none');
            ctxEditorOnly.forEach(el => el.style.display = 'block');
            ctxExports.forEach(el => el.style.display = 'block');
            ctxToggleView.textContent = '← Library';
            ctxToggleView.style.display = 'block';
            ctxNewNote.style.display = 'block';
            ctxPreferences.style.display = 'block';
            ctxDeleteNote.style.display = currentNoteId ? 'block' : 'none';
            if(ctxTags) ctxTags.style.display = currentNoteId ? 'block' : 'none';
            generalSeparators.forEach(el => el.style.display = 'block');
        }
    } else {
        // Library View Menu
        ctxNewNote.style.display = 'block';
        ctxPreferences.style.display = 'block';
        ctxExports.forEach(el => el.style.display = 'none'); 
        ctxEditorOnly.forEach(el => el.style.display = 'none'); 
        ctxTableOnly.forEach(el => el.style.display = 'none');
        generalSeparators.forEach(el => el.style.display = 'block');
        
        const clickedLi = e.target.closest('#note-list li');
        if (clickedLi) { 
            contextTargetNoteId = clickedLi.dataset.id; 
            ctxDeleteNote.style.display = 'block';
            if(ctxTags) ctxTags.style.display = 'block'; 
            ctxToggleView.textContent = 'Open Note'; 
            ctxToggleView.style.display = 'block';
        } else { 
            ctxDeleteNote.style.display = 'none';
            if(ctxTags) ctxTags.style.display = 'none'; 
            if (currentNoteId) {
                ctxToggleView.textContent = '→ Active Note'; 
                ctxToggleView.style.display = 'block';
            } else {
                ctxToggleView.style.display = 'none';
            }
        }
    }
    
    contextMenu.classList.remove('hidden'); if(imgToolbar) imgToolbar.classList.add('hidden'); 
    let x = e.pageX || (e.clientX + window.scrollX) || (window.innerWidth / 2), y = e.pageY || (e.clientY + window.scrollY) || (window.innerHeight / 2);
    const menuWidth = contextMenu.offsetWidth || 160, menuHeight = contextMenu.offsetHeight || 300;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
        // Clean up empty menu sections and redundant dividers
    let lastVisible = null;
    Array.from(contextMenu.children).forEach(li => {
        if (li.style.display !== 'none') {
            if (li.classList.contains('separator')) {
                if (!lastVisible || lastVisible.classList.contains('separator')) {
                    li.style.display = 'none'; // Hide consecutive or leading separators
                } else {
                    lastVisible = li;
                }
            } else {
                lastVisible = li;
            }
        }
    });
    // Strip trailing separator if it's the last visible item
    if (lastVisible && lastVisible.classList.contains('separator')) {
        lastVisible.style.display = 'none';
    }

    contextMenu.style.left = `${x}px`; contextMenu.style.top = `${y}px`;
});

// Submenu Edge Detection
document.addEventListener('mouseover', (e) => {
    const parent = e.target.closest('.has-submenu');
    if (parent) {
        const submenu = parent.querySelector('.submenu');
        const rect = parent.getBoundingClientRect();
        if (rect.right + 200 > window.innerWidth) {
            submenu.style.left = 'auto';
            submenu.style.right = '100%';
        } else {
            submenu.style.left = '100%';
            submenu.style.right = 'auto';
        }
    }
});
document.addEventListener('click', (e) => { 
    if (e.target.closest('#context-menu') === null) contextMenu.classList.add('hidden'); 
    
    if (e.target.tagName === 'IMG' && e.target.closest('#editor')) {
        if (activeImage) activeImage.classList.remove('active-img');
        activeImage = e.target;
        activeImage.classList.add('active-img');
        
        if(imgToolbar) {
            const rect = activeImage.getBoundingClientRect();
            imgToolbar.style.top = `${rect.top + window.scrollY - 50}px`;
            imgToolbar.style.left = `${rect.left + window.scrollX}px`;
            imgToolbar.classList.remove('hidden');
        }
        
        const currentWidth = activeImage.style.width;
        if(resizeSlider) resizeSlider.value = currentWidth ? parseInt(currentWidth) : 100;
    } else if (imgToolbar && !e.target.closest('#image-toolbar')) {
        imgToolbar.classList.add('hidden');
        if (activeImage) activeImage.classList.remove('active-img');
        activeImage = null;
    }
});

const btnAlignLeft = document.getElementById('img-align-left');
if (btnAlignLeft) btnAlignLeft.onclick = () => { if(activeImage) { activeImage.style.display = 'inline'; activeImage.style.float = 'left'; activeImage.style.margin = '0 1rem 1rem 0'; saveLocal(); }};
const btnAlignCenter = document.getElementById('img-align-center');
if (btnAlignCenter) btnAlignCenter.onclick = () => { if(activeImage) { activeImage.style.display = 'block'; activeImage.style.float = 'none'; activeImage.style.margin = '1rem auto'; saveLocal(); }};
const btnAlignRight = document.getElementById('img-align-right');
if (btnAlignRight) btnAlignRight.onclick = () => { if(activeImage) { activeImage.style.display = 'inline'; activeImage.style.float = 'right'; activeImage.style.margin = '0 0 1rem 1rem'; saveLocal(); }};
if (resizeSlider) resizeSlider.oninput = (e) => { if(activeImage) { activeImage.style.width = `${e.target.value}%`; saveLocal(); }};

function processImageFile(file, overrideRange = null) {
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
            
            editorDOM.focus();
            if (overrideRange) restoreCursorPosition(overrideRange);
            else if (savedSelection) restoreCursorPosition(savedSelection);
            
            document.execCommand('insertHTML', false, `<img src="${dataUrl}" alt="embedded image" style="width: 100%;">`);
            if(fileImageUpload) fileImageUpload.value = ""; 
            saveLocal();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

editorDOM.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
editorDOM.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
            let dropRange = null;
            if (document.caretRangeFromPoint) dropRange = document.caretRangeFromPoint(e.clientX, e.clientY);
            processImageFile(file, dropRange);
        }
    }
});

// Table Insert Logic
if(ctxInsertTable) {
    ctxInsertTable.addEventListener('click', () => {
        contextMenu.classList.add('hidden');
        const tableHTML = `<table><tbody><tr><th>Heading 1</th><th>Heading 2</th></tr><tr><td>Content cell</td><td>Content cell</td></tr><tr><td>Content cell</td><td>Content cell</td></tr></tbody></table><p><br></p>`;
        editorDOM.focus();
        if (savedSelection) restoreCursorPosition(savedSelection);
        document.execCommand('insertHTML', false, tableHTML);
        saveLocal();
    });
}

// Table Manipulation Logic
if (btnAddRowAbove) {
    btnAddRowAbove.onclick = () => {
        if(!contextTargetCell) return;
        const tr = contextTargetCell.parentNode;
        const newTr = document.createElement('tr');
        Array.from(tr.children).forEach(() => { const newTd = document.createElement('td'); newTd.innerHTML = '<br>'; newTr.appendChild(newTd); });
        tr.parentNode.insertBefore(newTr, tr); saveLocal(); contextMenu.classList.add('hidden');
    };
    btnAddRowBelow.onclick = () => {
        if(!contextTargetCell) return;
        const tr = contextTargetCell.parentNode;
        const newTr = document.createElement('tr');
        Array.from(tr.children).forEach(() => { const newTd = document.createElement('td'); newTd.innerHTML = '<br>'; newTr.appendChild(newTd); });
        tr.parentNode.insertBefore(newTr, tr.nextSibling); saveLocal(); contextMenu.classList.add('hidden');
    };
    btnAddColLeft.onclick = () => {
        if(!contextTargetCell) return;
        const idx = getCellIndex(contextTargetCell);
        contextTargetCell.closest('table').querySelectorAll('tr').forEach(row => {
            const newCell = document.createElement(row.querySelector('th') ? 'th' : 'td'); newCell.innerHTML = '<br>';
            row.insertBefore(newCell, row.children[idx]);
        }); saveLocal(); contextMenu.classList.add('hidden');
    };
    btnAddColRight.onclick = () => {
        if(!contextTargetCell) return;
        const idx = getCellIndex(contextTargetCell);
        contextTargetCell.closest('table').querySelectorAll('tr').forEach(row => {
            const newCell = document.createElement(row.querySelector('th') ? 'th' : 'td'); newCell.innerHTML = '<br>';
            row.insertBefore(newCell, row.children[idx + 1] || null);
        }); saveLocal(); contextMenu.classList.add('hidden');
    };
    btnDelRow.onclick = () => {
        if(!contextTargetCell) return;
        const table = contextTargetCell.closest('table');
        contextTargetCell.parentNode.remove();
        if(!table.querySelector('tr')) table.remove();
        saveLocal(); contextMenu.classList.add('hidden');
    };
    btnDelCol.onclick = () => {
        if(!contextTargetCell) return;
        const table = contextTargetCell.closest('table');
        const idx = getCellIndex(contextTargetCell);
        table.querySelectorAll('tr').forEach(row => { if(row.children[idx]) row.children[idx].remove(); });
        if(!table.querySelector('td, th')) table.remove();
        saveLocal(); contextMenu.classList.add('hidden');
    };
    btnDelTable.onclick = () => {
        if(!contextTargetCell) return;
        contextTargetCell.closest('table').remove();
        saveLocal(); contextMenu.classList.add('hidden');
    };
}

// Auto-add rows when tabbing out of a table
editorDOM.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            let node = sel.anchorNode;
            const td = node.nodeType === 3 ? node.parentNode.closest('td, th') : (node.closest ? node.closest('td, th') : null);
            if (td) {
                const tr = td.parentNode;
                const tbody = tr.parentNode;
                if (tr === tbody.lastElementChild && td === tr.lastElementChild) {
                    e.preventDefault();
                    const newTr = document.createElement('tr');
                    Array.from(tr.children).forEach(() => {
                        const newTd = document.createElement('td'); newTd.innerHTML = '<br>'; newTr.appendChild(newTd);
                    });
                    tbody.appendChild(newTr);
                    const newRange = document.createRange();
                    newRange.setStart(newTr.firstElementChild, 0); newRange.collapse(true);
                    sel.removeAllRanges(); sel.addRange(newRange);
                    saveLocal();
                }
            }
        }
    }
});

if(ctxInsertImage && fileImageUpload) {
    ctxInsertImage.addEventListener('click', () => { contextMenu.classList.add('hidden'); fileImageUpload.click(); });
    fileImageUpload.addEventListener('change', (e) => { if(e.target.files[0]) processImageFile(e.target.files[0]); });
}

ctxToggleView.addEventListener('click', () => { contextMenu.classList.add('hidden'); if (libraryView.classList.contains('hidden')) showLibrary(); else if (contextTargetNoteId) loadNote(contextTargetNoteId); else if (currentNoteId) showEditor(currentNoteId); });
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
    const prefs = JSON.parse(localStorage.getItem('appPreferences')) || { font: 'system', size: '16', lightBg: '#ffffff', lightText: '#1a1a1a', darkBg: '#121212', darkText: '#e0e0e0', backupPath: '' };
    document.getElementById('pref-font').value = prefs.font; document.getElementById('pref-size').value = prefs.size;
    document.getElementById('pref-light-bg').value = prefs.lightBg; document.getElementById('pref-light-text').value = prefs.lightText;
    document.getElementById('pref-dark-bg').value = prefs.darkBg; document.getElementById('pref-dark-text').value = prefs.darkText;
    if(document.getElementById('pref-backup-path')) fetch('api/settings.php').then(r=>r.json()).then(s=> document.getElementById('pref-backup-path').value = s.backupPath || '').catch(e=>console.log(e));
    prefsModal.classList.remove('hidden');
});
document.getElementById('btn-close-prefs').addEventListener('click', () => prefsModal.classList.add('hidden'));
document.getElementById('btn-save-prefs').addEventListener('click', () => {
    const prefs = { font: document.getElementById('pref-font').value, size: document.getElementById('pref-size').value, lightBg: document.getElementById('pref-light-bg').value, lightText: document.getElementById('pref-light-text').value, darkBg: document.getElementById('pref-dark-bg').value, darkText: document.getElementById('pref-dark-text').value, backupPath: document.getElementById('pref-backup-path').value };
    localStorage.setItem('appPreferences', JSON.stringify(prefs));
    const bPath = document.getElementById('pref-backup-path') ? document.getElementById('pref-backup-path').value : '';
    fetch('api/settings.php', { method: 'POST', body: JSON.stringify({ backupPath: bPath }) }); loadPreferences(); prefsModal.classList.add('hidden');
});

function showEditor(id) { currentNoteId = id; localStorage.setItem('lastActiveNote', id); libraryView.classList.add('hidden'); editorView.classList.remove('hidden'); setTimeout(() => document.getElementById('editor').focus(), 50); }
function showLibrary() { document.title = 'Notes'; currentNoteId = null; localStorage.removeItem('lastActiveNote'); editorView.classList.add('hidden'); libraryView.classList.remove('hidden'); window.history.pushState(null, '', window.location.pathname); renderLibrary(); }
async function createNewNote() { const newId = Math.random().toString(36).substring(2, 10); editor.setContent(''); showEditor(newId); }
async function loadNote(id) { if (window.location.search !== '?n=' + id) window.history.pushState(null, '', '?n=' + id); const note = await db.notes.get(id); if (note && !note.deleted) { editor.setContent(note.content); document.title = (note.title || 'Untitled Note') + ' - Notes'; showEditor(id); } else showLibrary(); }

async function saveLocal() {
    if (!currentNoteId) return; syncStatus.style.backgroundColor = 'goldenrod';
    const cloneDiv = document.createElement('div');
    cloneDiv.innerHTML = editor.getContent();
    cloneDiv.querySelectorAll('img').forEach(img => img.classList.remove('active-img'));
    const content = cloneDiv.innerHTML;
    const title = (cloneDiv.textContent || cloneDiv.innerText || "").split('\n')[0].substring(0, 40) || "Untitled Note";
    document.title = title + ' - Notes';
    await db.notes.put({ id: currentNoteId, title: title, content: content, updated_at: Date.now(), deleted: 0 }); await db.sync_queue.put({ id: currentNoteId, action: 'upsert' });
    setTimeout(() => { syncStatus.style.backgroundColor = 'green'; }, 300);
}

let librarySearchQuery = '';
async function renderLibrary(query = '') {
    noteList.innerHTML = ''; 
    let notes = await db.notes.where('deleted').equals(0).reverse().sortBy('updated_at');
    
    if (query) {
        const q = query.toLowerCase();
        notes = notes.filter(n => (n.title && n.title.toLowerCase().includes(q)) || (n.content && n.content.toLowerCase().includes(q)) || (n.tags && n.tags.some(t => t.toLowerCase().includes(q))));
    }
    
    notes.forEach(note => {
        const li = document.createElement('li');
        li.dataset.id = note.id;
        li.onclick = () => loadNote(note.id);
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'note-title';
        titleSpan.textContent = note.title;
        
        const dateSpan = document.createElement('span');
        dateSpan.className = 'note-date';
        const d = new Date(note.updated_at);
        const options = { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' };
        dateSpan.textContent = d.toLocaleDateString(undefined, options);
        
        const infoDiv = document.createElement('div');
        infoDiv.style.display = 'flex'; infoDiv.style.flexDirection = 'column'; infoDiv.style.flexGrow = '1'; infoDiv.style.overflow = 'hidden';
        infoDiv.appendChild(titleSpan);
        if (note.tags && note.tags.length > 0) {
            const tagsDiv = document.createElement('div'); tagsDiv.className = 'library-tags';
            tagsDiv.innerHTML = note.tags.map(t => `<span class="tag-chip">#${t}</span>`).join('');
            infoDiv.appendChild(tagsDiv);
        }
        li.appendChild(infoDiv);
        li.appendChild(dateSpan);
        const copyLinkBtn = document.createElement('button');
        copyLinkBtn.className = 'btn-copy-link';
        copyLinkBtn.textContent = 'Copy Link';
        copyLinkBtn.onclick = (e) => { e.stopPropagation(); copyToClipboard(note.id); };
        li.appendChild(copyLinkBtn);
        noteList.appendChild(li);
    });
}
function handleExport(format) {
    if (!format) return; const contentHTML = editor.getContent(); const tempDiv = document.createElement('div'); tempDiv.innerHTML = contentHTML; const plainText = tempDiv.innerText || tempDiv.textContent || "";
    let title = (plainText.split('\n')[0].substring(0, 40) || "Note").replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const triggerDownload = (blob, ext) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${title}.${ext}`; a.click(); URL.revokeObjectURL(url); };
    if (format === 'txt') { triggerDownload(new Blob([plainText], { type: 'text/plain' }), 'txt'); } else if (format === 'md') { const turndownService = new TurndownService(); triggerDownload(new Blob([turndownService.turndown(contentHTML)], { type: 'text/markdown' }), 'md'); } else if (format === 'docx') { 
        const docxContent = `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', -apple-system, Arial, sans-serif; color: #000000; background-color: #ffffff; line-height: 1.6; }
                a { color: #0000EE; text-decoration: underline; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #cccccc; padding: 10px; text-align: left; vertical-align: top; }
                th { font-weight: bold; background-color: #f9f9f9; }
                img { max-width: 100%; height: auto; margin: 15px 0; }
                h1, h2, h3 { color: #1a1a1a; margin-top: 20px; margin-bottom: 10px; }
            </style>
        </head>
        <body>${contentHTML}</body>
        </html>`;
        const converted = htmlDocx.asBlob(docxContent); 
        triggerDownload(converted, 'docx'); 
    } else if (format === 'pdf') { 
        const pdfWrapper = document.createElement('div');
        pdfWrapper.innerHTML = `
            <div id="pdf-container" style="background-color: #ffffff; color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 0.5in;">
                <style>
                    #pdf-container * { color: #000000 !important; background-color: transparent !important; }
                    #pdf-container a { color: #0000EE !important; text-decoration: underline !important; border-bottom: none !important; }
                    #pdf-container table { width: 100%; border-collapse: collapse; margin: 2rem 0; font-size: 11pt; }
                    #pdf-container th, #pdf-container td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #cccccc !important; }
                    #pdf-container img { max-width: 100%; height: auto; outline: none !important; margin: 1rem 0; }
                </style>
                ${contentHTML}
            </div>
        `;
        
        html2pdf().set({ 
            margin: [0.5, 0.5, 0.5, 0.5], // Adjusted for better internal padding
            filename: `${title}.pdf`, 
            image: { type: 'jpeg', quality: 0.98 }, 
            html2canvas: { scale: 2, backgroundColor: '#ffffff' }, 
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } 
        }).from(pdfWrapper.firstElementChild).save(); 
    }
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
// Intercept Ctrl+S / Cmd+S to save the note locally instead of opening the browser dialog
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!editorView.classList.contains('hidden') && currentNoteId) {
            clearTimeout(saveTimeout);
            saveLocal();
        }
    }
});
// Server Backup Logic
const btnRunBackup = document.getElementById('btn-run-backup');
if (btnRunBackup) {
    btnRunBackup.addEventListener('click', async (e) => {
        e.preventDefault();
        const originalText = btnRunBackup.textContent;
        btnRunBackup.textContent = 'Backing up...';
        
        const path = document.getElementById('pref-backup-path').value;
        fetch('api/settings.php', { method: 'POST', body: JSON.stringify({ backupPath: path }) }).catch(()=>{});
        try {
            const response = await fetch('api/backup.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: path })
            });
            const result = await response.json();
            if (result.status === 'success') {
                btnRunBackup.textContent = 'Success! (' + result.file + ')';
            } else {
                btnRunBackup.textContent = 'Error: ' + (result.message || 'Failed');
            }
        } catch (err) {
            console.error('Backup Error:', err);
            btnRunBackup.textContent = 'Network Error';
        }
        setTimeout(() => { btnRunBackup.textContent = originalText; }, 4000);
    });
}
// Auto-Backup Timer
async function checkAutoBackup() {
    const lastBackup = parseInt(localStorage.getItem('lastAutoBackup') || '0', 10);
    const now = Date.now();
    if (now - lastBackup > 24 * 60 * 60 * 1000) { // 24 hours
        try {
            const setRes = await fetch('api/settings.php');
            const settings = await setRes.json();
            if (!settings || !settings.backupPath) return;
            
            const response = await fetch('api/backup.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: settings.backupPath, auto: true }) });
            if (response.ok) localStorage.setItem('lastAutoBackup', now);
        } catch(e) {}
    }
}
setInterval(checkAutoBackup, 60 * 60 * 1000); // Check every hour
setTimeout(checkAutoBackup, 10000); // Initial check 10s after load

// Revisions Logic
const revModal = document.getElementById('revisions-modal');
const revSelect = document.getElementById('rev-select');
const revPreview = document.getElementById('rev-preview');
let currentRevisions = [];

if (ctxRevisions) {
    ctxRevisions.addEventListener('click', async () => {
        contextMenu.classList.add('hidden');
        if (!currentNoteId) return;
        
        revSelect.innerHTML = '<option>Loading...</option>';
        revPreview.innerHTML = '';
        revModal.style.display = 'flex';
        revModal.classList.remove('hidden');
        
        try {
            const response = await fetch(`api/revisions.php?id=${currentNoteId}`);
            currentRevisions = await response.json();
            
            revSelect.innerHTML = '';
            if (currentRevisions.length === 0) {
                revSelect.innerHTML = '<option>No previous revisions found.</option>';
            } else {
                currentRevisions.forEach((rev, idx) => {
                    const opt = document.createElement('option');
                    opt.value = idx;
                    const d = new Date(parseInt(rev.created_at));
                    opt.textContent = d.toLocaleString();
                    revSelect.appendChild(opt);
                });
                revPreview.innerHTML = currentRevisions[0].content;
            }
        } catch (e) {
            revSelect.innerHTML = '<option>Error loading revisions.</option>';
        }
    });
}

revSelect.addEventListener('change', (e) => {
    if (currentRevisions[e.target.value]) {
        revPreview.innerHTML = currentRevisions[e.target.value].content;
    }
});

document.getElementById('btn-close-revs').addEventListener('click', () => {
    revModal.classList.add('hidden'); revModal.style.display = 'none';
});

document.getElementById('btn-restore-rev').addEventListener('click', () => {
    const selectedIdx = revSelect.value;
    if (currentRevisions[selectedIdx]) {
        editor.setContent(currentRevisions[selectedIdx].content);
        saveLocal();
        revModal.classList.add('hidden'); revModal.style.display = 'none';
    }
});
// --- Keyboard Menu Navigation ---
let menuFocusedIndex = -1;

function getVisibleMenuItems() {
    return Array.from(contextMenu.querySelectorAll('li')).filter(li => 
        !li.classList.contains('separator') && 
        li.offsetParent !== null && 
        li.style.display !== 'none'
    );
}

function updateMenuFocus() {
    const items = getVisibleMenuItems();
    contextMenu.querySelectorAll('.menu-focus').forEach(el => el.classList.remove('menu-focus'));
    contextMenu.querySelectorAll('.force-show').forEach(el => el.classList.remove('force-show'));
    
    if (items[menuFocusedIndex]) {
        const focusedItem = items[menuFocusedIndex];
        focusedItem.classList.add('menu-focus');
        
        // Auto-expand submenus if focused
        if (focusedItem.classList.contains('has-submenu')) {
            focusedItem.querySelector('.submenu').classList.add('force-show');
        }
        
        // Keep submenu open if browsing inside it
        const parentSub = focusedItem.closest('.submenu');
        if (parentSub) parentSub.classList.add('force-show');
    }
}

document.addEventListener('keydown', (e) => {


    // Navigate
    if (!contextMenu.classList.contains('hidden')) {
        const items = getVisibleMenuItems();
        
        if (e.key === 'Escape') {
            e.preventDefault();
            contextMenu.classList.add('hidden');
            contextMenu.querySelectorAll('.force-show').forEach(el => el.classList.remove('force-show'));
            if (!editorView.classList.contains('hidden')) editorDOM.focus();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            menuFocusedIndex = (menuFocusedIndex + 1) % items.length;
            updateMenuFocus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            menuFocusedIndex = (menuFocusedIndex - 1 + items.length) % items.length;
            updateMenuFocus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (items[menuFocusedIndex] && !items[menuFocusedIndex].classList.contains('has-submenu')) {
                items[menuFocusedIndex].click();
                contextMenu.classList.add('hidden');
                contextMenu.querySelectorAll('.force-show').forEach(el => el.classList.remove('force-show'));
            }
        }
    }
});

// Clear hover lock when closing via click
document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) {
        contextMenu.querySelectorAll('.force-show').forEach(el => el.classList.remove('force-show'));
        menuFocusedIndex = -1;
    }
});
// --------------------------------


// --- Library Keyboard Navigation & Invisible Filter ---
let libraryFocusedIndex = 0;

function updateLibraryFocus() {
    const items = document.querySelectorAll('#note-list li');
    items.forEach(el => el.classList.remove('library-focus'));
    
    if (items.length > 0) {
        if (libraryFocusedIndex < 0) libraryFocusedIndex = 0;
        if (libraryFocusedIndex >= items.length) libraryFocusedIndex = items.length - 1;
        const focusedItem = items[libraryFocusedIndex];
        if (focusedItem) {
            focusedItem.classList.add('library-focus');
            focusedItem.scrollIntoView({ block: 'nearest' });
        }
    }
}

// Auto-focus the top item when the list repopulates
if (typeof noteList !== 'undefined') {
    new MutationObserver(() => updateLibraryFocus()).observe(noteList, { childList: true });
}

// Sync mouse hover natively with the keyboard index
document.addEventListener('mouseover', (e) => {
    if (typeof libraryView !== 'undefined' && !libraryView.classList.contains('hidden')) {
        const li = e.target.closest('#note-list li');
        if (li) {
            const items = Array.from(document.querySelectorAll('#note-list li'));
            libraryFocusedIndex = items.indexOf(li);
            items.forEach(el => el.classList.remove('library-focus'));
            li.classList.add('library-focus');
        }
    }
});

// The Master Event Listener
document.addEventListener('keydown', (e) => {
    // Abort if modifier keys are held (prevents blocking standard browser shortcuts)
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    
    // Abort if we are not actively looking at the library
    if (typeof libraryView === 'undefined' || libraryView.classList.contains('hidden')) return;
    
    // Abort if any modals or menus are blocking the screen (Safe DOM checks)
    if (typeof contextMenu !== 'undefined' && !contextMenu.classList.contains('hidden')) return;
    if (typeof prefsModal !== 'undefined' && !prefsModal.classList.contains('hidden')) return;
    const revs = document.getElementById('revisions-modal');
    if (revs && !revs.classList.contains('hidden')) return;

    const items = document.querySelectorAll('#note-list li');

    // Navigation (Arrows)
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        libraryFocusedIndex++;
        updateLibraryFocus();
        return;
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        libraryFocusedIndex--;
        updateLibraryFocus();
        return;
    } 
    // Enter to open active note
    else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[libraryFocusedIndex]) items[libraryFocusedIndex].click();
        return;
    }

    // Invisible Filtering
    if (typeof librarySearchQuery === 'undefined') window.librarySearchQuery = '';
    
    if (e.key === 'Backspace') {
        librarySearchQuery = librarySearchQuery.slice(0, -1);
        libraryFocusedIndex = 0; // Snap focus back to top
        if (typeof renderLibrary === 'function') renderLibrary(librarySearchQuery);
    } else if (e.key === 'Escape') {
        librarySearchQuery = '';
        libraryFocusedIndex = 0;
        if (typeof renderLibrary === 'function') renderLibrary();
    } else if (e.key.length === 1) { 
        if (e.key === ' ') e.preventDefault(); // Stop spacebar from scrolling the page
        librarySearchQuery += e.key;
        libraryFocusedIndex = 0; // Snap focus back to top
        if (typeof renderLibrary === 'function') renderLibrary(librarySearchQuery);
    }
});


// --- URL Routing (Deep Linking) ---
// Handle initial load via URL parameter
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        const n = params.get('n');
        if (n && typeof loadNote === 'function') {
            loadNote(n);
        }
    }, 150); // Slight delay ensures it correctly overrides the localStorage auto-load
});

// Handle Back/Forward browser buttons
window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    const n = params.get('n');
    if (n && typeof loadNote === 'function') {
        loadNote(n);
    } else if (typeof showLibrary === 'function') {
        showLibrary();
    }
});


// --- Copy Link & Toast Logic ---
function copyToClipboard(id) {
    const url = window.location.origin + window.location.pathname + '?n=' + id;
    navigator.clipboard.writeText(url).then(() => {
        const toast = document.getElementById('toast-notification');
        if (toast) {
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);
        }
    });
}

const ctxCopyLink = document.getElementById('ctx-copy-link');
if (ctxCopyLink) {
    ctxCopyLink.addEventListener('click', () => {
        contextMenu.classList.add('hidden');
        
        let idToCopy = currentNoteId; // Default to open note in editor
        
        // If no note is open, copy the focused note in the library
        if (!idToCopy && typeof libraryView !== 'undefined' && !libraryView.classList.contains('hidden')) {
            const items = document.querySelectorAll('#note-list li');
            if (items[libraryFocusedIndex]) {
                idToCopy = items[libraryFocusedIndex].dataset.id;
            }
        }
        
        if (idToCopy) copyToClipboard(idToCopy);
    });
}


// --- Mobile Menu Button Logic ---
const mobileBtn = document.getElementById('mobile-menu-btn');
if (mobileBtn) {
    mobileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        
        // Dispatch a fake right-click to trigger your existing menu logic safely
        const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
        (document.activeElement || document.body).dispatchEvent(ev);
        
        if (typeof menuFocusedIndex !== 'undefined') {
            menuFocusedIndex = 0;
            if (typeof updateMenuFocus === 'function') setTimeout(updateMenuFocus, 10);
        }
    });
}


// --- iOS Virtual Keyboard UX Improvements ---
// 1. Dismiss keyboard when tapping the empty background space around the editor
if (typeof editorView !== 'undefined') {
    editorView.addEventListener('click', (e) => {
        // Only trigger if clicking the background div itself, not the editor text
        if (e.target === editorView) {
            if (document.activeElement) {
                document.activeElement.blur();
            }
            window.getSelection().removeAllRanges();
        }
    });
}

// 2. Dismiss keyboard on swipe down (touchmove)
let touchStartY = 0;
document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    // Only execute if the editor is currently actively being typed in
    if (!document.activeElement || document.activeElement.id !== 'editor') return;
    
    const touchEndY = e.touches[0].clientY;
    
    // If the user swipes down more than 40px, dismiss the keyboard
    if (touchEndY - touchStartY > 40) {
        document.activeElement.blur();
        window.getSelection().removeAllRanges();
    }
}, { passive: true });


// --- Tagging Logic ---
let editingNoteIdForTags = null;
let currentNoteTags = [];
let allExistingTags = [];

if (ctxTags) {
    ctxTags.addEventListener('click', async () => {
        contextMenu.classList.add('hidden');
        const targetId = contextTargetNoteId || currentNoteId;
        if (!targetId) return;
        editingNoteIdForTags = targetId;
        
        const note = await db.notes.get(targetId);
        currentNoteTags = note.tags ? [...note.tags] : [];
        
        // Harvest all unique tags across the database for autocomplete
        const allNotes = await db.notes.where('deleted').equals(0).toArray();
        const tagSet = new Set();
        allNotes.forEach(n => (n.tags || []).forEach(t => tagSet.add(t)));
        allExistingTags = Array.from(tagSet);
        
        renderTagChips();
        document.getElementById('tag-input').value = '';
        document.getElementById('tag-suggestions').classList.add('hidden');
        
        const modal = document.getElementById('tags-modal');
        modal.classList.remove('hidden');
        setTimeout(() => document.getElementById('tag-input').focus(), 50);
    });
}

const tagInput = document.getElementById('tag-input');
const tagSuggestions = document.getElementById('tag-suggestions');

if (tagInput) {
    tagInput.addEventListener('input', () => {
        const val = tagInput.value.trim().toLowerCase();
        if (!val) {
            tagSuggestions.classList.add('hidden');
            return;
        }
        const matches = allExistingTags.filter(t => t.toLowerCase().includes(val) && !currentNoteTags.includes(t));
        if (matches.length > 0) {
            tagSuggestions.innerHTML = matches.map(m => `<li>${m}</li>`).join('');
            tagSuggestions.classList.remove('hidden');
        } else {
            tagSuggestions.classList.add('hidden');
        }
    });

    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = tagInput.value.trim();
            if (val) addTag(val);
        }
    });
}

if (tagSuggestions) {
    tagSuggestions.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') addTag(e.target.textContent);
    });
}

function addTag(tag) {
    if (!currentNoteTags.includes(tag)) {
        currentNoteTags.push(tag);
        renderTagChips();
    }
    tagInput.value = '';
    tagSuggestions.classList.add('hidden');
    tagInput.focus();
}

function renderTagChips() {
    const container = document.getElementById('current-tags');
    if (!container) return;
    container.innerHTML = currentNoteTags.map(t => `<span class="tag-chip">${t} <span class="remove-tag" data-tag="${t.replace(/"/g, '&quot;')}">×</span></span>`).join('');
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-tag')) {
        const tagToRemove = e.target.getAttribute('data-tag');
        currentNoteTags = currentNoteTags.filter(t => t !== tagToRemove);
        renderTagChips();
    }
});

const btnCloseTags = document.getElementById('btn-close-tags');
if (btnCloseTags) {
    btnCloseTags.addEventListener('click', () => {
        document.getElementById('tags-modal').classList.add('hidden');
    });
}

const btnSaveTags = document.getElementById('btn-save-tags');
if (btnSaveTags) {
    btnSaveTags.addEventListener('click', async () => {
        if (!editingNoteIdForTags) return;
        const note = await db.notes.get(editingNoteIdForTags);
        if (note) {
            note.tags = currentNoteTags;
            note.updated_at = Date.now();
            await db.notes.put(note);
            await db.sync_queue.put({ id: editingNoteIdForTags, action: 'upsert' });
            if (!libraryView.classList.contains('hidden')) renderLibrary(typeof librarySearchQuery !== 'undefined' ? librarySearchQuery : '');
        }
        document.getElementById('tags-modal').classList.add('hidden');
    });
}

// Universal Escape Key Handler for the new modal
document.addEventListener('keydown', (e) => {
    const tagsModal = document.getElementById('tags-modal');
    if (e.key === 'Escape' && tagsModal && !tagsModal.classList.contains('hidden')) {
        tagsModal.classList.add('hidden');
        if (!editorView.classList.contains('hidden')) document.getElementById('editor').focus();
    }
});