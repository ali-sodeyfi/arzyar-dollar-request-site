# Arzyar Dollar Request Site

یک سایت فارسی/RTL برای ثبت درخواست خرید دلاری و پرداخت ارزی، همراه با داشبورد مدیریت درخواست‌ها.

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

## پیامک

شماره ادمین پیش‌فرض روی `00989128477764` تنظیم شده است. برای ارسال واقعی با کاوه‌نگار:

```powershell
$env:SMS_PROVIDER="kavenegar"
$env:KAVENEGAR_API_KEY="YOUR_API_KEY"
$env:KAVENEGAR_SENDER="YOUR_SENDER_LINE"
$env:ADMIN_PHONE="00989128477764"
```

رفتار پیامکی:

- ورود داشبورد: ارسال کد یک‌بارمصرف به شماره ادمین
- ثبت درخواست: پیامک به ادمین و مشتری
- تغییر وضعیت/مسئول/یادداشت در داشبورد: پیامک به ادمین
- تغییر وضعیت: پیامک وضعیت جدید به مشتری

برای پنل‌های دیگر می‌توانید از `SMS_PROVIDER=webhook` و `SMS_WEBHOOK_URL` استفاده کنید.

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

برای استفاده واقعی، API key پنل پیامک را فقط روی سرور تنظیم کنید و به‌جای فایل JSON از دیتابیس و احراز هویت استاندارد استفاده کنید.
