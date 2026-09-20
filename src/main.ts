import './style.css';
import { Agent, DEFAULT_MODEL, transport, type Event } from './agent';
import { initialScene } from './scene';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header><a class="brand" href="./"><span class="brand-icon">↻</span> ReAct <strong>Playground</strong></a><div class="header-right"><span class="live-dot"></span><span>REAL MODEL. VISIBLE ACTIONS.</span><button id="settings-button" class="quiet">⚙ Settings</button></div></header>
<main><section class="intro"><div><div class="eyebrow">A LITTLE LAB FOR AGENTIC AI</div><h1>Ask. Act. <span>Observe.</span></h1><p>Give Gemini a goal. Follow every tool call. Watch the world change.</p></div><div class="model-chip"><span class="live-dot"></span><span id="model-label"></span></div></section>
<div class="loop-bar" aria-label="How the loop works"><span><b>01</b> You set a goal</span><i>→</i><span><b>02</b> Model selects a tool</span><i>→</i><span><b>03</b> App executes it</span><i>→</i><span><b>04</b> Result goes back <em>↻</em></span></div>
<div class="workspace">
<section class="panel chat-panel"><div class="panel-heading"><h2><span>01 /</span> Conversation</h2><span class="tag">YOU + GEMINI</span></div><div id="messages" class="messages" role="log" aria-label="Conversation"><div class="welcome"><div class="welcome-icon">✳</div><h3>What should happen?</h3><p>Describe a change to the board.<br>The model works out which tools to use.</p></div></div><div class="suggestions"><span class="eyebrow">TRY A REQUEST</span><button class="example">Move the red circle inside the green rectangle.</button><button class="example">Put the blue square to the left of the circle.</button><button class="example">Is the circle completely inside the rectangle?</button></div><form id="chat-form"><label class="sr-only" for="prompt">Your request</label><textarea id="prompt" rows="3" maxlength="4000" placeholder="Give the shapes a goal…"></textarea><div class="composer-bottom"><span>Enter to send · Shift + Enter for a new line</span><button id="send" type="submit" class="primary">Send ↑</button></div></form></section>
<section class="panel board-panel"><div class="panel-heading"><h2><span>02 /</span> The world</h2><span class="tag">LIVE STATE</span></div><div class="board-caption"><span>A small world. Three shapes.</span><span>640 × 420</span></div><div class="board-wrap"><svg id="board" viewBox="-24 -20 688 464" role="img" aria-labelledby="board-title board-description"><title id="board-title">Interactive shape board</title><desc id="board-description">A red circle and blue square can move. The green rectangle is fixed.</desc><defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#dae3df" stroke-width="1"/></pattern></defs><rect width="640" height="420" rx="8" fill="#f8fbf9"/><rect width="640" height="420" rx="8" fill="url(#grid)"/><text x="0" y="-7" class="axis">0, 0</text><text x="592" y="442" class="axis">640, 420</text><g id="green_rectangle"><rect x="-110" y="-90" width="220" height="180" rx="9" fill="#e0f0d2" fill-opacity=".75" stroke="#62934d" stroke-width="2" stroke-dasharray="7 5"/><text y="-64" class="target-label">GREEN RECTANGLE</text><text y="73" class="target-label">FIXED TARGET</text></g><g id="blue_square" class="movable"><rect x="-32" y="-32" width="64" height="64" rx="7" fill="#4e79bc"/><text y="5" class="shape-letter">B</text></g><g id="red_circle" class="movable"><circle r="28" fill="#df6558"/><text y="5" class="shape-letter">R</text></g></svg></div><div id="shape-list" class="shape-list"></div><div class="world-note"><span>⌖</span><p>The model receives coordinates through tools.<br>Only application code can move a shape.</p></div><details class="toolbox"><summary>Available tools <span>3</span></summary><dl><dt>get_scene()</dt><dd>Read positions, dimensions, and IDs.</dd><dt>move_shape(shape_id, x, y)</dt><dd>Move to an absolute centre coordinate.</dd><dt>check_relation(subject_id, relation, target_id)</dt><dd>Check inside, left, right, above, or below.</dd></dl></details></section>
<section class="panel trace-panel"><div class="panel-heading"><h2><span>03 /</span> Inside the loop</h2><span id="event-count" class="tag">0 EVENTS</span></div><div class="trace-explainer">Actual requests and results—not a transcript of private reasoning.</div><div id="trace" class="trace" role="log" aria-label="Execution trace"><div class="trace-empty"><span>↻</span><h3>The loop starts with you.</h3><p>Send a request to see the model and application take turns.</p></div></div><div class="trace-legend"><span class="legend-model">● Model</span><span class="legend-app">● Application</span><span>Expand cards for exact data</span></div></section>
</div><section class="controls"><div class="status-block"><span id="status-dot" class="status-dot"></span><div><span class="eyebrow">EXECUTION</span><p id="status" role="status">Add your API key to begin</p></div></div><div class="control-buttons"><label class="switch-label"><input type="checkbox" id="auto"> Auto-run</label><button id="next" class="primary" disabled>Next step →</button><button id="stop" disabled>Stop</button><button id="reset" class="quiet">↺ Reset demo</button></div></section><footer><span>ReAct = reasoning + acting · No search or browsing tools</span><span>Calls go directly to Gemini · <a href="https://github.com/urcraft/react-playground" target="_blank" rel="noreferrer">View source ↗</a></span></footer></main>
<dialog id="settings"><form id="settings-form"><div class="dialog-heading"><div><div class="eyebrow">CONNECT YOUR MODEL</div><h2>Playground settings</h2></div><button id="close-settings" type="button" aria-label="Close settings">×</button></div><p>Use your own Gemini key. Requests go directly from this browser to Google and may use your API quota.</p><label for="api-key">Gemini API key</label><input id="api-key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your API key"><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a key in Google AI Studio ↗</a><label class="remember-label"><input id="remember" type="checkbox"> Remember on this browser</label><p class="storage-note">Default: this tab’s session storage. “Remember” uses persistent local storage. Neither is a secret vault; scripts on the same origin can read it. Never use a shared instructor key on someone else’s device.</p><label for="model">Model ID</label><input id="model" spellcheck="false" required pattern="[a-zA-Z0-9._-]+"><p class="storage-note">Use a Gemini model with function calling. Changing models starts a fresh conversation; the board stays in place.</p><p id="settings-message" role="status"></p><div class="dialog-actions"><button id="forget" type="button">Forget key</button><button class="primary" type="submit">Save settings</button></div></form></dialog>`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY = 'react-playground:key', MODEL = 'react-playground:model';
let apiKey = '', model = DEFAULT_MODEL, remembered = false, storageFailed = false;
try { apiKey = localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; remembered = !!localStorage.getItem(KEY); model = localStorage.getItem(MODEL) || DEFAULT_MODEL; } catch { storageFailed = true; }
let eventCount = 0;
const scene = initialScene();
const button = (id: string) => $<HTMLButtonElement>(id);
function safeText(value: unknown): string {
  let text = typeof value === 'string' ? value : JSON.stringify(value, (key, value) => key === 'thoughtSignature' ? '[opaque signature retained in model history]' : value, 2);
  if (apiKey) text = text.split(apiKey).join('[API key redacted]');
  return text;
}
function message(role: string, text: string) {
  $('messages').querySelector('.welcome')?.remove();
  const item = document.createElement('div'); item.className = `message ${role}`;
  const label = document.createElement('strong'); label.textContent = role === 'user' ? 'YOU' : role === 'error' ? 'APPLICATION' : 'GEMINI';
  const body = document.createElement('p'); body.textContent = safeText(text); item.append(label, body); $('messages').append(item); item.scrollIntoView({ block: 'nearest' });
}
function trace(event: Event) {
  $('trace').querySelector('.trace-empty')?.remove();
  eventCount++; $('event-count').textContent = `${eventCount} EVENTS`;
  const card = document.createElement('article'); card.className = `event ${event.kind}`;
  const meta = document.createElement('div'); meta.className = 'event-meta'; meta.textContent = `${String(eventCount).padStart(2,'0')} / ${event.kind.toUpperCase()} · ${new Date().toLocaleTimeString()}`;
  const title = document.createElement('p'); title.textContent = safeText(event.title); card.append(meta, title);
  if (event.data) { const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre'); summary.textContent = 'Inspect data'; pre.textContent = safeText(event.data); details.append(summary, pre); card.append(details); }
  $('trace').append(card); card.scrollIntoView({ block: 'nearest' });
  if (event.kind === 'answer' || event.kind === 'error') message(event.kind === 'answer' ? 'assistant' : 'error', event.title);
}
function status(label: string, waiting: boolean) { $('status').textContent = label; button('next').disabled = !waiting; $('status-dot').classList.toggle('active', waiting || label.startsWith('Waiting')); }
function refresh() {
  for (const shape of scene) document.getElementById(shape.id)!.setAttribute('transform', `translate(${shape.x} ${shape.y})`);
  $('board-description').textContent = scene.map(s => `${s.label}: centre ${s.x}, ${s.y}, ${s.movable ? 'movable' : 'fixed'}`).join('. ');
  $('shape-list').replaceChildren(...scene.map(s => { const row = document.createElement('div'); row.className = `shape-row ${s.id}`; const label = document.createElement('span'), coord = document.createElement('code'); label.textContent = s.label; coord.textContent = `(${s.x}, ${s.y})`; row.append(label, coord); return row; }));
  button('send').disabled = agent.running; button('stop').disabled = !agent.running; button('reset').disabled = agent.running; button('settings-button').disabled = agent.running;
  if (!agent.running) { button('next').disabled = true; $('status-dot').classList.remove('active'); }
  $('model-label').textContent = model;
}
const agent = new Agent(scene, trace, status, refresh);
function openSettings() { $<HTMLInputElement>('api-key').value = apiKey; $<HTMLInputElement>('model').value = model; $<HTMLInputElement>('remember').checked = remembered; $('settings-message').textContent = storageFailed ? 'Storage is unavailable. The key will remain in memory until this page closes.' : ''; $<HTMLDialogElement>('settings').showModal(); }
button('settings-button').onclick = openSettings;
button('close-settings').onclick = () => $<HTMLDialogElement>('settings').close();
$('settings-form').onsubmit = e => {
  e.preventDefault();
  const nextModel = $<HTMLInputElement>('model').value.trim();
  if (model !== nextModel) { agent.history = []; message('error', 'Model changed. Model history has been cleared; the board is unchanged.'); }
  model = nextModel; apiKey = $<HTMLInputElement>('api-key').value.trim(); remembered = $<HTMLInputElement>('remember').checked;
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); if (apiKey) (remembered ? localStorage : sessionStorage).setItem(KEY, apiKey); localStorage.setItem(MODEL, model); storageFailed = false; } catch { storageFailed = true; }
  $<HTMLInputElement>('api-key').value = '';
  $<HTMLDialogElement>('settings').close(); refresh(); status(apiKey ? (storageFailed ? 'Key held in memory only · storage unavailable' : 'Ready · send a request to begin') : 'Add your API key to begin', false);
};
button('forget').onclick = () => { apiKey = ''; remembered = false; let failed = false; for (const getStore of [() => localStorage, () => sessionStorage]) { try { getStore().removeItem(KEY); } catch { failed = true; } } $<HTMLInputElement>('api-key').value = ''; $<HTMLInputElement>('remember').checked = false; $('settings-message').textContent = failed ? 'Key cleared from memory. Browser storage could not be accessed; clear this site’s data in browser settings.' : 'API key removed from this page and browser storage.'; status('Add your API key to begin', false); };
$('chat-form').onsubmit = async e => {
  e.preventDefault(); if (agent.running) return;
  const input = $<HTMLTextAreaElement>('prompt'), prompt = input.value.trim(); if (!prompt) return;
  if (!apiKey) { openSettings(); return; }
  message('user', prompt); input.value = '';
  const run = agent.run(prompt, transport(apiKey, model), model); refresh(); await run; refresh();
};
$('prompt').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $<HTMLFormElement>('chat-form').requestSubmit(); } };
document.querySelectorAll<HTMLButtonElement>('.example').forEach(b => b.onclick = () => { $<HTMLTextAreaElement>('prompt').value = b.textContent!; $('prompt').focus(); });
button('next').onclick = () => agent.next(); button('stop').onclick = () => agent.stop();
$<HTMLInputElement>('auto').onchange = e => agent.setAuto((e.target as HTMLInputElement).checked);
button('reset').onclick = () => { if (agent.running) return; scene.splice(0, scene.length, ...initialScene()); agent.history = []; $('messages').replaceChildren(); $('trace').replaceChildren(); eventCount = 0; $('event-count').textContent = '0 EVENTS'; $<HTMLTextAreaElement>('prompt').value = ''; status(apiKey ? 'Reset · ready for a new request' : 'Add your API key to begin', false); refresh(); };
refresh(); if (apiKey) status('Ready · send a request to begin', false);
