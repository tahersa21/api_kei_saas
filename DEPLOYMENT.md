# CommandCode — دليل النشر الكامل

## نظرة عامة على البنية

```
Browser ──→ Express (PORT 8080)
              ├─ /api/*        ← API routes (chat, admin, user)
              ├─ /api/proxy/claude/v1/messages  ← Claude Code proxy
              ├─ /api/proxy/codex/v1/*          ← Codex CLI proxy
              └─ /* (static)   ← React frontend (Vite build)
```

في الإنتاج: ملف واحد (`dist/index.mjs`) يخدم كل شيء — API + frontend.

---

## المتطلبات الأساسية

| المتطلب | الإصدار |
|---------|---------|
| Node.js | 24+ |
| pnpm    | 10+ |
| PostgreSQL | 14+ |

---

## متغيرات البيئة المطلوبة

| المتغير | الوصف | مثال |
|---------|-------|------|
| `PORT` | منفذ الاستماع | `8080` |
| `DATABASE_URL` | رابط قاعدة البيانات | `postgresql://user:pass@host:5432/db` |
| `ADMIN_PASSWORD` | كلمة مرور لوحة الإدارة | كلمة قوية |
| `SESSION_SECRET` | مفتاح توقيع الجلسة | `openssl rand -hex 32` |
| `CLERK_PUBLISHABLE_KEY` | مفتاح Clerk العام | `pk_live_...` |
| `CLERK_SECRET_KEY` | مفتاح Clerk السري | `sk_live_...` |
| `COMMANDCODE_API_KEY` | مفتاح CC احتياطي (اختياري) | — |

---

## الطريقة 1: VPS (Docker Compose) — الأسهل ✅

### المتطلبات
- VPS بنظام Ubuntu 22.04+
- Docker + Docker Compose مثبتان
- اسم نطاق (اختياري، لكن موصى به)

### خطوات النشر

```bash
# 1. انسخ المشروع
git clone https://github.com/tahersa21/done.git
cd done

# 2. أنشئ ملف .env من القالب
cp .env.example .env
nano .env   # عدّل جميع القيم

# 3. شغّل قاعدة البيانات وطبّق الـ schema
docker compose up db migrate -d

# 4. شغّل التطبيق
docker compose up app -d

# 5. تحقق من التشغيل
docker compose ps
docker compose logs app --tail 30
```

### تحديث التطبيق

```bash
git pull
docker compose build app
docker compose up app -d
```

### Nginx كـ Reverse Proxy (مع HTTPS)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    client_max_body_size 30m;

    location / {
        proxy_pass         http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_buffering    off;   # ضروري لـ SSE (streaming)
        proxy_read_timeout 120s;
    }
}
```

```bash
# تثبيت HTTPS مجاناً
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

---

## الطريقة 2: Google Cloud Run ☁️

### إعداد لمرة واحدة

```bash
# المتطلبات: gcloud CLI مثبت ومسجل دخوله

# 1. تفعيل الخدمات المطلوبة
gcloud services enable run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

# 2. إنشاء مستودع Docker
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker \
  --location=me-central1

# 3. رفع الأسرار إلى Secret Manager
echo -n "postgresql://user:pass@host/db" | gcloud secrets create database-url        --data-file=-
echo -n "STRONG_PASSWORD"                | gcloud secrets create admin-password       --data-file=-
echo -n "$(openssl rand -hex 32)"        | gcloud secrets create session-secret       --data-file=-
echo -n "pk_live_XXX"                    | gcloud secrets create clerk-publishable-key --data-file=-
echo -n "sk_live_XXX"                    | gcloud secrets create clerk-secret-key     --data-file=-

# 4. منح Cloud Build صلاحية قراءة الأسرار
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### النشر اليدوي

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _SERVICE_NAME=commandcode,_REGION=me-central1
```

### CI/CD تلقائي (كل push على main)

في Cloud Build → Triggers:
- **Source**: `tahersa21/done` → Branch: `^main$`
- **Config**: `cloudbuild.yaml`
- **Substitutions**: `_SERVICE_NAME=commandcode`, `_REGION=me-central1`

