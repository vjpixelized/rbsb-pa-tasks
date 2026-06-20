(function () {
  var PA_LIST = [
    "Abraham Soto",
    "Jacob Rodriguez",
    "Uncas Castillo",
    "Mickey Maruri",
    "Dante Magallanes",
    "Memo Ramirez",
    "Jorge Acuña",
    "Billy Bacmeister",
    "Luca Di Maio",
    "Oscar Morales",
    "Fernando Lopez"
  ];

  var STATUS_LABELS = {
    pending: "Pendiente",
    active: "En proceso",
    done: "Terminada"
  };

  var AREA_ORDER = [
    "General",
    "Control",
    "Carpa Comedor",
    "Baño 1",
    "Baño 2",
    "PO",
    "Host Room",
    "Entrada casa",
    "Cocina cast",
    "Sala Cast",
    "Alberca 1",
    "Alberca 2",
    "Chapel",
    "Cuarto de entrevista 2ndo piso",
    "Cuarto de entrevista Abajo",
    "Game room",
    "Audio",
    "Camera",
    "Playa",
    "cochera casa",
    "Catering",
    "Crafty",
    "Ratonera de Micky",
    "Lighting",
    "Caseta de Seguridad",
    "Barra 1 (afuera)",
    "Barra 2 (adentro)",
    "Otro"
  ];

  var STORAGE_PREFIX = "rbsb-pa-tasks";
  var PA_STORAGE_KEY = "rbsb-pa-current-pa";
  var MANAGER_NAME = "Abraham Soto";
  var MANAGER_PIN = "2468";
  var MANAGER_AUTH_KEY = "rbsb-pa-manager-auth";

  var state = {
    today: todayKey(),
    tasks: [],
    filter: "pending",
    currentPa: readStorage(PA_STORAGE_KEY, ""),
    client: null,
    table: "pa_tasks",
    realtimeChannel: null,
    managerOpen: false
  };

  var els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    if (state.currentPa === MANAGER_NAME && !isManagerAuthenticated()) {
      state.currentPa = "";
      writeStorage(PA_STORAGE_KEY, "");
    }
    bindEvents();
    renderDate();
    renderPa();
    renderPaList();
    await initBackend();
    await loadTasks();
    if (state.currentPa === MANAGER_NAME && isManagerAuthenticated()) {
      state.managerOpen = true;
      els.managerPanel.hidden = false;
      renderManager();
    }
    if (!state.currentPa) openPaModal(true);
  }

  function cacheElements() {
    els.dateLine = document.getElementById("dateLine");
    els.currentPa = document.getElementById("currentPa");
    els.paButton = document.getElementById("paButton");
    els.paModal = document.getElementById("paModal");
    els.paModalClose = document.getElementById("paModalClose");
    els.paList = document.getElementById("paList");
    els.syncState = document.getElementById("syncState");
    els.refreshBtn = document.getElementById("refreshBtn");
    els.addTaskForm = document.getElementById("addTaskForm");
    els.newTaskTitle = document.getElementById("newTaskTitle");
    els.newTaskArea = document.getElementById("newTaskArea");
    els.taskList = document.getElementById("taskList");
    els.pendingCount = document.getElementById("pendingCount");
    els.activeCount = document.getElementById("activeCount");
    els.doneCount = document.getElementById("doneCount");
    els.managerPanel = document.getElementById("managerPanel");
    els.managerContent = document.getElementById("managerContent");
    els.managerCloseBtn = document.getElementById("managerCloseBtn");
    els.managerModal = document.getElementById("managerModal");
    els.managerForm = document.getElementById("managerForm");
    els.managerPin = document.getElementById("managerPin");
    els.managerError = document.getElementById("managerError");
  }

  function bindEvents() {
    els.paButton.addEventListener("click", function () {
      openPaModal(false);
    });

    els.refreshBtn.addEventListener("click", loadTasks);
    els.addTaskForm.addEventListener("submit", handleAddTask);
    els.taskList.addEventListener("click", handleTaskAction);

    document.querySelectorAll(".tab-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll(".tab-btn").forEach(function (btn) {
          btn.classList.remove("active");
        });
        button.classList.add("active");
        state.filter = button.dataset.filter || "pending";
        render();
      });
    });

    document.querySelectorAll("[data-close-modal]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeModal(button.dataset.closeModal);
      });
    });

    els.paModal.addEventListener("click", function (event) {
      if (event.target === els.paModal && state.currentPa) closeModal("paModal");
    });

    els.managerModal.addEventListener("click", function (event) {
      if (event.target === els.managerModal) closeModal("managerModal");
    });

    els.managerForm.addEventListener("submit", handleManagerLogin);
    els.managerCloseBtn.addEventListener("click", function () {
      state.managerOpen = false;
      els.managerPanel.hidden = true;
    });
  }

  async function initBackend() {
    var config = window.PA_TASKS_SUPABASE || {};
    state.table = config.table || "pa_tasks";

    if (!config.url || !config.anonKey) {
      setSyncState("local", "Local");
      return;
    }

    try {
      if (!window.supabase) {
        await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
      }
      var client = window.supabase.createClient(config.url, config.anonKey);
      var ping = await client.from(state.table).select("id").limit(1);
      if (ping.error) throw ping.error;
      state.client = client;
      setSyncState("online", "En vivo");
      subscribeRealtime();
    } catch (error) {
      console.warn("Supabase unavailable, using local mode", error);
      state.client = null;
      setSyncState("error", "Local");
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function subscribeRealtime() {
    if (!state.client) return;
    state.realtimeChannel = state.client
      .channel("pa_tasks_" + state.today)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: state.table,
          filter: "work_date=eq." + state.today
        },
        loadTasks
      )
      .subscribe();
  }

  async function loadTasks() {
    if (state.client) {
      var result = await state.client
        .from(state.table)
        .select("*")
        .eq("work_date", state.today)
        .is("fixed_key", null)
        .order("created_at", { ascending: true });

      if (result.error) {
        console.error(result.error);
        setSyncState("error", "Error");
        return;
      }

      state.tasks = (result.data || []).map(normalizeTask).filter(isUserTask);
      setSyncState("online", "En vivo");
      render();
      return;
    }

    try {
      state.tasks = JSON.parse(readStorage(storageKey(), "[]")).map(normalizeTask).filter(isUserTask);
    } catch (error) {
      state.tasks = [];
    }
    render();
  }

  async function handleAddTask(event) {
    event.preventDefault();
    if (!requirePa()) return;

    var title = els.newTaskTitle.value.trim();
    if (!title) {
      els.newTaskTitle.focus();
      return;
    }

    var task = normalizeTask({
      id: makeLocalId(),
      work_date: state.today,
      fixed_key: null,
      title: title,
      area: els.newTaskArea.value || "General",
      detail: "",
      status: "pending",
      assignee: "",
      notes: "",
      created_by: state.currentPa,
      created_at: nowIso(),
      updated_at: nowIso(),
      started_at: null,
      completed_at: null
    });

    await insertTask(task);
    els.newTaskTitle.value = "";
    await loadTasks();
  }

  async function insertTask(task) {
    if (state.client) {
      var result = await state.client.from(state.table).insert(stripLocalOnly(task));
      if (result.error) {
        console.error(result.error);
        alert("No se pudo guardar.");
      }
      return;
    }

    state.tasks.push(task);
    saveLocalTasks();
  }

  async function handleTaskAction(event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    if (!requirePa()) return;

    var task = findTask(button.dataset.id);
    if (!task) return;

    if (button.dataset.action === "take") {
      await patchTask(task.id, {
        status: "active",
        assignee: state.currentPa,
        started_at: task.started_at || nowIso(),
        completed_at: null
      });
    }

    if (button.dataset.action === "done") {
      await patchTask(task.id, {
        status: "done",
        assignee: task.assignee || state.currentPa,
        completed_at: nowIso()
      });
    }
  }

  async function patchTask(id, patch) {
    patch.updated_at = nowIso();

    if (state.client) {
      var result = await state.client.from(state.table).update(patch).eq("id", id);
      if (result.error) {
        console.error(result.error);
        alert("No se pudo actualizar.");
        return;
      }
      await loadTasks();
      return;
    }

    state.tasks = state.tasks.map(function (task) {
      if (task.id !== id) return task;
      return normalizeTask(Object.assign({}, task, patch));
    });
    saveLocalTasks();
    render();
  }

  function render() {
    renderSummary();
    renderTasks();
    if (state.managerOpen) renderManager();
  }

  function renderSummary() {
    var counts = countByStatus(state.tasks);
    els.pendingCount.textContent = counts.pending;
    els.activeCount.textContent = counts.active;
    els.doneCount.textContent = counts.done;
  }

  function renderTasks() {
    var tasks = getVisibleTasks();

    if (!tasks.length) {
      els.taskList.innerHTML = '<div class="empty-state">' + escapeHtml(emptyMessage()) + "</div>";
      return;
    }

    var byArea = groupByArea(tasks);
    var html = "";
    Object.keys(byArea).forEach(function (area) {
      html += '<h2 class="area-title">' + escapeHtml(area) + "</h2>";
      byArea[area].forEach(function (task) {
        html += renderTask(task);
      });
    });
    els.taskList.innerHTML = html;
  }

  function renderTask(task) {
    var assignee = task.assignee || "Libre";
    var timeLabel = task.status === "done" ? "Terminada " + formatTime(task.completed_at) : "Actualizada " + formatTime(task.updated_at);

    return [
      '<article class="task-card ' + escapeHtml(task.status) + '">',
      '<div class="task-main">',
      '<div class="task-top">',
      '<h3 class="task-title">' + escapeHtml(task.title) + "</h3>",
      '<span class="status-badge ' + escapeHtml(task.status) + '">' + escapeHtml(STATUS_LABELS[task.status]) + "</span>",
      "</div>",
      '<div class="task-meta">',
      '<span class="meta-chip">' + escapeHtml(assignee) + "</span>",
      '<span class="meta-chip">' + escapeHtml(timeLabel) + "</span>",
      "</div>",
      "</div>",
      renderActions(task),
      "</article>"
    ].join("");
  }

  function renderActions(task) {
    if (task.status === "pending") {
      return '<div class="task-actions single"><button type="button" class="primary" data-action="take" data-id="' + escapeHtml(task.id) + '">Tomar pendiente</button></div>';
    }

    if (task.status === "active") {
      return '<div class="task-actions single"><button type="button" class="success" data-action="done" data-id="' + escapeHtml(task.id) + '">Pendiente acabado</button></div>';
    }

    return "";
  }

  function renderPaList() {
    els.paList.innerHTML = PA_LIST.map(function (name) {
      var active = name === state.currentPa ? " active" : "";
      return '<button type="button" class="pa-choice' + active + '" data-pa="' + escapeHtml(name) + '">' + escapeHtml(name) + "</button>";
    }).join("");

    els.paList.querySelectorAll(".pa-choice").forEach(function (button) {
      button.addEventListener("click", function () {
        selectPa(button.dataset.pa || "");
      });
    });
  }

  function selectPa(name) {
    if (name === MANAGER_NAME) {
      openManagerLogin();
      return;
    }

    setManagerAuthenticated(false);
    state.managerOpen = false;
    els.managerPanel.hidden = true;
    state.currentPa = name;
    writeStorage(PA_STORAGE_KEY, state.currentPa);
    renderPa();
    renderPaList();
    closeModal("paModal");
  }

  function renderPa() {
    els.currentPa.textContent = state.currentPa || "Seleccionar nombre";
    if (els.paModalClose) els.paModalClose.hidden = !state.currentPa;
  }

  function openManagerLogin() {
    els.managerPin.value = "";
    els.managerError.hidden = true;
    openModal("managerModal");
    setTimeout(function () {
      els.managerPin.focus();
    }, 40);
  }

  function handleManagerLogin(event) {
    event.preventDefault();
    if (els.managerPin.value.trim() !== MANAGER_PIN) {
      els.managerError.hidden = false;
      els.managerPin.select();
      return;
    }

    setManagerAuthenticated(true);
    state.currentPa = MANAGER_NAME;
    writeStorage(PA_STORAGE_KEY, state.currentPa);
    renderPa();
    renderPaList();
    closeModal("managerModal");
    closeModal("paModal");
    state.managerOpen = true;
    els.managerPanel.hidden = false;
    renderManager();
    els.managerPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderManager() {
    var counts = countByStatus(state.tasks);
    var top = buildTopList();
    var active = state.tasks.filter(function (task) {
      return task.status === "active";
    });
    var done = state.tasks
      .filter(function (task) {
        return task.status === "done";
      })
      .sort(function (a, b) {
        return String(b.completed_at || "").localeCompare(String(a.completed_at || ""));
      });

    els.managerContent.innerHTML = [
      '<div class="manager-grid">',
      statCard("Pendientes", counts.pending),
      statCard("En proceso", counts.active),
      statCard("Terminadas", counts.done),
      "</div>",
      '<h3 class="manager-title">Top 5 productivos</h3>',
      renderTop(top),
      '<h3 class="manager-title">Ahora en proceso</h3>',
      renderManagerList(active, "No hay pendientes en proceso."),
      '<h3 class="manager-title">Terminadas recientes</h3>',
      renderManagerList(done.slice(0, 20), "Todavía no hay terminadas.")
    ].join("");
  }

  function statCard(label, value) {
    return '<div class="manager-stat"><span>' + value + "</span><small>" + escapeHtml(label) + "</small></div>";
  }

  function renderTop(rows) {
    if (!rows.length) return '<div class="section-empty">Aún no hay tareas terminadas.</div>';
    return (
      '<div class="top-list">' +
      rows
        .map(function (row, index) {
          return '<div class="top-row"><strong>' + (index + 1) + ". " + escapeHtml(row.name) + '</strong><span>' + row.done + " terminadas</span></div>";
        })
        .join("") +
      "</div>"
    );
  }

  function renderManagerList(tasks, empty) {
    if (!tasks.length) return '<div class="section-empty">' + escapeHtml(empty) + "</div>";
    return (
      '<div class="manager-list">' +
      tasks
        .map(function (task) {
          return [
            '<div class="manager-row">',
            '<strong>' + escapeHtml(task.title) + "</strong>",
            '<span>' + escapeHtml(task.assignee || task.created_by || "Sin PA") + " · " + escapeHtml(task.area || "General") + " · " + escapeHtml(formatTime(task.completed_at || task.updated_at)) + "</span>",
            "</div>"
          ].join("");
        })
        .join("") +
      "</div>"
    );
  }

  function buildTopList() {
    var scores = {};
    state.tasks.forEach(function (task) {
      if (task.status !== "done") return;
      var name = task.assignee || task.created_by || "Sin PA";
      scores[name] = (scores[name] || 0) + 1;
    });

    return Object.keys(scores)
      .map(function (name) {
        return { name: name, done: scores[name] };
      })
      .sort(function (a, b) {
        return b.done - a.done || a.name.localeCompare(b.name);
      })
      .slice(0, 5);
  }

  function getVisibleTasks() {
    return state.tasks
      .filter(function (task) {
        return task.status === state.filter;
      })
      .sort(function (a, b) {
        return String(a.created_at || "").localeCompare(String(b.created_at || ""));
      });
  }

  function emptyMessage() {
    if (state.filter === "pending") return "No hay pendientes.";
    if (state.filter === "active") return "No hay pendientes en proceso.";
    return "No hay pendientes terminados.";
  }

  function groupByArea(tasks) {
    var groups = {};
    tasks.forEach(function (task) {
      var area = task.area || "General";
      if (!groups[area]) groups[area] = [];
      groups[area].push(task);
    });

    return Object.keys(groups)
      .sort(function (a, b) {
        var ai = AREA_ORDER.indexOf(a);
        var bi = AREA_ORDER.indexOf(b);
        ai = ai === -1 ? 99 : ai;
        bi = bi === -1 ? 99 : bi;
        if (ai !== bi) return ai - bi;
        return a.localeCompare(b);
      })
      .reduce(function (ordered, area) {
        ordered[area] = groups[area];
        return ordered;
      }, {});
  }

  function countByStatus(tasks) {
    var counts = {
      pending: 0,
      active: 0,
      done: 0
    };

    tasks.forEach(function (task) {
      if (counts[task.status] != null) counts[task.status] += 1;
    });

    return counts;
  }

  function requirePa() {
    if (state.currentPa) return true;
    openPaModal(true);
    return false;
  }

  function isManagerAuthenticated() {
    try {
      return sessionStorage.getItem(MANAGER_AUTH_KEY) === "yes";
    } catch (error) {
      return false;
    }
  }

  function setManagerAuthenticated(value) {
    try {
      if (value) {
        sessionStorage.setItem(MANAGER_AUTH_KEY, "yes");
      } else {
        sessionStorage.removeItem(MANAGER_AUTH_KEY);
      }
    } catch (error) {}
  }

  function openPaModal(required) {
    if (els.paModalClose) els.paModalClose.hidden = required && !state.currentPa;
    openModal("paModal");
  }

  function normalizeTask(task) {
    var status = task.status === "active" || task.status === "done" ? task.status : "pending";
    return {
      id: task.id || makeLocalId(),
      work_date: task.work_date || state.today,
      fixed_key: task.fixed_key || null,
      title: task.title || "",
      area: task.area || "General",
      detail: task.detail || "",
      status: status,
      assignee: task.assignee || "",
      notes: task.notes || "",
      created_by: task.created_by || "",
      created_at: task.created_at || nowIso(),
      updated_at: task.updated_at || task.created_at || nowIso(),
      started_at: task.started_at || null,
      completed_at: task.completed_at || null
    };
  }

  function stripLocalOnly(task) {
    return {
      work_date: task.work_date,
      fixed_key: null,
      title: task.title,
      area: task.area,
      detail: task.detail,
      status: task.status,
      assignee: task.assignee,
      notes: task.notes,
      created_by: task.created_by,
      created_at: task.created_at,
      updated_at: task.updated_at,
      started_at: task.started_at,
      completed_at: task.completed_at
    };
  }

  function isUserTask(task) {
    return !task.fixed_key;
  }

  function findTask(id) {
    return state.tasks.find(function (task) {
      return task.id === id;
    });
  }

  function renderDate() {
    var formatter = new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long"
    });
    els.dateLine.textContent = formatter.format(new Date());
  }

  function saveLocalTasks() {
    writeStorage(storageKey(), JSON.stringify(state.tasks));
  }

  function storageKey() {
    return STORAGE_PREFIX + ":" + state.today;
  }

  function todayKey() {
    var date = new Date();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + month + "-" + day;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function makeLocalId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "local-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function formatTime(value) {
    if (!value) return "sin hora";
    try {
      return new Intl.DateTimeFormat("es-MX", {
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(value));
    } catch (error) {
      return "sin hora";
    }
  }

  function readStorage(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn("Could not write localStorage", error);
    }
  }

  function setSyncState(kind, label) {
    els.syncState.className = "sync-pill " + kind;
    els.syncState.textContent = label;
  }

  function openModal(id) {
    var modal = document.getElementById(id);
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(id) {
    if (id === "paModal" && !state.currentPa) return;
    var modal = document.getElementById(id);
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char];
    });
  }
})();
