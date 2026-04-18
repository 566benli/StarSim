/**
 * AIChat - Conversational AI assistant panel
 * Users can chat with the AI about the simulation, astronomy, etc.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import './AIChat.css';

const AIChat = ({ aiAgent, onClose }) => {
  const { chatMessages, addChatMessage, chatLoading, setChatLoading } = useStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Welcome message
  useEffect(() => {
    if (chatMessages.length === 0) {
      addChatMessage({
        role: 'assistant',
        content: `Hey there! I'm your cosmic guide in Genesis Error. Ask me anything about the universe, your simulation, or what those parameter sliders do!\n\nSome things to try:\n- "What happens when a star dies?"\n- "Tell me about my star system"\n- "What would happen if I added a black hole?"\n- "Speed up time to see evolution"`,
      });
    }
  }, []);

  const handleSend = async () => {
    if (!input.trim() || chatLoading) return;

    const userMsg = input.trim();
    setInput('');
    addChatMessage({ role: 'user', content: userMsg });
    setChatLoading(true);

    try {
      const response = await aiAgent.chat(userMsg);
      addChatMessage({ role: 'assistant', content: response.text });

      // Execute any action the AI suggested
      if (response.action) {
        aiAgent.executeAction(response.action);
      }
    } catch (err) {
      addChatMessage({
        role: 'assistant',
        content: 'Oops! Something went wrong. Try asking again!',
      });
    }

    setChatLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Quick suggestion buttons
  const suggestions = [
    "What's happening in my simulation?",
    "Tell me about black holes",
    "What's the habitable zone?",
    "Suggest an experiment",
  ];

  return (
    <div className="ai-chat">
      <div className="chat-header">
        <div className="chat-title">
          <span className="chat-icon">🤖</span>
          Genesis Error AI Assistant
        </div>
        <button className="chat-close" onClick={onClose}>✕</button>
      </div>

      <div className="chat-messages">
        {chatMessages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            <div className="msg-avatar">
              {msg.role === 'assistant' ? '🌟' : '👤'}
            </div>
            <div className="msg-content">
              {msg.content.split('\n').map((line, j) => (
                <React.Fragment key={j}>
                  {line}
                  {j < msg.content.split('\n').length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
        {chatLoading && (
          <div className="chat-msg assistant">
            <div className="msg-avatar">🌟</div>
            <div className="msg-content typing">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestions */}
      {chatMessages.length <= 1 && (
        <div className="chat-suggestions">
          {suggestions.map((s, i) => (
            <button key={i} className="suggestion-btn" onClick={() => {
              setInput('');
              addChatMessage({ role: 'user', content: s });
              setChatLoading(true);
              aiAgent.chat(s).then(response => {
                addChatMessage({ role: 'assistant', content: response.text });
                if (response.action) aiAgent.executeAction(response.action);
              }).catch(() => {
                addChatMessage({ role: 'assistant', content: 'Oops! Something went wrong. Try asking again!' });
              }).finally(() => {
                setChatLoading(false);
              });
            }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-area">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me about the cosmos..."
          rows={1}
        />
        <button
          className={`send-btn ${input.trim() ? 'active' : ''}`}
          onClick={handleSend}
          disabled={chatLoading || !input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
};

export default AIChat;
