// Audio Context and Tone.js Setup
let audioTrackBuffer = null;
let audioTrackPlayer = null;
let autotuneIntensity = 0;
let autotuneProcessor = null;
let isRecordingWithAudio = false;
let mixedRecordingStream = null;
let audioContext;
let mediaRecorder;
let recordedChunks = [];
let voiceBuffer = null;
let instrumentalBuffer = null;
let isRecording = false;
let isPlaying = false;
let voicePlayer, instrumentalPlayer;
let startTime = 0;
let pauseTime = 0;
let animationId;
let applyEffectsOnRecording = false; // New toggle for recording effects

// Effects
let eq3, compressor, reverb, feedbackDelay, pitchShift, masterGain, voiceGain, instGain;
let voiceMeter, masterMeter;

// Initialize Audio System
async function initAudio() {
    try {
        await Tone.start();
        audioContext = Tone.context;
        
        // Create effects chain for voice
        eq3 = new Tone.EQ3({
            low: 0,
            mid: 0,
            high: 0
        });
        
        compressor = new Tone.Compressor({
            threshold: -24,
            ratio: 4,
            attack: 0.003,
            release: 0.25
        });
        
        reverb = new Tone.Reverb({
            decay: 1.5,
            wet: 0.2
        });
        
        feedbackDelay = new Tone.FeedbackDelay({
            delayTime: 0.25,
            feedback: 0.3,
            wet: 0.25
        });
        
        pitchShift = new Tone.PitchShift({
            pitch: 0
        });
        
        voiceGain = new Tone.Gain(1);
        instGain = new Tone.Gain(0.7);
        masterGain = new Tone.Gain(0.8);
        
        // Create meters
        voiceMeter = new Tone.Meter();
        masterMeter = new Tone.Meter();
        
        // Connect effects chain
        eq3.connect(compressor);
        compressor.connect(reverb);
        reverb.connect(feedbackDelay);
        feedbackDelay.connect(pitchShift);
        pitchShift.connect(voiceGain);
        voiceGain.connect(voiceMeter);
        voiceGain.connect(masterGain);
        
        masterGain.connect(masterMeter);
        masterGain.toDestination();
        
        // Update meters
        updateMeters();
        
        console.log('Audio initialized successfully');
    } catch (error) {
        console.error('Error initializing audio:', error);
    }
}

// Update VU Meters
function updateMeters() {
    if (!voiceMeter || !masterMeter) return;
    
    const voiceLevel = Math.min(100, (voiceMeter.getValue() + 60) * 1.5);
    const masterLevel = Math.min(100, (masterMeter.getValue() + 60) * 1.5);
    
    const voiceMeterEl = document.getElementById('voiceMeter');
    const masterMeterEl = document.getElementById('masterMeter');
    
    if (voiceMeterEl) voiceMeterEl.style.width = Math.max(0, voiceLevel) + '%';
    if (masterMeterEl) masterMeterEl.style.width = Math.max(0, masterLevel) + '%';
    
    requestAnimationFrame(updateMeters);
}

