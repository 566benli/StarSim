/**
 * AIAgent - Conversational AI assistant for the simulation
 * Connects to an LLM (OpenAI-compatible API) to provide intelligent responses
 * about the simulation state, astronomy facts, and user queries
 */
import { SYSTEM_PROMPT, buildContextPrompt } from './prompts';

export default class AIAgent {
  constructor(config = {}) {
    // API configuration (user can provide their own key)
    this.apiKey = config.apiKey || '';
    this.apiEndpoint = config.apiEndpoint || 'https://api.openai.com/v1/chat/completions';
    this.model = config.model || 'gpt-4o-mini';

    // Conversation history
    this.conversationHistory = [];
    this.maxHistoryLength = 20;

    // Reference to simulation engine
    this.engine = config.engine || null;

    // Callbacks
    this.onResponse = config.onResponse || null;
    this.onError = config.onError || null;

    // Available actions the AI can suggest
    this.actions = {
      CREATE_BODY: 'create_body',
      SET_TIMESCALE: 'set_timescale',
      FOCUS_BODY: 'focus_body',
      TRIGGER_EVENT: 'trigger_event',
      ENTER_EXPLORER: 'enter_explorer',
      CHANGE_PARAM: 'change_param',
      PAUSE: 'pause',
      RESUME: 'resume',
    };
  }

  /**
   * Set the API key
   */
  setApiKey(key) {
    this.apiKey = key;
  }

  /**
   * Set the simulation engine reference
   */
  setEngine(engine) {
    this.engine = engine;
  }

  /**
   * Build the current simulation context for the AI
   */
  buildSimulationContext() {
    if (!this.engine) return 'No simulation is currently running.';

    const stats = this.engine.getStats();
    const bodies = this.engine.getBodies();

    const bodyDescriptions = bodies.map(b => {
      const props = b.getProperties();
      const lifeSummary = props.type === 'planet'
        ? `, LifeStage=${props.lifeStage || 'none'}, Fitness=${props.habitabilityScore ?? 0}, Biosphere=${props.biosphereHealth ?? 0}`
        : '';
      return `- ${props.name} (${props.type}/${props.subtype || props.phase}): ` +
        `Mass=${typeof props.mass === 'object' ? props.mass.value + ' ' + props.mass.unit : props.mass}, ` +
        `Temp=${typeof props.temperature === 'object' ? props.temperature.value + ' K' : props.temperature + ' K'}, ` +
        `Radius=${typeof props.radius === 'object' ? props.radius.value + ' ' + props.radius.unit : props.radius}` +
        lifeSummary;
    }).join('\n');

    return buildContextPrompt(stats, bodyDescriptions);
  }

