// API Key Management
class ApiKeyManager {
    static storageKey = 'replyPilot_apiKey';
    static validationEndpoint = 'https://api.x.ai/v1/api-key';

    static getApiKey() {
        return localStorage.getItem(this.storageKey);
    }

    static setApiKey(apiKey) {
        localStorage.setItem(this.storageKey, apiKey);
    }

    static removeApiKey() {
        localStorage.removeItem(this.storageKey);
    }

    static async validateApiKey(apiKey) {
        try {
            const response = await fetch(this.validationEndpoint, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 200) {
                const data = await response.json();
                return !data.api_key_blocked && !data.api_key_disabled && !data.team_blocked;
            }
            return false;
        } catch (error) {
            console.error('API Key validation error:', error);
            return false;
        }
    }
}

// Configuration
const CONFIG = {
    API_URL: 'https://api.x.ai/v1/chat/completions',
    MIN_WORDS: 2,
    DEBOUNCE_DELAY: 300,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
    API_TIMEOUT: 30000, // 30 seconds
    analyzerFunctions: [
        {
            name: "analyze_grammar",
            description: "Analyze and fix grammar errors in text",
            parameters: {
                type: "object",
                properties: {
                    text: {
                        type: "string",
                        description: "Text to analyze"
                    }
                },
                required: ["text"]
            }
        },
        {
            name: "analyze_tone",
            description: "Analyze emotional tone and sentiment",
            parameters: {
                type: "object",
                properties: {
                    text: {
                        type: "string",
                        description: "Text to analyze"
                    }
                },
                required: ["text"]
            }
        }
    ],
    ANALYZER_FUNCTIONS: [
        {
            name: "analyze_grammar",
            description: "Analyze and fix grammar errors in text",
            parameters: {
                type: "object",
                properties: {
                    text: {
                        type: "string",
                        description: "Text to analyze"
                    }
                },
                required: ["text"]
            }
        },
        {
            name: "analyze_tone",
            description: "Analyze emotional tone and sentiment",
            parameters: {
                type: "object",
                properties: {
                    text: {
                        type: "string",
                        description: "Text to analyze"
                    }
                },
                required: ["text"]
            }
        }
    ],
    SYSTEM_PROMPTS: {
        grammar: `You are a professional grammar and writing assistant. For any given text:
1. Always suggest improvements for clarity and correctness
2. Fix grammar, spelling, and punctuation errors
3. Improve word choice and sentence structure
4. Return results in JSON format with an array of 'corrections', each containing:
   - 'original': the original text segment
   - 'suggestion': the improved version
   - 'reason': brief explanation of the change`,
        tone: `You are an expert tone analyzer. For any given text:
1. Analyze the emotional tone, sentiment, and communication style
2. Return results in JSON format with:
   - 'primary': the dominant tone (e.g., "Professional", "Casual", "Formal")
   - 'emotions': array of detected emotions, each with:
     * 'name': emotion name
     * 'emoji': relevant emoji
     * 'confidence': percentage (0-100)
   - 'suggestions': array of tone improvement suggestions`
    }
};

