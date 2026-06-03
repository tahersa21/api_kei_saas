import { useState, useRef, useCallback } from "react";
import { getActiveApiKey } from "./use-api-keys";

export type FileAttachment = {
  data: string;        // base64 without data-URL prefix
  mimeType: string;    // e.g. "image/jpeg", "application/pdf", "text/plain"
  name: string;        // original filename
  previewUrl?: string; // data-URL — only set for images
};

// Backward-compat alias
export type ImageAttachment = FileAttachment;

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: FileAttachment[];
  reasoning?: string;
  timestamp: Date;
  elapsedMs?: number;
};

// Typewriter tick interval in ms
const TYPEWRITER_TICK_MS = 16;

export function useChatStream() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Typewriter queue — chars waiting to be revealed
  const typewriterQueueRef = useRef<string>("");
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typewriterDoneRef = useRef<boolean>(false);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopTypewriter = () => {
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
    typewriterQueueRef.current = "";
    typewriterDoneRef.current = false;
  };

  const startTypewriter = (msgId: string) => {
    if (typewriterIntervalRef.current) return;
    typewriterIntervalRef.current = setInterval(() => {
      const queue = typewriterQueueRef.current;
      if (queue.length === 0) {
        if (typewriterDoneRef.current) {
          if (typewriterIntervalRef.current) {
            clearInterval(typewriterIntervalRef.current);
            typewriterIntervalRef.current = null;
          }
        }
        return;
      }
      // Adaptive: reveal more chars per tick when queue is large (catch-up mode)
      const charsPerTick = queue.length > 300 ? 25
        : queue.length > 100 ? 10
        : queue.length > 30  ? 4
        : 1;
      const reveal = queue.slice(0, charsPerTick);
      typewriterQueueRef.current = queue.slice(charsPerTick);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === msgId ? { ...msg, content: msg.content + reveal } : msg
        )
      );
    }, TYPEWRITER_TICK_MS);
  };

  const sendMessage = useCallback(
    async (
      content: string,
      model: string,
      systemPrompt: string,
      extraHeaders?: Record<string, string>,
      images?: FileAttachment[],
    ) => {
      if (!content.trim() && (!images || images.length === 0)) return;

      // Reset typewriter state
      stopTypewriter();

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        images: images && images.length > 0 ? images : undefined,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setError(null);
      setElapsedMs(0);

      startTimeRef.current = Date.now();
      stopTimer();
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 100);

      abortControllerRef.current = new AbortController();

      const assistantMessageId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: "assistant", content: "", reasoning: "", timestamp: new Date() },
      ]);

      // Start the typewriter interval for this message
      startTypewriter(assistantMessageId);

      try {
        const activeKey = getActiveApiKey();
        const headers: Record<string, string> = { "Content-Type": "application/json", ...extraHeaders };
        if (activeKey && !headers["X-Rightcode-Key"]) headers["X-Api-Key"] = activeKey;

        // Build wire-format messages (strip previewUrl to keep payload small)
        const wireMessages = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.images && m.images.length > 0
            ? { images: m.images.map(({ data, mimeType, name }) => ({ data, mimeType, name })) }
            : {}),
        }));

        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers,
          body: JSON.stringify({
            messages: wireMessages,
            model,
            system: systemPrompt,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          // Try to parse a JSON error body for cleaner messages
          let userFriendlyError = errText;
          try {
            const parsed = JSON.parse(errText) as { error?: string };
            if (parsed.error) userFriendlyError = parsed.error;
          } catch { /* keep raw text */ }
          throw new Error(userFriendlyError);
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;

          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              const jsonStr = trimmed.startsWith("data: ") ? trimmed.slice(6).trim() : trimmed;
              if (jsonStr === "[DONE]") { done = true; break; }

              try {
                const chunk = JSON.parse(jsonStr);
                const type: string = chunk.type ?? "";

                if (type === "text-delta") {
                  const delta: string = chunk.text ?? "";
                  if (delta) typewriterQueueRef.current += delta;
                } else if (type === "reasoning-delta") {
                  const delta: string = chunk.text ?? "";
                  if (delta) {
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, reasoning: (msg.reasoning ?? "") + delta }
                          : msg
                      )
                    );
                  }
                } else if (type === "error") {
                  const raw = chunk.error;
                  const errMsg: string =
                    typeof raw === "string" ? raw
                    : typeof raw === "object" && raw !== null
                      ? ((raw as Record<string, unknown>).message as string | undefined) ?? JSON.stringify(raw)
                      : "Unknown error from API";
                  setError(errMsg);
                } else {
                  // Fallback: OpenAI-style delta
                  const delta: string = chunk.choices?.[0]?.delta?.content ?? chunk.text ?? chunk.content ?? "";
                  if (delta) typewriterQueueRef.current += delta;
                }
              } catch { /* skip unparseable */ }
            }
          }
        }

        // Record API elapsed time (before typewriter animation)
        const finalMs = Date.now() - startTimeRef.current;
        stopTimer();
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, elapsedMs: finalMs } : msg
          )
        );

        // Mark stream as done — typewriter will stop automatically once queue is empty
        typewriterDoneRef.current = true;

        // Wait for typewriter to finish draining the queue
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (typewriterQueueRef.current.length === 0 && !typewriterIntervalRef.current) {
              clearInterval(check);
              resolve();
            }
          }, 50);
        });
      } catch (err: unknown) {
        const e = err as Error;
        if (e.name !== "AbortError") {
          setError(e.message || "An error occurred");
        }
        stopTypewriter();
      } finally {
        stopTimer();
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages]
  );

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      stopTimer();
      stopTypewriter();
      setIsStreaming(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    stopTimer();
    stopTypewriter();
    setMessages([]);
    setError(null);
    setElapsedMs(0);
  }, []);

  return { messages, isStreaming, elapsedMs, error, sendMessage, stopStreaming, clearMessages };
}
