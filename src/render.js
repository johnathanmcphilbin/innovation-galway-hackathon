import { EVENT, TSHIRT_SIZES, airtableReviewUrl } from "./constants.js";
import { ageOn } from "./validate.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function errorFor(errors, field) {
  return errors?.find((error) => error.field === field)?.message || "";
}

const NAV = [
  ["/#challenge", "Challenge"],
  ["/#schedule", "Schedule"],
  ["/#partners", "Partners"],
  ["/#faq", "FAQ"],
  ["/#location", "Location"],
  ["/signup", "Sign up"],
  ["/submit", "Submit"],
];

function layout({ title, description, path, body, robots, script = false }) {
  const pageTitle = title.includes("ElevenLabs")
    ? title
    : `${title} · Innovation Galway × ElevenLabs`;
  const desc =
    description ||
    "A hackathon for students, by students. Saturday 21 November 2026, 10am to 6pm, PorterShed, Galway.";
  const nav = NAV.map(([href, label]) => {
    const current =
      !href.startsWith("/#") && (path === href || path.startsWith(`${href}/`))
        ? ' aria-current="page"'
        : "";
    return `<a href="${href}"${current}>${label}</a>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en-IE">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <meta name="theme-color" content="#070a14">
  ${robots ? `<meta name="robots" content="${escapeHtml(robots)}">` : ""}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/fonts/barlow-condensed-800-italic.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  <header class="site-header">
    <div class="wrap header-bar">
      <a class="wordmark" href="/">Innovation Galway <span aria-hidden="true">×</span> ElevenLabs</a>
      <nav class="nav" aria-label="Primary">${nav}</nav>
    </div>
  </header>
  <main id="content">${body}</main>
  <footer class="site-footer">
    <img class="footer-rule" src="/art/wave-rule.svg" alt="">
    <div class="wrap footer-bar">
      <p>Hosted by ${escapeHtml(EVENT.hosts.join(" and "))}.</p>
      <p>${escapeHtml(EVENT.dateLabel)}, ${EVENT.start}–${EVENT.end}, ${escapeHtml(EVENT.venue)}, ${escapeHtml(EVENT.city)}.</p>
      <p><a href="/admin">Admin</a></p>
    </div>
  </footer>
  ${script ? '<script src="/form.js" defer></script>' : ""}
</body>
</html>`;
}

function errorSummary(errors) {
  if (!errors?.length) return "";
  const items = errors
    .map(
      (error) =>
        `<li><a href="#${escapeHtml(error.field)}">${escapeHtml(error.message)}</a></li>`,
    )
    .join("");
  return `<div class="error-summary" role="alert">
    <p>Fix these, then send the form again.</p>
    <ul>${items}</ul>
  </div>`;
}

function formBanner(message) {
  if (!message) return "";
  return `<div class="error-summary" role="alert"><p>${escapeHtml(message)}</p></div>`;
}

function field({
  id,
  label,
  name,
  type = "text",
  value = "",
  error,
  hint,
  required,
  autocomplete,
  maxlength,
  multiline,
  inputmode,
  min,
  max,
  rows = 4,
}) {
  const described = [];
  if (hint) described.push(`${id}-hint`);
  if (error) described.push(`${id}-error`);
  const describedAttr = described.length ? ` aria-describedby="${described.join(" ")}"` : "";
  const invalid = error ? ' aria-invalid="true"' : "";
  const requiredAttr = required ? " required" : "";
  const auto = autocomplete ? ` autocomplete="${escapeHtml(autocomplete)}"` : "";
  const maxLength = maxlength ? ` maxlength="${maxlength}"` : "";
  const mode = inputmode ? ` inputmode="${escapeHtml(inputmode)}"` : "";
  const minAttr = min ? ` min="${escapeHtml(min)}"` : "";
  const maxAttr = max ? ` max="${escapeHtml(max)}"` : "";
  const common = `id="${escapeHtml(id)}" name="${escapeHtml(name)}"${requiredAttr}${auto}${maxLength}${mode}${minAttr}${maxAttr}${invalid}${describedAttr}`;
  const control = multiline
    ? `<textarea ${common} rows="${Number(rows)}">${escapeHtml(value)}</textarea>`
    : `<input type="${escapeHtml(type)}" ${common} value="${escapeHtml(value)}">`;
  return `<div class="field">
    <label for="${escapeHtml(id)}">${escapeHtml(label)}${required ? ' <span class="req">Required</span>' : ""}</label>
    ${control}
    ${hint ? `<p class="hint" id="${id}-hint">${escapeHtml(hint)}</p>` : ""}
    ${error ? `<p class="field-error" id="${id}-error">${escapeHtml(error)}</p>` : ""}
  </div>`;
}

function shirtField(value, error) {
  const options = TSHIRT_SIZES.map(
    (size) => `<label class="choice">
      <input type="radio" name="tshirt_size" value="${size}"${value === size ? " checked" : ""} required>
      <span>${size}</span>
    </label>`,
  ).join("");
  return `<fieldset class="choices-field" id="tshirt_size">
    <legend>T-shirt size <span class="req">Required</span></legend>
    <div class="choices"${error ? ' aria-invalid="true" aria-describedby="tshirt_size-error"' : ""}>${options}</div>
    ${error ? `<p class="field-error" id="tshirt_size-error">${escapeHtml(error)}</p>` : ""}
  </fieldset>`;
}

export function renderHome() {
  const partners = EVENT.partners
    .map(
      (partner) =>
        `<li><span>${escapeHtml(partner.name)}</span>${
          partner.note ? `<small>${escapeHtml(partner.note)}</small>` : ""
        }</li>`,
    )
    .join("");

  const faqs = [
    ["Who is it for?", "Students aged 19 and under."],
    [
      "Does it cost anything?",
      "No. It is free to attend. Every participant gets free ElevenLabs credits.",
    ],
    [
      "When and where?",
      `${EVENT.dateLabel}, 10am to 6pm, at ${EVENT.venue}, ${EVENT.street}, ${EVENT.city}, ${EVENT.eircode}.`,
    ],
    ["What is the challenge?", EVENT.challenge],
    ["What are the prizes?", "Main prizes are TBA."],
    [
      "Who is running it?",
      `Hosted by ${EVENT.hosts.join(" and ")}, with Innovation Galway (Innovation Ireland), ElevenLabs, IdeasLab, and PorterShed.`,
    ],
    [
      "I will be under 18. What do you need?",
      "A parent or guardian's name, email, and phone number on the sign-up form.",
    ],
    [
      "Will there be photos?",
      "Only if you opt in. Photo consent is a checkbox on the sign-up form, and you can attend without ticking it.",
    ],
    [
      "How do I submit a project?",
      "Sign up first, then use the submit page with the same email. You will need a code link, a playable link, a hosted screenshot link, and a description that includes your team, how you used ElevenLabs, and how the project helps young people.",
    ],
    [
      "Where is the schedule?",
      "The day runs from 10am to 6pm. The session-by-session schedule is TBA.",
    ],
  ];
  const faqHtml = faqs
    .map(
      ([question, answer]) =>
        `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`,
    )
    .join("");

  const body = `<section class="hero">
      <img class="hero-globe" src="/art/globe-inked.svg" alt="">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <h1 class="hero-title" id="event-title">
            <span>Innovation</span>
            <span>Galway <span class="x">×</span></span>
            <span>ElevenLabs</span>
          </h1>
          <p class="tagline"><span>${escapeHtml(EVENT.tagline)}</span></p>
          <p class="lede">${escapeHtml(EVENT.line)} One day of building things that talk, listen and help, at ${escapeHtml(EVENT.venue)} in ${escapeHtml(EVENT.city)}.</p>
          <p class="when"><time datetime="${EVENT.dateISO}">${escapeHtml(EVENT.dateLabel)}</time><span aria-hidden="true"> · </span><time datetime="${EVENT.dateISO}T10:00">10am</time> to <time datetime="${EVENT.dateISO}T18:00">6pm</time><span aria-hidden="true"> · </span>${escapeHtml(EVENT.venue)}, ${escapeHtml(EVENT.city)}</p>
          <div class="actions">
            <a class="button" href="/signup">Sign up, it's free</a>
            <a class="button secondary" href="/submit">Submit your project</a>
          </div>
          <p class="facts">Free to attend. ElevenLabs credits for every participant. Main prizes TBA.</p>
        </div>
        <div class="hero-art" aria-hidden="true">
          <img class="hooker" src="/art/hooker-sticker.svg" alt="" width="720" height="600">
          <img class="sticker sticker-age" src="/art/sticker-under19.svg" alt="" width="220" height="220">
          <img class="sticker sticker-free" src="/art/sticker-free.svg" alt="" width="220" height="220">
          <img class="note" src="/art/note-credits.svg" alt="" width="420" height="200">
        </div>
      </div>
    </section>
    <section class="section paper" id="challenge">
      <div class="wrap brief">
        <div class="brief-head">
          <h2>${escapeHtml(EVENT.challenge)}</h2>
          <img class="brief-art" src="/art/voice-bubble.svg" alt="" width="360" height="300">
        </div>
        <div class="prose">
          <p>A one-day hackathon at ${escapeHtml(EVENT.venue)}, ${escapeHtml(EVENT.city)}. Free for students aged 19 and under. Hosted by ${escapeHtml(EVENT.hosts.join(" and "))}.</p>
          <p>Everyone who takes part gets free ElevenLabs credits, so your project can speak, listen, translate or sing. Main prizes are TBA. The day runs from 10am to 6pm on ${escapeHtml(EVENT.dateLabel)}.</p>
          <h3>Stuck for an idea? Steal one</h3>
          <ul class="ideas">
            <li>A study buddy that quizzes you out loud before the Leaving Cert.</li>
            <li>An audio guide to Galway, told in the voices of the people who live here.</li>
            <li>A game where the characters actually talk back.</li>
            <li>A tool that helps someone who finds it hard to speak up in class.</li>
          </ul>
        </div>
      </div>
    </section>
    <section class="section" id="schedule">
      <div class="wrap split">
        <h2>Saturday, 10am to 6pm</h2>
        <ol class="day">
          <li><time datetime="${EVENT.dateISO}T10:00">10:00</time><p>Start, at ${escapeHtml(EVENT.venue)}.</p></li>
          <li><time class="tba">TBA</time><p><strong>Schedule TBA.</strong> The programme between the start and the end is not set yet.</p></li>
          <li><time datetime="${EVENT.dateISO}T18:00">18:00</time><p>End.</p></li>
        </ol>
      </div>
    </section>
    <section class="section paper" id="partners">
      <div class="wrap split">
        <h2>Made possible by</h2>
        <ul class="partners">${partners}</ul>
      </div>
    </section>
    <section class="section" id="faq">
      <div class="wrap split">
        <h2>Before you come</h2>
        <div class="faq">${faqHtml}</div>
      </div>
    </section>
    <section class="section" id="location">
      <div class="wrap split">
        <h2>Find us at ${escapeHtml(EVENT.venue)}</h2>
        <div class="where">
          <address>
            ${escapeHtml(EVENT.street)}<br>
            ${escapeHtml(EVENT.city)}<br>
            ${escapeHtml(EVENT.eircode)}
          </address>
          <p class="map-link"><a class="button secondary" href="${EVENT.mapUrl}">Open the map</a></p>
        </div>
      </div>
    </section>`;

  return layout({
    title: "Innovation Galway × ElevenLabs",
    path: "/",
    body,
  });
}

function formShell({ path, title, lede, form }) {
  return layout({
    title,
    path,
    script: true,
    body: `<div class="wrap form-page">
      <div class="form-intro">
        <h1>${escapeHtml(title)}</h1>
        ${lede}
        <img class="intro-art" src="/art/voice-bubble.svg" alt="" width="360" height="300">
      </div>
      ${form}
    </div>`,
  });
}

export function renderSignup({ values, errors = [], formError = "" }) {
  const err = (field) => errorFor(errors, field);
  const form = `<form class="form" method="post" action="/signup" novalidate>
    ${formBanner(formError)}
    ${errorSummary(errors)}
    <fieldset>
      <legend>You</legend>
      ${field({ id: "first_name", name: "first_name", label: "First name", value: values.first_name, required: true, autocomplete: "given-name", error: err("first_name"), maxlength: 80 })}
      ${field({ id: "last_name", name: "last_name", label: "Last name", value: values.last_name, required: true, autocomplete: "family-name", error: err("last_name"), maxlength: 80 })}
      ${field({ id: "email", name: "email", type: "email", label: "Email", value: values.email, required: true, autocomplete: "email", inputmode: "email", error: err("email"), maxlength: 254 })}
      ${field({ id: "date_of_birth", name: "date_of_birth", type: "date", label: "Date of birth", value: values.date_of_birth, required: true, autocomplete: "bday", min: "2006-11-22", max: "2026-11-21", error: err("date_of_birth"), hint: "You need to be 19 or under on 21 November 2026." })}
      ${field({ id: "school", name: "school", label: "School", value: values.school, required: true, autocomplete: "organization", error: err("school"), maxlength: 160 })}
      ${shirtField(values.tshirt_size, err("tshirt_size"))}
    </fieldset>
    <fieldset>
      <legend>Parent or guardian</legend>
      <p class="hint">Required if you will be under 18 on 21 November 2026. Leave this blank if you will be 18 or 19.</p>
      ${field({ id: "guardian_name", name: "guardian_name", label: "Parent or guardian name", value: values.guardian_name, autocomplete: "section-guardian name", error: err("guardian_name"), maxlength: 80 })}
      ${field({ id: "guardian_email", name: "guardian_email", type: "email", label: "Parent or guardian email", value: values.guardian_email, autocomplete: "section-guardian email", inputmode: "email", error: err("guardian_email"), maxlength: 254 })}
      ${field({ id: "guardian_phone", name: "guardian_phone", type: "tel", label: "Parent or guardian phone", value: values.guardian_phone, autocomplete: "section-guardian tel", inputmode: "tel", error: err("guardian_phone"), maxlength: 30 })}
    </fieldset>
    <fieldset>
      <legend>The day</legend>
      ${field({ id: "dietary_needs", name: "dietary_needs", label: "Dietary needs", value: values.dietary_needs, error: err("dietary_needs"), maxlength: 400 })}
      ${field({ id: "allergies", name: "allergies", label: "Allergies", value: values.allergies, error: err("allergies"), maxlength: 400 })}
      ${field({ id: "how_heard", name: "how_heard", label: "How did you hear about this?", value: values.how_heard, error: err("how_heard"), maxlength: 300 })}
      <label class="check">
        <input type="checkbox" name="photo_consent" value="yes"${values.photo_consent ? " checked" : ""}>
        <span>I agree to being photographed at the event, and to the organisers using those photos to document the hackathon.</span>
      </label>
    </fieldset>
    <button class="button" type="submit">Sign me up</button>
  </form>`;

  return formShell({
    path: "/signup",
    title: "Sign up",
    lede: `<p>Students aged 19 and under. Free. ${escapeHtml(EVENT.dateLabel)}, ${escapeHtml(EVENT.venue)}, ${escapeHtml(EVENT.city)}.</p>
      <p>Already signed up? <a href="/submit">Submit a project</a> with the same email.</p>`,
    form,
  });
}

export function renderSignupThanks() {
  return layout({
    title: "You're signed up",
    path: "/signup",
    body: `<div class="wrap status-page">
      <p class="kicker">Sign up</p>
      <h1>You're signed up.</h1>
      <p class="lede">${escapeHtml(EVENT.dateLabel)}, 10am to 6pm, ${escapeHtml(EVENT.venue)}, ${escapeHtml(EVENT.street)}, ${escapeHtml(EVENT.city)}.</p>
      <p><a class="button" href="/submit">Submit a project</a></p>
    </div>`,
  });
}

export function renderSubmit({ values, errors = [], formError = "" }) {
  const err = (field) => errorFor(errors, field);
  const addressOpen = ["address1", "address2", "city", "state", "country", "zip"].some(
    (field) => values[field] || err(field),
  );
  const form = `<form class="form" method="post" action="/submit" novalidate>
    ${formBanner(formError)}
    ${errorSummary(errors)}
    <fieldset>
      <legend>You</legend>
      ${field({ id: "first_name", name: "first_name", label: "First name", value: values.first_name, required: true, autocomplete: "given-name", error: err("first_name"), maxlength: 80 })}
      ${field({ id: "last_name", name: "last_name", label: "Last name", value: values.last_name, required: true, autocomplete: "family-name", error: err("last_name"), maxlength: 80 })}
      ${field({ id: "email", name: "email", type: "email", label: "Email", value: values.email, required: true, autocomplete: "email", inputmode: "email", error: err("email"), hint: "The same email you used to sign up.", maxlength: 254 })}
      ${field({ id: "birthday", name: "birthday", type: "date", label: "Birthday", value: values.birthday, required: true, autocomplete: "bday", error: err("birthday") })}
      ${field({ id: "github_username", name: "github_username", label: "GitHub username", value: values.github_username, required: true, autocomplete: "username", error: err("github_username"), hint: "A username, or a github.com profile link." })}
    </fieldset>
    <fieldset>
      <legend>The project</legend>
      ${field({ id: "code_url", name: "code_url", type: "url", label: "Code URL", value: values.code_url, required: true, inputmode: "url", error: err("code_url"), hint: "Where the source lives." })}
      ${field({ id: "playable_url", name: "playable_url", type: "url", label: "Playable URL", value: values.playable_url, required: true, inputmode: "url", error: err("playable_url"), hint: "Where someone can try it." })}
      ${field({ id: "screenshot_url", name: "screenshot_url", type: "url", label: "Screenshot URL", value: values.screenshot_url, required: true, inputmode: "url", error: err("screenshot_url"), hint: "A public link to an image you have already hosted. This form does not upload files." })}
      ${field({ id: "description", name: "description", label: "Description", value: values.description, required: true, multiline: true, rows: 6, error: err("description"), hint: "What you built. Markdown is fine." })}
    </fieldset>
    <fieldset>
      <legend>Why it matters</legend>
      ${field({ id: "team_members", name: "team_members", label: "Team members", value: values.team_members, required: true, multiline: true, error: err("team_members"), hint: "Names of everyone on the project." })}
      ${field({ id: "elevenlabs_use", name: "elevenlabs_use", label: "How you used ElevenLabs", value: values.elevenlabs_use, required: true, multiline: true, error: err("elevenlabs_use") })}
      ${field({ id: "youth_impact", name: "youth_impact", label: "How it helps young people", value: values.youth_impact, required: true, multiline: true, error: err("youth_impact"), hint: "Tie it back to the challenge." })}
    </fieldset>
    <fieldset>
      <legend>Feedback</legend>
      ${field({ id: "how_heard", name: "how_heard", label: "How did you hear about this?", value: values.how_heard, required: true, multiline: true, error: err("how_heard") })}
      ${field({ id: "doing_well", name: "doing_well", label: "What are we doing well?", value: values.doing_well, required: true, multiline: true, error: err("doing_well") })}
      ${field({ id: "improve", name: "improve", label: "How can we improve?", value: values.improve, required: true, multiline: true, error: err("improve") })}
    </fieldset>
    <details class="address"${addressOpen ? " open" : ""}>
      <summary>Address, if you want to give one</summary>
      ${field({ id: "address1", name: "address1", label: "Address line 1", value: values.address1, autocomplete: "address-line1", error: err("address1"), maxlength: 120 })}
      ${field({ id: "address2", name: "address2", label: "Address line 2", value: values.address2, autocomplete: "address-line2", error: err("address2"), maxlength: 120 })}
      ${field({ id: "city", name: "city", label: "City", value: values.city, autocomplete: "address-level2", error: err("city"), maxlength: 120 })}
      ${field({ id: "state", name: "state", label: "State or province", value: values.state, autocomplete: "address-level1", error: err("state"), maxlength: 120 })}
      ${field({ id: "zip", name: "zip", label: "Postcode", value: values.zip, autocomplete: "postal-code", error: err("zip"), maxlength: 120 })}
      ${field({ id: "country", name: "country", label: "Country", value: values.country, autocomplete: "country-name", error: err("country"), maxlength: 120 })}
    </details>
    <button class="button" type="submit">Send in my project</button>
  </form>`;

  return formShell({
    path: "/submit",
    title: "Submit a project",
    lede: `<p>Use the email from your sign-up. Projects are reviewed by the organisers.</p>
      <p>Not signed up yet? <a href="/signup">Sign up first</a>.</p>`,
    form,
  });
}

export function renderSubmitThanks() {
  return layout({
    title: "Project submitted",
    path: "/submit",
    body: `<div class="wrap status-page">
      <p class="kicker">Submit</p>
      <h1>Project submitted.</h1>
      <p class="lede">It's in the review list. You can close this page.</p>
      <p><a href="/">Back to the event</a></p>
    </div>`,
  });
}

function formatWhen(value) {
  return new Intl.DateTimeFormat("en-IE", {
    timeZone: "Europe/Dublin",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function renderAdminLogin({ error = "" }) {
  return layout({
    title: "Admin",
    path: "/admin",
    robots: "noindex",
    script: true,
    body: `<div class="wrap status-page">
      <h1>Admin</h1>
      <form class="form login-form" method="post" action="/admin/login">
        ${formBanner(error)}
        ${field({
          id: "password",
          name: "password",
          type: "password",
          label: "Password",
          required: true,
          autocomplete: "current-password",
        })}
        <button class="button" type="submit">Enter</button>
      </form>
    </div>`,
  });
}

export function renderAdmin({ rows, dbError = "" }) {
  const reviewUrl = airtableReviewUrl();
  let summary = "";
  let table = "";
  if (dbError) {
    summary = `<p class="lede">${escapeHtml(dbError)}</p>`;
  } else {
    const under18 = rows.filter((row) => ageOn(String(row.date_of_birth).slice(0, 10)) < 18).length;
    const photos = rows.filter((row) => row.photo_consent).length;
    summary = `<p class="count">${rows.length} signed up <span>· ${under18} under 18 · ${photos} photo consent</span></p>`;
    if (rows.length === 0) {
      table = `<p class="lede">No sign-ups yet.</p>`;
    } else {
      const bodyRows = rows
        .map((row) => {
          const dob = String(row.date_of_birth).slice(0, 10);
          const cells = [
            row.first_name,
            row.last_name,
            row.email,
            dob,
            String(ageOn(dob)),
            row.school,
            row.tshirt_size,
            row.dietary_needs || "—",
            row.allergies || "—",
            row.guardian_name || "—",
            row.guardian_email || "—",
            row.guardian_phone || "—",
            row.photo_consent ? "Yes" : "No",
            row.how_heard || "—",
            formatWhen(row.created_at),
          ];
          return `<tr>${cells.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`;
        })
        .join("");
      table = `<div class="table-wrap">
        <table>
          <caption class="vh">Sign-ups</caption>
          <thead><tr>
            <th scope="col">First</th>
            <th scope="col">Last</th>
            <th scope="col">Email</th>
            <th scope="col">Born</th>
            <th scope="col">Age</th>
            <th scope="col">School</th>
            <th scope="col">Shirt</th>
            <th scope="col">Diet</th>
            <th scope="col">Allergies</th>
            <th scope="col">Guardian</th>
            <th scope="col">Guardian email</th>
            <th scope="col">Guardian phone</th>
            <th scope="col">Photo</th>
            <th scope="col">Heard</th>
            <th scope="col">Signed up</th>
          </tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;
    }
  }

  return layout({
    title: "Sign-ups",
    path: "/admin",
    robots: "noindex",
    body: `<div class="wrap admin-page">
      <div class="admin-head">
        <h1>Sign-ups</h1>
        <form method="post" action="/admin/logout"><button class="text-button" type="submit">Log out</button></form>
      </div>
      ${summary}
      <p class="admin-actions">
        ${dbError ? "" : '<a class="button" href="/admin/export.csv">Export CSV</a>'}
        <a class="button secondary" href="${escapeHtml(reviewUrl)}">Review submissions in Airtable</a>
      </p>
      <p class="hint">Submissions are reviewed in Airtable, not here. Sign-ups stay in Postgres.</p>
      ${table}
    </div>`,
  });
}

export function renderStatus({ title, heading, text, path = "/" }) {
  return layout({
    title,
    path,
    body: `<div class="wrap status-page">
      <h1>${escapeHtml(heading)}</h1>
      <p class="lede">${escapeHtml(text)}</p>
      <p><a href="/">Back to the event</a></p>
    </div>`,
  });
}
