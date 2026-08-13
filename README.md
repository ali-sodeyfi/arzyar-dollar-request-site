# Arzyar Dollar Request Site

سایت فارسی/RTL برای ثبت درخواست خرید دلاری و پرداخت ارزی، همراه با داشبورد مدیریت درخواست‌ها.

## نسخه‌ها

- نسخه GitHub Pages از فایل‌های static داخل `public/` منتشر می‌شود و برای دمو، درخواست‌ها را در مرورگر همان کاربر ذخیره می‌کند.
- نسخه واقعی Node.js از `server.js` و `data/requests.json` استفاده می‌کند و درخواست‌ها را مرکزی ذخیره می‌کند.

## اجرا

```powershell
$env:PORT="4321"
$env:ADMIN_PHONE="00989128477764"
$env:SMS_PROVIDER="mock"
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

در حالت واقعی، کد ورود پنل هر بار به شماره ادمین پیامک می‌شود.

## پیامک واقعی با SMS.ir

برای اتصال به SMS.ir این envها را روی سرور تنظیم کنید:

```powershell
$env:SMS_PROVIDER="smsir"
$env:SMSIR_API_KEY="YOUR_SMSIR_API_KEY"
$env:SMSIR_LINE_NUMBER="YOUR_SMSIR_LINE_NUMBER"
$env:ADMIN_PHONE="00989128477764"
```

در اجرای محلی، `server.js` فایل `.env` را هم می‌خواند. این فایل داخل `.gitignore` است و نباید در GitHub ذخیره شود.

اعلان‌های ثبت درخواست و تغییرات داشبورد با متد Bulk از خط اختصاصی ارسال می‌شوند. برای کد ورود ادمین، بهتر است در پنل SMS.ir یک قالب Verify بسازید و شناسه آن را هم تنظیم کنید:

```powershell
$env:SMSIR_VERIFY_TEMPLATE_ID="YOUR_VERIFY_TEMPLATE_ID"
$env:SMSIR_VERIFY_CODE_PARAMETER="Code"
```

نمونه متن قالب Verify:

```text
کد ورود پنل آرزیار: #CODE#
```

## پیامک واقعی با کاوه‌نگار

اتصال کاوه‌نگار هم هنوز پشتیبانی می‌شود:

```powershell
$env:SMS_PROVIDER="kavenegar"
$env:KAVENEGAR_API_KEY="YOUR_API_KEY"
$env:KAVENEGAR_SENDER="YOUR_SENDER_LINE"
$env:ADMIN_PHONE="00989128477764"
```

برای پنل‌های دیگر می‌توانید از `SMS_PROVIDER=webhook` و `SMS_WEBHOOK_URL` استفاده کنید.

## رفتار پیامکی

- ورود داشبورد: ارسال کد یک‌بارمصرف به شماره ادمین
- ثبت درخواست: پیامک به ادمین و مشتری
- تغییر وضعیت/مسئول/یادداشت در داشبورد: پیامک به ادمین
- تغییر وضعیت: پیامک وضعیت جدید به مشتری

## قابلیت‌ها

- فرم ثبت درخواست خرید دلاری با اعتبارسنجی
- ذخیره درخواست‌ها در `data/requests.json`
- برآورد نمونه کارمزد و مبلغ ریالی
- داشبورد مدیریت با ورود پیامکی، آمار، جستجو، فیلتر، جزئیات، تغییر وضعیت، یادداشت داخلی و خروجی CSV
- بنچ‌مارک محصول در `/benchmark`
- اسکریپت بنچ‌مارک عملکرد و مسیرهای کلیدی با Playwright

## بنچ‌مارک

```powershell
& "C:\Users\pc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts/benchmark.js
```

برای استفاده واقعی، API key پنل پیامک را فقط روی سرور تنظیم کنید و آن را داخل GitHub یا فایل‌های public قرار ندهید.
