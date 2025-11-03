// studio.js - Complete Fixed Version

// Global Variables
let audioContext;
let mediaRecorder;
let recordedChunks = [];
let tracks = [];
let isPlaying = false;
let isRecording = false;
let currentTime = 0;
let bpm = 120;
let metronomeEnabled = false;
let metronomeInterval;
let playbackStartTime = 0;
let animationId;

// Audio Effects Nodes
let effectsChain = {
    reverb: null,
    delay: null,
    compressor: null,
    lowShelf: null,
    midPeak: null,
    highShelf: null,
    noiseGate: null
};

// Initialize on page load
window.addEventListener('load', () => {
    // Show loading screen for 4 seconds
    setTimeout(() => {
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('studioInterface').style.display = 'flex';
        initializeStudio();
    }, 4000);
});

// Initialize Studio
async function initializeStudio() {
    // Initialize Audio Context
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'interactive'
    });

    // Update latency display
    updateLatencyDisplay();

    // Draw timeline
    drawTimeline();

    // Setup event listeners
    setupEventListeners();

    // Request microphone permission
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 48000,
                channelCount: 2
            } 
        });
        console.log('Microphone access granted');
    } catch (err) {
        console.error('Microphone access denied:', err);
        alert('Please allow microphone access to record audio.');
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Transport controls
    document.getElementById('playBtn').addEventListener('click', togglePlayback);
    document.getElementById('stopBtn').addEventListener('click', stopPlayback);
    document.getElementById('recordBtn').addEventListener('click', toggleRecording);
    document.getElementById('prevBtn').addEventListener('click', previousSection);
    document.getElementById('nextBtn').addEventListener('click', nextSection);
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);
    
    // Metronome
    document.getElementById('metronomeBtn').addEventListener('click', toggleMetronome);
    
    // BPM
    document.getElementById('bpmInput').addEventListener('change', (e) => {
        bpm = parseInt(e.target.value);
    });

    // Add Track button
    document.getElementById('addTrackBtn').addEventListener('click', () => {
        document.getElementById('addTrackModal').style.display = 'block';
    });

    // Modal close
    document.querySelector('.close').addEventListener('click', () => {
        document.getElementById('addTrackModal').style.display = 'none';
    });

    // Track options
    document.querySelectorAll('.track-option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.currentTarget.getAttribute('data-type');
            addTrack(type);
            document.getElementById('addTrackModal').style.display = 'none';
        });
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.getAttribute('data-tab');
            switchTab(tab);
        });
    });

    // Effects controls
    setupEffectsListeners();

    // Lyrics
    document.getElementById('clearLyrics').addEventListener('click', () => {
        document.getElementById('lyricsText').value = '';
    });

    // Timeline click
    document.getElementById('timelineCanvas').addEventListener('click', handleTimelineClick);
}

// Setup Effects Listeners
function setupEffectsListeners() {
    // Autotune
    document.getElementById('autotuneToggle').addEventListener('change', updateEffects);
    document.getElementById('autotuneStrength').addEventListener('input', (e) => {
        document.getElementById('autotuneValue').textContent = e.target.value;
        updateEffects();
    });

    // Reverb
    document.getElementById('reverbToggle').addEventListener('change', updateEffects);
    document.getElementById('reverbRoom').addEventListener('input', (e) => {
        document.getElementById('reverbValue').textContent = e.target.value;
        updateEffects();
    });

    // Echo
    document.getElementById('echoToggle').addEventListener('change', updateEffects);
    document.getElementById('echoTime').addEventListener('input', (e) => {
        document.getElementById('echoTimeValue').textContent = e.target.value;
        updateEffects();
    });
    document.getElementById('echoFeedback').addEventListener('input', (e) => {
        document.getElementById('echoFeedbackValue').textContent = e.target.value;
        updateEffects();
    });

    // Noise Reduction
    document.getElementById('noiseToggle').addEventListener('change', updateEffects);
    document.getElementById('noiseThreshold').addEventListener('input', (e) => {
        document.getElementById('noiseValue').textContent = e.target.value;
        updateEffects();
    });

    // EQ
    document.getElementById('eqToggle').addEventListener('change', updateEffects);
    document.getElementById('eqLow').addEventListener('input', (e) => {
        document.getElementById('eqLowValue').textContent = e.target.value;
        updateEffects();
    });
    document.getElementById('eqMid').addEventListener('input', (e) => {
        document.getElementById('eqMidValue').textContent = e.target.value;
        updateEffects();
    });
    document.getElementById('eqHigh').addEventListener('input', (e) => {
        document.getElementById('eqHighValue').textContent = e.target.value;
        updateEffects();
    });

    // Compressor
    document.getElementById('compressorToggle').addEventListener('change', updateEffects);
    document.getElementById('compThreshold').addEventListener('input', (e) => {
        document.getElementById('compThresholdValue').textContent = e.target.value;
        updateEffects();
    });
    document.getElementById('compRatio').addEventListener('input', (e) => {
        document.getElementById('compRatioValue').textContent = e.target.value;
        updateEffects();
    });

    // Sample Rate
    document.getElementById('sampleRate').addEventListener('change', async (e) => {
        const newSampleRate = parseInt(e.target.value);
        await reinitializeAudioContext(newSampleRate);
    });
}