// DOM Elements
const elements = {
    // Modal elements
    apiKeyModal: document.getElementById('apiKeyModal'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    toggleApiKey: document.getElementById('toggleApiKey'),
    saveApiKey: document.getElementById('saveApiKey'),
    manageApiKey: document.getElementById('manageApiKey'),
    container: document.querySelector('.container'),

    // Main app elements
    generateButton: document.getElementById('generateButton'),
    regenerateButton: document.getElementById('regenerateButton'),
    copyButton: document.getElementById('copyButton'),
    emailInput: document.getElementById('emailInput'),
    toneSelect: document.getElementById('toneSelect'),
    lengthSelect: document.getElementById('lengthSelect'),
    responseOutput: document.getElementById('responseOutput'),
    wordCount: document.getElementById('wordCount'),
    tonePreview: document.getElementById('tonePreview'),
    toastContainer: document.getElementById('toastContainer'),

    // Mode switching elements
    modeSwitcher: document.querySelector('.mode-switcher'),
    modeButtons: document.querySelectorAll('.mode-button'),
    analyzerCard: document.getElementById('analyzerCard'),
    analyzerInput: document.getElementById('analyzerInput'),
    analyzerWordCount: document.getElementById('analyzerWordCount'),
    grammarCheck: document.getElementById('grammarCheck'),
    toneAnalysis: document.getElementById('toneAnalysis'),
    analyzeButton: document.getElementById('analyzeButton'),
    analysisResultsCard: document.getElementById('analysisResultsCard'),
    grammarResults: document.getElementById('grammarResults'),
    toneResults: document.getElementById('toneResults'),
    copyAnalysis: document.getElementById('copyAnalysis'),
    replyCard: document.querySelector('.card:not(.analyzer-card):not(.analysis-results)'),
    responseCard: document.querySelector('.card:not(.analyzer-card):not(.analysis-results):nth-child(2)')
};

// Application State
const state = {
    isGenerating: false,
    currentResponse: '',
    retryCount: 0,
    apiKey: ApiKeyManager.getApiKey(),
    streamController: null,
    currentMode: 'reply', // 'reply' or 'analyzer'
    analysisResults: {
        grammar: [],
        tone: {
            primary: '',
            emotions: [],
            suggestions: []
        }
    }
};

// Utility Functions
const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
};

