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
  try {
    const message = JSON.parse(data);
    console.log('Received message:', message);
    
    if (message.type === 'command') {
      handleServerCommand(message.data).then(result => {
        // Send command result back to server
        if (socket && isConnected) {
          socket.send(JSON.stringify({
            type: 'command_result',
            data: result
          }));
        }
      });
    }
  } catch (error) {
    console.error('Error processing message:', error);
  }
}

// Handle commands from the server
async function handleServerCommand(command) {
  try {
    const tab = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab[0]) return { success: false, message: 'No active tab found' };
    
    // Skip if tab URL is restricted
    if (!tab[0].url || tab[0].url.startsWith('chrome://') || 
        tab[0].url.startsWith('edge://') || tab[0].url.startsWith('about:') || 
        tab[0].url.startsWith('chrome-extension://')) {
      return { success: false, message: 'Cannot execute commands in this page' };
    }

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab[0].id },
      func: executeCommand,
      args: [command]
    });

    return result[0].result;
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// Function to be injected into the page
function executeCommand(command) {
  const commands = {
    'click-element': (selector) => {
      if (!selector) {
        throw new Error('Selector is required. Usage: click-element [selector]');
      }
      
      let element = document.querySelector(selector);
      if (!element) {
        // Try finding by text content
        const elements = Array.from(document.getElementsByTagName('*'));
        element = elements.find(el => 
          el.textContent?.trim().toLowerCase() === selector.toLowerCase() &&
          (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT' || 
           el.role === 'button' || el.getAttribute('onclick'))
        );
      }

      if (!element) {
        throw new Error(`No clickable element found with selector: ${selector}`);
      }

      element.click();
      return `Clicked element: ${selector}`;
    },
    'type-text': (selector, text) => {
      if (!selector || !text) {
        throw new Error('Both selector and text are required. Usage: type-text [selector] [text]');
      }

      let element = document.querySelector(selector);
      if (!element) {
        // Try finding by placeholder
        element = Array.from(document.getElementsByTagName('input')).find(el => 
          el.placeholder?.toLowerCase().includes(selector.toLowerCase())
        );

        if (!element) {
          // Try finding by label
          const labels = Array.from(document.getElementsByTagName('label'));
          const label = labels.find(l => 
            l.textContent?.toLowerCase().includes(selector.toLowerCase())
          );
          if (label && label.htmlFor) {
            element = document.getElementById(label.htmlFor);
          }
        }
      }

      if (!element) {
        throw new Error(`No input element found with selector: ${selector}`);
      }

      if (!['INPUT', 'TEXTAREA'].includes(element.tagName) && 
          !element.isContentEditable) {
        throw new Error(`Element ${selector} is not an input field`);
      }

      element.focus();
      
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        element.textContent = text;
        element.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }

      return `Typed "${text}" into element: ${selector}`;
    }
  };

  try {
    const { name, args } = command;
    if (commands[name]) {
      const result = commands[name](...(args || []));
      return { success: true, result: result };
    } else {
      return { 
        success: false, 
        error: `Unknown command: ${name}. Available commands: ${Object.keys(commands).join(', ')}`
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}
