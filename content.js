let overlay = null;
let selectionBox = null;
let startX = 0, startY = 0;

let isAreaSelecting = false;
let isTargetSelecting = false;

// Control Panel UI
let controlPanel = null;
let progressLabel = null;
let pauseBtn = null;
let stopBtn = null;
let isPausedUI = false; // Local UI tracking for pause state

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_AREA_SELECTION') {
    startAreaSelection();
    sendResponse({ status: 'started' });
  } else if (message.action === 'START_TARGET_SELECTION') {
    startTargetSelection();
    sendResponse({ status: 'started' });
  } else if (message.action === 'PREVIEW_AREA') {
    previewArea();
    sendResponse({ status: 'previewing' });
  } else if (message.action === 'PREPARE_CAPTURE') {
    prepareCapture(message.areaConfig, message.waitForLazyLoad).then(() => {
       sendResponse({ status: 'prepared' });
    });
    return true; // Keep message channel open for async response
  } else if (message.action === 'RESTORE_CAPTURE') {
    restoreCapture();
    sendResponse({ status: 'restored' });
  } else if (message.action === 'PRESS_ARROW_KEY') {
    pressArrowKey(message.key);
    sendResponse({ success: true });
  } else if (message.action === 'CLICK_SCREEN') {
    clickScreen(message.x, message.y);
    sendResponse({ success: true });
  } else if (message.action === 'SHOW_STOP_BUTTON') {
    showControlPanel();
    sendResponse({ status: 'shown' });
  } else if (message.action === 'HIDE_STOP_BUTTON') {
    hideControlPanel();
    sendResponse({ status: 'hidden' });
  } else if (message.action === 'UPDATE_PROGRESS') {
    updateProgress(message.current, message.total);
    sendResponse({ status: 'updated' });
  }
  return true;
});

// ==========================================
// Area Selection Mode
// ==========================================
function startAreaSelection() {
  if (isAreaSelecting) endAreaSelection();
  if (isTargetSelecting) endTargetSelection();
  isAreaSelecting = true;

  overlay = document.createElement('div');
  overlay.className = 'auto-screenshot-overlay';

  const label = document.createElement('div');
  label.style.position = 'absolute';
  label.style.top = '20px';
  label.style.left = '50%';
  label.style.transform = 'translateX(-50%)';
  label.style.backgroundColor = 'rgba(0,0,0,0.8)';
  label.style.color = 'white';
  label.style.padding = '12px 24px';
  label.style.borderRadius = '8px';
  label.style.fontSize = '16px';
  label.style.fontFamily = 'sans-serif';
  label.style.pointerEvents = 'none';
  label.style.zIndex = '2147483647';
  label.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
  label.textContent = 'ドラッグ＆ドロップでキャプチャ範囲を選択してください (Escキーでキャンセル)';
  overlay.appendChild(label);

  document.body.appendChild(overlay);

  selectionBox = document.createElement('div');
  selectionBox.className = 'auto-screenshot-selection-box';
  selectionBox.style.display = 'none';
  document.body.appendChild(selectionBox);

  overlay.addEventListener('mousedown', onMouseDownArea);
  overlay.addEventListener('mousemove', onMouseMoveArea);
  window.addEventListener('mouseup', onMouseUpArea);
  window.addEventListener('keydown', onKeyDownArea);
}

function onMouseDownArea(e) {
  startX = e.clientX;
  startY = e.clientY;
  selectionBox.style.left = startX + 'px';
  selectionBox.style.top = startY + 'px';
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
  selectionBox.style.display = 'block';
}

function onMouseMoveArea(e) {
  if (selectionBox.style.display === 'none') return;
  const currentX = e.clientX;
  const currentY = e.clientY;
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
}

function onMouseUpArea(e) {
  if (selectionBox.style.display === 'none') return;
  
  const rect = selectionBox.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  const areaConfig = {
    x: Math.round(rect.left * dpr),
    y: Math.round(rect.top * dpr),
    width: Math.round(rect.width * dpr),
    height: Math.round(rect.height * dpr),
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight
  };

  if (areaConfig.width > 10 && areaConfig.height > 10) {
    chrome.storage.local.set({ areaConfig }, () => {
      chrome.runtime.sendMessage({ action: 'AREA_SELECTED' });
    });
  }
  endAreaSelection();
}

