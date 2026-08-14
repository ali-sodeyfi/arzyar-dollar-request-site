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
const SMSIR_CUSTOMER_VERIFY_TEMPLATE_ID = process.env.SMSIR_CUSTOMER_VERIFY_TEMPLATE_ID || SMSIR_VERIFY_TEMPLATE_ID;
const SMSIR_CUSTOMER_VERIFY_CODE_PARAMETER = process.env.SMSIR_CUSTOMER_VERIFY_CODE_PARAMETER || SMSIR_VERIFY_CODE_PARAMETER;
const SMS_WEBHOOK_URL = process.env.SMS_WEBHOOK_URL || "";
const SMS_WEBHOOK_TOKEN = process.env.SMS_WEBHOOK_TOKEN || "";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";
const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || "off").toLowerCase();
const ZARINPAL_MERCHANT_ID = process.env.ZARINPAL_MERCHANT_ID || "";
const ZARINPAL_SANDBOX = process.env.ZARINPAL_SANDBOX === "true";
const OTP_TTL_MS = Number(process.env.ADMIN_OTP_TTL_SECONDS || 300) * 1000;
const OTP_RESEND_MS = Number(process.env.ADMIN_OTP_RESEND_SECONDS || 120) * 1000;
const CUSTOMER_PHONE_OTP_TTL_MS = Number(process.env.CUSTOMER_PHONE_OTP_TTL_SECONDS || 300) * 1000;
const CUSTOMER_PHONE_OTP_RESEND_MS = Number(process.env.CUSTOMER_PHONE_OTP_RESEND_SECONDS || 120) * 1000;
const CUSTOMER_PHONE_VERIFY_TTL_MS = Number(process.env.CUSTOMER_PHONE_VERIFY_TTL_SECONDS || 1800) * 1000;
const SAMPLE_USD_TOMAN = Number(process.env.SAMPLE_USD_TOMAN || 65000);
const RATE_PROVIDER = (process.env.RATE_PROVIDER || "bonbast").toLowerCase();
const RATES_CACHE_TTL_MS = Number(process.env.RATES_CACHE_TTL_SECONDS || 300) * 1000;
const RATE_SOURCE_URLS = [
  process.env.BONBAST_RATE_URL,
  "https://www.bon-bast.com/",
  "https://www.bonbast.com/"
].filter(Boolean);

let adminOtp = null;
const customerPhoneOtps = new Map();
const customerPhoneVerificationTokens = new Map();
let ratesCache = null;

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

const currencyRateKeys = {
  USD: "usd",
  EUR: "eur",
  GBP: "gbp",
  CAD: "cad",
  AUD: "aud",
  AED: "aed",
  TRY: "try"
};

