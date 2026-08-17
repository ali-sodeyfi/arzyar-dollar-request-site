(function () {
  const toman = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
  const amountFormatter = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });
  const form = document.querySelector("#requestForm");
  const message = document.querySelector("#formMessage");
  const estimateText = document.querySelector("#estimateText");
  const header = document.querySelector(".site-header");
  const sendPhoneCodeButton = document.querySelector("#sendPhoneCodeButton");
  const verifyPhoneCodeButton = document.querySelector("#verifyPhoneCodeButton");
  const phoneVerifyMessage = document.querySelector("#phoneVerifyMessage");
  const estimateHint = document.querySelector("#estimateHint");
  const submitButton = form?.querySelector("button[type='submit']");
  const fallbackRate = 65000;
  const staticStorageKey = "arzyarStaticRequests";
  const phoneCodeCooldownKey = "arzrahPhoneCodeCooldownUntil";
  const fallbackRates = {
    USD: { sellToman: fallbackRate, source: "fallback" }
  };
  let phoneCodeCooldownTimer = null;
  let phoneCodeSending = false;
  let phoneCodeVerifying = false;
  let submitting = false;
  let verifiedPhone = "";
  let rateState = {
    sourceName: "نرخ نمونه",
    fallback: true,
    rates: fallbackRates
  };

  function rateFor(currency) {
    const normalizedCurrency = String(currency || "USD").toUpperCase();
    return Number(rateState.rates?.[normalizedCurrency]?.sellToman || fallbackRates.USD.sellToman);
  }

  function estimate(amount, urgent, currency) {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const percent = amount <= 100 ? 0.055 : amount <= 500 ? 0.045 : amount <= 2000 ? 0.035 : 0.028;
    const serviceFee = Math.max(2, Math.round(amount * percent * 100) / 100);
    const urgentFee = urgent ? Math.max(5, Math.round(amount * 0.015 * 100) / 100) : 0;
    const total = Math.round((amount + serviceFee + urgentFee) * 100) / 100;
    return Math.round(total * rateFor(currency));
  }

  function estimateDetails(amount, urgent, currency) {
    const numericAmount = Number(amount);
    const normalizedCurrency = String(currency || "USD").toUpperCase();
    const rateToman = rateFor(normalizedCurrency);
    const percent = numericAmount <= 100 ? 0.055 : numericAmount <= 500 ? 0.045 : numericAmount <= 2000 ? 0.035 : 0.028;
    const serviceFee = Math.max(2, Math.round(numericAmount * percent * 100) / 100);
    const urgentFee = urgent ? Math.max(5, Math.round(numericAmount * 0.015 * 100) / 100) : 0;
    const totalAmount = Math.round((numericAmount + serviceFee + urgentFee) * 100) / 100;
    return {
      currency: normalizedCurrency,
      rateToman,
      sampleRateToman: rateToman,
      rateSource: rateState.sourceName,
      rateSourceUrl: rateState.sourceUrl || "",
      rateFetchedAt: rateState.fetchedAt || "",
      rateFallback: Boolean(rateState.fallback || rateState.stale),
      serviceFee,
      urgentFee,
      totalAmount,
      serviceFeeUsd: normalizedCurrency === "USD" ? serviceFee : undefined,
      urgentFeeUsd: normalizedCurrency === "USD" ? urgentFee : undefined,
      totalUsd: normalizedCurrency === "USD" ? totalAmount : undefined,
      estimatedToman: Math.round(totalAmount * rateToman)
    };
  }

  async function loadRates() {
    try {
      const response = await fetch("api/rates");
      const type = response.headers.get("content-type") || "";
      if (!type.includes("application/json")) return;
      const payload = await response.json();
      if (response.ok && payload.ok && payload.rates) {
        rateState = payload;
        updateEstimate();
      }
    } catch {
      // Static builds keep the fallback estimate.
    }
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
    const { phoneCode, phoneVerificationToken, ...safeData } = data;
    const request = {
      id: `DR-${now.slice(0, 10).replace(/-/g, "")}-${suffix}`,
      ...safeData,
      amount: Number(data.amount),
      status: "new",
      estimate: estimateDetails(Number(data.amount), Boolean(data.urgent), data.currency),
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

  function rateSourceLabel() {
    return rateState.source === "bonbast" ? "نرخ Bonbast" : "نرخ موقت";
  }

  function selectedRateText(currency) {
    return `${rateSourceLabel()} ${currency}: ${toman.format(rateFor(currency))} تومان`;
  }

  function updateEstimate() {
    const amount = Number(form.elements.amount.value);
    const urgent = form.elements.urgent.checked;
    const currency = form.elements.currency.value;
    const details = Number.isFinite(amount) && amount > 0 ? estimateDetails(amount, urgent, currency) : null;
    estimateText.textContent = details ? `${toman.format(details.estimatedToman)} تومان` : "مبلغ را وارد کنید";
    if (estimateHint) {
      if (details) {
        const baseToman = Math.round(amount * details.rateToman);
        const feeAmount = Math.round((details.serviceFee + details.urgentFee) * 100) / 100;
        estimateHint.textContent = `${selectedRateText(currency)}؛ مبلغ پایه: ${toman.format(baseToman)} تومان؛ کارمزد: ${amountFormatter.format(feeAmount)} ${currency}.`;
      } else {
        estimateHint.textContent = `${selectedRateText(currency)}؛ قیمت نهایی توسط اپراتور تایید می‌شود.`;
      }
    }
  }

  function setMessage(text, tone) {
    message.textContent = text || "";
    message.dataset.tone = tone || "";
  }

  function setPhoneVerifyMessage(text, tone) {
    if (!phoneVerifyMessage) return;
    phoneVerifyMessage.textContent = text || "";
    phoneVerifyMessage.dataset.tone = tone || "";
  }

  function isolateLtr(value) {
    return `\u2066${String(value || "")}\u2069`;
  }

  function normalizePhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.startsWith("0098")) digits = `0${digits.slice(4)}`;
    if (digits.startsWith("98") && digits.length === 12) digits = `0${digits.slice(2)}`;
    if (digits.startsWith("9") && digits.length === 10) digits = `0${digits}`;
    return digits;
  }

  function isPhoneValid(phone) {
    return /^09\d{9}$/.test(phone);
  }

  function persianDigits(value) {
    return String(value).replace(/\d/g, (digit) => toman.format(Number(digit)));
  }

  function formatCooldown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${persianDigits(String(minutes).padStart(2, "0"))}:${persianDigits(String(seconds).padStart(2, "0"))}`;
  }

  function phoneVerified() {
    return Boolean(form.elements.phoneVerificationToken.value && verifiedPhone === normalizePhone(form.elements.phone.value));
  }

  function updateSubmitAvailability() {
    if (!submitButton) return;
    submitButton.disabled = submitting;
    submitButton.textContent = submitting ? "در حال ثبت..." : "ثبت درخواست و دریافت کد رهگیری";
  }

  function resetPhoneVerification(text = "") {
    verifiedPhone = "";
    form.elements.phoneVerificationToken.value = "";
    if (text) setPhoneVerifyMessage(text, "error");
    updateSubmitAvailability();
  }

  function renderPhoneCodeCooldown() {
    if (!sendPhoneCodeButton || phoneCodeSending) return;
    const cooldownUntil = Number(localStorage.getItem(phoneCodeCooldownKey) || 0);
    const remaining = cooldownUntil - Date.now();
    if (remaining > 0) {
      sendPhoneCodeButton.disabled = true;
      sendPhoneCodeButton.textContent = `ارسال مجدد ${formatCooldown(remaining)}`;
      if (!phoneCodeCooldownTimer) {
        phoneCodeCooldownTimer = window.setInterval(renderPhoneCodeCooldown, 1000);
      }
      return;
    }
    localStorage.removeItem(phoneCodeCooldownKey);
    if (phoneCodeCooldownTimer) {
      window.clearInterval(phoneCodeCooldownTimer);
      phoneCodeCooldownTimer = null;
    }
    sendPhoneCodeButton.disabled = false;
    sendPhoneCodeButton.textContent = "ارسال کد تایید";
  }

  function startPhoneCodeCooldown(seconds) {
    const durationSeconds = Math.max(1, Number(seconds) || 120);
    localStorage.setItem(phoneCodeCooldownKey, String(Date.now() + durationSeconds * 1000));
    renderPhoneCodeCooldown();
  }

  function setHeaderState() {
    header.dataset.elevated = window.scrollY > 16 ? "true" : "false";
  }

  async function submitRequest(event) {
    event.preventDefault();
    setMessage("", "");
    const data = Object.fromEntries(new FormData(form).entries());
    data.urgent = form.elements.urgent.checked;
    data.userConsent = form.elements.userConsent.checked;
    data.amount = Number(data.amount);

    if (!phoneVerified()) {
      window.alert("شماره تایید نشده است.");
      form.elements.phone.focus();
      updateSubmitAvailability();
      return;
    }

    submitting = true;
    updateSubmitAvailability();

    try {
      const payload = await submitViaApiOrStatic(data);
      const request = payload.request;
      const rateText = request.estimate?.rateToman
        ? ` با نرخ ${toman.format(request.estimate.rateToman)} تومان`
        : "";
      setMessage(`درخواست شما با کد ${request.id} ثبت شد. برآورد اولیه${rateText}: ${toman.format(request.estimate.estimatedToman)} تومان. قیمت نهایی بعد از بررسی پیامک می‌شود.`, "success");
      window.arzrahTrackRequestSubmit?.(request);
      form.reset();
      resetPhoneVerification();
      setPhoneVerifyMessage("", "");
      updateEstimate();
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      submitting = false;
      updateSubmitAvailability();
    }
  }

  if (form) {
    sendPhoneCodeButton?.addEventListener("click", async () => {
      if (sendPhoneCodeButton.disabled) return;
      const phone = normalizePhone(form.elements.phone.value);
      setPhoneVerifyMessage("", "");
      if (!isPhoneValid(phone)) {
        resetPhoneVerification("شماره را درست وارد کنید؛ مثل 09123456789.");
        return;
      }
      phoneCodeSending = true;
      let cooldownSeconds = 0;
      sendPhoneCodeButton.disabled = true;
      sendPhoneCodeButton.textContent = "در حال ارسال...";
      try {
        const response = await fetch("api/request-phone-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone })
        });
        const type = response.headers.get("content-type") || "";
        if (!type.includes("application/json")) {
          form.elements.phoneCode.value = "2468";
          setPhoneVerifyMessage("نسخه دمو است؛ کد تایید 2468 آماده شد.", "success");
          cooldownSeconds = 120;
          return;
        }
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          cooldownSeconds = response.status === 429 ? Number(payload.retryAfterSeconds || 0) : 0;
          throw new Error(payload.error || "ارسال کد تایید انجام نشد.");
        }
        if (payload.devCode) form.elements.phoneCode.value = payload.devCode;
        setPhoneVerifyMessage(`کد تایید به ${isolateLtr(payload.phone || phone)} ارسال شد.`, "success");
        cooldownSeconds = Number(payload.resendAfterSeconds || 120);
      } catch (error) {
        setPhoneVerifyMessage(error.message || "ارسال کد تایید انجام نشد.", "error");
      } finally {
        phoneCodeSending = false;
        if (cooldownSeconds > 0) startPhoneCodeCooldown(cooldownSeconds);
        else renderPhoneCodeCooldown();
      }
    });

    verifyPhoneCodeButton?.addEventListener("click", async () => {
      const phone = normalizePhone(form.elements.phone.value);
      const code = String(form.elements.phoneCode.value || "").trim();
      setPhoneVerifyMessage("", "");
      if (!isPhoneValid(phone)) {
        resetPhoneVerification("شماره موبایل معتبر نیست.");
        return;
      }
      if (!code) {
        resetPhoneVerification("کد تایید را وارد کنید.");
        form.elements.phoneCode.focus();
        return;
      }
      phoneCodeVerifying = true;
      verifyPhoneCodeButton.disabled = true;
      verifyPhoneCodeButton.textContent = "در حال تایید...";
      try {
        const response = await fetch("api/verify-phone-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, code })
        });
        const type = response.headers.get("content-type") || "";
        if (!type.includes("application/json")) {
          if (code !== "2468") throw new Error("کد تایید درست نیست.");
          verifiedPhone = phone;
          form.elements.phoneVerificationToken.value = `static-${Date.now()}`;
          setPhoneVerifyMessage("شماره در نسخه دمو تایید شد.", "success");
          updateSubmitAvailability();
          return;
        }
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "تایید شماره انجام نشد.");
        verifiedPhone = phone;
        form.elements.phoneVerificationToken.value = payload.phoneVerificationToken;
        setPhoneVerifyMessage("شماره موبایل تایید شد.", "success");
        updateSubmitAvailability();
      } catch (error) {
        resetPhoneVerification(error.message || "تایید شماره انجام نشد.");
      } finally {
        phoneCodeVerifying = false;
        verifyPhoneCodeButton.disabled = false;
        verifyPhoneCodeButton.textContent = "تایید شماره";
      }
    });

    form.elements.phone.addEventListener("input", () => {
      const current = normalizePhone(form.elements.phone.value);
      if (verifiedPhone && current !== verifiedPhone) {
        resetPhoneVerification("شماره تغییر کرد؛ دوباره کد تایید بگیرید.");
      }
    });

    form.addEventListener("submit", submitRequest);
    form.addEventListener("input", updateEstimate);
    form.addEventListener("reset", () => {
      setTimeout(() => {
        updateEstimate();
        resetPhoneVerification();
        setPhoneVerifyMessage("", "");
      }, 0);
    });
    updateEstimate();
    loadRates();
    renderPhoneCodeCooldown();
    updateSubmitAvailability();
  }

  window.addEventListener("scroll", setHeaderState, { passive: true });
  setHeaderState();
})();