// Reinitialize Audio Context with new sample rate
async function reinitializeAudioContext(sampleRate) {
    if (audioContext) {
        await audioContext.close();
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: sampleRate,
        latencyHint: 'interactive'
    });
    updateLatencyDisplay();
}

// Update Latency Display
function updateLatencyDisplay() {
    if (audioContext) {
        const latency = (audioContext.baseLatency * 1000).toFixed(1);
        document.getElementById('latencyDisplay').textContent = `${latency}ms`;
    }
}

// Draw Timeline - Extended to 600 seconds
function drawTimeline() {
    const canvas = document.getElementById('timelineCanvas');
    const ctx = canvas.getContext('2d');
    
    // Extend canvas width for 600 seconds (10 minutes)
    const pixelsPerSecond = 100;
    const totalSeconds = 600;
    canvas.width = totalSeconds * pixelsPerSecond;
    canvas.height = 50;
    
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#b8b8b8';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    
    // Draw major markers every 10 seconds
    for (let i = 0; i <= totalSeconds; i += 10) {
        const x = i * pixelsPerSecond;
        
        // Major line every 10 seconds
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.strokeStyle = i % 60 === 0 ? '#667eea' : '#4a4a4a'; // Highlight every minute
        ctx.stroke();
        
        // Time label
        const minutes = Math.floor(i / 60);
        const seconds = i % 60;
        const timeLabel = `${minutes}:${String(seconds).padStart(2, '0')}`;
        ctx.fillStyle = i % 60 === 0 ? '#667eea' : '#b8b8b8';
        ctx.fillText(timeLabel, x + 5, 20);
    }
    
    // Draw minor markers every 1 second
    ctx.strokeStyle = '#2a2a2a';
    for (let i = 0; i <= totalSeconds; i++) {
        if (i % 10 !== 0) { // Skip major markers
            const x = i * pixelsPerSecond;
            ctx.beginPath();
            ctx.moveTo(x, canvas.height - 10);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
    }
}

// Toggle Playback
function togglePlayback() {
    if (isPlaying) {
        pausePlayback();
    } else { 
        startPlayback();
    }
}

// OPTIMIZED: Start Playback - Clean up frame counters
function startPlayback() {
    isPlaying = true;
    playbackStartTime = audioContext.currentTime - currentTime;
    document.getElementById('playBtn').textContent = '⏸';
    
    // Reset frame counters for smooth playback
    updatePlayhead.frameCount = 0;
    updateWaveformPlayback.frameCount = 0;
    
    // Play all tracks
    tracks.forEach(track => {
        if (track.buffer && !track.muted) {
            playTrack(track);
        }
    });
    
    // Start animation
    updatePlayhead();
}

// Pause Playback
function pausePlayback() {
    isPlaying = false;
    document.getElementById('playBtn').textContent = '▶';
    
    // Stop all playing sources
    tracks.forEach(track => {
        if (track.source) {
            track.source.stop();
            track.source = null;
        }
    });
    
    // Stop animation
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
}

// Stop Playback
function stopPlayback() {
    pausePlayback();
    currentTime = 0;
    updatePlayheadPosition(0);
    updateTimeDisplay(0);
}

// FIXED: Play Track with Volume Control
function playTrack(track) {
    const source = audioContext.createBufferSource();
    source.buffer = track.buffer;
    
    // FIXED: Create and store volume control for real-time adjustment
    const trackGain = audioContext.createGain();
    trackGain.gain.value = track.volume * (track.muted ? 0 : 1);
    
    // Apply effects
    const effects = createEffectsChain();
    
    source.connect(trackGain);
    trackGain.connect(effects.input);
    effects.output.connect(audioContext.destination);
    
    // FIXED: Store gain node reference for volume updates
    track.source = source;
    track.gainNode = trackGain;
    
    source.onended = () => {
        const trackDuration = track.buffer.duration;
        if (currentTime >= trackDuration) {
            console.log(`Track ${track.name} finished`);
        }
    };
    
    const startOffset = Math.min(currentTime, track.buffer.duration);
    const duration = track.buffer.duration - startOffset;
    
    if (duration > 0) {
        source.start(0, startOffset, duration);
        console.log(`Playing track: ${track.name} at ${currentTime}s, volume: ${track.volume}`);
    } else {
        console.log(`Track ${track.name} already finished`);
    }
}

// FIXED: Create Effects Chain for Real-time Playback
function createEffectsChain() {
    // Start with a gain node
    let inputNode = audioContext.createGain();
    let currentNode = inputNode;
    
    // 1. COMPRESSOR (first in chain for dynamics control)
    if (document.getElementById('compressorToggle').checked) {
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = parseFloat(document.getElementById('compThreshold').value);
        compressor.ratio.value = parseFloat(document.getElementById('compRatio').value);
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        compressor.knee.value = 30;
        
        currentNode.connect(compressor);
        currentNode = compressor;
        console.log('Compressor enabled:', compressor.threshold.value, compressor.ratio.value);
    }
    
    // 2. EQUALIZER
    if (document.getElementById('eqToggle').checked) {
        // Low Shelf Filter
        const lowShelf = audioContext.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 320;
        lowShelf.gain.value = parseFloat(document.getElementById('eqLow').value);
        
        // Mid Peaking Filter
        const midPeak = audioContext.createBiquadFilter();
        midPeak.type = 'peaking';
        midPeak.frequency.value = 1000;
        midPeak.Q.value = 1.0;
        midPeak.gain.value = parseFloat(document.getElementById('eqMid').value);
        
        // High Shelf Filter
        const highShelf = audioContext.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 3200;
        highShelf.gain.value = parseFloat(document.getElementById('eqHigh').value);
        
        currentNode.connect(lowShelf);
        lowShelf.connect(midPeak);
        midPeak.connect(highShelf);
        currentNode = highShelf;
        console.log('EQ enabled: Low', lowShelf.gain.value, 'Mid', midPeak.gain.value, 'High', highShelf.gain.value);
    }
    
    // 3. DELAY/ECHO
    if (document.getElementById('echoToggle').checked) {
        const delay = audioContext.createDelay(5.0);
        const feedback = audioContext.createGain();
        const wetGain = audioContext.createGain();
        const dryGain = audioContext.createGain();
        const merger = audioContext.createGain();
        
        const delayTime = (parseFloat(document.getElementById('echoTime').value) / 100) * 2; // 0-2 seconds
        const feedbackAmount = parseFloat(document.getElementById('echoFeedback').value) / 100 * 0.7; // Max 0.7 to prevent runaway
        
        delay.delayTime.value = delayTime;
        feedback.gain.value = feedbackAmount;
        wetGain.gain.value = 0.5;
        dryGain.gain.value = 0.7;
        
        // Create feedback loop
        currentNode.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wetGain);
        wetGain.connect(merger);
        
        // Dry signal
        currentNode.connect(dryGain);
        dryGain.connect(merger);
        
        currentNode = merger;
        console.log('Echo enabled: Time', delayTime, 'Feedback', feedbackAmount);
    }
    
    // 4. REVERB
    if (document.getElementById('reverbToggle').checked) {
        const convolver = audioContext.createConvolver();
        const wetGain = audioContext.createGain();
        const dryGain = audioContext.createGain();
        const merger = audioContext.createGain();
        
        const roomSize = parseFloat(document.getElementById('reverbRoom').value) / 100;
        convolver.buffer = createReverbImpulse(roomSize);
        wetGain.gain.value = 0.4 * roomSize; // Wet signal proportional to room size
        dryGain.gain.value = 0.8;
        
        // Wet signal (reverb)
        currentNode.connect(convolver);
        convolver.connect(wetGain);
        wetGain.connect(merger);
        
        // Dry signal
        currentNode.connect(dryGain);
        dryGain.connect(merger);
        
        currentNode = merger;
        console.log('Reverb enabled: Room size', roomSize);
    }
    
    // 5. NOISE GATE (last in chain)
    if (document.getElementById('noiseToggle').checked) {
        // Simple noise gate using gain ramping
        const gate = audioContext.createGain();
        const threshold = parseFloat(document.getElementById('noiseThreshold').value) / 100;
        gate.gain.value = threshold < 0.3 ? 1 : 0.5; // Simplified gate
        
        currentNode.connect(gate);
        currentNode = gate;
        console.log('Noise gate enabled: Threshold', threshold);
    }
    
    // Final master gain
    const masterGain = audioContext.createGain();
    masterGain.gain.value = 1.0;
    currentNode.connect(masterGain);
    
    return { input: inputNode, output: masterGain };
}