function onKeyDownArea(e) {
  if (e.key === 'Escape') endAreaSelection();
}

function endAreaSelection() {
  isAreaSelecting = false;
  if (overlay) {
    overlay.removeEventListener('mousedown', onMouseDownArea);
    overlay.removeEventListener('mousemove', onMouseMoveArea);
  }
  window.removeEventListener('mouseup', onMouseUpArea);
  window.removeEventListener('keydown', onKeyDownArea);

  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  if (selectionBox && selectionBox.parentNode) selectionBox.parentNode.removeChild(selectionBox);
  overlay = null;
  selectionBox = null;
}

// ==========================================
// Preview Area Mode
// ==========================================
function previewArea() {
  chrome.storage.local.get(['areaConfig'], (res) => {
    if (!res.areaConfig) return;
    const { x, y, width, height } = res.areaConfig;
    const dpr = window.devicePixelRatio || 1;
    
    const previewDiv = document.createElement('div');
    previewDiv.style.position = 'fixed';
    previewDiv.style.left = (x / dpr) + 'px';
    previewDiv.style.top = (y / dpr) + 'px';
    previewDiv.style.width = (width / dpr) + 'px';
    previewDiv.style.height = (height / dpr) + 'px';
    previewDiv.style.border = '2px solid red';
    previewDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
    previewDiv.style.zIndex = '2147483647';
    previewDiv.style.pointerEvents = 'none';
    
    document.body.appendChild(previewDiv);
    
    // Automatically remove preview after 3 seconds
    setTimeout(() => {
      if (previewDiv.parentNode) previewDiv.parentNode.removeChild(previewDiv);
    }, 3000);
  });
}

// ==========================================
// Target Selection Mode (Click Coordinate)
// ==========================================
function startTargetSelection() {
  if (isAreaSelecting) endAreaSelection();
  if (isTargetSelecting) endTargetSelection();
  isTargetSelecting = true;

  document.addEventListener('mouseover', onTargetMouseOver);
  document.addEventListener('mouseout', onTargetMouseOut);
  document.addEventListener('click', onTargetClick, { capture: true });
  window.addEventListener('keydown', onTargetKeyDown);
}

function onTargetMouseOver(e) { e.target.classList.add('auto-screenshot-highlight'); }
function onTargetMouseOut(e) { e.target.classList.remove('auto-screenshot-highlight'); }

function onTargetClick(e) {
  e.preventDefault();
  e.stopPropagation();

  e.target.classList.remove('auto-screenshot-highlight');

  // Save Absolute Page Coordinates regardless of current scroll
  const clickTargetConfig = { x: e.pageX, y: e.pageY };
  
  chrome.storage.local.set({ clickTargetConfig }, () => {
    chrome.runtime.sendMessage({ action: 'TARGET_SELECTED' });
  });

  endTargetSelection();
}

function onTargetKeyDown(e) {
  if (e.key === 'Escape') endTargetSelection();
}

function endTargetSelection() {
  isTargetSelecting = false;
  document.querySelectorAll('.auto-screenshot-highlight').forEach(el => el.classList.remove('auto-screenshot-highlight'));
  document.removeEventListener('mouseover', onTargetMouseOver);
  document.removeEventListener('mouseout', onTargetMouseOut);
  document.removeEventListener('click', onTargetClick, { capture: true });
  window.removeEventListener('keydown', onTargetKeyDown);
}


// ==========================================
// Automation Control
// ==========================================

