// ===============================================
// INITIALIZE ON LOAD
// ===============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('Voice Studio Pro - BandLab Style initialized');
    
    updateLoadingProgress();
    
    createContextMenu();
    
    setTimeout(() => {
        initAudio();
        generateTimelineRuler();
        setupDragAndDrop();
        
        const timelineTracks = document.querySelector('.timeline-tracks');
        if (timelineTracks && !timelineTracks.querySelector('.timeline-track')) {
            const placeholderTrack = document.createElement('div');
            placeholderTrack.className = 'timeline-track';
            placeholderTrack.innerHTML = '<div class="track-placeholder" style="text-align: center; padding: 40px; color: #666; font-size: 16px;">🎙️ Press Record to start or drag audio files here</div>';
            timelineTracks.appendChild(placeholderTrack);
        }
        
        const effectsPanel = document.querySelector('.right-sidebar');
        if (effectsPanel) {
            effectsPanel.style.opacity = '0.6';
        }
        
        console.log('Studio ready! 🎵');
        console.log('Keyboard shortcuts:');
        console.log('  SPACE - Play/Pause');
        console.log('  R - Record');
        console.log('  S - Stop');
        console.log('  DELETE - Delete selected track');
        console.log('  RIGHT-CLICK on waveform - Show context menu');
    }, 100);
});

// ===============================================
// RECORDING FUNCTIONS
// ===============================================
let recordingAudioContext = null;
let recordingMicStream = null;
let playbackSources = [];

async function startRecording() {
    console.log('Starting HIGH QUALITY recording...');
    
    if (!audioContext) {
        await initAudio();
    }
    
    if (isPlaying) {
        pauseAudio();
    }
    
    try {
        // Request HIGH QUALITY microphone input
        recordingMicStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false, // Disable for better quality
                noiseSuppression: false, // Disable for better quality
                autoGainControl: false,
                sampleRate: 48000,
                sampleSize: 24, // Higher bit depth
                channelCount: 2, // Stereo
                latency: 0,
                volume: 1.0
            } 
        });
        
        console.log('✅ HIGH QUALITY Microphone access granted');
        
        // Create high-quality recording context
        recordingAudioContext = new (window.AudioContext || window.webkitAudioContext)({ 
            sampleRate: 48000,
            latencyHint: 'playback' // Better quality than 'interactive'
        });
        
        const recordingDestination = recordingAudioContext.createMediaStreamDestination();
        
        const monitorGain = recordingAudioContext.createGain();
        monitorGain.gain.value = 1.0;
        monitorGain.connect(recordingAudioContext.destination);
        
        const micSource = recordingAudioContext.createMediaStreamSource(recordingMicStream);
        const micGain = recordingAudioContext.createGain();
        micGain.gain.value = 1.8; // Boost microphone level
        
        // Add a compressor for better dynamic range
        const micCompressor = recordingAudioContext.createDynamicsCompressor();
        micCompressor.threshold.value = -30;
        micCompressor.knee.value = 10;
        micCompressor.ratio.value = 8;
        micCompressor.attack.value = 0.003;
        micCompressor.release.value = 0.25;
        
        micSource.connect(micGain);
        micGain.connect(micCompressor);
        micCompressor.connect(recordingDestination);
        micCompressor.connect(monitorGain);
        
        playbackSources = [];
        
        // Play ALL tracks (including imported/local files) during recording
        tracks.forEach(track => {
            if (track.buffer && !track.muted) {
                const trackSource = recordingAudioContext.createBufferSource();
                trackSource.buffer = track.buffer;
                const trackGain = recordingAudioContext.createGain();
                trackGain.gain.value = (track.volume / 100) * 0.7;
                
                trackSource.connect(trackGain);
                trackGain.connect(recordingDestination);
                trackGain.connect(monitorGain);
                
                trackSource.start(0);
                playbackSources.push(trackSource);
                console.log('Playing track during recording:', track.name, '(Type:', track.type + ')');
            }
        });
        
        if (playbackSources.length > 0) {
            console.log(`✅ Recording with ${playbackSources.length} backing track(s)`);
        } else {
            console.log('📢 Recording voice only (no backing tracks)');
        }
        
        const mixedStream = recordingDestination.stream;
        
        // Use highest quality codec available
        let mimeType = 'audio/webm;codecs=opus';
        let audioBitsPerSecond = 510000; // Very high bitrate (510kbps)
        
        // Try different codecs for best quality
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
            mimeType = 'audio/webm;codecs=pcm'; // Lossless
            audioBitsPerSecond = 1536000; // Maximum quality
            console.log('🎤 Using PCM codec (Lossless)');
        } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
            audioBitsPerSecond = 510000;
            console.log('🎤 Using Opus codec (510kbps - Very High Quality)');
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
            mimeType = 'audio/ogg;codecs=opus';
            audioBitsPerSecond = 510000;
            console.log('🎤 Using OGG Opus codec (510kbps)');
        } else {
            mimeType = 'audio/webm';
            audioBitsPerSecond = 510000;
            console.log('🎤 Using WebM default codec (510kbps)');
        }
        
        mediaRecorder = new MediaRecorder(mixedStream, {
            mimeType: mimeType,
            audioBitsPerSecond: audioBitsPerSecond,
            bitsPerSecond: audioBitsPerSecond
        });
        
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            console.log('Recording stopped, processing HIGH QUALITY audio...');
            
            playbackSources.forEach(source => {
                try {
                    source.stop();
                } catch (e) {
                    console.log('Source already stopped');
                }
            });
            playbackSources = [];
            
            if (recordingMicStream) {
                recordingMicStream.getTracks().forEach(track => track.stop());
                recordingMicStream = null;
            }
            
            if (recordingAudioContext) {
                await recordingAudioContext.close();
                recordingAudioContext = null;
            }
            
            const blob = new Blob(recordedChunks, { type: mimeType });
            console.log('📊 Recording size:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
            console.log('📊 Quality:', audioBitsPerSecond / 1000, 'kbps');
            
            try {
                const arrayBuffer = await blob.arrayBuffer();
                let decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
                console.log('✅ Audio decoded successfully');
                console.log('📊 Duration:', decodedBuffer.duration.toFixed(2), 'seconds');
                console.log('📊 Sample Rate:', decodedBuffer.sampleRate, 'Hz');
                console.log('📊 Channels:', decodedBuffer.numberOfChannels);
                
                if (applyEffectsOnRecording && autotuneIntensity > 0) {
                    console.log('Applying autotune with intensity:', autotuneIntensity);
                    decodedBuffer = await applyAutotune(decodedBuffer, autotuneIntensity);
                    console.log('Autotune applied successfully');
                }
                
                addTrackToTimeline('Voice Recording ' + new Date().toLocaleTimeString(), decodedBuffer, 'recording');
                
                console.log('✅ HIGH QUALITY Recording processed successfully');
                
            } catch (err) {
                console.error('Error processing recorded audio:', err);
                alert('Error processing audio: ' + err.message);
            }
        };
        
        mediaRecorder.onerror = (e) => {
            console.error('MediaRecorder error:', e);
            alert('Recording error occurred');
        };
        
        mediaRecorder.start(100);
        isRecording = true;
        startTime = Date.now();
        
        const recordBtn = document.querySelector('.record-btn');
        if (recordBtn) recordBtn.classList.add('recording');
        
        const stopBtn = document.querySelector('.stop-btn');
        if (stopBtn) stopBtn.disabled = false;
        
        updateTimer();
        
        console.log('🎙️ HIGH QUALITY Recording started successfully');
        
    } catch (err) {
        console.error('Error starting recording:', err);
        alert('Could not start recording. Please check microphone permissions.');
        
        if (recordingMicStream) {
            recordingMicStream.getTracks().forEach(track => track.stop());
        }
        if (recordingAudioContext) {
            recordingAudioContext.close();
        }
    }
}