const currencyLabels = {
  USD: "دلار آمریکا",
  EUR: "یورو",
  GBP: "پوند انگلیس",
  CAD: "دلار کانادا",
  AUD: "دلار استرالیا",
  AED: "درهم امارات",
  TRY: "لیر ترکیه"
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

function isIranMobile(phone) {
  return /^09\d{9}$/.test(phone);
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
  if (reason === "admin_login_otp" || reason === "customer_phone_otp") {
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

function requestOrigin(req) {
  const forwardedProto = cleanText(req.headers["x-forwarded-proto"], 20).split(",")[0];
  const forwardedHost = cleanText(req.headers["x-forwarded-host"], 120).split(",")[0];
  const host = forwardedHost || cleanText(req.headers.host, 120);
  if (!host) return `http://localhost:${PORT}`;
  const proto = forwardedProto || (req.socket.encrypted ? "https" : "http");
  return `${proto}://${host}`;
}

function dashboardRequestUrl(req, requestId) {
  const base = (PUBLIC_BASE_URL || requestOrigin(req)).replace(/\/+$/, "");
  return `${base}/dashboard?request=${encodeURIComponent(requestId)}`;
}

function paymentCallbackUrl(req, requestId) {
  const base = (PUBLIC_BASE_URL || requestOrigin(req)).replace(/\/+$/, "");
  return `${base}/api/payment/callback?requestId=${encodeURIComponent(requestId)}`;
}

function zarinpalBaseUrl() {
  return ZARINPAL_SANDBOX ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com";
}

function zarinpalStartPayUrl(authority) {
  return `${zarinpalBaseUrl()}/pg/StartPay/${encodeURIComponent(authority)}`;
}

function normalizeTomanAmount(value) {
  const amount = Math.round(Number(value || 0));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

function formatSmsAmount(value) {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Math.round(Number(value || 0)));
}

function normalizeRate(value) {
  const text = String(value ?? "").replace(/[^\d.]/g, "");
  const amount = Math.round(Number(text));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

function fallbackRatePayload(reason = "") {
  const fetchedAt = new Date().toISOString();
  const rates = {};
  for (const currency of currencies) {
    const rate = currency === "USD" ? SAMPLE_USD_TOMAN : 0;
    rates[currency] = {
      currency,
      label: currencyLabels[currency],
      sellToman: rate || SAMPLE_USD_TOMAN,
      source: "fallback"
    };
  }
  return {
    ok: true,
    source: "fallback",
    sourceName: "نرخ پشتیبان",
    sourceUrl: "",
    fetchedAt,
    cachedUntil: fetchedAt,
    fallback: true,
    reason,
    rates
  };
}

function parseJsonObjectAt(text, startIndex) {
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (char === "\\") {
        escapeNext = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }
  return "";
}

function parseBonbastSymbols(html) {
  const markerIndex = html.indexOf("SYMBOLS_DATA");
  if (markerIndex === -1) return null;
  const objectStart = html.indexOf("{", markerIndex);
  if (objectStart === -1) return null;
  const objectText = parseJsonObjectAt(html, objectStart);
  if (!objectText) return null;
  return JSON.parse(objectText);
}

async function fetchTextWithTimeout(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ArzrahRateFetcher/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function ratesFromBonbastSymbols(symbols, sourceUrl) {
  const rates = {};
  for (const [currency, key] of Object.entries(currencyRateKeys)) {
    const sellToman = normalizeRate(symbols[key]);
    if (sellToman) {
      rates[currency] = {
        currency,
        label: currencyLabels[currency],
        sellToman,
        source: "bonbast"
      };
    }
  }
  if (!rates.USD?.sellToman) return null;
  return {
    ok: true,
    source: "bonbast",
    sourceName: "Bonbast",
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    cachedUntil: new Date(Date.now() + RATES_CACHE_TTL_MS).toISOString(),
    fallback: false,
    rates
  };
}

async function getExchangeRates(force = false) {
  if (RATE_PROVIDER === "fallback" || RATE_PROVIDER === "mock" || RATE_PROVIDER === "off") {
    return fallbackRatePayload(`RATE_PROVIDER=${RATE_PROVIDER}`);
  }

  const now = Date.now();
  if (!force && ratesCache && now < ratesCache.expiresAt) {
    return ratesCache.payload;
  }

  const errors = [];
  for (const sourceUrl of RATE_SOURCE_URLS) {
    try {
      const html = await fetchTextWithTimeout(sourceUrl);
      const symbols = parseBonbastSymbols(html);
      const payload = symbols ? ratesFromBonbastSymbols(symbols, sourceUrl) : null;
      if (!payload) throw new Error("نرخ‌های قابل خواندن پیدا نشد.");
      ratesCache = {
        expiresAt: now + RATES_CACHE_TTL_MS,
        payload
      };
      return payload;
    } catch (error) {
      errors.push(`${sourceUrl}: ${error.message}`);
    }
  }

  if (ratesCache?.payload) {
    return {
      ...ratesCache.payload,
      stale: true,
      errors
    };
  }

  return fallbackRatePayload(errors.join(" | "));
}

async function createPaymentLink(req, requestItem, amountToman) {
  if (PAYMENT_PROVIDER !== "zarinpal") {
    throw new Error("درگاه پرداخت هنوز فعال نشده است.");
  }
  if (!ZARINPAL_MERCHANT_ID) {
    throw new Error("ZARINPAL_MERCHANT_ID تنظیم نشده است.");
  }
  const response = await fetch(`${zarinpalBaseUrl()}/pg/v4/payment/request.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      merchant_id: ZARINPAL_MERCHANT_ID,
      amount: amountToman,
      callback_url: paymentCallbackUrl(req, requestItem.id),
      description: `پرداخت درخواست ${requestItem.id} در ارزراه`,
      metadata: {
        mobile: requestItem.phone || undefined,
        email: requestItem.email || undefined
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  const code = Number(payload?.data?.code);
  const authority = payload?.data?.authority;
  if (!response.ok || code !== 100 || !authority) {
    throw new Error(payload?.errors?.message || payload?.data?.message || "ساخت لینک پرداخت ناموفق بود.");
  }
  return {
    provider: "zarinpal",
    authority,
    amountToman,
    payUrl: zarinpalStartPayUrl(authority),
    createdAt: new Date().toISOString(),
    status: "pending"
  };
}

async function verifyPayment(payment) {
  if (PAYMENT_PROVIDER !== "zarinpal" || !ZARINPAL_MERCHANT_ID) {
    throw new Error("درگاه پرداخت تنظیم نشده است.");
  }
  const response = await fetch(`${zarinpalBaseUrl()}/pg/v4/payment/verify.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      merchant_id: ZARINPAL_MERCHANT_ID,
      amount: payment.amountToman,
      authority: payment.authority
    })
  });
  const payload = await response.json().catch(() => ({}));
  const code = Number(payload?.data?.code);
  if (!response.ok || ![100, 101].includes(code)) {
    throw new Error(payload?.errors?.message || payload?.data?.message || "تایید پرداخت ناموفق بود.");
  }
  return {
    code,
    refId: payload?.data?.ref_id,
    cardPan: payload?.data?.card_pan,
    verifiedAt: new Date().toISOString()
  };
}

async function estimateCost(amount, urgent, currency) {
  const numericAmount = Number(amount);
  const normalizedCurrency = currencies.has(String(currency || "").toUpperCase()) ? String(currency).toUpperCase() : "USD";
  const ratePayload = await getExchangeRates();
  const rateToman = normalizeRate(ratePayload.rates?.[normalizedCurrency]?.sellToman) || SAMPLE_USD_TOMAN;
  const percent =
    numericAmount <= 100 ? 0.055 :
    numericAmount <= 500 ? 0.045 :
    numericAmount <= 2000 ? 0.035 :
    0.028;
  const serviceFee = Math.max(2, Math.round(numericAmount * percent * 100) / 100);
  const urgentFee = urgent ? Math.max(5, Math.round(numericAmount * 0.015 * 100) / 100) : 0;
  const totalAmount = Math.round((numericAmount + serviceFee + urgentFee) * 100) / 100;
  return {
    currency: normalizedCurrency,
    rateToman,
    sampleRateToman: rateToman,
    rateSource: ratePayload.sourceName,
    rateSourceUrl: ratePayload.sourceUrl,
    rateFetchedAt: ratePayload.fetchedAt,
    rateFallback: Boolean(ratePayload.fallback || ratePayload.stale),
    serviceFee,
    urgentFee,
    totalAmount,
    serviceFeeUsd: normalizedCurrency === "USD" ? serviceFee : undefined,
    urgentFeeUsd: normalizedCurrency === "USD" ? urgentFee : undefined,
    totalUsd: normalizedCurrency === "USD" ? totalAmount : undefined,
    estimatedToman: Math.round(totalAmount * rateToman)
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

function hashScopedOtp(code, subject) {
  return crypto
    .createHash("sha256")
    .update(`${code}:${subject}:${ADMIN_TOKEN}`)
    .digest("hex");
}

function makeOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function shouldExposeDevCode() {
  return SMS_PROVIDER === "mock" || process.env.SMS_EXPOSE_DEV_CODE === "true";
}

function cleanupPhoneVerification(now = Date.now()) {
  for (const [phone, otp] of customerPhoneOtps) {
    if (!otp || now > otp.expiresAt) customerPhoneOtps.delete(phone);
  }
  for (const [token, item] of customerPhoneVerificationTokens) {
    if (!item || now > item.expiresAt) customerPhoneVerificationTokens.delete(token);
  }
}

function createPhoneVerificationToken(phone) {
  cleanupPhoneVerification();
  const token = crypto.randomBytes(24).toString("hex");
  customerPhoneVerificationTokens.set(token, {
    phone,
    expiresAt: Date.now() + CUSTOMER_PHONE_VERIFY_TTL_MS
  });
  return token;
}

function isPhoneVerificationTokenValid(phone, token) {
  cleanupPhoneVerification();
  const item = customerPhoneVerificationTokens.get(token);
  return Boolean(item && item.phone === phone && Date.now() <= item.expiresAt);
}

function consumePhoneVerificationToken(phone, token) {
  if (!isPhoneVerificationTokenValid(phone, token)) return false;
  customerPhoneVerificationTokens.delete(token);
  return true;
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
    const isCustomerOtp = reason === "customer_phone_otp";
    const verifyTemplateId = isCustomerOtp ? SMSIR_CUSTOMER_VERIFY_TEMPLATE_ID : SMSIR_VERIFY_TEMPLATE_ID;
    const verifyCodeParameter = isCustomerOtp ? SMSIR_CUSTOMER_VERIFY_CODE_PARAMETER : SMSIR_VERIFY_CODE_PARAMETER;
    const useVerifyTemplate = (isAdminOtp || isCustomerOtp) && verifyTemplateId;
    const endpoint = useVerifyTemplate
      ? "https://api.sms.ir/v1/send/verify"
      : "https://api.sms.ir/v1/send/bulk";
    let body;

    if (useVerifyTemplate) {
      const templateId = Number(verifyTemplateId);
      const code = extractSmsCode(message);
      if (!Number.isSafeInteger(templateId) || templateId <= 0) {
        throw new Error("شناسه قالب Verify پیامک معتبر نیست.");
      }
      if (!code) throw new Error("کد پیامکی برای قالب Verify پیدا نشد.");

      body = {
        mobile: phone,
        templateId,
        parameters: [
          {
            name: verifyCodeParameter,
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

async function notifyRequestCreated(request, adminUrl) {
  const adminLink = adminUrl ? `\nمشاهده: ${adminUrl}` : "";
  await Promise.all([
    sendSmsSafe(ADMIN_PHONE, `ارزراه: درخواست جدید ثبت شد. ${requestSummary(request)}${adminLink}`, "request_created_admin"),
    sendSmsSafe(request.phone, `ارزراه: درخواست شما با کد ${request.id} ثبت شد و در صف بررسی قرار گرفت.`, "request_created_customer")
  ]);
}

async function notifyRequestUpdated(request, changedFields, statusChanged) {
  const statusText = statusLabels[request.status] || request.status;
  const changeText = changedFields.length ? changedFields.join("، ") : "درخواست";
  const jobs = [
    sendSmsSafe(ADMIN_PHONE, `ارزراه: ${changeText} برای ${request.id} تغییر کرد. وضعیت فعلی: ${statusText}`, "request_updated_admin")
  ];
  if (statusChanged) {
    jobs.push(sendSmsSafe(request.phone, `ارزراه: وضعیت درخواست ${request.id} به «${statusText}» تغییر کرد.`, "request_status_customer"));
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
    "finalPriceToman",
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
    item.finalPriceToman || "",
    item.createdAt
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      app: "Arzrah",
      smsProvider: SMS_PROVIDER,
      rateProvider: RATE_PROVIDER,
      now: new Date().toISOString()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/rates") {
    const force = url.searchParams.get("refresh") === "1";
    const rates = await getExchangeRates(force);
    sendJson(res, 200, rates);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/request-phone-code") {
    try {
      const body = await parseBody(req);
      const phone = normalizePhone(body.phone);
      if (!isIranMobile(phone)) {
        sendJson(res, 422, { ok: false, error: "شماره موبایل را به شکل درست وارد کنید؛ مثل 09123456789." });
        return;
      }

      cleanupPhoneVerification();
      const now = Date.now();
      const previous = customerPhoneOtps.get(phone);
      if (previous && now - previous.sentAt < CUSTOMER_PHONE_OTP_RESEND_MS) {
        sendJson(res, 429, {
          ok: false,
          error: "کد قبلی به‌تازگی ارسال شده است. کمی صبر کنید.",
          retryAfterSeconds: Math.ceil((CUSTOMER_PHONE_OTP_RESEND_MS - (now - previous.sentAt)) / 1000)
        });
        return;
      }

      const code = makeOtpCode();
      customerPhoneOtps.set(phone, {
        hash: hashScopedOtp(code, `customer:${phone}`),
        expiresAt: now + CUSTOMER_PHONE_OTP_TTL_MS,
        sentAt: now,
        attempts: 0
      });
      await sendSms(phone, `کد تایید شماره در ارزراه: ${code}\nاعتبار: ${Math.round(CUSTOMER_PHONE_OTP_TTL_MS / 60000)} دقیقه`, "customer_phone_otp");
      sendJson(res, 200, {
        ok: true,
        phone: maskPhone(phone),
        expiresInSeconds: Math.round(CUSTOMER_PHONE_OTP_TTL_MS / 1000),
        resendAfterSeconds: Math.round(CUSTOMER_PHONE_OTP_RESEND_MS / 1000),
        ...(shouldExposeDevCode() ? { devCode: code } : {})
      });
    } catch (error) {
      sendJson(res, 503, { ok: false, error: error.message || "ارسال کد تایید موبایل انجام نشد." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/verify-phone-code") {
    try {
      const body = await parseBody(req);
      const phone = normalizePhone(body.phone);
      const code = cleanText(body.code, 16);
      const now = Date.now();
      const item = customerPhoneOtps.get(phone);

      if (!isIranMobile(phone)) {
        sendJson(res, 422, { ok: false, error: "شماره موبایل معتبر نیست." });
        return;
      }
      if (!item || now > item.expiresAt) {
        customerPhoneOtps.delete(phone);
        sendJson(res, 403, { ok: false, error: "کد تایید منقضی شده است. دوباره کد بگیرید." });
        return;
      }
      item.attempts += 1;
      if (item.attempts > 5) {
        customerPhoneOtps.delete(phone);
        sendJson(res, 403, { ok: false, error: "تعداد تلاش‌ها زیاد بود. دوباره کد بگیرید." });
        return;
      }
      if (hashScopedOtp(code, `customer:${phone}`) !== item.hash) {
        sendJson(res, 403, { ok: false, error: "کد تایید درست نیست." });
        return;
      }

      customerPhoneOtps.delete(phone);
      sendJson(res, 200, {
        ok: true,
        phone: maskPhone(phone),
        phoneVerificationToken: createPhoneVerificationToken(phone),
        expiresInSeconds: Math.round(CUSTOMER_PHONE_VERIFY_TTL_MS / 1000)
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "تایید شماره انجام نشد." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/requests") {
    try {
      const body = await parseBody(req);
      const fullName = cleanText(body.fullName, 90);
      const phone = normalizePhone(body.phone);
      const phoneVerificationToken = cleanText(body.phoneVerificationToken, 96);
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
      if (!isIranMobile(phone)) errors.push("شماره موبایل معتبر نیست.");
      if (!isPhoneVerificationTokenValid(phone, phoneVerificationToken)) errors.push("قبل از ثبت درخواست، شماره موبایل را با کد پیامکی تایید کنید.");
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
        estimate: await estimateCost(amount, urgent, currency),
        payments: [],
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
      consumePhoneVerificationToken(phone, phoneVerificationToken);
      notifyRequestCreated(requestItem, dashboardRequestUrl(req, requestItem.id));
      sendJson(res, 201, { ok: true, request: publicRequest(requestItem) });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "ثبت درخواست انجام نشد." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/payment/callback") {
    const requestId = cleanText(url.searchParams.get("requestId"), 80);
    const authority = cleanText(url.searchParams.get("Authority"), 80);
    const status = cleanText(url.searchParams.get("Status"), 20).toUpperCase();
    const requests = readRequests();
    const index = requests.findIndex((item) => item.id === requestId);
    const current = index >= 0 ? requests[index] : null;
    const payment = current?.payments?.find((item) => item.authority === authority);
    let title = "پرداخت ناموفق بود";
    let text = "درخواست پرداخت پیدا نشد یا توسط درگاه تایید نشد.";
    let tone = "error";

    if (current && payment && status === "OK") {
      try {
        const verification = await verifyPayment(payment);
        payment.status = "paid";
        payment.refId = verification.refId;
        payment.cardPan = verification.cardPan;
        payment.verifiedAt = verification.verifiedAt;
        current.status = "paid";
        current.updatedAt = verification.verifiedAt;
        current.timeline = Array.isArray(current.timeline) ? current.timeline : [];
        current.timeline.unshift({
          status: "paid",
          at: verification.verifiedAt,
          note: `پرداخت ریالی تایید شد. کد پیگیری: ${verification.refId || "-"}`
        });
        requests[index] = current;
        writeRequests(requests);
        await Promise.all([
          sendSmsSafe(ADMIN_PHONE, `ارزراه: پرداخت درخواست ${current.id} تایید شد. کد پیگیری: ${verification.refId || "-"}`, "payment_paid_admin"),
          sendSmsSafe(current.phone, `ارزراه: پرداخت درخواست ${current.id} تایید شد. کد پیگیری: ${verification.refId || "-"}`, "payment_paid_customer")
        ]);
        title = "پرداخت با موفقیت انجام شد";
        text = `کد پیگیری پرداخت: ${verification.refId || "-"}`;
        tone = "success";
      } catch (error) {
        payment.status = "failed";
        payment.failedAt = new Date().toISOString();
        payment.failureReason = error.message;
        requests[index] = current;
        writeRequests(requests);
        text = error.message || text;
      }
    } else if (payment) {
      payment.status = "canceled";
      payment.failedAt = new Date().toISOString();
      requests[index] = current;
      writeRequests(requests);
      text = "پرداخت توسط کاربر لغو شد یا از سمت درگاه تایید نشد.";
    }

    sendText(res, 200, `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/styles.css"></head><body><main class="benchmark-page"><section class="tool-panel" style="margin-top:40px;padding:28px"><p class="eyebrow">${tone === "success" ? "پرداخت موفق" : "پرداخت ناموفق"}</p><h1>${title}</h1><p>${text}</p><a class="primary-button" href="/dashboard?request=${encodeURIComponent(requestId)}">مشاهده درخواست</a></section></main></body></html>`, "text/html; charset=utf-8");
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
      await sendSms(ADMIN_PHONE, `کد ورود پنل ارزراه: ${code}\nاعتبار: ${Math.round(OTP_TTL_MS / 60000)} دقیقه`, "admin_login_otp");
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

    const paymentMatch = url.pathname.match(/^\/api\/admin\/requests\/([^/]+)\/payment$/);
    if (req.method === "POST" && paymentMatch) {
      try {
        const id = decodeURIComponent(paymentMatch[1]);
        const body = await parseBody(req);
        const requests = readRequests();
        const index = requests.findIndex((item) => item.id === id);
        if (index === -1) {
          sendJson(res, 404, { ok: false, error: "درخواست پیدا نشد." });
          return;
        }
        const current = requests[index];
        const defaultAmount = normalizeTomanAmount(current.estimate?.estimatedToman);
        const amountToman = normalizeTomanAmount(body.amountToman || defaultAmount);
        if (!amountToman) {
          sendJson(res, 422, { ok: false, error: "مبلغ پرداخت ریالی معتبر نیست." });
          return;
        }

        const payment = await createPaymentLink(req, current, amountToman);
        current.payments = Array.isArray(current.payments) ? current.payments : [];
        current.payments.unshift(payment);
        current.finalPriceToman = amountToman;
        current.status = "waiting_payment";
        current.updatedAt = payment.createdAt;
        current.timeline = Array.isArray(current.timeline) ? current.timeline : [];
        current.timeline.unshift({
          status: "waiting_payment",
          at: payment.createdAt,
          note: `قیمت نهایی ثبت شد و لینک پرداخت ساخته شد. مبلغ: ${amountToman} تومان`
        });
        requests[index] = current;
        writeRequests(requests);
        await Promise.all([
          sendSmsSafe(current.phone, `ارزراه: قیمت نهایی درخواست ${current.id}: ${formatSmsAmount(amountToman)} تومان\nلینک پرداخت:\n${payment.payUrl}`, "payment_link_customer"),
          sendSmsSafe(ADMIN_PHONE, `ارزراه: قیمت نهایی و لینک پرداخت برای ${current.id} ساخته شد. مبلغ: ${formatSmsAmount(amountToman)} تومان\n${payment.payUrl}`, "payment_link_admin")
        ]);
        sendJson(res, 200, { ok: true, request: current, payment });
      } catch (error) {
        sendJson(res, 503, { ok: false, error: error.message || "ساخت لینک پرداخت انجام نشد." });
      }
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
  console.log(`Arzrah site is running at http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`SMS provider: ${SMS_PROVIDER}`);
  console.log(`Admin OTP phone: ${maskPhone(ADMIN_PHONE)}`);
});
