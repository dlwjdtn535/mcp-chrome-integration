// Global WebSocket connection
let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 5000; // 5 seconds

// Initialize connection from saved settings
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['serverUrl'], (result) => {
    if (result.serverUrl) {
      connectToServer(result.serverUrl);
    }
  });
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received @@#@#@#@#@#:12313', message);
  switch (message.action) {
    case 'connect':
      connectToServer(message.serverUrl)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep the message channel open for async response

    case 'disconnect':
      disconnectFromServer()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'checkConnection':
      sendResponse({ isConnected: isConnected });
      return false;

    case 'executeCommand':
      handleServerCommand(message.command)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
  }
});

// Connect to WebSocket server
function connectToServer(serverUrl) {
  return new Promise((resolve, reject) => {
    if (isConnected) {
      disconnectFromServer();
    }

    try {
      socket = new WebSocket(serverUrl);

      socket.onopen = () => {
        isConnected = true;
        reconnectAttempts = 0;
        clearTimeout(reconnectTimer);
        console.log('Connected to server');
        resolve();
      };

      socket.onclose = (event) => {
        isConnected = false;
        socket = null;
        console.log('Disconnected:', event.reason || 'Connection closed');

        // Try to reconnect if not manually disconnected
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          reconnectTimer = setTimeout(() => {
            chrome.storage.local.get(['serverUrl'], (result) => {
              if (result.serverUrl) {
                connectToServer(result.serverUrl);
              }
            });
          }, RECONNECT_INTERVAL);
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(new Error('WebSocket connection error'));
      };

      socket.onmessage = (event) => {
        handleServerMessage(event.data);
      };
    } catch (error) {
      reject(error);
    }
  });
}

// Disconnect from WebSocket server
function disconnectFromServer() {
  return new Promise((resolve, reject) => {
    try {
      if (socket) {
        reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
        clearTimeout(reconnectTimer);
        socket.close(1000, 'Manually disconnected');
        isConnected = false;
        socket = null;
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

// Handle incoming WebSocket messages
function handleServerMessage(data) {
  console.log('handleServerMessage:', data);
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || tabs.length === 0) {
      console.log('No active tab found');
      return;
    }
    
    console.log('Sending message to tab:', tabs[0].id);
    chrome.tabs.sendMessage(tabs[0].id, {greeting: "hello"}, function(response) {
      if (chrome.runtime.lastError) {
        console.log('Error sending message:', chrome.runtime.lastError.message);
        // content script가 없는 경우 inject
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['content.js']
        }).then(() => {
          // inject 후 다시 메시지 전송
          chrome.tabs.sendMessage(tabs[0].id, {greeting: "hello"}, function(response) {
            console.log('Message sent after injection:', response);
          });
        }).catch(err => {
          console.error('Script injection failed:', err);
        });
      } else {
        console.log('Message sent successfully:', response);
      }
    });
  });
}

