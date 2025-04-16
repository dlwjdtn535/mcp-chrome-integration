// Global variables
let socket = null;
let isConnected = false;

// DOM elements
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const serverUrlInput = document.getElementById('serverUrl');
const connectionStatus = document.getElementById('connectionStatus');
const logContainer = document.getElementById('logContainer');

// Event Listeners
document.addEventListener('DOMContentLoaded', initializePopup);
connectBtn.addEventListener('click', connectToServer);
disconnectBtn.addEventListener('click', disconnectFromServer);

// Initialize popup with stored settings
function initializePopup() {
  // Load saved server URL from storage
  chrome.storage.local.get(['serverUrl'], (result) => {
    if (result.serverUrl) {
      serverUrlInput.value = result.serverUrl;
    }
  });
  
  // Check if already connected (via background script)
  chrome.runtime.sendMessage({ action: 'checkConnection' }, (response) => {
    if (response && response.isConnected) {
      updateConnectionUI(true);
      addToLog('Connection active from background script');
    }
  });
}

// Connect to WebSocket server
function connectToServer() {
  const serverUrl = serverUrlInput.value.trim();
  
  if (!serverUrl) {
    addToLog('Error: Server URL is required');
    return;
  }
  
  // Save server URL
  chrome.storage.local.set({ serverUrl: serverUrl });
  
  // Send connection request to background script
  chrome.runtime.sendMessage(
    { 
      action: 'connect', 
      serverUrl: serverUrl 
    }, 
    (response) => {
      if (response && response.success) {
        updateConnectionUI(true);
        addToLog(`Connected to: ${serverUrl}`);
      } else {
        addToLog(`Failed to connect: ${response?.error || 'Unknown error'}`);
      }
    }
  );
}

// Disconnect from WebSocket server
function disconnectFromServer() {
  chrome.runtime.sendMessage({ action: 'disconnect' }, (response) => {
    if (response && response.success) {
      updateConnectionUI(false);
      addToLog('Disconnected from server');
    } else {
      addToLog(`Failed to disconnect: ${response?.error || 'Unknown error'}`);
    }
  });
}

// Update UI based on connection status
function updateConnectionUI(connected) {
  isConnected = connected;
  
  if (connected) {
    connectionStatus.textContent = 'Connected';
    connectionStatus.className = 'status connected';
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
  } else {
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.className = 'status disconnected';
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
  }
}

// Add message to log
function addToLog(message) {
  const logEntry = document.createElement('div');
  logEntry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}