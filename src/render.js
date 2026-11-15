import { asset } from "./assets.js";
import { EVENT, airtableReviewUrl } from "./constants.js";

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
  ["/#guides", "Guides"],
  ["/#partners", "Partners"],
  ["/submit", "Submit"],
];

function layout({ title, description, path, body, robots, script = false }) {
  const pageTitle = title.includes("ElevenLabs")
    ? title
    : `${title} · Innovation Galway × ElevenLabs`;
  const desc =
    description ||
    "Send in your Innovation Galway × ElevenLabs project. You need a GitHub link and a page someone can open.";
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
  <link rel="preload" href="${asset("/fonts/barlow-condensed-800-italic.woff2")}" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${asset("/styles.css")}">
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  <a class="hackclub-flag" href="https://hackclub.com">
    <img src="${asset("/art/flag-orpheus-top.svg")}" alt="Hack Club" width="280" height="158">
  </a>
  <header class="site-header">
    <div class="wrap header-bar">
      <a class="wordmark" href="/">Innovation Galway <span aria-hidden="true">×</span> ElevenLabs</a>
      <nav class="nav" aria-label="Primary">${nav}</nav>
    </div>
  </header>
  <main id="content">${body}</main>
  <footer class="site-footer">
    <img class="footer-rule" src="${asset("/art/wave-rule.svg")}" alt="">
    <div class="wrap footer-bar">
      <p>Hosted by ${escapeHtml(EVENT.hosts.join(" and "))}.</p>
      <p>${escapeHtml(EVENT.dateLabel)}, ${EVENT.start}–${EVENT.end}, ${escapeHtml(EVENT.venue)}, ${escapeHtml(EVENT.city)}.</p>
      <p><a href="/admin">Admin</a></p>
    </div>
  </footer>
  ${script ? `<script src="${asset("/form.js")}" defer></script>` : ""}
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

export function renderHome() {
  const partners = EVENT.partners
    .map((partner) => {
      if (partner.logo && partner.note) {
        return `<li><span class="partner-lockup"><img class="partner-mark" src="${escapeHtml(asset(partner.logo))}" alt="" width="${partner.logoWidth}" height="${partner.logoHeight}"><span class="partner-name">${escapeHtml(partner.note)}</span></span></li>`;
      }
      if (partner.logo) {
        return `<li><img class="partner-logo" src="${escapeHtml(asset(partner.logo))}" alt="${escapeHtml(partner.name)}" width="${partner.logoWidth}" height="${partner.logoHeight}"></li>`;
      }
      return `<li><span class="partner-name">${escapeHtml(partner.name)}</span></li>`;
    })
    .join("");

  const body = `<section class="hero">
      <img class="hero-globe" src="${asset("/art/globe-inked.svg")}" alt="">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <h1 class="hero-title" id="event-title">
            <span>Innovation</span>
            <span>Galway <span class="x">×</span></span>
            <span>ElevenLabs</span>
          </h1>
          <p class="tagline"><span>${escapeHtml(EVENT.tagline)}</span></p>
          <p class="lede">${escapeHtml(EVENT.line)} Ship it when the code is on GitHub and someone can open the project in a browser.</p>
          <div class="actions">
            <a class="button" href="/submit">Send in my project</a>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <img class="hooker" src="${asset("/art/hooker-sticker.svg")}" alt="" width="720" height="600">
          <img class="sticker sticker-age" src="${asset("/art/sticker-under19.svg")}" alt="" width="220" height="220">
          <img class="note" src="${asset("/art/note-credits.svg")}" alt="" width="420" height="200">
        </div>
      </div>
    </section>
    <section class="section paper" id="challenge">
      <div class="wrap brief">
        <div class="brief-head">
          <h2>${escapeHtml(EVENT.challenge)}</h2>
          <img class="brief-art" src="${asset("/art/voice-bubble.svg")}" alt="" width="360" height="300">
        </div>
        <div class="prose">
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
    <section class="section" id="guides">
      <div class="wrap split">
        <h2>How to ship your project</h2>
        <div>
          <p class="guide-lead">Do this in order. The form needs the GitHub link and a page someone can open.</p>
          <ol class="ship">
            <li>
              <span class="num">01</span>
              <div>
                <h3>Put the code on GitHub</h3>
                <p><a href="https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository">Create a repository</a>, then <a href="https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github">push the project</a>. Open the repository and copy the address from the browser. It looks like <span class="url">https://github.com/you/your-project</span>. That address is the code URL.</p>
              </div>
            </li>
            <li>
              <span class="num">02</span>
              <div>
                <h3>Host it so it has a playable URL</h3>
                <p>This link opens the project itself, not the GitHub page. A static site can use <a href="https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site">GitHub Pages</a>. Anything else can go on <a href="https://vercel.com/docs/getting-started-with-vercel">Vercel</a>. When the page loads, copy that address. That is the playable URL.</p>
              </div>
            </li>
            <li>
              <span class="num">03</span>
              <div>
                <h3>Write the README yourself</h3>
                <p>Use your own words. Don't paste a generated README. Say what it does, how to run it, how you used ElevenLabs, and what you learned. If you need the API, start at the <a href="https://elevenlabs.io/docs/eleven-api/quickstart">ElevenLabs quickstart</a>.</p>
              </div>
            </li>
            <li>
              <span class="num">04</span>
              <div>
                <h3>The rest of the form</h3>
                <p>Code URL from step 01. Playable URL from step 02. A screenshot: a picture of it running, already hosted, as a public link. A short description of what you built. Team members: the names of everyone on it.</p>
              </div>
            </li>
            <li>
              <span class="num">05</span>
              <div>
                <h3>Send it in</h3>
                <p><a class="button" href="/submit">Send in my project</a></p>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </section>
    <section class="section paper" id="partners">
      <div class="wrap partners-block">
        <h2>Made possible by</h2>
        <ul class="partners">${partners}</ul>
      </div>
    </section>
`;

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
        <img class="intro-art" src="${asset("/art/voice-bubble.svg")}" alt="" width="360" height="300">
      </div>
      ${form}
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
      ${field({ id: "email", name: "email", type: "email", label: "Email", value: values.email, required: true, autocomplete: "email", inputmode: "email", error: err("email"), maxlength: 254 })}
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
    lede: `<p>Projects are reviewed by the organisers.</p>`,
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

export function renderAdmin() {
  const reviewUrl = airtableReviewUrl();
  return layout({
    title: "Admin",
    path: "/admin",
    robots: "noindex",
    body: `<div class="wrap admin-page">
      <div class="admin-head">
        <h1>Submissions</h1>
        <form method="post" action="/admin/logout"><button class="text-button" type="submit">Log out</button></form>
      </div>
      <p class="lede">Projects are reviewed in Airtable.</p>
      <p class="admin-actions">
        <a class="button" href="${escapeHtml(reviewUrl)}">Review submissions in Airtable</a>
      </p>
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
