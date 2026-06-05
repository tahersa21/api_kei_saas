import { useState, useEffect, useRef } from "react";
import { useGetChatModels, useGetChatRcModels, useGetChatAgModels } from "@workspace/api-client-react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useRightCodeKey } from "@/hooks/use-rightcode-key";
import { useRcPoolStatus } from "@/hooks/use-rc-pool-status";
import { useAiGoCodeKey } from "@/hooks/use-aigocode-key";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Terminal, Key, Send, SquareSquare, Clock, AlertTriangle,
  Trash2, CheckCircle2, Copy,
} from "lucide-react";

function formatMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const DOC_TABS = ["Python", "JavaScript", "Claude Code", "Codex CLI", "cURL"] as const;
type DocTab = typeof DOC_TABS[number];

function IntegrationDocs() {
  const [tab, setTab] = useState<DocTab>("Python");
  const [copied, setCopied] = useState(false);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";

  const snippets: Record<DocTab, string> = {
    Python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-cc-YOUR_KEY",
    base_url="${baseUrl}/api/v1",
)

stream = client.chat.completions.create(
    model="zai-org/GLM-5",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)`,

    JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-cc-YOUR_KEY",
  baseURL: "${baseUrl}/api/v1",
});

const stream = await client.chat.completions.create({
  model: "zai-org/GLM-5",
  messages: [{ role: "user", content: "Hello!" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,

    "Claude Code": `# Claude Code via RC /claude-aws channel
export ANTHROPIC_BASE_URL="${baseUrl}/api"
export ANTHROPIC_API_KEY="sk-cc-YOUR_KEY"

claude --dangerously-skip-permissions`,

    "Codex CLI": `# Codex CLI via RC /codex channel
export OPENAI_BASE_URL="${baseUrl}/api"
export OPENAI_API_KEY="sk-cc-YOUR_KEY"

codex`,

    cURL: `curl ${baseUrl}/api/v1/chat/completions \\
  -H "Authorization: Bearer sk-cc-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "zai-org/GLM-5",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'`,
  };

  const copy = () => {
    navigator.clipboard.writeText(snippets[tab]).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border/40 bg-card/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-card/30">
        <div>
          <p className="text-[10px] text-primary/70 uppercase tracking-wider font-medium">Integration</p>
          <p className="text-[10px] text-muted-foreground/60 font-sans mt-0.5">
            Base URL: <code className="font-mono text-primary/70">{baseUrl}/api/v1</code>
          </p>
        </div>
        <button onClick={copy}
          className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded border border-border/40 bg-background/50 hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors">
          {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="flex border-b border-border/30 bg-background/20">
        {DOC_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-[11px] font-mono transition-colors ${
              tab === t ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground/60 hover:text-muted-foreground"
            }`}>
            {t}
          </button>
        ))}
      </div>
      <pre className="p-4 text-[11px] font-mono text-muted-foreground/80 overflow-x-auto whitespace-pre leading-relaxed bg-background/10 max-h-52 overflow-y-auto">
        {snippets[tab]}
      </pre>
      <div className="px-4 py-2 border-t border-border/20 bg-card/10">
        <p className="text-[10px] text-muted-foreground/50 font-sans">
          Replace <code className="font-mono text-primary/60">sk-cc-YOUR_KEY</code> with your actual user key.
        </p>
      </div>
    </div>
  );
}

function TestChat() {
  const { data: ccData } = useGetChatModels();
  const [provider, setProvider] = useState<"cc" | "rc" | "ag">("cc");
  const isRc = provider === "rc";
  const isAg = provider === "ag";
  const { data: rcData } = useGetChatRcModels({
    query: { queryKey: ["/api/chat/rc-models"], enabled: isRc, staleTime: 600_000, retry: false },
  });
  const { hasPoolKeys } = useRcPoolStatus();
  const { key: rcKey } = useRightCodeKey();
  const { key: agKey } = useAiGoCodeKey();
  const { data: agData } = useGetChatAgModels({
    query: { queryKey: ["/api/chat/ag-models", agKey], enabled: isAg && !!agKey, staleTime: 600_000, retry: false },
  });

  const ccModels = ccData?.models ?? [];
  const rcModels = rcData?.models ?? [];
  const agModels = agData?.models ?? [];
  const models = isRc ? rcModels : isAg ? agModels : ccModels;

  const [selectedModel, setSelectedModel] = useState("");
  const [input, setInput] = useState("");
  const { messages, isStreaming, elapsedMs, error: chatError, sendMessage, stopStreaming, clearMessages } = useChatStream();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (models.length > 0 && (!selectedModel || !models.find(m => m.id === selectedModel))) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isStreaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const extraHeaders: Record<string, string> = {};
    if (isRc && rcKey) extraHeaders["X-Rightcode-Key"] = rcKey;
    if (isAg && agKey) extraHeaders["X-Aigocode-Key"] = agKey;
    await sendMessage(text, selectedModel, "", extraHeaders, []);
  };

  const grouped = models.reduce<Record<string, typeof models>>((acc, m) => {
    const g = m.group ?? "Models";
    if (!acc[g]) acc[g] = [];
    acc[g].push(m);
    return acc;
  }, {});

  const isRTL = (t: string) => /[\u0600-\u06FF]/.test(t);

  return (
    <div className="flex flex-col h-full border border-border/40 rounded-xl bg-card/10 overflow-hidden">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-border/40 bg-card/30 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-sans">Test Chat</span>
          <button onClick={clearMessages} title="Clear" className="text-muted-foreground/30 hover:text-muted-foreground">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center rounded-lg border border-border/50 bg-background/40 p-0.5 gap-0.5">
          {(["cc", "rc", "ag"] as const).map(p => (
            <button key={p} onClick={() => setProvider(p)} disabled={isStreaming}
              className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all
                ${provider === p
                  ? p === "cc" ? "bg-primary text-primary-foreground shadow-sm"
                    : p === "rc" ? "bg-violet-600 text-white shadow-sm"
                    : "bg-cyan-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"}`}>
              {p.toUpperCase()}
            </button>
          ))}
        </div>
        <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isStreaming}>
          <SelectTrigger className="h-7 text-[10px] font-mono bg-background/50 border-border/40">
            <SelectValue placeholder="Select model…" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {Object.entries(grouped).map(([grp, ms]) => (
              <SelectGroup key={grp}>
                <SelectLabel className="text-[9px] uppercase tracking-wider">{grp}</SelectLabel>
                {ms.map(m => (
                  <SelectItem key={m.id} value={m.id} className="text-[10px] font-mono">
                    {m.name ?? m.id}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 text-[9px] font-sans">
          {isAg ? (
            agKey
              ? <span className="text-cyan-400/70 flex items-center gap-1"><Key className="w-2.5 h-2.5" />AG key set</span>
              : <span className="text-amber-400/60 flex items-center gap-1"><Key className="w-2.5 h-2.5" />no AG key</span>
          ) : isRc ? (
            rcKey
              ? <span className="text-violet-400/70 flex items-center gap-1"><Key className="w-2.5 h-2.5" />key set</span>
              : hasPoolKeys
                ? <span className="text-emerald-500/60 flex items-center gap-1"><Key className="w-2.5 h-2.5" />server key</span>
                : <span className="text-amber-400/60 flex items-center gap-1"><Key className="w-2.5 h-2.5" />no key</span>
          ) : (
            <span className="text-muted-foreground/40 flex items-center gap-1"><Key className="w-2.5 h-2.5" />server pool</span>
          )}
          {isStreaming && (
            <span className="text-primary/60 flex items-center gap-1 animate-pulse">
              <Clock className="w-2.5 h-2.5" />{formatMs(elapsedMs)}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 space-y-2 py-8">
            <Terminal className="w-6 h-6 opacity-30" />
            <p className="text-[10px] font-sans">Send a message to test the API</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isLast = msg.role === "assistant" && idx === messages.length - 1;
            const hasError = isLast && !isStreaming && chatError;
            if (hasError && !msg.content) {
              return (
                <div key={msg.id} className="flex flex-col gap-1 items-start">
                  <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">Assistant</span>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/8 flex items-start gap-2 px-3 py-2 max-w-full">
                    <AlertTriangle className="w-3 h-3 text-destructive/70 flex-none mt-0.5" />
                    <span className="text-[10px] font-mono text-destructive/80 break-all leading-relaxed">{chatError}</span>
                  </div>
                </div>
              );
            }
            return (
              <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider px-0.5">
                  {msg.role === "user" ? "You" : "Assistant"}
                  {msg.elapsedMs != null && (
                    <span className="ml-1 text-muted-foreground/30 normal-case tracking-normal">{formatMs(msg.elapsedMs)}</span>
                  )}
                </span>
                <div className={`max-w-[90%] rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap overflow-hidden
                  ${msg.role === "user"
                    ? "px-3 py-2 bg-primary/10 border border-primary/20 text-primary-foreground"
                    : "bg-card border border-border/40 text-card-foreground"}`}
                  dir={isRTL(msg.content) ? "rtl" : "ltr"}
                  style={{ fontFamily: msg.role === "assistant" ? "var(--font-mono)" : "var(--font-sans)" }}>
                  <div className="px-3 py-2">
                    {msg.content || (isStreaming && isLast ? (
                      <span className="inline-flex gap-0.5 text-muted-foreground/40">
                        <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                        <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                        <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                      </span>
                    ) : "")}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="flex-none px-4 pb-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Type to test…"
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none rounded-lg bg-card border border-border/50 px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/40 min-h-[36px] max-h-[120px]"
          />
          {isStreaming ? (
            <Button size="icon" variant="destructive" className="h-9 w-9 flex-none rounded-lg" onClick={stopStreaming}>
              <SquareSquare className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button size="icon" className="h-9 w-9 flex-none rounded-lg" onClick={send} disabled={!input.trim()}>
              <Send className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <div className="p-6 h-full flex flex-col gap-5 max-w-6xl">
      <div>
        <h1 className="text-sm font-bold tracking-tight">Playground</h1>
        <p className="text-[10px] text-muted-foreground font-sans mt-0.5">Test the API and view integration examples</p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-5 min-h-0" style={{ minHeight: "500px" }}>
        {/* Chat */}
        <TestChat />

        {/* Docs */}
        <div className="space-y-4 overflow-y-auto">
          <IntegrationDocs />
        </div>
      </div>
    </div>
  );
}