function stopRecording() {
    console.log('Stopping recording...');
    
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        const recordBtn = document.querySelector('.record-btn');
        if (recordBtn) recordBtn.classList.remove('recording');
        
        const stopBtn = document.querySelector('.stop-btn');
        if (stopBtn) stopBtn.disabled = true;
        
        console.log('Recording stopped');
    }
}

// ===============================================
// PLAYBACK FUNCTIONS
// ===============================================
async function playAudio() {
    console.log('Playing audio...');
    
    if (isRecording) {
        console.log('Cannot play during recording');
        return;
    }
    
    const playableTracks = tracks.filter(t => t.buffer && !t.muted);
    
    if (playableTracks.length === 0) {
        console.log('No audio to play');
        alert('No audio to play. Please record or import audio first.');
        return;
    }
    
    if (isPlaying) {
        console.log('Already playing');
        return;
    }
    
    if (!audioContext) await initAudio();
    
    isPlaying = true;
    playingTracks = [];
    const currentTime = Tone.now();
    
    try {
        let maxDuration = 0;
        
        playableTracks.forEach(track => {
            const player = new Tone.Player(track.buffer);
            const gainNode = new Tone.Gain((track.volume / 100) * 0.8);
            
            if (track.type === 'recording' && applyEffectsOnRecording) {
                player.connect(eq3);
            } else {
                player.connect(gainNode);
                gainNode.connect(masterGain);
            }
            
            player.start(currentTime);
            playingTracks.push({ player, gainNode, track });
            
            if (track.buffer.duration > maxDuration) {
                maxDuration = track.buffer.duration;
            }
            
            console.log('Playing track:', track.name);
        });
        
        const playBtn = document.querySelector('.play-btn');
        if (playBtn) playBtn.style.background = '#5ed9cf';
        
        const stopBtn = document.querySelector('.stop-btn');
        if (stopBtn) stopBtn.disabled = false;
        
        startTime = Date.now();
        updatePlaybackTimer(maxDuration);
        
        console.log('Playback started, duration:', maxDuration);
        
    } catch (error) {
        console.error('Error playing audio:', error);
        isPlaying = false;
        alert('Error playing audio: ' + error.message);
    }
}

function pauseAudio() {
    console.log('Stopping/Pausing audio...');
    
    playingTracks.forEach(({ player, gainNode }) => {
        try {
            player.stop();
            player.dispose();
            gainNode.dispose();
        } catch (e) {
            console.log('Player already stopped');
        }
    });
    
    playingTracks = [];
    isPlaying = false;
    
    const playBtn = document.querySelector('.play-btn');
    if (playBtn) playBtn.style.background = '#4ecdc4';
    
    const stopBtn = document.querySelector('.stop-btn');
    if (stopBtn) stopBtn.disabled = true;
    
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    const timeDisplay = document.querySelector('.time-display');
    if (timeDisplay) timeDisplay.textContent = '00:00:00';
    
    console.log('Playback stopped');
}

// ===============================================
// FILE LOADING
// ===============================================
const audioFileInput = document.querySelector('.import-btn');
if (audioFileInput) {
    audioFileInput.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.multiple = true;
        input.onchange = async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            
            if (!audioContext) await initAudio();
            
            for (let file of files) {
                try {
                    console.log('Loading audio file:', file.name);
                    const arrayBuffer = await file.arrayBuffer();
                    const buffer = await audioContext.decodeAudioData(arrayBuffer);
                    
                    addTrackToTimeline(file.name, buffer, 'imported');
                } catch (error) {
                    console.error('Error loading audio:', error);
                    alert('Error loading ' + file.name + '. Please try a different format.');
                }
            }
        };
        input.click();
    });
}

// ===============================================
// TRACK MANAGEMENT
// ===============================================
function addTrackToTimeline(name, buffer, type = 'imported') {
    const trackId = 'track_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const track = {
        id: trackId,
        name: name,
        buffer: buffer,
        volume: 100,
        muted: false,
        solo: false,
        type: type
    };
    
    tracks.push(track);
    
    const tracksList = document.querySelector('.tracks-list');
    if (!tracksList) return;
    
    const trackIcon = type === 'recording' ? '🎤' : '🎵';
    
    const trackItem = document.createElement('div');
    trackItem.className = 'track-item';
    trackItem.dataset.trackId = trackId;
    trackItem.innerHTML = `
        <div class="track-header">
            <span class="track-icon">${trackIcon}</span>
            <span class="track-name">${name.substring(0, 20)}${name.length > 20 ? '...' : ''}</span>
            <button class="track-menu-btn">⋮</button>
        </div>
        <div class="track-controls">
            <button class="track-control-btn" data-action="mute">M</button>
            <button class="track-control-btn" data-action="solo">S</button>
            <input type="range" class="track-volume" min="0" max="100" value="100">
            <span class="volume-value">100%</span>
        </div>
    `;
    
    tracksList.appendChild(trackItem);
    
    const volumeSlider = trackItem.querySelector('.track-volume');
    const volumeValue = trackItem.querySelector('.volume-value');
    
    volumeSlider.addEventListener('input', (e) => {
        const vol = e.target.value;
        volumeValue.textContent = vol + '%';
        track.volume = vol;
    });
    
    const muteBtn = trackItem.querySelector('[data-action="mute"]');
    muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        track.muted = !track.muted;
        muteBtn.classList.toggle('active', track.muted);
    });
    
    const soloBtn = trackItem.querySelector('[data-action="solo"]');
    soloBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        track.solo = !track.solo;
        soloBtn.classList.toggle('active', track.solo);
    });
    
    drawTimelineWaveform(buffer, name, trackId);
    
    console.log('Track added to timeline:', name);
}

