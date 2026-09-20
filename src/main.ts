import "./style.css";
import {
  Agent,
  DEFAULT_MODEL,
  declarations,
  instructions,
  friendlyError,
  type Event,
} from "./agent";
import {
  createTransport,
  providers,
  listModels,
  buildRequest,
  type Provider,
  type ModelOption,
} from "./providers";
import sceneSource from "./scene.ts?raw";
import { initialScene } from "./scene";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<header><a class="brand" href="./"><span class="brand-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M3 11a9 9 0 1 1 2.8 6.5"/><path d="M3 4v7h7"/></svg></span><span class="brand-name">ReAct <strong>Playground</strong></span></a><div class="header-right"><span class="live-dot"></span><span>REAL MODEL. VISIBLE ACTIONS.</span><button id="hood-button" class="quiet">Under the hood</button><button id="settings-button" class="quiet">⚙ Settings</button></div></header>
<main><section class="intro"><div><div class="eyebrow">A LITTLE LAB FOR AGENTIC AI</div><h1>Ask. Act. <span>Observe.</span></h1><p>Give the model a goal. Follow every tool call. Watch the world change.</p></div><div class="model-chip"><span class="live-dot"></span><span id="model-label"></span></div></section>
<div class="loop-bar" aria-label="How the loop works"><span><b>01</b> You set a goal</span><i>→</i><span><b>02</b> Model selects a tool</span><i>→</i><span><b>03</b> App executes it</span><i>→</i><span><b>04</b> Result goes back <em>↻</em></span></div>
<div class="workspace">
<section class="panel chat-panel"><div class="panel-heading"><h2><span>01 /</span> Conversation</h2><span class="tag">YOU + MODEL</span></div><div id="messages" class="messages" role="log" aria-label="Conversation"><div class="welcome"><div class="welcome-icon">✳</div><h3>What should happen?</h3><p>Describe a change to the board.<br>The model works out which tools to use.</p></div></div><div class="suggestions"><span class="eyebrow">TRY A REQUEST</span><button class="example">Move the red circle inside the green rectangle.</button><button class="example">Put the blue square to the left of the circle.</button><button class="example">Is the circle completely inside the rectangle?</button></div><form id="chat-form"><label class="sr-only" for="prompt">Your request</label><textarea id="prompt" rows="3" maxlength="4000" placeholder="Give the shapes a goal…"></textarea><div class="composer-bottom"><span>Enter to send · Shift + Enter for a new line</span><button id="send" type="submit" class="primary">Send ↑</button></div></form></section>
<section class="panel board-panel"><div class="panel-heading"><h2><span>02 /</span> The world</h2><span class="tag">LIVE STATE</span></div><div class="board-caption"><span>A small world. Three shapes.</span><span>640 × 420</span></div><div class="board-wrap"><svg id="board" viewBox="-24 -20 688 464" role="img" aria-labelledby="board-title board-description"><title id="board-title">Interactive shape board</title><desc id="board-description">A red circle and blue square can move. The green rectangle is fixed.</desc><defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#dae3df" stroke-width="1"/></pattern></defs><rect width="640" height="420" rx="8" fill="#f8fbf9"/><rect width="640" height="420" rx="8" fill="url(#grid)"/><text x="0" y="-7" class="axis">0, 0</text><text x="592" y="442" class="axis">640, 420</text><g id="green_rectangle"><rect x="-110" y="-90" width="220" height="180" rx="9" fill="#e0f0d2" fill-opacity=".75" stroke="#62934d" stroke-width="2" stroke-dasharray="7 5"/><text y="-64" class="target-label">GREEN RECTANGLE</text><text y="73" class="target-label">FIXED TARGET</text></g><g id="blue_square" class="movable"><rect x="-32" y="-32" width="64" height="64" rx="7" fill="#4e79bc"/><text y="5" class="shape-letter">B</text></g><g id="red_circle" class="movable"><circle r="28" fill="#df6558"/><text y="5" class="shape-letter">R</text></g></svg></div><div id="shape-list" class="shape-list"></div><div class="world-note"><span>⌖</span><p>The model receives coordinates through tools.<br>Only application code can move a shape.</p></div><details class="toolbox"><summary>Available tools <span>3</span></summary><dl><dt>get_scene()</dt><dd>Read positions, dimensions, and IDs.</dd><dt>move_shape(shape_id, x, y)</dt><dd>Move to an absolute centre coordinate.</dd><dt>check_relation(subject_id, relation, target_id)</dt><dd>Check inside, left, right, above, or below.</dd></dl></details></section>
<section class="panel trace-panel"><div class="panel-heading"><h2><span>03 /</span> Inside the loop</h2><span id="event-count" class="tag">0 EVENTS</span></div><div class="trace-explainer">Actual requests and results—not a transcript of private reasoning.</div><div id="trace" class="trace" role="log" aria-label="Execution trace"><div class="trace-empty"><span>↻</span><h3>The loop starts with you.</h3><p>Send a request to see the model and application take turns.</p></div></div><div class="trace-legend"><span class="legend-model">● Model</span><span class="legend-app">● Application</span><span>Expand cards for exact data</span></div></section>
</div><section class="controls"><div class="status-block"><span id="status-dot" class="status-dot"></span><div><span class="eyebrow">EXECUTION</span><p id="status" role="status">Add your API key to begin</p></div></div><div class="control-buttons"><label class="switch-label"><input type="checkbox" id="auto"> Auto-run</label><button id="next" class="primary" disabled>Next step →</button><button id="stop" disabled>Stop</button><button id="reset" class="quiet">↺ Reset demo</button></div></section><footer><span>ReAct = reasoning + acting · No search or browsing tools</span><span>Your key · Your selected provider · <a href="https://github.com/urcraft/react-playground" target="_blank" rel="noreferrer">View source ↗</a></span></footer></main>
<dialog id="settings"><form id="settings-form"><div class="dialog-heading"><div><div class="eyebrow">CONNECT YOUR MODEL</div><h2>Playground settings</h2></div><button id="close-settings" type="button" aria-label="Close settings">×</button></div><p>Use your own API key. Requests go directly to the selected provider and may use your API quota.</p><label for="provider">Provider</label><select id="provider"><option value="gemini">Google Gemini</option><option value="openrouter">OpenRouter</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic (Claude)</option></select><label for="api-key">API key</label><input id="api-key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste this provider’s API key"><a id="key-link" target="_blank" rel="noreferrer">Get an API key ↗</a><label class="remember-label"><input id="remember" type="checkbox"> Remember on this browser</label><p class="storage-note">Default: this tab’s session storage. Persistent storage is optional. Neither is a secret vault; other pages on this GitHub Pages origin may read it. Keys are stored separately for each provider.</p><div class="model-heading"><label for="model">Model</label><button id="load-models" type="button">Refresh models</button></div><input id="model-filter" type="search" placeholder="Filter models…" aria-label="Filter models"><select id="model"></select><p id="model-status" class="storage-note" role="status"></p><details><summary>Enter a model ID manually</summary><label for="custom-model">Custom model ID (overrides the list)</label><input id="custom-model" spellcheck="false" placeholder="Optional model ID"></details><p class="storage-note">Lists are cached for 24 hours. Model listing does not guarantee tool support or account access. Changing provider or model clears model history; the board stays in place.</p><p id="provider-note" class="storage-note"></p><p id="settings-message" role="status"></p><div class="dialog-actions"><button id="forget" type="button">Forget this key</button><button class="primary" type="submit">Save settings</button></div></form></dialog>
<dialog id="hood"><div class="dialog-heading"><div><div class="eyebrow">THE APPLICATION, EXPLAINED</div><h2>Under the hood</h2></div><button id="close-hood" aria-label="Close under the hood">×</button></div><p>The same instructions and three tools drive every provider. Nothing here grants the model direct control of the page.</p><nav class="hood-tabs" aria-label="Under the hood sections"><button data-section="system" aria-pressed="true">System prompt</button><button data-section="tools" aria-pressed="false">Tools & code</button><button data-section="context" aria-pressed="false">Current context</button><button data-section="runtime" aria-pressed="false">How it runs</button></nav><div id="hood-content"></div></dialog>`;
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
type Profile = { key: string; model: string; remembered: boolean };
const keyName = (p: Provider) =>
  p === "gemini" ? "react-playground:key" : "react-playground:key:" + p;
const modelName = (p: Provider) =>
  p === "gemini" ? "react-playground:model" : "react-playground:model:" + p;
const profiles = {} as Record<Provider, Profile>;
let storageFailed = false;
for (const p of Object.keys(providers) as Provider[]) {
  profiles[p] = {
    key: "",
    model: p === "gemini" ? DEFAULT_MODEL : "",
    remembered: false,
  };
  try {
    profiles[p] = {
      key:
        localStorage.getItem(keyName(p)) ||
        sessionStorage.getItem(keyName(p)) ||
        "",
      model: localStorage.getItem(modelName(p)) || profiles[p].model,
      remembered: !!localStorage.getItem(keyName(p)),
    };
  } catch {
    storageFailed = true;
  }
}
let provider: Provider = "gemini";
try {
  const saved = localStorage.getItem("react-playground:provider");
  if (saved && Object.hasOwn(providers, saved)) provider = saved as Provider;
} catch {
  /* In-memory settings remain available. */
}
let apiKey = profiles[provider].key,
  model = profiles[provider].model;
let modelOptions: ModelOption[] = [],
  discoveryVersion = 0,
  hoodSection = "system";
let eventCount = 0;
const scene = initialScene();
const button = (id: string) => $<HTMLButtonElement>(id);
function safeText(value: unknown): string {
  let text =
    typeof value === "string"
      ? value
      : JSON.stringify(
          value,
          (key, value) =>
            ["thoughtSignature", "encrypted_content", "signature"].includes(key)
              ? "[opaque metadata retained in model history]"
              : value,
          2,
        );
  for (const key of [
    apiKey,
    ...Object.values(profiles).map((p) => p.key),
    $<HTMLInputElement>("api-key").value,
  ])
    if (key) text = text.split(key).join("[API key redacted]");
  return text;
}
function message(role: string, text: string) {
  $("messages").querySelector(".welcome")?.remove();
  const item = document.createElement("div");
  item.className = `message ${role}`;
  const label = document.createElement("strong");
  label.textContent =
    role === "user" ? "YOU" : role === "error" ? "APPLICATION" : model;
  const body = document.createElement("p");
  body.textContent = safeText(text);
  item.append(label, body);
  $("messages").append(item);
  $("messages").scrollTop = $("messages").scrollHeight;
}
function trace(event: Event) {
  $("trace").querySelector(".trace-empty")?.remove();
  eventCount++;
  $("event-count").textContent = `${eventCount} EVENTS`;
  const card = document.createElement("article");
  card.className = `event ${event.kind}`;
  const meta = document.createElement("div");
  meta.className = "event-meta";
  meta.textContent = `${String(eventCount).padStart(2, "0")} / ${event.kind.toUpperCase()} · ${new Date().toLocaleTimeString()}`;
  const title = document.createElement("p");
  title.textContent = safeText(event.title);
  card.append(meta, title);
  if (event.data) {
    const details = document.createElement("details"),
      summary = document.createElement("summary"),
      pre = document.createElement("pre");
    summary.textContent = "Inspect data";
    pre.textContent = safeText(event.data);
    details.append(summary, pre);
    card.append(details);
  }
  $("trace").append(card);
  $("trace").scrollTop = $("trace").scrollHeight;
  if (event.kind === "answer" || event.kind === "error")
    message(event.kind === "answer" ? "assistant" : "error", event.title);
}
function status(label: string, waiting: boolean) {
  $("status").textContent = label;
  button("next").disabled = !waiting;
  $("status-dot").classList.toggle(
    "active",
    waiting || label.startsWith("Waiting"),
  );
  if ($<HTMLDialogElement>("hood").open) renderHood();
}
function refresh() {
  for (const shape of scene)
    document
      .getElementById(shape.id)!
      .setAttribute("transform", `translate(${shape.x} ${shape.y})`);
  $("board-description").textContent = scene
    .map(
      (s) =>
        `${s.label}: centre ${s.x}, ${s.y}, ${s.movable ? "movable" : "fixed"}`,
    )
    .join(". ");
  $("shape-list").replaceChildren(
    ...scene.map((s) => {
      const row = document.createElement("div");
      row.className = `shape-row ${s.id}`;
      const label = document.createElement("span"),
        coord = document.createElement("code");
      label.textContent = s.label;
      coord.textContent = `(${s.x}, ${s.y})`;
      row.append(label, coord);
      return row;
    }),
  );
  button("send").disabled = agent.running;
  button("stop").disabled = !agent.running;
  button("reset").disabled = agent.running;
  button("settings-button").disabled = agent.running;
  if (!agent.running) {
    button("next").disabled = true;
    $("status-dot").classList.remove("active");
  }
  $("model-label").textContent =
    providers[provider].label + " · " + (model || "Select a model");
  if ($<HTMLDialogElement>("hood").open) renderHood();
}
const agent = new Agent(scene, trace, status, refresh);
const draftProvider = () => $<HTMLSelectElement>("provider").value as Provider;
function renderModels(selected = $<HTMLSelectElement>("model").value) {
  const filter = $<HTMLInputElement>("model-filter").value.toLowerCase();
  const select = $<HTMLSelectElement>("model");
  select.replaceChildren();
  const visible = modelOptions.filter(
    (m) =>
      (m.id + " " + m.name).toLowerCase().includes(filter) || m.id === selected,
  );
  if (!visible.length)
    select.add(new Option("Load models or enter a custom ID", ""));
  for (const m of visible)
    select.add(
      new Option(m.name === m.id ? m.id : m.name + " — " + m.id, m.id),
    );
  if (selected && visible.some((m) => m.id === selected))
    select.value = selected;
}
async function loadModels(force = false) {
  const version = ++discoveryVersion,
    p = draftProvider(),
    key = $<HTMLInputElement>("api-key").value.trim();
  if (!key && p !== "openrouter") {
    $("model-status").textContent =
      "Enter this provider’s key, then refresh the model list.";
    return;
  }
  button("load-models").disabled = true;
  $("model-status").textContent = "Loading models…";
  try {
    const list = await listModels(p, key, force);
    if (
      version !== discoveryVersion ||
      p !== draftProvider() ||
      key !== $<HTMLInputElement>("api-key").value.trim()
    )
      return;
    const selected = $<HTMLSelectElement>("model").value || profiles[p].model;
    modelOptions = list.models;
    if (selected && !modelOptions.some((m) => m.id === selected))
      modelOptions = [
        { id: selected, name: selected + " (saved; not in current list)" },
        ...modelOptions,
      ];
    renderModels(selected);
    $("model-status").textContent =
      list.models.length +
      " models · " +
      (list.cached ? "Cached " : "Fetched ") +
      new Date(list.fetchedAt).toLocaleString() +
      (p === "openrouter"
        ? " · Tool support advertised"
        : " · Check tool compatibility for your chosen model");
  } catch (error) {
    if (version === discoveryVersion)
      $("model-status").textContent =
        friendlyError(error) +
        " The current selection is retained; you can also enter an ID manually.";
  } finally {
    if (version === discoveryVersion) button("load-models").disabled = false;
  }
}
function fillProvider() {
  discoveryVersion++;
  button("load-models").disabled = false;
  const p = draftProvider(),
    profile = profiles[p];
  $<HTMLInputElement>("api-key").value = profile.key;
  $<HTMLInputElement>("remember").checked = profile.remembered;
  $<HTMLInputElement>("custom-model").value = "";
  $<HTMLInputElement>("model-filter").value = "";
  modelOptions = profile.model
    ? [{ id: profile.model, name: profile.model + " (saved selection)" }]
    : [];
  renderModels(profile.model);
  $<HTMLAnchorElement>("key-link").href = providers[p].keyLink;
  $("key-link").textContent = "Get a key from " + providers[p].label + " ↗";
  $("provider-note").textContent =
    p === "anthropic"
      ? "Direct browser access is enabled for your own Claude API key. Your key is sent only to api.anthropic.com."
      : "Your key is sent only to the selected provider’s API.";
  $("settings-message").textContent = storageFailed
    ? "Storage is unavailable. New settings may remain in memory only."
    : "";
  $("model-status").textContent =
    "Enter a key and refresh models, or use a custom model ID.";
  if (profile.key || p === "openrouter") void loadModels();
}
function openSettings() {
  $<HTMLSelectElement>("provider").value = provider;
  fillProvider();
  $<HTMLDialogElement>("settings").showModal();
}
button("settings-button").onclick = openSettings;
button("close-settings").onclick = () =>
  $<HTMLDialogElement>("settings").close();
$<HTMLSelectElement>("provider").onchange = fillProvider;
button("load-models").onclick = () => void loadModels(true);
$("model-filter").oninput = () => renderModels();
$("api-key").oninput = () => {
  discoveryVersion++;
  button("load-models").disabled = false;
  $("model-status").textContent =
    "Key changed. Refresh to load models for this account.";
};
$("settings-form").onsubmit = (e) => {
  e.preventDefault();
  const nextProvider = draftProvider();
  const nextModel = (
    $<HTMLInputElement>("custom-model").value ||
    $<HTMLSelectElement>("model").value
  ).trim();
  if (!nextModel || !/^[a-zA-Z0-9._/:-]+$/.test(nextModel)) {
    $("settings-message").textContent =
      "Select a model or enter a valid model ID.";
    return;
  }
  const nextKey = $<HTMLInputElement>("api-key").value.trim();
  if (model !== nextModel || provider !== nextProvider || apiKey !== nextKey) {
    const hadHistory = agent.history.length > 0;
    agent.history = [];
    if (hadHistory)
      message(
        "error",
        "Connection changed. Model history has been cleared; the board is unchanged.",
      );
  }
  provider = nextProvider;
  model = nextModel;
  apiKey = nextKey;
  const remembered = $<HTMLInputElement>("remember").checked;
  profiles[provider] = { key: apiKey, model, remembered };
  try {
    localStorage.removeItem(keyName(provider));
    sessionStorage.removeItem(keyName(provider));
    if (apiKey)
      (remembered ? localStorage : sessionStorage).setItem(
        keyName(provider),
        apiKey,
      );
    localStorage.setItem(modelName(provider), model);
    localStorage.setItem("react-playground:provider", provider);
    storageFailed = false;
  } catch {
    storageFailed = true;
  }
  discoveryVersion++;
  $<HTMLInputElement>("api-key").value = "";
  $<HTMLDialogElement>("settings").close();
  refresh();
  status(
    apiKey
      ? storageFailed
        ? "Key held in memory only · storage unavailable"
        : "Ready · send a request to begin"
      : "Add your API key to begin",
    false,
  );
};
button("forget").onclick = () => {
  discoveryVersion++;
  const p = draftProvider();
  profiles[p].key = "";
  profiles[p].remembered = false;
  if (p === provider) apiKey = "";
  let failed = false;
  for (const getStore of [() => localStorage, () => sessionStorage])
    try {
      getStore().removeItem(keyName(p));
    } catch {
      failed = true;
    }
  $<HTMLInputElement>("api-key").value = "";
  $<HTMLInputElement>("remember").checked = false;
  button("load-models").disabled = false;
  $("settings-message").textContent = failed
    ? "Key cleared from memory. Clear site data in browser settings to remove inaccessible stored copies."
    : "This provider’s key was removed from memory and browser storage.";
  if (p === provider) status("Add your API key to begin", false);
};
function renderHood() {
  const container = $("hood-content");
  container.replaceChildren();
  const add = (title: string, data: unknown) => {
    const h = document.createElement("h3"),
      pre = document.createElement("pre");
    h.textContent = title;
    pre.textContent = safeText(data);
    container.append(h, pre);
  };
  if (hoodSection === "system")
    add("System instructions sent on every request", instructions);
  if (hoodSection === "tools") {
    add("Function definitions exposed to the selected model", buildRequest(provider, model, []).tools);
    const details = document.createElement("details"),
      summary = document.createElement("summary"),
      pre = document.createElement("pre");
    summary.textContent = "Application function source (TypeScript)";
    pre.textContent = sceneSource;
    details.append(summary, pre);
    container.append(details);
  }
  if (hoodSection === "context") {
    add(
      "Current provider request body (credentials excluded)",
      buildRequest(provider, model, agent.history),
    );
    add("Current scene (read by the model only through tools)", scene);
  }
  if (hoodSection === "runtime")
    add(
      "Execution and data flow",
      "Provider: " +
        providers[provider].label +
        "\nModel: " +
        (model || "Not selected") +
        "\nEndpoint: " +
        providers[provider].endpoint +
        "\n\n1. Send system instructions, tool schemas, and conversation history.\n2. The model returns text or tool calls.\n3. The application validates and executes tools in order.\n4. Tool results are added to the next model request.\n5. Repeat until a final answer, Stop, an error, or ten model requests.\n\nStep mode pauses before every model call and tool execution. No browsing, search, or arbitrary code tools. Board positions are centre coordinates; x increases right and y increases down.\n\nChanging provider, model, or key clears model history. Reset also restores the scene. Interrupted turns are discarded; completed movements remain. Responses appear when an API call completes, not token by token.\n\nKeys stay in browser memory/storage and go only to the selected provider. Model lists are cached for 24 hours, separately by provider and account fingerprint; keys are not stored in the model cache. Opaque provider metadata is preserved for follow-up calls.",
    );
}
button("hood-button").onclick = () => {
  renderHood();
  $<HTMLDialogElement>("hood").showModal();
};
button("close-hood").onclick = () => $<HTMLDialogElement>("hood").close();
document.querySelectorAll<HTMLButtonElement>("[data-section]").forEach(
  (b) =>
    (b.onclick = () => {
      hoodSection = b.dataset.section!;
      document
        .querySelectorAll<HTMLButtonElement>("[data-section]")
        .forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
      renderHood();
    }),
);
$("chat-form").onsubmit = async (e) => {
  e.preventDefault();
  if (agent.running) return;
  const input = $<HTMLTextAreaElement>("prompt"),
    prompt = input.value.trim();
  if (!prompt) return;
  if (!apiKey) {
    openSettings();
    return;
  }
  message("user", prompt);
  input.value = "";
  const run = agent.run(
    prompt,
    createTransport(provider, apiKey, model),
    model,
  );
  refresh();
  await run;
  refresh();
};
$("prompt").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $<HTMLFormElement>("chat-form").requestSubmit();
  }
};
document.querySelectorAll<HTMLButtonElement>(".example").forEach(
  (b) =>
    (b.onclick = () => {
      $<HTMLTextAreaElement>("prompt").value = b.textContent!;
      $("prompt").focus();
    }),
);
button("next").onclick = () => agent.next();
button("stop").onclick = () => agent.stop();
$<HTMLInputElement>("auto").onchange = (e) =>
  agent.setAuto((e.target as HTMLInputElement).checked);
button("reset").onclick = () => {
  if (agent.running) return;
  scene.splice(0, scene.length, ...initialScene());
  agent.history = [];
  $("messages").replaceChildren();
  $("trace").replaceChildren();
  eventCount = 0;
  $("event-count").textContent = "0 EVENTS";
  $<HTMLTextAreaElement>("prompt").value = "";
  status(
    apiKey ? "Reset · ready for a new request" : "Add your API key to begin",
    false,
  );
  refresh();
};
refresh();
if (apiKey) status("Ready · send a request to begin", false);
