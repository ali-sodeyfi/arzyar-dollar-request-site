const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "requests.json");
const SMS_LOG_FILE = path.join(DATA_DIR, "sms-log.jsonl");

loadEnvFile(path.join(ROOT_DIR, ".env"));

const PORT = Number(process.env.PORT || 4321);
const ADMIN_TOKEN = crypto.randomBytes(32).toString("hex");
const ADMIN_PHONE = normalizePhone(process.env.ADMIN_PHONE || "00989128477764");
const SMS_PROVIDER = (
  process.env.SMS_PROVIDER ||
  (process.env.SMSIR_API_KEY ? "smsir" : process.env.KAVENEGAR_API_KEY ? "kavenegar" : "mock")
).toLowerCase();
const KAVENEGAR_API_KEY = process.env.KAVENEGAR_API_KEY || "";
const KAVENEGAR_SENDER = process.env.KAVENEGAR_SENDER || process.env.SMS_SENDER || "";
const SMSIR_API_KEY = process.env.SMSIR_API_KEY || "";
const SMSIR_LINE_NUMBER = process.env.SMSIR_LINE_NUMBER || process.env.SMSIR_SENDER || process.env.SMS_SENDER || "";
const SMSIR_VERIFY_TEMPLATE_ID = process.env.SMSIR_VERIFY_TEMPLATE_ID || "";
const SMSIR_VERIFY_CODE_PARAMETER = process.env.SMSIR_VERIFY_CODE_PARAMETER || "Code";
const SMS_WEBHOOK_URL = process.env.SMS_WEBHOOK_URL || "";
const SMS_WEBHOOK_TOKEN = process.env.SMS_WEBHOOK_TOKEN || "";
const OTP_TTL_MS = Number(process.env.ADMIN_OTP_TTL_SECONDS || 300) * 1000;
const OTP_RESEND_MS = Number(process.env.ADMIN_OTP_RESEND_SECONDS || 120) * 1000;
const SAMPLE_USD_TOMAN = Number(process.env.SAMPLE_USD_TOMAN || 65000);

let adminOtp = null;

const statuses = new Set([
  "new",
  "reviewing",
  "quoted",
  "waiting_payment",
  "paid",
  "completed",
  "rejected"
]);

const serviceTypes = new Set([
  "international_payment",
  "subscription",
  "gift_card",
  "exam_fee",
  "university",
  "software",
  "shop_order",
  "other"
]);

const currencies = new Set(["USD", "EUR", "GBP", "CAD", "AUD", "AED", "TRY"]);

const statusLabels = {
  new: "جدید",
  reviewing: "در حال بررسی",
  quoted: "پیش‌فاکتور",
  waiting_payment: "در انتظار پرداخت",
  paid: "پرداخت شده",
  completed: "تکمیل شده",
  rejected: "رد شده"
};

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

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] != null) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]\n", "utf8");
  }
}

