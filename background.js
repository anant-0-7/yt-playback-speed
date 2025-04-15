const processedTabs = new Set();

// Helper to check if a URL is a YouTube watch page
function isYouTubeWatchUrl(url) {
  return url && url.includes('youtube.com/watch');
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Skip if not a YouTube watch page
  if (!isYouTubeWatchUrl(tab.url)) {
    return;
  }
  
  // Process on complete load
  if (changeInfo.status === 'complete') {
    console.log(`Tab ${tabId} loaded, sending videoLoaded message`);
    
    // Send message to content script
    chrome.tabs.sendMessage(tabId, { action: "videoLoaded" }, (response) => {
      // Handle potential errors but don't throw
      if (chrome.runtime.lastError) {
        console.log(`Error sending message to tab ${tabId}:`, chrome.runtime.lastError.message);
      }
    });
    
    // Mark this tab as processed
    processedTabs.add(tabId);
  }
});

// Clean up processed tabs when they're closed
chrome.tabs.onRemoved.addListener((tabId) => {
  processedTabs.delete(tabId);
});

// Listen for navigation events in active tab
chrome.webNavigation && chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  // Check if this is a YouTube watch page navigation
  if (isYouTubeWatchUrl(details.url)) {
    console.log(`History state updated in tab ${details.tabId}, sending videoLoaded message`);
    
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      chrome.tabs.sendMessage(details.tabId, { action: "videoLoaded" }, (response) => {
        // Handle potential errors but don't throw
        if (chrome.runtime.lastError) {
          console.log(`Error sending message on history update:`, chrome.runtime.lastError.message);
        }
      });
    }, 500);
  }
}, { url: [{ hostContains: 'youtube.com' }] });