const countWords = (text) => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Toast Notification System
class Toast {
    static show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = '';
        switch(type) {
            case 'success':
                icon = '✓';
                break;
            case 'error':
                icon = '⨯';
                break;
            case 'warning':
                icon = '⚠';
                break;
            default:
                icon = 'ℹ';
        }
        
        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${message}</span>
        `;
        
        elements.toastContainer.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

// Tone Configurations
const TONE_CONFIGS = {
    // Professional Tones
    professional: {
        description: "Clear and professional communication style",
        instructions: "Use a professional and polite tone. Be clear, concise, and business-appropriate.",
        temperature: 0.7
    },
    formal: {
        description: "Traditional business communication",
        instructions: "Write in a very formal business tone with proper etiquette and structured format.",
        temperature: 0.6
    },
    friendly: {
        description: "Warm and approachable communication",
        instructions: "Strike a balance between professional and friendly. Be warm but maintain professionalism.",
        temperature: 0.7
    },
    casual: {
        description: "Relaxed and conversational",
        instructions: "Write in a casual, conversational tone while keeping it appropriate and respectful.",
        temperature: 0.7
    },

    // Fun & Creative Tones
    funny: {
        description: "Humorous and witty response",
        instructions: "Create a humorous response with clever wordplay and wit. Keep it appropriate.",
        temperature: 0.8
    },
    sarcastic: {
        description: "Cleverly sarcastic reply",
        instructions: "Write a witty, sarcastic response. Be clever and playful, not mean-spirited.",
        temperature: 0.8
    },
    roast: {
        description: "Witty comeback to spam",
        instructions: "Create a clever roast response to spam. Be creative and entertaining while avoiding offensive content.",
        temperature: 0.9
    },
    medieval: {
        description: "Medieval knight style",
        instructions: "Write as a medieval knight with period-appropriate language, chivalrous tone, and proper etiquette.",
        temperature: 0.9
    },
    pirate: {
        description: "Swashbuckling pirate captain",
        instructions: "Respond as a pirate captain with appropriate nautical terms and pirate dialect.",
        temperature: 0.9
    },
    shakespeare: {
        description: "Shakespearean style",
        instructions: "Write in Shakespearean English with appropriate period vocabulary and poetic elements.",
        temperature: 0.9
    },

    // Personal Tones
    love: {
        description: "Romantic and heartfelt",
        instructions: "Write a romantic response while maintaining appropriate boundaries. Express genuine feelings tastefully.",
        temperature: 0.8
    },
    poet: {
        description: "Poetic and artistic",
        instructions: "Compose a response with poetic elements, using metaphors and artistic language.",
        temperature: 0.9
    },
    motivational: {
        description: "Inspiring and encouraging",
        instructions: "Write an uplifting response with motivational language and positive reinforcement.",
        temperature: 0.8
    },
    thankful: {
        description: "Genuine gratitude",
        instructions: "Express sincere appreciation with heartfelt language.",
        temperature: 0.7
    },

    // Special Tones
    detective: {
        description: "Noir detective style",
        instructions: "Write like a noir detective with appropriate genre conventions and atmosphere.",
        temperature: 0.9
    },
    sci_fi: {
        description: "Science fiction captain",
        instructions: "Write as a spaceship captain with appropriate sci-fi terminology and futuristic context.",
        temperature: 0.9
    },
    wizard: {
        description: "Mystical wizard style",
        instructions: "Write as a wise wizard with magical terminology and mystical wisdom.",
        temperature: 0.9
    },
    cowboy: {
        description: "Western cowboy style",
        instructions: "Write in western cowboy style with appropriate dialect and manner of speaking.",
        temperature: 0.9
    }
};

// Length Instructions
const LENGTH_CONFIGS = {
    short: {
        description: "Brief and concise response",
        instructions: "Keep the response brief and to the point (2-3 sentences)."
    },
    medium: {
        description: "Balanced length response",
        instructions: "Provide a balanced response with appropriate detail (4-5 sentences)."
    },
    long: {
        description: "Detailed comprehensive response",
        instructions: "Provide a comprehensive response with full context and details (6+ sentences)."
    }
};

// API Integration
class APIClient {
    static async makeRequest(endpoint, options) {
        const apiKey = ApiKeyManager.getApiKey();
        if (!apiKey) {
            throw new Error('API key not found');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);

        try {
            const response = await fetch(endpoint, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    ...options.headers
                },
                signal: controller.signal
            });

            if (!response.ok) {
                if (response.status === 401) {
                    ApiKeyManager.removeApiKey();
                    showApiKeyModal();
                    throw new Error('Invalid API key');
                }
                throw new Error(`API Error: ${response.status}`);
            }

            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    static async* streamResponse(prompt, tone, length) {
        try {
            const response = await this.makeRequest(CONFIG.API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    model: "grok-beta",
                    messages: [
                        {
                            role: "system",
                            content: `${TONE_CONFIGS[tone].instructions} ${LENGTH_CONFIGS[length].instructions}`
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: TONE_CONFIGS[tone].temperature,
                    stream: true
                })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') return;
                        
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices[0]?.delta?.content || '';
                            if (content) yield content;
                        } catch (error) {
                            console.error('Error parsing streaming data:', error);
                        }
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            throw error;
        }
    }
}

// Response Generation
async function generateResponse() {
    if (state.isGenerating) return;

    const email = elements.emailInput.value.trim();
    if (countWords(email) < CONFIG.MIN_WORDS) {
        Toast.show('Please enter at least a few words', 'error');
        return;
    }

    state.isGenerating = true;
    updateUIState(true);
    
    try {
        elements.responseOutput.textContent = '';
        elements.responseOutput.classList.add('streaming');
        
        let fullResponse = '';
        for await (const chunk of APIClient.streamResponse(
            email,
            elements.toneSelect.value,
            elements.lengthSelect.value
        )) {
            if (!state.isGenerating) break; // Handle cancellation
            fullResponse += chunk;
            elements.responseOutput.textContent = fullResponse;
        }
        
        state.currentResponse = fullResponse;
        Toast.show('Response generated successfully', 'success');
        
    } catch (error) {
        console.error('Generation Error:', error);
        
        if (state.retryCount < CONFIG.RETRY_ATTEMPTS) {
            state.retryCount++;
            Toast.show(`Retrying... (${state.retryCount}/${CONFIG.RETRY_ATTEMPTS})`, 'warning');
            await sleep(CONFIG.RETRY_DELAY);
            return generateResponse();
        }
        
        Toast.show(error.message || 'Failed to generate response. Please try again.', 'error');
        elements.responseOutput.textContent = 'Error generating response. Please try again.';
        
    } finally {
        state.isGenerating = false;
        updateUIState(false);
        state.retryCount = 0;
        elements.responseOutput.classList.remove('streaming');
    }
}

// UI State Management
function updateUIState(isGenerating) {
    elements.generateButton.disabled = isGenerating;
    elements.regenerateButton.style.display = !isGenerating && state.currentResponse ? 'flex' : 'none';
    elements.copyButton.style.display = !isGenerating && state.currentResponse ? 'flex' : 'none';
    
    if (isGenerating) {
        elements.generateButton.querySelector('.button-content').innerHTML = `
            <svg class="generate-icon loading" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Generating...
        `;
    } else {
        elements.generateButton.querySelector('.button-content').innerHTML = `
            <svg class="generate-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
            </svg>
            Generate Response
        `;
    }
}

// API Key Modal Management
function showApiKeyModal() {
    elements.container.style.display = 'none';
    elements.apiKeyModal.style.display = 'flex';
    elements.apiKeyInput.focus();
}

function hideApiKeyModal() {
    elements.apiKeyModal.style.display = 'none';
    elements.container.style.display = 'block';
}

async function handleApiKeySave() {
    const apiKey = elements.apiKeyInput.value.trim();
    if (!apiKey) {
        Toast.show('Please enter an API key', 'error');
        return;
    }

    elements.saveApiKey.disabled = true;
    elements.saveApiKey.innerHTML = `
        <span class="button-content">
            <svg class="generate-icon loading" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Validating...
        </span>
    `;

    try {
        const isValid = await ApiKeyManager.validateApiKey(apiKey);
        if (isValid) {
            ApiKeyManager.setApiKey(apiKey);
            hideApiKeyModal();
            Toast.show('API key saved successfully', 'success');
            state.apiKey = apiKey;
            elements.container.style.display = 'block';
        } else {
            Toast.show('Invalid API key. Please check and try again.', 'error');
        }
    } catch (error) {
        Toast.show('Error validating API key. Please try again.', 'error');
    } finally {
        elements.saveApiKey.disabled = false;
        elements.saveApiKey.innerHTML = `
            <span class="button-content">
                Start Using ReplyPilot
            </span>
        `;
    }
}

// Copy Functionality
async function copyToClipboard() {
    try {
        await navigator.clipboard.writeText(state.currentResponse);
        Toast.show('Copied to clipboard', 'success');
        
        // Visual feedback
        elements.copyButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
        setTimeout(() => {
            elements.copyButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
            `;
        }, 1000);
    } catch (err) {
        Toast.show('Failed to copy to clipboard', 'error');
    }
}

