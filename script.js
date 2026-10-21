const $ = s => document.querySelector(s);
const STORE_KEY = 'prolink_demo_v1', SESSION_KEY = 'prolink_session';
const STATUSES = ['Pending', 'Reviewing', 'Accepted', 'Rejected'];
const JOB_TYPES = ['Full-time', 'Part-time', 'Internship', 'Contract'];
const MAX_FILE_SIZE = 1024 * 1024;
const LOCATIONS = ['Remote','Metro Manila','Abra','Agusan del Norte','Agusan del Sur','Aklan','Albay','Antique','Apayao','Aurora','Basilan','Bataan','Batanes','Batangas','Benguet','Biliran','Bohol','Bukidnon','Bulacan','Cagayan','Camarines Norte','Camarines Sur','Camiguin','Capiz','Catanduanes','Cavite','Cebu','Cotabato','Davao de Oro','Davao del Norte','Davao del Sur','Davao Occidental','Davao Oriental','Dinagat Islands','Eastern Samar','Guimaras','Ifugao','Ilocos Norte','Ilocos Sur','Iloilo','Isabela','Kalinga','La Union','Laguna','Lanao del Norte','Lanao del Sur','Leyte','Maguindanao del Norte','Maguindanao del Sur','Marinduque','Masbate','Misamis Occidental','Misamis Oriental','Mountain Province','Negros Occidental','Negros Oriental','Northern Samar','Nueva Ecija','Nueva Vizcaya','Occidental Mindoro','Oriental Mindoro','Palawan','Pampanga','Pangasinan','Quezon','Quirino','Rizal','Romblon','Samar','Sarangani','Siquijor','Sorsogon','South Cotabato','Southern Leyte','Sultan Kudarat','Sulu','Surigao del Norte','Surigao del Sur','Tarlac','Tawi-Tawi','Zambales','Zamboanga del Norte','Zamboanga del Sur','Zamboanga Sibugay'];

/* ---------- Safe storage (falls back to memory if the browser blocks localStorage) ---------- */
const mem = {};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] ?? null; } },
  set(k, v) {
    try { localStorage.setItem(k, v); return true; }
    catch (e) { if (e && (e.name === 'QuotaExceededError' || e.code === 22)) return false; mem[k] = v; return true; }
  },
  del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } }
};

/* ---------- Theme (light / dark) ---------- */
const THEME_KEY = 'prolink_theme';
const ICON = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const SUN = ICON('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>');
const MOON = ICON('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>');
function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
function applyTheme(t, persist = true) {
  const dark = t === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (persist) store.set(THEME_KEY, dark ? 'dark' : 'light');
  document.querySelectorAll('[data-theme-toggle]').forEach(b => {
    b.innerHTML = dark ? SUN : MOON;
    b.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    b.setAttribute('aria-label', b.title);
  });
  document.querySelectorAll('[data-theme-switch]').forEach(b => b.setAttribute('aria-checked', String(dark)));
  const sel = document.getElementById('themeSelect'); if (sel) sel.value = dark ? 'dark' : 'light';
}

/* ---------- Password reset (email code) ---------- */
// Real emails are sent through https://www.emailjs.com (free tier: 200 emails per month). Keys are filled in below.
const EMAILJS = { publicKey: 'fmfWdjP7GgCW6cUEl', serviceId: 'service_fs7cftu', templateId: 'template_c3ur72o' };
// In your EmailJS template, use the variables: {{to_email}}, {{to_name}}, {{code}}
/* Only these email providers can be used to sign up or reset a password. */
const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com'];
const EMAIL_RULE_MSG = 'Please use a Gmail, Yahoo or Outlook email address.';
const emailOk = e => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) && ALLOWED_EMAIL_DOMAINS.includes(e.split('@')[1]);
const CODE_TTL = 10 * 60 * 1000, MAX_ATTEMPTS = 5, RESEND_COOLDOWN = 15 * 1000;   // seconds a user waits before asking for another code
let reset = null; // { email, code, expires, attempts, lastSent, verified }

const makeCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');

async function sendResetEmail(account, code) {
  if (!window.emailjs) await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/dist/email.min.js';
    s.onload = res; s.onerror = () => rej(new Error('Could not load the email service. Check your internet connection.')); document.head.appendChild(s);
  });
  emailjs.init({ publicKey: EMAILJS.publicKey });
  await emailjs.send(EMAILJS.serviceId, EMAILJS.templateId, { to_email: account.email, to_name: account.name, code });
}

function showForgotStep(step) {
  ['forgotEmailForm', 'forgotCodeForm', 'forgotResetForm'].forEach(id => $('#' + id).classList.toggle('hidden', id !== step));
}
function resetForgotFlow() {
  reset = null;
  ['forgotEmailForm', 'forgotCodeForm', 'forgotResetForm'].forEach(id => $('#' + id).reset());
  showForgotStep('forgotEmailForm');
}
async function issueCode(email) {
  if (!emailOk(email)) { toast(EMAIL_RULE_MSG, 'err'); return false; }
  const account = db.users.find(x => (x.email || '').toLowerCase() === email);
  if (!account) { toast('No account found for that email.', 'err'); return false; }
  if (reset && reset.email === email && Date.now() - reset.lastSent < RESEND_COOLDOWN) {
    toast(`Please wait ${Math.ceil((RESEND_COOLDOWN - (Date.now() - reset.lastSent)) / 1000)}s before requesting a new code.`, 'err');
    return false;
  }
  const code = makeCode();
  try {
    await sendResetEmail(account, code);
    reset = { email, code, expires: Date.now() + CODE_TTL, attempts: 0, lastSent: Date.now(), verified: false };
    $('#codeSentMsg').textContent = `We sent a 6-digit code to ${email}. Check your inbox (and spam folder).`;
    return true;
  } catch (err) {
    const why = err && (err.text || err.message);
    toast('Could not send the email' + (why ? ': ' + why : '.') + ' Please try again.', 'err');
    return false;
  }
}

function seedDB() {
  const now = Date.now();
  const j = (id, company, title, location, type, salary, description, requirements) =>
    ({ id, employer: 0, company, title, location, type, salary, description, requirements, created: now - (10 - id) * 1000 });
  return {
    users: [],
    jobs: [
      j(1, 'Northstar Digital', 'Junior Frontend Developer', 'Metro Manila', 'Full-time', '₱25,000 – ₱35,000 / month', 'Help build accessible, responsive web experiences with our product team.', 'HTML, CSS, JavaScript; React familiarity is a plus.'),
      j(2, 'BrightPath Solutions', 'IT Support Associate', 'Metro Manila', 'Full-time', '', 'Provide technical support, troubleshoot user issues, and maintain workstations.', 'Basic networking, Windows support, strong communication.'),
      j(3, 'Orbit Creative', 'UI/UX Design Intern', 'Cebu', 'Internship', '', 'Support design research, wireframes, and prototypes for web products.', 'Figma or similar design tool; portfolio or school projects welcome.'),
      j(4, 'Harbor Retail Group', 'Customer Service Representative', 'Remote', 'Part-time', '₱18,000 / month', 'Assist customers by chat and email and resolve order concerns.', 'Good English, typing speed, willingness to learn.')
    ],
    applications: []
  };
}
function loadDB() {
  try {
    const d = JSON.parse(store.get(STORE_KEY));
    if (d && Array.isArray(d.users) && Array.isArray(d.jobs) && Array.isArray(d.applications)) return d;
  } catch (e) {}
  return seedDB();
}
function save() { return store.set(STORE_KEY, JSON.stringify(db)); }

let db = loadDB(), current = null, page = 'dashboard', editingJobId = null, animateNext = false, appQuery = '', appSort = 'new', sortBy = 'new', onlySalary = false;
let filters = { q: '', loc: '', type: '' }, appFilter = '';
if (!store.get(STORE_KEY)) save();

