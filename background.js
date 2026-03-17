importScripts('idb-keyval.js');

let isAutomating = false;
let stopRequested = false;
let isPaused = false;
let fallbackNotified = false;

// Basic Sleep Utility
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Setup offscreen document
async function setupOffscreenDocument(path) {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(path)]
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: path,
    reasons: [chrome.offscreen.Reason.DOM_PARSER, chrome.offscreen.Reason.BLOBS],
    justification: 'Crop image via Canvas API and Generate PDF combining multiple dataURIs'
  });
}

async function closeOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}

// Format numbers
function padNumber(num, totalPages) {
  const totalLength = totalPages.toString().length;
  // Make sure at least padding is 2
  const targetLength = Math.max(2, totalLength);
  return num.toString().padStart(targetLength, '0');
}

// File name construct
function constructFilename(prefix, index, extension, totalPages) {
  let safePrefix = prefix ? prefix.trim() : 'auto_screenshot';
  if (index !== null && totalPages) {
    return `${safePrefix}_${padNumber(index, totalPages)}.${extension}`;
  } else {
    return `${safePrefix}.${extension}`;
  }
}

async function writeToFileSystem(handle, filename, blobOrDataUrl) {
  if (!handle) return false;
  try {
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    if (typeof blobOrDataUrl === 'string') {
      const response = await fetch(blobOrDataUrl);
      const blob = await response.blob();
      await writable.write(blob);
    } else {
      await writable.write(blobOrDataUrl);
    }
    await writable.close();
    return true;
  } catch (e) {
    console.warn("Direct file write failed", e);
    return false;
  }
}

// Ensure the offscreen document stays alive during long operations implicitly, but we also can directly send messages.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_AUTOMATION') {
    if (isAutomating) {
      console.warn("Already automating!");
      return;
    }
    startAutomationLoop();
  } else if (message.action === 'STOP_REQUESTED') {
    stopRequested = true;
    console.log("Stop requested by user");
  } else if (message.action === 'PAUSE_REQUESTED') {
    isPaused = true;
    console.log("Pause requested by user");
  } else if (message.action === 'RESUME_REQUESTED') {
    isPaused = false;
    console.log("Resume requested by user");
  }
});