// Enhanced Recording with Audio Track
async function startRecording() {
    console.log('Starting recording...');
    
    if (!audioContext) {
        await initAudio();
    }
    
    try {
        // Get microphone stream with higher quality settings
        const micStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 48000,
                channelCount: 1
            } 
        });
        
        console.log('Microphone access granted');
        
        // Create audio context for mixing
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
        const destination = audioCtx.createMediaStreamDestination();
        
        // Connect microphone with better quality
        const micSource = audioCtx.createMediaStreamSource(micStream);
        const micGain = audioCtx.createGain();
        micGain.gain.value = 1.2; // Boost mic slightly
        micSource.connect(micGain);
        micGain.connect(destination);
        
        // Also output to speakers so user can hear the backing track
        const speakerGain = audioCtx.createGain();
        speakerGain.gain.value = 0.8;
        
        // If audio track is loaded, play and mix it
        let trackSource = null;
        if (audioTrackBuffer) {
            trackSource = audioCtx.createBufferSource();
            trackSource.buffer = audioTrackBuffer;
            const trackGain = audioCtx.createGain();
            trackGain.gain.value = 0.6; // Balance with voice
            trackSource.connect(trackGain);
            trackGain.connect(destination); // To recording
            trackGain.connect(speakerGain); // To speakers
            speakerGain.connect(audioCtx.destination);
            trackSource.start();
            audioTrackPlayer = trackSource;
        }
        
        // If instrumental is loaded, play and mix it
        let instSource = null;
        if (instrumentalBuffer) {
            instSource = audioCtx.createBufferSource();
            instSource.buffer = instrumentalBuffer;
            const instGainNode = audioCtx.createGain();
            instGainNode.gain.value = 0.6;
            instSource.connect(instGainNode);
            instGainNode.connect(destination);
            instGainNode.connect(speakerGain);
            speakerGain.connect(audioCtx.destination);
            instSource.start();
        }
        
        // Record the mixed stream with highest quality
        const mixedStream = destination.stream;
        
        // Use highest quality settings
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/webm';
        }
        
        mediaRecorder = new MediaRecorder(mixedStream, {
            mimeType: mimeType,
            audioBitsPerSecond: 256000 // Higher bitrate for better quality
        });
        
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            console.log('Recording stopped, processing...');
            
            // Stop the backing track if it's playing
            if (trackSource) trackSource.stop();
            if (instSource) instSource.stop();
            
            const blob = new Blob(recordedChunks, { type: mimeType });
            console.log('Total recording size:', blob.size, 'bytes');
            
            try {
                const arrayBuffer = await blob.arrayBuffer();
                let decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
                console.log('Audio decoded successfully');
                
                // Apply autotune only if effects are enabled and intensity > 0
                if (applyEffectsOnRecording && autotuneIntensity > 0) {
                    console.log('Applying autotune with intensity:', autotuneIntensity);
                    decodedBuffer = await applyAutotune(decodedBuffer, autotuneIntensity);
                    console.log('Autotune applied successfully');
                } else {
                    console.log('Recording saved as raw/clean voice (effects disabled)');
                }
                
                voiceBuffer = decodedBuffer;
                
                updateUI();
                drawWaveform(voiceBuffer);
            } catch (err) {
                console.error('Error processing recorded audio:', err);
                alert('Error processing audio: ' + err.message);
            }
            
            // Stop mic tracks
            micStream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.onerror = (e) => {
            console.error('MediaRecorder error:', e);
        };
        
        mediaRecorder.start(100);
        isRecording = true;
        startTime = Date.now();
        
        document.getElementById('recordBtn').disabled = true;
        document.getElementById('recordBtn').classList.add('recording');
        document.getElementById('stopBtn').disabled = false;
        
        updateTimer();
        
        console.log('Recording started successfully with backing track');
        
    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Could not access microphone. Please check permissions and make sure you\'re using HTTPS or localhost.');
    }
}

function stopRecording() {
    console.log('Stopping recording...');
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        if (mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        isRecording = false;
        
        document.getElementById('recordBtn').disabled = false;
        document.getElementById('recordBtn').classList.remove('recording');
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('playBtn').disabled = false;
        document.getElementById('exportBtn').disabled = false;
    }
}