/* ---------- Helpers ---------- */
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => (n || 'P').split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase();
const avatarHTML = u => u.photo ? `<img src="${esc(u.photo)}" alt="">` : esc(initials(u.name));
const cleanName = v => v.replace(/[^A-Za-z\u00C0-\u024F\s.'-]/g, '');
const user = () => db.users.find(u => u.id === current);
const userName = id => db.users.find(u => u.id === id)?.name || 'Candidate';
const myJobs = () => db.jobs.filter(j => j.employer === current);
const myApplicants = () => { const ids = myJobs().map(j => j.id); return db.applications.filter(a => ids.includes(a.jobId)); };
const options = (list, sel = '', ph = '') => (ph ? `<option value="">${esc(ph)}</option>` : '') +
  list.map(v => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
function calcAge(b) {
  if (!b) return ''; const d = new Date(b); if (isNaN(d)) return '';
  const t = new Date(); let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
  return a >= 0 ? a : '';
}
// Account creation date. Accounts made before this feature used Date.now() as their id, so the id works as a fallback.
const memberSince = u => {
  const d = new Date(u.created || u.id);
  return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};
function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- Auth ---------- */
function login(u) {
  current = u.id; page = 'dashboard'; animateNext = true;
  store.set(SESSION_KEY, String(u.id));
  $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden');
  render(); window.scrollTo(0, 0);
}
function logout() {
  closeMenu(); current = null; store.del(SESSION_KEY);
  $('#app').classList.add('hidden'); $('#auth').classList.remove('hidden');
  $('#signupView').classList.add('hidden'); $('#forgotView').classList.add('hidden'); $('#loginView').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(currentTheme(), false);
  $('#showSignup').onclick = e => { e.preventDefault(); $('#loginView').classList.add('hidden'); $('#signupView').classList.remove('hidden'); };
  $('#showLogin').onclick = e => { e.preventDefault(); $('#signupView').classList.add('hidden'); $('#forgotView').classList.add('hidden'); $('#loginView').classList.remove('hidden'); resetForgotFlow(); };
  $('#showForgot').onclick = e => { e.preventDefault(); resetForgotFlow(); $('#loginView').classList.add('hidden'); $('#forgotView').classList.remove('hidden'); };
  $('#backToLogin').onclick = e => { e.preventDefault(); resetForgotFlow(); $('#forgotView').classList.add('hidden'); $('#loginView').classList.remove('hidden'); };

  const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const EYE = svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>');
  const EYE_OFF = svg('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>');
  document.querySelectorAll('[data-toggle]').forEach(b => {
    b.innerHTML = EYE;
    b.onclick = () => {
      const i = $('#' + b.dataset.toggle), show = i.type === 'password';
      i.type = show ? 'text' : 'password';
      b.innerHTML = show ? EYE_OFF : EYE;
      b.title = b.ariaLabel = show ? 'Hide password' : 'Show password';
    };
  });

  /* Warn when the full name is already used by another account */
  const nameTaken = n => { const k = n.trim().replace(/\s+/g, ' ').toLowerCase(); return !!k && db.users.some(u => (u.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === k); };
  const updateNameMsg = () => {
    const t = nameTaken($('#signupName').value), m = $('#nameMsg');
    m.textContent = t ? '⚠ This name is already taken. Please use a different name.' : '';
    m.className = 'pw-hint' + (t ? ' bad' : '');
  };
  $('#signupName').addEventListener('input', e => { e.target.value = cleanName(e.target.value); updateNameMsg(); });

  /* Live "passwords match" hint under Confirm password */
  const updatePwMatch = () => {
    const a = $('#signupPassword').value, b = $('#signupConfirmPassword').value, msg = $('#pwMatchMsg');
    if (!b) { msg.textContent = ''; msg.className = 'pw-hint'; return; }
    const ok = a === b;
    msg.textContent = ok ? '✓ Passwords match' : '✗ Passwords do not match';
    msg.className = 'pw-hint ' + (ok ? 'ok' : 'bad');
  };
  $('#signupPassword').addEventListener('input', updatePwMatch);
  $('#signupConfirmPassword').addEventListener('input', updatePwMatch);

  $('#signupForm').onsubmit = e => {
    e.preventDefault();
    const name = $('#signupName').value.trim().replace(/\s+/g, ' ');
    const email = $('#signupEmail').value.trim().toLowerCase();
    const password = $('#signupPassword').value, role = $('#signupRole').value;
    const confirmPw = $('#signupConfirmPassword').value;
    if (name.length < 2) return toast('Please enter your full name.', 'err');
    if (!emailOk(email)) return toast(EMAIL_RULE_MSG, 'err');
    if (nameTaken(name)) { updateNameMsg(); return toast('This name is already taken. Please use a different name.', 'err'); }
    if (password.length < 6) return toast('Password must be at least 6 characters.', 'err');
    if (password !== confirmPw) return toast('Passwords do not match.', 'err');
    if (db.users.some(u => u.email === email)) return toast('An account with this email already exists.', 'err');
    const u = { id: Date.now(), name, email, password, role, company: '', bio: '', location: '', birthdate: '', sex: '', created: Date.now() };
    db.users.push(u);
    if (!save()) { db.users.pop(); return toast('Unable to save your account. Storage may be full.', 'err'); }
    e.target.reset(); updatePwMatch(); updateNameMsg(); login(u); toast(`Welcome to ProLink, ${name.split(' ')[0]}!`);
  };
  $('#loginForm').onsubmit = e => {
    e.preventDefault();
    const email = $('#loginEmail').value.trim().toLowerCase(), pw = $('#loginPassword').value;
    const u = db.users.find(x => (x.email || '').toLowerCase() === email);
    if (!u || u.password !== pw) return toast('Incorrect email or password. Try again.', 'err');
    e.target.reset(); login(u);
  };

  /* Forgot password: email -> code -> new password */
  $('#forgotEmailForm').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#sendCodeBtn'); btn.disabled = true; btn.textContent = 'Sending…';
    const ok = await issueCode($('#forgotEmail').value.trim().toLowerCase());
    btn.disabled = false; btn.textContent = 'Send code';
    if (ok) { showForgotStep('forgotCodeForm'); toast('Verification code sent.'); }
  };
  $('#resendCode').onclick = async e => {
    e.preventDefault();
    if (!reset) return;
    if (await issueCode(reset.email)) toast('A new code was sent.');
  };
  $('#forgotCodeForm').onsubmit = e => {
    e.preventDefault();
    if (!reset) { showForgotStep('forgotEmailForm'); return toast('Please request a new code.', 'err'); }
    if (Date.now() > reset.expires) { reset = null; showForgotStep('forgotEmailForm'); return toast('Code expired. Request a new one.', 'err'); }
    if (++reset.attempts > MAX_ATTEMPTS) { reset = null; showForgotStep('forgotEmailForm'); return toast('Too many wrong attempts. Request a new code.', 'err'); }
    if ($('#resetCode').value.trim() !== reset.code) return toast(`Incorrect code. ${MAX_ATTEMPTS - reset.attempts} attempt(s) left.`, 'err');
    reset.verified = true;
    showForgotStep('forgotResetForm');
    toast('Code verified.');
  };
  $('#forgotResetForm').onsubmit = e => {
    e.preventDefault();
    if (!reset || !reset.verified || Date.now() > reset.expires) { resetForgotFlow(); return toast('Session expired. Start again.', 'err'); }
    const password = $('#resetPassword').value, confirm = $('#confirmResetPassword').value;
    if (password.length < 6) return toast('Password must be at least 6 characters.', 'err');
    if (password !== confirm) return toast('Passwords do not match.', 'err');
    const account = db.users.find(x => (x.email || '').toLowerCase() === reset.email);
    if (!account) { resetForgotFlow(); return toast('Account not found.', 'err'); }
    account.password = password;
    if (!save()) return toast('Unable to save the new password. Storage may be full.', 'err');
    resetForgotFlow();
    $('#forgotView').classList.add('hidden');
    $('#loginView').classList.remove('hidden');
    toast('Password updated. You can now log in.');
  };


  /* Profile dropdown + theme switches */
  $('#ddLogout').onclick = () => { closeMenu(); logout(); };
  $('#bellBtn').onclick = e => {
    e.stopPropagation();
    const m = $('#notifMenu');
    if (!m.classList.contains('hidden')) return m.classList.add('hidden');
    closeMenu(); renderBell(); m.classList.remove('hidden');
    let changed = false; myNotifs().forEach(n => { if (!n.read) { n.read = true; changed = true; } });
    if (changed) { save(); $('#bellBadge').classList.add('hidden'); }
  };
  document.querySelectorAll('[data-theme-toggle],[data-theme-switch]').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }));
  $('#profileBtn').onclick = e => { e.stopPropagation(); $('#profileMenu').classList.contains('hidden') ? openMenu() : closeMenu(); };
  $('#profileMenu').querySelectorAll('[data-go]').forEach(b => b.onclick = () => { closeMenu(); go(b.dataset.go, ''); });
  document.addEventListener('click', e => { if (!e.target.closest('.profile-wrap')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('storage', e => {
    if (e.key !== STORE_KEY) return;
    db = loadDB();
    if (!current) return;
    if (!user()) logout(); else render();
  });
  const saved = store.get(SESSION_KEY), u = saved && db.users.find(x => String(x.id) === saved);
  if (u) login(u);
});

/* ---------- Navigation ---------- */
const NAV = {
  seeker: [['dashboard', 'Dashboard'], ['jobs', 'Find Jobs'], ['saved', 'Saved Jobs'], ['applications', 'My Applications']],
  employer: [['dashboard', 'Dashboard'], ['post', 'Post a Job'], ['manage', 'Manage Jobs'], ['applicants', 'Applicants']]
};
const EXTRA_PAGES = ['profile', 'settings', 'about'];   // reachable from the profile menu
function openMenu() { $('#notifMenu')?.classList.add('hidden'); $('#profileMenu').classList.remove('hidden'); $('#profileBtn').setAttribute('aria-expanded', 'true'); }
function closeMenu() {
  const m = $('#profileMenu'); if (!m) return;
  m.classList.add('hidden'); $('#notifMenu')?.classList.add('hidden'); $('#profileBtn').setAttribute('aria-expanded', 'false');
}
function go(p, extra) {
  if (p !== 'post') editingJobId = null;
  if (extra !== undefined) appFilter = extra;
  if (p !== page) animateNext = true;   // only animate real page changes (not filter changes)
  page = p; render(); window.scrollTo(0, 0);
}
/* Replays the page-enter animation and the top progress bar */
function playPageAnimation() {
  const c = $('#content'), bar = $('#pageBar');
  c.classList.remove('page-anim'); void c.offsetWidth; c.classList.add('page-anim');
  if (bar) { bar.classList.remove('run'); void bar.offsetWidth; bar.classList.add('run'); }
}
function render() {
  const u = user(); if (!u) return;
  const items = NAV[u.role];
  if (!items.some(([id]) => id === page) && !EXTRA_PAGES.includes(page)) page = 'dashboard';
  paintName(u); $('#topAvatar').innerHTML = avatarHTML(u);
  $('#ddEmail').textContent = u.email;
  $('#ddProfile').textContent = u.role === 'seeker' ? 'My Profile' : 'Company Profile';
  renderBell();
  applyTheme(currentTheme(), false);
  $('#nav').innerHTML = items.map(([id, l]) => `<button class="${page === id ? 'active' : ''}" data-page="${id}">${l}</button>`).join('');
  $('#nav').querySelectorAll('button').forEach(b => b.onclick = () => go(b.dataset.page, ''));
  const views = { dashboard, jobs, saved: savedJobs, applications, profile, post, manage, applicants, settings, about };
  const binders = { jobs: bindJobs, profile: bindProfile, post: bindPost, settings: bindSettings };
  $('#content').innerHTML = views[page]();
  if (binders[page]) binders[page]();
  if (animateNext) { animateNext = false; playPageAnimation(); }
}
const pageHeader = (t, s, btn = '') => `<div class="welcome"><div><h1>${t}</h1><div class="muted">${s}</div></div>${btn}</div>`;

/* ---------- Dashboard ---------- */
function dashboard() {
  const u = user();
  if (u.role === 'seeker') {
    const apps = db.applications.filter(a => a.userId === u.id);
    const recent = db.jobs.slice().sort((a, b) => b.created - a.created).slice(0, 3);
    return `${pageHeader(`Hello, ${esc(u.name.split(' ')[0])} 👋`, 'Here’s your career activity at a glance.', `<button class="primary" onclick="go('jobs')">Explore jobs</button>`)}
      <div class="cards">
        <div class="stat" onclick="go('jobs')"><label>Available opportunities</label><strong>${db.jobs.length}</strong></div>
        <div class="stat" onclick="go('applications')"><label>Applications submitted</label><strong>${apps.length}</strong></div>
        <div class="stat" onclick="go('applications')"><label>Under review</label><strong>${apps.filter(a => a.status === 'Pending' || a.status === 'Reviewing').length}</strong></div>
      </div>
      ${u.bio || u.location ? '' : `<div class="panel">💡 <b>Tip:</b> complete your <a href="#" onclick="go('profile');return false">profile</a> so employers know who you are.</div>`}
      <div class="panel"><h3>Recently posted opportunities</h3>${jobCards(recent, false)}</div>`;
  }
  const apps = myApplicants();
  return `${pageHeader(`Welcome, ${esc(u.company || u.name)} 👋`, 'Manage your hiring activity from one place.', `<button class="primary" onclick="go('post')">＋ Create a job</button>`)}
    <div class="cards">
      <div class="stat" onclick="go('manage')"><label>Active job postings</label><strong>${myJobs().filter(j => !isClosed(j)).length}</strong></div>
      <div class="stat" onclick="go('applicants','')"><label>Total applicants</label><strong>${apps.length}</strong></div>
      <div class="stat" onclick="go('applicants','Pending')"><label>Awaiting review</label><strong>${apps.filter(a => a.status === 'Pending').length}</strong></div>
    </div>
    <div class="panel"><h3>Applicants by status</h3>${statusChart(apps)}</div>
    <div class="panel"><h3>Recent applicants</h3>
      ${apps.length ? `<div class="table-wrap"><table class="table"><tr><th>Candidate</th><th>Position</th><th>Status</th></tr>
        ${apps.slice(-5).reverse().map(a => `<tr><td>${esc(userName(a.userId))}</td><td>${esc(db.jobs.find(j => j.id === a.jobId)?.title || '')}</td><td><span class="status ${a.status}">${a.status}</span></td></tr>`).join('')}
      </table></div>` : '<div class="empty">Applicants will appear here when candidates apply.</div>'}
    </div>`;
}

/* ---------- Seeker: jobs ---------- */
function jobCards(list, canApply = true) {
  if (!list.length) return '<div class="empty">😕 No jobs found. Try adjusting your filters.</div>';
  return `<div class="joblist">${list.map(j => {
    const applied = db.applications.some(a => a.jobId === j.id && a.userId === current);
    const m = canApply ? matchScore(j) : null, isSaved = (user()?.saved || []).includes(j.id);
    return `<article class="job">
      <div class="job-head"><div><h3>${esc(j.title)}</h3><div class="company">${esc(j.company || 'Company')}${empBadge(j)} · 📍 ${esc(j.location)}</div></div><span class="job-side">${m !== null ? `<span class="match ${m >= 70 ? 'hi' : m >= 40 ? 'mid' : 'lo'}" title="Based on the skills in your profile">${m}% match</span>` : ''}<span class="tag">${esc(j.type)}</span>${canApply ? `<button type="button" class="heart ${isSaved ? 'on' : ''}" onclick="toggleSave(${j.id})" aria-label="${isSaved ? 'Remove from saved jobs' : 'Save job'}" title="${isSaved ? 'Remove from saved jobs' : 'Save job'}">${isSaved ? '♥' : '♡'}</button>` : ''}</span></div>
      <p>${esc(j.description)}</p>
      <div class="tags"><span class="tag g">💰 ${j.salary ? esc(j.salary) : 'Salary not specified'}</span>${j.deadline ? `<span class="tag g">⏰ Apply by ${esc(new Date(j.deadline + 'T00:00').toLocaleDateString())}</span>` : ''}<span class="tag g">Requirements: ${esc(j.requirements)}</span></div>
      ${canApply ? `<div><button class="${applied ? 'secondary' : 'primary'}" ${applied || isClosed(j) ? 'disabled' : ''} onclick="applyJob(${j.id})">${applied ? '✓ Applied' : isClosed(j) ? 'Closed' : 'Quick apply'}</button></div>` : ''}
    </article>`;
  }).join('')}</div>`;
}
function filteredJobs() {
  const q = filters.q.toLowerCase();
  return db.jobs.filter(j => (j.title + ' ' + j.company + ' ' + j.description + ' ' + j.requirements).toLowerCase().includes(q) &&
    (!filters.loc || j.location === filters.loc) && (!filters.type || j.type === filters.type) && (!onlySalary || j.salary)).sort(SORTS[sortBy] || SORTS.new);
}
function results() {
  const l = filteredJobs(), active = filters.q || filters.loc || filters.type || onlySalary;
  return `<div class="count"><span>${l.length} job${l.length === 1 ? '' : 's'} found</span>${active ? '<button class="secondary" id="clearF">Clear filters</button>' : ''}</div>${jobCards(l)}`;
}
function jobs() {
  return `${pageHeader('Find your next opportunity', 'Search and filter openings that match your goals.')}
    <div class="toolbar">
      <input class="field" id="searchTerm" placeholder="🔍 Job title or keyword" value="${esc(filters.q)}">
      <select class="field" id="searchLocation">${options(LOCATIONS, filters.loc, 'All locations')}</select>
      <select class="field" id="searchType">${options(JOB_TYPES, filters.type, 'All employment types')}</select>
      <select class="field" id="searchSort">${[['new', 'Newest first'], ['old', 'Oldest first'], ['salary', 'Highest salary'], ['match', 'Best match']].map(([v, l]) => `<option value="${v}" ${sortBy === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" id="searchSalary" ${onlySalary ? 'checked' : ''}> Has salary listed</label>
    </div><div id="jobResults">${results()}</div>`;
}
function bindJobs() {
  const show = () => {
    $('#jobResults').innerHTML = results();
    const c = $('#clearF');
    if (c) c.onclick = () => { filters = { q: '', loc: '', type: '' }; onlySalary = false; render(); };
  };
  const update = () => { filters = { q: $('#searchTerm').value.trim(), loc: $('#searchLocation').value, type: $('#searchType').value }; sortBy = $('#searchSort').value; onlySalary = $('#searchSalary').checked; show(); };
  $('#searchTerm').addEventListener('input', update);
  $('#searchLocation').addEventListener('change', update);
  $('#searchType').addEventListener('change', update);
  $('#searchSort').addEventListener('change', update);
  $('#searchSalary').addEventListener('change', update);
  show();
}

/* ---------- Seeker: apply ---------- */
function applyJob(id) {
  const u = user(); if (!u || u.role !== 'seeker') return;
  if (db.applications.some(a => a.jobId === id && a.userId === current)) return;
  const j = db.jobs.find(x => x.id === id); if (!j || isClosed(j)) return;
  $('#applyModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'applyModal'; modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="modal"><h2>Apply for ${esc(j.title)}</h2><p class="muted">${esc(j.company)} · Submit your application documents</p>
    <form id="applicationForm">
      <label>Full Name<input class="field" value="${esc(u.name)}" disabled></label>
      <label>Email Address<input class="field" value="${esc(u.email)}" disabled></label>
      <label>CV / Resume *<input class="field" type="file" id="cvFile" accept=".pdf,.doc,.docx" required><span class="hint">PDF, DOC or DOCX (max 1 MB)</span></label>
      <label>Other Requirements (optional)<input class="field" type="file" id="otherFiles" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" multiple><span class="hint">Max 1 MB per file</span></label>
      <div class="actions"><button type="button" class="secondary" id="cancelApply">Cancel</button><button type="submit" class="primary" id="submitApplication">Submit Application</button></div>
    </form></div>`;
  document.body.appendChild(modal);
  $('#cancelApply').onclick = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.addEventListener('keydown', function esc_(e) { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc_); } });

  $('#applicationForm').onsubmit = async e => {
    e.preventDefault();
    const cv = $('#cvFile').files[0];
    if (!cv) return toast('Please attach your CV or Resume.', 'err');
    const files = [cv, ...$('#otherFiles').files];
    const big = files.find(f => f.size > MAX_FILE_SIZE);
    if (big) return toast(`"${big.name}" is over 1 MB.`, 'err');
    const read = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ name: f.name, type: f.type, size: f.size, data: r.result }); r.onerror = rej; r.readAsDataURL(f); });
    const btn = $('#submitApplication'); btn.disabled = true; btn.textContent = 'Uploading…';
    try {
      const documents = await Promise.all(files.map(read));
      db.applications.push({ id: Date.now(), jobId: id, userId: current, status: 'Pending', date: Date.now(), documents, history: [{ status: 'Pending', date: Date.now() }] });
      if (!save()) { db.applications.pop(); throw new Error('full'); }
      modal.remove(); render(); toast('Application submitted! Track it under My Applications.');
    } catch (err) {
      toast('Unable to submit. Try smaller files or clear browser storage.', 'err');
      btn.disabled = false; btn.textContent = 'Submit Application';
    }
  };
}

