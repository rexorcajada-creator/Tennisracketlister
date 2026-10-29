// Grading scale, AI instructions, and the listing template.
// Edit this file to change how every listing reads.

export const GRADES = {
  "A+": {
    label: "New / Unused",
    ebay: "New other (see details)",
    meaning: "Never hit. No marks on the frame or bumper. Original grip, often with factory plastic or stickers.",
  },
  A: {
    label: "Excellent",
    ebay: "Used",
    meaning: "Lightly used. Only faint marks; no paint chips; bumper and grip look nearly new.",
  },
  B: {
    label: "Very Good",
    ebay: "Used",
    meaning: "Normal use. Light scuffs on the bumper or frame tips, a few small paint chips, some grip wear.",
  },
  C: {
    label: "Good",
    ebay: "Used",
    meaning: "Well used. Noticeable scuffs and chips, worn bumper, worn or dirty grip. Fully playable, no cracks.",
  },
  D: {
    label: "Fair",
    ebay: "Used",
    meaning: "Heavy cosmetic wear: deep chips, bumper worn through, paint loss. Still playable, no cracks.",
  },
};

export const GRADE_KEYS = Object.keys(GRADES);

export const DEFAULT_FOOTER =
  "Ships within 1 business day, well packed in a racket box. " +
  "Returns accepted within 30 days. Questions? Send a message — happy to send more photos.";

// JSON shape Claude must return. Strict: every field required, nothing extra.
const text = { type: "string" };
export const LISTING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "brand", "model", "generation", "specs", "grip_size", "strung",
    "grade", "grade_reason", "condition", "flaws", "highlights",
    "missing_photos", "verify",
  ],
  properties: {
    brand: text,
    model: text,
    generation: { type: "string", description: "Version or year, e.g. 'v14' or '2023'. Empty if unknown." },
    specs: {
      type: "object",
      additionalProperties: false,
      required: ["head_size", "weight", "balance", "length", "string_pattern", "stiffness", "swingweight"],
      properties: {
        head_size: { type: "string", description: "e.g. '97 sq in'" },
        weight: { type: "string", description: "Unstrung weight, e.g. '315 g / 11.1 oz'" },
        balance: { type: "string", description: "e.g. '31 cm / 7 pts HL'" },
        length: { type: "string", description: "e.g. '27 in'" },
        string_pattern: { type: "string", description: "e.g. '16x19'" },
        stiffness: { type: "string", description: "RA, e.g. '66 RA'" },
        swingweight: { type: "string", description: "Strung swingweight, e.g. '325'" },
      },
    },
    grip_size: { type: "string", description: "e.g. '4 3/8 (L3)'. Empty if not visible." },
    strung: { type: "string", description: "e.g. 'Strung — appears to be a polyester string, good tension' or 'Unstrung'." },
    grade: { type: "string", enum: GRADE_KEYS },
    grade_reason: { type: "string", description: "One sentence on why this grade." },
    condition: {
      type: "object",
      additionalProperties: false,
      required: ["frame", "paint", "bumper", "grip", "strings"],
      properties: {
        frame: { type: "string", description: "Structure: cracks, dents, warping. Say 'No cracks or dents visible' if clean." },
        paint: text,
        bumper: text,
        grip: text,
        strings: text,
      },
    },
    flaws: { type: "array", items: text, description: "Each specific flaw with its location, e.g. 'Small paint chip at 10 o'clock'." },
    highlights: { type: "array", items: text, description: "2-4 short selling points about this model, factual." },
    missing_photos: { type: "array", items: text, description: "Views needed to grade with confidence that are not in the photos." },
    verify: { type: "array", items: text, description: "Anything uncertain the seller should double-check before listing (e.g. specs differ between versions, possible crack)." },
  },
};

export function systemPrompt() {
  const scale = GRADE_KEYS.map((k) => `- ${k} (${GRADES[k].label}): ${GRADES[k].meaning}`).join("\n");
  return `You grade used tennis rackets for an eBay shop and fill in a fixed listing form.

Grading scale (use exactly one):
${scale}

Rules:
- Grade only from what the photos and seller notes show. Seller notes are authoritative about things photos can't show.
- Judge the worst visible area, not the average. A single deep chip can drop a racket a grade.
- Any possible crack, dent or warp in the frame or throat goes in "verify" and "flaws", and the grade must not be above C until the seller confirms it is cosmetic.
- Describe flaw locations using clock positions on the head (12 o'clock = tip) or named parts (throat, shaft, butt cap).
- Specs come from your knowledge of the stated model and version. If versions differ or you are not sure, leave the field empty and add a "verify" note rather than guessing.
- Grip size: read it from the butt cap or shaft label if visible. Otherwise leave it empty.
- Write plain, factual, buyer-friendly sentences. No hype, no emojis, no ALL CAPS.`;
}

export function userPrompt({ model, grip, notes }) {
  return [
    `Racket model (from seller): ${model}`,
    grip ? `Grip size (from seller): ${grip}` : "",
    notes ? `Seller notes: ${notes}` : "",
    "Grade this racket from the photos above and fill in the listing form.",
  ].filter(Boolean).join("\n");
}

