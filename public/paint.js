// ==========================================
// PAINT STUDIO - FIXED DRAWING BEHAVIOR
// ==========================================

class PaintApp {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.isDrawing = false;
        this.currentTool = 'brush';
        this.currentColor = '#000000';
        this.brushSize = 5;
        this.pages = [[]]; // Array of pages, each page has history states
        this.currentPage = 0;
        this.historyStep = -1;
        
        // Drawing state
        this.startX = 0;
        this.startY = 0;
        this.lastX = 0;
        this.lastY = 0;
        this.snapshot = null;
        
        // Text tool state
        this.textMode = false;
        this.textX = 0;
        this.textY = 0;
    }
    
    init() {
        this.canvas = document.getElementById('paintCanvas');
        if (!this.canvas) {
            console.error('Paint canvas not found');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        
        this.setupEventListeners();
        this.saveState();
        this.updatePageInfo();
        
        console.log('🎨 Paint App initialized');
    }
    
    resizeCanvas() {
        const container = document.querySelector('.paint-canvas-container');
        if (!container) return;
        
        const width = Math.min(container.clientWidth - 40, 1200);
        const height = Math.min(container.clientHeight - 40, 700);
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        // Fill with white background
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    setupEventListeners() {
        // Tool buttons
        document.querySelectorAll('.paint-tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent modal from closing
                document.querySelectorAll('.paint-tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
                this.textMode = false;
            });
        });
        
        // Brush size
        const brushSizeInput = document.getElementById('brushSize');
        const brushSizeValue = document.getElementById('brushSizeValue');
        if (brushSizeInput && brushSizeValue) {
            brushSizeInput.addEventListener('input', (e) => {
                this.brushSize = parseInt(e.target.value);
                brushSizeValue.textContent = this.brushSize;
            });
        }
        
        // Color picker
        const colorPicker = document.getElementById('colorPicker');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.currentColor = e.target.value;
            });
        }
        
        // Color presets
        document.querySelectorAll('.paint-color-preset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent modal from closing
                this.currentColor = btn.dataset.color;
                if (colorPicker) colorPicker.value = this.currentColor;
            });
        });
        
        // Canvas events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseout', this.handleMouseUp.bind(this));
        
        // Touch events
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.handleMouseUp.bind(this));
        
        // Action buttons
        document.getElementById('undoBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.undo();
        });
        document.getElementById('redoBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.redo();
        });
        document.getElementById('clearBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearCanvas();
        });
        
        // Page navigation
        document.getElementById('prevPageBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.prevPage();
        });
        document.getElementById('nextPageBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.nextPage();
        });
        document.getElementById('addPageBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.addPage();
        });
        document.getElementById('deletePageBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deletePage();
        });
        
        // Save and send
        document.getElementById('savePaintBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.saveDrawing();
        });
        document.getElementById('sendPaintBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.sendDrawing();
        });
    }
    
    handleMouseDown(e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        this.startX = e.clientX - rect.left;
        this.startY = e.clientY - rect.top;
        this.lastX = this.startX;
        this.lastY = this.startY;
        
        if (this.currentTool === 'text') {
            this.addText(this.startX, this.startY);
            this.isDrawing = false;
            return;
        }
        
        if (this.currentTool === 'fill') {
            this.fillArea(Math.floor(this.startX), Math.floor(this.startY));
            this.isDrawing = false;
            this.saveState();
            return;
        }
        
        if (['line', 'rectangle', 'circle'].includes(this.currentTool)) {
            this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        }
        
        // For brush, pencil, and eraser, start a new path
        if (['brush', 'pencil', 'eraser'].includes(this.currentTool)) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.startX, this.startY);
        }
    }
    
    handleMouseMove(e) {
        if (!this.isDrawing) return;
        this.draw(e);
    }
    
    handleMouseUp() {
        if (this.isDrawing) { 
            this.isDrawing = false;
            this.saveState();
        }
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.canvas.dispatchEvent(mouseEvent);
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.canvas.dispatchEvent(mouseEvent);
    }
    
    draw(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.fillStyle = this.currentColor;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        switch(this.currentTool) {
            case 'brush':
                this.drawBrush(x, y);
                break;
            case 'pencil':
                this.drawPencil(x, y);
                break;
            case 'eraser':
                this.drawEraser(x, y);
                break;
            case 'line':
                this.drawLine(x, y);
                break;
            case 'rectangle':
                this.drawRectangle(x, y);
                break;
            case 'circle':
                this.drawCircle(x, y);
                break;
        }
        
        this.lastX = x;
        this.lastY = y;
    }
    
    drawBrush(x, y) {
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
    }
    
    drawPencil(x, y) {
        this.ctx.lineWidth = 1;
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
    }
    
    drawEraser(x, y) {
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        this.ctx.globalCompositeOperation = 'source-over';
    }
    
    fillArea(x, y) {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const targetColor = this.getPixelColor(imageData, x, y);
        const fillColor = this.hexToRgb(this.currentColor);
        
        if (this.colorsMatch(targetColor, fillColor)) return;
        
        const pixelsToCheck = [[x, y]];
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        while (pixelsToCheck.length > 0) {
            const [currentX, currentY] = pixelsToCheck.pop();
            
            if (currentX < 0 || currentX >= width || currentY < 0 || currentY >= height) continue;
            
            const currentColor = this.getPixelColor(imageData, currentX, currentY);
            
            if (!this.colorsMatch(currentColor, targetColor)) continue;
            
            this.setPixelColor(imageData, currentX, currentY, fillColor);
            
            pixelsToCheck.push([currentX + 1, currentY]);
            pixelsToCheck.push([currentX - 1, currentY]);
            pixelsToCheck.push([currentX, currentY + 1]);
            pixelsToCheck.push([currentX, currentY - 1]);
        }
        
        this.ctx.putImageData(imageData, 0, 0);
    }
    
    drawLine(x, y) {
        this.ctx.putImageData(this.snapshot, 0, 0);
        this.ctx.beginPath();
        this.ctx.moveTo(this.startX, this.startY);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
    }
    
    drawRectangle(x, y) {
        this.ctx.putImageData(this.snapshot, 0, 0);
        this.ctx.beginPath();
        this.ctx.rect(this.startX, this.startY, x - this.startX, y - this.startY);
        this.ctx.stroke();
    }
    
    drawCircle(x, y) {
        this.ctx.putImageData(this.snapshot, 0, 0);
        const radius = Math.sqrt(Math.pow(x - this.startX, 2) + Math.pow(y - this.startY, 2));
        this.ctx.beginPath();
        this.ctx.arc(this.startX, this.startY, radius, 0, 2 * Math.PI);
        this.ctx.stroke();
    }
    
    addText(x, y) {
        const text = prompt('Enter text:');
        if (text) {
            this.ctx.font = `${this.brushSize * 4}px Arial`;
            this.ctx.fillStyle = this.currentColor;
            this.ctx.fillText(text, x, y);
            this.saveState();
        }
    }
    
    getPixelColor(imageData, x, y) {
        const index = (y * imageData.width + x) * 4;
        return {
            r: imageData.data[index],
            g: imageData.data[index + 1],
            b: imageData.data[index + 2],
            a: imageData.data[index + 3]
        };
    }
    
    setPixelColor(imageData, x, y, color) {
        const index = (y * imageData.width + x) * 4;
        imageData.data[index] = color.r;
        imageData.data[index + 1] = color.g;
        imageData.data[index + 2] = color.b;
        imageData.data[index + 3] = 255;
    }
    
    colorsMatch(color1, color2) {
        return color1.r === color2.r && color1.g === color2.g && color1.b === color2.b;
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }
    
    saveState() {
        this.historyStep++;
        
        if (this.historyStep < this.pages[this.currentPage].length) {
            this.pages[this.currentPage].length = this.historyStep;
        }
        
        this.pages[this.currentPage].push(this.canvas.toDataURL());
        
        if (this.pages[this.currentPage].length > 50) {
            this.pages[this.currentPage].shift();
            this.historyStep--;
        }
    }
    
    undo() {
        if (this.historyStep > 0) {
            this.historyStep--;
            this.loadState();
        }
    }
    
    redo() {
        if (this.historyStep < this.pages[this.currentPage].length - 1) {
            this.historyStep++;
            this.loadState();
        }
    }
    
    loadState() {
        const img = new Image();
        img.src = this.pages[this.currentPage][this.historyStep];
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
    }
    
    clearCanvas() {
        if (confirm('Clear the entire canvas?')) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.saveState();
        }
    }
    
    addPage() {
        this.pages.push([]);
        this.currentPage = this.pages.length - 1;
        this.historyStep = -1;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.saveState();
        this.updatePageInfo();
    }
    
    deletePage() {
        if (this.pages.length <= 1) {
            alert('Cannot delete the last page!');
            return;
        }
        
        if (confirm('Delete this page?')) {
            this.pages.splice(this.currentPage, 1);
            if (this.currentPage >= this.pages.length) {
                this.currentPage = this.pages.length - 1;
            }
            this.loadPage(this.currentPage);
            this.updatePageInfo();
        }
    }
    
    prevPage() {
        if (this.currentPage > 0) {
            this.currentPage--;
            this.loadPage(this.currentPage);
            this.updatePageInfo();
        }
    }
    
    nextPage() {
        if (this.currentPage < this.pages.length - 1) {
            this.currentPage++;
            this.loadPage(this.currentPage);
            this.updatePageInfo();
        }
    }
    
    loadPage(pageIndex) {
        this.historyStep = this.pages[pageIndex].length - 1;
        if (this.historyStep >= 0) {
            this.loadState();
        } else {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    updatePageInfo() {
        const currentPageNum = document.getElementById('currentPageNum');
        const totalPagesNum = document.getElementById('totalPagesNum');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        const deleteBtn = document.getElementById('deletePageBtn');
        
        if (currentPageNum) currentPageNum.textContent = this.currentPage + 1;
        if (totalPagesNum) totalPagesNum.textContent = this.pages.length;
        
        if (prevBtn) prevBtn.disabled = this.currentPage === 0;
        if (nextBtn) nextBtn.disabled = this.currentPage === this.pages.length - 1;
        if (deleteBtn) deleteBtn.disabled = this.pages.length <= 1;
    }
    
    saveDrawing() {
        const link = document.createElement('a');
        link.download = `drawing-page-${this.currentPage + 1}.png`;
        link.href = this.canvas.toDataURL();
        link.click();
    }
    
    async sendDrawing() {
        if (!selectedFriend) {
            alert('Please select a friend first!');
            return;
        }
        
        if (!socket || !socket.connected) {
            alert('Not connected to server!');
            return;
        }
        
        try {
            const imageData = this.canvas.toDataURL('image/png');
            
            const fileData = {
                name: `Drawing - Page ${this.currentPage + 1} - ${new Date().toLocaleString()}.png`,
                type: 'image/png',
                size: imageData.length,
                data: imageData
            };
            
            const tempMessage = {
                id: 'temp_' + Date.now() + Math.random().toString(36).substr(2, 9),
                senderId: currentUser.id,
                receiverId: selectedFriend.id,
                content: JSON.stringify(fileData),
                type: 'image',
                timestamp: Date.now(),
                status: 'sent'
            };
            
            messages.push(tempMessage);
            renderMessages();
            scrollToBottom();
            
            socket.emit('send_message', {
                senderId: currentUser.id,
                receiverId: selectedFriend.id,
                content: JSON.stringify(fileData),
                type: 'image'
            });
            
            closePaintModal();
            alert('🎨 Drawing sent successfully!');
            
        } catch (error) {
            console.error('Error sending drawing:', error);
            alert('Failed to send drawing. Please try again.');
        }
    }
}

// Global paint app instance
let paintApp = null;

// Paint modal functions
function openPaintModal() {
    const paintModal = document.getElementById('paintModal');
    if (!paintModal) {
        console.error('Paint modal not found');
        return;
    }
    
    paintModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    if (!paintApp) {
        paintApp = new PaintApp();
        setTimeout(() => paintApp.init(), 100);
    } else {
        setTimeout(() => paintApp.resizeCanvas(), 100);
    }
    
    console.log('🎨 Paint modal opened');
}

function closePaintModal() {
    const paintModal = document.getElementById('paintModal');
    if (paintModal) {
        paintModal.style.display = 'none';
        document.body.style.overflow = '';
    }
    console.log('🎨 Paint modal closed');
}

function setupPaintModal() {
    const openPaintBtn = document.getElementById('openPaintBtn');
    const closePaintBtn = document.getElementById('closePaintBtn');
    
    if (openPaintBtn) {
        openPaintBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openPaintModal();
        });
    }
    
    if (closePaintBtn) {
        closePaintBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closePaintModal();
        });
    }
    
    // Click outside modal to close - FIXED
    const paintModal = document.getElementById('paintModal');
    if (paintModal) {
        paintModal.addEventListener('click', (e) => {
            // Only close if clicking the modal background (not the content)
            if (e.target === paintModal) {
                closePaintModal();
            }
        });
    }
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const paintModal = document.getElementById('paintModal');
            if (paintModal && paintModal.style.display === 'flex') {
                closePaintModal();
            }
        }
    });
    
    console.log('✅ Paint modal setup complete');
}

// Make functions globally accessible
window.openPaintModal = openPaintModal;
window.closePaintModal = closePaintModal;