// ===============================================
// WAVEFORM DRAWING WITH INTERACTION
// ===============================================
function drawTimelineWaveform(buffer, trackName, trackId) {
    const timelineTracks = document.querySelector('.timeline-tracks');
    if (!timelineTracks) return;
    
    const placeholder = timelineTracks.querySelector('.track-placeholder');
    if (placeholder && placeholder.parentElement) {
        placeholder.parentElement.removeChild(placeholder);
    }
    
    const timelineTrack = document.createElement('div');
    timelineTrack.className = 'timeline-track';
    timelineTrack.dataset.trackId = trackId;
    timelineTrack.style.position = 'relative';
    timelineTrack.style.cursor = 'pointer';
    
    const canvas = document.createElement('canvas');
    canvas.className = 'track-canvas';
    
    const pixelsPerSecond = 50;
    const canvasWidth = Math.max(2000, buffer.duration * pixelsPerSecond);
    canvas.width = canvasWidth;
    canvas.height = 120;
    
    const ctx = canvas.getContext('2d');
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;
    
    ctx.fillStyle = '#252525';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    for (let i = 0; i < canvas.width; i++) {
        const min = Math.min(...data.slice(i * step, (i + 1) * step));
        const max = Math.max(...data.slice(i * step, (i + 1) * step));
        
        ctx.moveTo(i, (1 + min) * amp);
        ctx.lineTo(i, (1 + max) * amp);
    }
    
    ctx.stroke();
    
    const trackLabel = document.createElement('div');
    trackLabel.style.cssText = `
        position: absolute;
        top: 8px;
        left: 8px;
        background: rgba(0, 0, 0, 0.7);
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        color: #4ecdc4;
        font-weight: 600;
        pointer-events: none;
    `;
    trackLabel.textContent = trackName;
    
    timelineTrack.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Right-clicked on track:', trackId);
        showContextMenu(e.clientX, e.clientY, trackId, e.offsetX);
    });
    
    timelineTrack.addEventListener('click', (e) => {
        if (e.button === 2) return;
        
        console.log('Selected track:', trackId);
        document.querySelectorAll('.timeline-track').forEach(t => {
            t.style.outline = 'none';
        });
        timelineTrack.style.outline = '2px solid #4ecdc4';
        
        const sidebarTrack = document.querySelector(`.track-item[data-track-id="${trackId}"]`);
        if (sidebarTrack) {
            document.querySelectorAll('.track-item').forEach(t => t.classList.remove('active'));
            sidebarTrack.classList.add('active');
        }
    });
    
    timelineTrack.appendChild(canvas);
    timelineTrack.appendChild(trackLabel);
    timelineTracks.appendChild(timelineTrack);
    
    console.log('Waveform drawn in timeline:', trackName);
}

// ===============================================
// CONTEXT MENU
// ===============================================
let contextMenuTrackId = null;
let contextMenuPosition = 0;