// Enhanced Playback Function
async function playAudio() {
    console.log('Playing audio...');
    
    if (!voiceBuffer && !instrumentalBuffer && !audioTrackBuffer) {
        console.log('No audio to play');
        return;
    }
    
    if (isPlaying) {
        console.log('Already playing');
        return;
    }
    
    if (!audioContext) await initAudio();
    
    isPlaying = true;
    const currentTime = Tone.now();
    
    try {
        if (voiceBuffer) {
            voicePlayer = new Tone.Player(voiceBuffer);
            
            // Apply effects during playback (not recording)
            if (applyEffectsOnRecording) {
                voicePlayer.connect(eq3);
            } else {
                // Direct connection without effects for clean playback
                voicePlayer.connect(voiceGain);
                voiceGain.connect(masterGain);
            }
            
            voicePlayer.start(currentTime);
        }
        
        if (instrumentalBuffer) {
            instrumentalPlayer = new Tone.Player(instrumentalBuffer).connect(instGain);
            instrumentalPlayer.connect(masterGain);
            instrumentalPlayer.start(currentTime);
        }
        
        if (audioTrackBuffer && !voiceBuffer) {
            audioTrackPlayer = new Tone.Player(audioTrackBuffer).connect(instGain);
            audioTrackPlayer.connect(masterGain);
            audioTrackPlayer.start(currentTime);
        }
        
        document.getElementById('playBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        
        const duration = Math.max(
            voiceBuffer ? voiceBuffer.duration : 0,
            instrumentalBuffer ? instrumentalBuffer.duration : 0,
            audioTrackBuffer ? audioTrackBuffer.duration : 0
        );
        
        startTime = Date.now();
        updatePlaybackTimer(duration);
    } catch (error) {
        console.error('Error playing audio:', error);
        isPlaying = false;
        document.getElementById('playBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
    }
}

function pauseAudio() {
    console.log('Pausing audio...');
    if (voicePlayer) voicePlayer.stop();
    if (instrumentalPlayer) instrumentalPlayer.stop();
    if (audioTrackPlayer) audioTrackPlayer.stop();
    
    isPlaying = false;
    document.getElementById('playBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    
    if (animationId) cancelAnimationFrame(animationId);
}

// Load Instrumental
document.getElementById('instrumentalInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    console.log('Loading instrumental:', file.name);
    
    if (!audioContext) await initAudio();
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        instrumentalBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        document.getElementById('instrumentalInfo').textContent = 
            `Loaded: ${file.name} (${formatTime(instrumentalBuffer.duration)})`;
        
        updateUI();
        console.log('Instrumental loaded successfully');
    } catch (error) {
        console.error('Error loading instrumental:', error);
        alert('Error loading instrumental file. Please try a different format.');
    }
});

// Load Audio Track
document.getElementById('audioTrackInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    console.log('Loading audio track:', file.name);
    
    if (!audioContext) await initAudio();
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        audioTrackBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        document.getElementById('audioTrackInfo').textContent = 
            `Loaded: ${file.name} (${formatTime(audioTrackBuffer.duration)})`;
        
        // Draw waveform for audio track
        drawAudioTrackWaveform(audioTrackBuffer);
        updateUI();
        console.log('Audio track loaded successfully');
    } catch (error) {
        console.error('Error loading audio track:', error);
        alert('Error loading audio file. Please try a different format.');
    }
});

// Draw Audio Track Waveform
function drawAudioTrackWaveform(buffer) {
    const container = document.getElementById('audioTrackWaveform');
    if (!container) return;
    
    container.innerHTML = '<canvas id="audioTrackCanvas"></canvas>';
    
    const canvas = document.getElementById('audioTrackCanvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = container.clientWidth;
    canvas.height = 80;
    
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;
    
    ctx.strokeStyle = '#9b59b6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    for (let i = 0; i < width; i++) {
        const min = Math.min(...data.slice(i * step, (i + 1) * step));
        const max = Math.max(...data.slice(i * step, (i + 1) * step));
        
        ctx.moveTo(i, (1 + min) * amp);
        ctx.lineTo(i, (1 + max) * amp);
    }
    
    ctx.stroke();
}

// Effect Controls
document.getElementById('eqLow')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (eq3) eq3.low.value = val;
    const display = document.getElementById('eqLowValue');
    if (display) display.textContent = val.toFixed(1) + ' dB';
});

document.getElementById('eqMid')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (eq3) eq3.mid.value = val;
    const display = document.getElementById('eqMidValue');
    if (display) display.textContent = val.toFixed(1) + ' dB';
});

document.getElementById('eqHigh')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (eq3) eq3.high.value = val;
    const display = document.getElementById('eqHighValue');
    if (display) display.textContent = val.toFixed(1) + ' dB';
});