function applications() {
  const list = db.applications.filter(a => a.userId === current).sort((a, b) => b.date - a.date);
  return `${pageHeader('My applications', 'Track the progress of every submitted application.')}
    <div class="panel">${list.length ? `<div class="table-wrap"><table class="table">
      <tr><th>Position</th><th>Company</th><th>Salary</th><th>Date applied</th><th>Status</th><th></th></tr>
      ${list.map(a => { const j = db.jobs.find(x => x.id === a.jobId) || {};
        return `<tr id="app-${a.id}"><td>${esc(j.title || 'Removed job')}</td><td>${esc(j.company || '—')}</td><td>${esc(j.salary || 'Not specified')}</td>
        <td>${new Date(a.date).toLocaleDateString()}</td><td><span class="status ${a.status}">${a.status}</span></td>
        <td><div class="row-actions"><button class="secondary" onclick="showTimeline(${a.id})">Timeline</button>${a.status === 'Pending' ? `<button class="secondary" onclick="withdraw(${a.id})">Withdraw</button>` : ''}</div></td></tr>`; }).join('')}
    </table></div>` : `<div class="empty">No applications yet. <a href="#" onclick="go('jobs');return false">Browse jobs →</a></div>`}</div>`;
}
async function withdraw(id) {
  if (!await confirmBox('Withdraw application', 'Are you sure you want to withdraw this application?', 'Withdraw')) return;
  const prev = db.applications;
  db.applications = prev.filter(a => !(a.id === id && a.userId === current));
  if (!save()) { db.applications = prev; return toast('Unable to withdraw.', 'err'); }
  render(); toast('Application withdrawn.');
}

