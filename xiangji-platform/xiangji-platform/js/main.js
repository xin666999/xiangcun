/* ==========================================================================
   main.js - top navigation / module switching
   ========================================================================== */
(function () {
  'use strict';

  var DEFAULT_MODULE = 'dashboard';

  /**
   * Show one module and mark its navigation button as active.
   * @param {string} targetId - id of the section to display
   */
  function switchModule(targetId) {
    var buttons = document.querySelectorAll('.nav-btn');
    var modules = document.querySelectorAll('.module');
    var found = false;

    Array.prototype.forEach.call(modules, function (section) {
      var isTarget = section.id === targetId;
      section.classList.toggle('active', isTarget);
      if (isTarget) { found = true; }
    });

    if (!found) { return; }

    Array.prototype.forEach.call(buttons, function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
    });

    // Charts rendered while hidden have a zero size, so re-measure on reveal.
    if (targetId === 'dashboard' && window.dashboard && typeof window.dashboard.resizeAll === 'function') {
      window.dashboard.resizeAll();
    }
  }

  /** Bind click handlers on the navigation buttons. */
  function initNav() {
    var buttons = document.querySelectorAll('.nav-btn');

    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () {
        switchModule(btn.getAttribute('data-target'));
      });
    });

    // Guarantee the default module is the visible one on load.
    switchModule(DEFAULT_MODULE);
  }

  /** Entry point. */
  function init() {
    initNav();

    if (window.dashboard && typeof window.dashboard.init === 'function') {
      window.dashboard.init();
    } else {
      console.warn('[main] dashboard module is not available.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging / other modules.
  window.app = { switchModule: switchModule };
})();
