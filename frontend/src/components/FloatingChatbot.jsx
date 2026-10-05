import { useEffect, useRef, useState } from "react";
import api from "../api";
import Icon from "./Icon";

const DEFAULT_SUGGESTIONS = [
  "What is my current balance?",
  "How much did I spend this month?",
  "Which category costs the most?",
  "How are my budgets?",
  "Show my savings goals",
  "Predict next month's expenses",
];

const WELCOME = {
  role: "assistant",
  text: "Hi! I’m your Finance Assistant. Ask me about your balance, spending, budgets, goals, recent transactions, or expense forecast.",
};

export default function FloatingChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get("/chatbot/suggestions")
      .then((res) => setSuggestions(res.data.suggestions || DEFAULT_SUGGESTIONS))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function sendMessage(text = input) {
    const clean = String(text || "").trim();
    if (!clean || sending) return;

    setMessages((prev) => [...prev, { role: "user", text: clean }]);
    setInput("");
    setSending(true);

    try {
      const res = await api.post("/chatbot/message", { message: clean });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: res.data.reply || "I could not generate a response." },
      ]);
    } catch (err) {
      const text =
        err.response?.data?.message ||
        "I couldn't answer that right now. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", text, error: true }]);
    } finally {
      setSending(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    sendMessage();
  }

  return (
    <div className={`floating-chat ${open ? "open" : ""}`}>
      {open && (
        <section className="floating-chat-panel" aria-label="Finance chatbot">
          <header className="floating-chat-head">
            <div className="floating-chat-title">
              <span className="floating-chat-avatar"><Icon name="chat" size={18} /></span>
              <span>
                <strong>Finance Assistant</strong>
                <small>Ask about your money</small>
              </span>
            </div>
            <button
              type="button"
              className="floating-chat-close"
              onClick={() => setOpen(false)}
              aria-label="Close finance chatbot"
            >
              <Icon name="close" size={18} />
            </button>
          </header>

          <div className="floating-chat-messages" aria-live="polite">
            {messages.map((m, idx) => (
              <div key={idx} className={`floating-chat-row ${m.role}`}>
                <div className={`floating-chat-bubble ${m.error ? "error" : ""}`}>
                  {m.role === "assistant" && (
                    <span className="floating-mini-avatar"><Icon name="chat" size={14} /></span>
                  )}
                  <span>{m.text}</span>
                </div>
              </div>
            ))}

            {sending && (
              <div className="floating-chat-row assistant">
                <div className="floating-chat-bubble">
                  <span className="floating-mini-avatar"><Icon name="chat" size={14} /></span>
                  <span className="floating-chat-typing">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="floating-chat-suggestions">
            {suggestions.slice(0, 3).map((s) => (
              <button key={s} type="button" onClick={() => sendMessage(s)} disabled={sending}>
                {s}
              </button>
            ))}
          </div>

          <form className="floating-chat-compose" onSubmit={submit}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a finance question..."
              maxLength={500}
              disabled={sending}
              aria-label="Finance chatbot message"
            />
            <button type="submit" disabled={sending || !input.trim()} aria-label="Send message">
              <Icon name="send" size={18} />
            </button>
          </form>

          <p className="floating-chat-note">Uses your finance tracker data for guidance.</p>
        </section>
      )}

      <button
        type="button"
        className="floating-chat-launcher"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close finance chatbot" : "Open finance chatbot"}
      >
        <span className="floating-chat-launcher-icon">
          <Icon name={open ? "close" : "chat"} size={22} />
        </span>
        {!open && <span className="floating-chat-launcher-label">Ask Finance AI</span>}
      </button>
    </div>
  );
}
