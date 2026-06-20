(function () {
  var PA_LIST = [
    "Abraham Soto",
    "Pablo Navarro",
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
  var TASK_META_PREFIX = "pa-task-meta:";
  var COORDINATOR_PINS = {
    "Abraham Soto": "2468",
    "Pablo Navarro": "1357"
  };
  var MANAGER_AUTH_PREFIX = "rbsb-pa-manager-auth:";

  var state = {
    today: todayKey(),
    tasks: [],
    filter: "pending",
    currentPa: readStorage(PA_STORAGE_KEY, ""),
    client: null,
    table: "pa_tasks",
    realtimeChannel: null,
    managerOpen: false,
    coordinatorLoginName: "",
    detailTaskId: "",
    paNoteTaskId: ""
  };

  var els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    if (isCoordinator(state.currentPa) && !isManagerAuthenticated(state.currentPa)) {
      state.currentPa = "";
      writeStorage(PA_STORAGE_KEY, "");
    }
    bindEvents();
    renderDate();
    renderPa();
    renderPaList();
    await initBackend();
    await loadTasks();
    if (isCoordinator(state.currentPa) && isManagerAuthenticated(state.currentPa)) {
      state.managerOpen = true;
      els.managerPanel.hidden = false;
      render();
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
    els.quickAdd = document.getElementById("quickAdd");
    els.addTaskForm = document.getElementById("addTaskForm");
    els.addTaskLocked = document.getElementById("addTaskLocked");
    els.newTaskTitle = document.getElementById("newTaskTitle");
    els.newTaskArea = document.getElementById("newTaskArea");
    els.newTaskPeople = document.getElementById("newTaskPeople");
    els.newTaskDetail = document.getElementById("newTaskDetail");
    els.taskList = document.getElementById("taskList");
    els.pendingCount = document.getElementById("pendingCount");
    els.activeCount = document.getElementById("activeCount");
    els.doneCount = document.getElementById("doneCount");
    els.managerPanel = document.getElementById("managerPanel");
    els.managerEyebrow = document.getElementById("managerEyebrow");
    els.managerContent = document.getElementById("managerContent");
    els.managerCloseBtn = document.getElementById("managerCloseBtn");
    els.managerModal = document.getElementById("managerModal");
    els.managerModalTitle = document.getElementById("managerModalTitle");
    els.managerForm = document.getElementById("managerForm");
    els.managerPin = document.getElementById("managerPin");
    els.managerError = document.getElementById("managerError");
    els.detailModal = document.getElementById("detailModal");
    els.detailForm = document.getElementById("detailForm");
    els.detailText = document.getElementById("detailText");
    els.paNoteModal = document.getElementById("paNoteModal");
    els.paNoteForm = document.getElementById("paNoteForm");
    els.paNoteText = document.getElementById("paNoteText");
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
    els.detailForm.addEventListener("submit", handleDetailSubmit);
    els.paNoteForm.addEventListener("submit", handlePaNoteSubmit);
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
    if (!canAddTasks()) {
      alert("Solo coordinadores pueden agregar pendientes.");
      return;
    }

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
      detail: els.newTaskDetail.value.trim(),
      status: "pending",
      assignee: "",
      notes: stringifyTaskMeta({
        neededPeople: readNeededPeopleInput(),
        supporters: [],
        updates: []
      }),
      created_by: state.currentPa,
      created_at: nowIso(),
      updated_at: nowIso(),
      started_at: null,
      completed_at: null
    });

    await insertTask(task);
    els.newTaskTitle.value = "";
    els.newTaskPeople.value = "1";
    els.newTaskDetail.value = "";
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
      var takeMeta = ensureSupporter(readTaskMeta(task), state.currentPa);
      await patchTask(task.id, {
        status: "active",
        assignee: state.currentPa,
        notes: stringifyTaskMeta(takeMeta),
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

    if (button.dataset.action === "delete") {
      if (!canManageTasks()) {
        alert("Solo coordinadores pueden borrar pendientes.");
        return;
      }

      if (!confirm("¿Borrar este pendiente?")) return;
      await deleteTask(task.id);
    }

    if (button.dataset.action === "support") {
      await supportTask(task);
    }

    if (button.dataset.action === "edit-detail") {
      if (!canManageTasks()) {
        alert("Solo coordinadores pueden editar instrucciones.");
        return;
      }
      openDetailEditor(task);
    }

    if (button.dataset.action === "pa-note") {
      openPaNoteEditor(task);
    }
  }

  async function supportTask(task) {
    if (task.status !== "active") return;

    var meta = readTaskMeta(task);
    var team = getSupportTeam(task, meta);
    if (team.indexOf(state.currentPa) !== -1) {
      alert("Ya estás apoyando este pendiente.");
      return;
    }

    if (team.length >= meta.neededPeople) {
      alert("Este pendiente ya tiene el apoyo completo.");
      return;
    }

    await patchTask(task.id, {
      notes: stringifyTaskMeta(ensureSupporter(meta, state.currentPa))
    });
  }

  function openDetailEditor(task) {
    state.detailTaskId = task.id;
    els.detailText.value = task.detail || "";
    openModal("detailModal");
    setTimeout(function () {
      els.detailText.focus();
    }, 40);
  }

  async function handleDetailSubmit(event) {
    event.preventDefault();
    if (!canManageTasks()) {
      alert("Solo coordinadores pueden editar instrucciones.");
      return;
    }

    var task = findTask(state.detailTaskId);
    if (!task) return;
    await patchTask(task.id, {
      detail: els.detailText.value.trim()
    });
    state.detailTaskId = "";
    closeModal("detailModal");
  }

  function openPaNoteEditor(task) {
    state.paNoteTaskId = task.id;
    els.paNoteText.value = "";
    openModal("paNoteModal");
    setTimeout(function () {
      els.paNoteText.focus();
    }, 40);
  }

  async function handlePaNoteSubmit(event) {
    event.preventDefault();
    if (!requirePa()) return;

    var task = findTask(state.paNoteTaskId);
    var text = els.paNoteText.value.trim();
    if (!task || !text) {
      els.paNoteText.focus();
      return;
    }

    var meta = readTaskMeta(task);
    meta.updates.push({
      name: state.currentPa,
      text: text,
      at: nowIso()
    });

    await patchTask(task.id, {
      notes: stringifyTaskMeta(meta)
    });
    state.paNoteTaskId = "";
    closeModal("paNoteModal");
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

  async function deleteTask(id) {
    if (state.client) {
      var result = await state.client.from(state.table).delete().eq("id", id);
      if (result.error) {
        console.error(result.error);
        alert("No se pudo borrar.");
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
    renderAddTaskAccess();
    renderSummary();
    renderTasks();
    if (state.managerOpen) renderManager();
  }

  function renderAddTaskAccess() {
    if (!els.addTaskForm || !els.addTaskLocked) return;
    var allowed = canAddTasks();
    els.addTaskForm.hidden = !allowed;
    els.addTaskLocked.hidden = allowed;
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
      renderSupportChip(task),
      "</div>",
      renderTaskDetail(task),
      renderSupportInfo(task),
      renderPaUpdates(task),
      "</div>",
      renderActions(task),
      "</article>"
    ].join("");
  }

  function renderTaskDetail(task) {
    var detail = String(task.detail || "").trim();
    if (!detail) return "";

    return [
      '<div class="task-detail">',
      "<strong>Instrucciones / notas</strong>",
      "<p>" + escapeHtml(detail) + "</p>",
      "</div>"
    ].join("");
  }

  function renderSupportChip(task) {
    var meta = readTaskMeta(task);
    if (meta.neededPeople <= 1 && task.status !== "active") return "";
    var team = getSupportTeam(task, meta);
    return '<span class="meta-chip">Equipo ' + team.length + "/" + meta.neededPeople + "</span>";
  }

  function renderSupportInfo(task) {
    var meta = readTaskMeta(task);
    if (meta.neededPeople <= 1 && !meta.supporters.length) return "";

    var team = getSupportTeam(task, meta);
    var names = team.length ? team.join(", ") : "Sin apoyo todavía";
    return [
      '<div class="task-support">',
      '<strong>Apoyo</strong>',
      "<p>" + escapeHtml(team.length + "/" + meta.neededPeople + " personas") + "</p>",
      "<span>" + escapeHtml(names) + "</span>",
      "</div>"
    ].join("");
  }

  function renderPaUpdates(task) {
    var updates = readTaskMeta(task).updates;
    if (!updates.length) return "";

    return [
      '<div class="pa-updates">',
      "<strong>Notas de PAs</strong>",
      updates
        .map(function (update) {
          return [
            "<p>",
            "<b>" + escapeHtml(update.name || "PA") + "</b>",
            " <span>" + escapeHtml(formatTime(update.at)) + "</span><br>",
            escapeHtml(update.text || ""),
            "</p>"
          ].join("");
        })
        .join(""),
      "</div>"
    ].join("");
  }

  function renderActions(task) {
    var actions = [];

    if (task.status === "pending") {
      actions.push('<button type="button" class="primary" data-action="take" data-id="' + escapeHtml(task.id) + '">Tomar pendiente</button>');
    }

    if (task.status === "active") {
      actions.push('<button type="button" class="success" data-action="done" data-id="' + escapeHtml(task.id) + '">Pendiente acabado</button>');
      actions.push(renderSupportAction(task));
    }

    if (task.status === "active" || task.status === "done") {
      actions.push('<button type="button" class="secondary" data-action="pa-note" data-id="' + escapeHtml(task.id) + '">Agregar nota</button>');
    }

    if (canManageTasks()) {
      actions.push('<button type="button" class="secondary" data-action="edit-detail" data-id="' + escapeHtml(task.id) + '">Editar instrucciones</button>');
      actions.push('<button type="button" class="danger" data-action="delete" data-id="' + escapeHtml(task.id) + '">Borrar</button>');
    }

    actions = actions.filter(Boolean);
    if (!actions.length) return "";
    return '<div class="task-actions' + (actions.length === 1 ? " single" : "") + '">' + actions.join("") + "</div>";
  }

  function renderSupportAction(task) {
    var meta = readTaskMeta(task);
    var team = getSupportTeam(task, meta);
    if (meta.neededPeople <= 1) return "";
    if (team.indexOf(state.currentPa) !== -1) {
      return '<button type="button" class="muted" disabled>Ya estás apoyando</button>';
    }
    if (team.length >= meta.neededPeople) {
      return '<button type="button" class="muted" disabled>Apoyo completo</button>';
    }
    return '<button type="button" class="secondary" data-action="support" data-id="' + escapeHtml(task.id) + '">Apoyar (' + team.length + "/" + meta.neededPeople + ")</button>";
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
    if (isCoordinator(name)) {
      openManagerLogin(name);
      return;
    }

    clearCoordinatorAuth();
    state.managerOpen = false;
    els.managerPanel.hidden = true;
    state.currentPa = name;
    writeStorage(PA_STORAGE_KEY, state.currentPa);
    renderPa();
    renderPaList();
    render();
    closeModal("paModal");
  }

  function renderPa() {
    els.currentPa.textContent = state.currentPa || "Seleccionar nombre";
    if (els.paModalClose) els.paModalClose.hidden = !state.currentPa;
  }

  function openManagerLogin(name) {
    state.coordinatorLoginName = name;
    els.managerModalTitle.textContent = "Clave " + name;
    els.managerPin.value = "";
    els.managerError.hidden = true;
    openModal("managerModal");
    setTimeout(function () {
      els.managerPin.focus();
    }, 40);
  }

  function handleManagerLogin(event) {
    event.preventDefault();
    var name = state.coordinatorLoginName;
    if (!isCoordinator(name) || els.managerPin.value.trim() !== COORDINATOR_PINS[name]) {
      els.managerError.hidden = false;
      els.managerPin.select();
      return;
    }

    setManagerAuthenticated(name, true);
    state.currentPa = name;
    writeStorage(PA_STORAGE_KEY, state.currentPa);
    renderPa();
    renderPaList();
    closeModal("managerModal");
    closeModal("paModal");
    state.managerOpen = true;
    els.managerPanel.hidden = false;
    render();
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

    els.managerEyebrow.textContent = state.currentPa || "Coordinador";
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

  function readNeededPeopleInput() {
    var value = Number(els.newTaskPeople.value || 1);
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(12, Math.round(value)));
  }

  function readTaskMeta(task) {
    var fallback = {
      neededPeople: 1,
      supporters: [],
      updates: []
    };
    var raw = String(task.notes || "");
    if (raw.indexOf(TASK_META_PREFIX) !== 0) return fallback;

    try {
      var parsed = JSON.parse(raw.slice(TASK_META_PREFIX.length));
      return normalizeTaskMeta(parsed);
    } catch (error) {
      return fallback;
    }
  }

  function normalizeTaskMeta(meta) {
    var neededPeople = Number(meta && meta.neededPeople);
    if (!Number.isFinite(neededPeople)) neededPeople = 1;

    return {
      neededPeople: Math.max(1, Math.min(12, Math.round(neededPeople))),
      supporters: uniqueNames(Array.isArray(meta && meta.supporters) ? meta.supporters : []),
      updates: Array.isArray(meta && meta.updates)
        ? meta.updates
            .map(function (update) {
              return {
                name: String(update.name || ""),
                text: String(update.text || ""),
                at: update.at || nowIso()
              };
            })
            .filter(function (update) {
              return update.text.trim();
            })
        : []
    };
  }

  function stringifyTaskMeta(meta) {
    return TASK_META_PREFIX + JSON.stringify(normalizeTaskMeta(meta));
  }

  function ensureSupporter(meta, name) {
    var next = normalizeTaskMeta(meta);
    if (name && next.supporters.indexOf(name) === -1) {
      next.supporters.push(name);
    }
    next.supporters = uniqueNames(next.supporters);
    return next;
  }

  function getSupportTeam(task, meta) {
    var names = [];
    if (task.assignee) names.push(task.assignee);
    return uniqueNames(names.concat(normalizeTaskMeta(meta).supporters));
  }

  function uniqueNames(names) {
    var seen = {};
    return names
      .map(function (name) {
        return String(name || "").trim();
      })
      .filter(function (name) {
        if (!name || seen[name]) return false;
        seen[name] = true;
        return true;
      });
  }

  function requirePa() {
    if (state.currentPa) return true;
    openPaModal(true);
    return false;
  }

  function canManageTasks() {
    return isCoordinator(state.currentPa) && isManagerAuthenticated(state.currentPa);
  }

  function canAddTasks() {
    return canManageTasks();
  }

  function isCoordinator(name) {
    return Object.prototype.hasOwnProperty.call(COORDINATOR_PINS, name);
  }

  function isManagerAuthenticated(name) {
    try {
      return sessionStorage.getItem(managerAuthKey(name)) === "yes";
    } catch (error) {
      return false;
    }
  }

  function setManagerAuthenticated(name, value) {
    try {
      if (value) {
        sessionStorage.setItem(managerAuthKey(name), "yes");
      } else {
        sessionStorage.removeItem(managerAuthKey(name));
      }
    } catch (error) {}
  }

  function clearCoordinatorAuth() {
    Object.keys(COORDINATOR_PINS).forEach(function (name) {
      setManagerAuthenticated(name, false);
    });
  }

  function managerAuthKey(name) {
    return MANAGER_AUTH_PREFIX + name;
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