document.getElementById('compThreshold')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (compressor) compressor.threshold.value = val;
    const display = document.getElementById('compThresholdValue');
    if (display) display.textContent = val + ' dB';
});

document.getElementById('compRatio')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (compressor) compressor.ratio.value = val;
    const display = document.getElementById('compRatioValue');
    if (display) display.textContent = val.toFixed(1) + ':1';
});

document.getElementById('compAttack')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (compressor) compressor.attack.value = val;
    const display = document.getElementById('compAttackValue');
    if (display) display.textContent = (val * 1000).toFixed(0) + ' ms';
});

document.getElementById('compRelease')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (compressor) compressor.release.value = val;
    const display = document.getElementById('compReleaseValue');
    if (display) display.textContent = (val * 1000).toFixed(0) + ' ms';
});

document.getElementById('reverbDecay')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (reverb) reverb.decay = val;
    const display = document.getElementById('reverbDecayValue');
    if (display) display.textContent = val.toFixed(1) + ' s';
});

document.getElementById('reverbWet')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    if (reverb) reverb.wet.value = val;
    const display = document.getElementById('reverbWetValue');
    if (display) display.textContent = (val * 100).toFixed(0) + '%';
});

document.getElementById('echoDelay')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 1000;
    if (feedbackDelay) feedbackDelay.delayTime.value = val;
    const display = document.getElementById('echoDelayValue');
    if (display) display.textContent = (val * 1000).toFixed(0) + ' ms';
});

document.getElementById('echoFeedback')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    if (feedbackDelay) feedbackDelay.feedback.value = val;
    const display = document.getElementById('echoFeedbackValue');
    if (display) display.textContent = (val * 100).toFixed(0) + '%';
});

document.getElementById('echoWet')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    if (feedbackDelay) feedbackDelay.wet.value = val;
    const display = document.getElementById('echoWetValue');
    if (display) display.textContent = (val * 100).toFixed(0) + '%';
});

document.getElementById('pitchShift')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (pitchShift) pitchShift.pitch = val;
    const display = document.getElementById('pitchShiftValue');
    if (display) display.textContent = val.toFixed(1) + ' semitones';
});

document.getElementById('masterVolume')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    if (masterGain) masterGain.gain.value = val;
    const display = document.getElementById('masterVolumeValue');
    if (display) display.textContent = (val * 100).toFixed(0) + '%';
});

document.getElementById('instVolume')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    if (instGain) instGain.gain.value = val;
    const display = document.getElementById('instVolumeValue');
    if (display) display.textContent = (val * 100).toFixed(0) + '%';
});

// Pitch Detection
document.getElementById('detectPitchBtn')?.addEventListener('click', async () => {
    if (!voiceBuffer) {
        alert('Please record audio first');
        return;
    }
    
    const pitch = await detectPitch(voiceBuffer);
    const display = document.getElementById('detectedPitch');
    if (display) display.textContent = pitch;
});

async function detectPitch(buffer) {
    // Simple pitch detection using autocorrelation
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    
    // Analyze first second of audio
    const samplesPerAnalysis = Math.min(sampleRate, channelData.length);
    const subset = channelData.slice(0, samplesPerAnalysis);
    
    // Find fundamental frequency using autocorrelation
    let maxCorr = 0;
    let bestOffset = 0;
    
    const minFreq = 80; // Hz
    const maxFreq = 400; // Hz
    const minOffset = Math.floor(sampleRate / maxFreq);
    const maxOffset = Math.floor(sampleRate / minFreq);
    
    for (let offset = minOffset; offset < maxOffset; offset++) {
        let corr = 0;
        for (let i = 0; i < samplesPerAnalysis - offset; i++) {
            corr += Math.abs(subset[i] - subset[i + offset]);
        }
        corr = 1 - (corr / samplesPerAnalysis);
        
        if (corr > maxCorr) {
            maxCorr = corr;
            bestOffset = offset;
        }
    }
    
    const frequency = sampleRate / bestOffset;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const A4 = 440;
    const noteNum = 12 * Math.log2(frequency / A4) + 69;
    const noteIndex = Math.round(noteNum) % 12;
    const octave = Math.floor(Math.round(noteNum) / 12) - 1;
    
    return `${noteNames[noteIndex]}${octave} (${frequency.toFixed(1)} Hz)`;
}

