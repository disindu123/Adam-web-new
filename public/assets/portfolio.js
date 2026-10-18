import { api, element } from './api.js';

const $ = id => document.getElementById(id);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = $('matrix');
const ctx = canvas.getContext('2d');
let columns = [], width, height, lastFrame = 0;
const chars = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ<>[]{}#$';
function resize() {
  width = canvas.width = innerWidth;
  height = canvas.height = innerHeight;
  columns = Array.from({ length: Math.ceil(width / 15) }, () => -Math.random() * 60);
}
resize();
window.addEventListener('resize', resize);
function draw(time) {
  if (document.visibilityState === 'visible' && time - lastFrame > 48) {
    ctx.fillStyle = 'rgba(0,0,0,.07)'; ctx.fillRect(0, 0, width, height);
    ctx.font = '15px monospace'; ctx.fillStyle = '#00ff9c';
    columns.forEach((value, i) => {
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 15, value * 15);
      columns[i] = value * 15 > height && Math.random() > .975 ? 0 : value + 1;
    });
    lastFrame = time;
  }
  requestAnimationFrame(draw);
}
if (ctx && !reducedMotion) requestAnimationFrame(draw);

const dot = $('cursorDot'), ring = $('cursorRing');
if (!reducedMotion && matchMedia('(pointer:fine)').matches) {
  let x = 0, y = 0, rx = 0, ry = 0;
  document.addEventListener('mousemove', e => { x = e.clientX; y = e.clientY; dot.style.left = `${x}px`; dot.style.top = `${y}px`; });
  document.addEventListener('mouseover', e => ring.classList.toggle('hover', Boolean(e.target.closest('a,button,input,textarea'))));
  function cursor() { rx += (x - rx) * .15; ry += (y - ry) * .15; ring.style.left = `${rx}px`; ring.style.top = `${ry}px`; requestAnimationFrame(cursor); }
  cursor();
}
function flash() { if (reducedMotion) return; $('flashGreen').classList.add('active'); setTimeout(() => $('flashGreen').classList.remove('active'), 120); }

const reveals = new IntersectionObserver(entries => entries.forEach(({ target, isIntersecting }) => {
  if (!isIntersecting) return;
  target.classList.add('active');
  target.querySelectorAll('.skill-bar-fill').forEach(bar => { bar.style.width = `${bar.dataset.width}%`; });
  reveals.unobserve(target);
}), { threshold: .08 });
document.querySelectorAll('.reveal').forEach(node => reveals.observe(node));
const navObserver = new IntersectionObserver(entries => entries.forEach(entry => {
  if (!entry.isIntersecting) return;
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.toggle('active', a.hash === `#${entry.target.id}`));
}), { threshold: .35 });
document.querySelectorAll('section').forEach(section => navObserver.observe(section));
function closeMenu() { $('hamburger').classList.remove('open'); $('mobileNav').classList.remove('open'); $('hamburger').setAttribute('aria-expanded', 'false'); }
$('hamburger').addEventListener('click', () => { const open = $('hamburger').getAttribute('aria-expanded') !== 'true'; $('hamburger').classList.toggle('open', open); $('mobileNav').classList.toggle('open', open); $('hamburger').setAttribute('aria-expanded', String(open)); });
document.querySelectorAll('.nav-mobile a').forEach(a => a.addEventListener('click', closeMenu));
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); $('ftWindow').classList.remove('open'); } });
document.querySelectorAll('.hero-stat-num').forEach(node => {
  const target = Number(node.dataset.count), start = performance.now();
  function count(now) { const progress = reducedMotion ? 1 : Math.min(1, (now - start) / 1400); node.textContent = `${Math.round(target * progress)}${target === 99 ? '%' : '+'}`; if (progress < 1) requestAnimationFrame(count); }
  requestAnimationFrame(count);
});

let projects = [], currentFilter = 'all';
const categories = { web: 'Web App', security: 'Security', tool: 'Tool' };
function projectCard(project) {
  const card = element('article', 'project-card reveal active'); card.dataset.cat = project.category;
  const thumb = element('div', 'project-thumb');
  const img = document.createElement('img'); img.src = project.imageUrl || '/assets/project-fallback.svg'; img.alt = project.title; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => { img.src = '/assets/project-fallback.svg'; }, { once: true });
  thumb.append(img, element('div', 'project-thumb-overlay'), element('div', 'project-thumb-tag', `${project.featured ? 'Featured · ' : ''}${categories[project.category]}`));
  const body = element('div', 'project-body'), tech = element('div', 'project-tech'), links = element('div', 'project-links');
  project.technologies.forEach(item => tech.append(element('span', '', item)));
  for (const [label, url] of [['Live ↗', project.liveUrl], ['Code ↗', project.codeUrl]]) {
    if (!url) continue;
    const a = element('a', 'project-link', label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a);
  }
  body.append(element('h3', 'project-title', project.title), element('p', 'project-desc', project.description), tech, links);
  card.append(thumb, body);
  card.hidden = currentFilter !== 'all' && project.category !== currentFilter;
  return card;
}
function renderProjects() {
  const grid = $('projectsGrid'); grid.replaceChildren();
  projects.forEach(project => grid.append(projectCard(project)));
  if (!projects.some(p => currentFilter === 'all' || p.category === currentFilter)) grid.append(element('p', 'projects-empty', projects.length ? 'No projects in this category yet.' : 'New projects are on the way. Check back soon.'));
}
async function loadProjects() {
  try {
    const preview = new URLSearchParams(location.search).get('preview') === '1' ? '?preview=1' : '';
    projects = (await api(`/api/projects${preview}`)).projects;
    renderProjects();
  } catch (error) {
    if (error.status === 503) return location.reload();
    const grid = $('projectsGrid'), state = element('div', 'projects-empty', 'Projects could not be loaded. '), retry = element('button', 'filter-btn', 'Retry');
    retry.type = 'button'; retry.addEventListener('click', loadProjects); state.append(retry); grid.replaceChildren(state);
  }
}
document.querySelectorAll('.filter-btn').forEach(button => button.addEventListener('click', () => {
  currentFilter = button.dataset.filter;
  document.querySelectorAll('.filter-btn').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  renderProjects();
}));
loadProjects();

