import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chat } from '../../api/ai';
import type { ChatMessage } from '../../api/ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface AiDraftPanelProps {
  circuitCode: string;
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUGGESTED_QUESTIONS = [
  'What does this circuit do?',
  'Explain each gate',
  'Expected measurement outcomes?',
  'How can I optimize it?',
];

const WELCOME_TEXT =
  "Hi! I'm your Quantum AI assistant. I can see your current circuit code and help you understand it, explain quantum gates, or answer any quantum computing questions.";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AiDraftPanel({ circuitCode, onClose }: AiDraftPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError(null);
      setInput('');

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
      };

      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const history: ChatMessage[] = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await chat(history, circuitCode, controller.signal);

        const aiMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.reply,
        };

        setMessages((prev) => [...prev, aiMessage]);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
        setError(msg);
      } finally {
        setLoading(false);
        abortRef.current = null;
        // Refocus input after response
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [messages, loading, circuitCode],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const handleClear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setLoading(false);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const hasCircuit = circuitCode.trim().length > 0;

  return (
    <div className="ai-chat">
      {/* ── Header ── */}
      <div className="ai-chat__header">
        <span className="ai-chat__spark">✦</span>
        <span className="ai-chat__title">Quantum AI</span>
        {hasCircuit && <span className="ai-chat__ctx-chip">Circuit loaded</span>}
        {messages.length > 0 && (
          <button
            type="button"
            className="ai-chat__clear-btn"
            onClick={handleClear}
            title="Clear conversation"
          >
            Clear
          </button>
        )}
        {onClose && (
          <button
            type="button"
            className="ai-chat__close-btn"
            onClick={onClose}
            aria-label="Close AI chat"
            title="Close"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="ai-chat__messages" role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 ? (
          /* Welcome state */
          <div className="ai-chat__welcome">
            <div className="ai-chat__welcome-bubble">
              <span className="ai-chat__bubble-spark">✦</span>
              <p className="ai-chat__welcome-text">{WELCOME_TEXT}</p>
            </div>
            {hasCircuit && (
              <div className="ai-chat__suggestions">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="ai-chat__suggestion"
                    onClick={() => sendMessage(q)}
                    disabled={loading}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {!hasCircuit && (
              <p className="ai-chat__no-circuit">
                Add gates to your circuit to ask questions about it.
              </p>
            )}
          </div>
        ) : (
          /* Conversation */
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`ai-chat__msg ai-chat__msg--${msg.role}`}
              >
                {msg.role === 'assistant' && (
                  <span className="ai-chat__msg-spark">✦</span>
                )}
                <div className="ai-chat__msg-bubble">
                  <div className="ai-chat__msg-md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="ai-chat__msg ai-chat__msg--assistant">
            <span className="ai-chat__msg-spark">✦</span>
            <div className="ai-chat__typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="ai-chat__error" role="alert">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div className="ai-chat__input-row">
        <textarea
          ref={inputRef}
          className="ai-chat__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your circuit… (Enter to send)"
          rows={2}
          disabled={loading}
          aria-label="Chat input"
        />
        {loading ? (
          <button
            type="button"
            className="ai-chat__send-btn ai-chat__send-btn--stop"
            onClick={handleStop}
            aria-label="Stop"
          >
            ◼
          </button>
        ) : (
          <button
            type="button"
            className="ai-chat__send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim()}
            aria-label="Send"
          >
            ↑
          </button>
        )}
      </div>
    </div>
  );
}