// Advanced Autotune Implementation
async function applyAutotune(buffer, intensity) {
    console.log('Applying autotune with intensity:', intensity);
    
    const sampleRate = buffer.sampleRate;
    const channelData = buffer.getChannelData(0);
    const length = channelData.length;
    
    // Create new buffer for processed audio
    const processedBuffer = audioContext.createBuffer(
        buffer.numberOfChannels,
        length,
        sampleRate
    );
    
    const outputData = processedBuffer.getChannelData(0);
    
    // Autotune parameters based on intensity
    const correctionStrength = intensity / 100;
    const windowSize = 4096; // Larger window for better pitch detection
    const hopSize = Math.floor(windowSize / 4);
    
    // Extended chromatic scale (C3 to C5)
    const noteFreqs = [
        130.81, 138.59, 146.83, 155.56, 164.81, 174.61, 185.00, 196.00,
        207.65, 220.00, 233.08, 246.94, // C3 to B3
        261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.00,
        415.30, 440.00, 466.16, 493.88, // C4 to B4
        523.25, 554.37, 587.33, 622.25, 659.25, 698.46, 739.99, 783.99 // C5 to G5
    ];
    
    // Initialize output with silence
    for (let i = 0; i < length; i++) {
        outputData[i] = 0;
    }
    
    // Process audio in overlapping windows
    for (let i = 0; i < length - windowSize; i += hopSize) {
        const windowEnd = Math.min(i + windowSize, length);
        const window = new Float32Array(windowSize);
        
        // Copy window and apply Hann window for better results
        for (let j = 0; j < windowSize && i + j < length; j++) {
            const hannValue = 0.5 * (1 - Math.cos(2 * Math.PI * j / windowSize));
            window[j] = channelData[i + j] * hannValue;
        }
        
        // Detect pitch using improved autocorrelation
        const detectedFreq = detectFrequency(window, sampleRate);
        
        if (detectedFreq > 50 && detectedFreq < 1000) { // Valid vocal range
            // Find nearest note
            const nearestNote = findNearestNote(detectedFreq, noteFreqs);
            
            // Calculate pitch shift needed (in cents)
            const centsOff = 1200 * Math.log2(nearestNote / detectedFreq);
            
            // Apply correction based on intensity
            const correctionCents = centsOff * correctionStrength;
            const pitchRatio = Math.pow(2, correctionCents / 1200);
            
            // Apply pitch shift to window using phase vocoder technique
            const shifted = pitchShiftWindow(window, pitchRatio, intensity);
            
            // Overlap-add with crossfade
            for (let j = 0; j < shifted.length && i + j < length; j++) {
                // Triangular window for overlap-add
                const weight = Math.min(
                    j / (hopSize / 2),
                    (shifted.length - j) / (hopSize / 2),
                    1.0
                );
                
                outputData[i + j] += shifted[j] * weight;
            }
        } else {
            // No valid pitch detected, copy original with window
            for (let j = 0; j < windowSize && i + j < length; j++) {
                const weight = Math.min(
                    j / (hopSize / 2),
                    (windowSize - j) / (hopSize / 2),
                    1.0
                );
                outputData[i + j] += channelData[i + j] * weight * 0.5;
            }
        }
    }
    
    // Normalize output to prevent clipping
    let maxVal = 0;
    for (let i = 0; i < length; i++) {
        maxVal = Math.max(maxVal, Math.abs(outputData[i]));
    }
    
    if (maxVal > 0.95) {
        const normFactor = 0.95 / maxVal;
        for (let i = 0; i < length; i++) {
            outputData[i] *= normFactor;
        }
    }
    
    // Copy other channels if stereo
    for (let ch = 1; ch < buffer.numberOfChannels; ch++) {
        const input = buffer.getChannelData(ch);
        const output = processedBuffer.getChannelData(ch);
        output.set(input);
    }
    
    console.log('Autotune processing complete');
    return processedBuffer;
}