function createContextMenu() {
    const existingMenu = document.getElementById('contextMenu');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    const menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.style.cssText = `
        position: fixed;
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        padding: 8px 0;
        min-width: 180px;
        z-index: 10000;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    const menuItems = [
        { icon: '🗑️', text: 'Delete Track', action: 'delete' },
        { icon: '✂️', text: 'Slice at Position', action: 'slice' },
        { icon: '📉', text: 'Add Fade', action: 'fade' }
    ];
    
    menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        menuItem.dataset.action = item.action;
        menuItem.innerHTML = `${item.icon} ${item.text}`;
        menuItem.style.cssText = `
            padding: 10px 16px;
            cursor: pointer;
            color: #e0e0e0;
            font-size: 14px;
            transition: background 0.2s;
        `;
        
        menuItem.addEventListener('mouseenter', () => {
            menuItem.style.background = '#3a3a3a';
        });
        
        menuItem.addEventListener('mouseleave', () => {
            menuItem.style.background = 'transparent';
        });
        
        menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = menuItem.dataset.action;
            
            if (!contextMenuTrackId) {
                closeContextMenu();
                return;
            }
            
            console.log('Context menu action:', action, 'for track:', contextMenuTrackId);
            
            switch (action) {
                case 'delete':
                    deleteTrack(contextMenuTrackId);
                    break;
                case 'slice':
                    sliceTrack(contextMenuTrackId, contextMenuPosition);
                    break;
                case 'fade':
                    addFadeToTrack(contextMenuTrackId);
                    break;
            }
            
            closeContextMenu();
        });
        
        menu.appendChild(menuItem);
    });
    
    document.body.appendChild(menu);
    return menu;
}

function showContextMenu(x, y, trackId, position) {
    console.log('Showing context menu for track:', trackId);
    
    let menu = document.getElementById('contextMenu');
    if (!menu) {
        menu = createContextMenu();
    }
    
    contextMenuTrackId = trackId;
    contextMenuPosition = position;
    
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.display = 'block';
    
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu);
        document.addEventListener('contextmenu', closeContextMenu);
    }, 10);
}

function closeContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) {
        menu.style.display = 'none';
    }
    contextMenuTrackId = null;
    document.removeEventListener('click', closeContextMenu);
    document.removeEventListener('contextmenu', closeContextMenu);
}

function deleteTrack(trackId) {
    console.log('Attempting to delete track:', trackId);
    
    const trackIndex = tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) {
        console.log('Track not found in array');
        return;
    }
    
    const trackName = tracks[trackIndex].name;
    tracks.splice(trackIndex, 1);
    console.log('Track removed from array:', trackName);
    
    const sidebarTrack = document.querySelector(`.track-item[data-track-id="${trackId}"]`);
    if (sidebarTrack) {
        sidebarTrack.remove();
        console.log('Track removed from sidebar');
    }
    
    const timelineTrack = document.querySelector(`.timeline-track[data-track-id="${trackId}"]`);
    if (timelineTrack) {
        timelineTrack.remove();
        console.log('Track removed from timeline');
    }
    
    console.log('✅ Track deleted successfully:', trackName);
    
    if (tracks.length === 0) {
        const timelineTracks = document.querySelector('.timeline-tracks');
        if (timelineTracks && !timelineTracks.querySelector('.track-placeholder')) {
            const placeholderTrack = document.createElement('div');
            placeholderTrack.className = 'timeline-track';
            placeholderTrack.innerHTML = '<div class="track-placeholder" style="text-align: center; padding: 40px; color: #666; font-size: 16px;">🎙️ Press Record to start or drag audio files here</div>';
            timelineTracks.appendChild(placeholderTrack);
            console.log('Placeholder added');
        }
    }
}

function sliceTrack(trackId, position) {
    const track = tracks.find(t => t.id === trackId);
    if (!track || !track.buffer) return;
    
    const pixelsPerSecond = 50;
    const sliceTime = position / pixelsPerSecond;
    
    if (sliceTime <= 0 || sliceTime >= track.buffer.duration) {
        alert('Invalid slice position');
        return;
    }
    
    console.log('Slicing track at:', sliceTime, 'seconds');
    
    const sampleRate = track.buffer.sampleRate;
    const sliceSample = Math.floor(sliceTime * sampleRate);
    
    const buffer1Length = sliceSample;
    const buffer1 = audioContext.createBuffer(
        track.buffer.numberOfChannels,
        buffer1Length,
        sampleRate
    );
    
    const buffer2Length = track.buffer.length - sliceSample;
    const buffer2 = audioContext.createBuffer(
        track.buffer.numberOfChannels,
        buffer2Length,
        sampleRate
    );
    
    for (let channel = 0; channel < track.buffer.numberOfChannels; channel++) {
        const originalData = track.buffer.getChannelData(channel);
        const data1 = buffer1.getChannelData(channel);
        const data2 = buffer2.getChannelData(channel);
        
        for (let i = 0; i < buffer1Length; i++) {
            data1[i] = originalData[i];
        }
        
        for (let i = 0; i < buffer2Length; i++) {
            data2[i] = originalData[sliceSample + i];
        }
    }
    
    deleteTrack(trackId);
    
    addTrackToTimeline(track.name + ' (Part 1)', buffer1, track.type);
    addTrackToTimeline(track.name + ' (Part 2)', buffer2, track.type);
    
    console.log('Track sliced successfully');
}

function addFadeToTrack(trackId) {
    const track = tracks.find(t => t.id === trackId);
    if (!track || !track.buffer) return;
    
    const fadeLength = Math.min(1.0, track.buffer.duration * 0.1);
    const fadeSamples = Math.floor(fadeLength * track.buffer.sampleRate);
    
    for (let channel = 0; channel < track.buffer.numberOfChannels; channel++) {
        const data = track.buffer.getChannelData(channel);
        
        for (let i = 0; i < fadeSamples; i++) {
            data[i] *= (i / fadeSamples);
        }
        
        const startFadeOut = data.length - fadeSamples;
        for (let i = 0; i < fadeSamples; i++) {
            data[startFadeOut + i] *= (1 - (i / fadeSamples));
        }
    }
    
    const timelineTrack = document.querySelector(`.timeline-track[data-track-id="${trackId}"]`);
    if (timelineTrack) {
        timelineTrack.remove();
        drawTimelineWaveform(track.buffer, track.name, trackId);
    }
    
    console.log('Fade applied to track');
}

// ===============================================
// EFFECT CONTROLS
// ===============================================
const eqLow = document.getElementById('eqLow');
if (eqLow) {
    eqLow.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (eq3) eq3.low.value = val;
        const display = document.getElementById('eqLowValue');
        if (display) display.textContent = val.toFixed(1) + ' dB';
    });
}

const eqMid = document.getElementById('eqMid');
if (eqMid) {
    eqMid.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (eq3) eq3.mid.value = val;
        const display = document.getElementById('eqMidValue');
        if (display) display.textContent = val.toFixed(1) + ' dB';
    });
}

const eqHigh = document.getElementById('eqHigh');
if (eqHigh) {
    eqHigh.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (eq3) eq3.high.value = val;
        const display = document.getElementById('eqHighValue');
        if (display) display.textContent = val.toFixed(1) + ' dB';
    });
}

const compThreshold = document.getElementById('compThreshold');
if (compThreshold) {
    compThreshold.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (compressor) compressor.threshold.value = val;
        const display = document.getElementById('compThresholdValue');
        if (display) display.textContent = val + ' dB';
    });
}

const compRatio = document.getElementById('compRatio');
if (compRatio) {
    compRatio.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (compressor) compressor.ratio.value = val;
        const display = document.getElementById('compRatioValue');
        if (display) display.textContent = val.toFixed(1) + ':1';
    });
}

const reverbDecay = document.getElementById('reverbDecay');
if (reverbDecay) {
    reverbDecay.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (reverb) reverb.decay = val;
        const display = document.getElementById('reverbDecayValue');
        if (display) display.textContent = val.toFixed(1) + ' s';
    });
}

const reverbWet = document.getElementById('reverbWet');
if (reverbWet) {
    reverbWet.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 100;
        if (reverb) reverb.wet.value = val;
        const display = document.getElementById('reverbWetValue');
        if (display) display.textContent = (val * 100).toFixed(0) + '%';
    });
}

const pitchShiftCtrl = document.getElementById('pitchShift');
if (pitchShiftCtrl) {
    pitchShiftCtrl.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (pitchShift) pitchShift.pitch = val;
        const display = document.getElementById('pitchShiftValue');
        if (display) display.textContent = val.toFixed(1) + ' semitones';
    });
}

// ===============================================
// AUTOTUNE INTENSITY
// ===============================================
const autotuneIntensityCtrl = document.getElementById('autotuneIntensity');
if (autotuneIntensityCtrl) {
    autotuneIntensityCtrl.addEventListener('input', (e) => {
        autotuneIntensity = parseFloat(e.target.value);
        const display = document.getElementById('autotuneIntensityValue');
        if (display) display.textContent = autotuneIntensity + '%';
        
        let intensityLevel = '';
        if (autotuneIntensity === 0) intensityLevel = 'Off';
        else if (autotuneIntensity < 25) intensityLevel = 'Subtle';
        else if (autotuneIntensity < 50) intensityLevel = 'Moderate';
        else if (autotuneIntensity < 75) intensityLevel = 'Intense';
        else intensityLevel = 'Extreme';
        
        console.log('Autotune intensity:', autotuneIntensity + '%', '-', intensityLevel);
    });
}// ===============================================
// LOADING SCREEN ANIMATION
// ===============================================
let loadingProgress = 0;
const loadingScreen = document.querySelector('.loading-screen');
const loadingProgressBar = document.querySelector('.loading-progress');
const loadingPercent = document.getElementById('loadingPercent');

function updateLoadingProgress() {
    loadingProgress += Math.random() * 15;
    if (loadingProgress > 100) loadingProgress = 100;
    
    if (loadingProgressBar) loadingProgressBar.style.width = loadingProgress + '%';
    if (loadingPercent) loadingPercent.textContent = Math.floor(loadingProgress) + '%';
    
    if (loadingProgress < 100) {
        setTimeout(updateLoadingProgress, 150);
    } else {
        setTimeout(() => {
            if (loadingScreen) loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                if (loadingScreen) loadingScreen.style.display = 'none';
            }, 500);
        }, 300);
    }
}

// ===============================================
// AUDIO SYSTEM INITIALIZATION
// ===============================================
let audioContext;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let isPlaying = false;
let startTime = 0;
let animationId;
let applyEffectsOnRecording = false;
let currentTempo = 120;
let tracks = [];
let activeTrackIndex = 0;
let playingTracks = [];

// Tone.js nodes
let eq3, compressor, reverb, feedbackDelay, pitchShift;
let voiceGain, instGain, masterGain;
let voiceMeter, masterMeter;

// Autotune
let autotuneIntensity = 0;

// Sampler data
let samplerRecordings = {};
let samplerRecordingStates = {};
let activeSamplerPlayers = {};

async function initAudio() {
    try {
        await Tone.start();
        audioContext = Tone.context;
        console.log('Tone.js started, sample rate:', audioContext.sampleRate);
        
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
        
        voiceMeter = new Tone.Meter();
        masterMeter = new Tone.Meter();
        
        eq3.connect(compressor);
        compressor.connect(reverb);
        reverb.connect(feedbackDelay);
        feedbackDelay.connect(pitchShift);
        pitchShift.connect(voiceGain);
        voiceGain.connect(voiceMeter);
        voiceGain.connect(masterGain);
        
        masterGain.connect(masterMeter);
        masterGain.toDestination();
        
        updateMeters();
        
        console.log('Audio initialized successfully');
    } catch (error) {
        console.error('Error initializing audio:', error);
    }
}

// ===============================================
// VU METERS UPDATE
// ===============================================
function updateMeters() {
    if (!voiceMeter || !masterMeter) return;
    
    const voiceLevel = Math.min(100, (voiceMeter.getValue() + 60) * 1.5);
    const masterLevel = Math.min(100, (masterMeter.getValue() + 60) * 1.5);
    
    const voiceMeterEl = document.querySelector('.meter-fill');
    
    if (voiceMeterEl) {
        voiceMeterEl.style.width = Math.max(0, masterLevel) + '%';
    }
    
    requestAnimationFrame(updateMeters);
}

// ===============================================
// ADD TRACK MENU
// ===============================================
const addTrackBtn = document.querySelector('.icon-btn');
if (addTrackBtn) {
    addTrackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showAddTrackMenu(e.target);
    });
}

function showAddTrackMenu(button) {
    const existingMenu = document.getElementById('addTrackMenu');
    if (existingMenu) {
        existingMenu.remove();
        return;
    }
    
    const rect = button.getBoundingClientRect();
    
    const menu = document.createElement('div');
    menu.id = 'addTrackMenu';
    menu.style.cssText = `
        position: fixed;
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        padding: 8px;
        min-width: 220px;
        z-index: 10000;
        top: ${rect.bottom + 10}px;
        left: ${rect.left}px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    const menuItems = [
        { icon: '🎤', text: 'Add Voice Recorder', action: 'voice' },
        { icon: '🎵', text: 'Add Tracks', action: 'tracks' },
        { icon: '🎹', text: 'Add Samplers', action: 'samplers' },
        { icon: '🎸', text: 'Add V-Instrumental', action: 'instrumental' }
    ];
    
    menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'add-track-menu-item';
        menuItem.innerHTML = `${item.icon} ${item.text}`;
        menuItem.style.cssText = `
            padding: 12px 16px;
            cursor: pointer;
            color: #e0e0e0;
            font-size: 14px;
            transition: background 0.2s;
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        
        menuItem.addEventListener('mouseenter', () => {
            menuItem.style.background = '#3a3a3a';
        });
        
        menuItem.addEventListener('mouseleave', () => {
            menuItem.style.background = 'transparent';
        });
        
        menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            handleAddTrackAction(item.action);
            menu.remove();
        });
        
        menu.appendChild(menuItem);
    });
    
    document.body.appendChild(menu);
    
    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        });
    }, 10);
}

function handleAddTrackAction(action) {
    console.log('Add track action:', action);
    
    switch(action) {
        case 'voice':
            showVoiceRecorder();
            break;
        case 'tracks':
            openTrackImporter();
            break;
        case 'samplers':
            showSamplerPanel();
            break;
        case 'instrumental':
            showInstrumentalPanel();
            break;
    }
}

// ===============================================
// VOICE RECORDER PANEL (IN SIDEBAR TRACKS LIST)
// ===============================================
function showVoiceRecorder() {
    const existingPanel = document.getElementById('voiceRecorderPanel');
    if (existingPanel) {
        existingPanel.remove();
        return;
    }
    
    const tracksList = document.querySelector('.tracks-list');
    if (!tracksList) return;
    
    const panel = document.createElement('div');
    panel.id = 'voiceRecorderPanel';
    panel.className = 'track-item';
    panel.style.cssText = `
        background: linear-gradient(135deg, #1a1a1a 0%, #252525 100%);
        border: 2px solid #4ecdc4;
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1rem;
    `;
    
    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <span style="color: #4ecdc4; font-weight: 600; font-size: 0.9rem;">🎤 Voice Recorder</span>
            <button id="closeVoiceRecorder" style="background: transparent; border: none; color: #999; font-size: 1.2rem; cursor: pointer; padding: 0; width: 24px; height: 24px; line-height: 1;">&times;</button>
        </div>
        
        <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
            <div id="voiceRecordBtn" style="
                width: 70px;
                height: 70px;
                border-radius: 50%;
                background: #dc2626;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.3s;
                box-shadow: 0 4px 20px rgba(220, 38, 38, 0.4);
            ">
                <div style="
                    width: 26px;
                    height: 26px;
                    background: white;
                    border-radius: 50%;
                "></div>
            </div>
            
            <div style="text-align: center; width: 100%;">
                <div id="voiceRecordingStatus" style="color: #999; font-size: 0.8rem; margin-bottom: 0.5rem;">
                    Click to record
                </div>
                
                <div id="voiceRecordingTimer" style="
                    font-size: 1.2rem;
                    font-family: monospace;
                    color: #4ecdc4;
                    display: none;
                ">00:00</div>
            </div>
        </div>
        
        <div id="voiceRecordingPreview" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #333;">
            <audio id="voiceRecordedAudio" controls style="width: 100%; height: 32px; margin-bottom: 0.75rem;"></audio>
            <button id="addVoiceToTrack" style="
                width: 100%;
                padding: 0.6rem;
                background: #4ecdc4;
                color: #1a1a1a;
                border: none;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
                font-size: 0.85rem;
            ">Add to Timeline</button>
        </div>
    `;
    
    tracksList.insertBefore(panel, tracksList.firstChild);
    
    const closeBtn = document.getElementById('closeVoiceRecorder');
    const recordBtn = document.getElementById('voiceRecordBtn');
    const statusEl = document.getElementById('voiceRecordingStatus');
    const timerEl = document.getElementById('voiceRecordingTimer');
    const previewEl = document.getElementById('voiceRecordingPreview');
    
    let voiceRecording = false;
    let voiceRecorder = null;
    let voiceChunks = [];
    let voiceStartTime = 0;
    let voiceTimerInterval = null;
    
    closeBtn.addEventListener('click', () => {
        if (voiceRecording) {
            stopVoiceRecording();
        }
        panel.remove();
    });
    
    recordBtn.addEventListener('click', async () => {
        if (!voiceRecording) {
            await startVoiceRecording();
        } else {
            stopVoiceRecording();
        }
    });
    
    async function startVoiceRecording() {
        try {
            if (!audioContext) await initAudio();
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false
                }
            });
            
            voiceRecorder = new MediaRecorder(stream);
            voiceChunks = [];
            
            voiceRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    voiceChunks.push(e.data);
                }
            };
            
            voiceRecorder.onstop = async () => {
                const blob = new Blob(voiceChunks, { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                
                const audioEl = document.getElementById('voiceRecordedAudio');
                if (audioEl) audioEl.src = url;
                
                if (previewEl) previewEl.style.display = 'block';
                
                const arrayBuffer = await blob.arrayBuffer();
                const buffer = await audioContext.decodeAudioData(arrayBuffer);
                
                const addBtn = document.getElementById('addVoiceToTrack');
                if (addBtn) {
                    addBtn.onclick = () => {
                        addTrackToTimeline('Voice Recording ' + new Date().toLocaleTimeString(), buffer, 'recording');
                        panel.remove();
                    };
                }
                
                stream.getTracks().forEach(track => track.stop());
            };
            
            voiceRecorder.start(100);
            voiceRecording = true;
            voiceStartTime = Date.now();
            
            recordBtn.style.background = '#ef4444';
            recordBtn.style.animation = 'pulse 1.5s infinite';
            recordBtn.querySelector('div').style.borderRadius = '4px';
            
            statusEl.textContent = '🔴 Recording...';
            statusEl.style.color = '#ef4444';
            timerEl.style.display = 'block';
            
            voiceTimerInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - voiceStartTime) / 1000);
                const mins = Math.floor(elapsed / 60);
                const secs = elapsed % 60;
                if (timerEl) timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }, 1000);
            
            console.log('Voice recording started');
        } catch (err) {
            console.error('Error starting voice recording:', err);
            alert('Could not start recording. Please check microphone permissions.');
        }
    }
    
    function stopVoiceRecording() {
        if (voiceRecorder && voiceRecording) {
            voiceRecorder.stop();
            voiceRecording = false;
            
            recordBtn.style.background = '#dc2626';
            recordBtn.style.animation = 'none';
            recordBtn.querySelector('div').style.borderRadius = '50%';
            
            statusEl.textContent = 'Recording stopped';
            statusEl.style.color = '#4ecdc4';
            
            if (voiceTimerInterval) {
                clearInterval(voiceTimerInterval);
            }
            
            console.log('Voice recording stopped');
        }
    }
}

