let currentVideo = '';
let currentChannel = '';
let attemptCount = 0;
const MAX_ATTEMPTS = 20; // Increased max attempts
const RETRY_INTERVAL = 500; // 500ms between retries

// Debug logging function that only logs in development
function debugLog(...args) {
  if (chrome.runtime.getManifest().version_name === 'dev' || localStorage.getItem('ytspeed_debug') === 'true') {
    console.log('[YT Speed]', ...args);
  }
}

// Function to extract channel name from the page
function getChannelInfo() {
  // Check for channel name in various locations
  const channelElement = document.querySelector('ytd-video-owner-renderer #channel-name a') || 
                         document.querySelector('#owner-name a') ||
                         document.querySelector('ytd-channel-name a') ||
                         document.querySelector('[itemprop="author"] [itemprop="name"]');
                         
  if (channelElement) {
    return channelElement.textContent.trim();
  }
  
  return null;
}

// Function to set playback speed and update YouTube UI
function setPlaybackSpeed(specificSpeed = null) {
  const video = document.querySelector('video');
  if (!video) {
    debugLog('No video element found');
    return false;
  }
  
  const channelName = getChannelInfo();
  if (!channelName && specificSpeed === null) {
    debugLog('No channel detected');
    return false;
  }
  
  // Get video ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');
  
  // If specific speed is provided, use it directly
  if (specificSpeed !== null) {
    applySpeed(parseFloat(specificSpeed), video, channelName);
    return true;
  }
  
  // If we've already processed this video & channel combination and no specific speed is requested
  // don't do it again UNLESS this is the first load (where currentVideo is empty)
  if (currentVideo === videoId && currentChannel === channelName && currentVideo !== '') {
    debugLog('Already processed this video/channel combination');
    return true;
  }
  
  // Get stored settings
  chrome.storage.sync.get(['channels', 'defaultSpeed'], function(data) {
    const channels = data.channels || {};
    const defaultSpeed = parseFloat(data.defaultSpeed || 1);
    
    debugLog('Retrieved settings', { channels, defaultSpeed });
    
    // Check if we have a custom speed for this channel
    if (channelName && channels[channelName] !== undefined) {
      const speed = parseFloat(channels[channelName]);
      debugLog(`Found custom speed ${speed} for channel ${channelName}`);
      applySpeed(speed, video, channelName);
    } else {
      // Use default speed
      debugLog(`Using default speed ${defaultSpeed} for channel ${channelName || 'unknown'}`);
      applySpeed(defaultSpeed, video, channelName);
    }
    
    // Mark this video as processed
    currentVideo = videoId;
    currentChannel = channelName;
  });
  
  return true;
}

// Function to apply speed and update YouTube player
function applySpeed(speed, video, channelName) {
  debugLog(`Applying speed ${speed} to video`);
  
  // Set the video playback rate
  try {
    video.playbackRate = speed;
    
    // Update YouTube's playback speed UI using injected script
    updateYouTubeSpeedUI(speed);
    
    debugLog(`Successfully set playback speed to ${speed}x for channel: ${channelName || 'unknown'}`);
  } catch (e) {
    debugLog('Error setting playback rate', e);
  }
}

