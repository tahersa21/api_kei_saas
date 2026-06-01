# Custom Providers — دليل الإعداد الشامل

> آخر تحديث: يونيو 2026

---

## جدول المحتويات

1. [نظرة عامة](#1-نظرة-عامة)
2. [إضافة مزوّد مخصص](#2-إضافة-مزوّد-مخصص)
3. [إدارة مفاتيح API لكل مزوّد](#3-إدارة-مفاتيح-api-لكل-مزوّد)
   - [حقل التسمية](#حقل-التسمية)
   - [حقل المفتاح](#حقل-المفتاح)
   - [نوع الاتصال (apiType)](#نوع-الاتصال-apitype)
   - [رابط مخصص (baseUrl)](#رابط-مخصص-baseurl)
4. [جلب النماذج (Model Discovery)](#4-جلب-النماذج-model-discovery)
5. [نظام التوجيه الذكي (Smart Routing)](#5-نظام-التوجيه-الذكي-smart-routing)
6. [Backend Endpoint: custom-stream](#6-backend-endpoint-custom-stream)
7. [مثال كامل: إعداد right.codes](#7-مثال-كامل-إعداد-rightcodes)
8. [مخزن المفاتيح والخصوصية](#8-مخزن-المفاتيح-والخصوصية)
9. [فحص المشروع وحالته](#9-فحص-المشروع-وحالته)

---

## 1. نظرة عامة

نظام **Custom Providers** يتيح إضافة أي مزوّد AI متوافق مع OpenAI / Anthropic / Codex API إلى المنصة، مع دعم:

- مفاتيح متعددة لكل مزوّد (pool)
- قناة فرعية مختلفة لكل مفتاح (base URL مخصص)
- اكتشاف تلقائي لنوع الـ API (auto-detection)
- اكتشاف تلقائي لنقطة نهاية النماذج (model discovery)
- توجيه ذكي مع round-robin وحدود RPM

```
المستخدم → Smart Routing Rule → Custom Provider Pool → مفتاح → baseUrl المخصص → API
```

---

## 2. إضافة مزوّد مخصص

**المتطلبات:** تسجيل دخول المسؤول (`Unlock` في الهيدر)

**الخطوات:**
1. انتقل إلى **Providers** في الشريط الجانبي
2. في قسم CUSTOM اضغط **+ إضافة مزوّد**
3. أدخل:
   | الحقل | الوصف | مثال |
   |---|---|---|
   | **الاسم** | اسم عرض المزوّد | `Right Code` |
   | **Slug** | معرف فريد (أحرف صغيرة + شرطات) | `right` |
   | **Base URL** | الرابط الافتراضي للمزوّد | `https://right.codes` |
   | **النوع** | text / video / audio | `text` |

> **ملاحظة:** الـ Base URL على مستوى المزوّد يُستخدم كـ fallback فقط — يمكن تجاوزه لكل مفتاح.

---

## 3. إدارة مفاتيح API لكل مزوّد

بعد إضافة المزوّد، اضغط عليه في الشريط الجانبي (مثل **right Keys**) للوصول إلى لوحة المفاتيح.

### حقل التسمية

اسم وصفي اختياري للمفتاح. يظهر في واجهة جلب النماذج. مثال: `claude-aws`، `codex pro`.

### حقل المفتاح

مفتاح الـ API السري. يُخزَّن في `localStorage` فقط — لا يُرسَل للسيرفر إلا عند الطلب.

### نوع الاتصال (apiType)

يحدد كيفية تواصل الـ backend مع الـ API:

| الخيار | المسار | الاستخدام |
|---|---|---|
| **Auto** | يجرّب تلقائياً | غير معروف النوع |
| **OpenAI** | `POST /v1/chat/completions` | معظم المزودات المتوافقة مع OpenAI |
| **Codex** | `POST /v1/responses` | right.codes/codex، foxcode، Codex CLI |
| **Anthropic** | `POST /v1/messages` | Claude API، right.codes/claude |

**وضع Auto:** يجرّب OpenAI → Codex → Anthropic بالترتيب حتى ينجح واحد. مفيد للمزودات غير المعروفة.

### رابط مخصص (baseUrl)

**المشكلة التي يحلها:** بعض المزودات كـ right.codes تقدم **قنوات فرعية** داخل نفس المزوّد:
- `https://right.codes/claude` — قناة Claude الرسمية
- `https://right.codes/claude-aws` — قناة Claude AWS
- `https://right.codes/codex` — قناة Codex
- `https://right.codes/deepseek` — قناة DeepSeek

بإضافة **رابط مخصص** لكل مفتاح، يستخدم ذلك الرابط بدلاً من رابط المزوّد العام.

**قواعد الرابط المخصص:**
- إذا تُرك فارغاً → يستخدم `baseUrl` المزوّد الافتراضي
- يُخزَّن داخل `PoolKey` في localStorage
- يظهر أسفل المفتاح: `↳ right.codes/codex`
- يُعطى أولوية في `fetchModels` و`browseModels`

**أمثلة:**

```
المزوّد: right (baseUrl: https://right.codes)
  ├─ مفتاح: claude-aws → baseUrl: https://right.codes/claude-aws  [Anthropic]
  ├─ مفتاح: codex-pro  → baseUrl: https://right.codes/codex       [Codex]
  └─ مفتاح: deepseek   → baseUrl: https://right.codes/deepseek    [OpenAI]
```

---

## 4. جلب النماذج (Model Discovery)

زر **جلب النماذج** في لوحة مفاتيح كل مزوّد يستدعي `POST /api/admin/provider-models`.

### خوارزمية الاكتشاف

**المرحلة 1 — مسارات مباشرة** على `baseUrl` المفتاح:

| المسار | الوصف |
|---|---|
| `/v1/models` | OpenAI القياسي |
| `/models/public` | right.codes وبعض الـ public APIs |
| `/models` | مزودات خفيفة |
| `/api/v1/models` | self-hosted |
| `/api/models` | أسلوب بديل |
| `/v1/models/list` | نادر |

**المرحلة 2 — Fallback للدومين الأب:**

إذا فشلت المرحلة 1، يصعد تدريجياً في مستويات الـ URL:

```
https://right.codes/codex/v1  → فشل
https://right.codes/codex     → فشل
https://right.codes           → يجرب /models/public → ✅ نجح
```

هذا يحل مشكلة right.codes حيث النماذج على الجذر، لا على كل قناة.

### عرض النتائج

- النماذج تُجمَّع حسب اسم المفتاح (label)
- إذا فشل مفتاح → تظهر رسالة خطأ واضحة
- النماذج الناجحة تظهر مع badge عدد + زر نسخ ID

---

## 5. نظام التوجيه الذكي (Smart Routing)

قسم **Routing** في الشريط الجانبي يتيح إنشاء قواعد توجيه.

### بنية القاعدة

```json
{
  "name": "اسم القاعدة",
  "providers": [
    { "providerType": "cc",     "priority": 1 },
    { "providerType": "rc",     "priority": 2 },
    { "providerType": "custom", "providerId": "right", "priority": 3 }
  ],
  "isActive": true
}
```

### الأولوية والـ Fallback

المزودات مرتبة حسب `priority` (الأقل = أعلى أولوية):
- عند استجابة المزوّد → يُستخدم
- عند فشله → ينتقل للتالي تلقائياً
- آخر المزودات → لا fallback، يُعاد خطأ للمستخدم

### حدود RPM (Requests Per Minute)

لكل مدخل في القاعدة يمكن ضبط `rpmLimit`:
- `0` = لا حد
- `60` = 60 طلب في الدقيقة كحد أقصى
- النافذة الزمنية: sliding window بمدة 60 ثانية
- الحد مشترك بالنوع (لا بالمفتاح)

---

## 6. Backend Endpoint: custom-stream

`POST /api/chat/custom-stream`

يُستخدم لإرسال رسائل إلى مزوّد مخصص مع streaming SSE.

### الطلب

```json
{
  "baseUrl": "https://right.codes/codex",
  "apiKey": "sk-...",
  "apiType": "auto",
  "model": "gpt-5.4",
  "messages": [
    { "role": "user", "content": "مرحبا" }
  ],
  "system": "أنت مساعد مفيد"
}
```

| الحقل | النوع | الوصف |
|---|---|---|
| `baseUrl` | string (مطلوب) | رابط الـ API بدون slash نهائي |
| `apiKey` | string (اختياري) | مفتاح الـ API |
| `apiType` | `auto\|openai\|codex\|anthropic` | نوع الـ API |
| `model` | string (مطلوب) | معرف النموذج |
| `messages` | array (مطلوب) | `[{role, content}]` |
| `system` | string (اختياري) | رسالة النظام |

### الاستجابة

SSE stream بنفس format الـ CC/RC:
```
data: {"type":"text-delta","id":"0","text":"مرحباً..."}
data: {"type":"text-delta","id":"0","text":" كيف"}
data: [DONE]
```

### منطق Auto-Fallback

```
apiType = "auto"
  → جرّب OpenAI (/v1/chat/completions)
    → فشل (4xx/5xx) → جرّب Codex (/v1/responses)
      → فشل → جرّب Anthropic (/v1/messages)
        → فشل → 502 مع تفاصيل الخطأ
```

### دعم Streaming لكل نوع

| النوع | تنسيق SSE المُقرَأ |
|---|---|
| OpenAI | `choices[0].delta.content` |
| Codex | `event: response.output_text.delta` + `delta` field |
| Anthropic | `event: content_block_delta` + `delta.text` |

---

## 7. مثال كامل: إعداد right.codes

right.codes هي منصة تقدم عدة قنوات API تحت نفس الدومين.

### الخطوة 1: إضافة المزوّد

```
الاسم:    Right Code Custom
Slug:     right
Base URL: https://right.codes
النوع:    text
```

### الخطوة 2: إضافة مفاتيح لكل قناة

| التسمية | API Key | نوع الاتصال | رابط مخصص |
|---|---|---|---|
| `claude-aws` | `sk-...` | Anthropic | `https://right.codes/claude-aws` |
| `claude` | `sk-...` | Anthropic | `https://right.codes/claude` |
| `codex-pro` | `sk-...` | OpenAI | `https://right.codes/codex-pro` |
| `codex` | `sk-...` | Codex | `https://right.codes/codex` |
| `deepseek` | `sk-...` | OpenAI | `https://right.codes/deepseek` |
| `gemini` | `sk-...` | Auto | `https://right.codes/gemini` |

### الخطوة 3: جلب النماذج

اضغط **جلب النماذج** — الخوارزمية ستجد النماذج تلقائياً من `https://right.codes/models/public` حتى لو كان الرابط المخصص قناة فرعية.

### الخطوة 4: إضافة لقاعدة توجيه (اختياري)

في **Routing** → أضف مدخل `right` بأولوية 2 بعد CC مثلاً.

---

## 8. مخزن المفاتيح والخصوصية

| البيانات | مكان التخزين | يُرسَل للسيرفر؟ |
|---|---|---|
| مفاتيح المزودات المخصصة (`PoolKey[]`) | `localStorage` المتصفح | عند الطلب فقط |
| baseUrl المخصص للمفتاح | `localStorage` (داخل PoolKey) | عند الطلب فقط |
| apiType للمفتاح | `localStorage` (داخل PoolKey) | عند الطلب فقط |
| مفاتيح CC | قاعدة البيانات (`cc_keys`) | لا (يُستخدم server-side) |
| مفاتيح RC pool | قاعدة البيانات (`rc_keys`) | لا (يُستخدم server-side) |
| مفاتيح RC الشخصية | `localStorage` | عبر header |

**مفتاح localStorage لكل مزوّد:** `provider_keys_{slug}`

```json
[
  {
    "id": "uuid",
    "label": "claude-aws",
    "key": "sk-...",
    "isActive": true,
    "apiType": "anthropic",
    "baseUrl": "https://right.codes/claude-aws"
  }
]
```

---

## 9. فحص المشروع وحالته

### Typecheck (يونيو 2026)

```
✅ lib/* — تجميع ناجح
✅ artifacts/api-server — بدون أخطاء
✅ artifacts/chatbot — بدون أخطاء
✅ artifacts/mockup-sandbox — بدون أخطاء
✅ scripts — بدون أخطاء
```

### API Endpoints

| Endpoint | الطريقة | الحالة |
|---|---|---|
| `/api/healthz` | GET | ✅ `{"status":"ok"}` |
| `/api/chat/models` | GET | ✅ نماذج CC مع كاش 10 دقيقة |
| `/api/chat/rc-models` | GET | ✅ نماذج RC العامة |
| `/api/chat/ag-models` | GET | ✅ نماذج AiGoCode |
| `/api/chat/rc-pool-status` | GET | ✅ `{"active":N}` |
| `/api/chat/stream` | POST | ✅ CC + RC streaming |
| `/api/chat/custom-stream` | POST | ✅ Custom provider streaming |
| `/api/admin/login` | POST | ✅ JWT auth |
| `/api/admin/provider-models` | POST | ✅ Auto-discovery + parent fallback |
| `/api/admin/providers` | GET/POST | ✅ CRUD |
| `/api/admin/cc-keys` | GET/POST/DELETE | ✅ CRUD |
| `/api/admin/rc-keys` | GET/POST/DELETE | ✅ CRUD |
| `/api/admin/user-keys` | GET/POST/DELETE | ✅ CRUD |
| `/api/admin/routing-rules` | GET/POST/PATCH/DELETE | ✅ CRUD |
| `/api/admin/logs` | GET | ✅ طلبات مُسجَّلة |
| `/api/admin/overview` | GET | ✅ إحصائيات |

### قاعدة البيانات

| الجدول | الغرض |
|---|---|
| `providers` | المزودات المخصصة (3 مزودات) |
| `cc_keys` | مفاتيح CommandCode (pool) |
| `rc_keys` | مفاتيح Right Code (pool) |
| `user_keys` | المفاتيح المُصدَرة للمستخدمين |
| `routing_rules` | قواعد التوجيه الذكي |
| `request_logs` | سجل الطلبات |

### Workflows

| الـ Workflow | المنفذ | الحالة |
|---|---|---|
| API Server | `pnpm --filter @workspace/api-server run dev` | ✅ يعمل (port 8080) |
| Chatbot | `pnpm --filter @workspace/chatbot run dev` | ✅ يعمل (port 22967) |
| Mockup Sandbox | `pnpm --filter @workspace/mockup-sandbox run dev` | ✅ يعمل |

---

## الملفات الرئيسية المُعدَّلة

| الملف | التغييرات |
|---|---|
| `artifacts/chatbot/src/pages/console.tsx` | PoolKey type (apiType + baseUrl)، نموذج الإضافة، عرض badges، browseModels/fetchModels fixes |
| `artifacts/api-server/src/routes/chat.ts` | POST /chat/custom-stream مع auto-fallback |
| `artifacts/api-server/src/routes/admin.ts` | getParentBases()، MODEL_PARENT_CANDIDATES، parent fallback في provider-models |
