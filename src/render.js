import { displayName, isAdminEmail } from "./auth.js";
import { asset } from "./assets.js";

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

function layout({ title, body, robots, script = false, wide = false }) {
  const pageTitle = title.includes("ElevenLabs")
    ? title
    : `${title} · Innovation Galway × ElevenLabs`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="Send in a project for Innovation Galway × ElevenLabs.">
  ${robots ? `<meta name="robots" content="${escapeHtml(robots)}">` : ""}
  <link rel="stylesheet" href="${asset("/styles.css")}">
</head>
<body>
  <main id="content"${wide ? ' class="wide"' : ""}>${body}</main>
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
  step,
  accept,
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
  const minAttr = min != null && min !== "" ? ` min="${escapeHtml(min)}"` : "";
  const maxAttr = max != null && max !== "" ? ` max="${escapeHtml(max)}"` : "";
  const stepAttr = step ? ` step="${escapeHtml(step)}"` : "";
  const acceptAttr = accept ? ` accept="${escapeHtml(accept)}"` : "";
  const common = `id="${escapeHtml(id)}" name="${escapeHtml(name)}"${requiredAttr}${auto}${maxLength}${mode}${minAttr}${maxAttr}${stepAttr}${acceptAttr}${invalid}${describedAttr}`;
  const control = multiline
    ? `<textarea ${common} rows="${Number(rows)}">${escapeHtml(value)}</textarea>`
    : `<input type="${escapeHtml(type)}" ${common}${type === "file" ? "" : ` value="${escapeHtml(value)}"`}>`;
  return `<div class="field">
    <label for="${escapeHtml(id)}">${escapeHtml(label)}${required ? ' <span class="req">Required</span>' : ""}</label>
    ${control}
    ${hint ? `<p class="hint" id="${id}-hint">${escapeHtml(hint)}</p>` : ""}
    ${error ? `<p class="field-error" id="${id}-error">${escapeHtml(error)}</p>` : ""}
  </div>`;
}

function sessionBar(session) {
  if (!session) return "";
  const review = isAdminEmail(session.email) ? `<a href="/admin">Review projects</a>` : "";
  return `<div class="session">
    <p>Signed in as ${escapeHtml(displayName(session))}.</p>
    ${review}
    <form method="post" action="/auth/logout"><button class="text-button" type="submit">Sign out</button></form>
  </div>`;
}

export function renderSignIn({ authError = "" } = {}) {
  return layout({
    title: "Innovation Galway × ElevenLabs",
    body: `<h1>Innovation Galway × ElevenLabs</h1>
      ${authError ? `<div class="error-summary" role="alert"><p>${escapeHtml(authError)}</p></div>` : ""}
      <p>Sign in with Hack Club to send in a project.</p>
      <p><a class="button" href="/auth/login">Sign in with Hack Club</a></p>
      <p class="hint">No Hack Club account? It takes a minute, you'll make one as you sign in.</p>`,
  });
}

