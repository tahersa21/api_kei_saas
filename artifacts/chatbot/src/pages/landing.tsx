import { useLocation } from "wouter";
import { Terminal, Zap, Key, BarChart3, Shield, ArrowRight, CheckCircle2, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme";
import { Sun, Moon } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Landing() {
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans overflow-x-hidden">

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Terminal className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base tracking-tight">CommandCode</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/sign-in")} className="text-sm">
              تسجيل الدخول
            </Button>
            <Button size="sm" onClick={() => setLocation("/sign-up")} className="text-sm bg-primary hover:bg-primary/90 text-white">
              ابدأ مجاناً
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 rounded-full blur-[120px]" />
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-medium mb-6">
          <Zap className="w-3 h-3" />
          <span>واجهة API موحّدة لأكثر من 70 نموذج ذكاء اصطناعي</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-tight mb-6">
          وصّل تطبيقك بأفضل
          <br />
          <span className="text-primary">نماذج الذكاء الاصطناعي</span>
          <br />
          بمفتاح واحد
        </h1>

        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          منصة API Gateway احترافية تتيح لك الوصول إلى CommandCode وRight Code
          عبر endpoint موحّد. أدِر المفاتيح، تتبّع الاستخدام، ووفّر الوقت.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button size="lg" onClick={() => setLocation("/sign-up")}
            className="bg-primary hover:bg-primary/90 text-white px-8 gap-2 text-base h-12">
            أنشئ حسابك مجاناً
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => setLocation("/sign-in")}
            className="px-8 text-base h-12 border-border/60">
            تسجيل الدخول
          </Button>
        </div>

        {/* Code preview */}
        <div className="mt-16 max-w-2xl mx-auto rounded-xl border border-border/50 bg-card overflow-hidden text-left shadow-2xl shadow-black/30">
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/40 bg-muted/30">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
            <span className="ml-2 text-xs text-muted-foreground font-mono">example.js</span>
          </div>
          <pre className="px-5 py-4 text-sm font-mono text-foreground/80 overflow-x-auto leading-relaxed"><code>{`const response = await fetch("/api/chat/stream", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Api-Key": "sk-cc-••••••••••••••••",
  },
  body: JSON.stringify({
    model: "rc:/codex-pro|gpt-5.4",
    messages: [{ role: "user", content: "مرحبا" }],
  }),
});`}</code></pre>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">كل ما تحتاجه في مكان واحد</h2>
          <p className="text-muted-foreground text-base max-w-xl mx-auto">
            من إدارة المفاتيح إلى تتبع الطلبات — المنصة تتولى كل شيء
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: <Zap className="w-5 h-5 text-primary" />,
              title: "70+ نموذج ذكاء اصطناعي",
              desc: "وصول فوري إلى CommandCode وRight Code في endpoint واحد بدون تعقيد.",
            },
            {
              icon: <Key className="w-5 h-5 text-primary" />,
              title: "إدارة المفاتيح",
              desc: "أنشئ مفاتيح sk-cc-* لمستخدميك وراقب استخدامها لحظة بلحظة.",
            },
            {
              icon: <Code2 className="w-5 h-5 text-primary" />,
              title: "Streaming SSE",
              desc: "استجابات فورية عبر Server-Sent Events بدون أي تأخير.",
            },
            {
              icon: <BarChart3 className="w-5 h-5 text-primary" />,
              title: "سجلات تفصيلية",
              desc: "تتبّع كل طلب: النموذج، المدة، المفتاح المستخدم، والحالة.",
            },
            {
              icon: <Shield className="w-5 h-5 text-primary" />,
              title: "مفاتيح آمنة",
              desc: "المفاتيح تُخزّن على السيرفر فقط ولا تُكشف للمتصفح أبداً.",
            },
            {
              icon: <Terminal className="w-5 h-5 text-primary" />,
              title: "تحكم كامل",
              desc: "تفعيل وتعطيل المفاتيح، إدارة المزودين، واختبار النماذج مباشرة.",
            },
          ].map((f, i) => (
            <div key={i} className="rounded-xl border border-border/50 bg-card/50 p-5 hover:border-primary/30 hover:bg-card transition-all duration-200">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="font-semibold mb-2 text-base">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Providers ──────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-border/40">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold mb-2">المزودون المدعومون</h2>
          <p className="text-muted-foreground text-sm">اتصال مباشر بأبرز مزودي الذكاء الاصطناعي</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {[
            {
              name: "CommandCode",
              tag: "CC",
              desc: "12+ نموذج مفتوح المصدر — DeepSeek، Qwen، Kimi، GLM",
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              name: "Right Code",
              tag: "RC",
              desc: "58+ نموذج في 7 قنوات — GPT-5، Claude، Gemini، DeepSeek",
              color: "text-violet-400",
              bg: "bg-violet-500/10",
            },
          ].map((p) => (
            <div key={p.name} className="rounded-xl border border-border/50 bg-card/50 p-5 flex items-start gap-4">
              <div className={`w-10 h-10 rounded-lg ${p.bg} flex items-center justify-center flex-none`}>
                <span className={`text-xs font-bold ${p.color}`}>{p.tag}</span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">{p.name}</span>
                  <span className="flex items-center gap-1 text-emerald-500 text-[10px]">
                    <CheckCircle2 className="w-3 h-3" /> مفعّل
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-10 text-center relative overflow-hidden">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-violet-500/5" />
          </div>
          <h2 className="text-3xl font-bold mb-3">جاهز للبدء؟</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            أنشئ حسابك الآن واحصل على مفتاحك الأول خلال دقيقتين
          </p>
          <Button size="lg" onClick={() => setLocation("/sign-up")}
            className="bg-primary hover:bg-primary/90 text-white px-10 gap-2 text-base h-12">
            ابدأ مجاناً
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-muted-foreground/50">
          <div className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" />
            <span>CommandCode API Gateway</span>
          </div>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