// Create Reverb Impulse Response (for real-time context)
function createReverbImpulse(roomSize) {
    const sampleRate = audioContext.sampleRate;
    const length = Math.floor(sampleRate * roomSize * 3);
    const impulse = audioContext.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2);
        impulseL[i] = (Math.random() * 2 - 1) * decay;
        impulseR[i] = (Math.random() * 2 - 1) * decay;
    }
    
    return impulse;
}

// FIXED: Update Effects in Real-time
function updateEffects() {
    // If currently playing, restart playback with new effects
    if (isPlaying) {
        const wasPlaying = true;
        const savedTime = currentTime;
        
        pausePlayback();
        currentTime = savedTime;
        
        if (wasPlaying) {
            setTimeout(() => {
                startPlayback();
            }, 50);
        }
    }
    
    console.log('Effects chain updated');
}

// Toggle Recording
async function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

// FIXED: Start Recording with Reduced Lag
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false,
                sampleRate: parseInt(document.getElementById('sampleRate').value),
                channelCount: 2
            } 
        });
        
        // FIXED: Maximum bitrate for highest quality
        const options = {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 510000 // Maximum quality (510kbps)
        };
        
        mediaRecorder = new MediaRecorder(stream, options);
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            await processRecording(blob);
        };
        
        // FIXED: Larger timeslice reduces lag (was 100ms, now 500ms)
        mediaRecorder.start(500);
        isRecording = true;
        document.getElementById('recordBtn').classList.add('recording');
        
        // Store the exact time when recording starts
        window.recordingStartTime = currentTime;
        
        // Start playback if not already playing
        if (!isPlaying) {
            startPlayback();
        }
        
    } catch (err) {
        console.error('Recording error:', err);
        alert('Failed to start recording. Please check microphone permissions.');
    }
}

