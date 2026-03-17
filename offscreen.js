chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CROP_IMAGE') {
    handleCropImage(message.dataUrl, message.areaConfig, sendResponse);
    return true; 
  } else if (message.type === 'ADD_IMAGE_TO_PDF') {
    handleAddImageToPdf(message.dataUrl, message.isFirstPage, sendResponse);
    return true;
  } else if (message.type === 'SAVE_PDF') {
    handleSavePdf(sendResponse);
    return true;
  }
});

let pdfDocument = null;
let jsPDFRef = null;

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

async function handleAddImageToPdf(dataUrl, isFirstPage, sendResponse) {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("jsPDF library is not loaded in offscreen document.");
    }
    
    if (isFirstPage) {
      jsPDFRef = window.jspdf.jsPDF;
      pdfDocument = null; // reset previously held document
    }

    const img = await loadImage(dataUrl);
    const width = img.width;   
    const height = img.height; 
    const orientation = width > height ? 'l' : 'p';
    
    if (isFirstPage) {
        pdfDocument = new jsPDFRef({
            orientation: orientation,
            unit: 'px',
            format: [width, height]
        });
    } else {
        if (!pdfDocument) throw new Error("PDF Document not initialized.");
        pdfDocument.addPage([width, height], orientation);
    }
    
    pdfDocument.addImage(img, 'PNG', 0, 0, width, height, undefined, 'FAST');
    
    sendResponse({ success: true });
  } catch (err) {
    console.error('Error adding image to PDF:', err);
    sendResponse({ success: false, error: err.message });
  }
}

async function handleSavePdf(sendResponse) {
  try {
    if (!pdfDocument) {
      throw new Error("PDF Document not initialized.");
    }

    // Instead of a massive data URI string, create a Blob and then an Object URL.
    const pdfBlob = pdfDocument.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    // Cleanup local memory reference
    pdfDocument = null;

    sendResponse({ success: true, dataUrl: pdfUrl });
  } catch (err) {
    console.error('Error saving PDF:', err);
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