// Tone Preview Management
function updateTonePreview(tone) {
    const config = TONE_CONFIGS[tone];
    elements.tonePreview.innerHTML = `
        <span class="tone-badge">${tone.charAt(0).toUpperCase() + tone.slice(1).replace('_', ' ')}</span>
        <p class="tone-description">${config.description}</p>
    `;
}

// Word Counter
const updateWordCount = debounce(() => {
    const count = countWords(elements.emailInput.value);
    elements.wordCount.textContent = `${count} words`;
    elements.generateButton.disabled = count < CONFIG.MIN_WORDS;
}, CONFIG.DEBOUNCE_DELAY);

// API Key Visibility Toggle
function toggleApiKeyVisibility() {
    const input = elements.apiKeyInput;
    const button = elements.toggleApiKey;
    
    if (input.type === 'password') {
        input.type = 'text';
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
        `;
    } else {
        input.type = 'password';
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
            </svg>
        `;
    }
}

// Event Listeners
function initializeEventListeners() {
    // API Key Modal Events
    elements.saveApiKey.addEventListener('click', handleApiKeySave);
    elements.toggleApiKey.addEventListener('click', toggleApiKeyVisibility);
    elements.manageApiKey.addEventListener('click', showApiKeyModal);
    
    // Main App Events
    elements.generateButton.addEventListener('click', generateResponse);
    elements.regenerateButton.addEventListener('click', generateResponse);
    elements.copyButton.addEventListener('click', copyToClipboard);
    elements.emailInput.addEventListener('input', updateWordCount);
    elements.toneSelect.addEventListener('change', (e) => updateTonePreview(e.target.value));
    
    // API Key Input Enter Key
    elements.apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleApiKeySave();
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Generate: Ctrl/Cmd + Enter
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !state.isGenerating) {
            generateResponse();
        }
        // Copy: Ctrl/Cmd + C when response is selected
        if ((e.ctrlKey || e.metaKey) && e.key === 'c' && window.getSelection().toString()) {
            copyToClipboard();
        }
    });

    // Mode switching
    elements.modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const mode = button.dataset.mode;
            switchMode(mode);
        });
    });

    // Analyzer events
    elements.analyzerInput.addEventListener('input', updateAnalyzerWordCount);
    elements.analyzeButton.addEventListener('click', analyzeMessage);
    elements.copyAnalysis.addEventListener('click', copyAnalysisResults);
}