/* ---------- Profile ---------- */
function profile() {
  const u = user(), s = u.role === 'seeker';
  return `${pageHeader(s ? 'My Profile' : 'Company Profile', 'Manage your personal information and preferences.')}${completenessBar(u)}
    <div class="panel"><form id="profileForm" class="formgrid">
      <div class="full pfp-row"><div class="pfp" id="pfpBox">${avatarHTML(u)}</div>
        <div class="pfp-actions"><input type="file" id="pfpFile" accept="image/*" class="hidden">
          <button type="button" class="secondary" id="pfpChange">Change photo</button>
          <button type="button" class="secondary ${u.photo ? '' : 'hidden'}" id="pfpRemove">Remove</button>
          <span class="hint">JPG or PNG. It will be cropped to a square.</span>
          <span class="member-since">📅 Profile created on ${esc(memberSince(u))}</span></div></div>
      <label>${s ? 'Full name' : 'Contact person'}<input class="field" id="pfName" value="${esc(u.name)}" required></label>
      <label>Email<input class="field" value="${esc(u.email)}" readonly></label>
      ${s ? '' : `<label class="full">Company name<input class="field" id="pfCompany" value="${esc(u.company)}" required></label>`}
      ${s ? `<label>📅 Birthdate<input class="field" type="date" id="pfBirthdate" value="${esc(u.birthdate)}" max="${new Date().toISOString().slice(0, 10)}"></label>
      <label>Age<input class="field" id="pfAge" value="${calcAge(u.birthdate)}" readonly placeholder="Calculated from birthdate"></label>
      <label>Sex<select class="field" id="pfSex">${options(['Male', 'Female'], u.sex, 'Select')}</select></label>` : ''}
      <label>${s ? 'Location' : 'Company location'}<select class="field" id="pfLocation">${options(LOCATIONS, u.location, 'Select location')}</select></label>
      <label class="full">${s ? 'Bio / Professional summary' : 'About the company'}<textarea class="field" id="pfBio">${esc(u.bio)}</textarea></label>
      ${s ? `<label class="full">Skills<input class="field" id="pfSkills" value="${esc(u.skills || '')}" placeholder="e.g. HTML, CSS, JavaScript, Customer service"><span class="hint">Separate skills with commas. They are used to calculate the match score on each job.</span></label>` : ''}
      <div class="full form-actions"><button class="primary" type="submit">Save changes</button></div>
    </form></div>`;
}
function bindProfile() {
  const refreshPhoto = () => { const u = user(); $('#pfpBox').innerHTML = avatarHTML(u); $('#pfpRemove').classList.toggle('hidden', !u.photo); $('#topAvatar').innerHTML = avatarHTML(u); paintName(u); const cb = $('#completeBox'); if (cb) cb.outerHTML = completenessBar(u); };
  const setPhoto = v => {
    const u = user(), prev = u.photo; u.photo = v;
    if (!save()) { u.photo = prev; return toast('Unable to save photo. Storage may be full.', 'err'); }
    refreshPhoto(); toast(v ? 'Photo updated.' : 'Photo removed.');
  };
  $('#pfpChange').onclick = () => $('#pfpFile').click();
  $('#pfpRemove').onclick = () => setPhoto('');
  $('#pfpFile').onchange = e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Please choose an image file.', 'err');
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
      const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
      const m = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
      URL.revokeObjectURL(url); setPhoto(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not read that image.', 'err'); };
    img.src = url;
  };
  $('#pfName').addEventListener('input', e => { e.target.value = cleanName(e.target.value); });
  const bd = $('#pfBirthdate'); if (bd) bd.addEventListener('input', () => { $('#pfAge').value = calcAge(bd.value); });
  if (bd) bd.addEventListener('click', () => { try { bd.showPicker(); } catch (e) {} });
  $('#profileForm').onsubmit = e => {
    e.preventDefault();
    const u = user(), name = $('#pfName').value.trim();
    if (name.length < 2) return toast('Please enter a valid name.', 'err');
    const backup = { ...u };
    u.name = name; u.location = $('#pfLocation').value; u.bio = $('#pfBio').value.trim();
    if (u.role === 'seeker') { u.birthdate = $('#pfBirthdate').value; u.sex = $('#pfSex').value; u.skills = $('#pfSkills').value.trim(); }
    else { u.company = $('#pfCompany').value.trim(); myJobs().forEach(j => { j.company = u.company; }); }
    if (!save()) { Object.assign(u, backup); return toast('Unable to save. Storage may be full.', 'err'); }
    render(); toast(!isComplete(backup) && isComplete(u) ? '🎉 Congratulations! You earned the ProLink Verified badge.' : 'Profile updated.');
  };
}