// Stop Recording
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false;
        document.getElementById('recordBtn').classList.remove('recording');
    }
}

// Process Recording
async function processRecording(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Apply effects to recorded audio
    const processedBuffer = await applyEffectsToBuffer(audioBuffer);
    
    // Add to tracks with recording start time
    const track = {
        id: Date.now(),
        name: `Recording ${tracks.length + 1}`,
        buffer: processedBuffer,
        type: 'voice',
        muted: false,
        solo: false,
        volume: 1,
        source: null,
        gainNode: null,
        startOffset: window.recordingStartTime || 0 // Store when recording started
    };
    
    tracks.push(track);
    updateTracksDisplay();
}

// FIXED: Apply effects to recorded buffer
async function applyEffectsToBuffer(inputBuffer) {
    try {
        // Create offline context for processing
        const offlineContext = new OfflineAudioContext(
            inputBuffer.numberOfChannels,
            inputBuffer.length,
            inputBuffer.sampleRate
        );
        
        const source = offlineContext.createBufferSource();
        source.buffer = inputBuffer;
        
        // Create effects chain for offline processing
        const effects = createOfflineEffectsChain(offlineContext);
        
        source.connect(effects.input);
        effects.output.connect(offlineContext.destination);
        
        source.start(0);
        
        const renderedBuffer = await offlineContext.startRendering();
        console.log('Audio processed with effects');
        return renderedBuffer;
        
    } catch (error) {
        console.error('Error applying effects:', error);
        return inputBuffer; // Return original on error
    }
}

