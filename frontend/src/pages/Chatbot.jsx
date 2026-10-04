import { useEffect, useRef, useState } from "react";
import api from "../api";
import Icon from "../components/Icon";

const DEFAULT_SUGGESTIONS = [
  "What is my current balance?",
  "How much did I spend this month?",
  "Which category costs the most?",
  "How are my budgets?",
  "Show my savings goals",
  "Predict next month's expenses",
];

export default function Chatbot() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi! I’m your Personal Finance Assistant. Ask me about your balance, spending, budgets, goals, recent transactions, or expense forecast.",
    },
  ]);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    api.get("/chatbot/suggestions")
      .then((res) => setSuggestions(res.data.suggestions || DEFAULT_SUGGESTIONS))
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(text = input) {
    const clean = String(text || "").trim();
    if (!clean || sending) return;

    setMessages((prev) => [...prev, { role: "user", text: clean }]);
    setInput("");
    setSending(true);

    try {
      const res = await api.post("/chatbot/message", { message: clean });
      setMessages((prev) => [...prev, { role: "assistant", text: res.data.reply }]);
    } catch (err) {
      const text = err.response?.data?.message || "I couldn't answer that right now. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", text, error: true }]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage();
  }

  return (
    <div className="chat-page">
      <div className="page-head chat-head">
        <div>
          <span className="ml-badge"><Icon name="chat" size={16} /> Finance assistant</span>
          <h1>Finance Chatbot</h1>
          <p>Ask questions based on the financial data stored in your account.</p>
        </div>
      </div>

      <section className="chat-card">
        <div className="chat-messages" aria-live="polite">
          {messages.map((m, idx) => (
            <div key={idx} className={`chat-row ${m.role}`}>
              <div className={`chat-bubble ${m.error ? "error" : ""}`}>
                {m.role === "assistant" && <span className="chat-avatar"><Icon name="chat" size={17} /></span>}
                <span className="chat-text">{m.text}</span>
              </div>
            </div>
          ))}
          {sending && (
            <div className="chat-row assistant">
              <div className="chat-bubble"><span className="chat-avatar"><Icon name="chat" size={17} /></span><span className="chat-typing">Thinking…</span></div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="chat-suggestions">
          {suggestions.slice(0, 6).map((s) => (
            <button key={s} type="button" onClick={() => sendMessage(s)} disabled={sending}>{s}</button>
          ))}
        </div>

        <form className="chat-compose" onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your spending, budgets, goals..."
            maxLength={500}
            disabled={sending}
          />
          <button className="btn primary" type="submit" disabled={sending || !input.trim()}>
            <Icon name="send" size={17} /> Send
          </button>
        </form>
        <p className="chat-note">Answers are generated from data in this finance tracker and are for informational guidance only.</p>
      </section>
    </div>
  );
}