/* ---------- Employer ---------- */
function post() {
  const u = user(), j = editingJobId ? myJobs().find(x => x.id === editingJobId) : null;
  const v = j || { title: '', type: 'Full-time', location: '', salary: '', description: '', requirements: '' };
  return `${pageHeader(j ? 'Edit Job Posting' : 'Create Job Posting', j ? 'Update the details of this position.' : 'Post a new position for job seekers to apply for.')}
    <div class="panel"><form id="jobForm" class="formgrid">
      <label class="full">Job title<input class="field" id="jobTitle" value="${esc(v.title)}" placeholder="e.g. Marketing Assistant" required></label>
      <label>Employment type<select class="field" id="jobType">${options(JOB_TYPES, v.type)}</select></label>
      <label>Location<select class="field" id="jobLocation" required>${options(LOCATIONS, v.location || u.location, 'Select location')}</select></label>
      <label class="full">Salary (optional)<input class="field" id="jobSalary" value="${esc(v.salary)}" placeholder="e.g. ₱20,000 – ₱30,000 / month"></label>
      <label class="full">Application deadline (optional)<input class="field" type="date" id="jobDeadline" value="${esc(v.deadline || '')}"><span class="hint">After this date the job shows as closed for applicants.</span></label>
      <label class="full">Job description<textarea class="field" id="jobDescription" required>${esc(v.description)}</textarea></label>
      <label class="full">Requirements<textarea class="field" id="jobRequirements" required>${esc(v.requirements)}</textarea></label>
      <div class="full form-actions"><button class="primary" type="submit">${j ? 'Save changes' : 'Publish job'}</button>
      ${j ? `<button class="secondary" type="button" onclick="go('manage')">Cancel</button>` : ''}</div>
    </form></div>`;
}
function bindPost() {
  $('#jobForm').onsubmit = e => {
    e.preventDefault();
    const u = user();
    const data = { title: $('#jobTitle').value.trim(), type: $('#jobType').value, location: $('#jobLocation').value,
      salary: $('#jobSalary').value.trim(), description: $('#jobDescription').value.trim(),
      requirements: $('#jobRequirements').value.trim(), deadline: $('#jobDeadline').value, company: u.company || u.name };
    if (!data.title || !data.location || !data.description || !data.requirements) return toast('Please fill in all required fields.', 'err');
    if (editingJobId) {
      const j = myJobs().find(x => x.id === editingJobId);
      if (!j) return toast('Job not found.', 'err');
      Object.assign(j, data);
    } else db.jobs.push({ id: Date.now(), employer: current, created: Date.now(), ...data });
    if (!save()) return toast('Unable to save. Storage may be full.', 'err');
    const was = !!editingJobId; editingJobId = null; go('manage');
    toast(was ? 'Job updated.' : 'Job posted successfully!');
  };
}
function manage() {
  const list = myJobs().sort((a, b) => b.created - a.created);
  return `${pageHeader('Manage Job Postings', 'View and edit your existing job posts.', `<button class="primary" onclick="go('post')">＋ Create a job</button>`)}
    <div class="panel">${list.length ? `<div class="table-wrap"><table class="table">
      <tr><th>Position</th><th>Type</th><th>Location</th><th>Applicants</th><th>Status</th><th>Actions</th></tr>
      ${list.map(j => `<tr><td>${esc(j.title)}</td><td>${esc(j.type)}</td><td>${esc(j.location)}</td><td>${db.applications.filter(a => a.jobId === j.id).length}</td>
        <td><span class="status ${jobStatus(j) === 'Open' ? 'Accepted' : jobStatus(j) === 'Closed' ? 'Rejected' : 'Pending'}">${jobStatus(j)}</span></td>
        <td><div class="row-actions"><button class="secondary" onclick="editJob(${j.id})">Edit</button><button class="secondary" onclick="toggleJob(${j.id})">${j.closed ? 'Reopen' : 'Close'}</button><button class="danger" onclick="deleteJob(${j.id})">Delete</button></div></td></tr>`).join('')}
    </table></div>` : `<div class="empty">You have not posted any jobs yet. <a href="#" onclick="go('post');return false">Create your first job →</a></div>`}</div>`;
}
function editJob(id) { if (!myJobs().some(j => j.id === id)) return; editingJobId = id; page = 'post'; animateNext = true; render(); window.scrollTo(0, 0); }
async function deleteJob(id) {
  if (!myJobs().some(j => j.id === id)) return;
  if (!await confirmBox('Delete job posting', 'This will permanently delete the job posting and all of its applications. This cannot be undone.', 'Delete')) return;
  const b = { jobs: db.jobs, applications: db.applications };
  db.jobs = db.jobs.filter(j => j.id !== id); db.applications = db.applications.filter(a => a.jobId !== id);
  if (!save()) { db.jobs = b.jobs; db.applications = b.applications; return toast('Unable to delete.', 'err'); }
  render(); toast('Job deleted.');
}
function applicants() {
  const all = myApplicants().sort((a, b) => b.date - a.date);
  let list = appFilter ? all.filter(a => a.status === appFilter) : all;
  const q = appQuery.trim().toLowerCase();
  if (q) list = list.filter(a => (userName(a.userId) + ' ' + (db.jobs.find(j => j.id === a.jobId)?.title || '')).toLowerCase().includes(q));
  list = list.slice().sort(appSort === 'old' ? (a, b) => a.date - b.date : appSort === 'az' ? (a, b) => userName(a.userId).localeCompare(userName(b.userId)) : (a, b) => b.date - a.date);
  return `${pageHeader('Applicant Review', 'Review incoming candidate applications and update their status.')}
    <div class="chips">${[['', 'All', all.length], ...STATUSES.map(s => [s, s, all.filter(a => a.status === s).length])].map(([v, l, n]) => `<button type="button" class="chip ${appFilter === v ? 'active' : ''}" onclick="go('applicants','${v}')">${l} <b>${n}</b></button>`).join('')}</div>
    <div class="toolbar">
      <input class="field" id="appSearch" placeholder="🔍 Search candidate or position" value="${esc(appQuery)}" oninput="setAppQuery(this.value)">
      <select class="field" style="max-width:200px" onchange="appSort=this.value;render()">${[['new', 'Newest first'], ['old', 'Oldest first'], ['az', 'Name A–Z']].map(([v, l]) => `<option value="${v}" ${appSort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="panel">${list.length ? `<div class="table-wrap"><table class="table">
      <tr><th>Candidate</th><th>Position</th><th>Date</th><th>Profile</th><th>Documents</th><th>Notes</th><th>Status</th></tr>
      ${list.map(a => { const c = db.users.find(x => x.id === a.userId);
        return `<tr><td>${esc(c?.name || 'Candidate')}${c && isComplete(c) ? badge(true) : ''}<br><span class="muted">${esc(c?.email || '')}</span></td>
        <td>${esc(db.jobs.find(j => j.id === a.jobId)?.title || '')}</td><td>${a.date ? esc(new Date(a.date).toLocaleString()) : 'Date unavailable'}</td>
        <td><button class="secondary" onclick="viewApplicantProfile(${a.id})">View Profile</button></td>
        <td>${(a.documents || []).map((d, i) => `<button class="doc-link" onclick="downloadDoc(${a.id},${i})">${esc(d.name)}</button>`).join('')}</td>
        <td><button class="secondary" onclick="editNote(${a.id})">${a.note ? '📝 Edit note' : '＋ Add note'}</button></td>
        <td><select class="field" onchange="askStatus(${a.id},this.value)">${options(STATUSES, a.status)}</select></td></tr>`; }).join('')}
    </table></div>` : '<div class="empty">No applicants found.</div>'}</div>`;
}
function viewApplicantProfile(applicationId) {
  const a = db.applications.find(x => x.id === applicationId);
  if (!a || !myJobs().some(j => j.id === a.jobId)) return;
  const c = db.users.find(x => x.id === a.userId);
  if (!c || c.role !== 'seeker') return;
  const job = db.jobs.find(j => j.id === a.jobId);
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'applicantProfileModal';
  modal.innerHTML = `<div class="modal applicant-profile-modal" role="dialog" aria-modal="true" aria-labelledby="applicantProfileTitle">
    <div class="applicant-profile-head"><div class="pfp">${avatarHTML(c)}</div><div><h2 id="applicantProfileTitle">${esc(c.name || 'Candidate')}${isComplete(c) ? badge(true) : ''}</h2><p class="muted">${esc(c.email || 'Email unavailable')}</p></div></div>
    <div class="applicant-profile-details">
      <div><strong>Applied for</strong><span>${esc(job?.title || 'Job unavailable')}</span></div>
      <div><strong>Location</strong><span>${esc(c.location || 'Not provided')}</span></div>
      <div class="profile-bio"><strong>Bio / Professional Summary</strong><p>${esc(c.bio || 'No professional summary provided.')}</p></div>
    </div>
    <div class="actions"><button type="button" class="primary" id="closeApplicantProfile">Close</button></div>
  </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  $('#closeApplicantProfile').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}
function updateStatus(id, status, msg = '') {
  const a = db.applications.find(x => x.id === id);
  if (!a || !STATUSES.includes(status) || !myJobs().some(j => j.id === a.jobId)) return;
  const prev = a.status, prevHist = a.history; a.status = status;
  if (status !== prev) a.history = [...histOf(a), { status, date: Date.now(), msg }];
  if (!save()) { a.status = prev; a.history = prevHist; toast('Unable to update status.', 'err'); }
  else {
    toast(`Marked as ${status}.`);
    if (status !== prev) { notify(a.userId, `Your application for "${db.jobs.find(j => j.id === a.jobId)?.title || 'a job'}" is now ${status}.`, a.id, msg); save(); }
  }
  render();
}
function downloadDoc(id, i) {
  const a = db.applications.find(x => x.id === id);
  if (!a || !myJobs().some(j => j.id === a.jobId)) return;
  const d = a.documents?.[i]; if (!d) return;
  const l = document.createElement('a'); l.href = d.data; l.download = d.name;
  document.body.appendChild(l); l.click(); l.remove();
}

/* ---------- Seeker extras: saved jobs, match score, notifications, timeline, completeness ---------- */
const skillList = u => (u.skills || '').toLowerCase().split(/[,\n]/).map(s => s.trim()).filter(Boolean);
function matchScore(j) {
  const u = user(); if (!u || u.role !== 'seeker') return null;
  const sk = skillList(u); if (!sk.length) return null;
  const items = (j.requirements || '').toLowerCase().split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
  if (!items.length) return null;
  return Math.round(items.filter(it => sk.some(s => it.includes(s) || s.includes(it))).length / items.length * 100);
}
const salaryOf = j => Math.max(0, ...((j.salary || '').match(/\d[\d,]*/g) || []).map(n => +n.replace(/,/g, '')));
const SORTS = {
  new: (a, b) => b.created - a.created,
  old: (a, b) => a.created - b.created,
  salary: (a, b) => salaryOf(b) - salaryOf(a) || b.created - a.created,
  match: (a, b) => (matchScore(b) ?? -1) - (matchScore(a) ?? -1) || b.created - a.created
};
function toggleSave(id) {
  const u = user(); if (!u) return;
  const prev = u.saved || [], had = prev.includes(id);
  u.saved = had ? prev.filter(x => x !== id) : [...prev, id];
  if (!save()) { u.saved = prev; return toast('Unable to save.', 'err'); }
  render(); toast(had ? 'Removed from saved jobs.' : 'Job saved.');
}
function savedJobs() {
  const u = user(), l = db.jobs.filter(j => (u.saved || []).includes(j.id)).sort(SORTS.new);
  return `${pageHeader('Saved Jobs', 'Jobs you bookmarked for later.')}` +
    (l.length ? jobCards(l) : `<div class="panel empty">No saved jobs yet. Tap the ♡ on any job to save it. <a href="#" onclick="go('jobs');return false">Browse jobs →</a></div>`);
}
const badge = (small = true, earned = true) => `<span class="pl-badge ${small ? 'sm' : 'lg'} ${earned ? '' : 'locked'}" title="${earned ? 'ProLink Verified: profile complete' : 'Complete your profile to earn this badge'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5z"/><path d="M8.5 12l2.5 2.5L16 9.5"/></svg></span>`;
const profileFields = u => u.role === 'seeker'
  ? [['photo', u.photo], ['birthdate', u.birthdate], ['sex', u.sex], ['location', u.location], ['bio', u.bio], ['skills', u.skills]]
  : [['company logo', u.photo], ['company name', u.company], ['location', u.location], ['about the company', u.bio]];
const isComplete = u => !!u && profileFields(u).every(x => x[1]);
function paintName(u) {
  const b = isComplete(u) ? badge(true) : '';
  $('#topName').innerHTML = esc(u.name) + b; $('#ddName').innerHTML = esc(u.name) + b;
}
const empBadge = j => { const e = db.users.find(x => x.id === j.employer); return e && isComplete(e) ? badge(true) : ''; };
function completenessBar(u) {
  const f = profileFields(u), miss = f.filter(x => !x[1]).map(x => x[0]), pct = Math.round((f.length - miss.length) / f.length * 100), done = !miss.length;
  return `<div class="panel" id="completeBox"><div class="badge-row">${badge(false, done)}<div class="grow">
    <strong>${done ? 'You earned the ProLink Verified badge!' : `Your profile is ${pct}% complete`}</strong>
    <div class="meter"><span style="width:${pct}%"></span></div>
    <div class="muted" style="margin-top:8px">${done ? `Your badge shows next to your name, so ${u.role === 'seeker' ? 'employers' : 'job seekers'} know your profile is complete.` : 'Still to add: ' + miss.join(', ') + '. Complete everything to earn the ProLink Verified badge.'}</div></div></div></div>`;
}
const histOf = a => a.history || [{ status: 'Pending', date: a.date }];
function showTimeline(id) {
  const a = db.applications.find(x => x.id === id && x.userId === current); if (!a) return;
  const j = db.jobs.find(x => x.id === a.jobId) || {}, steps = histOf(a);
  const m = document.createElement('div'); m.className = 'modal-backdrop';
  m.innerHTML = `<div class="modal"><h2>Application timeline</h2><p class="muted">${esc(j.title || 'Removed job')} · ${esc(j.company || '')}</p>
    <ol class="timeline">${steps.map((s, i) => `<li class="${i === steps.length - 1 ? 'current' : ''}"><span class="dot"></span><div><span class="status ${s.status}">${s.status === 'Pending' ? 'Applied (Pending)' : s.status}</span><div class="muted">${esc(new Date(s.date).toLocaleString())}</div>${s.msg ? `<div class="tl-msg">💬 ${esc(s.msg)}</div>` : ''}</div></li>`).join('')}</ol>
    <div class="actions"><button type="button" class="primary" id="tlClose">Close</button></div></div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  $('#tlClose').onclick = close;
  m.addEventListener('click', e => { if (e.target === m) close(); });
}
function notify(userId, text, appId, msg) { (db.notifs = db.notifs || []).push({ id: Date.now() + Math.random(), userId, text, appId, msg: msg || '', date: Date.now(), read: false }); }
function openNotif(appId) {
  closeMenu(); go('applications', '');
  const row = appId && document.getElementById('app-' + appId);
  if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 2400); }
}
const myNotifs = () => (db.notifs || []).filter(n => n.userId === current);
function renderBell() {
  const u = user(), wrap = $('.notif-wrap'); if (!u || !wrap) return;
  wrap.classList.toggle('hidden', u.role !== 'seeker');
  const l = myNotifs().slice().sort((a, b) => b.date - a.date), un = l.filter(n => !n.read).length;
  $('#bellBadge').textContent = un; $('#bellBadge').classList.toggle('hidden', !un);
  $('#notifMenu').innerHTML = `<div class="dd-head"><strong>Notifications</strong></div><div class="dd-sep"></div>` +
    (l.length ? l.slice(0, 8).map(n => `<button type="button" class="notif-item ${n.read ? '' : 'unread'}" onclick="openNotif(${n.appId || 0})">${esc(n.text)}${n.msg ? `<span class="notif-msg">💬 ${esc(n.msg)}</span>` : ''}<span class="muted">${esc(new Date(n.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))}</span></button>`).join('') : '<div class="notif-item muted">No notifications yet.</div>');
}

/* ---------- Employer extras: status, notes, chart, duplicate ---------- */
const isExpired = j => !!j.deadline && new Date(j.deadline + 'T23:59:59') < new Date();
const isClosed = j => !!j.closed || isExpired(j);
const jobStatus = j => j.closed ? 'Closed' : isExpired(j) ? 'Expired' : 'Open';
function toggleJob(id) {
  const j = myJobs().find(x => x.id === id); if (!j) return;
  j.closed = !j.closed;
  if (!save()) { j.closed = !j.closed; return toast('Unable to save.', 'err'); }
  render(); toast(j.closed ? 'Job closed. It no longer accepts applications.' : 'Job reopened.');
}
function askStatus(id, status) {
  const a = db.applications.find(x => x.id === id);
  if (!a || !STATUSES.includes(status) || !myJobs().some(j => j.id === a.jobId)) return;
  if (a.status === status) return render();
  const job = db.jobs.find(j => j.id === a.jobId);
  const m = document.createElement('div'); m.className = 'modal-backdrop';
  m.innerHTML = `<div class="modal"><h2>Mark as ${status}</h2><p class="muted">${esc(userName(a.userId))} · ${esc(job?.title || '')}</p>
    <form id="msgForm"><label>Message to the applicant (optional)<textarea class="field" id="msgText" maxlength="300" placeholder="e.g. Please come for an interview on Friday, 10 AM"></textarea></label>
    <span class="hint">The applicant will see this in their notification and application timeline. Max 300 characters.</span>
    <div class="actions"><button type="button" class="secondary" id="msgCancel">Cancel</button><button type="submit" class="primary">Confirm</button></div></form></div>`;
  document.body.appendChild(m);
  function close() { m.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') { close(); render(); } }
  document.addEventListener('keydown', onKey);
  $('#msgCancel').onclick = () => { close(); render(); };
  m.addEventListener('click', e => { if (e.target === m) { close(); render(); } });
  $('#msgText').focus();
  $('#msgForm').onsubmit = e => { e.preventDefault(); const txt = $('#msgText').value.trim(); close(); updateStatus(id, status, txt); };
}
/* In-app confirmation pop-up (replaces the browser's confirm(), which can be blocked) */
function confirmBox(title, text, okLabel = 'Confirm', danger = true) {
  return new Promise(resolve => {
    const m = document.createElement('div'); m.className = 'modal-backdrop';
    m.innerHTML = `<div class="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="cfTitle"><h2 id="cfTitle">${esc(title)}</h2>
      <p class="muted" style="margin:10px 0 22px;line-height:1.5">${esc(text)}</p>
      <div class="actions"><button type="button" class="secondary" id="cfNo">Cancel</button><button type="button" class="${danger ? 'danger' : 'primary'}" id="cfYes">${esc(okLabel)}</button></div></div>`;
    document.body.appendChild(m);
    const done = v => { m.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    $('#cfNo').onclick = () => done(false);
    $('#cfYes').onclick = () => done(true);
    m.addEventListener('click', e => { if (e.target === m) done(false); });
    $('#cfNo').focus();
  });
}
function setAppQuery(v) {
  appQuery = v; render();
  const i = $('#appSearch'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); }
}
function editNote(id) {
  const a = db.applications.find(x => x.id === id);
  if (!a || !myJobs().some(j => j.id === a.jobId)) return;
  const m = document.createElement('div'); m.className = 'modal-backdrop';
  m.innerHTML = `<div class="modal"><h2>Private note</h2><p class="muted">${esc(userName(a.userId))} · Only you can see this note.</p>
    <form id="noteForm"><textarea class="field" id="noteText" maxlength="500" placeholder="e.g. Strong portfolio, follow up on Friday">${esc(a.note || '')}</textarea>
    <span class="hint">Max 500 characters</span>
    <div class="actions"><button type="button" class="secondary" id="noteCancel">Cancel</button><button type="submit" class="primary">Save note</button></div></form></div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  $('#noteCancel').onclick = close;
  m.addEventListener('click', e => { if (e.target === m) close(); });
  $('#noteText').focus();
  $('#noteForm').onsubmit = e => {
    e.preventDefault();
    const prev = a.note; a.note = $('#noteText').value.trim();
    if (!save()) { a.note = prev; return toast('Unable to save note.', 'err'); }
    close(); render(); toast('Note saved.');
  };
}
function statusChart(apps) {
  if (!apps.length) return '<div class="empty">No applicants yet.</div>';
  const count = s => apps.filter(a => a.status === s).length, max = Math.max(...STATUSES.map(count), 1);
  return `<div class="chart">${STATUSES.map(s => `<div class="bar-row"><span>${s}</span><div class="bar-track"><div class="bar ${s}" style="width:${count(s) / max * 100}%"></div></div><b>${count(s)}</b></div>`).join('')}</div>`;
}

/* ---------- Settings ---------- */
function settings() {
  const u = user();
  return `${pageHeader('Settings', 'Manage your appearance and account security.')}
    <div class="panel"><h3>Appearance</h3>
      <div class="setting-row"><div><strong>Theme</strong><div class="muted">Choose how ProLink looks on your device.</div></div>
        <select class="field setting-select" id="themeSelect"><option value="light">Light</option><option value="dark">Dark</option></select></div></div>
    <div class="panel"><h3>Account</h3>
      <div class="setting-row"><div><strong>${esc(u.name)}</strong><div class="muted">${esc(u.email)} · ${u.role === 'seeker' ? 'Job Seeker' : 'Employer / Recruiter'}</div></div>
        <button class="secondary" type="button" onclick="go('profile')">${u.role === 'seeker' ? 'Edit profile' : 'Edit company profile'}</button></div></div>
    <div class="panel"><h3>Change password</h3>
      <form id="passwordForm" class="formgrid">
        <label class="full">Current password<input class="field" id="curPw" type="password" autocomplete="current-password" required></label>
        <label>New password (min. 6 characters)<input class="field" id="newPw" type="password" minlength="6" autocomplete="new-password" required></label>
        <label>Confirm new password<input class="field" id="newPw2" type="password" minlength="6" autocomplete="new-password" required></label>
        <div class="full form-actions"><button class="primary" type="submit">Update password</button></div>
      </form></div>`;
}
function bindSettings() {
  const sel = $('#themeSelect'); sel.value = currentTheme();
  sel.onchange = () => applyTheme(sel.value);
  $('#passwordForm').onsubmit = e => {
    e.preventDefault();
    const u = user(), cur = $('#curPw').value, np = $('#newPw').value, np2 = $('#newPw2').value;
    if (u.password !== cur) return toast('Current password is incorrect.', 'err');
    if (np.length < 6) return toast('New password must be at least 6 characters.', 'err');
    if (np !== np2) return toast('New passwords do not match.', 'err');
    if (np === cur) return toast('New password must be different from the current one.', 'err');
    const prev = u.password; u.password = np;
    if (!save()) { u.password = prev; return toast('Unable to save. Storage may be full.', 'err'); }
    e.target.reset(); toast('Password updated.');
  };
}

/* ---------- About us ---------- */
function about() {
  return `${pageHeader('About ProLink', 'Connecting people with the work that fits them.')}
    <div class="panel about-hero"><p>ProLink is a job-matching platform that brings job seekers and employers together in one simple place. Seekers can discover openings, apply in minutes and track every application. Employers can post positions, review candidates and move hiring forward.</p></div>
    <div class="about-grid">
      <div class="panel"><div class="about-icon" aria-hidden="true">🎯</div><h3>Our Mission</h3>
        <p>To make finding work and finding talent simple, fair and accessible, giving every job seeker a clear path to opportunity and giving employers a fast, trustworthy way to meet the right people.</p></div>
      <div class="panel"><div class="about-icon" aria-hidden="true">🔭</div><h3>Our Vision</h3>
        <p>A Philippines where everyone can find meaningful work that fits their skills and goals, and where every business, big or small, can grow with the right team.</p></div>
    </div>
    <div class="panel"><h3>What we value</h3>
      <div class="values">
        <div><strong>Accessibility</strong><p>Opportunities should be easy to find, whatever your location or background.</p></div>
        <div><strong>Transparency</strong><p>Clear job details, clear requirements and clear application status.</p></div>
        <div><strong>Opportunity</strong><p>Helping people grow their careers and helping teams find the talent they need.</p></div>
      </div></div>`;
}

/* ---------- Animated login background ---------- */
(function () {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BOX = new Path2D('M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z');
  const HANDLE = new Path2D('M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2');
  const LINK_DIST = 190, MOUSE_R = 170;
  let w = 0, h = 0, dpr = 1, nodes = [], mouse = { x: -999, y: -999 };

  function drawLogo(n) {
    const s = n.size, a = n.alpha;
    ctx.save();
    ctx.translate(n.x, n.y); ctx.rotate(n.rot);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.26); else ctx.rect(-s / 2, -s / 2, s, s);
    ctx.fillStyle = `rgba(255,255,255,${a * 0.45})`;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(255,255,255,${a * 1.4})`;
    ctx.stroke();
    const k = (s * 0.56) / 24;
    ctx.scale(k, k); ctx.translate(-12, -12);
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, a * 2.4)})`;
    ctx.stroke(BOX); ctx.stroke(HANDLE);
    ctx.restore();
  }

  function init() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.max(12, Math.min(34, Math.floor(w * h / 42000)));
    nodes = Array.from({ length: count }, () => {
      const z = 0.35 + Math.random() * 0.65;           // depth: 1 = closest
      const ang = Math.random() * Math.PI * 2, sp = 0.15 + z * 0.45;
      return {
        x: Math.random() * w, y: Math.random() * h, z,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        size: 22 + z * 34, alpha: 0.10 + z * 0.22,
        rot: Math.random() * 0.6 - 0.3, vr: (Math.random() - 0.5) * 0.004
      };
    }).sort((a, b) => a.z - b.z);                       // far ones drawn first
  }

  function frame() {
    if (!$('#auth').classList.contains('hidden')) {     // pause when logged in
      if (canvas.clientWidth !== w || canvas.clientHeight !== h) init();
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK_DIST) {
            const t = 1 - d / LINK_DIST;
            ctx.strokeStyle = `rgba(186,230,253,${t * 0.35 * Math.min(a.z, b.z)})`;
            ctx.lineWidth = 0.6 + t * 1.2;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        const dx = n.x - mouse.x, dy = n.y - mouse.y, d = Math.hypot(dx, dy);
        if (d < MOUSE_R && d > 0) {                      // gently push away from cursor
          const f = (1 - d / MOUSE_R) * 0.6;
          n.x += (dx / d) * f * 3; n.y += (dy / d) * f * 3;
        }
        n.x += n.vx; n.y += n.vy; n.rot += n.vr;
        const m = n.size;                                // wrap around edges
        if (n.x < -m) n.x = w + m; else if (n.x > w + m) n.x = -m;
        if (n.y < -m) n.y = h + m; else if (n.y > h + m) n.y = -m;
        drawLogo(n);
      }
    }
    if (!reduce) requestAnimationFrame(frame);
  }

  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  document.addEventListener('mouseleave', () => { mouse.x = mouse.y = -999; });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { init(); if (reduce) frame(); }, 150); });

  init(); frame();
})();