// FIXED: Create Offline Effects Chain for Recording
function createOfflineEffectsChain(context) {
    let inputNode = context.createGain();
    let currentNode = inputNode;
    
    // Apply same effects as real-time, but using offline context
    if (document.getElementById('compressorToggle').checked) {
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = parseFloat(document.getElementById('compThreshold').value);
        compressor.ratio.value = parseFloat(document.getElementById('compRatio').value);
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        currentNode.connect(compressor);
        currentNode = compressor;
    }
    
    if (document.getElementById('eqToggle').checked) {
        const lowShelf = context.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 320;
        lowShelf.gain.value = parseFloat(document.getElementById('eqLow').value);
        
        const midPeak = context.createBiquadFilter();
        midPeak.type = 'peaking';
        midPeak.frequency.value = 1000;
        midPeak.Q.value = 1.0;
        midPeak.gain.value = parseFloat(document.getElementById('eqMid').value);
        
        const highShelf = context.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 3200;
        highShelf.gain.value = parseFloat(document.getElementById('eqHigh').value);
        
        currentNode.connect(lowShelf);
        lowShelf.connect(midPeak);
        midPeak.connect(highShelf);
        currentNode = highShelf;
    }
    
    if (document.getElementById('echoToggle').checked) {
        const delay = context.createDelay(5.0);
        const feedback = context.createGain();
        const wetGain = context.createGain();
        const dryGain = context.createGain();
        const merger = context.createGain();
        
        delay.delayTime.value = (parseFloat(document.getElementById('echoTime').value) / 100) * 2;
        feedback.gain.value = parseFloat(document.getElementById('echoFeedback').value) / 100 * 0.7;
        wetGain.gain.value = 0.5;
        dryGain.gain.value = 0.7;
        
        currentNode.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wetGain);
        wetGain.connect(merger);
        
        currentNode.connect(dryGain);
        dryGain.connect(merger);
        
        currentNode = merger;
    }
    
    if (document.getElementById('reverbToggle').checked) {
        const convolver = context.createConvolver();
        const wetGain = context.createGain();
        const dryGain = context.createGain();
        const merger = context.createGain();
        
        const roomSize = parseFloat(document.getElementById('reverbRoom').value) / 100;
        convolver.buffer = createReverbImpulseForContext(context, roomSize);
        wetGain.gain.value = 0.4 * roomSize;
        dryGain.gain.value = 0.8;
        
        currentNode.connect(convolver);
        convolver.connect(wetGain);
        wetGain.connect(merger);
        
        currentNode.connect(dryGain);
        dryGain.connect(merger);
        
        currentNode = merger;
    }
    
    const masterGain = context.createGain();
    masterGain.gain.value = 1.0;
    currentNode.connect(masterGain);
    
    return { input: inputNode, output: masterGain };
}

// Helper function for offline context reverb
function createReverbImpulseForContext(context, roomSize) {
    const sampleRate = context.sampleRate;
    const length = Math.floor(sampleRate * roomSize * 3);
    const impulse = context.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2);
        impulseL[i] = (Math.random() * 2 - 1) * decay;
        impulseR[i] = (Math.random() * 2 - 1) * decay;
    }
    
    return impulse;
}