export function renderSubmit({ values, errors = [], formError = "", session = null, prefilled = false }) {
  const err = (name) => errorFor(errors, name);
  const form = `<form class="form" method="post" action="/submit" enctype="multipart/form-data" novalidate>
    ${formBanner(formError)}
    ${errorSummary(errors)}
    <fieldset>
      <legend>You</legend>
      ${prefilled ? `<p class="hint">We filled these in from your Hack Club account. Change anything that's wrong.</p>` : ""}
      ${field({ id: "first_name", name: "first_name", label: "First name", value: values.first_name, required: true, autocomplete: "given-name", error: err("first_name"), maxlength: 80 })}
      ${field({ id: "last_name", name: "last_name", label: "Last name", value: values.last_name, required: true, autocomplete: "family-name", error: err("last_name"), maxlength: 80 })}
      ${field({ id: "email", name: "email", type: "email", label: "Email", value: values.email, required: true, autocomplete: "email", inputmode: "email", error: err("email"), maxlength: 254 })}
      ${field({ id: "birthday", name: "birthday", type: "date", label: "Birthday", value: values.birthday, required: true, autocomplete: "bday", error: err("birthday") })}
      ${field({ id: "address1", name: "address1", label: "Address line 1", value: values.address1, required: true, autocomplete: "address-line1", error: err("address1"), maxlength: 120 })}
      ${field({ id: "address2", name: "address2", label: "Address line 2", value: values.address2, autocomplete: "address-line2", error: err("address2"), maxlength: 120 })}
      ${field({ id: "city", name: "city", label: "City", value: values.city, required: true, autocomplete: "address-level2", error: err("city"), maxlength: 120 })}
      ${field({ id: "state", name: "state", label: "State or province", value: values.state, autocomplete: "address-level1", error: err("state"), maxlength: 120 })}
      ${field({ id: "zip", name: "zip", label: "ZIP or postcode", value: values.zip, required: true, autocomplete: "postal-code", error: err("zip"), maxlength: 120 })}
      ${field({ id: "country", name: "country", label: "Country", value: values.country, required: true, autocomplete: "country-name", error: err("country"), maxlength: 120 })}
    </fieldset>
    <fieldset>
      <legend>The project</legend>
      ${field({ id: "project_name", name: "project_name", label: "Project name", value: values.project_name, error: err("project_name"), maxlength: 120, hint: "Optional. If you leave it blank, we use the name from the code link." })}
      ${field({ id: "code_url", name: "code_url", type: "url", label: "Code URL", value: values.code_url, required: true, inputmode: "url", error: err("code_url"), hint: "Where the source lives." })}
      ${field({ id: "playable_url", name: "playable_url", type: "url", label: "Playable URL", value: values.playable_url, required: true, inputmode: "url", error: err("playable_url"), hint: "Where someone can try it." })}
      ${field({ id: "screenshot", name: "screenshot", type: "file", label: "Screenshot", accept: "image/png,image/jpeg,image/webp,image/gif", error: err("screenshot"), hint: "PNG, JPEG, WebP, or GIF. 5 MB maximum. This stays on the server until a reviewer approves it." })}
      ${field({ id: "screenshot_url", name: "screenshot_url", type: "url", label: "Screenshot URL", value: values.screenshot_url, inputmode: "url", error: err("screenshot_url"), hint: "Optional if you uploaded a file. A public link to an image you have already hosted." })}
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
    <button class="button" type="submit">Send in my project</button>
  </form>`;

  return layout({
    title: "Innovation Galway × ElevenLabs",
    script: true,
    body: `<h1>Innovation Galway × ElevenLabs</h1>
    ${sessionBar(session)}
    ${form}`,
  });
}

export function renderSubmitThanks() {
  return layout({
    title: "Project submitted",
    body: `<h1>Project submitted.</h1>
      <p>Thanks! We've got it. An organiser will review it.</p>
      <p><a href="/submit">Back to the form</a></p>`,
  });
}

export function renderStatus({ title, heading, text }) {
  return layout({
    title,
    body: `<h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(text)}</p>
      <p><a href="/submit">Back to the form</a></p>`,
  });
}

const STATUS_LABEL = { pending: "Pending", approved: "Approved", rejected: "Rejected" };

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function link(url) {
  const safe = safeHttpUrl(url);
  if (!safe) return escapeHtml(url || "");
  return `<a href="${escapeHtml(safe)}">${escapeHtml(safe)}</a>`;
}

function formatWhen(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IE", {
    timeZone: "Europe/Dublin",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAddress(submission) {
  const cityLine = [submission.city, submission.state, submission.zip].filter(Boolean).join(", ");
  return [submission.address1, submission.address2, cityLine, submission.country].filter(Boolean).join("\n");
}

function definition(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${value}</dd>`;
}

function prose(label, value) {
  return `<h3>${escapeHtml(label)}</h3><p class="prose">${escapeHtml(value || "")}</p>`;
}

