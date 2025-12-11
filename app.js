/************************************************************
 * FLASHCARDS APP — REFACTORED (Parts 1-6)
 * - Minimal AppState model
 * - Safe persistence (uses window.saveState/loadState if present)
 * - Debounced search (300ms)
 * - Single delegated event layer + cleanup
 * - Accessible dialogs + focus management
 ************************************************************/

/* -------------------------
   Constants & Utilities
   ------------------------- */
const STORAGE_KEY_FALLBACK = 'flashcards:app:v1';
const now = () => Date.now();
const genId = (prefix = 'id') => `${prefix}-${now().toString(36)}-${Math.floor(Math.random()*10000).toString(36)}`;

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

/* -------------------------
   App State (Minimal Data Model)
   ------------------------- */
const AppState = {
  decks: [],                 // Array<{id,name,createdAt}>
  cardsByDeckId: {},        // Record<deckId, Array<{id,front,back,updatedAt}>>
  activeDeckId: null,
  ui: {
    isModalOpen: false,
    activeCardIndex: 0
  }
};

/* -------------------------
   Persistence (versioned, safe)
   ------------------------- */
function loadAppState() {
  if (typeof window.loadState === 'function') {
    const persisted = loadState(); // expected { decks, activeDeckId, cardsByDeckId? }
    if (persisted && typeof persisted === 'object') {
      // basic validation
      AppState.decks = Array.isArray(persisted.decks) ? persisted.decks : [];
      AppState.activeDeckId = persisted.activeDeckId || (AppState.decks[0] && AppState.decks[0].id) || null;
      AppState.cardsByDeckId = persisted.cardsByDeckId || {};
      return;
    }
  }
  // fallback localStorage
  const raw = localStorage.getItem(STORAGE_KEY_FALLBACK);
  const parsed = safeParse(raw);
  if (parsed && typeof parsed === 'object') {
    AppState.decks = Array.isArray(parsed.decks) ? parsed.decks : [];
    AppState.activeDeckId = parsed.activeDeckId || (AppState.decks[0] && AppState.decks[0].id) || null;
    AppState.cardsByDeckId = parsed.cardsByDeckId || {};
    return;
  }

  // seed default sample deck when no state found
  const sampleId = 'deck-default';
  AppState.decks = [{ id: sampleId, name: 'Sample Deck', createdAt: now() }];
  AppState.cardsByDeckId = {};
  AppState.cardsByDeckId[sampleId] = [
    { id: genId('card'), front: 'Welcome', back: 'Use "New Card" to add flashcards.', updatedAt: now() },
    { id: genId('card'), front: 'Flip me', back: 'You can edit or delete cards.', updatedAt: now() }
  ];
  AppState.activeDeckId = sampleId;
  persistAppState();
}

function persistAppState() {
  const payload = {
    decks: AppState.decks,
    activeDeckId: AppState.activeDeckId,
    cardsByDeckId: AppState.cardsByDeckId
  };

  if (typeof window.saveState === 'function') {
    try { saveState(payload); return true; } catch { /* fallthrough */ }
  }
  try {
    localStorage.setItem(STORAGE_KEY_FALLBACK, JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn('persistAppState failed', e);
    return false;
  }
}

/* -------------------------
   DOM helpers & elements
   ------------------------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const deckListEl = $('.decks');
const deckTitleEl = $('#deck-title');
const decksEmptyEl = $('#decks-empty');

const cardListEl = $('#card-list');
const studyCardEl = $('#study-card');
const frontEl = $('#card-front');
const backEl = $('#card-back');

const deckModal = $('#deckModal');
const deckForm = $('#deckForm');
const deckNameInput = $('#deckNameInput');
const cancelDeckBtn = $('#cancelDeckBtn');

const cardModal = $('#card-modal');
const cardForm = $('#card-form');

const searchInput = $('#search');
const searchCountEl = $('#searchCount');

/* -------------------------
   Derived helpers
   ------------------------- */
function getActiveDeck() {
  return AppState.decks.find(d => d.id === AppState.activeDeckId) || null;
}
function getCards(deckId = AppState.activeDeckId) {
  return AppState.cardsByDeckId[deckId] || [];
}
function setCards(deckId, cards) {
  AppState.cardsByDeckId[deckId] = cards;
  persistAppState();
}

/* -------------------------
   Rendering
   ------------------------- */
function renderDeckList() {
  if (!deckListEl) return;
  deckListEl.innerHTML = '';
  if (!AppState.decks.length) {
    if (decksEmptyEl) decksEmptyEl.hidden = false;
    return;
  } else if (decksEmptyEl) decksEmptyEl.hidden = true;

  AppState.decks.forEach(deck => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = deck.name;
    btn.dataset.deck = deck.id;
    if (deck.id === AppState.activeDeckId) btn.setAttribute('aria-current', 'true');
    li.appendChild(btn);
    deckListEl.appendChild(li);
  });
}