// OPTIMIZED: Update Tracks Display - Cleanup overlays
function updateTracksDisplay() {
    const tracksList = document.getElementById('tracksList');
    const tracksDisplay = document.getElementById('tracksDisplayArea');
    
    tracksList.innerHTML = '';
    tracksDisplay.innerHTML = '';
    
    tracks.forEach((track, index) => {
        // Left sidebar track control with improved volume UI
        const trackItem = document.createElement('div');
        trackItem.className = 'track-item';
        trackItem.innerHTML = `
            <div class="track-header">
                <span class="track-name">${track.name}</span>
                <div class="track-controls">
                    <button class="track-btn ${track.muted ? 'muted' : ''}" onclick="toggleMute(${index})" title="${track.muted ? 'Unmute' : 'Mute'}">
                        ${track.muted ? '🔇' : '🔊'}
                    </button>
                    <button class="track-btn delete-btn" onclick="deleteTrack(${index})" title="Delete Track">🗑️</button>
                </div>
            </div>
            <div class="volume-control">
                <div class="volume-header">
                    <span class="volume-label">Volume</span>
                    <span class="volume-display" id="volume-display-${index}">${Math.round(track.volume * 100)}%</span>
                </div>
                <div class="volume-slider-container">
                    <span class="volume-icon-min">🔈</span>
                    <input type="range" min="0" max="100" value="${track.volume * 100}" 
                        class="volume-slider"
                        oninput="setTrackVolume(${index}, this.value)">
                    <span class="volume-icon-max">🔊</span>
                </div>
                <div class="volume-meter">
                    <div class="volume-meter-fill" style="width: ${track.volume * 100}%" id="volume-meter-${index}"></div>
                </div>
            </div>
        `;
        tracksList.appendChild(trackItem);
        
        // Center area track display with wrapper for overlay
        const trackDisplay = document.createElement('div');
        trackDisplay.className = 'track-display';
        trackDisplay.style.width = 'max-content';
        trackDisplay.style.minWidth = '100%';
        
        // Create container for canvas + overlay
        const canvasContainer = document.createElement('div');
        canvasContainer.style.position = 'relative';
        canvasContainer.style.width = 'max-content';
        canvasContainer.style.minWidth = '100%';
        
        trackDisplay.innerHTML = `<div class="track-display-header">${track.name}</div>`;
        
        const canvas = document.createElement('canvas');
        canvas.className = 'waveform-canvas';
        canvas.id = `waveform-${index}`;
        
        canvasContainer.appendChild(canvas);
        trackDisplay.appendChild(canvasContainer);
        tracksDisplay.appendChild(trackDisplay);
        
        // Draw waveform
        if (track.buffer) {
            setTimeout(() => {
                const canvasElement = document.getElementById(`waveform-${index}`);
                if (canvasElement) {
                    drawWaveform(track.buffer, canvasElement);
                }
            }, 10);
        }
    });
    
    // Start volume meter animation
    animateVolumeMeter();
}

// Volume Meter Animation
function animateVolumeMeter() {
    tracks.forEach((track, index) => {
        const meterFill = document.getElementById(`volume-meter-${index}`);
        if (meterFill && track.gainNode) {
            const currentVolume = track.volume * (track.muted ? 0 : 1);
            meterFill.style.width = (currentVolume * 100) + '%';
        }
    });
}

