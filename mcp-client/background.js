// Global WebSocket connection
let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 5000; // 5 seconds

// Initialize connection from saved settings
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['serverUrl', 'autoConnect'], (result) => {
    if (result.autoConnect && result.serverUrl) {
      connectToServer(result.serverUrl);
    }
  });
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
        
        // Notify all open popup views
        broadcastConnectionUpdate(true, 'Connected to server');
        resolve();
      };
      
      socket.onclose = (event) => {
        isConnected = false;
        socket = null;
        
        broadcastConnectionUpdate(false, `Disconnected: ${event.reason || 'Connection closed'}`);
        
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
        broadcastConnectionUpdate(false, `WebSocket error: ${error.message || 'Unknown error'}`);
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
        // Clear reconnect attempts
        reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
        clearTimeout(reconnectTimer);
        
        // Close connection
        socket.close(1000, 'Manually disconnected');
        isConnected = false;
        socket = null;
        
        broadcastConnectionUpdate(false, 'Manually disconnected from server');
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

// Handle incoming WebSocket messages
function handleServerMessage(data) {
  try {
    const message = JSON.parse(data);
    
    // Log received message
    console.log('Received message from server:', message);
    
    // Execute commands based on message type
    switch (message.type) {
      case 'command':
        handleServerCommand(message.data);
        break;
        
      case 'ping':
        // Respond to ping with pong
        if (socket && isConnected) {
          socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  } catch (error) {
    console.error('Error processing server message:', error);
  }
}

// Handle commands from the server
async function handleServerCommand(command) {
  // Based on command type, execute different browser actions
  try {
    switch (command.action) {
      case 'navigate':
        // Navigate to URL
        if (command.url) {
          const tab = await getCurrentTab();
          await chrome.tabs.update(tab.id, { url: command.url });
          return { success: true, message: `Navigated to ${command.url}` };
        }
        return { success: false, message: 'URL is required for navigation' };
        
      case 'click':
        // Click on element
        if (command.selector) {
          const tab = await getCurrentTab();
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: clickElement,
            args: [command.selector]
          });
          return { success: true, message: `Clicked on element: ${command.selector}` };
        }
        return { success: false, message: 'Selector is required for click action' };
        
      case 'type':
        // Type text
        if (command.selector && command.text !== undefined) {
          const tab = await getCurrentTab();
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: typeText,
            args: [command.selector, command.text]
          });
          return { success: true, message: `Typed text into: ${command.selector}` };
        }
        return { success: false, message: 'Selector and text are required for type action' };
        
      case 'getContent':
        // Get page content
        const tab = await getCurrentTab();
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: getPageContent,
          args: [command.selector]
        });
        return { success: true, content: result[0].result };
        
      case 'executeScript':
        // Execute custom JavaScript
        if (command.script) {
          const tab = await getCurrentTab();
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: (script) => {
              return eval(script);
            },
            args: [command.script]
          });
          return { success: true, result: result[0].result };
        }
        return { success: false, message: 'Script is required for executeScript action' };
        
      default:
        return { success: false, message: `Unknown command action: ${command.action}` };
    }
  } catch (error) {
    console.error('Error executing command:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to get current active tab
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Helper function to broadcast connection status updates
function broadcastConnectionUpdate(isConnected, message) {
  chrome.runtime.sendMessage({
    action: 'connectionUpdate',
    isConnected: isConnected,
    message: message
  });
}

// Content script injection functions
function clickElement(selector) {
  const element = document.querySelector(selector);
  if (element) {
    element.click();
    return true;
  }
  return false;
}

function typeText(selector, text) {
  const element = document.querySelector(selector);
  if (element) {
    element.focus();
    element.value = text;
    // Create and dispatch an input event
    const inputEvent = new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);
    // Also dispatch change event
    const changeEvent = new Event('change', { bubbles: true });
    element.dispatchEvent(changeEvent);
    return true;
  }
  return false;
}

function getPageContent(selector) {
  if (selector) {
    const element = document.querySelector(selector);
    return element ? element.innerHTML : null;
  } else {
    return document.documentElement.outerHTML;
  }
}