---

## الطريقة 3: تشغيل يدوي بدون Docker

```bash
# 1. متطلبات
node -v    # يجب 24+
pnpm -v    # يجب 10+

# 2. تثبيت التبعيات
pnpm install

# 3. متغيرات البيئة
export DATABASE_URL="postgresql://user:pass@localhost:5432/commandcode"
export ADMIN_PASSWORD="your_password"
export SESSION_SECRET="$(openssl rand -hex 32)"
export CLERK_PUBLISHABLE_KEY="pk_live_..."
export CLERK_SECRET_KEY="sk_live_..."
export PORT=8080

# 4. تطبيق schema قاعدة البيانات
pnpm --filter @workspace/db run push

# 5. بناء الـ frontend
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/chatbot run build

# 6. بناء الـ API server
pnpm --filter @workspace/api-server run build

# 7. نسخ frontend إلى مجلد public
mkdir -p artifacts/api-server/dist/public
cp -r artifacts/chatbot/dist/public/. artifacts/api-server/dist/public/

# 8. تشغيل الخادم
PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs
```

---

## ترقية قاعدة البيانات (schema migration)

```bash
# أضف متغير DATABASE_URL ثم:
pnpm --filter @workspace/db run push

# أو بالقوة (إذا تغيّر النوع):
pnpm --filter @workspace/db run push-force
```

---

## بعد النشر: ضبط الـ Clerk

في [dashboard.clerk.com](https://dashboard.clerk.com):
1. **Allowed Origins** → أضف نطاقك (`https://your-domain.com`)
2. **Redirect URLs** → أضف `https://your-domain.com/sign-in`, `https://your-domain.com/app`
3. **JWT Templates** → لا يلزم تغيير

---

## صفحات التطبيق بعد النشر

| الرابط | الوصول | الوصف |
|--------|--------|-------|
| `/` | عام | الصفحة الرئيسية |
| `/sign-in`, `/sign-up` | عام | تسجيل دخول Clerk |
| `/app` | مستخدم مسجل | لوحة المستخدم — مفاتيح API، الاستخدام |
| `/chat` | عام | واجهة المحادثة |
| `/dashboard` | `ADMIN_PASSWORD` | لوحة الإدارة |
| `/taherlt` | `ADMIN_PASSWORD` | API Console |

---

## Claude Code (الاتصال بالخادم)

```bash
# بعد الحصول على مفتاح sk-cc-* من /app → API Keys:
export ANTHROPIC_BASE_URL="https://your-domain.com/api/proxy/claude"
export ANTHROPIC_AUTH_TOKEN="sk-cc-YOUR_KEY"
claude
```

> **تنبيه:** قاعدة Routing Rule يجب أن تحتوي على API Key وBase URL للنموذج المطلوب.  
> في Admin → Smart Routing → تعديل القاعدة → أضف API Key وBase URL.

## Codex CLI (الاتصال بالخادم)

```bash
export OPENAI_API_KEY="sk-cc-YOUR_KEY"
export OPENAI_BASE_URL="https://your-domain.com/api/proxy/codex"
codex
```

---

## فحص صحة الخادم

```bash
curl https://your-domain.com/api/healthz
# {"status":"ok"}
```

---

## مشاكل شائعة

| المشكلة | السبب | الحل |
|---------|-------|------|
| `No API key/URL in routing rule` | قاعدة التوجيه بدون مزود | Admin → Smart Routing → تعديل → أضف API Key + Base URL |
| `No routing rule for model` | النموذج غير موجود في قواعد التوجيه | Admin → Smart Routing → أنشئ قاعدة جديدة |
| `Invalid or inactive API key` | مفتاح sk-cc-* غير صالح | تحقق من /app → API Keys |
| `All providers rate-limited` | تجاوز حد RPM | انتظر دقيقة أو ارفع حد RPM في القاعدة |
| Streaming لا يعمل | Nginx لا يعيد توجيه SSE | أضف `proxy_buffering off` في Nginx config |
