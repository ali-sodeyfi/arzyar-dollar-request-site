const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "requests.json");

const PORT = Number(process.env.PORT || 4321);
const ADMIN_PIN = process.env.ADMIN_PIN || "2468";
const ADMIN_TOKEN = crypto.randomBytes(32).toString("hex");
const SAMPLE_USD_TOMAN = Number(process.env.SAMPLE_USD_TOMAN || 65000);

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
      sendJson(res, 201, { ok: true, request: publicRequest(requestItem) });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "ثبت درخواست انجام نشد." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    try {
      const body = await parseBody(req);
      if (String(body.pin || "") === ADMIN_PIN) {
        sendJson(res, 200, { ok: true, token: ADMIN_TOKEN });
      } else {
        sendJson(res, 403, { ok: false, error: "رمز پنل درست نیست." });
      }
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
        const nextStatus = cleanText(body.status, 40);
        const internalNote = cleanText(body.internalNote, 1200);
        const assignedTo = cleanText(body.assignedTo, 80);
        const now = new Date().toISOString();

        if (nextStatus) {
          if (!statuses.has(nextStatus)) {
            sendJson(res, 422, { ok: false, error: "وضعیت انتخاب‌شده معتبر نیست." });
            return;
          }
          if (nextStatus !== current.status) {
            current.status = nextStatus;
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
        current.updatedAt = now;

        requests[index] = current;
        writeRequests(requests);
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
  console.log(`Demo admin PIN: ${ADMIN_PIN}`);
});
