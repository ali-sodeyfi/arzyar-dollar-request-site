(function () {
  const tokenKey = "arzyarAdminToken";
  const userKey = "arzyarAdminUser";
  const staticTokenPrefix = "static-admin-";
  const staticStorageKey = "arzyarStaticRequests";
  const loginCodeCooldownKey = "arzyarLoginCodeCooldownUntil";
  const loginPanel = document.querySelector("#loginPanel");
  const dashboardApp = document.querySelector("#dashboardApp");
  const loginForm = document.querySelector("#loginForm");
  const requestLoginCodeButton = document.querySelector("#requestLoginCodeButton");
  const loginMessage = document.querySelector("#loginMessage");
  const googleLoginButton = document.querySelector("#googleLoginButton");
  const googleLoginNote = document.querySelector("#googleLoginNote");
  const logoutButton = document.querySelector("#logoutButton");
  const currentUserBadge = document.querySelector("#currentUser");
  const refreshButton = document.querySelector("#refreshButton");
  const exportLink = document.querySelector("#exportLink");
  const searchInput = document.querySelector("#searchInput");
  const statusFilter = document.querySelector("#statusFilter");
  const tbody = document.querySelector("#requestsTbody");
  const adminForm = document.querySelector("#adminForm");
  const adminMessage = document.querySelector("#adminMessage");
  const staffPanel = document.querySelector("#staffPanel");
  const staffForm = document.querySelector("#staffForm");
  const staffList = document.querySelector("#staffList");
  const staffMessage = document.querySelector("#staffMessage");
  const paymentForm = document.querySelector("#paymentForm");
  const paymentMessage = document.querySelector("#paymentMessage");
  const paymentStatusText = document.querySelector("#paymentStatusText");
  const paymentLink = document.querySelector("#paymentLink");
  const paymentAmount = document.querySelector("#paymentAmount");
  const emptyState = document.querySelector("#emptyState");
  const detailsContent = document.querySelector("#detailsContent");
  const formatter = new Intl.NumberFormat("fa-IR");
  const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short"
  });
  let loginCodeCooldownTimer = null;
  let loginCodeSending = false;

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
  let staffMembers = [];
  let currentUser = readStoredUser();
  let selectedId = new URLSearchParams(window.location.search).get("request") || "";

  function token() {
    return localStorage.getItem(tokenKey) || "";
  }

  function readStoredUser() {
    try {
      const parsed = JSON.parse(localStorage.getItem(userKey) || "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function storeUser(user) {
    currentUser = user || null;
    if (currentUser) {
      localStorage.setItem(userKey, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(userKey);
    }
    renderCurrentUser();
  }

  function isOwner() {
    return currentUser?.role === "owner";
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
    const header = ["id", "status", "fullName", "phone", "email", "serviceType", "amount", "currency", "targetUrl", "urgent", "estimatedToman", "finalPriceToman", "createdAt"];
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
      item.finalPriceToman || "",
      item.createdAt
    ]);
    return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  }

  function updateExportLink() {
    if (isStaticMode()) {
      const blob = new Blob([staticCsv(requests)], { type: "text/csv;charset=utf-8" });
      exportLink.href = URL.createObjectURL(blob);
      exportLink.download = "arzrah-requests.csv";
    } else {
      exportLink.href = `api/admin/export.csv?token=${encodeURIComponent(token())}`;
      exportLink.removeAttribute("download");
    }
  }

  function showDashboard(show) {
    loginPanel.classList.toggle("is-hidden", show);
    dashboardApp.classList.toggle("is-hidden", !show);
    logoutButton.classList.toggle("is-hidden", !show);
    currentUserBadge.classList.toggle("is-hidden", !show || !currentUser);
  }

  function setLoginMessage(text, tone) {
    loginMessage.textContent = text || "";
    loginMessage.dataset.tone = tone || "";
  }

  function setGoogleLoginNote(text, tone) {
    googleLoginNote.textContent = text || "";
    googleLoginNote.dataset.tone = tone || "";
  }

  function renderCurrentUser() {
    if (!currentUser) {
      currentUserBadge.textContent = "";
      currentUserBadge.classList.add("is-hidden");
      return;
    }
    const roleText = currentUser.role === "owner" ? "مالک" : "کارشناس";
    currentUserBadge.textContent = `${currentUser.name || currentUser.email || "کاربر"} - ${roleText}`;
    currentUserBadge.classList.toggle("is-hidden", dashboardApp.classList.contains("is-hidden"));
  }

  function isolateLtr(value) {
    return `\u2066${String(value || "")}\u2069`;
  }

  function persianDigits(value) {
    return String(value).replace(/\d/g, (digit) => formatter.format(Number(digit)));
  }

  function formatCooldown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${persianDigits(String(minutes).padStart(2, "0"))}:${persianDigits(String(seconds).padStart(2, "0"))}`;
  }

  function renderLoginCodeCooldown() {
    if (loginCodeSending) return;
    const cooldownUntil = Number(localStorage.getItem(loginCodeCooldownKey) || 0);
    const remaining = cooldownUntil - Date.now();
    if (remaining > 0) {
      requestLoginCodeButton.disabled = true;
      requestLoginCodeButton.textContent = `ارسال مجدد ${formatCooldown(remaining)}`;
      if (!loginCodeCooldownTimer) {
        loginCodeCooldownTimer = window.setInterval(renderLoginCodeCooldown, 1000);
      }
      return;
    }

    localStorage.removeItem(loginCodeCooldownKey);
    if (loginCodeCooldownTimer) {
      window.clearInterval(loginCodeCooldownTimer);
      loginCodeCooldownTimer = null;
    }
    requestLoginCodeButton.disabled = false;
    requestLoginCodeButton.textContent = "ارسال کد";
  }

  function startLoginCodeCooldown(seconds) {
    const durationSeconds = Math.max(1, Number(seconds) || 120);
    localStorage.setItem(loginCodeCooldownKey, String(Date.now() + durationSeconds * 1000));
    renderLoginCodeCooldown();
  }

  function setAdminMessage(text, tone) {
    adminMessage.textContent = text || "";
    adminMessage.dataset.tone = tone || "";
  }

  function setStaffMessage(text, tone) {
    staffMessage.textContent = text || "";
    staffMessage.dataset.tone = tone || "";
  }

  function setPaymentMessage(text, tone) {
    paymentMessage.textContent = text || "";
    paymentMessage.dataset.tone = tone || "";
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
    document.querySelector("#detailRate").textContent = item.estimate?.rateToman
      ? `${formatter.format(item.estimate.rateToman)} تومان (${item.estimate.rateSource || "نرخ"})`
      : "-";
    document.querySelector("#detailFinalPrice").textContent = item.finalPriceToman ? toman(item.finalPriceToman) : "-";
    document.querySelector("#detailUrgent").textContent = item.urgent ? "فوری" : "عادی";
    const link = document.querySelector("#detailUrl");
    link.href = item.targetUrl;
    link.textContent = item.targetUrl;
    document.querySelector("#detailDescription").textContent = item.description || item.accountHint || "-";
    document.querySelector("#adminStatus").value = item.status;
    document.querySelector("#assignedTo").value = item.assignedTo || "";
    document.querySelector("#internalNote").value = item.internalNote || "";
    renderPayment(item);
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

  function renderPayment(item) {
    const latestPayment = Array.isArray(item.payments) ? item.payments[0] : null;
    paymentAmount.value = item.finalPriceToman
      ? String(Math.round(item.finalPriceToman))
      : item.estimate?.estimatedToman
        ? String(Math.round(item.estimate.estimatedToman))
        : "";
    paymentLink.classList.add("is-hidden");
    paymentLink.removeAttribute("href");
    if (!latestPayment) {
      paymentStatusText.textContent = "لینک پرداخت ساخته نشده است";
      return;
    }
    const statusText = latestPayment.status === "paid"
      ? `پرداخت شده${latestPayment.refId ? `، کد پیگیری ${latestPayment.refId}` : ""}`
      : latestPayment.status === "pending"
        ? "در انتظار پرداخت مشتری"
        : latestPayment.status === "canceled"
          ? "لغو شده"
          : "ناموفق";
    paymentStatusText.textContent = `${statusText} - ${toman(latestPayment.amountToman)}`;
    if (latestPayment.payUrl) {
      paymentLink.href = latestPayment.payUrl;
      paymentLink.classList.remove("is-hidden");
    }
  }

  function selectRequest(id) {
    selectedId = id;
    const item = requests.find((request) => request.id === id);
    renderRows();
    setAdminMessage("", "");
    if (item) {
      const url = new URL(window.location.href);
      url.searchParams.set("request", id);
      window.history.replaceState(null, "", url);
      renderDetails(item);
    }
  }

  async function api(path, options = {}) {
    if (isStaticMode()) {
      if (path.includes("/me") && (!options.method || options.method === "GET")) {
        return {
          ok: true,
          user: {
            id: "static-owner",
            email: "demo@example.com",
            name: "مدیر دمو",
            role: "owner",
            active: true
          },
          auth: { googleEnabled: false }
        };
      }
      if (path.includes("/staff") && (!options.method || options.method === "GET")) {
        return { ok: true, staff: [] };
      }
      if (path.includes("/requests") && (!options.method || options.method === "GET")) {
        return { ok: true, requests: readStaticRequests() };
      }
      if (path.includes("/payment") && options.method === "POST") {
        throw new Error("درگاه پرداخت در نسخه GitHub Pages فعال نیست؛ نسخه Node.js با Merchant ID لازم است.");
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
      storeUser(null);
      showDashboard(false);
      throw new Error("نشست مدیریتی منقضی شد.");
    }
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "خطای ارتباط با سرور.");
    return payload;
  }

  async function loadAuthConfig() {
    try {
      const response = await fetch("/api/admin/auth-config", { headers: { Accept: "application/json" } });
      const type = response.headers.get("content-type") || "";
      if (!type.includes("application/json")) throw new Error("static");
      const payload = await response.json();
      const enabled = Boolean(payload.googleEnabled);
      googleLoginButton.classList.toggle("is-disabled", !enabled);
      googleLoginButton.setAttribute("aria-disabled", enabled ? "false" : "true");
      googleLoginButton.href = enabled ? "/api/admin/google/start?returnTo=/dashboard" : "#";
      setGoogleLoginNote(enabled ? "" : "ورود گوگل بعد از تنظیم OAuth روی سرور فعال می‌شود.", enabled ? "" : "error");
    } catch {
      googleLoginButton.classList.add("is-disabled");
      googleLoginButton.setAttribute("aria-disabled", "true");
      googleLoginButton.href = "#";
      setGoogleLoginNote("ورود گوگل در نسخه استاتیک فعال نیست.", "error");
    }
  }

  async function loadMe() {
    const payload = await api("/api/admin/me");
    storeUser(payload.user || null);
    return payload.user || null;
  }

  function renderStaff() {
    const owner = isOwner();
    staffPanel.classList.toggle("is-hidden", !owner);
    if (!owner) {
      staffList.innerHTML = "";
      return;
    }

    staffList.innerHTML = "";
    if (!staffMembers.length) {
      const empty = document.createElement("p");
      empty.className = "table-empty staff-empty";
      empty.textContent = "کارشناسی ثبت نشده است.";
      staffList.append(empty);
      return;
    }

    for (const member of staffMembers) {
      const row = document.createElement("article");
      row.className = "staff-row";

      const meta = document.createElement("div");
      meta.className = "staff-meta";
      const name = document.createElement("strong");
      const email = document.createElement("small");
      name.textContent = member.name || [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email;
      email.textContent = member.email;
      meta.append(name, email);

      const role = document.createElement("span");
      role.className = "staff-role";
      role.textContent = member.role === "owner" ? "مالک" : "کارشناس";

      const action = document.createElement("button");
      action.type = "button";
      action.className = member.active ? "button-link staff-toggle" : "secondary-button staff-toggle";
      action.dataset.staffId = member.id;
      action.dataset.staffAction = member.active ? "deactivate" : "activate";
      action.textContent = member.role === "owner" ? "فعال" : member.active ? "غیرفعال کردن" : "فعال کردن";
      action.disabled = member.role === "owner";

      row.append(meta, role, action);
      staffList.append(row);
    }
  }

  async function loadStaff() {
    if (!isOwner()) {
      staffMembers = [];
      renderStaff();
      return;
    }
    const payload = await api("/api/admin/staff");
    staffMembers = payload.staff || [];
    renderStaff();
  }

  async function enterDashboard() {
    showDashboard(true);
    await loadMe();
    await loadStaff();
    await loadRequests();
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

  googleLoginButton.addEventListener("click", (event) => {
    if (googleLoginButton.classList.contains("is-disabled")) event.preventDefault();
  });

  requestLoginCodeButton.addEventListener("click", async () => {
    if (requestLoginCodeButton.disabled) return;
    setLoginMessage("", "");
    loginCodeSending = true;
    let cooldownSeconds = 0;
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
        cooldownSeconds = 120;
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        cooldownSeconds = response.status === 429 ? Number(payload.retryAfterSeconds || 0) : 0;
        throw new Error(payload.error || "ارسال کد انجام نشد.");
      }
      if (payload.devCode) loginForm.elements.code.value = payload.devCode;
      const phoneText = payload.phone ? isolateLtr(payload.phone) : "شماره ادمین";
      setLoginMessage(`کد ورود به ${phoneText} ارسال شد.`, "success");
      cooldownSeconds = Number(payload.resendAfterSeconds || 120);
    } catch (error) {
      setLoginMessage(error.message || "ارسال کد انجام نشد.", "error");
    } finally {
      loginCodeSending = false;
      if (cooldownSeconds > 0) {
        startLoginCodeCooldown(cooldownSeconds);
      } else {
        renderLoginCodeCooldown();
      }
    }
  });

  renderLoginCodeCooldown();

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
        storeUser({ id: "static-owner", email: "demo@example.com", name: "مدیر دمو", role: "owner", active: true });
        await enterDashboard();
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "ورود انجام نشد.");
      localStorage.setItem(tokenKey, payload.token);
      storeUser(payload.user || null);
      exportLink.href = `api/admin/export.csv?token=${encodeURIComponent(payload.token)}`;
      await enterDashboard();
    } catch (error) {
      if (String(data.code || data.pin || "") === "2468" && !error.message.includes("کد ورود")) {
        localStorage.setItem(tokenKey, `${staticTokenPrefix}${Date.now()}`);
        storeUser({ id: "static-owner", email: "demo@example.com", name: "مدیر دمو", role: "owner", active: true });
        await enterDashboard();
        return;
      }
      setLoginMessage(error.message, "error");
    }
  });

  logoutButton.addEventListener("click", () => {
    if (token() && !isStaticMode()) {
      api("/api/admin/logout", { method: "POST", body: "{}" }).catch(() => {});
    }
    localStorage.removeItem(tokenKey);
    storeUser(null);
    staffMembers = [];
    renderStaff();
    selectedId = "";
    const url = new URL(window.location.href);
    url.searchParams.delete("request");
    window.history.replaceState(null, "", url);
    showDashboard(false);
  });

  refreshButton.addEventListener("click", () => {
    loadRequests().catch((error) => setAdminMessage(error.message, "error"));
  });

  searchInput.addEventListener("input", renderRows);
  statusFilter.addEventListener("change", renderRows);

  staffForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStaffMessage("", "");
    const button = staffForm.querySelector("button[type='submit']");
    const data = Object.fromEntries(new FormData(staffForm).entries());
    button.disabled = true;
    button.textContent = "در حال ثبت...";
    try {
      const payload = await api("/api/admin/staff", {
        method: "POST",
        body: JSON.stringify(data)
      });
      staffMembers = payload.staff || [];
      staffForm.reset();
      renderStaff();
      setStaffMessage("کارشناس ثبت شد.", "success");
    } catch (error) {
      setStaffMessage(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "ثبت کارشناس";
    }
  });

  staffList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-staff-action]");
    if (!button || button.disabled) return;
    setStaffMessage("", "");
    const active = button.dataset.staffAction === "activate";
    button.disabled = true;
    try {
      const payload = await api(`/api/admin/staff/${encodeURIComponent(button.dataset.staffId)}`, {
        method: "PATCH",
        body: JSON.stringify({ active })
      });
      staffMembers = payload.staff || [];
      renderStaff();
      setStaffMessage(active ? "دسترسی کارشناس فعال شد." : "دسترسی کارشناس غیرفعال شد.", "success");
    } catch (error) {
      button.disabled = false;
      setStaffMessage(error.message, "error");
    }
  });

  paymentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedId) return;
    setPaymentMessage("", "");
    const button = paymentForm.querySelector("button[type='submit']");
    const data = Object.fromEntries(new FormData(paymentForm).entries());
    button.disabled = true;
    button.textContent = "در حال ساخت...";
    try {
      const payload = await api(`/api/admin/requests/${encodeURIComponent(selectedId)}/payment`, {
        method: "POST",
        body: JSON.stringify(data)
      });
      const index = requests.findIndex((item) => item.id === selectedId);
      if (index !== -1) requests[index] = payload.request;
      updateStats();
      renderRows();
      renderDetails(payload.request);
      setPaymentMessage("قیمت نهایی ثبت شد و لینک پرداخت برای مشتری پیامک شد.", "success");
    } catch (error) {
      setPaymentMessage(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "ثبت قیمت نهایی و ارسال لینک پرداخت";
    }
  });

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

  loadAuthConfig();
  renderCurrentUser();
  if (token()) {
    updateExportLink();
    enterDashboard().catch(() => {
      localStorage.removeItem(tokenKey);
      storeUser(null);
      showDashboard(false);
    });
  } else {
    showDashboard(false);
  }
})();
