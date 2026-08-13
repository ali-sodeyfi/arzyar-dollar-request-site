# Arzyar Dollar Request Site

یک سایت فارسی/RTL برای ثبت درخواست خرید دلاری و پرداخت ارزی، همراه با داشبورد مدیریت درخواست‌ها.

## نسخه‌ها

- نسخه GitHub Pages از فایل‌های static داخل `public/` منتشر می‌شود و برای دمو، درخواست‌ها را در مرورگر همان کاربر ذخیره می‌کند.
- نسخه واقعی Node.js از `server.js` و `data/requests.json` استفاده می‌کند و درخواست‌ها را مرکزی ذخیره می‌کند.

## اجرا

```powershell
$env:PORT="4321"
$env:ADMIN_PIN="2468"
& "C:\Users\pc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
```

سایت عمومی:

```text
http://localhost:4321
```

داشبورد:

```text
http://localhost:4321/dashboard
```

رمز نمونه پنل: `2468`

## قابلیت‌ها

- فرم ثبت درخواست خرید دلاری با اعتبارسنجی
- ذخیره درخواست‌ها در `data/requests.json`
- برآورد نمونه کارمزد و مبلغ ریالی
- داشبورد مدیریت با ورود PIN، آمار، جستجو، فیلتر، جزئیات، تغییر وضعیت، یادداشت داخلی و خروجی CSV
- بنچ‌مارک محصول در `/benchmark`
- اسکریپت بنچ‌مارک عملکرد و مسیرهای کلیدی با Playwright

## بنچ‌مارک

```powershell
& "C:\Users\pc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts/benchmark.js
```

برای استفاده واقعی، `ADMIN_PIN` را تغییر دهید و به‌جای فایل JSON از دیتابیس و احراز هویت استاندارد استفاده کنید.
