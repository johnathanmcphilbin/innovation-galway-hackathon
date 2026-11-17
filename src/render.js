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

function layout({ title, body, robots, script = false }) {
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
  <main id="content">${body}</main>
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

export function renderSubmit({ values, errors = [], formError = "" }) {
  const err = (field) => errorFor(errors, field);
  const addressOpen = ["address1", "address2", "city", "state", "country", "zip"].some(
    (field) => values[field] || err(field),
  );
  const form = `<form class="form" method="post" action="/submit" enctype="multipart/form-data" novalidate>
    ${formBanner(formError)}
    ${errorSummary(errors)}
    <fieldset>
      <legend>You</legend>
      ${field({ id: "first_name", name: "first_name", label: "First name", value: values.first_name, required: true, autocomplete: "given-name", error: err("first_name"), maxlength: 80 })}
      ${field({ id: "last_name", name: "last_name", label: "Last name", value: values.last_name, required: true, autocomplete: "family-name", error: err("last_name"), maxlength: 80 })}
      ${field({ id: "email", name: "email", type: "email", label: "Email", value: values.email, required: true, autocomplete: "email", inputmode: "email", error: err("email"), maxlength: 254 })}
      ${field({ id: "birthday", name: "birthday", type: "date", label: "Birthday", value: values.birthday, required: true, autocomplete: "bday", error: err("birthday") })}
      ${field({ id: "github_username", name: "github_username", label: "GitHub username", value: values.github_username, required: true, autocomplete: "username", error: err("github_username"), hint: "A username, or a github.com profile link." })}
      ${field({ id: "hackatime_id", name: "hackatime_id", label: "Hackatime ID", value: values.hackatime_id, error: err("hackatime_id"), maxlength: 80, hint: "Optional. Leave this blank if you don't have one." })}
    </fieldset>
    <fieldset>
      <legend>The project</legend>
      ${field({ id: "project_name", name: "project_name", label: "Project name", value: values.project_name, error: err("project_name"), maxlength: 120, hint: "Optional. If you leave it blank, the review uses the GitHub repository name." })}
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

  return layout({
    title: "Innovation Galway × ElevenLabs",
    script: true,
    body: `<h1>Innovation Galway × ElevenLabs</h1>
    ${form}`,
  });
}

export function renderSubmitThanks() {
  return layout({
    title: "Project submitted",
    body: `<h1>Project submitted.</h1>
      <p>It's in the review list. An organiser will look at it before it goes to the YSWS table.</p>
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
