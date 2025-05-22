// content.js - Extracts job description from the current page and stores it in chrome.storage.local
(function() {
  // Save the entire visible page text for AI extraction
  function saveJobContext() {
    const pageText = document.body.innerText || '';
    console.log('[CoverLetterExt] saveJobContext called. pageText length:', pageText.length);
    // Clear any old jobTitle from storage to prevent stale data
    chrome.storage.local.remove('jobTitle', () => {
      chrome.storage.local.set({ pageText }, () => {
        console.log('[CoverLetterExt] pageText saved to storage and jobTitle cleared.');
      });
    });
  }

  // Initial save
  saveJobContext();

  // Observe for dynamic changes (e.g., AJAX-loaded job info)
  const observer = new MutationObserver(() => {
    console.log('[CoverLetterExt] MutationObserver triggered.');
    saveJobContext();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Optionally, stop observing after 10 seconds to avoid performance issues
  setTimeout(() => {
    observer.disconnect();
    console.log('[CoverLetterExt] MutationObserver disconnected.');
  }, 10000);

  // Listen for messages from the popup to force extraction
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'extractJobInfo') {
      console.log('[CoverLetterExt] Received extractJobInfo message from popup.');
      saveJobContext();
      sendResponse({status: 'done'});
    }
  });
})();