function renderCardList() {
  if (!cardListEl) return;
  const cards = getCards();
  cardListEl.innerHTML = '';
  if (!cards.length) {
    // accessible empty state for no cards
    const li = document.createElement('li');
    li.className = 'empty';
    li.setAttribute('role', 'status');
    li.innerHTML = '<strong>No cards found</strong><div class="muted">Create a card to begin studying.</div>';
    cardListEl.appendChild(li);
    updateSearchCount(0);
    return;
  }

  cards.forEach((c, i) => {
    const li = document.createElement('li');
    if (i === AppState.ui.activeCardIndex) li.classList.add('selected');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = c.front.length > 30 ? c.front.slice(0,30) + '…' : c.front;
    btn.dataset.index = i;
    btn.setAttribute('aria-label', `Open card ${i + 1}`);
    li.appendChild(btn);

    const actions = document.createElement('div');
    actions.className = 'small-actions';
    actions.innerHTML = `
      <button type="button" data-action="edit" data-index="${i}" aria-label="Edit card ${i+1}">✎</button>
      <button type="button" data-action="delete" data-index="${i}" aria-label="Delete card ${i+1}">🗑</button>
    `;
    li.appendChild(actions);
    cardListEl.appendChild(li);
  });

  performSearch((searchInput && searchInput.value) || '');
}

/* update main card display */
function showCurrentCard() {
  const cards = getCards();
  if (!cards.length) {
    frontEl.textContent = 'No cards';
    backEl.textContent = '';
    studyCardEl.classList.remove('is-flipped');
    return;
  }
  const idx = Math.max(0, Math.min(AppState.ui.activeCardIndex, cards.length -1));
  const c = cards[idx];
  frontEl.textContent = c.front;
  backEl.textContent = c.back;
  // highlight selection in list
  $$('#card-list li').forEach((li, i) => li.classList.toggle('selected', i === idx));
  studyCardEl.classList.remove('is-flipped');
}

/* -------------------------
   Modals & Focus Trap
   ------------------------- */
function openDialog(dialogEl, opener = null) {
  AppState.ui.isModalOpen = true;
  dialogEl.dataset.opener = opener ? (opener.id || '') : '';
  if (typeof dialogEl.showModal === 'function') dialogEl.showModal();
  else dialogEl.setAttribute('open', '');
  trapFocus(dialogEl);
}
function closeDialog(dialogEl) {
  AppState.ui.isModalOpen = false;
  if (typeof dialogEl.close === 'function') dialogEl.close();
  else dialogEl.removeAttribute('open');
  const openerId = dialogEl.dataset.opener;
  if (openerId) {
    const opener = document.getElementById(openerId);
    if (opener && typeof opener.focus === 'function') opener.focus();
  }
  dialogEl.removeAttribute('data-opener');
}

/* simple focus trap */
function trapFocus(dialog) {
  const focusable = Array.from(dialog.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.hasAttribute('disabled'));
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length -1];
  function onKey(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  dialog.addEventListener('keydown', onKey);
  // remove listener when dialog closes
  const observer = new MutationObserver(() => {
    if (!dialog.hasAttribute('open') && typeof dialog.showModal !== 'function') {
      dialog.removeEventListener('keydown', onKey);
      observer.disconnect();
    }
  });
  observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
}

/* -------------------------
   Study Session (enter/exit)
   ------------------------- */
let studySession = { active: false, order: [], pos: 0, keyHandler: null };