// ===============================================
// TRACK IMPORTER
// ===============================================
function openTrackImporter() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.onchange = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        if (!audioContext) await initAudio();
        
        for (let file of files) {
            try {
                console.log('Loading audio file:', file.name);
                const arrayBuffer = await file.arrayBuffer();
                const buffer = await audioContext.decodeAudioData(arrayBuffer);
                
                addTrackToTimeline(file.name, buffer, 'imported');
            } catch (error) {
                console.error('Error loading audio:', error);
                alert('Error loading ' + file.name + '. Please try a different format.');
            }
        }
    };
    input.click();
}

// ===============================================
// SAMPLER PANEL
// ===============================================
function showSamplerPanel() {
    const existingPanel = document.getElementById('samplerPanel');
    if (existingPanel) {
        existingPanel.remove();
        return;
    }
    
    const panel = document.createElement('div');
    panel.id = 'samplerPanel';
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1a1a1a;
        border: 2px solid #444;
        border-radius: 12px;
        padding: 2rem;
        z-index: 10001;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8);
        min-width: 600px;
    `;
    
    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="color: #4ecdc4; margin: 0; font-size: 1.5rem;">🎹 Samplers</h3>
            <button id="closeSamplerPanel" style="background: transparent; border: none; color: #999; font-size: 1.5rem; cursor: pointer;">&times;</button>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
            ${[1, 2, 3, 4, 5, 6].map(i => `
                <div class="sampler-box" data-sampler="${i}" style="
                    background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
                    border: 2px solid #444;
                    border-radius: 12px;
                    padding: 2rem;
                    text-align: center;
                    cursor: pointer;
                    transition: all 0.2s;
                    position: relative;
                    user-select: none;
                ">
                    <div class="sampler-status" style="
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        width: 12px;
                        height: 12px;
                        background: #555;
                        border-radius: 50%;
                    "></div>
                    
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎵</div>
                    <div style="color: #999; font-size: 0.875rem;">Pad ${i}</div>
                    <div class="sampler-label" style="color: #4ecdc4; font-size: 0.75rem; margin-top: 0.5rem; min-height: 1rem;">Empty</div>
                </div>
            `).join('')}
        </div>
        
        <div style="text-align: center; color: #999; font-size: 0.875rem; margin-bottom: 1rem;">
            Hold to record • Press to play
        </div>
        
        <button id="clearAllSamplers" style="
            width: 100%;
            padding: 0.75rem;
            background: #dc2626;
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
        ">Clear All Samplers</button>
    `;
    
    document.body.appendChild(panel);
    
    const closeBtn = document.getElementById('closeSamplerPanel');
    const clearAllBtn = document.getElementById('clearAllSamplers');
    const samplerBoxes = panel.querySelectorAll('.sampler-box');
    
    closeBtn.addEventListener('click', () => {
        panel.remove();
    });
    
    clearAllBtn.addEventListener('click', () => {
        if (confirm('Clear all sampler recordings?')) {
            samplerRecordings = {};
            samplerRecordingStates = {};
            samplerBoxes.forEach(box => {
                const samplerId = box.dataset.sampler;
                const status = box.querySelector('.sampler-status');
                const label = box.querySelector('.sampler-label');
                status.style.background = '#555';
                label.textContent = 'Empty';
            });
            console.log('All samplers cleared');
        }
    });
    
    samplerBoxes.forEach(box => {
        const samplerId = box.dataset.sampler;
        const status = box.querySelector('.sampler-status');
        const label = box.querySelector('.sampler-label');
        
        let pressTimer = null;
        
        box.addEventListener('mousedown', async (e) => {
            e.preventDefault();
            
            if (samplerRecordings[samplerId]) {
                playSampler(samplerId);
                box.style.transform = 'scale(0.95)';
                box.style.background = 'linear-gradient(135deg, #4ecdc4 0%, #3ab5ac 100%)';
            } else {
                pressTimer = setTimeout(async () => {
                    await startSamplerRecording(samplerId, box, status, label);
                }, 500);
            }
        });
        
        box.addEventListener('mouseup', (e) => {
            e.preventDefault();
            box.style.transform = 'scale(1)';
            box.style.background = 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)';
            
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
            
            if (samplerRecordingStates[samplerId]) {
                stopSamplerRecording(samplerId, status, label);
            }
            
            stopSampler(samplerId);
        });
        
        box.addEventListener('mouseleave', (e) => {
            box.style.transform = 'scale(1)';
            box.style.background = 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)';
            
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
            
            if (samplerRecordingStates[samplerId]) {
                stopSamplerRecording(samplerId, status, label);
            }
            
            stopSampler(samplerId);
        });
        
        box.addEventListener('mouseenter', () => {
            if (!samplerRecordingStates[samplerId]) {
                box.style.borderColor = '#4ecdc4';
            }
        });
        
        box.addEventListener('mouseleave', () => {
            if (!samplerRecordingStates[samplerId]) {
                box.style.borderColor = '#444';
            }
        });
    });
}

