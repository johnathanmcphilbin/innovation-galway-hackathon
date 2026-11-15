function arm(button) {
  if (button.dataset.label) return;
  button.dataset.label = button.textContent;
}

function restore(button) {
  button.disabled = false;
  if (button.dataset.label) button.textContent = button.dataset.label;
}

document.querySelectorAll("form[data-confirm]").forEach((form) => {
  form.addEventListener(
    "submit",
    (event) => {
      if (!window.confirm(form.getAttribute("data-confirm"))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
});

document.querySelectorAll("form").forEach((form) => {
  form.addEventListener("submit", () => {
    const button = form.querySelector('button[type="submit"]');
    if (!button || button.disabled) return;
    arm(button);
    button.disabled = true;
    button.textContent = "Sending…";
  });
});

window.addEventListener("pageshow", () => {
  document.querySelectorAll('button[type="submit"]').forEach(restore);
});
