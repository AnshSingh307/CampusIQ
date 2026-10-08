(() => {
  'use strict';
  if (window.CAMPUSIQ_CONFIG?.publicDemoMode !== true) return;

  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastDialogTrigger = null;
  let sortQueued = false;

  function toast(message) {
    let region = $('premiumToastRegion');
    if (!region) {
      region = document.createElement('div');
      region.id = 'premiumToastRegion';
      region.className = 'premium-toast-region public-demo-enhancement';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    const item = document.createElement('div');
    item.className = 'premium-toast';
    item.textContent = message;
    region.appendChild(item);
    setTimeout(() => item.classList.add('leaving'), 2600);
    setTimeout(() => item.remove(), 2850);
  }

  function applyTheme(theme, announce = false) {
    const next = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('campusiq-demo-theme', next); } catch {}
    const button = $('themeToggle');
    const isLight = next === 'light';
    button?.setAttribute('aria-pressed', String(isLight));
    button?.setAttribute('aria-label', `Switch to ${isLight ? 'dark' : 'light'} theme`);
    button?.setAttribute('title', `Switch to ${isLight ? 'dark' : 'light'} theme`);
    if (announce) toast(`${isLight ? 'Light' : 'Dark'} theme applied on this browser.`);
  }

  function updateHero() {
    const role = root.dataset.demoRole || 'administrator';
    const content = {
      administrator: {
        title: 'Turn campus signals into timely human support.',
        copy: 'Explore a complete synthetic cohort through explainable scores, actionable segments, and responsible recommendations.',
        action: 'Review priority students',
        score: ($('metricAvg')?.textContent.match(/[\d.]+/) || ['74'])[0],
      },
      faculty: {
        title: 'Teach with context. Support with confidence.',
        copy: 'Focus on an assigned synthetic class, understand attendance and coursework signals, and preview responsible intervention workflows.',
        action: 'Open teaching workspace',
        score: $('facultyStudentCount')?.textContent || '8',
      },
      student: {
        title: 'One clear view of your learning journey.',
        copy: 'Follow a synthetic student’s academic momentum, attendance, coursework, feedback, skills, and placement readiness.',
        action: 'View my coursework',
        score: ($('demoStudentScore')?.textContent.match(/[\d.]+/) || ['—'])[0],
      },
    }[role];
    $('premiumHeroTitle').textContent = content.title;
    $('premiumHeroCopy').textContent = content.copy;
    $('heroPrimaryAction').textContent = content.action;
    $('heroScore').textContent = content.score;
    document.querySelector('.orbit-label').textContent = role === 'faculty' ? 'Assigned students' : role === 'student' ? 'Success score' : 'Campus pulse';
  }

  function navigateHero() {
    const role = root.dataset.demoRole || 'administrator';
    if (role === 'administrator') document.querySelector('[data-view="triage"]')?.click();
    if (role === 'faculty') document.querySelector('[data-demo-tab="faculty-teaching"]')?.click();
    if (role === 'student') document.querySelector('[data-demo-tab="student-coursework"]')?.click();
    toast(role === 'administrator' ? 'Showing priority synthetic students.' : 'Opened the selected demo workspace.');
  }

  function explainScore() {
    const role = root.dataset.demoRole || 'administrator';
    if (role === 'administrator') {
      $('assistantPanel').hidden = false;
      $('assistantToggle').setAttribute('aria-expanded', 'true');
      $('assistantInput').value = 'Explain the average success score';
      $('assistantForm').requestSubmit();
      $('assistantInput').focus();
    } else if (role === 'faculty') {
      document.querySelector('[data-demo-tab="faculty-support"]')?.click();
      toast('Showing rule-based support explanations for the assigned synthetic cohort.');
    } else {
      document.querySelector('[data-demo-tab="student-progress"]')?.click();
      document.querySelector('#demoStudentSuggestion')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      toast('Showing the synthetic student’s score context and suggested next step.');
    }
  }

  function filterFaculty(query) {
    const q = query.trim().toLowerCase();
    const rows = [...document.querySelectorAll('#facultyStudentTable tr')];
    let visible = 0;
    rows.forEach(row => {
      const match = !q || row.textContent.toLowerCase().includes(q);
      row.hidden = !match;
      if (match) visible += 1;
    });
    if (q) toast(`${visible} assigned synthetic student${visible === 1 ? '' : 's'} matched.`);
  }

  function runGlobalSearch(query) {
    const q = query.trim();
    root.dataset.demoSearch = q;
    const role = root.dataset.demoRole || 'administrator';
    if (role === 'administrator') {
      document.querySelector('[data-view="triage"]')?.click();
      $('searchInput').value = q;
      $('searchInput').dispatchEvent(new Event('input', { bubbles: true }));
      if (q) toast('Filtered the synthetic administrator cohort.');
    } else if (role === 'faculty') {
      document.querySelector('[data-demo-tab="faculty-overview"]')?.click();
      filterFaculty(q);
    } else {
      const coursework = /assignment|grade|submission|attendance|coursework/i.test(q);
      document.querySelector(`[data-demo-tab="student-${coursework ? 'coursework' : 'progress'}"]`)?.click();
      if (q) toast(coursework ? 'Opened matching student coursework.' : 'Opened the synthetic student progress view.');
    }
  }

  function applyStudentSort() {
    if (sortQueued) return;
    sortQueued = true;
    requestAnimationFrame(() => {
      sortQueued = false;
      const body = $('studentTableBody');
      const mode = $('studentSort')?.value || 'score-asc';
      root.dataset.demoSort = mode;
      if (!body) return;
      const rows = [...body.querySelectorAll('tr')];
      const value = (row, index) => row.children[index]?.textContent.trim() || '';
      rows.sort((a, b) => {
        if (mode === 'name-asc') return value(a, 0).localeCompare(value(b, 0));
        if (mode === 'score-desc') return Number.parseFloat(value(b, 2)) - Number.parseFloat(value(a, 2));
        if (mode === 'risk-priority') return ({ High: 0, Watch: 1, Low: 2 }[value(a, 3).split(/\s/)[0]] ?? 3) - ({ High: 0, Watch: 1, Low: 2 }[value(b, 3).split(/\s/)[0]] ?? 3);
        return Number.parseFloat(value(a, 2)) - Number.parseFloat(value(b, 2));
      });
      rows.forEach(row => body.appendChild(row));
    });
  }

  function animateNumber(element) {
    if (!element || reduceMotion || element.dataset.counterAnimated === 'true') return;
    const node = [...element.childNodes].find(child => child.nodeType === Node.TEXT_NODE && /\d/.test(child.textContent));
    if (!node) return;
    const target = Number.parseFloat(node.textContent.replace(/,/g, ''));
    if (!Number.isFinite(target)) return;
    element.dataset.counterAnimated = 'true';
    const decimals = node.textContent.includes('.') ? 1 : 0;
    const started = performance.now();
    const originalSuffix = node.textContent.includes('%') ? '%' : '';
    const step = now => {
      const progress = Math.min(1, (now - started) / 520);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = `${(target * eased).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${originalSuffix}`;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function makeMetricsInteractive() {
    document.querySelectorAll('.metric').forEach((metric, index) => {
      if (metric.dataset.premiumReady) return;
      metric.dataset.premiumReady = 'true';
      metric.tabIndex = 0;
      metric.setAttribute('role', 'button');
      metric.setAttribute('aria-label', `${metric.querySelector('.metric-head')?.textContent.trim() || 'Metric'} — open related details`);
      const open = () => {
        const role = root.dataset.demoRole || 'administrator';
        if (role === 'administrator') document.querySelector(`[data-view="${index % 4 === 1 ? 'trajectory' : index % 4 === 0 ? 'overview' : 'triage'}"]`)?.click();
        else if (role === 'faculty') document.querySelector(`[data-demo-tab="faculty-${index % 4 === 3 ? 'support' : index % 4 === 0 ? 'overview' : 'teaching'}"]`)?.click();
        else document.querySelector(`[data-demo-tab="student-${index % 4 < 2 ? 'progress' : 'coursework'}"]`)?.click();
      };
      metric.addEventListener('click', open);
      metric.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
      animateNumber(metric.querySelector('.metric-val'));
    });
  }

  function addCardExpanders() {
    document.querySelectorAll('.card').forEach(card => {
      if (!card.querySelector('.chart,.analytics-viz') || card.querySelector('.card-expander')) return;
      const head = card.querySelector('.card-head');
      if (!head) return;
      const button = document.createElement('button');
      button.className = 'card-expander';
      button.type = 'button';
      button.textContent = '↗';
      button.setAttribute('aria-label', `Expand ${card.querySelector('.card-title')?.textContent || 'chart'}`);
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', event => {
        event.stopPropagation();
        const expanded = card.classList.toggle('premium-expanded');
        button.textContent = expanded ? '×' : '↗';
        button.setAttribute('aria-expanded', String(expanded));
        document.body.style.overflow = expanded ? 'hidden' : '';
        if (expanded) button.focus();
      });
      head.appendChild(button);
    });
  }

  function trapDialogFocus(event) {
    if (event.key !== 'Tab') return;
    const dialog = document.querySelector('.modal-backdrop.open .modal,.settings.open .modal');
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function initDialogAccessibility() {
    document.querySelectorAll('.modal-backdrop,.settings').forEach(backdrop => {
      backdrop.setAttribute('aria-hidden', backdrop.classList.contains('open') ? 'false' : 'true');
      new MutationObserver(() => {
        const open = backdrop.classList.contains('open');
        backdrop.setAttribute('aria-hidden', String(!open));
        if (open) setTimeout(() => backdrop.querySelector('.modal-close,button,input')?.focus(), 0);
        else lastDialogTrigger?.focus();
      }).observe(backdrop, { attributes: true, attributeFilter: ['class'] });
    });
  }

  const params = new URLSearchParams(location.search);
  if (params.has('theme')) applyTheme(params.get('theme'));
  else applyTheme(root.dataset.theme || 'dark');

  $('themeToggle').addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
  $('sidebarToggle').addEventListener('click', () => {
    const collapsed = document.querySelector('.app').classList.toggle('sidebar-collapsed');
    $('sidebarToggle').setAttribute('aria-pressed', String(collapsed));
    $('sidebarToggle').setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    try { localStorage.setItem('campusiq-demo-sidebar', collapsed ? 'collapsed' : 'expanded'); } catch {}
  });
  try { if (localStorage.getItem('campusiq-demo-sidebar') === 'collapsed') $('sidebarToggle').click(); } catch {}

  $('heroPrimaryAction').addEventListener('click', navigateHero);
  $('heroExplainAction').addEventListener('click', explainScore);
  $('globalDemoSearch').addEventListener('keydown', event => { if (event.key === 'Enter') runGlobalSearch(event.currentTarget.value); });
  $('globalDemoSearch').addEventListener('search', event => runGlobalSearch(event.currentTarget.value));
  $('studentSort').addEventListener('change', () => { applyStudentSort(); toast('Synthetic student list sorted.'); });
  ['searchInput', 'riskFilter', 'segmentFilter', 'programFilter', 'termSelect'].forEach(id => $(id)?.addEventListener(id === 'searchInput' ? 'input' : 'change', () => setTimeout(applyStudentSort, 0)));

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('globalDemoSearch').focus(); }
    if (event.key === 'Escape') {
      const expanded = document.querySelector('.premium-expanded');
      if (expanded) { expanded.querySelector('.card-expander')?.click(); return; }
    }
    trapDialogFocus(event);
  });
  document.addEventListener('pointerdown', event => { if (event.target.closest('.profile-open,.rec-open,#settingsBtn')) lastDialogTrigger = event.target.closest('button'); });
  document.addEventListener('click', event => {
    if (event.target.closest('.demo-grade')) toast('Demo grade updated locally. No private API was called.');
    if (event.target.closest('.demo-submit')) toast('Demo submission updated locally. Refreshing resets it.');
  });
  $('demoRoleSelect').addEventListener('change', event => {
    document.body.classList.add('premium-role-loading');
    setTimeout(() => {
      updateHero();
      makeMetricsInteractive();
      addCardExpanders();
      document.body.classList.remove('premium-role-loading');
      toast(`${event.target.options[event.target.selectedIndex].text} demo loaded with synthetic data.`);
    }, reduceMotion ? 0 : 120);
  });

  document.querySelectorAll('.card').forEach(card => {
    const title = card.querySelector('.card-title')?.textContent?.trim();
    if (title) card.setAttribute('aria-label', title);
  });
  initDialogAccessibility();
  makeMetricsInteractive();
  addCardExpanders();
  updateHero();
  applyStudentSort();
  if (params.get('toggleTheme') === 'true') $('themeToggle').click();
  if (['administrator', 'faculty', 'student'].includes(params.get('switchRole')) && params.get('switchRole') !== root.dataset.demoRole) { $('demoRoleSelect').value = params.get('switchRole'); $('demoRoleSelect').dispatchEvent(new Event('change', { bubbles: true })); root.dataset.demoRoleSwitched = 'true'; }
  if (['High', 'Watch', 'Low'].includes(params.get('risk'))) { $('riskFilter').value = params.get('risk'); $('riskFilter').dispatchEvent(new Event('change', { bubbles: true })); }
  if (['score-asc', 'score-desc', 'name-asc', 'risk-priority'].includes(params.get('sort'))) { $('studentSort').value = params.get('sort'); applyStudentSort(); }
  if (params.get('q')) { $('globalDemoSearch').value = params.get('q'); setTimeout(() => runGlobalSearch(params.get('q')), 0); }
  if (params.get('expand') && document.getElementById(params.get('expand'))) { document.getElementById(params.get('expand')).closest('.card')?.querySelector('.card-expander')?.click(); root.dataset.demoInteraction = 'chart-expanded'; }
  if (params.get('simulate') === 'grade') { document.querySelector('.demo-grade')?.click(); root.dataset.demoInteraction = 'grade-simulated'; }
  if (params.get('simulate') === 'submit') { document.querySelector('.demo-submit')?.click(); root.dataset.demoInteraction = 'submission-simulated'; }
  if (params.get('profile')) setTimeout(() => { document.querySelector(`.profile-open[data-id="${CSS.escape(params.get('profile'))}"]`)?.click(); root.dataset.demoInteraction = 'profile-opened'; }, 50);
  const recordLayout = () => { root.dataset.demoViewport = String(innerWidth); root.dataset.demoHorizontalOverflow = String(document.documentElement.scrollWidth > innerWidth + 1); };
  addEventListener('resize', recordLayout);
  requestAnimationFrame(recordLayout);
  setTimeout(recordLayout, 300);
  root.dataset.premiumReady = 'true';
})();
