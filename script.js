(function () {
  "use strict";

  const STORAGE_KEY = "restroomPasses";
  const REFRESH_INTERVAL = 1000;

  function readPasses() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const passes = JSON.parse(stored);
      if (!Array.isArray(passes)) throw new Error("Saved pass data is not a list.");
      return passes.filter((pass) => pass && typeof pass === "object" && typeof pass.id === "string");
    } catch (error) {
      console.error("Could not read restroom pass data.", error);
      showStorageError();
      return null;
    }
  }

  function writePasses(passes) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(passes));
      return true;
    } catch (error) {
      console.error("Could not save restroom pass data.", error);
      showStorageError();
      return false;
    }
  }

  function showStorageError() {
    const formMessage = document.getElementById("form-message");
    if (formMessage) {
      formMessage.textContent = "Pass data could not be accessed. Please check that browser storage is enabled.";
      formMessage.classList.add("is-error");
    }
    const teacherMessage = document.getElementById("teacher-message");
    if (teacherMessage) {
      teacherMessage.textContent = "Pass data could not be accessed. Please check that browser storage is enabled.";
      teacherMessage.classList.add("is-error");
      teacherMessage.hidden = false;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Time unavailable";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function sortedPasses() {
    const passes = readPasses();
    if (!passes) return [];
    return passes.sort((first, second) => {
      const firstTime = new Date(first.requestedAt).getTime() || 0;
      const secondTime = new Date(second.requestedAt).getTime() || 0;
      return secondTime - firstTime;
    });
  }

  function statusLabel(status) {
    if (status === "approved") return "Pass approved";
    if (status === "returned") return "Returned";
    return "Pending";
  }

  function statusClass(status) {
    if (status === "approved") return "status-approved";
    if (status === "returned") return "status-returned";
    return "status-pending";
  }

  function initStudentPage() {
    const form = document.getElementById("request-form");
    const nameInput = document.getElementById("student-name");
    const noteInput = document.getElementById("note");
    const list = document.getElementById("student-passes");
    const message = document.getElementById("form-message");
    const statusHint = document.querySelector(".status-hint");
    let lastRenderKey;

    function render() {
      const name = nameInput.value.trim();
      const passes = sortedPasses().filter((pass) => (
        name && typeof pass.studentName === "string" && pass.studentName.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
      ));
      const renderKey = JSON.stringify({ name, passes });
      if (renderKey === lastRenderKey) return;
      lastRenderKey = renderKey;

      if (!name) {
        statusHint.textContent = "Enter your name above to see your requests and their latest updates.";
        list.innerHTML = "";
        return;
      }

      statusHint.textContent = passes.length
        ? "Here are your latest passes. This list refreshes automatically."
        : "No passes found for this name yet. Submit a request to get started.";

      list.innerHTML = passes.length ? passes.map((pass) => `
        <article class="student-pass">
          <div class="student-pass-top">
            <div>
              <h3>${escapeHtml(pass.reason || "Pass request")}</h3>
              <p class="pass-meta">Requested ${escapeHtml(formatDate(pass.requestedAt))}</p>
              ${pass.status === "returned" && pass.returnedAt ? `<p class="pass-meta">Checked back in ${escapeHtml(formatDate(pass.returnedAt))}</p>` : ""}
            </div>
            <span class="status-badge ${statusClass(pass.status)}">${statusLabel(pass.status)}</span>
          </div>
          ${pass.note ? `<p class="pass-note">${escapeHtml(pass.note)}</p>` : ""}
          ${pass.status === "approved" ? `<button class="button button-soft" type="button" data-check-in="${escapeHtml(pass.id)}">Check Back In <span aria-hidden="true">✓</span></button>` : ""}
        </article>
      `).join("") : "";
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      message.textContent = "";
      message.classList.remove("is-error");

      const formData = new FormData(form);
      const studentName = String(formData.get("studentName") || "").trim();
      const reason = String(formData.get("reason") || "");
      if (!studentName || !reason) {
        message.textContent = "Please enter your name and choose a reason.";
        message.classList.add("is-error");
        return;
      }

      const pass = {
        id: window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        studentName,
        reason,
        note: String(noteInput.value || "").trim(),
        status: "pending",
        requestedAt: new Date().toISOString(),
        grantedAt: null,
        returnedAt: null
      };

      const passes = readPasses();
      if (!passes) return;
      passes.push(pass);
      if (!writePasses(passes)) return;

      nameInput.value = studentName;
      noteInput.value = "";
      form.elements.reason.value = "";
      message.textContent = "Your pass request was sent to your teacher.";
      render();
    });

    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-check-in]");
      if (!button) return;

      const passes = readPasses();
      if (!passes) return;
      const pass = passes.find((item) => item.id === button.dataset.checkIn);
      if (!pass || pass.status !== "approved") return;
      pass.status = "returned";
      pass.returnedAt = new Date().toISOString();
      if (writePasses(passes)) render();
    });

    nameInput.addEventListener("input", render);
    window.addEventListener("storage", render);
    window.setInterval(render, REFRESH_INTERVAL);
    render();
  }

  function initTeacherPage() {
    const list = document.getElementById("teacher-passes");
    const count = document.getElementById("request-count");
    let lastRenderKey;

    function render() {
      const passes = sortedPasses();
      const renderKey = JSON.stringify(passes);
      if (renderKey === lastRenderKey) return;
      lastRenderKey = renderKey;
      count.textContent = String(passes.length);
      if (!passes.length) {
        list.innerHTML = '<div class="empty-state">No pass requests yet. New requests will appear here as soon as they are sent. 🌿</div>';
        return;
      }

      list.innerHTML = passes.map((pass) => `
        <article class="teacher-pass">
          <div class="teacher-pass-top">
            <div>
              <h3>${escapeHtml(pass.studentName || "Student")}</h3>
              <p class="pass-meta">${escapeHtml(pass.reason || "Pass request")} · Requested ${escapeHtml(formatDate(pass.requestedAt))}</p>
              ${pass.grantedAt ? `<p class="pass-meta">Granted ${escapeHtml(formatDate(pass.grantedAt))}</p>` : ""}
              ${pass.returnedAt ? `<p class="pass-meta">Checked in ${escapeHtml(formatDate(pass.returnedAt))}</p>` : ""}
            </div>
            <span class="status-badge ${statusClass(pass.status)}">${statusLabel(pass.status)}</span>
          </div>
          ${pass.note ? `<p class="pass-note">${escapeHtml(pass.note)}</p>` : ""}
          <div class="teacher-actions">
            ${pass.status === "pending" ? `<button class="button button-soft" type="button" data-action="grant" data-id="${escapeHtml(pass.id)}">Grant Pass</button>` : ""}
            ${pass.status === "approved" ? `<button class="button button-warm" type="button" data-action="clock-in" data-id="${escapeHtml(pass.id)}">Clock Back In</button>` : ""}
            <button class="button button-danger" type="button" data-action="remove" data-id="${escapeHtml(pass.id)}">Remove</button>
          </div>
        </article>
      `).join("");
    }

    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const action = button.dataset.action;
      const passes = readPasses();
      if (!passes) return;
      const index = passes.findIndex((pass) => pass.id === button.dataset.id);
      if (index < 0) return;

      if (action === "remove") {
        passes.splice(index, 1);
      } else if (action === "grant" && passes[index].status === "pending") {
        passes[index].status = "approved";
        passes[index].grantedAt = new Date().toISOString();
      } else if (action === "clock-in" && passes[index].status === "approved") {
        passes[index].status = "returned";
        passes[index].returnedAt = new Date().toISOString();
      } else {
        return;
      }

      if (writePasses(passes)) render();
    });

    window.addEventListener("storage", render);
    window.setInterval(render, REFRESH_INTERVAL);
    render();
  }

  const page = document.body.dataset.page;
  if (page === "student") initStudentPage();
  if (page === "teacher") initTeacherPage();
})();