// Function to update YouTube's player UI to reflect our speed change
function updateYouTubeSpeedUI(speed) {
  try {
    // Create and inject script that directly interacts with YouTube's player
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        // Try to access the player directly
        const video = document.querySelector('video');
        if (!video) return;
        
        // Set playback rate directly
        video.playbackRate = ${speed};
        
        // Try to get the HTML5 video player API object
        const playerAPI = document.querySelector('.html5-video-player');
        if (playerAPI && typeof playerAPI.setPlaybackRate === 'function') {
          try {
            playerAPI.setPlaybackRate(${speed});
          } catch (e) {
            console.log("Error using player API", e);
          }
        }
        
        // Try to update any speed menu items
        try {
          // Get speed labels to check for
          const speeds = ['0.25×', '0.5×', '0.75×', 'Normal', '1.25×', '1.5×', '1.75×', '2×'];
          const speedValues = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
          
          // Function to update displayed speed in menu
          const updateSpeedDisplay = () => {
            const menuItems = document.querySelectorAll('.ytp-menuitem');
            menuItems.forEach(item => {
              const label = item.querySelector('.ytp-menuitem-label');
              if (label && label.textContent.includes('Speed')) {
                const content = item.querySelector('.ytp-menuitem-content');
                if (content) {
                  // Find the closest speed label or use custom format
                  const index = speedValues.indexOf(${speed});
                  if (index !== -1) {
                    content.textContent = speeds[index];
                  } else {
                    content.textContent = ${speed} + '×';
                  }
                }
              }
            });
          };
          
          // Try to update now and also set a mutation observer for future menu opens
          updateSpeedDisplay();
          
          // Set up an observer for when the speed menu might appear
          const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
              if (mutation.addedNodes && mutation.addedNodes.length) {
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                  const node = mutation.addedNodes[i];
                  if (node.classList && (
                      node.classList.contains('ytp-settings-menu') || 
                      node.classList.contains('ytp-panel') ||
                      node.classList.contains('ytp-popup')
                    )) {
                    updateSpeedDisplay();
                  }
                }
              }
            });
          });
          
          // Start observing the document with the configured parameters
          observer.observe(document.body, { childList: true, subtree: true });
          
          // Clean up observer after 10 seconds to prevent memory leaks
          setTimeout(() => observer.disconnect(), 10000);
        } catch (e) {
          console.log("Error updating speed menu", e);
        }
      })();
    `;
    
    // Add and remove the script
    document.head.appendChild(script);
    document.head.removeChild(script);
  } catch (e) {
    debugLog('Error injecting speed UI update script', e);
  }
}

// Try to set playback speed with retries
function trySetSpeed() {
  debugLog(`Attempt ${attemptCount + 1} to set playback speed`);
  
  if (!setPlaybackSpeed() && attemptCount < MAX_ATTEMPTS) {
    // If we couldn't set the speed, try again after interval
    attemptCount++;
    setTimeout(trySetSpeed, RETRY_INTERVAL);
  } else {
    attemptCount = 0;
    debugLog('Finished setting playback speed');
  }
}

// Initialize
debugLog('Content script loaded');
setTimeout(() => {
  trySetSpeed();
}, 1000); // Start with a slight delay to let page load

// Helper to check if URL is a YouTube watch page
function isWatchPage(url) {
  return url.includes('youtube.com/watch');
}

// Listen for navigation events
let lastUrl = location.href;
debugLog('Setting up navigation observer for URL:', lastUrl);

// Use MutationObserver to detect URL changes (SPA navigation)
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    const oldUrl = lastUrl;
    lastUrl = location.href;
    debugLog(`URL changed from ${oldUrl} to ${lastUrl}`);
    
    // Reset tracking variables
    currentVideo = '';
    currentChannel = '';
    attemptCount = 0;
    
    // Only process watch pages
    if (isWatchPage(lastUrl)) {
      debugLog('New URL is a watch page, setting speed after delay');
      // Delay to allow page content to load
      setTimeout(trySetSpeed, 1000);
    }
  }
});

// Start observing URL changes
urlObserver.observe(document, {subtree: true, childList: true});

// Listen for video player changes that might indicate a new video loaded without URL change
const playerObserver = new MutationObserver((mutations) => {
  // Check if we're on a watch page
  if (!isWatchPage(location.href)) return;
  
  let videoChanged = false;
  
  // Look for mutations that might indicate video player loading
  mutations.forEach(mutation => {
    if (mutation.type === 'childList' && 
        mutation.target.classList && 
        (mutation.target.classList.contains('html5-video-container') || 
         mutation.target.id === 'movie_player')) {
      videoChanged = true;
    }
  });
  
  if (videoChanged) {
    debugLog('Video player changed, attempting to set speed');
    // Reset for new video
    currentVideo = '';
    attemptCount = 0;
    setTimeout(trySetSpeed, 500);
  }
});

// Start observing player changes
const playerContainer = document.querySelector('#content');
if (playerContainer) {
  playerObserver.observe(playerContainer, { childList: true, subtree: true });
}

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog('Received message', message);
  
  if (message.action === "videoLoaded") {
    debugLog('Video loaded message received');
    trySetSpeed();
    sendResponse({ status: 'Processing' });
  } else if (message.action === "getChannelInfo") {
    const channelName = getChannelInfo();
    debugLog('Channel info requested, found:', channelName);
    sendResponse({ channelName });
  } else if (message.action === "setSpeed") {
    debugLog('Set speed message received:', message.speed);
    setPlaybackSpeed(message.speed);
    sendResponse({ success: true });
  }
  return true; // Keep the message channel open for async responses
});