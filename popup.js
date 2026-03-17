document.addEventListener('DOMContentLoaded', () => {
  const btnAreaSelect = document.getElementById('btnAreaSelect');
  const btnStart = document.getElementById('btnStart');
  const pageCountInput = document.getElementById('pageCount');
  const waitTimeInput = document.getElementById('waitTimeMs');
  const arrowDirectionInput = document.getElementById('arrowDirection');
  const areaStatus = document.getElementById('areaStatus');

  let configValid = { area: false };

  // Load existing config from storage
  chrome.storage.local.get(['areaConfig', 'arrowDirection', 'pageCount', 'waitTimeMs'], (result) => {
    if (result.pageCount) pageCountInput.value = result.pageCount;
    if (result.waitTimeMs) waitTimeInput.value = result.waitTimeMs;
    if (result.arrowDirection) arrowDirectionInput.value = result.arrowDirection;
    
    if (result.areaConfig) {
      updateStatus('area', true);
    }
    checkStartState();
  });

  // Save inputs when changed
  pageCountInput.addEventListener('change', () => {
    chrome.storage.local.set({ pageCount: parseInt(pageCountInput.value, 10) });
  });
  waitTimeInput.addEventListener('change', () => {
    chrome.storage.local.set({ waitTimeMs: parseInt(waitTimeInput.value, 10) });
  });
  arrowDirectionInput.addEventListener('change', () => {
    chrome.storage.local.set({ arrowDirection: arrowDirectionInput.value });
  });

  // Start Area Selection Mode
  btnAreaSelect.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('https://chrome.google.com/webstore'))) {
      alert("Chromeの設定ページやウェブストア上ではエリア選択ができません。\n通常のウェブサイトを開いてから再試行してください。");
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'START_AREA_SELECTION' }, (response) => {
      if (chrome.runtime.lastError) {
        alert("ページへのアクセスに失敗しました。対象のページをリロード（再読み込み）してから、もう一度お試しください。");
        return;
      }
      window.close();
    });
  });

  // Start Automation
  btnStart.addEventListener('click', () => {
    const pages = parseInt(pageCountInput.value, 10);
    const waitTime = parseInt(waitTimeInput.value, 10);
    
    chrome.runtime.sendMessage({
      action: 'START_AUTOMATION',
      payload: { pages, waitTime }
    });
    window.close();
  });

  function updateStatus(type, isSet) {
    const el = areaStatus;
    configValid[type] = isSet;
    if (isSet) {
      el.textContent = 'Ready';
      el.className = 'status-badge fixed';
    } else {
      el.textContent = 'Not Set';
      el.className = 'status-badge unfixed';
    }
  }

  function checkStartState() {
    if (configValid.area) {
      btnStart.disabled = false;
    } else {
      btnStart.disabled = true;
    }
  }

  // Listen for background/content script messages updating the state
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'AREA_SELECTED') {
      updateStatus('area', true);
      checkStartState();
    }
  });

});
