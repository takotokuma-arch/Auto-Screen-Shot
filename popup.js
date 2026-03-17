document.addEventListener('DOMContentLoaded', () => {
  const btnAreaSelect = document.getElementById('btnAreaSelect');
  const btnPreviewArea = document.getElementById('btnPreviewArea');
  const btnTargetSelect = document.getElementById('btnTargetSelect');
  const btnStart = document.getElementById('btnStart');
  const btnSelectFolder = document.getElementById('btnSelectFolder');
  
  const pageCountInput = document.getElementById('pageCount');
  const waitTimeInput = document.getElementById('waitTimeMs');
  const saveFolderDisplay = document.getElementById('saveFolderDisplay');
  const filePrefixInput = document.getElementById('filePrefix');
  const saveAsPdfInput = document.getElementById('saveAsPdf');
  const nextActionInput = document.getElementById('nextAction');
  
  const areaStatus = document.getElementById('areaStatus');
  const clickTargetStatusRow = document.getElementById('clickTargetStatusRow');
  const clickTargetStatus = document.getElementById('clickTargetStatus');

  let configValid = { area: false, target: false };

  // Load existing config
  chrome.storage.local.get([
    'areaConfig', 'clickTargetConfig', 'pageCount', 'waitTimeMs', 'filePrefix', 'saveAsPdf', 'nextAction'
  ], async (result) => {
    if (result.pageCount) pageCountInput.value = result.pageCount;
    if (result.waitTimeMs) waitTimeInput.value = result.waitTimeMs;
    if (result.filePrefix) filePrefixInput.value = result.filePrefix;
    if (result.saveAsPdf !== undefined) saveAsPdfInput.checked = result.saveAsPdf;
    if (result.nextAction) nextActionInput.value = result.nextAction;
    
    // Check if we have a saved directory handle
    try {
      const handle = await idbKeyval.get('saveFolderHandle');
      if (handle) {
         saveFolderDisplay.textContent = handle.name;
         saveFolderDisplay.title = 'Uses chosen directory';
      }
    } catch(e) { console.warn("Could not load directory handle", e); }
    
    if (result.areaConfig) updateStatus('area', true);
    if (result.clickTargetConfig) updateStatus('target', true);
    
    toggleClickTargetUI();
    checkStartState();
  });

  const saveConfig = () => {
    chrome.storage.local.set({
      pageCount: parseInt(pageCountInput.value, 10),
      waitTimeMs: parseInt(waitTimeInput.value, 10),
      filePrefix: filePrefixInput.value.trim() || 'auto_screenshot',
      saveAsPdf: saveAsPdfInput.checked,
      nextAction: nextActionInput.value
    });
  };

  [pageCountInput, waitTimeInput, filePrefixInput, saveAsPdfInput, nextActionInput].forEach(
    el => el.addEventListener('change', () => {
      saveConfig();
      if (el === nextActionInput) {
        toggleClickTargetUI();
        checkStartState();
      }
    })
  );

  function toggleClickTargetUI() {
    if (nextActionInput.value === 'ClickScreen') {
      btnTargetSelect.style.display = 'block';
      clickTargetStatusRow.style.display = 'flex';
    } else {
      btnTargetSelect.style.display = 'none';
      clickTargetStatusRow.style.display = 'none';
      updateStatus('target', true); // Ignore target validation if not using click
    }
  }

  // Folder Selection
  btnSelectFolder.addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await idbKeyval.set('saveFolderHandle', handle);
      saveFolderDisplay.textContent = handle.name;
    } catch (e) {
      if (e.name !== 'AbortError') {
        alert("フォルダの選択に失敗しました: " + e.message);
      }
    }
  });

  // Start Area Selection Mode
  btnAreaSelect.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('https://chrome.google.com/webstore'))) {
      alert("Chromeの設定ページやウェブストア上ではエリア選択ができません。通常のウェブサイトで再試行してください。");
      return;
    }
    chrome.tabs.sendMessage(tab.id, { action: 'START_AREA_SELECTION' }, () => {
      if (chrome.runtime.lastError) alert("ページへのアクセスに失敗しました。リロードしてからお試しください。");
      else window.close();
    });
  });

  // Preview Area
  btnPreviewArea.addEventListener('click', async () => {
    if (!configValid.area) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'PREVIEW_AREA' });
  });

  // Start Target Selection Mode
  btnTargetSelect.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'START_TARGET_SELECTION' }, () => {
      if (!chrome.runtime.lastError) window.close();
    });
  });

  // Start Automation
  btnStart.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Check window dimensions to prevent coordinate drift
    chrome.storage.local.get(['areaConfig'], async (res) => {
      if (res.areaConfig) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({ w: window.innerWidth, h: window.innerHeight })
          });
          
          if (results && results[0]) {
            const { w, h } = results[0].result;
            if (res.areaConfig.windowWidth !== w || res.areaConfig.windowHeight !== h) {
              alert('警告：キャプチャ範囲を保存した時と画面サイズが異なります。座標ズレを防ぐため、元のサイズに戻すか、エリア選択を再度行ってください。');
              return;
            }
          }
        } catch (e) {
          console.warn('Could not check window size contextually', e);
        }

        chrome.runtime.sendMessage({ action: 'START_AUTOMATION' });
        window.close();
      }
    });
  });

  function updateStatus(type, isSet) {
    const el = type === 'area' ? areaStatus : clickTargetStatus;
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
    const targetValid = nextActionInput.value === 'ClickScreen' ? configValid.target : true;
    btnStart.disabled = !(configValid.area && targetValid);
  }

  // Listen for progress messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'AREA_SELECTED') {
      updateStatus('area', true);
      checkStartState();
    }
    if (message.action === 'TARGET_SELECTED') {
      updateStatus('target', true);
      checkStartState();
    }
  });

});
