// --- Bubble toolbar ---
// A small formatting bar that appears above selected text in the editor and disappears
// when there is no selection: the only formatting UI, shown only when it's relevant.
// Loaded after app.js; uses its `editor` (Squire) and `editorElement`.
(function () {
    const BUTTONS = [
        { id: 'bold', label: 'B', title: 'Bold (Ctrl+B)', style: 'font-weight:700' },
        { id: 'italic', label: 'I', title: 'Italic (Ctrl+I)', style: 'font-style:italic;font-family:Georgia,serif' },
        { id: 'underline', label: 'U', title: 'Underline (Ctrl+U)', style: 'text-decoration:underline' },
        { id: 'link', label: '🔗', title: 'Link' },
        { sep: true },
        { id: 'h2', label: 'H2', title: 'Heading' },
        { id: 'h3', label: 'H3', title: 'Subheading' },
        { id: 'quote', label: '❝', title: 'Quote' },
        { id: 'code', label: '&lt;/&gt;', title: 'Code', style: 'font-family:Consolas,Monaco,monospace;font-size:12px' },
    ];

    const bar = document.createElement('div');
    bar.id = 'bubble-toolbar';
    bar.className = 'hidden';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Formatting');
    bar.innerHTML = `
        <div class="bt-buttons">${BUTTONS.map(b => b.sep
            ? '<span class="bt-sep"></span>'
            : `<button type="button" data-cmd="${b.id}" title="${b.title}" aria-label="${b.title}"${b.style ? ` style="${b.style}"` : ''}>${b.label}</button>`).join('')}
        </div>
        <form class="bt-link hidden">
            <input type="text" class="bt-link-input" placeholder="Paste or type a link" aria-label="Link address" autocomplete="off" spellcheck="false">
            <label class="bt-newtab" title="Open in new tab"><input type="checkbox" class="bt-link-newtab"> ↗</label>
            <button type="submit" title="Apply link" aria-label="Apply link">✓</button>
        </form>`;
    document.body.appendChild(bar);

    const buttonsRow = bar.querySelector('.bt-buttons');
    const linkForm = bar.querySelector('.bt-link');
    const linkInput = bar.querySelector('.bt-link-input');
    const linkNewTab = bar.querySelector('.bt-link-newtab');
    let linkRange = null;     // selection to link, kept while the link field has focus
    let pointerDown = false;  // wait for the end of a mouse-drag selection before showing

    // --- Selection helpers ---
    function currentRange() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        return editorElement.contains(range.commonAncestorContainer) ? range : null;
    }
    function nearestInEditor(selector) {
        const range = currentRange();
        if (!range) return null;
        let node = range.startContainer;
        if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
        const found = node && node.closest(selector);
        return found && editorElement.contains(found) ? found : null;
    }
    const inLink = () => editor.hasFormat('A');

    // --- Block formats ---
    const TEXT_BLOCKS = 'p,div,h1,h2,h3,h4,h5,h6';
    function toggleHeading(tag) {
        const makePlain = !!nearestInEditor(tag);
        editor.modifyBlocks((frag) => {
            frag.querySelectorAll(TEXT_BLOCKS).forEach((block) => {
                if (block.querySelector(TEXT_BLOCKS)) return; // a wrapper, not a text block
                const replacement = document.createElement(makePlain ? 'P' : tag.toUpperCase());
                while (block.firstChild) replacement.appendChild(block.firstChild);
                block.replaceWith(replacement);
            });
            return frag;
        });
    }

    // --- Links ---
    function normalizeUrl(raw) {
        const url = raw.trim();
        if (!url) return null;
        if (/^(javascript|data|vbscript):/i.test(url)) return null;
        if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('#')) return url;
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return 'mailto:' + url;
        return 'https://' + url;
    }
    function openLinkForm() {
        linkRange = editor.getSelection();
        buttonsRow.classList.add('hidden');
        linkForm.classList.remove('hidden');
        linkInput.value = '';
        linkNewTab.checked = false;
        position();
        linkInput.focus();
    }
    function closeLinkForm(restoreSelection) {
        linkForm.classList.add('hidden');
        buttonsRow.classList.remove('hidden');
        if (restoreSelection && linkRange) { editor.focus(); editor.setSelection(linkRange); }
        linkRange = null;
    }
    linkForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = normalizeUrl(linkInput.value);
        if (!url) { linkInput.focus(); linkInput.select(); return; }
        const range = linkRange;
        closeLinkForm(false);
        editor.focus();
        if (range) editor.setSelection(range);
        editor.makeLink(url, linkNewTab.checked ? { target: '_blank', rel: 'noopener noreferrer' } : {});
        update();
    });
    linkInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLinkForm(true); update(); }
    });

    // --- Commands ---
    const COMMANDS = {
        bold: () => editor.hasFormat('B') ? editor.removeBold() : editor.bold(),
        italic: () => editor.hasFormat('I') ? editor.removeItalic() : editor.italic(),
        underline: () => editor.hasFormat('U') ? editor.removeUnderline() : editor.underline(),
        link: () => inLink() ? editor.removeLink() : openLinkForm(),
        h2: () => toggleHeading('h2'),
        h3: () => toggleHeading('h3'),
        quote: () => nearestInEditor('blockquote') ? editor.decreaseQuoteLevel() : editor.increaseQuoteLevel(),
        code: () => editor.toggleCode(),
    };
    const ACTIVE = {
        bold: () => editor.hasFormat('B'),
        italic: () => editor.hasFormat('I'),
        underline: () => editor.hasFormat('U'),
        link: inLink,
        h2: () => !!nearestInEditor('h2'),
        h3: () => !!nearestInEditor('h3'),
        quote: () => !!nearestInEditor('blockquote'),
        code: () => !!nearestInEditor('pre, code'),
    };

    // Keep the text selection when clicking buttons (but let the link field take focus).
    bar.addEventListener('mousedown', (e) => { if (!e.target.closest('.bt-link-input, .bt-newtab')) e.preventDefault(); });
    buttonsRow.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-cmd]');
        if (!btn) return;
        COMMANDS[btn.dataset.cmd]();
        if (!linkForm.classList.contains('hidden')) return; // the link field just opened
        update();
    });

    // --- Show / hide / position ---
    function hide() { bar.classList.add('hidden'); closeLinkForm(false); }
    function position() {
        const range = linkRange || currentRange();
        if (!range) return;
        const rects = range.getClientRects();
        const rect = rects.length ? rects[0] : range.getBoundingClientRect();
        const barW = bar.offsetWidth, barH = bar.offsetHeight, gap = 8;
        let top = rect.top - barH - gap;
        if (top < 8) top = (rects.length ? rects[rects.length - 1] : rect).bottom + gap; // no room above: go below
        let left = rect.left + rect.width / 2 - barW / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - barW - 8));
        bar.style.top = `${top + window.scrollY}px`;
        bar.style.left = `${left + window.scrollX}px`;
    }
    function update() {
        if (!linkForm.classList.contains('hidden')) return; // editing a link: leave it alone
        const range = currentRange();
        const visibleEditor = !document.getElementById('editor-view').classList.contains('hidden');
        const hasText = range && !range.collapsed && window.getSelection().toString().trim() !== '';
        if (!visibleEditor || !hasText) { bar.classList.add('hidden'); return; }
        buttonsRow.querySelectorAll('button[data-cmd]').forEach((btn) => {
            btn.classList.toggle('active', ACTIVE[btn.dataset.cmd]());
        });
        bar.classList.remove('hidden');
        position();
    }

    let timer = null;
    const scheduleUpdate = () => { clearTimeout(timer); timer = setTimeout(() => { if (!pointerDown) update(); }, 80); };
    document.addEventListener('selectionchange', () => {
        if (document.activeElement === linkInput) return;
        // Hide at once when the selection collapses; only showing is debounced.
        const sel = window.getSelection();
        if (!sel.rangeCount || sel.isCollapsed) { clearTimeout(timer); if (linkForm.classList.contains('hidden')) bar.classList.add('hidden'); return; }
        scheduleUpdate();
    });
    editorElement.addEventListener('pointerdown', () => { pointerDown = true; if (linkForm.classList.contains('hidden')) bar.classList.add('hidden'); });
    document.addEventListener('pointerup', () => { if (pointerDown) { pointerDown = false; scheduleUpdate(); } });
    editor.addEventListener('pathChange', scheduleUpdate);
    window.addEventListener('resize', () => { if (!bar.classList.contains('hidden')) position(); });
    window.addEventListener('scroll', () => { if (!bar.classList.contains('hidden')) position(); }, { passive: true });
    document.addEventListener('contextmenu', hide);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !bar.classList.contains('hidden') && linkForm.classList.contains('hidden')) hide();
    });
    // Clicking elsewhere while editing a link cancels it.
    document.addEventListener('pointerdown', (e) => {
        if (!linkForm.classList.contains('hidden') && !bar.contains(e.target)) hide();
    });
})();
