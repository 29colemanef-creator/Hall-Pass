"use strict";

const form = document.querySelector("#pass-form");
const passList = document.querySelector("#pass-list");
const formMessage = document.querySelector("#form-message");
const listMessage = document.querySelector("#list-message");
const refreshButton = document.querySelector("#refresh-button");

const counters = {
  total: document.querySelector("#total-count"),
  pending: document.querySelector("#pending-count"),
  approved: document.querySelector("#approved-count"),
  denied: document.querySelector("#denied-count")
};

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.error === "string") message = body.error;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeAction(label, action, passId, className) {
  const button = makeElement("button", `button ${className}`, label);
  button.type = "button";
  button.dataset.action = action;
  button.dataset.id = passId;
  return button;
}

function renderPass(pass) {
  const item = makeElement("article", "pass-item");
  const main = makeElement("div", "pass-main");
  const details = makeElement("div", "pass-details");
  const student = makeElement("h3", "pass-student", pass.studentName);
  const destination = makeElement("p", "pass-destination", `Destination: ${pass.destination}`);
  const badge = makeElement("span", `status-badge status-${pass.status}`, pass.status[0].toUpperCase() + pass.status.slice(1));

  details.append(student, destination);
  main.append(details, badge);
  item.append(main);

  const reason = makeElement("p", "pass-reason", pass.reason);
  item.append(reason);

  const meta = makeElement("div", "pass-meta");
  meta.append(
    makeElement("span", "", `Issued by ${pass.issuedBy}`),
    makeElement("span", "", `Created ${formatDate(pass.createdAt)}`)
  );
  if (pass.updatedAt) {
    meta.append(makeElement("span", "", `Updated ${formatDate(pass.updatedAt)}`));
  }
  item.append(meta);

  const actions = makeElement("div", "pass-actions");
  if (pass.status === "pending") {
    actions.append(
      makeAction("Approve", "approve", pass.id, "button-approve"),
      makeAction("Deny", "deny", pass.id, "button-deny")
    );
  }
  actions.append(makeAction("Delete", "delete", pass.id, "button-delete"));
  item.append(actions);
  return item;
}

function renderPasses(passes) {
  const counts = { pending: 0, approved: 0, denied: 0 };
  for (const pass of passes) {
    if (Object.hasOwn(counts, pass.status)) counts[pass.status] += 1;
  }
  counters.total.textContent = String(passes.length);
  counters.pending.textContent = String(counts.pending);
  counters.approved.textContent = String(counts.approved);
  counters.denied.textContent = String(counts.denied);
  document.querySelector("#list-count").textContent = String(passes.length);

  passList.replaceChildren();
  if (!passes.length) {
    passList.append(makeElement("div", "empty-state", "No passes yet. Create a pass to get started."));
    return;
  }

  const newestFirst = [...passes].sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
  passList.append(...newestFirst.map(renderPass));
}

async function loadPasses() {
  refreshButton.disabled = true;
  try {
    const passes = await apiRequest("/api/passes");
    if (!Array.isArray(passes)) throw new Error("The server returned an invalid pass list.");
    renderPasses(passes);
    showMessage(listMessage, "");
  } catch (error) {
    showMessage(listMessage, `Could not load passes. ${error.message}`, true);
    passList.replaceChildren(makeElement("div", "empty-state", "Passes are unavailable. Check that the server is running and try refreshing."));
  } finally {
    refreshButton.disabled = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(formMessage, "");
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  const formData = new FormData(form);
  const pass = {
    studentName: String(formData.get("studentName") || "").trim(),
    destination: String(formData.get("destination") || "").trim(),
    reason: String(formData.get("reason") || "").trim(),
    issuedBy: String(formData.get("issuedBy") || "").trim()
  };

  try {
    await apiRequest("/api/passes", {
      method: "POST",
      body: JSON.stringify(pass)
    });
    form.reset();
    showMessage(formMessage, "Pass created and awaiting a decision.");
    await loadPasses();
  } catch (error) {
    showMessage(formMessage, error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

passList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  button.disabled = true;
  showMessage(listMessage, "");

  try {
    if (action === "delete") {
      await apiRequest(`/api/passes/${encodeURIComponent(id)}`, { method: "DELETE" });
      showMessage(listMessage, "Pass deleted.");
    } else if (action === "approve" || action === "deny") {
      await apiRequest(`/api/passes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: action === "approve" ? "approved" : "denied" })
      });
      showMessage(listMessage, `Pass ${action === "approve" ? "approved" : "denied"}.`);
    }
    await loadPasses();
  } catch (error) {
    showMessage(listMessage, error.message, true);
    await loadPasses();
  }
});

refreshButton.addEventListener("click", loadPasses);
loadPasses();
