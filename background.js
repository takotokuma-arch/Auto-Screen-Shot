let isAutomating = false;
let stopRequested = false;

// Basic Sleep Utility
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Setup offscreen document
async function setupOffscreenDocument(path) {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: path,
    reasons: [chrome.offscreen.Reason.DOM_PARSER, chrome.offscreen.Reason.BLOBS],
    justification: 'Crop image via Canvas API'
  });
}

async function closeOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

// Ensure 4 digit padding for filenames
function padNumber(num) {
  return num.toString().padStart(4, '0');
}

// Background Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_AUTOMATION') {
    if (isAutomating) {
      console.warn("Already automating!");
      return;
    }
    startAutomationLoop(message.payload);
  } else if (message.action === 'STOP_REQUESTED') {
    stopRequested = true;
    console.log("Stop requested by user");
  } else if (message.action === 'AREA_SELECTED') {
    // Optional logic if needed when area is selected
  }
});

async function startAutomationLoop(payload) {
  const { pages, waitTime } = payload;
  isAutomating = true;
  stopRequested = false;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    notifyUser("Error", "No active tab found to start automation.");
    isAutomating = false;
    return;
  }

  // Retrieve configs
  const stored = await chrome.storage.local.get(['areaConfig', 'arrowDirection']);
  if (!stored.areaConfig) {
    notifyUser("Error", "Area not properly selected before starting.");
    isAutomating = false;
    return;
  }

  const { areaConfig } = stored;
  const arrowDirection = stored.arrowDirection || 'ArrowRight'; // Default to right if not set

  await setupOffscreenDocument('offscreen.html');

  // Show stop button initially
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'SHOW_STOP_BUTTON' });
  } catch (e) {
    console.error("Could not show stop button", e);
  }

  for (let i = 1; i <= pages; i++) {
    console.log(`Processing page ${i} of ${pages}`);

    if (stopRequested) {
      notifyUser("Stopped", `Automation stopped early by user (Completed ${i - 1}/${pages}).`);
      break;
    }

    try {
      // 1. Prepare capture: Hide scrollbars, scroll to top, hide stop button
      await chrome.tabs.sendMessage(tab.id, { action: 'PREPARE_CAPTURE' });
      await sleep(300); // Give DOM time to update visually

      // 2. Capture full screen
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

      // 3. Restore UI
      await chrome.tabs.sendMessage(tab.id, { action: 'RESTORE_CAPTURE' });

      // 4. Crop image using offscreen document
      const cropResponse = await chrome.runtime.sendMessage({
        type: 'CROP_IMAGE',
        dataUrl,
        areaConfig
      });

      if (!cropResponse || !cropResponse.success) {
        throw new Error(cropResponse ? cropResponse.error : "Unknown crop error");
      }

      // 5. Download the image
      const filename = `auto_screenshot_${padNumber(i)}.png`;
      await chrome.downloads.download({
        url: cropResponse.dataUrl,
        filename: filename,
        saveAs: false 
      });

      console.log(`Saved ${filename}`);

      // 6. Navigate to next page using arrow key
      if (i < pages && !stopRequested) {
        const keyResponse = await chrome.tabs.sendMessage(tab.id, { 
          action: 'PRESS_ARROW_KEY', 
          key: arrowDirection 
        });

        if (!keyResponse || !keyResponse.success) {
          notifyUser("Warning", `Could not trigger next page on page ${i}.`);
        }

        // Wait designated time before next loop
        console.log(`Waiting ${waitTime}ms...`);
        await sleep(waitTime);
      }

    } catch (err) {
      console.error(`Error on page ${i}:`, err);
      notifyUser("Error", `An error occurred on page ${i}. Automation stopped.`);
      break;
    }
  }

  if (!stopRequested && isAutomating) {
    notifyUser("Complete", `Completed ${pages} screenshots.`);
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