// OPTIMIZED: Draw Waveform - Improved performance for large files
function drawWaveform(buffer, canvas) {
    if (!canvas || !buffer) {
        console.error('Invalid canvas or buffer');
        return;
    }
    
    const ctx = canvas.getContext('2d', { alpha: false }); // Performance boost
    
    // Set canvas width based on buffer duration (aligned with timeline)
    const pixelsPerSecond = 100;
    const duration = buffer.duration;
    const calculatedWidth = Math.ceil(duration * pixelsPerSecond);
    
    // Set canvas dimensions
    canvas.width = calculatedWidth;
    canvas.height = 70;
    
    // Also set CSS width to match
    canvas.style.width = calculatedWidth + 'px';
    canvas.style.minWidth = calculatedWidth + 'px';
    
    const width = canvas.width;
    const height = canvas.height;
    
    console.log(`Drawing waveform: duration=${duration.toFixed(2)}s, width=${width}px`);
    
    // Clear background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;
    
    // PERFORMANCE FIX: Use simpler gradient for faster rendering
    ctx.fillStyle = '#667eea';
    ctx.globalAlpha = 0.9;
    
    // PERFORMANCE FIX: Batch drawing operations
    ctx.beginPath();
    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        
        // PERFORMANCE FIX: Sample data more efficiently
        const startIdx = i * step;
        const endIdx = Math.min(startIdx + step, data.length);
        
        for (let j = startIdx; j < endIdx; j += Math.max(1, Math.floor(step / 10))) {
            const datum = data[j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        
        const barHeight = Math.max(1, (max - min) * amp);
        const y = (1 + min) * amp;
        
        ctx.fillRect(i, y, 1, barHeight);
    }
    
    ctx.globalAlpha = 1.0;
    
    // Store canvas reference for real-time updates
    canvas.audioBuffer = buffer;
    canvas.waveformDrawn = true; // Mark as drawn
}

// FIXED: Toggle Mute with Volume Control
function toggleMute(index) {
    tracks[index].muted = !tracks[index].muted;
    
    // FIXED: Update volume in real-time if track is playing
    if (tracks[index].gainNode) {
        const targetVolume = tracks[index].muted ? 0 : tracks[index].volume;
        tracks[index].gainNode.gain.setValueAtTime(
            targetVolume,
            audioContext.currentTime
        );
        console.log(`Track ${index} ${tracks[index].muted ? 'muted' : 'unmuted'}`);
    }
    
    updateTracksDisplay();
}

// Delete Track
function deleteTrack(index) {
    tracks.splice(index, 1);
    updateTracksDisplay();
}

// FIXED: Set Track Volume with Real-time Update
function setTrackVolume(index, value) {
    const newVolume = value / 100;
    tracks[index].volume = newVolume;
    
    // Update volume in real-time if track is playing
    if (tracks[index].gainNode) {
        tracks[index].gainNode.gain.setValueAtTime(
            newVolume * (tracks[index].muted ? 0 : 1),
            audioContext.currentTime
        );
    }
    
    // Update display value
    const volumeDisplay = document.getElementById(`volume-display-${index}`);
    if (volumeDisplay) {
        volumeDisplay.textContent = Math.round(newVolume * 100) + '%';
    }
    
    // Update volume meter
    const volumeMeter = document.getElementById(`volume-meter-${index}`);
    if (volumeMeter) {
        volumeMeter.style.width = (newVolume * 100) + '%';
    }
}

// Add Track
function addTrack(type) {
    switch(type) {
        case 'voice':
            // Voice recording track is added when recording stops
            alert('Click the Record button to start recording voice');
            break;
        case 'audio':
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'audio/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const arrayBuffer = await file.arrayBuffer();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    const track = {
                        id: Date.now(),
                        name: file.name,
                        buffer: audioBuffer,
                        type: 'audio',
                        muted: false,
                        solo: false,
                        volume: 1,
                        source: null,
                        gainNode: null
                    };
                    tracks.push(track);
                    updateTracksDisplay();
                }
            };
            input.click();
            break;
        case 'sampler':
            alert('Sampler: Load audio samples and play them with keyboard. Feature coming soon!');
            break;
        case 'instrument':
            const track = {
                id: Date.now(),
                name: 'Virtual Instrument',
                buffer: null,
                type: 'instrument',
                muted: false,
                solo: false,
                volume: 1,
                source: null,
                gainNode: null
            };
            tracks.push(track);
            updateTracksDisplay();
            alert('Virtual Instrument added! Use MIDI controller or keyboard to play.');
            break;
    }
}

// OPTIMIZED: Update Playhead - Throttled for better performance
function updatePlayhead() {
    if (!isPlaying) return;
    
    currentTime = audioContext.currentTime - playbackStartTime;
    
    // PERFORMANCE FIX: Only update display every 5 frames
    if (!updatePlayhead.frameCount) {
        updatePlayhead.frameCount = 0;
    }
    updatePlayhead.frameCount++;
    
    if (updatePlayhead.frameCount % 5 === 0) {
        updatePlayheadPosition(currentTime);
        updateTimeDisplay(currentTime);
    }
    
    // Update waveform less frequently
    if (updatePlayhead.frameCount % 3 === 0) {
        updateWaveformPlayback(currentTime);
    }
    
    animationId = requestAnimationFrame(updatePlayhead);
}