async function startSamplerRecording(samplerId, box, status, label) {
    try {
        if (!audioContext) await initAudio();
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const recorder = new MediaRecorder(stream);
        const chunks = [];
        
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunks.push(e.data);
            }
        };
        
        recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const arrayBuffer = await blob.arrayBuffer();
            const buffer = await audioContext.decodeAudioData(arrayBuffer);
            
            samplerRecordings[samplerId] = buffer;
            
            stream.getTracks().forEach(track => track.stop());
            
            status.style.background = '#4ecdc4';
            label.textContent = 'Recorded';
            
            console.log('Sampler', samplerId, 'recorded');
        };
        
        recorder.start(100);
        samplerRecordingStates[samplerId] = { recorder, stream, chunks };
        
        box.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        box.style.animation = 'pulse 1.5s infinite';
        status.style.background = '#ef4444';
        status.style.animation = 'pulse 1.5s infinite';
        label.textContent = 'Recording...';
        
        console.log('Sampler', samplerId, 'recording started');
    } catch (err) {
        console.error('Error starting sampler recording:', err);
        alert('Could not start recording');
    }
}

function stopSamplerRecording(samplerId, status, label) {
    const state = samplerRecordingStates[samplerId];
    if (state && state.recorder) {
        state.recorder.stop();
        delete samplerRecordingStates[samplerId];
        
        const box = document.querySelector(`[data-sampler="${samplerId}"]`);
        if (box) {
            box.style.animation = 'none';
            box.style.background = 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)';
        }
        status.style.animation = 'none';
        
        console.log('Sampler', samplerId, 'recording stopped');
    }
}

function playSampler(samplerId) {
    const buffer = samplerRecordings[samplerId];
    if (!buffer) return;
    
    if (activeSamplerPlayers[samplerId]) {
        activeSamplerPlayers[samplerId].stop();
    }
    
    const player = new Tone.Player(buffer).toDestination();
    player.start();
    
    activeSamplerPlayers[samplerId] = player;
    
    console.log('Playing sampler', samplerId);
}

function stopSampler(samplerId) {
    if (activeSamplerPlayers[samplerId]) {
        activeSamplerPlayers[samplerId].stop();
        delete activeSamplerPlayers[samplerId];
    }
}

