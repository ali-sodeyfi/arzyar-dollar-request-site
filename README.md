# Arzrah Dollar Request Site

سایت فارسی/RTL برای ثبت درخواست خرید دلاری و پرداخت ارزی، همراه با داشبورد مدیریت درخواست‌ها.

## نسخه‌ها

- نسخه GitHub Pages از فایل‌های static داخل `public/` منتشر می‌شود و برای دمو، درخواست‌ها را در مرورگر همان کاربر ذخیره می‌کند.
- نسخه واقعی Node.js از `server.js` و مسیر `DATA_DIR` استفاده می‌کند و درخواست‌ها را مرکزی ذخیره می‌کند.
- اگر `DATA_DIR` تنظیم نشود، درخواست‌ها در `data/requests.json` و لاگ پیامک‌ها در `data/sms-log.jsonl` نوشته می‌شوند.
- لینک مستقیم درخواست‌ها در پیامک ادمین از `PUBLIC_BASE_URL` ساخته می‌شود. اگر تنظیم نشود، سرور از host همان درخواست استفاده می‌کند.

## اجرا

```powershell
$env:PORT="4321"
$env:ADMIN_PHONE="00989128477764"
$env:DATA_DIR="data"
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
$env:PUBLIC_BASE_URL="https://your-domain.example"
```

در اجرای محلی، `server.js` فایل `.env` را هم می‌خواند. این فایل داخل `.gitignore` است و نباید در GitHub ذخیره شود.

اعلان‌های ثبت درخواست و تغییرات داشبورد با متد Bulk از خط اختصاصی ارسال می‌شوند. برای کد ورود ادمین، بهتر است در پنل SMS.ir یک قالب Verify بسازید و شناسه آن را هم تنظیم کنید:

```powershell
$env:SMSIR_VERIFY_TEMPLATE_ID="YOUR_VERIFY_TEMPLATE_ID"
$env:SMSIR_VERIFY_CODE_PARAMETER="Code"
$env:SMSIR_CUSTOMER_VERIFY_TEMPLATE_ID="YOUR_CUSTOMER_VERIFY_TEMPLATE_ID"
$env:SMSIR_CUSTOMER_VERIFY_CODE_PARAMETER="Code"
```

نمونه متن قالب Verify:

```text
کد تایید ارزراه: #CODE#
```

برای تایید موبایل مشتری هم قبل از ثبت درخواست، کد پیامکی ارسال می‌شود. در حالت production بهتر است `SMSIR_CUSTOMER_VERIFY_TEMPLATE_ID` را روی یک قالب خدماتی/Verify تاییدشده بگذارید تا برای شماره‌هایی که پیامک تبلیغاتی را بسته‌اند قابل دریافت باشد. اگر این env خالی باشد، سرور از `SMSIR_VERIFY_TEMPLATE_ID` استفاده می‌کند و اگر آن هم خالی باشد پیام عادی bulk می‌فرستد.

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
- قبل از ثبت درخواست: تایید شماره موبایل مشتری با کد پیامکی
- ثبت درخواست: پیامک به ادمین و مشتری
- تغییر وضعیت/مسئول/یادداشت در داشبورد: پیامک به ادمین
- تغییر وضعیت: پیامک وضعیت جدید به مشتری
- ثبت قیمت نهایی در داشبورد: پیامک قیمت نهایی و لینک پرداخت به مشتری

## درگاه پرداخت

کد اتصال زرین‌پال آماده است، اما برای پرداخت واقعی باید پذیرنده و دامنه عمومی پایدار داشته باشید:

```powershell
$env:PAYMENT_PROVIDER="zarinpal"
$env:ZARINPAL_MERCHANT_ID="YOUR_MERCHANT_ID"
$env:ZARINPAL_SANDBOX="false"
$env:PUBLIC_BASE_URL="https://your-domain.example"
```

بعد از تنظیم این envها، ادمین می‌تواند از جزئیات هر درخواست لینک پرداخت بسازد. لینک برای مشتری پیامک می‌شود و callback پرداخت وضعیت درخواست را به `paid` تغییر می‌دهد.

## اتصال Google Ads

کد Google tag به شکل dynamic از مسیر `/google-ads.js` سرو می‌شود. تا وقتی `GOOGLE_ADS_CONVERSION_ID` و conversion label تنظیم نشده باشد، هیچ درخواستی به Google ارسال نمی‌شود.

برای فعال‌سازی conversion ثبت درخواست:

```powershell
$env:GOOGLE_ADS_CONVERSION_ID="AW-123456789"
$env:GOOGLE_ADS_REQUEST_CONVERSION_LABEL="YOUR_REQUEST_CONVERSION_LABEL"
```

در پنل Google Ads یک conversion action از نوع Website بسازید و مقدارهای Conversion ID و Conversion label را بردارید. سایت بعد از ثبت موفق درخواست، بدون ارسال نام، موبایل یا ایمیل، event ثبت درخواست را با `transaction_id` همان کد رهگیری ارسال می‌کند.

برای conversion پرداخت موفق، بعد از نهایی شدن درگاه می‌توان این env را هم تنظیم کرد:

```powershell
$env:GOOGLE_ADS_PAYMENT_CONVERSION_LABEL="YOUR_PAYMENT_CONVERSION_LABEL"
```

## نرخ ارز و برآورد

برآورد اولیه در نسخه Node.js از نرخ‌های Bonbast گرفته می‌شود و به مدت ۵ دقیقه کش می‌شود:

```powershell
$env:RATE_PROVIDER="bonbast"
$env:RATES_CACHE_TTL_SECONDS="300"
$env:BONBAST_RATE_URL="https://www.bon-bast.com/"
```

اگر Bonbast لحظه‌ای در دسترس نباشد، سرور از کش قبلی یا `SAMPLE_USD_TOMAN` به عنوان fallback استفاده می‌کند. برای تست بدون اینترنت می‌توان `RATE_PROVIDER=fallback` گذاشت. قیمت نهایی همچنان در داشبورد توسط اپراتور ثبت و برای مشتری پیامک می‌شود.

## قابلیت‌ها

- فرم ثبت درخواست خرید دلاری با اعتبارسنجی
- تایید شماره موبایل مشتری قبل از ثبت درخواست
- ذخیره درخواست‌ها در `data/requests.json`
- برآورد نمونه کارمزد و مبلغ ریالی بر اساس نرخ Bonbast
- داشبورد مدیریت با ورود پیامکی، آمار، جستجو، فیلتر، جزئیات، تغییر وضعیت، ساخت لینک پرداخت، یادداشت داخلی و خروجی CSV
- بنچ‌مارک محصول در `/benchmark`
- اسکریپت بنچ‌مارک عملکرد و مسیرهای کلیدی با Playwright

## بنچ‌مارک

```powershell
& "C:\Users\pc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts/benchmark.js
```

برای استفاده واقعی، API key پنل پیامک را فقط روی سرور تنظیم کنید و آن را داخل GitHub یا فایل‌های public قرار ندهید.
