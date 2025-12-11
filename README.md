# Flashcard App — Reflection

- Where AI saved time:
  - Scaffolding event delegation, modal focus-trap, and study-mode logic sped up iterative development.
- One AI bug found & fix:
  - Bug: earlier code added duplicate event listeners and relied on element queries that could be null. Fix: consolidated to a single delegated layer and added idempotent attachGlobalHandlers().
- Refactored snippet (clarity):
  - Replaced scattered card-next/prev logic with studyNext/studyPrev and a single studySession object to manage session order and keyboard handler.
  - Example:
    const studySession = { active:false, order:[], pos:0, keyHandler:null };
    function studyNext() { ... }
- Accessibility improvement added:
  - Modal dialogs get focus-trap, ESC-to-close, return focus to opener, and empty-state elements use role="status" and aria-live where appropriate.
- Prompt changes that improved AI output:
  - Explicit minimal data model + required features (persistence, debounced search, accessibility) produced a clearer, smaller API to implement.

Instructions:
- Run locally by opening index.html in the browser.
- Git: stage & commit the changed files (index.html, style.css, storage.js, app.js, README.md).
```// filepath: c:\Users\instructor\Desktop\flashcard-app\README.md
# Flashcard App — Reflection

- Where AI saved time:
  - Scaffolding event delegation, modal focus-trap, and study-mode logic sped up iterative development.
- One AI bug found & fix:
  - Bug: earlier code added duplicate event listeners and relied on element queries that could be null. Fix: consolidated to a single delegated layer and added idempotent attachGlobalHandlers().
- Refactored snippet (clarity):
  - Replaced scattered card-next/prev logic with studyNext/studyPrev and a single studySession object to manage session order and keyboard handler.
  - Example:
    const studySession = { active:false, order:[], pos:0, keyHandler:null };
    function studyNext() { ... }
- Accessibility improvement added:
  - Modal dialogs get focus-trap, ESC-to-close, return focus to opener, and empty-state elements use role="status" and aria-live where appropriate.
- Prompt changes that improved AI output:
  - Explicit minimal data model + required features (persistence, debounced search, accessibility) produced a clearer, smaller API to implement.

Instructions:
- Run locally by opening index.html in the browser.
- Git: stage & commit the changed files (index.html, style.css, storage.js, app.js, README.md).