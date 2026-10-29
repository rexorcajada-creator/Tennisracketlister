import Anthropic from "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.134.0/+esm";
import {
  GRADES, GRADE_KEYS, DEFAULT_FOOTER, LISTING_SCHEMA,
  systemPrompt, userPrompt, buildTitle, specificsRows,
  buildDescriptionHtml, buildDescriptionText,
} from "./listing.js";

const MODEL = "claude-opus-5-5";
const MAX_PHOTOS = 12;
const MAX_SIDE = 1568; // larger images are downscaled by the API anyway

const $ = (id) => document.getElementById(id);

// ---------- Settings (stored on this device only) ----------

function load(key, fallback = "") {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: settings won't persist */ }
}

const settings = {
  get apiKey() { return load("apiKey"); },
  get shopName() { return load("shopName"); },
  get footer() { return load("footer", DEFAULT_FOOTER); },
};

function openSettings() {
  $("apiKey").value = settings.apiKey;
  $("shopName").value = settings.shopName;
  $("footer").value = settings.footer;
  $("settings").showModal();
}

$("settingsBtn").addEventListener("click", openSettings);
$("settings").addEventListener("close", () => {
  if ($("settings").returnValue !== "save") return;
  save("apiKey", $("apiKey").value.trim());
  save("shopName", $("shopName").value.trim());
  save("footer", $("footer").value.trim());
  if (current) render();
});

// ---------- Photos ----------

let photos = []; // { media_type, data (base64), url (thumbnail) }

async function downscale(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { media_type: "image/jpeg", data: url.split(",")[1], url };
}

$("photos").addEventListener("change", async (e) => {
  const files = [...e.target.files].slice(0, MAX_PHOTOS);
  setStatus(files.length ? "Preparing photos…" : "");
  try {
    photos = await Promise.all(files.map(downscale));
  } catch {
    photos = [];
    setStatus("Couldn't read one of those photos. Try JPEG or PNG.", true);
    return;
  }
  $("thumbs").replaceChildren(...photos.map((p) => Object.assign(new Image(), { src: p.url, alt: "" })));
  setStatus(e.target.files.length > MAX_PHOTOS ? `Using the first ${MAX_PHOTOS} photos.` : "");
});

// ---------- Generate ----------

function setStatus(msg, isError = false) {
  $("status").textContent = msg;
  $("status").classList.toggle("error", isError);
}

async function gradeRacket({ model, grip, notes }) {
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: LISTING_SCHEMA },
    },
    // If a request is ever declined by a safety check, the API retries it on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: systemPrompt(),
    messages: [{
      role: "user",
      content: [
        ...photos.map((p) => ({ type: "image", source: { type: "base64", media_type: p.media_type, data: p.data } })),
        { type: "text", text: userPrompt({ model, grip, notes }) },
      ],
    }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined this request. Try different photos.");
  if (response.stop_reason === "max_tokens") throw new Error("The response was cut off. Please try again.");
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No listing came back. Please try again.");
  return JSON.parse(textBlock.text);
}

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "The API key was rejected. Check it in Settings.";
  if (err instanceof Anthropic.RateLimitError) return "Too many requests right now. Wait a minute and try again.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check the internet connection.";
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status ?? "?"}): ${err.message}`;
  return err?.message || String(err);
}

let current = null; // last result from Claude
let inputs = {};

$("generateBtn").addEventListener("click", async () => {
  const model = $("model").value.trim();
  if (!settings.apiKey) { openSettings(); setStatus("Add your API key first.", true); return; }
  if (!model) { setStatus("Enter the racket model.", true); return; }
  if (!photos.length) { setStatus("Add at least one photo.", true); return; }

  inputs = { model, grip: $("grip").value, notes: $("notes").value.trim(), price: $("price").value.trim() };
  $("generateBtn").disabled = true;
  setStatus(`Looking at ${photos.length} photo${photos.length > 1 ? "s" : ""} and grading… (about 30–60 seconds)`);
  try {
    current = await gradeRacket(inputs);
    if (inputs.grip) current.grip_size = inputs.grip; // seller's grip size always wins
    $("gradeOverride").value = current.grade;
    render();
    setStatus("Done. Review the details, then copy into eBay.");
    $("resultCard").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    setStatus(friendlyError(err), true);
  } finally {
    $("generateBtn").disabled = false;
  }
});

// ---------- Result ----------

$("gradeOverride").append(...GRADE_KEYS.map((k) => new Option(`${k} – ${GRADES[k].label}`, k)));
$("gradeOverride").addEventListener("change", () => {
  if (!current) return;
  current.grade = $("gradeOverride").value;
  render();
});

function opts() {
  return { shopName: settings.shopName, footer: settings.footer, price: inputs.price };
}

function render() {
  const d = current;
  $("resultCard").classList.remove("hidden");

  $("titleOut").value = buildTitle(d);
  updateTitleCount();
  $("ebayCondition").textContent = GRADES[d.grade].ebay;

  $("specificsOut").replaceChildren(...specificsRows(d).map(([k, v]) => {
    const tr = document.createElement("tr");
    tr.append(Object.assign(document.createElement("td"), { textContent: k }),
              Object.assign(document.createElement("td"), { textContent: v }));
    return tr;
  }));

  const checks = [...d.verify, ...d.missing_photos.map((m) => `Missing photo: ${m}`)];
  $("checksOut").replaceChildren();
  if (checks.length) {
    const box = Object.assign(document.createElement("div"), { className: "checks" });
    box.append(Object.assign(document.createElement("b"), { textContent: "Check before listing" }));
    const ul = document.createElement("ul");
    ul.append(...checks.map((c) => Object.assign(document.createElement("li"), { textContent: c })));
    box.append(ul);
    $("checksOut").append(box);
  }

  // Every value inside is HTML-escaped by buildDescriptionHtml.
  $("previewOut").innerHTML = buildDescriptionHtml(d, opts());
}

function updateTitleCount() {
  $("titleCount").textContent = `(${$("titleOut").value.length}/80)`;
}
$("titleOut").addEventListener("input", updateTitleCount);

async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = "Copied ✓";
    setTimeout(() => (btn.textContent = old), 1500);
  } catch {
    setStatus("Copy failed — select the text and copy it manually.", true);
  }
}

document.querySelectorAll("[data-copy]").forEach((btn) =>
  btn.addEventListener("click", () => copy($(btn.dataset.copy).value, btn)));
$("copyHtmlBtn").addEventListener("click", (e) => copy(buildDescriptionHtml(current, opts()), e.currentTarget));
$("copyTextBtn").addEventListener("click", (e) => copy(buildDescriptionText(current, opts()), e.currentTarget));

if (!settings.apiKey) setStatus("First time? Tap Settings and add your Anthropic API key.");
