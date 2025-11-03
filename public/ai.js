// Initialize elements
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const typingIndicator = document.getElementById('typingIndicator');

// Configuration - Choose your AI provider
const CONFIG = {
    provider: 'groq', // Options: 'huggingface', 'groq', 'openai'
    
    // Groq API (FREE - Get key from: https://console.groq.com)
    groqApiKey: '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',
    
    // OpenAI API (PAID - Get key from: https://platform.openai.com)
    openaiApiKey: 'YOUR_OPENAI_API_KEY_HERE',
};

// Conversation history
let conversationHistory = [];

// Auto-resize textarea
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Send message on Enter (without Shift)
messageInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Send button click
sendButton.addEventListener('click', sendMessage);

async function sendMessage() {
    const message = messageInput.value.trim();
    if (message === '' || sendButton.disabled) return;
    
    // Remove welcome message
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage) welcomeMessage.remove();
    
    // Add user message
    addMessage(message, 'user');
    
    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // Disable input while processing
    sendButton.disabled = true;
    messageInput.disabled = true;
    typingIndicator.classList.add('active');
    
    try {
        // Generate AI response
        const response = await generateAIResponse(message);
        
        // Simulate typing delay
        setTimeout(() => {
            typingIndicator.classList.remove('active');
            typeMessage(response, 'ai');
        }, 500);
        
    } catch (error) {
        console.error('Error:', error);
        typingIndicator.classList.remove('active');
        setTimeout(() => {
            addMessage("I apologize, but I'm having trouble connecting right now. Please try again in a moment. 😊", 'ai');
            sendButton.disabled = false;
            messageInput.disabled = false;
        }, 500);
    }
}

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = sender === 'user' ? 'You' : 'VA';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function typeMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'VA';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chatContainer.appendChild(messageDiv);
    
    let index = 0;
    const typingSpeed = 15;
    
    function type() {
        if (index < text.length) {
            content.textContent += text.charAt(index);
            index++;
            chatContainer.scrollTop = chatContainer.scrollHeight;
            setTimeout(type, typingSpeed);
        } else {
            sendButton.disabled = false;
            messageInput.disabled = false;
            messageInput.focus();
        }
    }
    
    type();
}

// AI Response Generator
async function generateAIResponse(userMessage) {
    // Save to history
    conversationHistory.push({
        role: 'user',
        content: userMessage
    });
    
    // Keep only last 20 messages for context
    if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
    }
    
    let response;
    
    try {
        switch(CONFIG.provider) {
            case 'groq':
                response = await callGroqAPI(userMessage);
                break;
            case 'openai':
                response = await callOpenAIAPI(userMessage);
                break;
            case 'huggingface':
            default:
                response = await callHuggingFaceAPI(userMessage);
                break;
        }
        
        // Save AI response to history
        conversationHistory.push({
            role: 'assistant',
            content: response
        });
        
        return response;
        
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Groq API (FREE and FAST!) - FIXED VERSION
async function callGroqAPI(userMessage) {
    if (!CONFIG.groqApiKey || CONFIG.groqApiKey === 'YOUR_NEW_GROQ_API_KEY_HERE') {
        throw new Error("Please add your Groq API key in the CONFIG section. Get one free at: https://console.groq.com");
    }
    
    const messages = [
        {
            role: "system",
            content: "You are VA (Vicky's AI), a friendly and helpful AI assistant. Be conversational, warm, and natural. Keep responses focused and helpful. Answer questions directly and accurately."
        },
        ...conversationHistory
    ];
    
    console.log('🚀 Calling Groq API...');
    console.log('📝 Message count:', messages.length);
    
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.groqApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant', // Using faster, more stable model
                messages: messages,
                temperature: 0.7,
                max_tokens: 1024,
                top_p: 0.9,
                stream: false
            })
        });
        
        // Get response text for debugging
        const responseText = await response.text();
        console.log('📡 Response status:', response.status);
        console.log('📥 Response:', responseText.substring(0, 200));
        
        if (!response.ok) {
            let errorData;
            try {
                errorData = JSON.parse(responseText);
            } catch {
                errorData = { error: responseText };
            }
            
            console.error('❌ Groq API Error Details:', errorData);
            
            // Provide helpful error messages
            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your Groq API key.');
            } else if (response.status === 429) {
                throw new Error('Rate limit reached. Please wait a moment and try again.');
            } else if (response.status === 400) {
                throw new Error(`Bad request: ${errorData.error?.message || 'Check your request format'}`);
            }
            
            throw new Error(`Groq API error: ${response.status}`);
        }
        
        const data = JSON.parse(responseText);
        console.log('✅ Success! Response received');
        
        return data.choices[0].message.content;
        
    } catch (error) {
        console.error('💥 Error in callGroqAPI:', error);
        throw error;
    }
}