// Detect frequency using autocorrelation
function detectFrequency(buffer, sampleRate) {
    const SIZE = buffer.length;
    const MAX_SAMPLES = Math.floor(SIZE / 2);
    let best_offset = -1;
    let best_correlation = 0;
    let rms = 0;
    
    // Calculate RMS
    for (let i = 0; i < SIZE; i++) {
        const val = buffer[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    
    // Not enough signal
    if (rms < 0.005) return -1;
    
    // Autocorrelation with improved algorithm
    const correlations = new Float32Array(MAX_SAMPLES);
    
    for (let offset = 1; offset < MAX_SAMPLES; offset++) {
        let correlation = 0;
        let sum = 0;
        
        for (let i = 0; i < MAX_SAMPLES; i++) {
            const val1 = buffer[i] || 0;
            const val2 = buffer[i + offset] || 0;
            correlation += val1 * val2;
            sum += val1 * val1;
        }
        
        // Normalized correlation
        correlations[offset] = sum > 0 ? correlation / sum : 0;
    }
    
    // Find peaks in correlation function
    const minPeriod = Math.floor(sampleRate / 500); // Max 500 Hz
    const maxPeriod = Math.floor(sampleRate / 80);  // Min 80 Hz
    
    for (let offset = minPeriod; offset < Math.min(maxPeriod, MAX_SAMPLES - 1); offset++) {
        const corr = correlations[offset];
        
        // Look for local maximum
        if (corr > correlations[offset - 1] && 
            corr > correlations[offset + 1] && 
            corr > best_correlation && 
            corr > 0.7) { // Higher threshold for better accuracy
            best_correlation = corr;
            best_offset = offset;
        }
    }
    
    if (best_correlation > 0.7 && best_offset > -1) {
        // Parabolic interpolation for sub-sample accuracy
        const y1 = correlations[best_offset - 1];
        const y2 = correlations[best_offset];
        const y3 = correlations[best_offset + 1];
        
        const delta = 0.5 * (y3 - y1) / (2 * y2 - y1 - y3);
        const interpolated_offset = best_offset + delta;
        
        const fundamental_frequency = sampleRate / interpolated_offset;
        return fundamental_frequency;
    }
    
    return -1;
}

// Find nearest musical note
function findNearestNote(frequency, noteFreqs) {
    let nearest = noteFreqs[0];
    let minDiff = Math.abs(frequency - nearest);
    
    for (const noteFreq of noteFreqs) {
        const diff = Math.abs(frequency - noteFreq);
        if (diff < minDiff) {
            minDiff = diff;
            nearest = noteFreq;
        }
    }
    
    return nearest;
}

// Pitch shift a window of audio
function pitchShiftWindow(window, ratio, intensity) {
    const inputLength = window.length;
    const outputLength = inputLength;
    const output = new Float32Array(outputLength);
    
    // Use higher quality resampling
    for (let i = 0; i < outputLength; i++) {
        const sourceIndex = i * ratio;
        const index1 = Math.floor(sourceIndex);
        const index2 = Math.min(index1 + 1, inputLength - 1);
        const index0 = Math.max(index1 - 1, 0);
        const index3 = Math.min(index1 + 2, inputLength - 1);
        const fraction = sourceIndex - index1;
        
        if (index1 < inputLength) {
            // Cubic interpolation for smoother results
            const y0 = window[index0] || 0;
            const y1 = window[index1] || 0;
            const y2 = window[index2] || 0;
            const y3 = window[index3] || 0;
            
            const c0 = y1;
            const c1 = 0.5 * (y2 - y0);
            const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
            const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
            
            output[i] = c0 + c1 * fraction + c2 * fraction * fraction + c3 * fraction * fraction * fraction;
            
            // Preserve formants for natural sound (reduce "chipmunk" effect)
            if (intensity < 75) {
                const formantPreservation = 1 - (intensity / 100) * 0.3;
                output[i] *= formantPreservation;
            }
        }
    }
    
    return output;
}

// Autotune Intensity Control
document.getElementById('autotuneIntensity')?.addEventListener('input', (e) => {
    autotuneIntensity = parseFloat(e.target.value);
    const container = e.target.closest('.autotune-intensity');
    if (container) {
        container.setAttribute('data-intensity', autotuneIntensity + '%');
    }
    
    // Update intensity indicators
    const indicators = document.querySelectorAll('.intensity-indicator span');
    indicators.forEach(ind => ind.classList.remove('active'));
    
    if (autotuneIntensity < 25) {
        document.getElementById('subtle')?.classList.add('active');
    } else if (autotuneIntensity < 50) {
        document.getElementById('moderate')?.classList.add('active');
    } else if (autotuneIntensity < 75) {
        document.getElementById('intense')?.classList.add('active');
    } else {
        document.getElementById('extreme')?.classList.add('active');
    }
});

// Formant Preservation Control
document.getElementById('formantPreserve')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    const display = document.getElementById('formantPreserveValue');
    if (display) display.textContent = val + '%';
});