function readRequests() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRequests(requests) {
  ensureDataFile();
  const tmpFile = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, `${JSON.stringify(requests, null, 2)}\n`, "utf8");
  fs.renameSync(tmpFile, DATA_FILE);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, statusCode, body, type = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function cleanText(value, max = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0098")) digits = `0${digits.slice(4)}`;
  if (digits.startsWith("98") && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (digits.startsWith("9") && digits.length === 10) digits = `0${digits}`;
  return digits;
}

function maskPhone(value) {
  const phone = normalizePhone(value);
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 4)}***${phone.slice(-4)}`;
}

function coerceSmsIrLineNumber(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d+$/.test(text)) {
    const number = Number(text);
    if (Number.isSafeInteger(number)) return number;
  }
  return text;
}

function extractSmsCode(message) {
  const match = String(message || "").match(/\b(\d{4,8})\b/);
  return match ? match[1] : "";
}

function smsLogMessage(message, reason) {
  if (reason === "admin_login_otp") {
    return String(message || "").replace(/\b\d{4,8}\b/g, "[CODE]");
  }
  return message;
}

function summarizeSmsIrData(data) {
  if (!data || typeof data !== "object") return undefined;
  const summary = {};
  if (data.messageId != null) summary.messageId = data.messageId;
  if (data.packId != null) summary.packId = data.packId;
  if (Array.isArray(data.messageIds)) summary.messageIds = data.messageIds;
  if (data.cost != null) summary.cost = data.cost;
  return Object.keys(summary).length ? summary : undefined;
}

function normalizeUrl(value) {
  const raw = cleanText(value, 700);
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function estimateCost(amount, urgent) {
  const numericAmount = Number(amount);
  const percent =
    numericAmount <= 100 ? 0.055 :
    numericAmount <= 500 ? 0.045 :
    numericAmount <= 2000 ? 0.035 :
    0.028;
  const serviceFeeUsd = Math.max(2, Math.round(numericAmount * percent * 100) / 100);
  const urgentFeeUsd = urgent ? Math.max(5, Math.round(numericAmount * 0.015 * 100) / 100) : 0;
  const totalUsd = Math.round((numericAmount + serviceFeeUsd + urgentFeeUsd) * 100) / 100;
  return {
    sampleRateToman: SAMPLE_USD_TOMAN,
    serviceFeeUsd,
    urgentFeeUsd,
    totalUsd,
    estimatedToman: Math.round(totalUsd * SAMPLE_USD_TOMAN)
  };
}

function makeRequestId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `DR-${date}-${suffix}`;
}

function publicRequest(request) {
  return {
    id: request.id,
    status: request.status,
    estimate: request.estimate,
    createdAt: request.createdAt
  };
}

function hashOtp(code) {
  return crypto
    .createHash("sha256")
    .update(`${code}:${ADMIN_PHONE}:${ADMIN_TOKEN}`)
    .digest("hex");
}

function makeOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function shouldExposeDevCode() {
  return SMS_PROVIDER === "mock" || process.env.SMS_EXPOSE_DEV_CODE === "true";
}

function appendSmsLog(entry) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(SMS_LOG_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
}

async function sendSms(receptor, message, reason = "notification") {
  const phone = normalizePhone(receptor);
  if (!phone) throw new Error("شماره گیرنده پیامک معتبر نیست.");

  const baseLog = {
    provider: SMS_PROVIDER,
    reason,
    receptor: maskPhone(phone),
    message: smsLogMessage(message, reason)
  };

  if (SMS_PROVIDER === "off") {
    appendSmsLog({ ...baseLog, ok: true, skipped: true });
    return { ok: true, skipped: true, provider: "off" };
  }

  if (SMS_PROVIDER === "mock") {
    console.log(`[SMS mock][${reason}] ${phone}: ${smsLogMessage(message, reason)}`);
    appendSmsLog({ ...baseLog, ok: true, mock: true });
    return { ok: true, mock: true, provider: "mock" };
  }

  if (SMS_PROVIDER === "webhook") {
    if (!SMS_WEBHOOK_URL) throw new Error("SMS_WEBHOOK_URL تنظیم نشده است.");
    const response = await fetch(SMS_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${SMS_WEBHOOK_TOKEN}` } : {})
      },
      body: JSON.stringify({ receptor: phone, message, reason })
    });
    const text = await response.text();
    if (!response.ok) {
      appendSmsLog({ ...baseLog, ok: false, status: response.status, response: text.slice(0, 500) });
      throw new Error("ارسال پیامک از وبهوک ناموفق بود.");
    }
    appendSmsLog({ ...baseLog, ok: true, status: response.status });
    return { ok: true, provider: "webhook" };
  }

  if (SMS_PROVIDER === "smsir" || SMS_PROVIDER === "sms.ir") {
    if (!SMSIR_API_KEY) throw new Error("SMSIR_API_KEY تنظیم نشده است.");

    const isAdminOtp = reason === "admin_login_otp";
    const useVerifyTemplate = isAdminOtp && SMSIR_VERIFY_TEMPLATE_ID;
    const endpoint = useVerifyTemplate
      ? "https://api.sms.ir/v1/send/verify"
      : "https://api.sms.ir/v1/send/bulk";
    let body;

    if (useVerifyTemplate) {
      const templateId = Number(SMSIR_VERIFY_TEMPLATE_ID);
      const code = extractSmsCode(message);
      if (!Number.isSafeInteger(templateId) || templateId <= 0) {
        throw new Error("SMSIR_VERIFY_TEMPLATE_ID معتبر نیست.");
      }
      if (!code) throw new Error("کد پیامکی برای قالب Verify پیدا نشد.");

      body = {
        mobile: phone,
        templateId,
        parameters: [
          {
            name: SMSIR_VERIFY_CODE_PARAMETER,
            value: code
          }
        ]
      };
    } else {
      const lineNumber = coerceSmsIrLineNumber(SMSIR_LINE_NUMBER);
      if (!lineNumber) throw new Error("SMSIR_LINE_NUMBER تنظیم نشده است.");
      body = {
        lineNumber,
        messageText: message,
        mobiles: [phone]
      };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-KEY": SMSIR_API_KEY
      },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    const hasApiStatus = payload && Object.prototype.hasOwnProperty.call(payload, "status");
    const apiStatus = hasApiStatus ? Number(payload.status) : null;
    if (!response.ok || (hasApiStatus && apiStatus !== 1)) {
      appendSmsLog({
        ...baseLog,
        ok: false,
        status: response.status,
        apiStatus,
        response: text.slice(0, 500)
      });
      throw new Error("ارسال پیامک SMS.ir ناموفق بود.");
    }
    appendSmsLog({
      ...baseLog,
      ok: true,
      status: response.status,
      apiStatus,
      endpoint: useVerifyTemplate ? "verify" : "bulk",
      data: summarizeSmsIrData(payload?.data)
    });
    return { ok: true, provider: "smsir", endpoint: useVerifyTemplate ? "verify" : "bulk" };
  }

  if (SMS_PROVIDER === "kavenegar") {
    if (!KAVENEGAR_API_KEY) throw new Error("KAVENEGAR_API_KEY تنظیم نشده است.");
    const params = new URLSearchParams({
      receptor: phone,
      message
    });
    if (KAVENEGAR_SENDER) params.set("sender", KAVENEGAR_SENDER);
    const response = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(KAVENEGAR_API_KEY)}/sms/send.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    const apiStatus = payload?.return?.status;
    if (!response.ok || (apiStatus && apiStatus !== 200)) {
      appendSmsLog({ ...baseLog, ok: false, status: response.status, apiStatus, response: text.slice(0, 500) });
      throw new Error("ارسال پیامک کاوه‌نگار ناموفق بود.");
    }
    appendSmsLog({ ...baseLog, ok: true, status: response.status, apiStatus });
    return { ok: true, provider: "kavenegar" };
  }

  throw new Error(`SMS_PROVIDER ناشناخته است: ${SMS_PROVIDER}`);
}

