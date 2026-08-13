(function () {
  const toman = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
  const form = document.querySelector("#requestForm");
  const message = document.querySelector("#formMessage");
  const estimateText = document.querySelector("#estimateText");
  const header = document.querySelector(".site-header");
  const sampleRate = 65000;
  const staticStorageKey = "arzyarStaticRequests";

  function estimate(amount, urgent) {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const percent = amount <= 100 ? 0.055 : amount <= 500 ? 0.045 : amount <= 2000 ? 0.035 : 0.028;
    const serviceFee = Math.max(2, Math.round(amount * percent * 100) / 100);
    const urgentFee = urgent ? Math.max(5, Math.round(amount * 0.015 * 100) / 100) : 0;
    const total = Math.round((amount + serviceFee + urgentFee) * 100) / 100;
    return Math.round(total * sampleRate);
  }

  function estimateDetails(amount, urgent) {
    const numericAmount = Number(amount);
    const percent = numericAmount <= 100 ? 0.055 : numericAmount <= 500 ? 0.045 : numericAmount <= 2000 ? 0.035 : 0.028;
    const serviceFeeUsd = Math.max(2, Math.round(numericAmount * percent * 100) / 100);
    const urgentFeeUsd = urgent ? Math.max(5, Math.round(numericAmount * 0.015 * 100) / 100) : 0;
    const totalUsd = Math.round((numericAmount + serviceFeeUsd + urgentFeeUsd) * 100) / 100;
    return {
      sampleRateToman: sampleRate,
      serviceFeeUsd,
      urgentFeeUsd,
      totalUsd,
      estimatedToman: Math.round(totalUsd * sampleRate)
    };
  }

  function readStaticRequests() {
    try {
      const parsed = JSON.parse(localStorage.getItem(staticStorageKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveStaticRequest(data) {
    const now = new Date().toISOString();
    const suffix = Math.random().toString(16).slice(2, 6).toUpperCase();
    const request = {
      id: `DR-${now.slice(0, 10).replace(/-/g, "")}-${suffix}`,
      ...data,
      amount: Number(data.amount),
      status: "new",
      estimate: estimateDetails(Number(data.amount), Boolean(data.urgent)),
      assignedTo: "",
      internalNote: "",
      createdAt: now,
      updatedAt: now,
      timeline: [
        {
          status: "new",
          at: now,
          note: "درخواست در نسخه GitHub Pages داخل مرورگر ذخیره شد."
        }
      ]
    };
    const requests = readStaticRequests();
    requests.unshift(request);
    localStorage.setItem(staticStorageKey, JSON.stringify(requests));
    return {
      ok: true,
      request: {
        id: request.id,
        status: request.status,
        estimate: request.estimate,
        createdAt: request.createdAt
      }
    };
  }

  async function submitViaApiOrStatic(data) {
    try {
      const response = await fetch("api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const type = response.headers.get("content-type") || "";
      if (!type.includes("application/json")) return saveStaticRequest(data);
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        const errorText = payload.errors ? payload.errors.join(" ") : payload.error;
        const error = new Error(errorText || "ثبت درخواست انجام نشد.");
        error.fromApi = true;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error.fromApi) throw error;
      return saveStaticRequest(data);
    }
  }

  function updateEstimate() {
    const amount = Number(form.elements.amount.value);
    const urgent = form.elements.urgent.checked;
    const estimated = estimate(amount, urgent);
    estimateText.textContent = estimated ? `${toman.format(estimated)} تومان` : "مبلغ را وارد کنید";
  }

  function setMessage(text, tone) {
    message.textContent = text || "";
    message.dataset.tone = tone || "";
  }

  function setHeaderState() {
    header.dataset.elevated = window.scrollY > 16 ? "true" : "false";
  }

  async function submitRequest(event) {
    event.preventDefault();
    setMessage("", "");
    const submitButton = form.querySelector("button[type='submit']");
    const data = Object.fromEntries(new FormData(form).entries());
    data.urgent = form.elements.urgent.checked;
    data.userConsent = form.elements.userConsent.checked;
    data.amount = Number(data.amount);

    submitButton.disabled = true;
    submitButton.textContent = "در حال ثبت...";

    try {
      const payload = await submitViaApiOrStatic(data);
      const request = payload.request;
      setMessage(`درخواست شما با کد ${request.id} ثبت شد. برآورد نمونه: ${toman.format(request.estimate.estimatedToman)} تومان.`, "success");
      form.reset();
      updateEstimate();
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "ثبت درخواست";
    }
  }

  if (form) {
    form.addEventListener("submit", submitRequest);
    form.addEventListener("input", updateEstimate);
    form.addEventListener("reset", () => setTimeout(updateEstimate, 0));
    updateEstimate();
  }

  window.addEventListener("scroll", setHeaderState, { passive: true });
  setHeaderState();
})();