async function startAutomationLoop() {
  isAutomating = true;
  stopRequested = false;
  isPaused = false;
  fallbackNotified = false;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    notifyUser("Error", "No active tab found to start automation.");
    isAutomating = false;
    return;
  }

  const stored = await chrome.storage.local.get([
    'areaConfig', 'clickTargetConfig', 'pageCount', 'waitTimeMs', 
    'filePrefix', 'saveAsPdf', 'waitForLazyLoad', 'nextAction'
  ]);

  if (!stored.areaConfig) {
    notifyUser("Error", "Area not properly selected before starting.");
    isAutomating = false;
    return;
  }

  const pages = stored.pageCount || 10;
  const waitTime = stored.waitTimeMs || 2000;
  const filePrefix = stored.filePrefix || 'auto_screenshot';
  const saveAsPdf = stored.saveAsPdf || false;
  const waitForLazyLoad = stored.waitForLazyLoad || false;
  const nextAction = stored.nextAction || 'ArrowRight';
  const clickTarget = stored.clickTargetConfig;

  let dirHandle = null;
  try {
    dirHandle = await idbKeyval.get('saveFolderHandle');
  } catch (e) {
    console.warn("Could not retrieve directory handle from IndexedDB", e);
  }

  await setupOffscreenDocument('offscreen.html');

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'SHOW_STOP_BUTTON' });
  } catch (e) {
    console.warn("Could not show stop button", e);
  }

  // To prevent memory buildup in background script, we no longer store raw PDFs dataUrl unless needed temporarily
  let capturedPdfCount = 0;

  for (let i = 1; i <= pages; i++) {
    console.log(`Processing page ${i} of ${pages}`);

    while (isPaused) {
      if (stopRequested) break;
      await sleep(500);
    }

    if (stopRequested) {
      notifyUser("Stopped", `Automation stopped early by user (Completed ${i - 1}/${pages}).`);
      break;
    }
    
    // Update Control Panel UI progress
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'UPDATE_PROGRESS', current: i, total: pages });
    } catch(e) {}

    try {
      // 1. Prepare capture UI, passing wait request allowing content side to intercept lazy images
      await chrome.tabs.sendMessage(tab.id, { action: 'PREPARE_CAPTURE', areaConfig: stored.areaConfig, waitForLazyLoad });
      await sleep(300); // DOM update timeframe

      // 2. Capture Chrome visible tab dataUrl
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

      // 3. Restore UI
      await chrome.tabs.sendMessage(tab.id, { action: 'RESTORE_CAPTURE' });

      // 4. Send over to offscreen doc for cropping
      const cropResponse = await chrome.runtime.sendMessage({
        type: 'CROP_IMAGE',
        dataUrl,
        areaConfig: stored.areaConfig
      });

      if (!cropResponse || !cropResponse.success) {
        throw new Error(cropResponse ? cropResponse.error : "Unknown crop error");
      }

      // 5. Handle image stream forwarding or file download
      if (saveAsPdf) {
        const isFirstPage = (i === 1);
        const addPdfResponse = await chrome.runtime.sendMessage({
           type: 'ADD_IMAGE_TO_PDF',
           dataUrl: cropResponse.dataUrl,
           isFirstPage: isFirstPage
        });
        
        if (!addPdfResponse || !addPdfResponse.success) {
           throw new Error(addPdfResponse ? addPdfResponse.error : "Unknown PDF stream error");
        }
        capturedPdfCount++;
      } else {
        const filename = constructFilename(filePrefix, i, 'png', pages);
        const wroteSuccessfully = await writeToFileSystem(dirHandle, filename, cropResponse.dataUrl);
        
        if (!wroteSuccessfully) {
          // Fallback
          if (!fallbackNotified) {
            notifyUser("Permission Warning", "フォルダの書き込み権限がないため、標準のダウンロードフォルダに保存します");
            fallbackNotified = true;
          }
          await chrome.downloads.download({
            url: cropResponse.dataUrl,
            filename: filename,
            saveAs: false 
          });
        }
        console.log(`Saved ${filename}`);
      }

      // 6. Navigation
      if (i < pages && !stopRequested) {
        if (nextAction === 'ClickScreen') {
          if (!clickTarget) throw new Error("Click target coordinates missing.");
          await chrome.tabs.sendMessage(tab.id, { action: 'CLICK_SCREEN', x: clickTarget.x, y: clickTarget.y });
        } else {
          await chrome.tabs.sendMessage(tab.id, { action: 'PRESS_ARROW_KEY', key: nextAction });
        }
        
        // Wait configured loop delay
        let msPassed = 0;
        while (msPassed < waitTime) {
          if (stopRequested) break;
          await sleep(100);
          if (!isPaused) msPassed += 100;
        }
      }

    } catch (err) {
      console.error(`Error on page ${i}:`, err);
      notifyUser("Error", `An error occurred on page ${i}. Automation stopped. (${err.message})`);
      break;
    }
  }

  // Finalize PDF creation if configured
  if (saveAsPdf && capturedPdfCount > 0) {
    try {
      notifyUser("Processing", `Combining ${capturedPdfCount} images into a PDF... Please wait.`);
      
      const pdfResponse = await chrome.runtime.sendMessage({
        type: 'SAVE_PDF'
      });

      if (pdfResponse && pdfResponse.success) {
        const pdfFilename = constructFilename(filePrefix, null, 'pdf', pages);
        
        const wroteSuccessfully = await writeToFileSystem(dirHandle, pdfFilename, pdfResponse.dataUrl);
        if (!wroteSuccessfully) {
          if (!fallbackNotified) {
             notifyUser("Permission Warning", "フォルダの書き込み権限がないため、標準のダウンロードフォルダに保存します");
             fallbackNotified = true;
          }
          await chrome.downloads.download({
            url: pdfResponse.dataUrl,
            filename: pdfFilename,
            saveAs: false
          });
        }
        console.log(`Saved PDF ${pdfFilename}`);
      } else {
         throw new Error(pdfResponse ? pdfResponse.error : "Unknown PDF generation error from offscreen");
      }
    } catch(e) {
      console.error("PDF Finalization Error:", e);
      notifyUser("Error", `Error generating PDF: ${e.message}`);
    }
  }

  if (!stopRequested && isAutomating) {
    notifyUser("Complete", `Completed automation process.`);
  }

  // Cleanup
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'HIDE_STOP_BUTTON' });
  } catch (e) { /* ignore */ }
  
  await closeOffscreenDocument();
  isAutomating = false;
  stopRequested = false;
}

function notifyUser(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png', 
    title: `Auto Screen Shot: ${title}`,
    message: message
  });
}