async function sendSmsSafe(receptor, message, reason) {
  try {
    return await sendSms(receptor, message, reason);
  } catch (error) {
    console.error(`[SMS failed][${reason}] ${error.message}`);
    return { ok: false, error: error.message };
  }
}

function requestSummary(request) {
  return `${request.id} | ${request.fullName} | ${request.amount} ${request.currency} | ${serviceLabels[request.serviceType] || request.serviceType}`;
}

async function notifyRequestCreated(request) {
  await Promise.all([
    sendSmsSafe(ADMIN_PHONE, `آرزیار: درخواست جدید ثبت شد. ${requestSummary(request)}`, "request_created_admin"),
    sendSmsSafe(request.phone, `آرزیار: درخواست شما با کد ${request.id} ثبت شد و در صف بررسی قرار گرفت.`, "request_created_customer")
  ]);
}

async function notifyRequestUpdated(request, changedFields, statusChanged) {
  const statusText = statusLabels[request.status] || request.status;
  const changeText = changedFields.length ? changedFields.join("، ") : "درخواست";
  const jobs = [
    sendSmsSafe(ADMIN_PHONE, `آرزیار: ${changeText} برای ${request.id} تغییر کرد. وضعیت فعلی: ${statusText}`, "request_updated_admin")
  ];
  if (statusChanged) {
    jobs.push(sendSmsSafe(request.phone, `آرزیار: وضعیت درخواست ${request.id} به «${statusText}» تغییر کرد.`, "request_status_customer"));
  }
  await Promise.all(jobs);
}

