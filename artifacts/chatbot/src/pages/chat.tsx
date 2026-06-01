import { useState, useRef, useEffect } from "react";
import { useGetChatModels, useGetChatRcModels, useGetChatAgModels } from "@workspace/api-client-react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useApiKeys } from "@/hooks/use-api-keys";
import { useRightCodeKey } from "@/hooks/use-rightcode-key";
import { useAiGoCodeKey } from "@/hooks/use-aigocode-key";
import { useRcPoolStatus } from "@/hooks/use-rc-pool-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Send, SquareSquare, Trash2, Terminal, ChevronDown, ChevronUp,
  Clock, Key, Eye, EyeOff, Plus, X, CheckCircle2, Paperclip, AlertTriangle, Sun, Moon,
} from "lucide-react";
import type { ImageAttachment } from "@/hooks/use-chat-stream";
import { useTheme } from "@/context/theme";

type Provider = "commandcode" | "rightcode" | "aigocode";

function formatMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function maskKey(key: string) {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 5) + "•".repeat(Math.min(key.length - 8, 12)) + key.slice(-3);
}

export default function Chat() {
  const { theme, toggleTheme } = useTheme();
  const { data: modelsData, isLoading: modelsLoading } = useGetChatModels();
  const ccModels = modelsData?.models || [];

  // ── Provider selection ────────────────────────────────────────────────────
  const [provider, setProvider] = useState<Provider>("commandcode");
  const isRcMode = provider === "rightcode";
  const isAgMode = provider === "aigocode";

  // Right Code key
  const { key: rcKey, setKey: setRcKey } = useRightCodeKey();
  const { hasPoolKeys } = useRcPoolStatus();
  const [rcKeyInput, setRcKeyInput] = useState(rcKey);
  const [showRcKey, setShowRcKey] = useState(false);

  // AiGoCode key
  const { key: agKey, setKey: setAgKey } = useAiGoCodeKey();
  const [agKeyInput, setAgKeyInput] = useState(agKey);
  const [showAgKey, setShowAgKey] = useState(false);

  // ── Dynamic RC models ─────────────────────────────────────────────────────
  const { data: rcModelsData, isLoading: rcModelsLoading } = useGetChatRcModels({
    query: {
      queryKey: ["/api/chat/rc-models"],
      enabled: isRcMode,
      staleTime: 10 * 60 * 1000,
      retry: false,
    },
  });

  // ── Dynamic AG models (requires user key) ────────────────────────────────
  const { data: agModelsData, isLoading: agModelsLoading } = useGetChatAgModels({
    query: {
      queryKey: ["/api/chat/ag-models", agKey],
      enabled: isAgMode && !!agKey,
      staleTime: 10 * 60 * 1000,
      retry: false,
    },
  });

  const rcModels = rcModelsData?.models || [];
  const agModels = agModelsData?.models || [];
  const visibleModels = isRcMode ? rcModels : isAgMode ? agModels : ccModels;

  const groupedModels = visibleModels.reduce<Record<string, typeof visibleModels>>((acc, m) => {
    const g = m.group ?? "Other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(m);
    return acc;
  }, {});

  const [selectedModel, setSelectedModel] = useState("zai-org/GLM-5");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful AI assistant. Do not claim to be ChatGPT, GPT, Claude, Gemini, or any other named AI product. You are a general-purpose assistant. Answer concisely and helpfully."
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [input, setInput] = useState("");

  // ── CommandCode key pool ──────────────────────────────────────────────────
  const { keys, activeId, activeKey, addKey, removeKey, selectKey } = useApiKeys();
  const [newLabel, setNewLabel] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [showNewKey, setShowNewKey] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const { messages, isStreaming, elapsedMs, error: chatError, sendMessage, stopStreaming, clearMessages } = useChatStream();

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);

  // Switch provider and immediately reset model selection
  const switchProvider = (p: Provider) => {
    setProvider(p);
    const nextModels = p === "rightcode" ? rcModels : p === "aigocode" ? agModels : ccModels;
    if (nextModels.length > 0) setSelectedModel(nextModels[0].id);
    else setSelectedModel(""); // will be corrected by the effect once models load
  };

  // Validate selected model still in visible list after data loads
  useEffect(() => {
    if (visibleModels.length > 0 && !visibleModels.find((m) => m.id === selectedModel)) {
      setSelectedModel(visibleModels[0].id);
    }
  }, [visibleModels, selectedModel]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  const handleAddKey = () => {
    if (!newKeyValue.trim()) return;
    addKey(newLabel, newKeyValue);
    setNewLabel("");
    setNewKeyValue("");
    setShowAddForm(false);
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const compressImage = (file: File): Promise<ImageAttachment> =>
    new Promise((resolve, reject) => {
      const MAX_PX = 1024;
      const QUALITY = 0.82;
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        if (width > MAX_PX || height > MAX_PX) {
          if (width >= height) { height = Math.round((height / width) * MAX_PX); width = MAX_PX; }
          else { width = Math.round((width / height) * MAX_PX); height = MAX_PX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
        const base64 = dataUrl.split(",")[1];
        resolve({ data: base64, mimeType: "image/jpeg", previewUrl: dataUrl });
      };
      img.onerror = reject;
      img.src = objectUrl;
    });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    files.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      compressImage(file)
        .then((attachment) => setPendingImages((prev) => [...prev, attachment]))
        .catch(() => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            setPendingImages((prev) => [...prev, { data: dataUrl.split(",")[1], mimeType: file.type, previewUrl: dataUrl }]);
          };
          reader.readAsDataURL(file);
        });
    });
  };

  const handleSend = () => {
    if ((!input.trim() && pendingImages.length === 0) || isStreaming) return;
    const extraHeaders: Record<string, string> = {};
    if (isRcMode && rcKey) extraHeaders["X-Rightcode-Key"] = rcKey;
    if (isAgMode && agKey) extraHeaders["X-Aigocode-Key"] = agKey;
    sendMessage(input, selectedModel, systemPrompt, extraHeaders, pendingImages.length > 0 ? pendingImages : undefined);
    setInput("");
    setPendingImages([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const isRTL = (text: string) => /[\u0600-\u06FF]/.test(text);
  const selectedModelInfo = visibleModels.find((m) => m.id === selectedModel);
  const isClaudeOfficial = selectedModel.startsWith("rc:/claude|");

  // Settings bar status hint
  const settingsHint = isAgMode
    ? agKey
      ? <span className="flex items-center gap-1 text-cyan-400/70 normal-case tracking-normal"><Key className="w-3 h-3" /><span className="text-[10px]">AG key set</span></span>
      : <span className="flex items-center gap-1 text-amber-400/60 normal-case tracking-normal"><Key className="w-3 h-3" /><span className="text-[10px]">no AG key</span></span>
    : isRcMode
      ? rcKey
        ? <span className="flex items-center gap-1 text-violet-400/70 normal-case tracking-normal"><Key className="w-3 h-3" /><span className="text-[10px]">RC key set</span></span>
        : hasPoolKeys
          ? <span className="flex items-center gap-1 text-emerald-500/60 normal-case tracking-normal"><Key className="w-3 h-3" /><span className="text-[10px]">server key active</span></span>
          : <span className="flex items-center gap-1 text-amber-400/60 normal-case tracking-normal"><Key className="w-3 h-3" /><span className="text-[10px]">no RC key</span></span>
      : keys.length > 0
        ? <span className="flex items-center gap-1 text-emerald-500/70 normal-case tracking-normal"><Key className="w-3 h-3" /><span className="text-[10px]">{activeKey ? activeKey.label : "key set"}{keys.length > 1 ? ` (+${keys.length - 1})` : ""}</span></span>
        : null;

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background text-foreground font-mono overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex-none flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm z-10 gap-3">

        {/* Logo + Provider Toggle */}
        <div className="flex items-center gap-3 flex-none">
          <div className="flex items-center gap-1.5">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="font-bold tracking-tight text-sm hidden sm:block">CommandCode</span>
          </div>

          {/* Provider toggle pill */}
          <div className="flex items-center rounded-md border border-border/60 bg-background/60 p-0.5 gap-0.5">
            <button
              onClick={() => switchProvider("commandcode")}
              disabled={isStreaming}
              className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all duration-150 leading-none
                ${provider === "commandcode"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"}`}
            >
              CC
            </button>
            <button
              onClick={() => switchProvider("rightcode")}
              disabled={isStreaming}
              className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all duration-150 leading-none
                ${provider === "rightcode"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"}`}
            >
              RC
            </button>
            <button
              onClick={() => switchProvider("aigocode")}
              disabled={isStreaming}
              className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all duration-150 leading-none
                ${provider === "aigocode"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"}`}
            >
              AG
            </button>
          </div>
        </div>

        {/* Model selector + trash */}
        <div className="flex items-center gap-2 min-w-0">
          <Select
            value={selectedModel}
            onValueChange={setSelectedModel}
            disabled={(isRcMode ? rcModelsLoading : isAgMode ? agModelsLoading : modelsLoading) || isStreaming}
          >
            <SelectTrigger
              className={`w-[190px] h-8 text-xs font-mono border-border/50 bg-background/50 transition-colors
                ${isRcMode ? "border-violet-500/30 focus:ring-violet-500/40" :
                  isAgMode ? "border-cyan-500/30 focus:ring-cyan-500/40" : ""}`}
            >
              <SelectValue placeholder="Select model...">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  {(isRcMode && rcModelsLoading) || (isAgMode && agModelsLoading) ? (
                    <span className="text-muted-foreground/60 animate-pulse">Loading models…</span>
                  ) : (
                    <>
                      <span className="truncate">{selectedModelInfo?.name ?? selectedModel}</span>
                      {selectedModelInfo?.tier === "pro" && (
                        <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-sans leading-none flex-none">Pro</span>
                      )}
                    </>
                  )}
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[380px]">
              {/* Provider badge */}
              <div className={`px-3 py-1.5 mb-1 border-b border-border/40 flex items-center justify-between gap-1.5
                ${isRcMode ? "text-violet-400" : isAgMode ? "text-cyan-400" : "text-primary"}`}>
                <span className="text-[9px] font-bold uppercase tracking-widest font-sans">
                  {isRcMode ? "Right Code — right.codes" : isAgMode ? "AiGoCode — aigocode.com" : "CommandCode — commandcode.ai"}
                </span>
                {((isRcMode && rcModelsLoading) || (isAgMode && agModelsLoading)) && (
                  <span className="text-[9px] text-muted-foreground/50 animate-pulse font-sans normal-case tracking-normal">fetching…</span>
                )}
              </div>

              {/* RC mode: no key yet */}
              {isRcMode && !rcKey && (
                <div className="px-3 py-4 text-center">
                  <p className="text-[10px] text-muted-foreground/50 font-sans">
                    أضف مفتاح API في الإعدادات لعرض النماذج المتاحة
                  </p>
                </div>
              )}

              {/* AG mode: no key yet */}
              {isAgMode && !agKey && (
                <div className="px-3 py-4 text-center">
                  <p className="text-[10px] text-muted-foreground/50 font-sans">
                    أضف مفتاح AiGoCode في الإعدادات لعرض النماذج المتاحة
                  </p>
                </div>
              )}


              {Object.entries(groupedModels).map(([group, groupModels]) => (
                <SelectGroup key={group}>
                  <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-mono px-2 py-1">
                    {group}
                  </SelectLabel>
                  {groupModels.map((m) => {
                    const isClaudeOfficialModel = m.id.startsWith("rc:/claude|");
                    return (
                      <SelectItem key={m.id} value={m.id} className="text-xs font-mono py-2">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span>{m.name}</span>
                            {m.tier === "pro" && (
                              <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-sans leading-none">Pro</span>
                            )}
                            {isClaudeOfficialModel && (
                              <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-orange-500/20 text-orange-400 font-sans leading-none flex items-center gap-0.5">
                                <AlertTriangle className="w-2 h-2" />CLI only
                              </span>
                            )}
                          </div>
                          {m.description && (
                            <span className="text-[10px] text-muted-foreground/60 font-sans">{m.description}</span>
                          )}
                          {isClaudeOfficialModel && (
                            <span className="text-[9px] text-orange-400/60 font-sans">يتطلب Claude Code CLI — لا يعمل عبر السيرفر العادي</span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground flex-none"
            onClick={toggleTheme} title={theme === "dark" ? "وضع الإضاءة" : "الوضع الداكن"}>
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground flex-none"
            onClick={clearMessages} disabled={messages.length === 0 || isStreaming} title="Clear conversation">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* ── Settings Panel ──────────────────────────────────────────────────── */}
      <Collapsible open={isSettingsOpen} onOpenChange={setIsSettingsOpen}
        className="flex-none border-b border-border/50 bg-card/30">
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
            <span className="flex items-center gap-2">
              System Configuration
              {settingsHint}
            </span>
            {isSettingsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="px-4 pb-4 pt-2 space-y-4">

          {/* System Prompt */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">System Prompt</label>
            <Input value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
              className="text-xs font-mono h-8 bg-background/50 border-border/50"
              placeholder="System prompt..." disabled={isStreaming} />
          </div>

          {/* ── AIGOCODE KEY ───────────────────────────────────────────────── */}
          {isAgMode && (
            <div className="space-y-1.5 rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3">
              <label className="text-[10px] text-cyan-400/80 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3 h-3" />
                AiGoCode API Key
                <span className="normal-case tracking-normal text-muted-foreground/40 font-sans">aigocode.com</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showAgKey ? "text" : "password"}
                    value={agKeyInput}
                    onChange={(e) => setAgKeyInput(e.target.value)}
                    onBlur={() => setAgKey(agKeyInput)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { setAgKey(agKeyInput); e.currentTarget.blur(); }
                    }}
                    className="w-full text-xs font-mono h-8 bg-background/60 border border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/40 rounded-md px-3 pr-8 outline-none"
                    placeholder="Paste your aigocode.com API key..."
                    disabled={isStreaming}
                  />
                  <button type="button" onClick={() => setShowAgKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
                    {showAgKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
                {agKey && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-none self-center" />}
              </div>
              {!agKey && (
                <p className="text-[10px] font-sans text-amber-400/70">
                  مطلوب مفتاح API من aigocode.com لاستخدام هذه النماذج.
                </p>
              )}
            </div>
          )}

          {/* ── RIGHT CODE KEY ─────────────────────────────────────────────── */}
          {isRcMode && (
            <div className="space-y-1.5 rounded-md border border-violet-500/20 bg-violet-500/5 p-3">
              <label className="text-[10px] text-violet-400/80 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3 h-3" />
                Right Code API Key
                <span className="normal-case tracking-normal text-muted-foreground/40 font-sans">right.codes</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showRcKey ? "text" : "password"}
                    value={rcKeyInput}
                    onChange={(e) => setRcKeyInput(e.target.value)}
                    onBlur={() => setRcKey(rcKeyInput)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { setRcKey(rcKeyInput); e.currentTarget.blur(); }
                    }}
                    className="text-xs font-mono h-8 bg-background/60 border-violet-500/30 focus-visible:ring-violet-500/40 pr-8"
                    placeholder="Paste your right.codes API key..."
                    disabled={isStreaming}
                  />
                  <button type="button" onClick={() => setShowRcKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
                    {showRcKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
                {rcKey && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-none self-center" />}
              </div>
              {!rcKey && (
                <p className={`text-[10px] font-sans ${hasPoolKeys ? "text-emerald-500/60" : "text-amber-400/70"}`}>
                  {hasPoolKeys
                    ? "يستخدم السيرفر مفتاحه الخاص تلقائياً. أضف مفتاحك لاستخدامه بدلاً منه."
                    : "مطلوب مفتاح API من right.codes لاستخدام هذه النماذج."}
                </p>
              )}
            </div>
          )}

          {/* ── COMMANDCODE KEYS ───────────────────────────────────────────── */}
          {!isRcMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1.5">
                  <Key className="w-3 h-3" />
                  API Keys
                  <span className="normal-case tracking-normal text-muted-foreground/40">— commandcode.ai/settings/api</span>
                </label>
                <button onClick={() => setShowAddForm((v) => !v)}
                  className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors">
                  <Plus className="w-3 h-3" />
                  Add key
                </button>
              </div>

              {keys.length > 0 && (
                <div className="space-y-1.5">
                  {keys.map((entry) => {
                    const isActive = entry.id === activeId || (!activeId && entry === keys[0]);
                    const revealed = revealedIds.has(entry.id);
                    return (
                      <div key={entry.id}
                        className={`flex items-center gap-2 rounded-md px-3 py-2 border text-xs transition-colors cursor-pointer
                          ${isActive ? "border-primary/40 bg-primary/5" : "border-border/40 bg-background/30 hover:border-border/70"}`}
                        onClick={() => selectKey(entry.id)}>
                        <div className={`w-1.5 h-1.5 rounded-full flex-none ${isActive ? "bg-emerald-500" : "bg-muted-foreground/20"}`} />
                        <span className={`flex-none font-sans ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                          {entry.label}
                        </span>
                        <span className="flex-1 font-mono text-muted-foreground/50 truncate text-[10px]">
                          {revealed ? entry.key : maskKey(entry.key)}
                        </span>
                        <div className="flex items-center gap-1 flex-none" onClick={(e) => e.stopPropagation()}>
                          {isActive && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                          <button onClick={() => toggleReveal(entry.id)}
                            className="text-muted-foreground/40 hover:text-muted-foreground p-0.5">
                            {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                          <button onClick={() => removeKey(entry.id)}
                            className="text-muted-foreground/40 hover:text-destructive p-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {showAddForm && (
                <div className="border border-border/50 rounded-md p-3 space-y-2 bg-background/50">
                  <div className="flex gap-2">
                    <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                      className="text-xs font-sans h-7 bg-background/50 border-border/50 flex-[0_0_120px]"
                      placeholder="Label (e.g. Work)" />
                    <div className="relative flex-1">
                      <Input type={showNewKey ? "text" : "password"} value={newKeyValue}
                        onChange={(e) => setNewKeyValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddKey(); }}
                        className="text-xs font-mono h-7 bg-background/50 border-border/50 pr-7"
                        placeholder="cc-..." />
                      <button type="button" onClick={() => setShowNewKey((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
                        {showNewKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => { setShowAddForm(false); setNewLabel(""); setNewKeyValue(""); }}>
                      Cancel
                    </Button>
                    <Button size="sm" className="h-6 px-3 text-xs" onClick={handleAddKey}
                      disabled={!newKeyValue.trim()}>
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {keys.length === 0 && !showAddForm && (
                <p className="text-[10px] text-muted-foreground/40 font-sans">
                  No keys saved. Using server's default key. Click "Add key" to use your own.
                </p>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* ── Chat Area ───────────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3">
            <Terminal className="w-12 h-12 opacity-20" />
            <p className="text-sm">Ready for input.</p>
            {isRcMode && !rcKey && (
              <p className={`text-xs font-sans text-center max-w-xs ${hasPoolKeys ? "text-emerald-500/60" : "text-amber-400/70"}`}>
                {hasPoolKeys ? (
                  <>
                    يستخدم السيرفر مفتاح RC الخاص به.{" "}
                    <button onClick={() => setIsSettingsOpen(true)} className="underline hover:text-emerald-400">
                      أضف مفتاحك
                    </button>{" "}
                    لاستخدامه بدلاً منه.
                  </>
                ) : (
                  <>
                    <button onClick={() => setIsSettingsOpen(true)} className="underline hover:text-amber-400">
                      افتح الإعدادات
                    </button>{" "}
                    وأضف مفتاح Right Code لاستخدام نماذج RC.
                  </>
                )}
              </p>
            )}
            {!isRcMode && keys.length === 0 && (
              <p className="text-xs text-muted-foreground/50 font-sans text-center max-w-xs">
                Using server API key. Open{" "}
                <button onClick={() => setIsSettingsOpen(true)} className="text-primary/70 hover:text-primary underline">
                  System Configuration
                </button>{" "}
                to add your own.
              </p>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6 pb-20">
            {messages.map((msg, idx) => {
              const isLastAssistant = msg.role === "assistant" && idx === messages.length - 1;
              const showTimer = isLastAssistant && isStreaming;
              const showFinalTime = msg.role === "assistant" && msg.elapsedMs != null;
              // Show error inside the last assistant bubble instead of a separate block
              const inlineError = isLastAssistant && !isStreaming && chatError && !msg.content;
              const appendedError = isLastAssistant && !isStreaming && chatError && !!msg.content;
              // Skip rendering an empty assistant bubble that will be replaced by the error block below
              if (msg.role === "assistant" && !msg.content && !isStreaming && chatError && inlineError) {
                return (
                  <div key={msg.id} className="flex flex-col gap-2 items-start">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground/70 uppercase tracking-wider px-1">
                      Assistant
                      {showFinalTime && (
                        <span className="flex items-center gap-1 text-muted-foreground/40 normal-case tracking-normal text-[10px]">
                          <Clock className="w-2.5 h-2.5" />{formatMs(msg.elapsedMs!)}
                        </span>
                      )}
                    </div>
                    <div className="max-w-[85%] rounded-lg border border-destructive/30 bg-destructive/8 text-sm overflow-hidden">
                      <div className="flex items-start gap-2.5 px-4 py-3">
                        <span className="mt-0.5 flex-none text-destructive/70">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                        </span>
                        <span className="text-destructive/90 font-mono text-xs leading-relaxed">{chatError}</span>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground/70 uppercase tracking-wider px-1">
                    {msg.role === "user" ? "User" : "Assistant"}
                    {showTimer && (
                      <span className="flex items-center gap-1 text-primary/70 normal-case tracking-normal animate-pulse">
                        <Clock className="w-3 h-3" />{formatMs(elapsedMs)}
                      </span>
                    )}
                    {showFinalTime && !showTimer && (
                      <span className="flex items-center gap-1 text-muted-foreground/40 normal-case tracking-normal text-[10px]">
                        <Clock className="w-2.5 h-2.5" />{formatMs(msg.elapsedMs!)}
                      </span>
                    )}
                  </div>

                  {/* Image attachments */}
                  {msg.images && msg.images.length > 0 && (
                    <div className={`flex flex-wrap gap-2 max-w-[85%] ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.images.map((img, i) => (
                        <img
                          key={i}
                          src={img.previewUrl}
                          alt="attachment"
                          className="max-h-48 max-w-[240px] rounded-lg border border-border/40 object-contain bg-black/20"
                        />
                      ))}
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-lg text-sm whitespace-pre-wrap leading-relaxed
                      ${msg.role === "user"
                        ? "px-4 py-3 bg-primary/10 text-primary-foreground border border-primary/20"
                        : "bg-card border border-border/50 text-card-foreground overflow-hidden"}`}
                    dir={isRTL(msg.content) ? "rtl" : "ltr"}
                    style={{ fontFamily: msg.role === "assistant" ? "var(--font-mono)" : "var(--font-sans)" }}
                  >
                    {msg.role === "assistant" ? (
                      <>
                        {msg.content && <div className="px-4 py-3">{msg.content}</div>}
                        {!msg.content && isStreaming && (
                          <div className="px-4 py-3">
                            <span className="flex items-center gap-2 text-muted-foreground/50">
                              <span className="inline-flex gap-0.5">
                                <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                                <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                                <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                              </span>
                              <span className="text-xs">waiting...</span>
                            </span>
                          </div>
                        )}
                        {appendedError && (
                          <div className="border-t border-destructive/20 bg-destructive/5 flex items-start gap-2.5 px-4 py-3">
                            <span className="mt-0.5 flex-none text-destructive/70">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                              </svg>
                            </span>
                            <span className="text-destructive/90 text-xs leading-relaxed font-mono">{chatError}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="px-4 py-3">{msg.content}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Input Area ──────────────────────────────────────────────────────── */}
      <div className="flex-none p-4 bg-background border-t border-border/50">
        <div className="max-w-3xl mx-auto space-y-2">

          {/* Pending image previews */}
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1">
              {pendingImages.map((img, i) => (
                <div key={i} className="relative group/img">
                  <img
                    src={img.previewUrl}
                    alt="pending"
                    className="h-16 w-16 object-cover rounded-md border border-border/50 bg-black/20"
                  />
                  <button
                    onClick={() => setPendingImages((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground
                      flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                    title="Remove image"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative group">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            <Textarea ref={textareaRef} value={input} onChange={handleInput} onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
              className={`min-h-[56px] max-h-[200px] w-full resize-none py-3 px-4 pr-24 pl-11 rounded-lg bg-card border-border/50 focus-visible:ring-1 font-mono text-sm leading-relaxed
                ${isRcMode ? "focus-visible:ring-violet-500/60" : "focus-visible:ring-primary"}`}
              disabled={isStreaming} />

            {/* Attach image button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Attach image"
              className={`absolute left-2 bottom-3 flex items-center justify-center w-7 h-7 rounded-md transition-colors
                ${pendingImages.length > 0
                  ? (isRcMode ? "text-violet-400 bg-violet-500/10" : "text-primary bg-primary/10")
                  : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30"}`}
            >
              <Paperclip className={`w-4 h-4 ${pendingImages.length > 0 ? "rotate-45" : ""} transition-transform`} />
            </button>

            <div className="absolute right-2 bottom-2 flex items-center gap-2">
              {isStreaming ? (
                <Button onClick={stopStreaming} size="icon" variant="destructive" className="h-10 w-10 rounded-md" title="Stop">
                  <SquareSquare className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleSend} disabled={!input.trim() && pendingImages.length === 0} size="icon"
                  className={`h-10 w-10 rounded-md text-white transition-all duration-200
                    ${isRcMode
                      ? "bg-violet-600 hover:bg-violet-500 group-focus-within:shadow-[0_0_15px_rgba(139,92,246,0.4)]"
                      : "bg-primary hover:bg-primary/90 group-focus-within:shadow-[0_0_15px_rgba(124,58,237,0.3)]"}`}>
                  <Send className="w-4 h-4 ml-0.5" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {isClaudeOfficial && (
          <div className="max-w-3xl mx-auto mt-2">
            <div className="flex items-center gap-2 rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-[10px] text-orange-400/80 font-sans">
              <AlertTriangle className="w-3 h-3 flex-none text-orange-400" />
              <span>
                <strong>Claude (Official)</strong> — يتطلب هذا النموذج جلسة Claude Code CLI محلية ومرتبطة بالمفتاح.
                قد يظهر خطأ "anomaly detected" عند الاستخدام عبر سيرفر proxy. استخدم{" "}
                <button onClick={() => { const m = visibleModels.find(x => x.id.startsWith("rc:/claude-aws|")); if (m) setSelectedModel(m.id); }}
                  className="underline hover:text-orange-300 cursor-pointer">
                  Claude (AWS)
                </button>{" "}
                كبديل مستقر.
              </span>
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto text-center mt-2">
          <p className="text-[10px] text-muted-foreground/40">
            Powered by{" "}
            <span className={isRcMode ? "text-violet-400/60" : "text-muted-foreground/50"}>
              {isRcMode ? "Right Code (right.codes)" : "CommandCode AI API"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