// Waveform Visualization
function drawWaveform(buffer) {
    const canvas = document.getElementById('waveform');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;
    
    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < width; i++) {
        const min = Math.min(...data.slice(i * step, (i + 1) * step));
        const max = Math.max(...data.slice(i * step, (i + 1) * step));
        
        ctx.moveTo(i, (1 + min) * amp);
        ctx.lineTo(i, (1 + max) * amp);
    }
    
    ctx.stroke();
}

// Timer Functions
function updateTimer() {
    if (isRecording) {
        const elapsed = Date.now() - startTime;
        const display = document.getElementById('currentTime');
        if (display) display.textContent = formatTime(elapsed / 1000);
        setTimeout(updateTimer, 100);
    }
}

function updatePlaybackTimer(duration) {
    const elapsed = (Date.now() - startTime) / 1000;
    
    if (elapsed >= duration) {
        pauseAudio();
        const display = document.getElementById('currentTime');
        if (display) display.textContent = formatTime(duration);
        return;
    }
    
    const currentTimeDisplay = document.getElementById('currentTime');
    const durationDisplay = document.getElementById('duration');
    
    if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(elapsed);
    if (durationDisplay) durationDisplay.textContent = formatTime(duration);
    
    animationId = requestAnimationFrame(() => updatePlaybackTimer(duration));
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Export Mixed Audio
document.getElementById('exportBtn')?.addEventListener('click', async () => {
    if (!voiceBuffer && !instrumentalBuffer) {
        alert('No audio to export');
        return;
    }
    
    try {
        // Create offline context for rendering
        const duration = Math.max(
            voiceBuffer ? voiceBuffer.duration : 0,
            instrumentalBuffer ? instrumentalBuffer.duration : 0
        );
        
        const offlineCtx = new OfflineAudioContext(2, duration * 48000, 48000);
        
        // Recreate effects chain in offline context
        const offlineEq = new Tone.EQ3(eq3.get()).connect(offlineCtx.destination);
        const offlineComp = new Tone.Compressor(compressor.get());
        const offlineReverb = new Tone.Reverb({ decay: reverb.decay, wet: reverb.wet.value });
        const offlineDelay = new Tone.FeedbackDelay({
            delayTime: feedbackDelay.delayTime.value,
            feedback: feedbackDelay.feedback.value,
            wet: feedbackDelay.wet.value
        });
        const offlinePitch = new Tone.PitchShift({ pitch: pitchShift.pitch });
        const offlineVoiceGain = new Tone.Gain(voiceGain.gain.value);
        const offlineInstGain = new Tone.Gain(instGain.gain.value);
        const offlineMaster = new Tone.Gain(masterGain.gain.value);
        
        // Connect chain
        offlineEq.connect(offlineComp);
        offlineComp.connect(offlineReverb);
        offlineReverb.connect(offlineDelay);
        offlineDelay.connect(offlinePitch);
        offlinePitch.connect(offlineVoiceGain);
        offlineVoiceGain.connect(offlineMaster);
        offlineInstGain.connect(offlineMaster);
        offlineMaster.connect(offlineCtx.destination);
        
        // Create players
        if (voiceBuffer) {
            const vPlayer = new Tone.Player(voiceBuffer);
            vPlayer.connect(offlineEq);
            vPlayer.start(0);
        }
        
        if (instrumentalBuffer) {
            const iPlayer = new Tone.Player(instrumentalBuffer);
            iPlayer.connect(offlineInstGain);
            iPlayer.start(0);
        }
        
        // Render and download
        const renderedBuffer = await offlineCtx.startRendering();
        const wav = audioBufferToWav(renderedBuffer);
        const blob = new Blob([wav], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `voice-studio-mix-${Date.now()}.wav`;
        a.click();
        
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting audio:', error);
        alert('Error exporting audio. Please try again.');
    }
});

// Convert AudioBuffer to WAV
function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const data = [];
    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
            const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
            data.push(sample < 0 ? sample * 0x8000 : sample * 0x7FFF);
        }
    }
    
    const dataSize = data.length * bytesPerSample;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < data.length; i++) {
        view.setInt16(offset, data[i], true);
        offset += 2;
    }
    
    return arrayBuffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Update UI State