// ===============================================
// V-INSTRUMENTAL PANEL
// ===============================================
function showInstrumentalPanel() {
    const existingPanel = document.getElementById('instrumentalPanel');
    if (existingPanel) {
        existingPanel.remove();
        return;
    }
    
    const panel = document.createElement('div');
    panel.id = 'instrumentalPanel';
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1a1a1a;
        border: 2px solid #444;
        border-radius: 12px;
        padding: 2rem;
        z-index: 10001;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8);
        min-width: 500px;
        max-width: 600px;
    `;
    
    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="color: #4ecdc4; margin: 0; font-size: 1.5rem;">🎸 V-Instrumental</h3>
            <button id="closeInstrumentalPanel" style="background: transparent; border: none; color: #999; font-size: 1.5rem; cursor: pointer;">&times;</button>
        </div>
        
        <div style="text-align: center; padding: 2rem; color: #999;">
            <div style="font-size: 4rem; margin-bottom: 1rem;">🎸</div>
            <p style="margin-bottom: 1.5rem;">Virtual instruments coming soon!</p>
            <p style="font-size: 0.875rem; line-height: 1.6;">
                This feature will include virtual piano, guitar, drums, and more instruments
                that you can play and record directly in the studio.
            </p>
        </div>
        
        <button id="closeInstrumentalBtn" style="
            width: 100%;
            padding: 0.75rem;
            background: #4ecdc4;
            color: #1a1a1a;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
        ">Got it</button>
    `;
    
    document.body.appendChild(panel);
    
    const closeBtn = document.getElementById('closeInstrumentalPanel');
    const closeBtnBottom = document.getElementById('closeInstrumentalBtn');
    
    closeBtn.addEventListener('click', () => panel.remove());
    closeBtnBottom.addEventListener('click', () => panel.remove());
}

// ===============================================
// AUTOTUNE IMPLEMENTATION
// ===============================================
async function applyAutotune(buffer, intensity) {
    console.log('Applying autotune with intensity:', intensity);
    
    const sampleRate = buffer.sampleRate;
    const channelData = buffer.getChannelData(0);
    const length = channelData.length;
    
    const processedBuffer = audioContext.createBuffer(
        buffer.numberOfChannels,
        length,
        sampleRate
    );
    
    const outputData = processedBuffer.getChannelData(0);
    
    const correctionStrength = intensity / 100;
    const windowSize = 4096;
    const hopSize = Math.floor(windowSize / 4);
    
    const noteFreqs = [
        130.81, 138.59, 146.83, 155.56, 164.81, 174.61, 185.00, 196.00,
        207.65, 220.00, 233.08, 246.94,
        261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.00,
        415.30, 440.00, 466.16, 493.88,
        523.25, 554.37, 587.33, 622.25, 659.25, 698.46, 739.99, 783.99
    ];
    
    for (let i = 0; i < length; i++) {
        outputData[i] = 0;
    }
    
    for (let i = 0; i < length - windowSize; i += hopSize) {
        const window = new Float32Array(windowSize);
        
        for (let j = 0; j < windowSize && i + j < length; j++) {
            const hannValue = 0.5 * (1 - Math.cos(2 * Math.PI * j / windowSize));
            window[j] = channelData[i + j] * hannValue;
        }
        
        const detectedFreq = detectFrequency(window, sampleRate);
        
        if (detectedFreq > 50 && detectedFreq < 1000) {
            const nearestNote = findNearestNote(detectedFreq, noteFreqs);
            const centsOff = 1200 * Math.log2(nearestNote / detectedFreq);
            const correctionCents = centsOff * correctionStrength;
            const pitchRatio = Math.pow(2, correctionCents / 1200);
            
            const shifted = pitchShiftWindow(window, pitchRatio, intensity);
            
            for (let j = 0; j < shifted.length && i + j < length; j++) {
                const weight = Math.min(
                    j / (hopSize / 2),
                    (shifted.length - j) / (hopSize / 2),
                    1.0
                );
                
                outputData[i + j] += shifted[j] * weight;
            }
        } else {
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
    
    for (let ch = 1; ch < buffer.numberOfChannels; ch++) {
        const input = buffer.getChannelData(ch);
        const output = processedBuffer.getChannelData(ch);
        output.set(input);
    }
    
    console.log('Autotune processing complete');
    return processedBuffer;
}

function detectFrequency(buffer, sampleRate) {
    const SIZE = buffer.length;
    const MAX_SAMPLES = Math.floor(SIZE / 2);
    let best_offset = -1;
    let best_correlation = 0;
    let rms = 0;
    
    for (let i = 0; i < SIZE; i++) {
        const val = buffer[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    
    if (rms < 0.005) return -1;
    
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
        
        correlations[offset] = sum > 0 ? correlation / sum : 0;
    }
    
    const minPeriod = Math.floor(sampleRate / 500);
    const maxPeriod = Math.floor(sampleRate / 80);
    
    for (let offset = minPeriod; offset < Math.min(maxPeriod, MAX_SAMPLES - 1); offset++) {
        const corr = correlations[offset];
        
        if (corr > correlations[offset - 1] && 
            corr > correlations[offset + 1] && 
            corr > best_correlation && 
            corr > 0.7) {
            best_correlation = corr;
            best_offset = offset;
        }
    }
    
    if (best_correlation > 0.7 && best_offset > -1) {
        const y1 = correlations[best_offset - 1];
        const y2 = correlations[best_offset];
        const y3 = correlations[best_offset + 1];
        
        const delta = 0.5 * (y3 - y1) / (2 * y2 - y1 - y3);
        const interpolated_offset = best_offset + delta;
        
        return sampleRate / interpolated_offset;
    }
    
    return -1;
}

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

function pitchShiftWindow(window, ratio, intensity) {
    const inputLength = window.length;
    const outputLength = inputLength;
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
        const sourceIndex = i * ratio;
        const index1 = Math.floor(sourceIndex);
        const index2 = Math.min(index1 + 1, inputLength - 1);
        const index0 = Math.max(index1 - 1, 0);
        const index3 = Math.min(index1 + 2, inputLength - 1);
        const fraction = sourceIndex - index1;
        
        if (index1 < inputLength) {
            const y0 = window[index0] || 0;
            const y1 = window[index1] || 0;
            const y2 = window[index2] || 0;
            const y3 = window[index3] || 0;
            
            const c0 = y1;
            const c1 = 0.5 * (y2 - y0);
            const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
            const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
            
            output[i] = c0 + c1 * fraction + c2 * fraction * fraction + c3 * fraction * fraction * fraction;
            
            if (intensity < 75) {
                const formantPreservation = 1 - (intensity / 100) * 0.3;
                output[i] *= formantPreservation;
            }
        }
    }
    
    return output;
}

// ===============================================
// TRANSPORT CONTROLS
// ===============================================
const playBtn = document.querySelector('.play-btn');
if (playBtn) {
    playBtn.addEventListener('click', () => {
        if (!isRecording) {
            playAudio();
        }
    });
}

const stopBtn = document.querySelector('.stop-btn');
if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else if (isPlaying) {
            pauseAudio();
        }
    });
    stopBtn.disabled = true;
}

const recordBtn = document.querySelector('.record-btn');
if (recordBtn) {
    recordBtn.addEventListener('click', () => {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    });
}

// ===============================================
// TEMPO CONTROL
// ===============================================
const tempoInput = document.getElementById('tempoInput');
if (tempoInput) {
    tempoInput.addEventListener('input', (e) => {
        currentTempo = parseInt(e.target.value);
        Tone.Transport.bpm.value = currentTempo;
    });
}