// Initialize
function initialize() {
    // Check for API key
    if (!ApiKeyManager.getApiKey()) {
        showApiKeyModal();
    } else {
        elements.container.style.display = 'block';
    }

    // Initialize UI
    updateTonePreview(elements.toneSelect.value);
    updateWordCount();
    
    // Setup event listeners
    initializeEventListeners();
}

// Start the application
initialize();

// Add these new functions
async function analyzeMessage() {
    if (state.isGenerating) return;

    const text = elements.analyzerInput.value.trim();
    if (countWords(text) < CONFIG.MIN_WORDS) {
        Toast.show('Please enter at least a few words', 'error');
        return;
    }

    state.isGenerating = true;
    updateAnalyzerUIState(true);

    try {
        const grammarCheck = elements.grammarCheck.checked;
        const toneAnalysis = elements.toneAnalysis.checked;
        elements.analysisResultsCard.style.display = 'block';
        elements.grammarResults.innerHTML = '<div class="loading-indicator">Analyzing grammar...</div>';
        elements.toneResults.innerHTML = '<div class="loading-indicator">Analyzing tone...</div>';

        if (grammarCheck) {
            const response = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.apiKey}`
                },
                body: JSON.stringify({
                    model: "grok-beta",
                    messages: [
                        {
                            role: "system",
                            content: CONFIG.SYSTEM_PROMPTS.grammar
                        },
                        {
                            role: "user",
                            content: `Analyze this text and suggest improvements: "${text}"`
                        }
                    ]
                })
            });

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (content) {
                try {
                    // Extract JSON from markdown code block
                    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
                    const jsonStr = jsonMatch ? jsonMatch[1] : content;
                    const grammarResults = JSON.parse(jsonStr);
                    displayGrammarResults(grammarResults);
                } catch (e) {
                    console.error('Grammar parsing error:', e);
                    elements.grammarResults.innerHTML = '<p>Error parsing grammar analysis.</p>';
                }
            }
        }

        if (toneAnalysis) {
            const response = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.apiKey}`
                },
                body: JSON.stringify({
                    model: "grok-beta",
                    messages: [
                        {
                            role: "system",
                            content: CONFIG.SYSTEM_PROMPTS.tone
                        },
                        {
                            role: "user",
                            content: `Analyze the tone and emotions in this text: "${text}"`
                        }
                    ]
                })
            });

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (content) {
                try {
                    // Extract JSON from markdown code block
                    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
                    const jsonStr = jsonMatch ? jsonMatch[1] : content;
                    const toneResults = JSON.parse(jsonStr);
                    displayToneResults(toneResults);
                } catch (e) {
                    console.error('Tone parsing error:', e);
                    elements.toneResults.innerHTML = '<p>Error parsing tone analysis.</p>';
                }
            }
        }

        Toast.show('Analysis completed successfully', 'success');
    } catch (error) {
        console.error('Analysis Error:', error);
        Toast.show(error.message || 'Failed to analyze message. Please try again.', 'error');
    } finally {
        state.isGenerating = false;
        updateAnalyzerUIState(false);
    }
}

