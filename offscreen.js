chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CROP_IMAGE') {
    handleCropImage(message.dataUrl, message.areaConfig, sendResponse);
    return true; 
  } else if (message.type === 'GENERATE_PDF') {
    handleGeneratePdf(message.images, sendResponse);
    return true;
  }
});

async function handleCropImage(dataUrl, areaConfig, sendResponse) {
  try {
    const img = await loadImage(dataUrl);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = areaConfig.width;
    canvas.height = areaConfig.height;

    ctx.drawImage(
      img,
      areaConfig.x, areaConfig.y, areaConfig.width, areaConfig.height, 
      0, 0, areaConfig.width, areaConfig.height 
    );

    const croppedDataUrl = canvas.toDataURL('image/png');
    sendResponse({ success: true, dataUrl: croppedDataUrl });
  } catch (err) {
    console.error('Error cropping image:', err);
    sendResponse({ success: false, error: err.message });
  }
}

async function handleGeneratePdf(images, sendResponse) {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("jsPDF library is not loaded in offscreen document.");
    }
    const { jsPDF } = window.jspdf;
    let doc = null;
    
    for (let i = 0; i < images.length; i++) {
        const img = await loadImage(images[i]);
        const width = img.width;   
        const height = img.height; 
        const orientation = width > height ? 'l' : 'p';
        
        if (i === 0) {
            doc = new jsPDF({
                orientation: orientation,
                unit: 'px',
                format: [width, height]
            });
        } else {
            doc.addPage([width, height], orientation);
        }
        
        doc.addImage(img, 'PNG', 0, 0, width, height, undefined, 'FAST');
    }
    
    // Instead of a massive data URI string, create a Blob and then an Object URL.
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    sendResponse({ success: true, dataUrl: pdfUrl });
  } catch (err) {
    console.error('Error creating PDF:', err);
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
