// Independent project-space controller for Universe 2; shared dated data/team helpers are read-only.

import { loadBetween } from './between-data.js?v=20261018-compact-status';
import { createProjectReplay, projectProgressMarkup } from './project-replay.js?v=20261017-en2';
import { MIN_ZOOM, MAX_ZOOM, scaleZoom, wheelZoom } from './world-zoom.js';
import { createProjectTeams, projectTeamMarkup } from './project-team.js?v=20261017-en2';
import * as THREE from '../vendor/three.module.js';
import { createProjectSpaceScene } from './universe2-project-scene.js?v=20261017-en2';
import { relationshipGraph } from './fusion-relations.js';
import { fullDate, plural } from '../i18n.js';


const D = await loadBetween(undefined, { allProjects: true });
const entry = new URLSearchParams(location.search);
function exitProjectSpace() {
  if (parent !== window) parent.postMessage({ type: 'between-universe2-project-close' }, location.origin);else
  location.href = '../universe2.html?scenario=' + encodeURIComponent(entry.get('scenario') || 'architect');
}
document.querySelector('.me .av').textContent = D.persona.name.split(' ').map((s) => s[0]).join('').slice(0, 2);
// header, identity and time-strip labels come from the scenario
document.getElementById('scnChip').textContent = 'Fictional archive · ' + D.persona.title;document.getElementById('meName').textContent = D.persona.name;document.getElementById('meRole').textContent = [D.persona.role, D.persona.org].filter(Boolean).join(' · ');
document.getElementById('periodLbl').textContent = D.C.period_label || '';document.getElementById('monthsRow').innerHTML = D.markers.map((m) => `<span>${m.text}</span>`).join('');
// same data for every style: fill the static bits of the page from it
{const f = document.querySelector('.focus');if (f && D.focusText) {f.querySelector('b').textContent = D.focusText.name;const m = f.querySelector('.meta');if (m) m.textContent = D.focusText.line;}const t = document.getElementById('toast');if (t && D.toast) t.innerHTML = (t.querySelector('.live') ? '<span class="live"></span>' : '') + `<span>${D.toast}</span>`;}
(function () {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------------- data (project cast) ----------------
  const PROJ = D.PROJ,P = D.P;
  const teams = createProjectTeams(D);
  const projectReplay = createProjectReplay(D);
  let overviewDay = null,timelineKey = null,resumePlayback = false;
  const timelineScope = () => focusedProject ? projectReplay.scope(focusedProject) : null;
  let focusedProject = null;
  const focusedTeam = () => focusedProject ? teams.team(PROJ[focusedProject].id, day) : null;
  const LEAVE = D.LEAVE;
  const byId = Object.fromEntries(P.map((p) => [p.id, p]));
  const entryDay = D.W.snapshots.findIndex((s) => s.date === entry.get('date'));
  let projectContext = null,personLens,lensKey = '',day = entryDay < 0 ? D.days : entryDay + 1;
  function lensFor(id) {
    if (focusedProject) return personLens = PROJ[focusedProject].id;
    const key = [id, day, projectContext].join(':');
    if (key !== lensKey) {personLens = D.defaultProject(id, projectContext, day);lensKey = key;}
    return personLens;
  }
  function projectTabs(id) {
    const current = lensFor(id);
    return `<div class="lens" aria-label="Project lens for this person">${[...D.sharedProjects(id, day), null].map((pid) => `<button data-lens="${pid || ''}" aria-pressed="${pid === current}" class="${pid === current ? 'on' : ''}" ${pid === current ? 'style="background:var(--mall);color:var(--space,#111)"' : ''}>${pid ? D.C.projects?.[pid]?.short || pid : 'All'}</button>`).join('')}</div>`;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function blk(t, n, inner) {return `<section class="blk"><h3>${t}${n ? `<span class="n">${n}</span>` : ''}</h3>${inner}</section>`;}
  function renderCard(id, focusLabel) {
    const c = $('card');
    c.scrollTop = 0;
    if (!id) {renderOverview();return;}
    if (id && PROJ[id]) {const p = D.projectAt(id, day) || PROJ[id];const team = teams.team(p.id, day);
      c.innerHTML = `<div class="c-top"><span>PROJECT</span><button id="back">← Overview</button></div><div class="who"><div class="orb" style="background:${p.css}">◐</div><div><b>${p.name}</b><span>${p.status}</span></div></div>
    ${blk('Known phases', '', `<div class="bar">${p.steps.slice(0, p.now + 1).map((s, i) => `<i style="width:${100 / (p.now + 1)}%;background:${i < p.now ? p.css : 'var(--sun)'};margin-right:2px"></i>`).join('')}</div><div class="meta">${p.steps.slice(0, p.now + 1).map((s, i) => i === p.now ? `<b style="color:var(--ink)">${esc(s)}</b>` : esc(s)).join(' · ')}</div>`)}
    ${blk('Latest known work', `${fullDate(dateOf(day))}`, projectProgressMarkup(projectReplay.scope(id)?.recordsAt(day) || []))}
    ${blk('People on this project', `${plural(team.members.filter((x) => !x.ai).length, 'person', 'people')}${team.members.some((x) => x.ai) ? ' · ' + team.members.filter((x) => x.ai).length + ' AI' : ''}`, projectTeamMarkup(team))}
    ${blk('Now', '', `<div class="line">${p.status}${p.steps[p.now] ? ' · current phase: ' + p.steps[p.now] : ''}</div>`)}`;
    } else {
      const p = byId[id || D.focusPerson];const col = `var(--${p.cat})`;
      lensFor(p.id);
      const lens = focusedProject ? `<div class="badge">${esc(PROJ[focusedProject].name)} · work on this project</div>` : projectTabs(p.id);
      const body = D.card(p.id, personLens, day, { compactLedger: true });
      c.innerHTML = `<div class="c-top"><span>${focusLabel || (p.cat === 'ai' ? 'AI ASSISTANT' : '')}</span><button id="back">← Overview</button></div>
    <div class="who"><div class="orb" style="background:${col}">${p.n.split(' ').map((s) => s[0]).join('').slice(0, 2)}</div><div><b>${p.n}</b><span>${p.role}</span></div></div>
    <div class="badges"><span class="badge rel" style="background:${col}">${p.rel}</span><span class="badge">${plural(D.sharedRecords(p.id, day, personLens).length, 'project exchange')} so far</span></div>
    ${lens}${body}<details><summary>Shared work · original sources</summary>${projectProgressMarkup(D.sharedRecords(p.id, day, personLens).sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at)))}</details>${focusedProject ? blk('Switch to another team member', '', projectTeamMarkup(focusedTeam())) : ''}`;
    }
    c.querySelectorAll('[data-lens]').forEach((b) => b.onclick = () => {personLens = b.dataset.lens || null;renderCard(id);});
    $('back').textContent = focusedProject && !PROJ[id] ? '← Project team' : '← Project sky';
    $('back').onclick = () => select(focusedProject && !PROJ[id] ? focusedProject : null);
    c.querySelectorAll('[data-pick]').forEach((b) => {b.setAttribute('aria-current', String(b.dataset.pick === id));b.onclick = () => select(b.dataset.pick);});
    const pass = $('passBtn');
    if (pass) {
      const draft = $('draft'),closedLabel = pass.textContent;
      pass.setAttribute('aria-expanded', 'false');pass.setAttribute('aria-controls', 'draft');
      pass.onclick = () => {
        const expanded = pass.getAttribute('aria-expanded') !== 'true';
        draft.replaceChildren();
        if (expanded) {
          const d = D.draft(id || D.focusPerson, personLens, day),body = document.createElement('div'),heading = document.createElement('small');
          body.className = 'draft';heading.textContent = `Draft · to ${d.to} · ${d.channel} (never sent automatically)`;
          body.append(heading, document.createTextNode(d.text));draft.append(body);
        }
        pass.setAttribute('aria-expanded', String(expanded));pass.textContent = expanded ? 'Hide draft' : closedLabel;
      };
    }
  }

  function renderOverview() {
    const projects = Object.entries(PROJ).map(([k]) => [k, D.projectAt(k, day)]).filter(([, p]) => p && (fullHistory || p.active));
    const closest = P.filter((p) => visibleAt(p)).sort((a, b) => (graph.scores[b.id] || 0) - (graph.scores[a.id] || 0)).slice(0, 4);
    const snapshot = D.W.snapshots[day - 1];
    $('card').innerHTML = `<div class="c-top"><span>${deskMode ? 'ON MY DESK' : 'YOUR WORK, CONNECTED'}</span><span class="status-dot">Local archive</span></div>
    <div class="overview-intro"><h2>${deskMode ? 'Where do you start today?' : 'From one person to a shared piece of work'}</h2><p>Click a person to look back at shared work.<br>Click a project to gather its team around the model.</p></div>
    ${deskMode ? blk('My action items', String(snapshot.desk.my_open_tasks.length), snapshot.desk.my_open_tasks.slice(0, 3).map((t) => `<div class="line">${esc(t.title)}<em>${t.due_date ? 'due ' + esc(fullDate(t.due_date)) : ''}</em></div>`).join('') || '<div class="meta">No known action items at this date</div>') : ''}
    <div class="overview-section"><div class="lbl-s">${fullHistory ? 'All projects so far' : 'Projects under way'}<span>${projects.length}</span></div><div class="project-cards">${projects.map(([k, p]) => `<button data-p="${k}" class="project-card" style="--project-color:${p.css}"><span class="project-glyph" aria-hidden="true">◇</span><span><b>${esc(p.short)}</b><small>${esc(p.status)}${p.steps[p.now] ? ' · ' + esc(p.steps[p.now]) : ''}</small></span><i>↗</i></button>`).join('') || '<p class="meta">Projects appear as their work becomes known.</p>'}</div></div>
    <div class="overview-section"><div class="lbl-s">People around me now<span>by known exchanges</span></div><div class="nearby">${closest.map((p) => `<button data-pick="${p.id}"><span class="mini-avatar ${p.cat}">${esc(p.n.split(' ').map((n) => n[0]).join('').slice(0, 2))}</span><span><b>${esc(p.n)}</b><small>${esc(p.rel || p.role)}</small></span><span class="contact-count">${graph.counts[p.id] || 0}</span></button>`).join('') || '<p class="meta">No known contacts yet.</p>'}</div></div>
    <div class="archive-note">Original simulated archive · relationships and work come from hand-made labels, not yet from automatic AI extraction.</div>`;
    $('card').querySelectorAll('[data-p]').forEach((b) => b.onclick = () => select(b.dataset.p));
    $('card').querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => select(b.dataset.pick));
  }
  function renderSearch() {
    if (!$('peopleDialog').open) return;
    const query = $('peopleSearch').value.trim().toLowerCase();
    const matches = P.filter((p) => visibleAt(p) && [p.n, p.role, p.rel, teams.organisation(p.org).name].join(' ').toLowerCase().includes(query)).sort((a, b) => Number(b.n.toLowerCase().includes(query)) - Number(a.n.toLowerCase().includes(query)));
    $('peopleResults').innerHTML = matches.map((p) => `<button data-person="${p.id}"><b>${esc(p.n)}</b><small>${esc(p.role)} · ${esc(teams.organisation(p.org).name)}</small></button>`).join('') || '<p>No known person matches on this date.</p>';
    $('peopleResults').querySelectorAll('button').forEach((b) => b.onclick = () => {$('peopleDialog').close();select(b.dataset.person);});
  }

  // ---------------- shared 3D helpers ----------------
  const canvas = $('sky');let R;
  try {R = new THREE.WebGLRenderer({ canvas, antialias: true });} catch (e) {$('toast').textContent = '3D display is not supported on this device; you can still browse the work from the project list or the people search.';}
  if (R) {R.setPixelRatio(Math.min(devicePixelRatio, 2));R.shadowMap.enabled = true;R.shadowMap.type = THREE.PCFSoftShadowMap;}
  const cam = new THREE.PerspectiveCamera(45, 1, .1, 2000);
  let selected = null,hover = null,theta = .25,zoom = 1,dist = 30,look = V(0, 0, 0),world = null,T = 0,playing = null;
  let fullHistory = false,deskMode = false,showLinks = true,showNames = false,overviewOpen = false,graph = relationshipGraph(D, day);
  const labelsEl = $('labels');let labels = [];
  const visibleAt = (p) => p && day >= p.first && (!focusedProject || focusedTeam().ids.has(p.id));
  const projVisible = (k) => focusedProject ? k === focusedProject && !!D.projectAt(k, day) : D.projectVisible(k, day, fullHistory);
  function addLabel(text, cls, pick, getPos, show) {
    const d = document.createElement('button');d.className = 'lbl ' + cls;d.textContent = text;
    if (byId[pick]) d.style.borderColor = teams.organisation(byId[pick].org).color;
    d.dataset.pick = pick || '';d.onclick = () => select(pick || focusedProject);d.onpointerenter = () => {hover = pick;};d.onpointerleave = () => {hover = null;};
    labelsEl.append(d);labels.push({ d, pick, getPos, show });
  }
  const SCENE_TITLE = 'My work universe';
  function setHeading() {
    $('wKey').textContent = focusedProject ? 'PROJECT' : deskMode ? 'MY DESK' : 'BETWEEN · FUSION';
    $('wTitle').textContent = focusedProject ? PROJ[focusedProject].name : deskMode ? 'Start from my desk' : SCENE_TITLE;
    $('wMeta').hidden = !!focusedProject;
    $('wMeta').textContent = focusedProject ? '' : deskMode ? 'Look back at the work on the selected date, then follow people and projects outwards.' : 'My desk is the origin; people form the relationships, and projects leave the shape of shared work.';
  }
  function renderProjects() {
    const known = Object.entries(PROJ).map(([k]) => [k, D.projectAt(k, day)]).filter(([, p]) => p);
    const item = ([k, p]) => `<button data-p="${k}" aria-current="${k === focusedProject}"><i class="dot" style="background:${p.css}"></i><div><b>${p.name}</b><small>${p.status}</small></div></button>`;
    const ended = known.filter(([, p]) => !p.active),open = $('projList').querySelector('details')?.open;
    $('projList').innerHTML = fullHistory ? known.map(item).join('') : known.filter(([, p]) => p.active).map(item).join('') + (ended.length ? `<details ${open ? 'open' : ''}><summary>Finished / paused projects · ${ended.length}</summary>${ended.map(item).join('')}</details>` : '');
    $('projList').querySelectorAll('button').forEach((b) => b.onclick = () => select(b.dataset.p));
  }


  function select(id) {
    if (!id) {stopReplay();exitProjectSpace();return;}
    const previous = focusedProject;
    if (id) deskMode = false;
    document.querySelectorAll('.views button').forEach((b) => b.classList.toggle('on', b.id === (deskMode ? 'dvDesk' : 'dvNet')));
    if (PROJ[id]) {
      if (!focusedProject) overviewDay = day;
      projectContext = PROJ[id].id;focusedProject = id;setZoom(1);theta = 0;
      if (parent !== window) parent.postMessage({ type: 'between-universe2-project-selected', projectId: projectContext }, location.origin);
    } else if (!id || focusedProject && !focusedTeam().ids.has(id)) {
      projectContext = null;focusedProject = null;setZoom(1);
      if (overviewDay !== null) {day = overviewDay;overviewDay = null;}
    }
    if (previous !== focusedProject) stopReplay();
    const scope = timelineScope();if (scope) day = Math.max(scope.start, Math.min(scope.end, day));
    lensKey = '';selected = id;
    updateTimeline();
  }

  const dateOf = D.dateOf;
  function playLabel() {return resumePlayback ? '▶ Resume replay' : focusedProject ? '▶ Replay: the whole project' : '▶ Replay: watch the world grow';}
  function stopReplay(resume = false) {if (playing) clearInterval(playing);playing = null;resumePlayback = resume;$('play').textContent = playLabel();}
  function renderTimelineScope() {
    const scope = timelineScope(),key = focusedProject || 'overview';
    if (timelineKey !== key) {
      timelineKey = key;
      const activity = scope?.activity || D.activity,top = Math.max(1, ...activity),start = scope?.start || 1;
      $('bars').innerHTML = activity.map((n, i) => `<i title="${fullDate(dateOf(start + i))} · ${n} ${scope ? 'known project ' : ''}${n === 1 ? 'record' : 'records'}" style="height:${Math.max(2, Math.round(2 + n / top * 17))}px"></i>`).join('');
      $('monthsRow').innerHTML = (scope?.markers || D.markers).map((m) => `<span>${m.text}</span>`).join('');
    }
    $('historyDay').min = scope?.start || 1;$('historyDay').max = scope?.end || D.days;
    $('historyDay').setAttribute('aria-label', scope ? 'Date in the project history' : 'Date in the work history');
    $('tScope').hidden = !scope;$('tScope').textContent = scope ? scope.name + ' · project review' : '';
    $('allWork').textContent = '← Project sky';
    $('allWork').hidden = !scope;$('fullHistory').closest('label').hidden = !!scope;
    $('tHome').hidden = !scope;
    $('tReset').title = scope ? 'Reset the project view' : 'Reset the overview';
    $('play').textContent = playing ? 'Ⅱ Pause' : playLabel();
  }
  $('allWork').onclick = () => select(null);
  $('fullHistory').onchange = (e) => {fullHistory = e.target.checked;select(null);};
  $('historyDay').oninput = (e) => {day = Number(e.target.value);stopReplay(day < (timelineScope()?.end || D.days));updateTimeline();};
  function updateTimeline() {
    document.querySelector('.body').classList.toggle('has-detail', !!selected || deskMode || overviewOpen);
    $('card').hidden = !selected && !deskMode && !overviewOpen;
    $('overviewButton').setAttribute('aria-expanded', overviewOpen);
    graph = relationshipGraph(D, day);setHeading();renderSearch();
    const scope = timelineScope(),snapshot = D.W.snapshots[day - 1],focus = document.querySelector('.focus'),pid = snapshot.desk.focus_project_id;
    focus.querySelector('b').textContent = pid ? D.C.projects?.[pid]?.short || pid : 'No known project yet';
    focus.querySelector('.meta').textContent = day === D.days ? D.focusText?.line || '' : 'From the work records known on this date';
    $('sAI').textContent = P.filter((p) => p.cat === 'ai' && day >= p.first).length;
    const knownProject = focusedProject ? D.projectAt(focusedProject, day) : null;
    // The caption reports the dated state; phase labels describe a stage, not a confirmed outcome.
    $('toast').textContent = scope ? [scope.name, knownProject?.status].filter(Boolean).join(' · ') : fullHistory ? `${fullDate(dateOf(day))} · every known person and project so far, finished or paused ones included` : day === D.days ? 'Click a person to look back at shared work' : `${fullDate(dateOf(day))} · projects come and go as they stood on this day`;
    if (selected && !PROJ[selected] && !visibleAt(byId[selected])) {selected = focusedProject;lensKey = '';}
    renderTimelineScope();renderProjects();
    renderCard(selected);
    $('historyDay').value = day;$('tDate').textContent = fullDate(dateOf(day));
    const n = P.filter((p) => p.cat !== 'ai' && day >= p.first).length,pr = Object.keys(PROJ).filter((k) => D.projectVisible(k, day, fullHistory)).length;
    if (scope) {
      const members = focusedTeam().members,people = members.filter((p) => !p.ai).length,ai = members.filter((p) => p.ai).length;
      $('tSum').textContent = `Day ${day - scope.start + 1} of ${scope.end - scope.start + 1} · ${plural(people, 'person', 'people')} (me included)${ai ? ' · ' + ai + ' AI' : ''} · ${plural(scope.recordsAt(day).length, 'known record')}`;
    } else $('tSum').textContent = `Day ${day} of ${D.days} · ${plural(n, 'contact')} · ${plural(pr, fullHistory ? 'project so far' : 'project', fullHistory ? 'projects so far' : 'projects')}` + (LEAVE.includes(day - 1) ? ' · on leave' : '');
    $('sPeople').textContent = n;$('sProj').textContent = pr;
    for (const L of labels) if (PROJ[L.pick]) {const p = D.projectAt(L.pick, day);L.d.dataset.status = p?.status || '';}
    const offset = scope?.start || 1;[...$('bars').children].forEach((b, i) => {b.className = i + offset === day ? 'now' : i + offset < day ? 'past' : '';});
  }

  // ---------------- loop, camera, picking ----------------
  let last = performance.now(),dragging = null;const ray = new THREE.Raycaster(),ptr = new THREE.Vector2(),vv = new THREE.Vector3();
  function frame(now) {requestAnimationFrame(frame);const dt = Math.min(.05, (now - last) / 1000);last = now;if (!reduced) T += dt;if (!world) return;
    world.update(dt);
    const selPos = selected ? world.pos(selected) : null;const selVisible = selected && (PROJ[selected] ? projVisible(selected) : visibleAt(byId[selected]));
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);const e = world.extent();
    let target = V(0, world.lookY ? world.lookY * .4 : 0, 0),d = world.frameDist(e);
    if (selVisible && selPos) {target = selPos.clone().multiplyScalar(PROJ[selected] ? 1 : .65);d = PROJ[selected] ? 8 : Math.max(7.5, selPos.length() * .8 + 5);}
    const focusFrame = world.focusFrame?.();if (focusFrame) {target = focusFrame.target;d = focusFrame.distance;}
    d *= zoom * Math.max(1, 1.5 / aspect);const k = reduced ? 1 : 1 - Math.exp(-dt * 2.4);dist += (d - dist) * k;look.lerp(target, k);
    const elev = focusedProject ? .55 : deskMode ? .48 : world.elev;cam.position.set(look.x + Math.sin(theta) * dist * Math.cos(Math.asin(Math.min(.98, elev))), look.y + dist * elev + (world.lookY || 0) * .4, look.z + Math.cos(theta) * dist * Math.cos(Math.asin(Math.min(.98, elev))));cam.lookAt(look.x, look.y + (world.lookY || 0) * .35, look.z);
    R?.render(world.scene, cam);
    const w = canvas.clientWidth,h = canvas.clientHeight,occupied = [];
    const heading = document.querySelector('.world-head'),reserved = { x: heading.offsetLeft, y: heading.offsetTop, w: heading.querySelector('p').offsetWidth, h: heading.offsetHeight };
    // Keep the selected person and project labels readable before optional names.
    const ordered = [...labels].sort((a, b) => (b.pick === selected ? 10 : !b.pick ? 8 : PROJ[b.pick] ? 6 : 0) - (a.pick === selected ? 10 : !a.pick ? 8 : PROJ[a.pick] ? 6 : 0));
    for (const L of ordered) {
      if (!L.show()) {L.d.style.display = 'none';continue;}
      vv.copy(L.getPos()).project(cam);let x = (vv.x * .5 + .5) * w,y = (-vv.y * .5 + .5) * h;
      if (vv.z > 1 || x < 10 || x > w - 10 || y < 10 || y > h - 20) {L.d.style.display = 'none';continue;}
      L.d.style.display = '';const bw = L.d.offsetWidth,bh = L.d.offsetHeight;
      x = Math.max(bw / 2 + 8, Math.min(w - bw / 2 - 8, x));y = Math.max(bh * 1.4 + 8, y);
      const box = { x: x - bw / 2, y: y - bh * 1.4, w: bw, h: bh };
      if (box.x < reserved.x + reserved.w && box.x + box.w > reserved.x && box.y < reserved.y + reserved.h) {
        if (PROJ[L.pick]) {y = reserved.y + reserved.h + bh * 1.4 + 10;box.y = y - bh * 1.4;} else
        if (L.pick !== selected) {L.d.style.display = 'none';continue;}
      }
      const overlap = occupied.some((o) => box.x < o.x + o.w + 4 && box.x + box.w + 4 > o.x && box.y < o.y + o.h + 3 && box.y + box.h + 3 > o.y);
      if (overlap && L.pick !== selected && !(hover && L.pick === hover) && !showNames) {L.d.style.display = 'none';continue;}
      occupied.push(box);L.d.style.left = x + 'px';L.d.style.top = y + 'px';L.d.classList.toggle('sel', !!byId[L.pick] && L.pick === selected);
      L.d.setAttribute('aria-pressed', String(!!byId[L.pick] && L.pick === selected));
      if (byId[L.pick]) {const signal = world.signal(L.pick),n = signal?.requests.length || 0;L.d.title = byId[L.pick].n + ' · ' + (signal?.light?.label || 'Regular contact') + ' (all work)' + (n ? ' · ' + plural(n, 'request') + ' on this project waiting for me' : ' · no requests for me on this project') + ' · click to see shared work on this project';}
    }
  }
  function pickAt(e) {const r = canvas.getBoundingClientRect();ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);ray.setFromCamera(ptr, cam);const objs = world.pickables.filter((o) => {let p = o;while (p) {if (p.visible === false) return false;p = p.parent;}return true;});const hit = ray.intersectObjects(objs, false)[0];return hit ? hit.object.userData.pick : null;}
  const dragPlane = new THREE.Plane(),dragOffset = V(0, 0, 0),intersection = V(0, 0, 0);
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const id = pickAt(e),origin = world.dragStart(id);
    dragging = { x: e.clientX, y: e.clientY, th: theta, id, moved: false, person: !!origin };
    if (origin) {dragPlane.setFromNormalAndCoplanarPoint(cam.getWorldDirection(V()), origin);ray.ray.intersectPlane(dragPlane, intersection);dragOffset.copy(intersection).sub(origin);}
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) {
      if (Math.hypot(e.clientX - dragging.x, e.clientY - dragging.y) > 4) dragging.moved = true;
      if (dragging.person) {pickAt(e);if (ray.ray.intersectPlane(dragPlane, intersection)) world.dragTo(intersection.clone().sub(dragOffset));} else
      theta = dragging.th - (e.clientX - dragging.x) * .006;
    } else if (world) {hover = pickAt(e);canvas.style.cursor = hover ? 'pointer' : 'grab';}
  });
  function endDrag(e) {if (dragging && !dragging.moved && e.type === 'pointerup' && dragging.id) select(dragging.id);world.dragEnd();dragging = null;}
  canvas.addEventListener('pointerup', endDrag);canvas.addEventListener('pointercancel', endDrag);canvas.addEventListener('lostpointercapture', endDrag);
  // Labels and overlay buttons are siblings of the canvas: listen on their shared
  // scene container so scrolling over a label does not interrupt zoom or scroll the page.
  canvas.closest('main.world').addEventListener('wheel', (e) => {e.preventDefault();setZoom(wheelZoom(zoom, e.deltaY, e.deltaMode, canvas.clientHeight));}, { passive: false });
  canvas.addEventListener('keydown', (e) => {if (e.key === 'ArrowLeft') theta += .15;if (e.key === 'ArrowRight') theta -= .15;}); // Esc is handled once, on the document
  function setZoom(value) {
    zoom = value;
    $('zoomLevel').textContent = Math.round(100 / zoom) + '%';
    $('tIn').disabled = zoom <= MIN_ZOOM;$('tOut').disabled = zoom >= MAX_ZOOM;
  }
  $('tHome').onclick = () => select(null);
  $('tReset').onclick = () => {
    // Reselect the current scope: reset framing without exiting project replay.
    theta = focusedProject ? 0 : .25;
    select(focusedProject);
  };
  $('tIn').onclick = () => setZoom(scaleZoom(zoom, 1 / 1.2));
  $('tOut').onclick = () => setZoom(scaleZoom(zoom, 1.2));
  $('play').onclick = () => {
    if (playing) {stopReplay(true);return;}
    const scope = timelineScope(),start = scope?.start || 1,end = scope?.end || D.days;
    if (!resumePlayback || day >= end) day = start;
    resumePlayback = false;
    selected = focusedProject;projectContext = scope?.projectId || null;lensKey = '';setZoom(1);
    updateTimeline();
    if (day >= end) {stopReplay();return;}
    playing = setInterval(() => {
      day = Math.min(day + 1, end);updateTimeline();
      if (!scope) {
        const fresh = P.filter((p) => p.first === day);
        if (fresh.length) $('toast').textContent = 'New contact · ' + fresh.map((p) => p.n).join(', ');

      }
      if (day >= end) {
        stopReplay();
        if (!focusedProject) select(null);
      }
    }, Math.max(40, Math.round(17500 / (end - start + 1))));
    $('play').textContent = 'Ⅱ Pause';
  };
  function resize() {const w = canvas.clientWidth,h = canvas.clientHeight;R?.setSize(w, h, false);cam.aspect = w / Math.max(1, h);cam.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(canvas);resize();
  world = createProjectSpaceScene(D, teams, () => ({ day, focusedProject, selected, hover, T, fullHistory, deskMode, showLinks, showNames, graph }));
  world.labels.forEach(([t, c, p, g, s]) => addLabel(t, c, p, g, s));
  $('legend').innerHTML = '<span><b>Solid line</b>team inside the organisation</span><span><b>Dashed / dotted line</b>outside partners / approving bodies</span><span><b>Organisation colour</b>the same on platform, name and line</span><span><b>Glow above the head</b>the same ranking of all work as on the desk</span><span><b>Star / bright dot</b>top reminder / needs attention / new activity</span><span><b>Click a person</b>highlights their lines and opens the dots of shared work</span><p>Dots are coloured by feedback, task, decision, file and so on; handled dots fade. The glow sums up reminders across all work and follows the date; after a click, the dots and the right-hand panel show the current project only.</p>';
  $('showLinks').onclick = () => {showLinks = !showLinks;$('showLinks').setAttribute('aria-pressed', showLinks);};
  $('showNames').onclick = () => {showNames = !showNames;$('showNames').setAttribute('aria-pressed', showNames);};
  $('dvDesk').onclick = () => {select(null);deskMode = true;setZoom(1);updateTimeline();$('dvDesk').classList.add('on');$('dvNet').classList.remove('on');};
  $('dvNet').onclick = () => {deskMode = false;select(null);};
  $('overviewButton').onclick = () => {overviewOpen = !overviewOpen;deskMode = false;select(null);};
  $('searchButton').onclick = () => {$('peopleDialog').showModal();renderSearch();$('peopleSearch').focus();};
  $('closeSearch').onclick = () => $('peopleDialog').close();
  $('peopleSearch').oninput = renderSearch;
  document.addEventListener('keydown', (e) => {if ((e.metaKey || e.ctrlKey) && e.key === 'k') {e.preventDefault();$('searchButton').click();}if (e.key === 'Escape' && !$('peopleDialog').open && !e.defaultPrevented) {e.preventDefault();if (selected && !PROJ[selected] && focusedProject) select(focusedProject);else exitProjectSpace();}}); // Esc: first clears a selected person, then returns to the project starfield
  const initial = Object.keys(PROJ).find((k) => PROJ[k].id === entry.get('project'));
  if (initial && D.projectAt(initial, day)) {select(initial);requestAnimationFrame(frame);} else
  {$('toast').textContent = 'No known project on this date. Please go back to the project sky.';$('allWork').hidden = false;}
})();