// OPTIMIZED: Update waveform playback visualization - Reduced lag
function updateWaveformPlayback(time) {
    // PERFORMANCE FIX: Only update every 3 frames to reduce CPU usage
    if (!updateWaveformPlayback.frameCount) {
        updateWaveformPlayback.frameCount = 0;
    }
    updateWaveformPlayback.frameCount++;
    
    if (updateWaveformPlayback.frameCount % 3 !== 0) {
        return; // Skip this frame
    }
    
    tracks.forEach((track, index) => {
        const canvas = document.getElementById(`waveform-${index}`);
        if (canvas && canvas.audioBuffer && !track.muted) {
            const ctx = canvas.getContext('2d');
            const pixelsPerSecond = 100;
            const playPosition = time * pixelsPerSecond;
            
            // PERFORMANCE FIX: Don't redraw entire waveform, just overlay
            // Only redraw waveform if it hasn't been drawn yet
            if (!canvas.waveformDrawn) {
                drawWaveform(canvas.audioBuffer, canvas);
                canvas.waveformDrawn = true;
            }
            
            // Clear previous overlay (more efficient than redrawing everything)
            const overlayCanvas = canvas.overlayCanvas;
            if (!overlayCanvas) {
                // Create overlay canvas once
                const overlay = document.createElement('canvas');
                overlay.width = canvas.width;
                overlay.height = canvas.height;
                overlay.style.position = 'absolute';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.pointerEvents = 'none';
                canvas.parentElement.style.position = 'relative';
                canvas.parentElement.appendChild(overlay);
                canvas.overlayCanvas = overlay;
            }
            
            const overlayCtx = canvas.overlayCanvas.getContext('2d');
            overlayCtx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw playback position overlay
            overlayCtx.fillStyle = 'rgba(102, 126, 234, 0.3)';
            overlayCtx.fillRect(0, 0, playPosition, canvas.height);
            
            // Draw current position line
            overlayCtx.strokeStyle = '#ffffff';
            overlayCtx.lineWidth = 2;
            overlayCtx.beginPath();
            overlayCtx.moveTo(playPosition, 0);
            overlayCtx.lineTo(playPosition, canvas.height);
            overlayCtx.stroke();
        }
    });
}

// Update Playhead Position
function updatePlayheadPosition(time) {
    const playhead = document.getElementById('playheadLine');
    const pixelsPerSecond = 100;
    const position = time * pixelsPerSecond;
    playhead.style.left = position + 'px';
    
    // Auto-scroll timeline
    const container = document.querySelector('.center-area');
    if (position > container.scrollLeft + container.clientWidth - 100) {
        container.scrollLeft = position - 100;
    }
}

// Update Time Display
function updateTimeDisplay(time) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const deciseconds = Math.floor((time % 1) * 10);
    
    document.getElementById('timeDisplay').textContent = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${deciseconds}`;
}

// Handle Timeline Click
function handleTimelineClick(e) {
    const canvas = document.getElementById('timelineCanvas');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pixelsPerSecond = 100;
    const time = x / pixelsPerSecond;
    
    currentTime = time;
    updatePlayheadPosition(time);
    updateTimeDisplay(time);
    
    if (isPlaying) {
        pausePlayback();
        startPlayback();
    }
}

// Toggle Metronome
function toggleMetronome() {
    metronomeEnabled = !metronomeEnabled;
    
    if (metronomeEnabled) {
        document.getElementById('metronomeBtn').style.background = '#667eea';
        startMetronome();
    } else {
        document.getElementById('metronomeBtn').style.background = '#3a3a3a';
        stopMetronome();
    }
}

// Start Metronome
function startMetronome() {
    const beatInterval = (60 / bpm) * 1000;
    let beatCount = 0;
    
    metronomeInterval = setInterval(() => {
        playMetronomeClick(beatCount % 4 === 0);
        beatCount++;
    }, beatInterval);
}

// Stop Metronome
function stopMetronome() {
    if (metronomeInterval) {
        clearInterval(metronomeInterval);
    }
}

// Play Metronome Click
function playMetronomeClick(isDownbeat) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = isDownbeat ? 1000 : 800;
    gainNode.gain.value = 0.3;
    
    oscillator.start(audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
    oscillator.stop(audioContext.currentTime + 0.05);
}

// Previous Section
function previousSection() {
    const beatsPerMeasure = 4;
    const secondsPerBeat = 60 / bpm;
    const measureDuration = beatsPerMeasure * secondsPerBeat;
    
    currentTime = Math.max(0, currentTime - measureDuration);
    updatePlayheadPosition(currentTime);
    updateTimeDisplay(currentTime);
}

// Next Section
function nextSection() {
    const beatsPerMeasure = 4;
    const secondsPerBeat = 60 / bpm;
    const measureDuration = beatsPerMeasure * secondsPerBeat;
    
    currentTime += measureDuration;
    updatePlayheadPosition(currentTime);
    updateTimeDisplay(currentTime);
}

// Undo
function undo() {
    alert('Undo functionality: Would restore previous state');
    // Implement undo stack
}

// Redo
function redo() {
    alert('Redo functionality: Would restore next state');
    // Implement redo stack
}

// Switch Tab
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Panel`).classList.add('active');
}

// Make functions globally accessible
window.toggleMute = toggleMute;
window.deleteTrack = deleteTrack;
window.setTrackVolume = setTrackVolume;