/* ---------- Animated app (dashboard) background ---------- */
(function () {
  const canvas = document.getElementById('appBgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BOX = new Path2D('M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z');
  const HANDLE = new Path2D('M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2');
  const LINK_DIST = 200, MOUSE_R = 150;
  let w = 0, h = 0, dpr = 1, nodes = [], mouse = { x: -999, y: -999 };
  const tone = () => currentTheme() === 'dark' ? ['165,180,252', 1.5] : ['79,70,229', 1];   // [rgb, strength]

  function drawLogo(n, rgb, k) {
    const s = n.size, a = n.alpha * k;
    ctx.save();
    ctx.translate(n.x, n.y); ctx.rotate(n.rot);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.26); else ctx.rect(-s / 2, -s / 2, s, s);
    ctx.fillStyle = `rgba(${rgb},${a * 0.45})`; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(${rgb},${a * 1.3})`; ctx.stroke();
    const sc = (s * 0.56) / 24;
    ctx.scale(sc, sc); ctx.translate(-12, -12);
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(${rgb},${Math.min(1, a * 2.2)})`;
    ctx.stroke(BOX); ctx.stroke(HANDLE);
    ctx.restore();
  }

  function init() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.max(10, Math.min(26, Math.floor(w * h / 60000)));
    nodes = Array.from({ length: count }, () => {
      const z = 0.35 + Math.random() * 0.65, ang = Math.random() * Math.PI * 2, sp = 0.12 + z * 0.35;
      return { x: Math.random() * w, y: Math.random() * h, z, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        size: 24 + z * 32, alpha: 0.06 + z * 0.10, rot: Math.random() * 0.6 - 0.3, vr: (Math.random() - 0.5) * 0.003 };
    }).sort((a, b) => a.z - b.z);
  }

  function frame() {
    if (!$('#app').classList.contains('hidden')) {      // only runs while logged in
      if (canvas.clientWidth !== w || canvas.clientHeight !== h) init();
      const [rgb, k] = tone();
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK_DIST) {
            const t = 1 - d / LINK_DIST;
            ctx.strokeStyle = `rgba(${rgb},${t * 0.16 * k * Math.min(a.z, b.z)})`;
            ctx.lineWidth = 0.6 + t;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        if (!reduce) {
          const dx = n.x - mouse.x, dy = n.y - mouse.y, d = Math.hypot(dx, dy);
          if (d < MOUSE_R && d > 0) { const f = (1 - d / MOUSE_R) * 0.6; n.x += (dx / d) * f * 3; n.y += (dy / d) * f * 3; }
          n.x += n.vx; n.y += n.vy; n.rot += n.vr;
          const m = n.size;
          if (n.x < -m) n.x = w + m; else if (n.x > w + m) n.x = -m;
          if (n.y < -m) n.y = h + m; else if (n.y > h + m) n.y = -m;
        }
        drawLogo(n, rgb, k);
      }
    }
    requestAnimationFrame(frame);
  }

  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  document.addEventListener('mouseleave', () => { mouse.x = mouse.y = -999; });
  init(); frame();
})();
