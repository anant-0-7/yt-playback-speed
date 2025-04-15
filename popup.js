document.addEventListener('DOMContentLoaded', function() {
    const channelList = document.getElementById('channel-list');
    const newChannelInput = document.getElementById('newChannel');
    const newSpeedSelect = document.getElementById('newSpeed');
    const addBtn = document.getElementById('addBtn');
    const saveBtn = document.getElementById('saveBtn');
    const defaultSpeedSelect = document.getElementById('defaultSpeed');
    const currentChannelDiv = document.getElementById('current-channel');
    const currentChannelName = document.getElementById('current-channel-name');
    const currentChannelSpeed = document.getElementById('current-channel-speed');
    const addCurrentBtn = document.getElementById('addCurrentBtn');
    const statusMessage = document.getElementById('status-message');
  
    let currentChannelInfo = null;
  
    // Show temporary status message
    function showStatus(message, duration = 2000) {
      statusMessage.textContent = message;
      setTimeout(() => {
        statusMessage.textContent = '';
      }, duration);
    }
  
    // Get current tab to check if it's YouTube and get channel info
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      if (currentTab && currentTab.url && currentTab.url.includes('youtube.com')) {
        // Execute script to get channel info from current page
        chrome.tabs.sendMessage(currentTab.id, { action: "getChannelInfo" }, function(response) {
          if (response && response.channelName) {
            currentChannelInfo = response.channelName;
            currentChannelDiv.classList.remove('not-detected');
            currentChannelName.textContent = `Current: ${currentChannelInfo}`;
            
            // Check if we already have a setting for this channel
            chrome.storage.sync.get('channels', function(data) {
              const channels = data.channels || {};
              if (channels[currentChannelInfo]) {
                currentChannelSpeed.value = channels[currentChannelInfo];
              }
            });
          }
        });
      }
    });
  
    // Add current channel button
    addCurrentBtn.addEventListener('click', function() {
      if (!currentChannelInfo) {
        alert('No YouTube channel detected');
        return;
      }
      
      const speed = currentChannelSpeed.value;
      
      chrome.storage.sync.get('channels', function(data) {
        const channels = data.channels || {};
        channels[currentChannelInfo] = speed;
        
        // Update UI
        renderChannels(channels);
        
        // Save to storage
        chrome.storage.sync.set({ 'channels': channels }, function() {
          showStatus('Channel speed saved!');
          
          // Apply the change immediately if we're on this channel's video
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { 
              action: "setSpeed", 
              speed: speed 
            });
          });
        });
      });
    });
  
    // Load saved settings
    chrome.storage.sync.get(['channels', 'defaultSpeed'], function(data) {
      const channels = data.channels || {};
      const defaultSpeed = data.defaultSpeed || '1';
      
      // Set default speed
      defaultSpeedSelect.value = defaultSpeed;
      
      // Render saved channels
      renderChannels(channels);
    });
  
    // Add new channel
    addBtn.addEventListener('click', function() {
      const channelName = newChannelInput.value.trim();
      const speed = newSpeedSelect.value;
      
      if (channelName === '') {
        alert('Please enter a channel name or ID');
        return;
      }
      
      chrome.storage.sync.get('channels', function(data) {
        const channels = data.channels || {};
        channels[channelName] = speed;
        
        // Update UI and clear input
        renderChannels(channels);
        newChannelInput.value = '';
        newSpeedSelect.value = '1';
        
        // Save to storage
        chrome.storage.sync.set({ 'channels': channels }, function() {
          showStatus('Channel added successfully!');
        });
      });
    });
  
    // Save settings
    saveBtn.addEventListener('click', function() {
      const defaultSpeed = defaultSpeedSelect.value;
      chrome.storage.sync.set({ 'defaultSpeed': defaultSpeed }, function() {
        showStatus('Using Default Speed');
        
        // Apply default speed if needed
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          const currentTab = tabs[0];
          if (currentTab && currentTab.url && currentTab.url.includes('youtube.com')) {
            if (!currentChannelInfo || !hasChannelSetting(currentChannelInfo)) {
              chrome.tabs.sendMessage(currentTab.id, { 
                action: "setSpeed", 
                speed: defaultSpeed 
              });
            }
          }
        });
      });   
    });
  
    // Check if a channel has custom setting
    function hasChannelSetting(channelName) {
      chrome.storage.sync.get('channels', function(data) {
        const channels = data.channels || {};
        return channels[channelName] !== undefined;
      });
      return false;
    }
  
    // Render channel list
    function renderChannels(channels) {
      channelList.innerHTML = '';
      
      Object.keys(channels).forEach(channel => {
        const speed = channels[channel];
        const channelItem = document.createElement('div');
        channelItem.className = 'channel-item';
        
        // Highlight current channel if it matches
        if (currentChannelInfo && channel === currentChannelInfo) {
          channelItem.classList.add('current');
        }
        
        const channelName = document.createElement('div');
        channelName.className = 'channel-name';
        channelName.textContent = channel;
        
        const speedSelect = document.createElement('select');
        speedSelect.className = 'speed-select';
        [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].forEach(value => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value + (value === 1 ? ' (Normal)' : '');
          option.selected = value.toString() === speed;
          speedSelect.appendChild(option);
        });
        
        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '×';
        
        // Handle speed change
        speedSelect.addEventListener('change', function() {
          chrome.storage.sync.get('channels', function(data) {
            const updatedChannels = data.channels || {};
            updatedChannels[channel] = speedSelect.value;
            chrome.storage.sync.set({ 'channels': updatedChannels }, function() {
              showStatus('Speed updated!');
              
              // If this is the current channel, apply immediately
              if (currentChannelInfo && channel === currentChannelInfo) {
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                  chrome.tabs.sendMessage(tabs[0].id, { 
                    action: "setSpeed", 
                    speed: speedSelect.value 
                  });
                });
              }
            });
          });
        });
        
        // Handle delete
        deleteBtn.addEventListener('click', function() {
          chrome.storage.sync.get('channels', function(data) {
            const updatedChannels = data.channels || {};
            delete updatedChannels[channel];
            chrome.storage.sync.set({ 'channels': updatedChannels }, function() {
              channelItem.remove();
              showStatus('Channel removed!');
              
              // If this was the current channel, revert to default speed
              if (currentChannelInfo && channel === currentChannelInfo) {
                chrome.storage.sync.get('defaultSpeed', function(data) {
                  const defaultSpeed = data.defaultSpeed || '1';
                  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    chrome.tabs.sendMessage(tabs[0].id, { 
                      action: "setSpeed", 
                      speed: defaultSpeed 
                    });
                  });
                });
              }
            });
          });
        });
        
        channelItem.appendChild(channelName);
        channelItem.appendChild(speedSelect);
        channelItem.appendChild(deleteBtn);
        channelList.appendChild(channelItem);
      });
    }
  });