function displayGrammarResults(results) {
    if (!results.corrections || !Array.isArray(results.corrections) || results.corrections.length === 0) {
        elements.grammarResults.innerHTML = `
            <div class="correction-item">
                <div class="correction-text">
                    ${elements.analyzerInput.value.trim()}
                </div>
            </div>`;
        return;
    }

    // Create a copy of the original text and apply all corrections
    let finalText = elements.analyzerInput.value.trim();
    results.corrections.forEach(correction => {
        finalText = finalText.replace(correction.original, correction.suggestion);
    });

    elements.grammarResults.innerHTML = `
        <div class="correction-item">
            <div class="correction-text">${finalText}</div>
        </div>
    `;
}

function displayToneResults(results) {
    let html = '';
    
    if (results.primary) {
        html += `<div class="tone-text">Tone: ${results.primary}</div>`;
    }

    if (results.emotions && Array.isArray(results.emotions)) {
        const emotionText = results.emotions
            .map(emotion => `${emotion.emoji || ''} ${emotion.name}`)
            .join(' • ');
        html += `<div class="tone-text">${emotionText}</div>`;
    }

    elements.toneResults.innerHTML = html || '<div class="tone-text">Neutral tone</div>';
}

function copyAnalysisResults() {
    const grammarText = elements.grammarResults.querySelector('.correction-text')?.textContent || '';
    const toneText = Array.from(elements.toneResults.querySelectorAll('.tone-text'))
        .map(item => item.textContent.trim())
        .join('\n');

    const fullText = `${grammarText}\n\n${toneText}`;
    
    navigator.clipboard.writeText(fullText).then(() => {
        Toast.show('Analysis copied to clipboard', 'success');
    }).catch(() => {
        Toast.show('Failed to copy analysis', 'error');
    });
}

function updateAnalyzerUIState(isAnalyzing) {
    const button = elements.analyzeButton;
    button.disabled = isAnalyzing;
    
    const buttonContent = button.querySelector('.button-content');
    if (isAnalyzing) {
        buttonContent.innerHTML = `
            <svg class="analyze-icon loading" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Analyzing...
        `;
    } else {
        buttonContent.innerHTML = `
            <svg class="analyze-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            Analyze Message
        `;
    }
}

function switchMode(mode) {
    state.currentMode = mode;
    
    // Update button states
    elements.modeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Toggle visibility of cards
    if (mode === 'reply') {
        elements.replyCard.style.display = 'block';
        elements.responseCard.style.display = 'block';
        elements.analyzerCard.style.display = 'none';
        elements.analysisResultsCard.style.display = 'none';
        document.querySelector('.subtitle').textContent = 'Craft perfect email responses in seconds with AI';
    } else {
        elements.replyCard.style.display = 'none';
        elements.responseCard.style.display = 'none';
        elements.analyzerCard.style.display = 'block';
        elements.analysisResultsCard.style.display = 'none';
        document.querySelector('.subtitle').textContent = 'Analyze and improve your messages with AI';
    }

    // Clear inputs and results when switching modes
    if (mode === 'analyzer') {
        elements.analyzerInput.value = '';
        updateAnalyzerWordCount();
    }
}

function updateAnalyzerWordCount() {
    const count = countWords(elements.analyzerInput.value);
    elements.analyzerWordCount.textContent = `${count} words`;
    elements.analyzeButton.disabled = count < CONFIG.MIN_WORDS;
}