async function prepareCapture(areaConfig, waitForLazyLoad) {
  window.scrollTo(0, 0);
  document.body.classList.add('auto-screenshot-hide-scroll');
  if (controlPanel) controlPanel.classList.add('auto-screenshot-hidden');

  // If wait for lazy load is ON, detect and wait for images in viewport to load.
  if (waitForLazyLoad && areaConfig) {
    const dpr = window.devicePixelRatio || 1;
    const rectX = areaConfig.x / dpr;
    const rectY = areaConfig.y / dpr;
    const rectW = areaConfig.width / dpr;
    const rectH = areaConfig.height / dpr;

    const imgs = Array.from(document.querySelectorAll('img'));
    const uncompleteImgs = imgs.filter(img => {
       if (img.complete) return false;
       const rect = img.getBoundingClientRect();
       // Check for intersection with our capture box
       const intersect = !(rect.right < rectX || rect.left > rectX + rectW || rect.bottom < rectY || rect.top > rectY + rectH);
       return intersect;
    });

    if (uncompleteImgs.length > 0) {
      await Promise.race([
        Promise.all(uncompleteImgs.map(img => {
          return new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        })),
        new Promise(resolve => setTimeout(resolve, 5000)) // Max wait 5 seconds
      ]);
    }
  }
}

function restoreCapture() {
  document.body.classList.remove('auto-screenshot-hide-scroll');
  if (controlPanel) controlPanel.classList.remove('auto-screenshot-hidden');
}

function pressArrowKey(key) {
  const eventDef = { key, code: key, keyCode: key === 'ArrowRight' ? 39 : 37, which: key === 'ArrowRight' ? 39 : 37, bubbles: true, cancelable: true };
  const target = document.activeElement || document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', eventDef));
  target.dispatchEvent(new KeyboardEvent('keypress', eventDef));
  target.dispatchEvent(new KeyboardEvent('keyup', eventDef));
}

function clickScreen(x, y) {
  // x and y are passed as absolute pageX, pageY. We must convert them to client coordinates if scrolling happened.
  // Although `prepareCapture` scrolls to 0,0, calculating client coords explicitly is safer.
  const clientX = x - window.scrollX;
  const clientY = y - window.scrollY;
  const target = document.elementFromPoint(clientX, clientY);
  if (target) {
    const clickEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true, clientX: clientX, clientY: clientY });
    target.dispatchEvent(clickEvent);
  } else {
    console.warn(`No element found at coordinates: ${x}, ${y}`);
  }
}

// Control Panel
function showControlPanel() {
  if (controlPanel) return;
  
  controlPanel = document.createElement('div');
  controlPanel.className = 'auto-screenshot-control-panel';

  progressLabel = document.createElement('span');
  progressLabel.className = 'auto-screenshot-progress';
  progressLabel.textContent = 'Starting...';

  const btnGroup = document.createElement('div');
  btnGroup.className = 'auto-screenshot-controls-btn-group';

  pauseBtn = document.createElement('button');
  pauseBtn.className = 'auto-screenshot-btn auto-screenshot-btn-pause';
  pauseBtn.textContent = '⏸ Pause';

  stopBtn = document.createElement('button');
  stopBtn.className = 'auto-screenshot-btn auto-screenshot-btn-stop';
  stopBtn.textContent = '⏹ Stop';

  btnGroup.appendChild(pauseBtn);
  btnGroup.appendChild(stopBtn);
  
  controlPanel.appendChild(progressLabel);
  controlPanel.appendChild(btnGroup);
  document.body.appendChild(controlPanel);

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP_REQUESTED' });
    stopBtn.textContent = 'Stopping...';
    stopBtn.disabled = true;
    pauseBtn.disabled = true;
  });

  pauseBtn.addEventListener('click', () => {
    isPausedUI = !isPausedUI;
    if (isPausedUI) {
      pauseBtn.textContent = '▶ Resume';
      pauseBtn.className = 'auto-screenshot-btn auto-screenshot-btn-resume';
      chrome.runtime.sendMessage({ action: 'PAUSE_REQUESTED' });
    } else {
      pauseBtn.textContent = '⏸ Pause';
      pauseBtn.className = 'auto-screenshot-btn auto-screenshot-btn-pause';
      chrome.runtime.sendMessage({ action: 'RESUME_REQUESTED' });
    }
  });
}

function hideControlPanel() {
  if (controlPanel) {
    controlPanel.remove();
    controlPanel = null;
    pauseBtn = null;
    stopBtn = null;
    progressLabel = null;
  }
}

function updateProgress(current, total) {
  if (progressLabel) {
    progressLabel.textContent = `${current} / ${total} Pages...`;
  }
}
