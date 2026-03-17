chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CROP_IMAGE') {
    handleCropImage(message.dataUrl, message.areaConfig, sendResponse);
    return true; // Keep message channel open for async response
  }
});

async function handleCropImage(dataUrl, areaConfig, sendResponse) {
  try {
    const img = await loadImage(dataUrl);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Use requested crop dimensions
    canvas.width = areaConfig.width;
    canvas.height = areaConfig.height;

    // Draw the specific portion of the source image to the canvas
    ctx.drawImage(
      img,
      areaConfig.x, areaConfig.y, areaConfig.width, areaConfig.height, // Source rectangle
      0, 0, areaConfig.width, areaConfig.height // Destination rectangle
    );

    const croppedDataUrl = canvas.toDataURL('image/png');
    sendResponse({ success: true, dataUrl: croppedDataUrl });
  } catch (err) {
    console.error('Error cropping image:', err);
    sendResponse({ success: false, error: err.message });
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