function enterStudyMode({ shuffle = false } = {}) {
  const cards = getCards();
  studySession.order = cards.map((_,i) => i);
  if (shuffle) {
    for (let i = studySession.order.length -1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [studySession.order[i], studySession.order[j]] = [studySession.order[j], studySession.order[i]];
    }
  }
  studySession.pos = 0;
  studySession.active = true;
  AppState.ui.activeCardIndex = studySession.order.length ? studySession.order[0] : 0;
  showCurrentCard();

  studySession.keyHandler = (ev) => {
    const tag = ev.target && ev.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || ev.target.isContentEditable) return;
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); studyPrev(); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); studyNext(); }
    else if (ev.key === ' ' || ev.key === 'Spacebar' || ev.key === 'Enter') { ev.preventDefault(); studyFlip(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); exitStudyMode(); }
  };
  document.addEventListener('keydown', studySession.keyHandler);
}

function exitStudyMode() {
  if (!studySession.active) return;
  studySession.active = false;
  if (studySession.keyHandler) {
    document.removeEventListener('keydown', studySession.keyHandler);
    studySession.keyHandler = null;
  }
  studySession.order = []; studySession.pos = 0;
}

/* navigation helpers used in UI */
function studyNext() {
  const cards = getCards();
  if (!cards.length) return;
  if (studySession.active && studySession.order.length) {
    studySession.pos = (studySession.pos + 1) % studySession.order.length;
    AppState.ui.activeCardIndex = studySession.order[studySession.pos];
  } else {
    AppState.ui.activeCardIndex = (AppState.ui.activeCardIndex + 1) % cards.length;
  }
  showCurrentCard();
}
function studyPrev() {
  const cards = getCards();
  if (!cards.length) return;
  if (studySession.active && studySession.order.length) {
    studySession.pos = (studySession.pos - 1 + studySession.order.length) % studySession.order.length;
    AppState.ui.activeCardIndex = studySession.order[studySession.pos];
  } else {
    AppState.ui.activeCardIndex = (AppState.ui.activeCardIndex - 1 + cards.length) % cards.length;
  }
  showCurrentCard();
}
function studyFlip(force) {
  studyCardEl.classList.toggle('is-flipped', typeof force === 'boolean' ? force : undefined);
}

/* -------------------------
   Card CRUD + Modal helpers
   ------------------------- */
function openCardModal(mode = 'create', index = -1, opener = null) {
  cardForm.index.value = index;
  if (mode === 'edit' && index >= 0) {
    const cards = getCards();
    const c = cards[index];
    if (c) { cardForm.front.value = c.front; cardForm.back.value = c.back; }
  } else {
    cardForm.front.value = ''; cardForm.back.value = '';
  }
  openDialog(cardModal, opener);
  setTimeout(() => cardForm.front.focus(), 50);
}
function closeCardModal() { closeDialog(cardModal); cardForm.reset(); }

/* -------------------------
   Search (debounced)
   ------------------------- */
function updateSearchCount(n) {
  if (searchCountEl) searchCountEl.textContent = `${n} match${n === 1 ? '' : 'es'}`;
}
function debounce(fn, wait = 300) {
  let t = null;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
}
function performSearch(q) {
  q = (q || '').trim().toLowerCase();
  const items = cardListEl.children;
  let matches = 0;
  Array.from(items).forEach((li, i) => {
    if (li.classList.contains('empty')) return; // preserve empty message
    const cards = getCards();
    const c = cards[i];
    const txt = ((c && (c.front + ' ' + (c.back || ''))) || '').toLowerCase();
    const visible = q === '' || txt.includes(q);
    li.style.display = visible ? '' : 'none';
    if (visible) matches++;
  });
  updateSearchCount(matches);
}
const debouncedSearch = debounce((e) => performSearch(e.target.value), 300);

/* -------------------------
   Delegated Event Layer (single attach)
   ------------------------- */
function onGlobalClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;

  // deck selection buttons (in sidebar)
  if (btn.dataset.deck) {
    AppState.activeDeckId = btn.dataset.deck;
    AppState.ui.activeCardIndex = 0;
    persistAppState();
    renderDeckList();
    renderCardList();
    showCurrentCard();
    return;
  }

  const action = btn.dataset.action;
  if (!action) return;

  switch (action) {
    // Deck actions
    case 'new-deck':
    case 'open-new-deck':
      openDialog(deckModal, btn);
      setTimeout(() => deckNameInput.focus(), 30);
      break;

    // Card actions
    case 'open-new-card':
      openCardModal('create', -1, btn);
      break;
    case 'edit':
      openCardModal('edit', Number(btn.dataset.index), btn);
      break;
    case 'delete':
      {
        const idx = Number(btn.dataset.index);
        const cards = getCards();
        if (Number.isNaN(idx) || !cards[idx]) return;
        if (!confirm('Delete this card?')) return;
        cards.splice(idx,1);
        setCards(AppState.activeDeckId, cards);
        // if session depends on indexes, exit
        exitStudyMode();
        AppState.ui.activeCardIndex = Math.max(0, Math.min(AppState.ui.activeCardIndex, cards.length -1));
        renderCardList();
        showCurrentCard();
      }
      break;

    // Study controls
    case 'flip':
      studyFlip();
      break;
    case 'next':
      studyNext();
      break;
    case 'prev':
      studyPrev();
      break;
    case 'shuffle':
      enterStudyMode({ shuffle: true });
      break;

    // modal controls
    case 'close-modal':
      closeCardModal();
      break;
  }
}

/* -------------------------
   Forms: deckForm & cardForm
   ------------------------- */
function onDeckFormSubmit(e) {
  e.preventDefault();
  const name = (deckNameInput.value || '').trim();
  if (!name) { deckNameInput.focus(); deckNameInput.setAttribute('aria-invalid','true'); return alert('Please enter a deck name.'); }
  if (deckModal.dataset.editing === 'true' && deckModal.dataset.editId) {
    const id = deckModal.dataset.editId;
    const deck = AppState.decks.find(d => d.id === id);
    if (deck) { deck.name = name; persistAppState(); renderDeckList(); renderCardList(); }
    delete deckModal.dataset.editId;
    deckModal.dataset.editing = 'false';
  } else {
    const id = genId('deck');
    AppState.decks.push({ id, name, createdAt: now() });
    AppState.cardsByDeckId[id] = [];
    AppState.activeDeckId = id;
    persistAppState();
    renderDeckList();
    renderCardList();
  }
  closeDialog(deckModal);
}

function onCardFormSubmit(e) {
  e.preventDefault();
  const idx = Number(cardForm.index.value);
  const front = (cardForm.front.value || '').trim();
  const back = (cardForm.back.value || '').trim();
  if (!front || !back) { return alert('Both front and back are required.'); }
  const cards = getCards();
  if (!AppState.activeDeckId) return alert('No active deck selected.');
  if (!Number.isNaN(idx) && idx >= 0 && cards[idx]) {
    cards[idx] = { ...cards[idx], front, back, updatedAt: now() };
  } else {
    cards.push({ id: genId('card'), front, back, updatedAt: now() });
  }
  setCards(AppState.activeDeckId, cards);
  // any structural change — exit session to avoid stale indexes
  exitStudyMode();
  AppState.ui.activeCardIndex = Math.max(0, Math.min(AppState.ui.activeCardIndex, cards.length -1));
  renderCardList();
  showCurrentCard();
  closeCardModal();
}

/* -------------------------
   Initialization
   ------------------------- */
function attachGlobalHandlers() {
  // ensure idempotent attach
  if (attachGlobalHandlers._attached) return;
  document.addEventListener('click', onGlobalClick);
  if (searchInput) searchInput.addEventListener('input', debouncedSearch);
  if (cardForm) cardForm.addEventListener('submit', onCardFormSubmit);
  if (deckForm) deckForm.addEventListener('submit', onDeckFormSubmit);
  if (deckModal) deckModal.addEventListener('cancel', (ev) => { ev.preventDefault(); closeDialog(deckModal); });
  // allow clicking backdrop for card modal
  if (cardModal) cardModal.addEventListener('click', (ev) => { if (ev.target === cardModal) closeCardModal(); });
  // study card click to flip
  if (studyCardEl) studyCardEl.addEventListener('click', () => studyFlip());
  // cleanup on unload
  window.addEventListener('beforeunload', () => exitStudyMode());
  attachGlobalHandlers._attached = true;
}

function boot() {
  loadAppState();
  renderDeckList();
  renderCardList();
  showCurrentCard();
  attachGlobalHandlers();
  // default: enter study mode for active deck (non-shuffled)
  enterStudyMode({ shuffle: false });
}

boot();
