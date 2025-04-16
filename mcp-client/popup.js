// DOM elements
const connectButton = document.getElementById('connectBtn');
const serverUrlInput = document.getElementById('serverUrl');
const statusText = document.getElementById('connectionStatus');
const logContainer = document.getElementById('logContainer');

// Event Listeners
document.addEventListener('DOMContentLoaded', initializePopup);

// Initialize popup with stored settings
async function initializePopup() {
  // Load saved server URL from storage
  chrome.storage.local.get(['serverUrl'], (result) => {
    if (result.serverUrl) {
      serverUrlInput.value = result.serverUrl;
    }
  });
  
  // Check current connection status
  await checkConnectionStatus();

  // Set up connect/disconnect button handler
  connectButton.addEventListener('click', async () => {
    const serverUrl = serverUrlInput.value.trim();
    if (!serverUrl) {
      addToLog('Please enter server URL');
      return;
    }

    try {
      // Get the current active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) {
        addToLog('No active tab found');
        return;
      }

      addToLog(`Using tab ID: ${activeTab.id}`);
      const isConnected = connectButton.textContent === 'Disconnect';
      const action = isConnected ? 'disconnect' : 'connect';
      
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: action,
          serverUrl: serverUrl,
          tabId: activeTab.id
        }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: false, error: 'No response from background script' });
          }
        });
      });

      debugger

      if (response.success) {
        if (action === 'connect') {
          updateConnectionUI(true);
          addToLog('Connected to server');
        } else {
          updateConnectionUI(false);
          addToLog('Disconnected from server');
        }
      } else {
        addToLog(`Connection failed: ${response.error}`);
        updateConnectionUI(false);
      }
    } catch (error) {
      addToLog(`Error: ${error.message}`);
      updateConnectionUI(false);
    }
  });
}

// Helper function to add log messages
function addToLog(message) {
  const logEntry = document.createElement('div');
  logEntry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// Update UI based on connection status
function updateConnectionUI(connected) {
  if (connected) {
    statusText.textContent = 'Connected';
    statusText.className = 'status connected';
    connectButton.textContent = 'Disconnect';
  } else {
    statusText.textContent = 'Disconnected';
    statusText.className = 'status disconnected';
    connectButton.textContent = 'Connect';
  }
}

// Initialize popup and check connection status
async function checkConnectionStatus() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) {
      addToLog('No active tab found');
      updateConnectionUI(false);
      return;
    }

    addToLog(`Checking connection for tab ID: ${activeTab.id}`);
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'checkConnection',
        tabId: activeTab.id
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ isConnected: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { isConnected: false });
        }
      });
    });

    if (response.isConnected) {
      updateConnectionUI(true);
      addToLog('Connected to server');
    } else {
      updateConnectionUI(false);
      addToLog(response.error ? `Not connected: ${response.error}` : 'Not connected');
    }
  } catch (error) {
    addToLog(`Error checking connection: ${error.message}`);
    updateConnectionUI(false);
  }
}