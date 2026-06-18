(function () {
  var PA_LIST = [
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

  var FIXED_TASKS = [
    {
      fixed_key: "control-room-call-sheet-michael-shea",
      area: "Control Room",
      title: "Put a Call Sheet & Schedule in Michael Shea's desk",
      detail: "First thing in AM"
    },
    {
      fixed_key: "control-room-trash-sweep",
      area: "Control Room",
      title: "Trash sweep of control room",
      detail: "PA's should check every 3 hours"
    },
    {
      fixed_key: "control-room-restock-cooler",
      area: "Control Room",
      title: "Restock cooler in control room",
      detail: "PA's should check every 3 hours"
    },
    {
      fixed_key: "driveway-trash-cans",
      area: "Driveway",
      title: "Trash Sweep Driveway Trash Cans",
      detail: "PA's should check every 3 hours"
    },
    {
      fixed_key: "driveway-coolers-refrigerators",
      area: "Driveway",
      title: "Restock Coolers & Refrigerators in driveway",
      detail: "PA's should check every 3 hours"
    },
    {
      fixed_key: "driveway-cooling-rags",
      area: "Driveway",
      title: "Restock Cooling Rags",
      detail: "PA's should check every 3 hours"
    },
    {
      fixed_key: "driveway-crafty-catering-tent",
      area: "Driveway",
      title: "Restock Crafty in Catering Tent",
      detail: "PA's should check every 3 hours"
    },
    {
      fixed_key: "driveway-crafty-audio-garage",
      area: "Driveway",
      title: "Restock Crafty in Audio Garage",
      detail: "PA's should check every 3 hours"
    },
    {
      fixed_key: "driveway-trash-audio-garage",
      area: "Driveway",
      title: "Trash Sweep Audio Garage",
      detail: "PA's should check every 3 hours"
    },
    {
      fixed_key: "production-office-trash-sweep",
      area: "Production Office",
      title: "Trash Sweep PO",
      detail: "PA's should check every 3 hours"
    },
    {
      fixed_key: "production-office-drop-distro-call-sheets",
      area: "Production Office",
      title: "Drop Distro for Call Sheets in PO",
      detail: "AM"
    },
    {
      fixed_key: "production-office-check-crafty-inventory",
      area: "Production Office",
      title: "Check Crafty Inventory (Garage)",
      detail: "PA's should check every 3 hours"
    },
    {
      fixed_key: "production-office-check-water-inventory",
      area: "Production Office",
      title: "Check Water Inventory (Garage)",
      detail: "PA's should check every 3 hours"
    }
  ];

  var STATUS_LABELS = {
    pending: "Pendiente",
    active: "En proceso",
    blocked: "Seguimiento",
    done: "Lista"
  };

  var STATUS_ORDER = {
    active: 0,
    blocked: 1,
    pending: 2,
    done: 3
  };

  var AREA_ORDER = [
    "Control Room",
    "Driveway",
    "Production Office",
    "Catering",
    "Audio Garage",
    "Otro"
  ];

  var STORAGE_PREFIX = "rbsb-pa-tasks";
  var PA_STORAGE_KEY = "rbsb-pa-current-pa";
  var FIXED_TASK_REPEAT_HOURS = 3;
  var FIXED_TASK_REPEAT_MS = FIXED_TASK_REPEAT_HOURS * 60 * 60 * 1000;
  var REFRESH_INTERVAL_MS = 60 * 1000;

  var state = {
    today: todayKey(),
    tasks: [],
    filter: "all",
    query: "",
    currentPa: readStorage(PA_STORAGE_KEY, ""),
    client: null,
    table: "pa_tasks",
    realtimeChannel: null,
    noteTaskId: null,
    noteMode: "note",
    refreshing: false
  };

  var els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindEvents();
    renderDate();
    renderPa();
    renderPaList();
    await initBackend();
    await refreshTasks();
    window.setInterval(refreshTasks, REFRESH_INTERVAL_MS);
  }

  function cacheElements() {
    els.dateLine = document.getElementById("dateLine");
    els.currentPa = document.getElementById("currentPa");
    els.paButton = document.getElementById("paButton");
    els.clearPaBtn = document.getElementById("clearPaBtn");
    els.paModal = document.getElementById("paModal");
    els.paList = document.getElementById("paList");
    els.syncState = document.getElementById("syncState");
    els.refreshBtn = document.getElementById("refreshBtn");
    els.addTaskForm = document.getElementById("addTaskForm");
    els.newTaskTitle = document.getElementById("newTaskTitle");
    els.newTaskArea = document.getElementById("newTaskArea");
    els.searchInput = document.getElementById("searchInput");
    els.taskList = document.getElementById("taskList");
    els.pendingCount = document.getElementById("pendingCount");
    els.activeCount = document.getElementById("activeCount");
    els.blockedCount = document.getElementById("blockedCount");
    els.doneCount = document.getElementById("doneCount");
    els.noteModal = document.getElementById("noteModal");
    els.noteForm = document.getElementById("noteForm");
    els.noteText = document.getElementById("noteText");
    els.noteTaskTitle = document.getElementById("noteTaskTitle");
    els.saveNoteBtn = document.getElementById("saveNoteBtn");
  }

  function bindEvents() {
    els.paButton.addEventListener("click", function () {
      openModal("paModal");
    });

    els.clearPaBtn.addEventListener("click", clearPa);

    els.refreshBtn.addEventListener("click", function () {
      refreshTasks();
    });

    els.addTaskForm.addEventListener("submit", handleAddTask);

    els.searchInput.addEventListener("input", function (event) {
      state.query = event.target.value.trim().toLowerCase();
      render();
    });

    document.querySelectorAll(".filter-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll(".filter-btn").forEach(function (btn) {
          btn.classList.remove("active");
        });
        button.classList.add("active");
        state.filter = button.dataset.filter || "all";
        render();
      });
    });

    document.querySelectorAll("[data-close-modal]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeModal(button.dataset.closeModal);
      });
    });

    [els.paModal, els.noteModal].forEach(function (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target === modal) closeModal(modal.id);
      });
    });

    els.taskList.addEventListener("click", handleTaskAction);
    els.noteForm.addEventListener("submit", handleSaveNote);

    window.addEventListener("storage", function (event) {
      if (event.key === storageKey()) refreshTasks();
    });
  }

  async function initBackend() {
    var config = window.PA_TASKS_SUPABASE || {};
    state.table = config.table || "pa_tasks";

    if (!config.url || !config.anonKey) {
      setSyncState("local", "Modo local");
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
      setSyncState("error", "Local/error");
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
        function () {
          loadTasks();
        }
      )
      .subscribe();
  }

  async function refreshTasks() {
    if (state.refreshing) return;
    state.refreshing = true;
    try {
      await loadTasks();
      await ensureFixedTasks();
      await loadTasks();
      var didSync = await syncFixedTaskDefinitions();
      if (didSync) await loadTasks();
      var didReset = await resetDueFixedTasks();
      if (didReset) await loadTasks();
    } finally {
      state.refreshing = false;
    }
  }

  async function loadTasks() {
    if (state.client) {
      var result = await state.client
        .from(state.table)
        .select("*")
        .eq("work_date", state.today)
        .order("created_at", { ascending: true });

      if (result.error) {
        console.error(result.error);
        setSyncState("error", "Error");
        return;
      }

      state.tasks = (result.data || []).map(normalizeTask);
      setSyncState("online", "En vivo");
      render();
      return;
    }

    try {
      state.tasks = JSON.parse(readStorage(storageKey(), "[]")).map(normalizeTask);
    } catch (error) {
      state.tasks = [];
    }
    render();
  }

  async function ensureFixedTasks() {
    var existing = new Set(
      state.tasks
        .map(function (task) {
          return task.fixed_key;
        })
        .filter(Boolean)
    );

    var missing = FIXED_TASKS.filter(function (task) {
      return !existing.has(task.fixed_key);
    }).map(function (task) {
      return normalizeTask({
        id: makeLocalId(),
        work_date: state.today,
        fixed_key: task.fixed_key,
        title: task.title,
        area: task.area,
        detail: task.detail,
        status: "pending",
        assignee: "",
        notes: "",
        created_by: "Checklist fijo",
        created_at: nowIso(),
        updated_at: nowIso(),
        started_at: null,
        completed_at: null
      });
    });

    if (!missing.length) return;

    if (state.client) {
      var payload = missing.map(stripLocalOnly);
      var result = await state.client.from(state.table).insert(payload);
      if (result.error && result.error.code !== "23505") {
        console.error(result.error);
        setSyncState("error", "Error");
      }
      return;
    }

    state.tasks = state.tasks.concat(missing);
    saveLocalTasks();
  }

  async function syncFixedTaskDefinitions() {
    var fixedUpdates = state.tasks
      .map(function (task) {
        var definition = getFixedDefinition(task.fixed_key);
        if (!definition) return null;
        if (
          task.title === definition.title &&
          task.area === definition.area &&
          task.detail === definition.detail
        ) {
          return null;
        }
        return {
          task: task,
          patch: {
            title: definition.title,
            area: definition.area,
            detail: definition.detail,
            updated_at: nowIso()
          }
        };
      })
      .filter(Boolean);

    if (!fixedUpdates.length) return false;

    if (state.client) {
      for (var i = 0; i < fixedUpdates.length; i += 1) {
        var result = await state.client
          .from(state.table)
          .update(fixedUpdates[i].patch)
          .eq("id", fixedUpdates[i].task.id);

        if (result.error) {
          console.error(result.error);
          setSyncState("error", "Error");
        }
      }
      return true;
    }

    state.tasks = state.tasks.map(function (task) {
      var definition = getFixedDefinition(task.fixed_key);
      if (!definition) return task;
      return normalizeTask(
        Object.assign({}, task, {
          title: definition.title,
          area: definition.area,
          detail: definition.detail,
          updated_at: nowIso()
        })
      );
    });
    saveLocalTasks();
    render();
    return true;
  }

  async function resetDueFixedTasks() {
    var dueTasks = state.tasks.filter(isFixedTaskDueAgain);
    if (!dueTasks.length) return false;

    if (state.client) {
      var resetAt = nowIso();
      for (var i = 0; i < dueTasks.length; i += 1) {
        var result = await state.client
          .from(state.table)
          .update({
            status: "pending",
            assignee: "",
            updated_at: resetAt,
            started_at: null,
            completed_at: null
          })
          .eq("id", dueTasks[i].id);

        if (result.error) {
          console.error(result.error);
          setSyncState("error", "Error");
        }
      }
      return true;
    }

    state.tasks = state.tasks.map(function (task) {
      if (!isFixedTaskDueAgain(task)) return task;
      return normalizeTask(
        Object.assign({}, task, {
          status: "pending",
          assignee: "",
          updated_at: nowIso(),
          started_at: null,
          completed_at: null
        })
      );
    });
    saveLocalTasks();
    render();
    return true;
  }

  async function handleAddTask(event) {
    event.preventDefault();
    var title = els.newTaskTitle.value.trim();
    var area = els.newTaskArea.value || "Otro";
    if (!title) {
      els.newTaskTitle.focus();
      return;
    }

    var pa = state.currentPa || "";
    var task = normalizeTask({
      id: makeLocalId(),
      work_date: state.today,
      fixed_key: null,
      title: title,
      area: area,
      detail: "Pendiente agregado durante el día",
      status: "pending",
      assignee: "",
      notes: "",
      created_by: pa,
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
        alert("No se pudo guardar en Supabase. Revisa la configuración.");
      }
      return;
    }

    state.tasks.push(task);
    saveLocalTasks();
  }

  async function handleTaskAction(event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;

    var id = button.dataset.id;
    var action = button.dataset.action;
    var task = findTask(id);
    if (!task) return;

    if (action === "note") {
      if (!requirePa()) return;
      openNote(task, "note");
      return;
    }

    if (action === "blocked") {
      if (!requirePa()) return;
      openNote(task, "blocked");
      return;
    }

    if (!requirePa()) return;

    if (action === "delete") {
      if (task.fixed_key) {
        alert("Las tareas fijas del checklist no se borran. Puedes marcarlas como seguimiento si no aplican.");
        return;
      }
      var confirmed = window.confirm("¿Borrar esta tarea? Esta acción no se puede deshacer.");
      if (!confirmed) return;
      await deleteTask(id);
      return;
    }

    if (action === "take") {
      await patchTask(id, {
        status: "active",
        assignee: state.currentPa,
        started_at: task.started_at || nowIso(),
        completed_at: null
      });
    }

    if (action === "done") {
      await patchTask(id, {
        status: "done",
        assignee: task.assignee || state.currentPa,
        completed_at: nowIso()
      });
    }

    if (action === "release") {
      await patchTask(id, {
        status: "pending",
        assignee: "",
        started_at: null,
        completed_at: null
      });
    }

    if (action === "reopen") {
      await patchTask(id, {
        status: "active",
        assignee: state.currentPa,
        started_at: task.started_at || nowIso(),
        completed_at: null
      });
    }
  }

  function openNote(task, mode) {
    state.noteTaskId = task.id;
    state.noteMode = mode;
    els.noteTaskTitle.textContent = task.title;
    els.noteText.value = "";
    els.saveNoteBtn.textContent = mode === "blocked" ? "Guardar seguimiento" : "Guardar nota";
    openModal("noteModal");
    setTimeout(function () {
      els.noteText.focus();
    }, 40);
  }

  async function handleSaveNote(event) {
    event.preventDefault();
    var task = findTask(state.noteTaskId);
    if (!task || !requirePa()) return;

    var text = els.noteText.value.trim();
    if (state.noteMode === "blocked" && !text) {
      els.noteText.focus();
      return;
    }

    var patch = {};
    if (text) {
      patch.notes = appendNote(task.notes, state.currentPa, text);
    }

    if (state.noteMode === "blocked") {
      patch.status = "blocked";
      patch.assignee = task.assignee || state.currentPa;
      patch.started_at = task.started_at || nowIso();
      patch.completed_at = null;
    }

    await patchTask(task.id, patch);
    closeModal("noteModal");
  }

  async function patchTask(id, patch) {
    patch.updated_at = nowIso();

    if (state.client) {
      var result = await state.client.from(state.table).update(patch).eq("id", id);
      if (result.error) {
        console.error(result.error);
        alert("No se pudo actualizar la tarea.");
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

  async function deleteTask(id) {
    if (state.client) {
      var result = await state.client.from(state.table).delete().eq("id", id);
      if (result.error) {
        console.error(result.error);
        alert("No se pudo borrar. Falta activar el permiso de borrado en Supabase.");
        return;
      }
      await loadTasks();
      return;
    }

    state.tasks = state.tasks.filter(function (task) {
      return task.id !== id;
    });
    saveLocalTasks();
    render();
  }

  function render() {
    renderSummary();
    renderTasks();
  }

  function renderSummary() {
    var counts = {
      pending: 0,
      active: 0,
      blocked: 0,
      done: 0
    };

    state.tasks.forEach(function (task) {
      counts[task.status] = (counts[task.status] || 0) + 1;
    });

    els.pendingCount.textContent = counts.pending;
    els.activeCount.textContent = counts.active;
    els.blockedCount.textContent = counts.blocked;
    els.doneCount.textContent = counts.done;
  }

  function renderTasks() {
    var tasks = getFilteredTasks();
    if (!tasks.length) {
      els.taskList.innerHTML = '<div class="empty-state">No hay tareas con este filtro.</div>';
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

  function getFilteredTasks() {
    var query = state.query;
    return state.tasks
      .filter(function (task) {
        if (state.filter !== "all" && task.status !== state.filter) return false;
        if (!query) return true;
        var haystack = [
          task.title,
          task.area,
          task.detail,
          task.status,
          task.assignee,
          task.notes,
          task.created_by
        ]
          .join(" ")
          .toLowerCase();
        return haystack.indexOf(query) !== -1;
      })
      .sort(function (a, b) {
        var statusDiff = (STATUS_ORDER[a.status] || 9) - (STATUS_ORDER[b.status] || 9);
        if (statusDiff !== 0) return statusDiff;
        return String(a.created_at || "").localeCompare(String(b.created_at || ""));
      });
  }

  function groupByArea(tasks) {
    var groups = {};
    tasks.forEach(function (task) {
      var area = task.area || "Otro";
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

  function renderTask(task) {
    var status = task.status || "pending";
    var isFixed = Boolean(task.fixed_key);
    var updated = formatTime(task.updated_at || task.created_at);
    var assignee = task.assignee || "Sin responsable";
    var nextDue = getFixedTaskNextDueLabel(task);
    var detail = task.detail ? '<p class="task-detail">' + escapeHtml(task.detail) + "</p>" : "";
    var notes = task.notes
      ? '<div class="task-note">' + escapeHtml(task.notes).replace(/\n/g, "<br>") + "</div>"
      : "";

    return [
      '<article class="task-card ' + escapeHtml(status) + '">',
      '<div class="task-main">',
      '<div class="task-top">',
      '<div>',
      '<h3 class="task-title">' + escapeHtml(task.title) + "</h3>",
      detail,
      "</div>",
      '<span class="status-badge ' + escapeHtml(status) + '">' + escapeHtml(STATUS_LABELS[status]) + "</span>",
      "</div>",
      '<div class="task-meta">',
      '<span class="meta-chip">' + escapeHtml(isFixed ? "Checklist fijo" : "Pendiente nuevo") + "</span>",
      '<span class="meta-chip">' + escapeHtml(assignee) + "</span>",
      '<span class="meta-chip">Actualizado ' + escapeHtml(updated) + "</span>",
      nextDue ? '<span class="meta-chip due-chip">' + escapeHtml(nextDue) + "</span>" : "",
      "</div>",
      notes,
      "</div>",
      renderActions(task),
      "</article>"
    ].join("");
  }

  function renderActions(task) {
    var id = escapeHtml(task.id);
    var buttons = [];

    if (task.status === "pending") {
      buttons.push(actionButton("take", id, "Tomar", "primary"));
      buttons.push(actionButton("blocked", id, "Seguimiento", "warning"));
      buttons.push(actionButton("note", id, "Nota", ""));
    } else if (task.status === "active") {
      buttons.push(actionButton("done", id, "Terminar", "success"));
      buttons.push(actionButton("blocked", id, "Seguimiento", "warning"));
      buttons.push(actionButton("release", id, "Soltar", ""));
    } else if (task.status === "blocked") {
      buttons.push(actionButton("reopen", id, "Retomar", "primary"));
      buttons.push(actionButton("done", id, "Terminar", "success"));
      buttons.push(actionButton("note", id, "Nota", ""));
    } else {
      buttons.push(actionButton("reopen", id, "Reabrir", "primary"));
      buttons.push(actionButton("blocked", id, "Seguimiento", "warning"));
      buttons.push(actionButton("note", id, "Nota", ""));
    }

    if (!task.fixed_key) {
      buttons.push(actionButton("delete", id, "Borrar", "danger"));
    }

    return '<div class="task-actions">' + buttons.join("") + "</div>";
  }

  function actionButton(action, id, label, className) {
    return (
      '<button type="button" class="' +
      escapeHtml(className) +
      '" data-action="' +
      escapeHtml(action) +
      '" data-id="' +
      id +
      '">' +
      escapeHtml(label) +
      "</button>"
    );
  }

  function renderPaList() {
    els.paList.innerHTML = PA_LIST.map(function (name) {
      var active = name === state.currentPa ? " active" : "";
      return (
        '<button type="button" class="pa-choice' +
        active +
        '" data-pa="' +
        escapeHtml(name) +
        '"><span>' +
        escapeHtml(name) +
        "</span></button>"
      );
    }).join("");

    els.paList.querySelectorAll(".pa-choice").forEach(function (button) {
      button.addEventListener("click", function () {
        state.currentPa = button.dataset.pa || "";
        writeStorage(PA_STORAGE_KEY, state.currentPa);
        renderPa();
        renderPaList();
        closeModal("paModal");
      });
    });
  }

  function clearPa() {
    state.currentPa = "";
    writeStorage(PA_STORAGE_KEY, "");
    renderPa();
    renderPaList();
  }

  function renderPa() {
    els.currentPa.textContent = state.currentPa || "Seleccionar nombre";
    els.clearPaBtn.hidden = !state.currentPa;
  }

  function renderDate() {
    var formatter = new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    els.dateLine.textContent = formatter.format(new Date());
  }

  function requirePa() {
    if (state.currentPa) return true;
    openModal("paModal");
    return false;
  }

  function normalizeTask(task) {
    return {
      id: task.id || makeLocalId(),
      work_date: task.work_date || state.today,
      fixed_key: task.fixed_key || null,
      title: task.title || "",
      area: task.area || "Otro",
      detail: task.detail || "",
      status: STATUS_LABELS[task.status] ? task.status : "pending",
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
      fixed_key: task.fixed_key,
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

  function findTask(id) {
    return state.tasks.find(function (task) {
      return task.id === id;
    });
  }

  function getFixedDefinition(fixedKey) {
    if (!fixedKey) return null;
    return (
      FIXED_TASKS.find(function (task) {
        return task.fixed_key === fixedKey;
      }) || null
    );
  }

  function isFixedTaskDueAgain(task) {
    if (!task.fixed_key || task.status !== "done" || !task.completed_at) return false;
    var completedAt = new Date(task.completed_at).getTime();
    if (!Number.isFinite(completedAt)) return false;
    return Date.now() - completedAt >= FIXED_TASK_REPEAT_MS;
  }

  function getFixedTaskNextDueLabel(task) {
    if (!task.fixed_key || task.status !== "done" || !task.completed_at) return "";
    var completedAt = new Date(task.completed_at).getTime();
    if (!Number.isFinite(completedAt)) return "";
    var nextDueAt = completedAt + FIXED_TASK_REPEAT_MS;
    if (Date.now() >= nextDueAt) return "Disponible pronto";
    return "Disponible " + formatTime(new Date(nextDueAt).toISOString());
  }

  function appendNote(existing, pa, text) {
    var line = "[" + formatTime(nowIso()) + " - " + pa + "] " + text;
    return existing ? existing + "\n" + line : line;
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
