let overlay = null;
let selectionBox = null;
let startX = 0, startY = 0;

let isAreaSelecting = false;
let isTargetSelecting = false;
let stopButton = null;

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
    prepareCapture();
    sendResponse({ status: 'prepared' });
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
    showStopButton();
    sendResponse({ status: 'shown' });
  } else if (message.action === 'HIDE_STOP_BUTTON') {
    hideStopButton();
    sendResponse({ status: 'hidden' });
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

  // Save the logical coordinates
  const clickTargetConfig = { x: e.clientX, y: e.clientY };
  
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

function prepareCapture() {
  window.scrollTo(0, 0);
  document.body.classList.add('auto-screenshot-hide-scroll');
  if (stopButton) stopButton.classList.add('auto-screenshot-hidden');
}

function restoreCapture() {
  document.body.classList.remove('auto-screenshot-hide-scroll');
  if (stopButton) stopButton.classList.remove('auto-screenshot-hidden');
}

function pressArrowKey(key) {
  const eventDef = { key, code: key, keyCode: key === 'ArrowRight' ? 39 : 37, which: key === 'ArrowRight' ? 39 : 37, bubbles: true, cancelable: true };
  const target = document.activeElement || document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', eventDef));
  target.dispatchEvent(new KeyboardEvent('keypress', eventDef));
  target.dispatchEvent(new KeyboardEvent('keyup', eventDef));
}

function clickScreen(x, y) {
  // Use logical coordinates to select element
  const target = document.elementFromPoint(x, y);
  if (target) {
    const clickEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true, clientX: x, clientY: y });
    target.dispatchEvent(clickEvent);
  } else {
    console.warn(`No element found at coordinates: ${x}, ${y}`);
  }
}

function showStopButton() {
  if (stopButton) return;
  stopButton = document.createElement('button');
  stopButton.className = 'auto-screenshot-stop-btn';
  stopButton.textContent = '⏹ Stop Automation';
  document.body.appendChild(stopButton);

  stopButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP_REQUESTED' });
    stopButton.textContent = 'Stopping...';
    stopButton.disabled = true;
  });
}

function hideStopButton() {
  if (stopButton) {
    stopButton.remove();
    stopButton = null;
  }
}