// ===============================================
// EXPORT FUNCTION
// ===============================================
const exportBtn = document.querySelector('.export-btn');
if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
        const exportableTracks = tracks.filter(t => t.buffer && !t.muted);
        
        if (exportableTracks.length === 0) {
            alert('No audio to export');
            return;
        }
        
        try {
            const maxDuration = Math.max(...exportableTracks.map(t => t.buffer.duration));
            const offlineCtx = new OfflineAudioContext(2, maxDuration * 48000, 48000);
            
            exportableTracks.forEach(track => {
                const source = offlineCtx.createBufferSource();
                source.buffer = track.buffer;
                const gainNode = offlineCtx.createGain();
                gainNode.gain.value = (track.volume / 100) * 0.8;
                source.connect(gainNode);
                gainNode.connect(offlineCtx.destination);
                source.start(0);
            });
            
            const renderedBuffer = await offlineCtx.startRendering();
            const wav = audioBufferToWav(renderedBuffer);
            const blob = new Blob([wav], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `studio-mix-${Date.now()}.wav`;
            a.click();
            
            URL.revokeObjectURL(url);
            console.log('Export complete');
        } catch (error) {
            console.error('Error exporting audio:', error);
            alert('Error exporting audio. Please try again.');
        }
    });
}

// ===============================================
// WAV CONVERSION
// ===============================================
function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
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

// ===============================================
// TIMER FUNCTIONS
// ===============================================
function updateTimer() {
    if (isRecording) {
        const elapsed = Date.now() - startTime;
        const timeDisplay = document.querySelector('.time-display');
        if (timeDisplay) timeDisplay.textContent = formatTime(elapsed / 1000);
        setTimeout(updateTimer, 100);
    }
}

function updatePlaybackTimer(duration) {
    const elapsed = (Date.now() - startTime) / 1000;
    
    if (elapsed >= duration) {
        pauseAudio();
        const timeDisplay = document.querySelector('.time-display');
        if (timeDisplay) timeDisplay.textContent = formatTime(duration);
        return;
    }
    
    const timeDisplay = document.querySelector('.time-display');
    if (timeDisplay) timeDisplay.textContent = formatTime(elapsed);
    
    animationId = requestAnimationFrame(() => updatePlaybackTimer(duration));
}

function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ===============================================
// EFFECTS TABS
// ===============================================
const effectsTabs = document.querySelectorAll('.effects-tab');
const effectsContent = document.querySelector('.effects-content');
const mixerContent = document.querySelector('.mixer-content');

effectsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        effectsTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        if (tab.textContent.includes('Effects')) {
            if (effectsContent) effectsContent.style.display = 'block';
            if (mixerContent) mixerContent.style.display = 'none';
        } else {
            if (effectsContent) effectsContent.style.display = 'none';
            if (mixerContent) mixerContent.style.display = 'block';
        }
    });
});

// ===============================================
// LOOP BUTTON
// ===============================================
const loopBtn = document.querySelector('.loop-btn');
if (loopBtn) {
    loopBtn.addEventListener('click', () => {
        Tone.Transport.loop = !Tone.Transport.loop;
        loopBtn.classList.toggle('active');
    });
}

// ===============================================
// PITCH DETECTION
// ===============================================
const detectPitchBtn = document.getElementById('detectPitchBtn');
if (detectPitchBtn) {
    detectPitchBtn.addEventListener('click', async () => {
        const recordingTrack = tracks.find(t => t.type === 'recording' && t.buffer);
        
        if (!recordingTrack) {
            alert('Please record audio first');
            return;
        }
        
        const pitch = await detectPitch(recordingTrack.buffer);
        const display = document.getElementById('detectedPitch');
        if (display) display.textContent = pitch;
    });
}

async function detectPitch(buffer) {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    
    const samplesPerAnalysis = Math.min(sampleRate, channelData.length);
    const subset = channelData.slice(0, samplesPerAnalysis);
    
    let maxCorr = 0;
    let bestOffset = 0;
    
    const minFreq = 80;
    const maxFreq = 400;
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

// ===============================================
// RECORDING EFFECTS TOGGLE
// ===============================================
const recordingToggle = document.getElementById('recordingEffectsToggle');
if (recordingToggle) {
    recordingToggle.addEventListener('change', (e) => {
        applyEffectsOnRecording = e.target.checked;
        console.log('Recording effects:', applyEffectsOnRecording ? 'ENABLED ✅' : 'DISABLED ❌');
        
        const effectsPanel = document.querySelector('.right-sidebar');
        if (effectsPanel) {
            effectsPanel.style.opacity = applyEffectsOnRecording ? '1' : '0.6';
        }
        
        const statusEl = document.querySelector('.effect-status');
        if (statusEl) {
            if (applyEffectsOnRecording) {
                statusEl.textContent = 'Effects will be applied to recording';
                statusEl.style.color = '#4ecdc4';
            } else {
                statusEl.textContent = 'Effects disabled - Recording clean audio';
                statusEl.style.color = '#ff5555';
            }
        }
    });
}

// ===============================================
// TIMELINE RULER GENERATION
// ===============================================
function generateTimelineRuler() {
    const rulerMarkers = document.querySelector('.ruler-markers');
    if (!rulerMarkers) return;
    
    const totalMinutes = 5;
    const pixelsPerSecond = 50;
    
    for (let i = 0; i <= totalMinutes * 60; i++) {
        if (i % 5 === 0) {
            const marker = document.createElement('div');
            marker.style.cssText = `
                position: absolute;
                left: ${i * pixelsPerSecond}px;
                height: 100%;
                border-left: 1px solid #3a3a3a;
                color: #666;
                font-size: 10px;
                padding-left: 4px;
            `;
            marker.textContent = formatTime(i);
            rulerMarkers.appendChild(marker);
        }
    }
}

// ===============================================
// DRAG AND DROP FOR TIMELINE
// ===============================================
function setupDragAndDrop() {
    const timelineTracks = document.querySelector('.timeline-tracks');
    if (!timelineTracks) return;
    
    timelineTracks.addEventListener('dragover', (e) => {
        e.preventDefault();
        timelineTracks.style.background = 'rgba(78, 205, 196, 0.1)';
    });
    
    timelineTracks.addEventListener('dragleave', (e) => {
        timelineTracks.style.background = '';
    });
    
    timelineTracks.addEventListener('drop', async (e) => {
        e.preventDefault();
        timelineTracks.style.background = '';
        
        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;
        
        if (!audioContext) await initAudio();
        
        for (let file of files) {
            if (file.type.startsWith('audio/')) {
                try {
                    console.log('Dropped audio file:', file.name);
                    const arrayBuffer = await file.arrayBuffer();
                    const buffer = await audioContext.decodeAudioData(arrayBuffer);
                    
                    addTrackToTimeline(file.name, buffer, 'imported');
                } catch (error) {
                    console.error('Error loading dropped file:', error);
                    alert('Error loading ' + file.name);
                }
            }
        }
    });
}

// ===============================================
// KEYBOARD SHORTCUTS
// ===============================================
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        if (isPlaying) {
            pauseAudio();
        } else if (!isRecording) {
            playAudio();
        }
    }
    
    if (e.code === 'KeyR' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    }
    
    if (e.code === 'KeyS' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        if (isRecording) {
            stopRecording();
        } else if (isPlaying) {
            pauseAudio();
        }
    }
    
    if ((e.code === 'Delete' || e.code === 'Backspace') && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        const selectedTrack = document.querySelector('.timeline-track[style*="outline"]');
        if (selectedTrack) {
            const trackId = selectedTrack.dataset.trackId;
            if (trackId) {
                deleteTrack(trackId);
            }
        }
    }
});
