// Background service worker for MV3 Chrome Extension

let creatingOffscreen: Promise<void> | null = null;

async function isOffscreenOpen(): Promise<boolean> {
  try {
    // @ts-ignore
    if (chrome.runtime.getContexts) {
      // @ts-ignore
      const contexts = await (chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT' as any]
      }) as any);
      return contexts && contexts.length > 0;
    }
  } catch (e) {
    // getContexts might not be available in older chrome versions
  }
  return false;
}

async function setupOffscreenDocument(path: string) {
  if (await isOffscreenOpen()) return;

  // Create the offscreen document
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: chrome.runtime.getURL(path),
    reasons: [
      chrome.offscreen.Reason.USER_MEDIA,
      chrome.offscreen.Reason.AUDIO_PLAYBACK
    ],
    justification: 'Capture microphone for voice chat, establish WebRTC peer connection, and play remote audio.'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

async function closeOffscreenDocument() {
  try {
    if (!(await isOffscreenOpen())) return;
    await chrome.offscreen.closeDocument();
  } catch (err) {
    console.error('Failed to close offscreen document:', err);
  }
}

// Listen for runtime messages from the Popup or Offscreen
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_MATCHMAKING') {
    setupOffscreenDocument('offscreen.html')
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.error('Error starting offscreen document:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }

  if (message.type === 'WRITE_STORAGE') {
    chrome.storage.local.set(message.payload)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'CLOSE_OFFSCREEN') {
    closeOffscreenDocument()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

let chatWindowId: number | null = null;

chrome.action.onClicked.addListener(async () => {
  if (chatWindowId !== null) {
    try {
      // Focus existing window if it is already open
      await chrome.windows.update(chatWindowId, { focused: true });
      return;
    } catch (e) {
      // Window was closed, create a new one
      chatWindowId = null;
    }
  }

  const win = await chrome.windows.create({
    url: 'popup.html',
    type: 'popup',
    width: 380,
    height: 600,
    focused: true
  });
  
  if (win && win.id) {
    chatWindowId = win.id;
  }
});