function reviewForm(submission, { syncEnabled, actionError, draft }) {
  if (submission.status !== "pending") {
    const note = submission.reviewerFeedback
      ? `<p class="prose">${escapeHtml(submission.reviewerFeedback)}</p>`
      : "";
    const when = submission.reviewedAt
      ? `<p class="hint">Reviewed ${escapeHtml(formatWhen(submission.reviewedAt))}${submission.reviewerName ? ` by ${escapeHtml(submission.reviewerName)}` : ""}.</p>`
      : "";
    const syncError = submission.airtableError
      ? `<p class="field-error">${escapeHtml(submission.airtableError)}</p>`
      : "";
    return `${when}${note}${syncError}`;
  }
  const message = actionError?.id === submission.id ? actionError.message : "";
  const note = draft?.id === submission.id ? draft.note || "" : "";
  const hours = draft?.id === submission.id ? draft.hours || "" : "";
  return `<form method="post" action="/admin/submissions/${submission.id}">
    ${message ? `<p class="field-error">${escapeHtml(message)}</p>` : ""}
    ${field({
      id: `note-${submission.id}`,
      name: "note",
      label: "Note",
      value: note,
      multiline: true,
      rows: 3,
      hint: "Optional. The person who sent this in does not see it here.",
    })}
    ${
      syncEnabled
        ? field({
            id: `hours-${submission.id}`,
            name: "approved_hours",
            type: "number",
            label: "Approved hours",
            value: hours,
            min: "0",
            max: "200",
            step: "0.01",
            hint: "Needed to send an approval to the YSWS table.",
          })
        : ""
    }
    <div class="actions">
      <button class="button" type="submit" name="decision" value="approve">Approve</button>
      <button class="button secondary" type="submit" name="decision" value="reject">Reject</button>
    </div>
  </form>`;
}

function submissionCard(submission, options) {
  const status = STATUS_LABEL[submission.status] || submission.status;
  const shot = submission.hasScreenshot
    ? `<img class="shot" src="/admin/submissions/${submission.id}/screenshot" alt="Screenshot of ${escapeHtml(submission.projectName)}">`
    : "";
  const hosted = submission.screenshotUrl
    ? `<p>Screenshot link: ${link(submission.screenshotUrl)}</p>`
    : "";
  return `<article class="card" id="submission-${submission.id}">
    <div class="card-head">
      <h2>${escapeHtml(submission.projectName)}</h2>
      <p class="status ${escapeHtml(submission.status)}">${escapeHtml(status)}</p>
    </div>
    <p class="hint">Sent ${escapeHtml(formatWhen(submission.createdAt))}</p>
    <dl>
      ${definition("Name", escapeHtml(`${submission.firstName} ${submission.lastName}`.trim()))}
      ${definition("Email", escapeHtml(submission.email))}
      ${definition("Birthday", escapeHtml(submission.birthday || ""))}
      ${definition("Address", `<span class="prose">${escapeHtml(formatAddress(submission))}</span>`)}
      ${definition("Hack Club ID", escapeHtml(submission.hackclubId || ""))}
      ${definition("Code", link(submission.codeUrl))}
      ${definition("Playable", link(submission.playableUrl))}
    </dl>
    ${shot}
    ${hosted}
    ${prose("Description", submission.description)}
    ${prose("Team members", submission.teamMembers)}
    ${prose("How they used ElevenLabs", submission.elevenLabsUse)}
    ${prose("How it helps young people", submission.youthImpact)}
    ${prose("How they heard about this", submission.howHeard)}
    ${prose("What we are doing well", submission.doingWell)}
    ${prose("How we can improve", submission.improve)}
    ${reviewForm(submission, options)}
  </article>`;
}

export function renderAdmin({ submissions, session, syncEnabled = false, actionError = null, draft = null }) {
  const count = submissions.length;
  const list = count
    ? submissions.map((submission) => submissionCard(submission, { syncEnabled, actionError, draft })).join("")
    : `<p>No projects yet.</p>`;
  return layout({
    title: "Review",
    robots: "noindex",
    wide: true,
    body: `<h1>Review</h1>
      <div class="session">
        <p>Signed in as ${escapeHtml(displayName(session))}.</p>
        <a href="/submit">Project form</a>
        <form method="post" action="/auth/logout"><button class="text-button" type="submit">Sign out</button></form>
      </div>
      <p>${count === 1 ? "1 project" : `${count} projects`}, newest first.</p>
      ${list}`,
  });
}