// ---------- Rendering (deterministic: same data in, same layout out) ----------

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function fullName(d) {
  return [d.brand, d.model, d.generation].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function gripShort(grip) {
  // "4 3/8 (L3)" -> "4 3/8"
  return (grip || "").replace(/\s*\(.*\)\s*/, "").trim();
}

// Title formula: Brand Model Gen | Head | Weight | Grip | Grade — trimmed to eBay's 80 chars.
export function buildTitle(d) {
  const grade = GRADES[d.grade];
  const head = (d.specs.head_size || "").replace(/\s*sq\.?\s*in\.?/i, " sq in").trim();
  const weight = (d.specs.weight || "").split("/")[0].trim().replace(/\s+(g|oz)$/i, "$1");
  const grip = gripShort(d.grip_size);
  const parts = [
    `${fullName(d)} Tennis Racket`,
    head,
    weight,
    grip ? `Grip ${grip}` : "",
    grade ? `- ${d.grade} ${grade.label}` : "",
  ].filter(Boolean);

  // Drop optional parts from the middle until it fits.
  let title = parts.join(" ");
  const optional = [weight, head];
  while (title.length > 80 && optional.length) {
    const drop = optional.shift();
    parts.splice(parts.indexOf(drop), 1);
    title = parts.join(" ");
  }
  return title.slice(0, 80);
}

export function specificsRows(d) {
  return [
    ["Brand", d.brand],
    ["Model", [d.model, d.generation].filter(Boolean).join(" ")],
    ["Head Size", d.specs.head_size],
    ["Weight (unstrung)", d.specs.weight],
    ["Balance", d.specs.balance],
    ["Length", d.specs.length],
    ["String Pattern", d.specs.string_pattern],
    ["Stiffness", d.specs.stiffness],
    ["Swingweight", d.specs.swingweight],
    ["Grip Size", d.grip_size],
    ["Strung / Unstrung", d.strung],
  ].filter(([, v]) => v);
}

export function buildDescriptionHtml(d, { shopName, footer, price }) {
  const grade = GRADES[d.grade];
  const font = "font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.5;";
  const h = "font-size:17px;margin:18px 0 6px;border-bottom:2px solid #1f7a4d;padding-bottom:3px;";
  const td = "padding:5px 8px;border-bottom:1px solid #e3e3e3;vertical-align:top;";

  const specs = specificsRows(d)
    .map(([k, v]) => `<tr><td style="${td}color:#666;width:40%;">${esc(k)}</td><td style="${td}">${esc(v)}</td></tr>`)
    .join("");

  const cond = [
    ["Frame", d.condition.frame],
    ["Paint", d.condition.paint],
    ["Bumper guard", d.condition.bumper],
    ["Grip", d.condition.grip],
    ["Strings", d.condition.strings],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`)
    .join("");

  const list = (items) => items.map((i) => `<li>${esc(i)}</li>`).join("");

  return `<div style="${font}max-width:760px;margin:0 auto;font-size:15px;">
<h1 style="font-size:22px;margin:0 0 4px;">${esc(fullName(d))} Tennis Racket</h1>
${shopName ? `<div style="color:#666;margin-bottom:10px;">${esc(shopName)}</div>` : ""}
<div style="display:inline-block;background:#1f7a4d;color:#fff;font-weight:bold;padding:6px 12px;border-radius:4px;">Condition Grade: ${esc(d.grade)} &ndash; ${esc(grade.label)}</div>
${price ? `<div style="margin-top:8px;font-size:17px;"><b>Price:</b> ${esc(price)}</div>` : ""}
<p style="margin:10px 0 0;">${esc(d.grade_reason)}</p>

<h2 style="${h}">Condition Details</h2>
<ul style="margin:0;padding-left:20px;">${cond}</ul>
${d.flaws.length ? `<p style="margin:10px 0 4px;"><b>Noted flaws (see photos):</b></p><ul style="margin:0;padding-left:20px;">${list(d.flaws)}</ul>` : ""}

<h2 style="${h}">Specifications</h2>
<table style="border-collapse:collapse;width:100%;">${specs}</table>

${d.highlights.length ? `<h2 style="${h}">About This Racket</h2><ul style="margin:0;padding-left:20px;">${list(d.highlights)}</ul>` : ""}

<h2 style="${h}">Our Grading Scale</h2>
<table style="border-collapse:collapse;width:100%;font-size:14px;">${GRADE_KEYS.map(
    (k) =>
      `<tr${k === d.grade ? ' style="background:#eaf5ee;font-weight:bold;"' : ""}><td style="${td}width:110px;">${esc(k)} &ndash; ${esc(GRADES[k].label)}</td><td style="${td}">${esc(GRADES[k].meaning)}</td></tr>`
  ).join("")}</table>

${footer ? `<h2 style="${h}">Shipping &amp; Returns</h2><p style="margin:0;">${esc(footer)}</p>` : ""}
</div>`;
}

export function buildDescriptionText(d, { shopName, footer, price }) {
  const grade = GRADES[d.grade];
  const lines = [
    `${fullName(d)} Tennis Racket`,
    shopName || "",
    "",
    `CONDITION GRADE: ${d.grade} - ${grade.label}`,
    price ? `Price: ${price}` : "",
    d.grade_reason,
    "",
    "CONDITION DETAILS",
    `- Frame: ${d.condition.frame}`,
    `- Paint: ${d.condition.paint}`,
    `- Bumper guard: ${d.condition.bumper}`,
    `- Grip: ${d.condition.grip}`,
    `- Strings: ${d.condition.strings}`,
    ...(d.flaws.length ? ["", "Noted flaws (see photos):", ...d.flaws.map((f) => `- ${f}`)] : []),
    "",
    "SPECIFICATIONS",
    ...specificsRows(d).map(([k, v]) => `- ${k}: ${v}`),
    ...(d.highlights.length ? ["", "ABOUT THIS RACKET", ...d.highlights.map((x) => `- ${x}`)] : []),
    "",
    "OUR GRADING SCALE",
    ...GRADE_KEYS.map((k) => `${k} - ${GRADES[k].label}: ${GRADES[k].meaning}`),
    ...(footer ? ["", "SHIPPING & RETURNS", footer] : []),
  ];
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}