async function loadSocialLinks() {
  try {
    const preview = new URLSearchParams(location.search).get('preview') === '1' ? '?preview=1' : '';
    const { links } = await api(`/api/social-links${preview}`);
    document.querySelectorAll('[data-social]').forEach(anchor => {
      let url;
      try {
        const candidate = new URL(links[anchor.dataset.social]);
        if (candidate.protocol === 'https:' && !candidate.username && !candidate.password) url = candidate.href;
      } catch { /* An empty or invalid profile link keeps its icon hidden. */ }
      if (url) {
        anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.hidden = false;
        anchor.removeAttribute('aria-disabled'); anchor.removeAttribute('tabindex');
      } else {
        anchor.removeAttribute('href'); anchor.removeAttribute('target'); anchor.removeAttribute('rel');
        anchor.setAttribute('aria-disabled', 'true'); anchor.tabIndex = -1; anchor.hidden = true;
      }
    });
    const socialRow = document.querySelector('.contact-socials');
    socialRow.hidden = !Array.from(socialRow.querySelectorAll('[data-social]')).some(anchor => !anchor.hidden);
  } catch (error) { if (error.status === 503) location.reload(); }
}
loadSocialLinks();

$('contactForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, status = $('formMsg'), button = form.querySelector('button[type=submit]');
  if (button.disabled || !form.reportValidity()) return;
  const body = { name: $('cName').value.trim(), email: $('cEmail').value.trim(), subject: $('cSubject').value.trim(), message: $('cMsg').value.trim(), website: $('cWebsite').value };
  button.disabled = true; button.textContent = 'TRANSMITTING...'; status.className = 'form-msg'; status.textContent = '';
  try {
    const result = await api('/api/messages', { method: 'POST', body });
    status.textContent = `// ${result.message}`; status.className = 'form-msg ok'; form.reset(); flash();
  } catch (error) { status.textContent = `// ${error.message}`; status.className = 'form-msg err'; }
  finally { button.disabled = false; button.textContent = 'SEND MESSAGE'; }
});

const terminalBody = $('ftBody');
function output(text, className = 'out-text') { terminalBody.append(element('div', className, text)); terminalBody.scrollTop = terminalBody.scrollHeight; }
const commands = {
  help: () => output('about · skills · projects · contact · uptime · whoami · clear · matrix · exit'),
  about: () => output('Full-stack developer & cybersecurity enthusiast. Building secure systems and immersive digital experiences.'),
  skills: () => output('Frontend: React, Next.js, TypeScript, Three.js\nBackend: Node.js, Python, Go\nSecurity & DevOps: OWASP, Docker, K8s, CI/CD'),
  projects: () => output(projects.length ? projects.map((p, i) => `[${i + 1}] ${p.title} — ${p.description}`).join('\n') : 'Projects are loading. Explore the projects section for the latest work.'),
  contact: () => output('Email: darkadam@proton.me\nWeb: adamx.com\nGitHub: github.com/disindu123'),
  whoami: () => output('visitor@dark_adam:~$'),
  uptime: () => output(`Session uptime: ${Math.floor(performance.now() / 60000)}m ${Math.floor(performance.now() / 1000) % 60}s`),
  clear: () => terminalBody.replaceChildren(),
  matrix: () => { canvas.style.opacity = canvas.style.opacity === '0.18' ? '0.12' : '0.18'; output('Matrix brightness toggled.'); },
  exit: () => $('ftWindow').classList.remove('open')
};
terminalBody.style.whiteSpace = 'pre-wrap';
$('ftBtn').addEventListener('click', () => { $('ftWindow').classList.toggle('open'); if ($('ftWindow').classList.contains('open')) $('ftInput').focus(); });
$('ftClose').addEventListener('click', () => $('ftWindow').classList.remove('open'));
$('ftInput').addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  const command = event.currentTarget.value.trim().toLowerCase().slice(0, 200);
  if (!command) return;
  output(`$ ${command}`, 'out-cmd');
  if (Object.hasOwn(commands, command)) commands[command](); else output(`Command not found: ${command}. Type help for commands.`, 'out-err');
  event.currentTarget.value = '';
});
setInterval(async () => {
  if (document.visibilityState !== 'visible') return;
  try {
    if (!(await api('/api/site-status')).maintenanceEnabled) return;
    if (new URLSearchParams(location.search).get('preview') === '1') {
      try { await api('/api/projects?preview=1'); return; }
      catch (error) { if (error.status !== 503) return; }
    }
    location.reload();
  } catch { /* Keep the current page usable during a network interruption. */ }
}, 30000);

