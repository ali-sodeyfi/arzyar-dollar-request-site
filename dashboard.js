(function () {
  const tokenKey = "arzyarAdminToken";
  const staticTokenPrefix = "static-admin-";
  const staticStorageKey = "arzyarStaticRequests";
  const loginPanel = document.querySelector("#loginPanel");
  const dashboardApp = document.querySelector("#dashboardApp");
  const loginForm = document.querySelector("#loginForm");
  const requestLoginCodeButton = document.querySelector("#requestLoginCodeButton");
  const loginMessage = document.querySelector("#loginMessage");
  const logoutButton = document.querySelector("#logoutButton");
  const refreshButton = document.querySelector("#refreshButton");
  const exportLink = document.querySelector("#exportLink");
  const searchInput = document.querySelector("#searchInput");
  const statusFilter = document.querySelector("#statusFilter");
  const tbody = document.querySelector("#requestsTbody");
  const adminForm = document.querySelector("#adminForm");
  const adminMessage = document.querySelector("#adminMessage");
  const emptyState = document.querySelector("#emptyState");
  const detailsContent = document.querySelector("#detailsContent");
  const formatter = new Intl.NumberFormat("fa-IR");
  const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short"
  });

  const serviceLabels = {
    international_payment: "پرداخت سایت خارجی",
    subscription: "اشتراک",
    gift_card: "گیفت کارت",
    exam_fee: "هزینه آزمون",
    university: "دانشگاه/اپلای",
    software: "نرم‌افزار",
    shop_order: "خرید کالا",
    other: "سایر"
  };

  const statusLabels = {
    new: "جدید",
    reviewing: "در حال بررسی",
    quoted: "پیش‌فاکتور",
    waiting_payment: "در انتظار پرداخت",
    paid: "پرداخت شده",
    completed: "تکمیل شده",
    rejected: "رد شده"
  };

  let requests = [];
  let selectedId = "";

  function token() {
    return localStorage.getItem(tokenKey) || "";
  }

  function isStaticMode() {
    return token().startsWith(staticTokenPrefix);
  }

  function readStaticRequests() {
    try {
      const parsed = JSON.parse(localStorage.getItem(staticStorageKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeStaticRequests(items) {
    localStorage.setItem(staticStorageKey, JSON.stringify(items));
  }

  function staticCsv(items) {
    const escape = (value) => {
      const text = String(value ?? "");
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = ["id", "status", "fullName", "phone", "email", "serviceType", "amount", "currency", "targetUrl", "urgent", "estimatedToman", "createdAt"];
    const rows = items.map((item) => [
      item.id,
      item.status,
      item.fullName,
      item.phone,
      item.email,
      item.serviceType,
      item.amount,
      item.currency,
      item.targetUrl,
      item.urgent ? "yes" : "no",
      item.estimate?.estimatedToman || "",
      item.createdAt
    ]);
    return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  }

  function updateExportLink() {
    if (isStaticMode()) {
      const blob = new Blob([staticCsv(requests)], { type: "text/csv;charset=utf-8" });
      exportLink.href = URL.createObjectURL(blob);
      exportLink.download = "arzyar-requests.csv";
    } else {
      exportLink.href = `api/admin/export.csv?token=${encodeURIComponent(token())}`;
      exportLink.removeAttribute("download");
    }
  }

  function showDashboard(show) {
    loginPanel.classList.toggle("is-hidden", show);
    dashboardApp.classList.toggle("is-hidden", !show);
    logoutButton.classList.toggle("is-hidden", !show);
  }

  function setLoginMessage(text, tone) {
    loginMessage.textContent = text || "";
    loginMessage.dataset.tone = tone || "";
  }

  function setAdminMessage(text, tone) {
    adminMessage.textContent = text || "";
    adminMessage.dataset.tone = tone || "";
  }

  function formatDate(value) {
    try {
      return dateFormatter.format(new Date(value));
    } catch {
      return "-";
    }
  }

  function toman(value) {
    return `${formatter.format(Math.round(Number(value || 0)))} تومان`;
  }

  function matchesFilter(item) {
    const query = searchInput.value.trim().toLowerCase();
    const status = statusFilter.value;
    if (status !== "all" && item.status !== status) return false;
    if (!query) return true;
    return [
      item.id,
      item.fullName,
      item.phone,
      item.email,
      item.targetUrl,
      item.description,
      serviceLabels[item.serviceType]
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  }

  function filteredRequests() {
    return requests.filter(matchesFilter);
  }

  function updateStats() {
    const openStatuses = new Set(["new", "reviewing", "quoted", "waiting_payment", "paid"]);
    const open = requests.filter((item) => openStatuses.has(item.status)).length;
    const urgent = requests.filter((item) => item.urgent).length;
    const usdTotal = requests
      .filter((item) => item.currency === "USD")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    document.querySelector("#statTotal").textContent = formatter.format(requests.length);
    document.querySelector("#statOpen").textContent = formatter.format(open);
    document.querySelector("#statUrgent").textContent = formatter.format(urgent);
    document.querySelector("#statAmount").textContent = `${formatter.format(usdTotal)} USD`;
  }

  function statusPill(status) {
    const span = document.createElement("span");
    span.className = `status-pill status-${status}`;
    span.textContent = statusLabels[status] || status;
    return span;
  }

  function renderRows() {
    const list = filteredRequests();
    tbody.innerHTML = "";
    if (!list.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "table-empty";
      cell.textContent = "درخواستی با این فیلتر پیدا نشد.";
      row.append(cell);
      tbody.append(row);
      return;
    }

    for (const item of list) {
      const row = document.createElement("tr");
      row.className = item.id === selectedId ? "is-selected" : "";
      row.tabIndex = 0;
      row.addEventListener("click", () => selectRequest(item.id));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") selectRequest(item.id);
      });

      const idCell = document.createElement("td");
      idCell.innerHTML = `<strong>${item.id}</strong>${item.urgent ? "<small>فوری</small>" : ""}`;

      const customerCell = document.createElement("td");
      customerCell.innerHTML = `<strong></strong><small></small>`;
      customerCell.querySelector("strong").textContent = item.fullName;
      customerCell.querySelector("small").textContent = item.phone || "-";

      const serviceCell = document.createElement("td");
      serviceCell.textContent = serviceLabels[item.serviceType] || item.serviceType;

      const amountCell = document.createElement("td");
      amountCell.textContent = `${formatter.format(item.amount)} ${item.currency}`;

      const statusCell = document.createElement("td");
      statusCell.append(statusPill(item.status));

      const dateCell = document.createElement("td");
      dateCell.textContent = formatDate(item.createdAt);

      row.append(idCell, customerCell, serviceCell, amountCell, statusCell, dateCell);
      tbody.append(row);
    }
  }

  function renderDetails(item) {
    emptyState.classList.add("is-hidden");
    detailsContent.classList.remove("is-hidden");
    document.querySelector("#detailId").textContent = item.id;
    document.querySelector("#detailName").textContent = item.fullName;
    const detailStatus = document.querySelector("#detailStatus");
    detailStatus.className = `status-pill status-${item.status}`;
    detailStatus.textContent = statusLabels[item.status] || item.status;
    document.querySelector("#detailPhone").textContent = item.phone || "-";
    document.querySelector("#detailEmail").textContent = item.email || "-";
    document.querySelector("#detailService").textContent = serviceLabels[item.serviceType] || item.serviceType;
    document.querySelector("#detailAmount").textContent = `${formatter.format(item.amount)} ${item.currency}`;
    document.querySelector("#detailEstimate").textContent = toman(item.estimate?.estimatedToman);
    document.querySelector("#detailUrgent").textContent = item.urgent ? "فوری" : "عادی";
    const link = document.querySelector("#detailUrl");
    link.href = item.targetUrl;
    link.textContent = item.targetUrl;
    document.querySelector("#detailDescription").textContent = item.description || item.accountHint || "-";
    document.querySelector("#adminStatus").value = item.status;
    document.querySelector("#assignedTo").value = item.assignedTo || "";
    document.querySelector("#internalNote").value = item.internalNote || "";
    const timeline = document.querySelector("#timelineList");
    timeline.innerHTML = "";
    (item.timeline || []).forEach((entry) => {
      const li = document.createElement("li");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      title.textContent = statusLabels[entry.status] || entry.status;
      meta.textContent = `${formatDate(entry.at)} - ${entry.note || ""}`;
      li.append(title, meta);
      timeline.append(li);
    });
  }

  function selectRequest(id) {
    selectedId = id;
    const item = requests.find((request) => request.id === id);
    renderRows();
    setAdminMessage("", "");
    if (item) renderDetails(item);
  }

  async function api(path, options = {}) {
    if (isStaticMode()) {
      if (path.includes("/requests") && (!options.method || options.method === "GET")) {
        return { ok: true, requests: readStaticRequests() };
      }
      if (path.includes("/requests/") && options.method === "PATCH") {
        const id = decodeURIComponent(path.split("/requests/")[1] || "");
        const data = JSON.parse(options.body || "{}");
        const items = readStaticRequests();
        const index = items.findIndex((item) => item.id === id);
        if (index === -1) throw new Error("درخواست پیدا نشد.");
        const now = new Date().toISOString();
        const item = items[index];
        if (data.status && data.status !== item.status) {
          item.status = data.status;
          item.timeline = Array.isArray(item.timeline) ? item.timeline : [];
          item.timeline.unshift({
            status: data.status,
            at: now,
            note: data.internalNote || "وضعیت در نسخه GitHub Pages تغییر کرد."
          });
        }
        item.assignedTo = data.assignedTo || "";
        item.internalNote = data.internalNote || "";
        item.updatedAt = now;
        items[index] = item;
        writeStaticRequests(items);
        return { ok: true, request: item };
      }
    }
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token()}`,
        ...(options.headers || {})
      }
    });
    if (response.status === 401) {
      localStorage.removeItem(tokenKey);
      showDashboard(false);
      throw new Error("نشست مدیریتی منقضی شد.");
    }
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "خطای ارتباط با سرور.");
    return payload;
  }

  async function loadRequests() {
    const payload = await api("/api/admin/requests");
    requests = payload.requests || [];
    updateExportLink();
    updateStats();
    renderRows();
    const selected = requests.find((item) => item.id === selectedId);
    if (selected) {
      renderDetails(selected);
    } else if (requests.length) {
      selectRequest(requests[0].id);
    }
  }

  requestLoginCodeButton.addEventListener("click", async () => {
    setLoginMessage("", "");
    requestLoginCodeButton.disabled = true;
    requestLoginCodeButton.textContent = "در حال ارسال...";
    try {
      const response = await fetch("/api/admin/login-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const type = response.headers.get("content-type") || "";
      if (!type.includes("application/json")) {
        loginForm.elements.code.value = "2468";
        setLoginMessage("نسخه GitHub Pages دمو است؛ کد 2468 آماده شد.", "success");
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "ارسال کد انجام نشد.");
      if (payload.devCode) loginForm.elements.code.value = payload.devCode;
      setLoginMessage(`کد ورود به ${payload.phone || "شماره ادمین"} ارسال شد.`, "success");
    } catch (error) {
      setLoginMessage(error.message || "ارسال کد انجام نشد.", "error");
    } finally {
      requestLoginCodeButton.disabled = false;
      requestLoginCodeButton.textContent = "ارسال کد";
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginMessage("", "");
    const data = Object.fromEntries(new FormData(loginForm).entries());
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const type = response.headers.get("content-type") || "";
      if (!type.includes("application/json")) {
        if (String(data.code || data.pin || "") !== "2468") throw new Error("کد ورود درست نیست.");
        localStorage.setItem(tokenKey, `${staticTokenPrefix}${Date.now()}`);
        showDashboard(true);
        await loadRequests();
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "ورود انجام نشد.");
      localStorage.setItem(tokenKey, payload.token);
      exportLink.href = `api/admin/export.csv?token=${encodeURIComponent(payload.token)}`;
      showDashboard(true);
      await loadRequests();
    } catch (error) {
      if (String(data.code || data.pin || "") === "2468" && !error.message.includes("کد ورود")) {
        localStorage.setItem(tokenKey, `${staticTokenPrefix}${Date.now()}`);
        showDashboard(true);
        await loadRequests();
        return;
      }
      setLoginMessage(error.message, "error");
    }
  });

  logoutButton.addEventListener("click", () => {
    localStorage.removeItem(tokenKey);
    selectedId = "";
    showDashboard(false);
  });

  refreshButton.addEventListener("click", () => {
    loadRequests().catch((error) => setAdminMessage(error.message, "error"));
  });

  searchInput.addEventListener("input", renderRows);
  statusFilter.addEventListener("change", renderRows);

  adminForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedId) return;
    setAdminMessage("", "");
    const data = Object.fromEntries(new FormData(adminForm).entries());
    try {
      const payload = await api(`/api/admin/requests/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      });
      const index = requests.findIndex((item) => item.id === selectedId);
      if (index !== -1) requests[index] = payload.request;
      updateStats();
      renderRows();
      renderDetails(payload.request);
      setAdminMessage("تغییرات ذخیره شد.", "success");
    } catch (error) {
      setAdminMessage(error.message, "error");
    }
  });

  if (token()) {
    updateExportLink();
    showDashboard(true);
    loadRequests().catch(() => showDashboard(false));
  } else {
    showDashboard(false);
  }
})();