  /**
   * Send a message to the AI and get a response
   * @param {string} userMessage - The user's message
   * @returns {Promise<{text: string, action?: object}>}
   */
  async chat(userMessage) {
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Build messages array
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `Current simulation state:\n${this.buildSimulationContext()}` },
      ...this.conversationHistory.slice(-this.maxHistoryLength),
    ];

    try {
      // If no API key, use local mock responses
      if (!this.apiKey) {
        return this.mockResponse(userMessage);
      }

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = data.choices[0].message.content;

      // Add to history
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage,
      });

      // Parse any action commands in the response
      const action = this.parseAction(assistantMessage);

      return {
        text: assistantMessage,
        action,
      };
    } catch (error) {
      const errorMsg = `I'm having trouble connecting to my brain (API). Error: ${error.message}. But I can still help with basic questions!`;

      this.conversationHistory.push({
        role: 'assistant',
        content: errorMsg,
      });

      if (this.onError) this.onError(error);

      return { text: errorMsg, action: null };
    }
  }

  /**
   * Parse action commands from AI response
   * AI can embed commands like [ACTION: CREATE_BODY type=sun_like mass=1.2]
   */
  parseAction(text) {
    const actionMatch = text.match(/\[ACTION:\s*(\w+)\s*(.*?)\]/);
    if (!actionMatch) return null;

    const actionType = actionMatch[1];
    const paramsStr = actionMatch[2];
    const params = {};

    // Parse key=value pairs
    const paramMatches = paramsStr.matchAll(/(\w+)=([\w.]+)/g);
    for (const match of paramMatches) {
      params[match[1]] = isNaN(match[2]) ? match[2] : parseFloat(match[2]);
    }

    return { type: actionType, params };
  }

  /**
   * Execute an action parsed from AI response
   */
  executeAction(action) {
    if (!action || !this.engine) return;

    switch (action.type) {
      case this.actions.SET_TIMESCALE:
        if (action.params.scale) {
          this.engine.setTimeScale(action.params.scale);
        }
        break;

      case this.actions.PAUSE:
        this.engine.pause();
        break;

      case this.actions.RESUME:
        this.engine.resume();
        break;

      case this.actions.CREATE_BODY:
        if (action.params.type) {
          this.engine.createStar(action.params.type, action.params);
        }
        break;

      default:
        console.log('Unknown AI action:', action.type);
    }
  }

  /**
   * Mock response when no API key is available
   * Provides helpful built-in responses
   */
  mockResponse(message) {
    const lower = message.toLowerCase();
    let response = '';

    if (lower.includes('what') && (lower.includes('star') || lower.includes('sun'))) {
      response = `Stars are massive luminous spheres of hot gas (plasma) held together by gravity. They generate energy through nuclear fusion in their cores — converting hydrogen into helium and releasing enormous amounts of energy in the process!\n\nIn your simulation, you can see stars evolve over time. They'll go through the main sequence, become red giants, and eventually end their lives as white dwarfs, neutron stars, or black holes depending on their mass.`;
    } else if (lower.includes('black hole')) {
      response = `Black holes are regions where spacetime is so extremely curved that nothing — not even light — can escape once it crosses the event horizon.\n\nIn Genesis Error, you can create black holes and watch them interact with nearby stars and planets. Try creating one near a star to see tidal disruption! The accretion disk you see is superheated matter spiraling inward.`;
    } else if (lower.includes('habitable') || lower.includes('life')) {
      response = `In Genesis Error, life is no longer limited to Earth-like oxygen-water biology. A planet can develop native life if its local pressure, temperature, chemistry, radiation level, and long-term stability support a self-sustaining biosphere.\n\nAll biospheres still follow the same natural-selection rule: populations mutate, selection favors the better-adapted variants, and stable worlds can progress from prebiotic chemistry to simple, complex, and eventually intelligent life. Check the Life & Evolution section in the info panel to see the current stage, fitness, mutation pressure, and extinction pressure.`;
    } else if (lower.includes('help') || lower.includes('how')) {
      response = `Here's what you can do in Genesis Error:\n\n🌟 **Create** — Add stars, planets, and black holes with custom parameters\n⏩ **Time Control** — Speed up or slow down time to watch evolution\n🔭 **Explorer Mode** — Click any body → Enter Explorer to fly through and even dive inside!\n🎲 **Random Events** — Supernovae, solar flares, and asteroid impacts happen randomly\n💬 **AI Chat** — Ask me anything about astronomy or the simulation!\n\nTip: To set up an API key for smarter AI responses, go to Settings.`;
    } else if (lower.includes('supernova') || lower.includes('explode')) {
      response = `Supernovae are among the most energetic events in the universe! When a massive star (8+ solar masses) exhausts its nuclear fuel, the core collapses and the outer layers are blasted into space.\n\nIn Genesis Error, stars above 8 solar masses will eventually go supernova when they reach the red supergiant phase. Speed up time with the time control to watch it happen! The remnant will be either a neutron star or a black hole.`;
    } else if (lower.includes('time') || lower.includes('fast') || lower.includes('speed')) {
      response = `You can control the flow of time in Genesis Error!\n\nUse the time bar at the bottom to:\n- ▶ Play/Pause the simulation\n- ⏩ Choose preset speeds (1 year/sec, 1 million years/sec, etc.)\n- 🎚️ Use the slider for fine-grained control\n\nTry setting it to 1 billion years per second to watch a star go through its entire lifecycle in seconds!`;
    } else {
      response = `That's a great question! I'm currently running in offline mode with limited knowledge. To get my full AI capabilities, you can configure an OpenAI API key in Settings.\n\nIn the meantime, try asking me about:\n- ⭐ Stars and stellar evolution\n- 🕳️ Black holes\n- 🌍 Planets and habitability\n- 💥 Supernovae\n- ⏩ Time controls\n- 🔭 Explorer mode`;
    }

    this.conversationHistory.push({
      role: 'assistant',
      content: response,
    });

    return { text: response, action: null };
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }
}