function requireAdmin(req, res, url) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : url.searchParams.get("token") || "";
  if (token !== ADMIN_TOKEN) {
    sendJson(res, 401, { ok: false, error: "دسترسی مدیریتی معتبر نیست." });
    return false;
  }
  return true;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv(requests) {
  const header = [
    "id",
    "status",
    "fullName",
    "phone",
    "email",
    "serviceType",
    "amount",
    "currency",
    "targetUrl",
    "urgent",
    "estimatedToman",
    "createdAt"
  ];
  const rows = requests.map((item) => [
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
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      app: "Arzyar",
      smsProvider: SMS_PROVIDER,
      now: new Date().toISOString()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/requests") {
    try {
      const body = await parseBody(req);
      const fullName = cleanText(body.fullName, 90);
      const phone = cleanText(body.phone, 32);
      const email = cleanText(body.email, 120);
      const serviceType = cleanText(body.serviceType, 60);
      const targetUrl = normalizeUrl(body.targetUrl);
      const currency = cleanText(body.currency, 8).toUpperCase();
      const paymentMethod = cleanText(body.paymentMethod, 80);
      const accountHint = cleanText(body.accountHint, 160);
      const description = cleanText(body.description, 1200);
      const deadline = cleanText(body.deadline, 40);
      const urgent = Boolean(body.urgent);
      const amount = Number(body.amount);

      const errors = [];
      if (fullName.length < 3) errors.push("نام و نام خانوادگی را کامل وارد کنید.");
      if (phone.length < 8) errors.push("شماره موبایل معتبر نیست.");
      if (!serviceTypes.has(serviceType)) errors.push("نوع سرویس معتبر نیست.");
      if (!targetUrl) errors.push("لینک پرداخت یا سایت مقصد معتبر نیست.");
      if (!Number.isFinite(amount) || amount <= 0) errors.push("مبلغ ارزی باید بزرگ‌تر از صفر باشد.");
      if (!currencies.has(currency)) errors.push("ارز انتخاب‌شده معتبر نیست.");
      if (!body.userConsent) errors.push("تایید قوانین و مجاز بودن درخواست ضروری است.");

      if (errors.length) {
        sendJson(res, 422, { ok: false, errors });
        return;
      }

      const now = new Date().toISOString();
      const requestItem = {
        id: makeRequestId(),
        fullName,
        phone,
        email,
        serviceType,
        targetUrl,
        amount,
        currency,
        paymentMethod,
        accountHint,
        description,
        deadline,
        urgent,
        status: "new",
        estimate: estimateCost(amount, urgent),
        assignedTo: "",
        internalNote: "",
        createdAt: now,
        updatedAt: now,
        timeline: [
          {
            status: "new",
            at: now,
            note: "درخواست ثبت شد و در صف بررسی قرار گرفت."
          }
        ]
      };

      const requests = readRequests();
      requests.unshift(requestItem);
      writeRequests(requests);
      notifyRequestCreated(requestItem);
      sendJson(res, 201, { ok: true, request: publicRequest(requestItem) });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "ثبت درخواست انجام نشد." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login-code") {
    try {
      if (!ADMIN_PHONE) {
        sendJson(res, 500, { ok: false, error: "شماره ادمین تنظیم نشده است." });
        return;
      }
      const now = Date.now();
      if (adminOtp && now - adminOtp.sentAt < OTP_RESEND_MS) {
        sendJson(res, 429, {
          ok: false,
          error: "کد قبلی به‌تازگی ارسال شده است. کمی صبر کنید.",
          retryAfterSeconds: Math.ceil((OTP_RESEND_MS - (now - adminOtp.sentAt)) / 1000)
        });
        return;
      }
      const code = makeOtpCode();
      adminOtp = {
        hash: hashOtp(code),
        expiresAt: now + OTP_TTL_MS,
        sentAt: now,
        attempts: 0
      };
      await sendSms(ADMIN_PHONE, `کد ورود پنل آرزیار: ${code}\nاعتبار: ${Math.round(OTP_TTL_MS / 60000)} دقیقه`, "admin_login_otp");
      sendJson(res, 200, {
        ok: true,
        phone: maskPhone(ADMIN_PHONE),
        expiresInSeconds: Math.round(OTP_TTL_MS / 1000),
        resendAfterSeconds: Math.round(OTP_RESEND_MS / 1000),
        ...(shouldExposeDevCode() ? { devCode: code } : {})
      });
    } catch (error) {
      sendJson(res, 503, { ok: false, error: error.message || "ارسال کد ورود انجام نشد." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    try {
      const body = await parseBody(req);
      const code = cleanText(body.code || body.pin, 16);
      const now = Date.now();
      if (!adminOtp || now > adminOtp.expiresAt) {
        sendJson(res, 403, { ok: false, error: "کد ورود منقضی شده است. دوباره کد بگیرید." });
        return;
      }
      adminOtp.attempts += 1;
      if (adminOtp.attempts > 5) {
        adminOtp = null;
        sendJson(res, 403, { ok: false, error: "تعداد تلاش‌ها زیاد بود. دوباره کد بگیرید." });
        return;
      }
      if (hashOtp(code) === adminOtp.hash) {
        adminOtp = null;
        sendJson(res, 200, { ok: true, token: ADMIN_TOKEN });
        return;
      }
      sendJson(res, 403, { ok: false, error: "کد ورود درست نیست." });
      return;
    } catch {
      sendJson(res, 400, { ok: false, error: "ورودی معتبر نیست." });
    }
    return;
  }

  if (url.pathname.startsWith("/api/admin/")) {
    if (!requireAdmin(req, res, url)) return;

    if (req.method === "GET" && url.pathname === "/api/admin/requests") {
      sendJson(res, 200, { ok: true, requests: readRequests() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/export.csv") {
      const csv = exportCsv(readRequests());
      sendText(res, 200, csv, "text/csv; charset=utf-8");
      return;
    }

    const patchMatch = url.pathname.match(/^\/api\/admin\/requests\/([^/]+)$/);
    if (req.method === "PATCH" && patchMatch) {
      try {
        const id = decodeURIComponent(patchMatch[1]);
        const body = await parseBody(req);
        const requests = readRequests();
        const index = requests.findIndex((item) => item.id === id);
        if (index === -1) {
          sendJson(res, 404, { ok: false, error: "درخواست پیدا نشد." });
          return;
        }
        const current = requests[index];
        const previousStatus = current.status;
        const previousAssignedTo = current.assignedTo || "";
        const previousInternalNote = current.internalNote || "";
        const nextStatus = cleanText(body.status, 40);
        const internalNote = cleanText(body.internalNote, 1200);
        const assignedTo = cleanText(body.assignedTo, 80);
        const now = new Date().toISOString();
        const changedFields = [];
        let statusChanged = false;

        if (nextStatus) {
          if (!statuses.has(nextStatus)) {
            sendJson(res, 422, { ok: false, error: "وضعیت انتخاب‌شده معتبر نیست." });
            return;
          }
          if (nextStatus !== current.status) {
            current.status = nextStatus;
            statusChanged = true;
            changedFields.push("وضعیت");
            current.timeline = Array.isArray(current.timeline) ? current.timeline : [];
            current.timeline.unshift({
              status: nextStatus,
              at: now,
              note: internalNote || "وضعیت توسط مدیر تغییر کرد."
            });
          }
        }

        if ("internalNote" in body) current.internalNote = internalNote;
        if ("assignedTo" in body) current.assignedTo = assignedTo;
        if ("assignedTo" in body && assignedTo !== previousAssignedTo) changedFields.push("مسئول پیگیری");
        if ("internalNote" in body && internalNote !== previousInternalNote) changedFields.push("یادداشت داخلی");
        current.updatedAt = now;

        requests[index] = current;
        writeRequests(requests);
        if (changedFields.length || previousStatus !== current.status) {
          notifyRequestUpdated(current, changedFields, statusChanged);
        }
        sendJson(res, 200, { ok: true, request: current });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message || "به‌روزرسانی انجام نشد." });
      }
      return;
    }
  }

  sendJson(res, 404, { ok: false, error: "مسیر API پیدا نشد." });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/dashboard") pathname = "/dashboard.html";
  if (pathname === "/benchmark") pathname = "/benchmark.html";

  const targetPath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!targetPath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(targetPath, (error, stat) => {
    if (error || !stat.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }
    const ext = path.extname(targetPath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    fs.createReadStream(targetPath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }
  serveStatic(req, res, url);
});

ensureDataFile();
server.listen(PORT, () => {
  console.log(`Arzyar site is running at http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`SMS provider: ${SMS_PROVIDER}`);
  console.log(`Admin OTP phone: ${maskPhone(ADMIN_PHONE)}`);
});
