<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
        <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="color-scheme" content="light dark">
    <title>Notes</title>
    <link rel="icon" type="image/svg+xml" href="icon.svg">
    <link rel="apple-touch-icon" href="icon.svg">
    <link rel="manifest" href="manifest.json">
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="vendor/medium-editor.min.css">
    <link rel="stylesheet" href="vendor/medium-editor-theme.min.css">
    <style>
        #revisions-modal {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.5); z-index: 20000; 
            align-items: center; justify-content: center;
        }
        #revisions-modal:not(.hidden) {
            display: flex;
        }
            #tags-modal:not(.hidden) { display: flex; }
    </style>
    <script>
        // Synchronous Fast-Path Preference Loader
        (function() {
            try {
                let raw = localStorage.getItem('appPreferences');
                if (raw) {
                    let p = JSON.parse(raw);
                    let root = document.documentElement;
                    if (p.font && p.font !== 'system') root.style.setProperty('--app-font', p.font);
                    if (p.size) root.style.setProperty('--app-font-size', p.size + 'px');
                    if (p.lightBg) root.style.setProperty('--light-bg', p.lightBg);
                    if (p.lightText) root.style.setProperty('--light-text', p.lightText);
                    if (p.darkBg) root.style.setProperty('--dark-bg', p.darkBg);
                    if (p.darkText) root.style.setProperty('--dark-text', p.darkText);
                }
            } catch(e) {}
        })();
    </script>
</head>
<body>
    <div id="library-view" class="view">
        <ul id="note-list"></ul>
    </div>

    <div id="editor-view" class="view hidden">
        <div id="editor" class="editable"></div>
    </div>

    <div id="sync-status" title="Sync Status"></div>
    
    <input type="file" id="file-image-upload" accept="image/*" class="hidden">

    <!-- Right-Click Menu -->
    <ul id="context-menu" class="hidden">
        <li id="ctx-copy-link">Copy Link</li>
        <li class="separator"></li>
        <li id="ctx-toggle-view">← Library</li>
        <li id="ctx-new-note">+ New Note</li>
        <li class="separator"></li>
        <li id="ctx-insert-image" class="ctx-editor-only">Insert Image</li>
        <li id="ctx-revisions" class="ctx-editor-only">Revision History</li>
        
        <li id="ctx-insert-table" class="ctx-editor-only">Insert Table</li>
        <li class="separator ctx-table-only"></li>
        <li id="ctx-add-row-above" class="ctx-table-only">Insert Row Above</li>
        <li id="ctx-add-row-below" class="ctx-table-only">Insert Row Below</li>
        <li id="ctx-add-col-left" class="ctx-table-only">Insert Col Left</li>
        <li id="ctx-add-col-right" class="ctx-table-only">Insert Col Right</li>
        <li class="separator ctx-table-only"></li>
        <li id="ctx-del-row" class="ctx-table-only" style="color: var(--delete-color);">Delete Row</li>
        <li id="ctx-del-col" class="ctx-table-only" style="color: var(--delete-color);">Delete Column</li>
        <li id="ctx-del-table" class="ctx-table-only" style="color: var(--delete-color);">Delete Table</li>

        <li class="separator ctx-editor-only"></li>
        <li class="ctx-editor-only has-submenu">
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; pointer-events:none;">
                <span>Export</span> <span style="font-size:0.8em; opacity:0.5;">▶</span>
            </div>
            <ul class="submenu">
                <li class="ctx-export" data-format="txt">Plain Text (.txt)</li>
                <li class="ctx-export" data-format="md">Markdown (.md)</li>
                <li class="ctx-export" data-format="docx">Word Document (.docx)</li>
                <li class="ctx-export" data-format="pdf">PDF Document (.pdf)</li>
            </ul>
        </li>
        <li class="separator"></li>
        <li id="ctx-preferences">Preferences</li>
        <li id="ctx-tags">Manage Tags</li>
        <li id="ctx-delete-note">Delete Note</li>
    </ul>

    <!-- Image Click Toolbar -->
    <div id="image-toolbar" class="hidden">
        <button id="img-align-left" title="Align Left">◧</button>
        <button id="img-align-center" title="Center">◫</button>
        <button id="img-align-right" title="Align Right">◨</button>
        <input type="range" id="img-resize-slider" min="10" max="100" title="Resize %" value="100">
    </div>

    <!-- Revisions Modal -->
    <div id="revisions-modal" class="hidden">
        <div class="modal-content" style="width: 600px; max-width: 90vw;">
            <h2>Revision History</h2>
            <div style="margin-bottom: 1rem;">
                <select id="rev-select" style="width: 100%; padding: 0.5rem; background: var(--bg-color); color: var(--text-color); border: 1px solid var(--ui-color); border-radius: 4px;"></select>
            </div>
            <div id="rev-preview" style="border: 1px solid var(--ui-color); padding: 1rem; height: 300px; overflow-y: auto; background: var(--bg-color); opacity: 0.7; font-size: 0.9em; pointer-events: none; border-radius: 4px;"></div>
            <div class="modal-actions">
                <button id="btn-restore-rev">Restore</button>
                <button id="btn-close-revs" class="btn-secondary">Cancel</button>
            </div>
        </div>
    </div>
    
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
            <div class="pref-group">
                <h3>Server Backup</h3>
                <label style="display:flex; flex-direction:column; align-items:flex-start;">Path (Relative or Absolute): 
                    <input type="text" id="pref-backup-path" placeholder="/var/www/backups/" style="width: 100%; box-sizing: border-box; margin-top: 0.5rem; padding: 4px;">
                </label>
                <button id="btn-run-backup" class="btn-secondary" style="margin-top: 0.75rem; width: 100%;">Run Server Backup Now</button>
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
    <div id="toast-notification">Copied to clipboard!</div>
    <div id="mobile-menu-btn">⋯</div>
        <!-- Tags Modal -->
    <div id="tags-modal" class="hidden" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 20000; align-items: center; justify-content: center;">
        <div class="modal-content" style="width: 400px; max-width: 90vw;">
            <h2>Manage Tags</h2>
            <div id="current-tags" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem;"></div>
            <div style="position: relative; margin-bottom: 1.5rem;">
                <input type="text" id="tag-input" placeholder="Type a tag and press Enter..." style="width: 100%; padding: 0.5rem; background: var(--bg-color); color: var(--text-color); border: 1px solid var(--ui-color); border-radius: 4px; box-sizing: border-box; outline: none;">
                <ul id="tag-suggestions" class="hidden" style="position: absolute; top: 100%; left: 0; width: 100%; background: var(--toolbar-bg); border: 1px solid var(--ui-color); border-top: none; list-style: none; padding: 0; margin: 0; max-height: 150px; overflow-y: auto; z-index: 20001; border-radius: 0 0 4px 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></ul>
            </div>
            <div class="modal-actions">
                <button id="btn-save-tags">Save Tags</button>
                <button id="btn-close-tags" class="btn-secondary">Cancel</button>
            </div>
        </div>
    </div>
</body>
</html>
