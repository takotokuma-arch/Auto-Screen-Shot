let overlay = null;
let selectionBox = null;
let startX = 0, startY = 0;

let isAreaSelecting = false;
let stopButton = null;

// Handle messages from Popup or Background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_AREA_SELECTION') {
    startAreaSelection();
    sendResponse({ status: 'started' });
  } else if (message.action === 'PREPARE_CAPTURE') {
    prepareCapture();
    sendResponse({ status: 'prepared' });
  } else if (message.action === 'RESTORE_CAPTURE') {
    restoreCapture();
    sendResponse({ status: 'restored' });
  } else if (message.action === 'PRESS_ARROW_KEY') {
    const success = pressArrowKey(message.key);
    sendResponse({ success });
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
  if (isAreaSelecting) {
    endAreaSelection();
  }
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

  // Bind events
  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // Esc to cancel
  window.addEventListener('keydown', onKeyDownAreaSelect);
}

function onMouseDown(e) {
  startX = e.clientX;
  startY = e.clientY;
  selectionBox.style.left = startX + 'px';
  selectionBox.style.top = startY + 'px';
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
  selectionBox.style.display = 'block';
}

function onMouseMove(e) {
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

function onMouseUp(e) {
  if (selectionBox.style.display === 'none') return;
  
  // Calculate final bounds
  const rect = selectionBox.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // Convert logical pixels to physical pixels based on DPR for accurate cropping
  const areaConfig = {
    x: Math.round(rect.left * dpr),
    y: Math.round(rect.top * dpr),
    width: Math.round(rect.width * dpr),
    height: Math.round(rect.height * dpr)
  };

  // Only save if it's a valid rectangle (width/height > 10)
  if (areaConfig.width > 10 && areaConfig.height > 10) {
    chrome.storage.local.set({ areaConfig }, () => {
      chrome.runtime.sendMessage({ action: 'AREA_SELECTED' });
    });
  }

  endAreaSelection();
}

function onKeyDownAreaSelect(e) {
  if (e.key === 'Escape') {
    endAreaSelection();
  }
}

function endAreaSelection() {
  isAreaSelecting = false;
  if (overlay) {
    overlay.removeEventListener('mousedown', onMouseDown);
    overlay.removeEventListener('mousemove', onMouseMove);
  }
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('keydown', onKeyDownAreaSelect);

  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  if (selectionBox && selectionBox.parentNode) {
    selectionBox.parentNode.removeChild(selectionBox);
  }
  overlay = null;
  selectionBox = null;
}


// ==========================================
// Automation Control
// ==========================================

function prepareCapture() {
  window.scrollTo(0, 0);
  document.body.classList.add('auto-screenshot-hide-scroll');
  if (stopButton) {
    stopButton.classList.add('auto-screenshot-hidden');
  }
}

function restoreCapture() {
  document.body.classList.remove('auto-screenshot-hide-scroll');
  if (stopButton) {
    stopButton.classList.remove('auto-screenshot-hidden');
  }
}

function pressArrowKey(key) {
  // Simulate arrow key press using KeyboardEvent
  const eventDef = {
    key: key,
    code: key,
    keyCode: key === 'ArrowRight' ? 39 : 37,
    which: key === 'ArrowRight' ? 39 : 37,
    bubbles: true,
    cancelable: true
  };
  
  const target = document.activeElement || document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', eventDef));
  target.dispatchEvent(new KeyboardEvent('keypress', eventDef));
  target.dispatchEvent(new KeyboardEvent('keyup', eventDef));
  
  return true;
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