// OpenAI API (PAID but high quality)
async function callOpenAIAPI(userMessage) {
    if (!CONFIG.openaiApiKey || CONFIG.openaiApiKey === 'YOUR_OPENAI_API_KEY_HERE') {
        throw new Error("Please add your OpenAI API key in the CONFIG section. Get one at: https://platform.openai.com");
    }
    
    const messages = [
        {
            role: "system",
            content: "You are VA (Vicky's AI), a friendly and helpful AI assistant. Be conversational, warm, and natural. Keep responses focused and helpful. Answer questions directly and accurately."
        },
        ...conversationHistory
    ];
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${CONFIG.openaiApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: messages,
            temperature: 0.7,
            max_tokens: 1024
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('OpenAI API Error:', errorData);
        throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
}

// Hugging Face API (FREE but may be slower)
async function callHuggingFaceAPI(userMessage) {
    // Build conversation context properly
    let conversationContext = "";
    
    // Add last 6 messages for context
    const recentHistory = conversationHistory.slice(-8);
    recentHistory.forEach(msg => {
        if (msg.role === 'user') {
            conversationContext += `Human: ${msg.content}\n`;
        } else if (msg.role === 'assistant') {
            conversationContext += `Assistant: ${msg.content}\n`;
        }
    });
    
    // Format the prompt properly for Mistral
    const prompt = `<s>[INST] You are VA, a helpful AI assistant. Answer naturally and conversationally.

${conversationContext}
Human: ${userMessage}
[/INST]`;
    
    console.log('🤖 Sending to Hugging Face...');
    
    const response = await fetch(
        'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 300,
                    temperature: 0.7,
                    top_p: 0.9,
                    do_sample: true,
                    return_full_text: false,
                    stop: ["Human:", "</s>", "[INST]"]
                }
            })
        }
    );
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (errorData.error && errorData.error.includes('loading')) {
            return "I'm just warming up! 🧠 The AI model is loading. Please try again in 20 seconds.";
        }
        
        if (errorData.error && errorData.error.includes('rate limit')) {
            return "I'm getting too many requests right now! 😅 Please wait a moment and try again.";
        }
        
        throw new Error('Hugging Face API error');
    }
    
    const data = await response.json();
    console.log('📥 Received response:', data);
    
    let aiResponse = '';
    
    // Extract the generated text
    if (Array.isArray(data) && data[0]?.generated_text) {
        aiResponse = data[0].generated_text;
    } else if (data.generated_text) {
        aiResponse = data.generated_text;
    } else if (typeof data === 'string') {
        aiResponse = data;
    }
    
    // Clean up the response
    aiResponse = cleanResponse(aiResponse);
    
    // Validation
    if (!aiResponse || aiResponse.length < 2) {
        throw new Error('Empty response from API');
    }
    
    return aiResponse;
}

// Clean AI responses
function cleanResponse(text) {
    if (!text) return '';
    
    // Remove role prefixes
    text = text.replace(/^(User:|VA:|Human:|Assistant:|AI:)\s*/gim, '').trim();
    
    // Remove instruction tags
    text = text.replace(/\[INST\]|\[\/INST\]|<s>|<\/s>/g, '').trim();
    
    // Remove any text after "Human:" or similar prompts
    const cutoffIndex = text.search(/\n(Human:|User:|Assistant:)/i);
    if (cutoffIndex > 0) {
        text = text.substring(0, cutoffIndex);
    }
    
    // Trim and remove extra whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // If text ends mid-sentence, find last complete sentence
    const lastPunctuation = Math.max(
        text.lastIndexOf('.'),
        text.lastIndexOf('!'),
        text.lastIndexOf('?'),
        text.lastIndexOf('😊'),
        text.lastIndexOf('😄'),
        text.lastIndexOf('👋')
    );
    
    if (lastPunctuation > 30 && lastPunctuation < text.length - 1) {
        text = text.substring(0, lastPunctuation + 1);
    }
    
    return text.trim();
}

// Initialize
console.log('🤖 Vicky\'s AI is ready!');
console.log(`📡 Using ${CONFIG.provider} provider`);

if (CONFIG.provider === 'groq') {
    console.log('⚡ Using Groq API - Fast and Free!');
    console.log('🔑 Remember to add your API key in the CONFIG section');
}

if (CONFIG.provider === 'huggingface') {
    console.log('💡 Note: First response may be slow (20-30s) while model loads');
    console.log('💡 Tip: For instant responses, get a free Groq API key at https://console.groq.com');
}