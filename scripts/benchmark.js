const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function resolvePlaywright() {
  const candidates = [
    "playwright",
    path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright")
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next known runtime location.
    }
  }
  throw new Error("Playwright is not available. Set NODE_PATH to a node_modules folder that contains playwright.");
}

function waitForHealth(port, timeoutMs = 10000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    function tick() {
      http.get(`http://localhost:${port}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else setTimeout(tick, 200);
      }).on("error", () => {
        if (Date.now() - started > timeoutMs) reject(new Error("Server did not start in time."));
        else setTimeout(tick, 200);
      });
    }
    tick();
  });
}

async function launchBrowser(chromium) {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const candidates = [
      process.env.CHROME_PATH,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    ].filter(Boolean);
    const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!executablePath) throw error;
    return chromium.launch({ headless: true, executablePath });
  }
}

async function main() {
  const port = Number(process.env.PORT || 4321);
  const artifactDir = path.join(__dirname, "..", "benchmark-artifacts");
  const dataFile = path.join(__dirname, "..", "data", "requests.json");
  const originalData = fs.existsSync(dataFile) ? fs.readFileSync(dataFile, "utf8") : "[]\n";
  fs.mkdirSync(artifactDir, { recursive: true });
  const server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port), SMS_PROVIDER: "mock", RATE_PROVIDER: "fallback", ADMIN_PHONE: "00989128477764" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const logs = [];
  server.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  server.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  try {
    await waitForHealth(port);
    const { chromium } = resolvePlaywright();
    const browser = await launchBrowser(chromium);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const base = `http://localhost:${port}`;

    const started = Date.now();
    await page.goto(base, { waitUntil: "networkidle" });
    const homeLoadMs = Date.now() - started;
    const desktopScreenshot = path.join(artifactDir, "home-desktop.png");
    await page.screenshot({ path: desktopScreenshot, fullPage: true });
    await page.fill("input[name='fullName']", "کاربر تست بنچ‌مارک");
    await page.fill("input[name='phone']", "09121112222");
    await page.fill("input[name='email']", "bench@example.com");
    await page.click("#sendPhoneCodeButton");
    await page.waitForSelector("#phoneVerifyMessage[data-tone='success']", { timeout: 5000 });
    await page.click("#verifyPhoneCodeButton");
    await page.waitForSelector("#phoneVerifyMessage[data-tone='success']", { timeout: 5000 });
    await page.fill("input[name='targetUrl']", "https://example.com/checkout");
    await page.fill("input[name='amount']", "49");
    await page.fill("input[name='deadline']", "امروز");
    await page.check("input[name='userConsent']");
    await page.click("button[type='submit']");
    await page.waitForSelector("#formMessage[data-tone='success']", { timeout: 5000 });
    const submitMessage = await page.textContent("#formMessage");

    const dashStarted = Date.now();
    await page.goto(`${base}/dashboard`, { waitUntil: "networkidle" });
    await page.click("#requestLoginCodeButton");
    await page.waitForSelector("#loginMessage[data-tone='success']", { timeout: 5000 });
    const otpCode = await page.inputValue("input[name='code']");
    if (!otpCode) throw new Error("OTP code was not available in mock mode.");
    await page.click("#loginForm button[type='submit']");
    await page.waitForSelector("#dashboardApp:not(.is-hidden)", { timeout: 5000 });
    const dashboardReadyMs = Date.now() - dashStarted;
    await page.selectOption("#adminStatus", "reviewing");
    await page.fill("#assignedTo", "QA");
    await page.fill("#internalNote", "تست تغییر وضعیت در بنچ‌مارک");
    await page.click("#adminForm button[type='submit']");
    await page.waitForSelector("#adminMessage[data-tone='success']", { timeout: 5000 });
    const dashboardUpdateWorked = (await page.textContent("#detailStatus")) === "در حال بررسی";
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(120);
    const dashboardScreenshot = path.join(artifactDir, "dashboard-desktop.png");
    await page.screenshot({ path: dashboardScreenshot, fullPage: true });
    const rows = await page.locator("#requestsTbody tr").count();
    const totalText = await page.textContent("#statTotal");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base, { waitUntil: "networkidle" });
    const mobileScreenshot = path.join(artifactDir, "home-mobile.png");
    await page.screenshot({ path: mobileScreenshot, fullPage: true });
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    const heroVisible = await page.locator(".hero-image").evaluate((img) => {
      const rect = img.getBoundingClientRect();
      const style = window.getComputedStyle(img);
      return rect.width > 300 && rect.height > 300 && style.display !== "none" && style.visibility !== "hidden";
    });

    await browser.close();
    const result = {
      url: base,
      checks: {
        homeLoadMs,
        dashboardReadyMs,
        requestSubmit: /DR-\d{8}-/i.test(submitMessage || ""),
        dashboardUpdateWorked,
        dashboardRows: rows,
        dashboardTotalText: totalText,
        mobileHorizontalOverflow: mobileOverflow,
        heroImageVisible: heroVisible
      },
      artifacts: {
        desktopScreenshot,
        dashboardScreenshot,
        mobileScreenshot,
        jsonReport: path.join(artifactDir, "benchmark-result.json")
      },
      passed: homeLoadMs < 2500 && dashboardReadyMs < 2500 && dashboardUpdateWorked && rows > 0 && !mobileOverflow && heroVisible
    };
    fs.writeFileSync(result.artifacts.jsonReport, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    server.kill();
    fs.writeFileSync(dataFile, originalData, "utf8");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