function updateUI() {
    const hasDuration = voiceBuffer || instrumentalBuffer || audioTrackBuffer;
    if (hasDuration) {
        const duration = Math.max(
            voiceBuffer ? voiceBuffer.duration : 0,
            instrumentalBuffer ? instrumentalBuffer.duration : 0,
            audioTrackBuffer ? audioTrackBuffer.duration : 0
        );
        const durationDisplay = document.getElementById('duration');
        if (durationDisplay) durationDisplay.textContent = formatTime(duration);
    }
    
    // Enable play button if any audio is loaded
    const playBtn = document.getElementById('playBtn');
    if (playBtn && hasDuration) {
        playBtn.disabled = false;
    }
}

// Button Event Listeners
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');

if (recordBtn) {
    recordBtn.addEventListener('click', startRecording);
}

if (stopBtn) {
    stopBtn.addEventListener('click', stopRecording);
}

if (playBtn) {
    playBtn.addEventListener('click', playAudio);
}

if (pauseBtn) {
    pauseBtn.addEventListener('click', pauseAudio);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Voice Studio Pro initialized');
    initAudio();
    
    // Effects toggle for recording - DEFAULT IS OFF
    const effectsToggle = document.getElementById('effectsToggle');
    if (effectsToggle) {
        // Ensure it starts unchecked
        effectsToggle.checked = false;
        applyEffectsOnRecording = false;
        
        effectsToggle.addEventListener('change', (e) => {
            applyEffectsOnRecording = e.target.checked;
            console.log('Recording effects:', applyEffectsOnRecording ? 'ENABLED ✅' : 'DISABLED ❌');
            
            // Visual feedback on effects panel
            const effectsSection = document.querySelector('.effects-panel');
            if (effectsSection) {
                if (applyEffectsOnRecording) {
                    effectsSection.style.opacity = '1';
                    effectsSection.style.pointerEvents = 'auto';
                } else {
                    effectsSection.style.opacity = '0.5';
                    effectsSection.style.pointerEvents = 'none';
                }
            }
            
            // Update status indicator
            const statusText = document.getElementById('effectsStatus');
            if (statusText) {
                if (applyEffectsOnRecording) {
                    statusText.innerHTML = '🟢 Effects will be applied to recording';
                    statusText.style.color = '#4ecdc4';
                } else {
                    statusText.innerHTML = '🔴 Recording clean/raw voice (no effects)';
                    statusText.style.color = '#ff6b6b';
                }
            }
        });
        
        // Trigger initial state
        const effectsSection = document.querySelector('.effects-panel');
        if (effectsSection) {
            effectsSection.style.opacity = '0.5';
            effectsSection.style.pointerEvents = 'none';
        }
    }
});