// Tab-specific WebSocket connections
const tabConnections = new Map();

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 5000; // 5 seconds

class TabConnection {
  constructor(tabId) {
    this.tabId = tabId;
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    this.reconnectTimer = null;
    this.serverUrl = 'ws://localhost:8012/mcp';
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        this.disconnect();
      }

      try {
        const wsUrl = `${this.serverUrl}/${this.tabId}`;
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          clearTimeout(this.reconnectTimer);
          console.log(`Tab ${this.tabId}: Connected to server`);

          this.sendState();
          resolve();
        };

        this.socket.onclose = () => {
          this.isConnected = false;
          this.socket = null;
          console.log(`Tab ${this.tabId}: Disconnected from server`);
          this.attemptReconnect();
        };

        this.socket.onerror = (error) => {
          console.error(`Tab ${this.tabId}: WebSocket error:`, error);
          this.isConnected = false;
          this.socket = null;
          reject(error);
        };

        this.socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleCommand(message);
            this.sendState();
          } catch (error) {
            console.error(`Tab ${this.tabId}: Error parsing message:`, error);
          }
        };
      } catch (error) {
        console.error(`Tab ${this.tabId}: Connection error:`, error);
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.reconnectAttempts = this.maxReconnectAttempts;
      clearTimeout(this.reconnectTimer);
      this.socket.close(1000, 'Manually disconnected');
      this.isConnected = false;
      this.socket = null;
    }
  }

  handleCommand(message) {
    const tabId = this.tabId; // Store tabId in local variable to avoid 'this' context issues
    chrome.tabs.sendMessage(tabId, message, () => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        }).then(() => {
          chrome.tabs.sendMessage(tabId, message, () => {
          });
        });
      }
    });
  }

  sendState() {
    console.log('Sending state to server');
    const tabId = this.tabId;
    const socket = this.socket;
    chrome.tabs.sendMessage(tabId, {
      type: 'status',
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.log('updateState 1');
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        }).then(() => {
          chrome.tabs.sendMessage(tabId, data, function(response) {
            if (response.success) {
              socket.send(JSON.stringify({
                type: 'updateState',
                args: [response.result.url, response.result.html],
              }));
            }
          });
        }).catch(err => {
        });
      } else {
        console.log('updateState 2 ', response);
        if (response.success) {
          socket.send(JSON.stringify({
            type: 'updateState',
            args: [response.result.url, response.result.html],
          }));
        }
      }
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.reconnectTimer = setTimeout(() => {
        this.connect().catch(error => {
          console.error(`Failed to reconnect WebSocket for tab ${this.tabId}:`, error);
        });
      }, this.reconnectDelay);
    }
  }
}

// Initialize connection from saved settings for new tabs
chrome.tabs.onCreated.addListener((tab) => {
  chrome.storage.local.get(['serverUrl'], (result) => {
    if (result.serverUrl && tab.id) {
      const connection = new TabConnection(tab.id);
      tabConnections.set(tab.id, connection);
      connection.connect();
    }
  });
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // For content script messages, use sender.tab.id
  // For popup messages, use message.tabId
  const tabId = sender.tab?.id || message.tabId;

  if (!tabId) {
    console.error('No tab ID available');
    sendResponse({ success: false, error: 'No tab ID available' });
    return true;
  }

  if (message.type === 'getTabId') {
    sendResponse({ tabId: tabId });
    return true;
  }

  if (message.type === 'contentScriptLoaded') {
    let connection = tabConnections.get(tabId);
    if (!connection) {
      connection = new TabConnection(tabId);
      tabConnections.set(tabId, connection);
      connection.connect().catch(error => {
        console.error(`Failed to connect WebSocket for tab ${tabId}:`, error);
      });
    }
    sendResponse({ success: true });
    return true;
  }

  // Handle popup actions
  if (message.action) {
    switch (message.action) {
      case 'connect': {
        let connection = tabConnections.get(tabId);
        if (!connection) {
          connection = new TabConnection(tabId);
          tabConnections.set(tabId, connection);
        }

        connection.connect()
          .then(() => {
            chrome.storage.local.set({ serverUrl: message.serverUrl });
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('Connection error:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }

      case 'disconnect': {
        const connection = tabConnections.get(tabId);
        if (connection) {
          connection.disconnect();
          tabConnections.delete(tabId);
        }
        sendResponse({ success: true });
        return true;
      }

      case 'checkConnection': {
        const connection = tabConnections.get(tabId);
        sendResponse({ 
          success: true, 
          isConnected: connection?.isConnected || false 
        });
        return true;
      }

      default:
        console.error('Unknown action:', message.action);
        sendResponse({ success: false, error: `Unknown action: ${message.action}` });
        return true;
    }
  }

  // Forward other messages to the appropriate tab connection
  const connection = tabConnections.get(tabId);
  if (connection && connection.socket && connection.socket.readyState === WebSocket.OPEN) {
    try {
      connection.socket.send(JSON.stringify({
        ...message,
        tabId: tabId
      }));
      sendResponse({ success: true });
    } catch (error) {
      console.error(`Error forwarding message to server for tab ${tabId}:`, error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  } else {
    sendResponse({ success: false, error: 'WebSocket connection not available' });
    return true;
  }
});

// Clean up connections when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  const connection = tabConnections.get(tabId);
  if (connection) {
    connection.disconnect();
    tabConnections.delete(tabId);
  }
});

// Track tab updates
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   if (changeInfo.status === 'complete') {
//     console.log('Tab updated:', tabId, tab.url);
//     const connection = tabConnections.get(tabId);
//     if (connection?.isConnected) {
//       connection.sendState();
//     }
//   }
// });
