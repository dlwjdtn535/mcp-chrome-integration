//
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.type === "hello") {
//     setTimeout(() => {
//       sendResponse({ reply: "hello!" });
//     }, 100); // ✅ 비동기 응답
//     return true; // 꼭 true를 반환해야 함
//   }
// });
// Listen for commands from the background script
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   console.log('Content script received message:', message);
//
//   // if (message.type === 'some') {
//     doSomethingInPage();
//     return true; // Keep channel open for async response
//   // }
//
//   // if (message.type === 'executeContentCommand') {
//   //   handleContentCommand(message.command)
//   //     .then(result => sendResponse({ success: true, result }))
//   //     .catch(error => sendResponse({ success: false, error: error.message }));
//   //   return true; // Keep channel open for async response
//   // }
//   //
//   // return false;
// });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script ^^^^^^^^^^^^^', message);
  
  if (message.greeting === "hello") {
    alert('Hello World!');
    console.log("Received greeting message");
    sendResponse({ reply: "Hello from content script!" });
    return true;
  }
  
  if (message.type === "fetchData") {
    fetch("https://api.example.com/data")
        .then(res => res.json())
        .then(data => sendResponse({ result: data }))
        .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  
  return true; // 모든 메시지에 대해 비동기 응답을 허용
});

// Function to handle commands that need to be executed in the page context
async function handleContentCommand(command) {
  try {
    switch (command.action) {
      case 'getElementDetails':
        return getElementDetails(command.selector);
        
      case 'waitForElement':
        return waitForElement(command.selector, command.timeout || 5000);
        
      case 'scrollTo':
        return scrollToElement(command.selector || null, command.options || {});
        
      case 'observeDOM':
        return observeDOM(command.selector, command.options || {});
        
      case 'stopObserving':
        return stopObserving();
        
      default:
        throw new Error(`Unknown content command action: ${command.action}`);
    }
  } catch (error) {
    console.error('Error executing content command:', error);
    throw error;
  }
}

// Get detailed information about an element
function getElementDetails(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    return { exists: false };
  }
  
  // Extract basic information
  const rect = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);
  
  return {
    exists: true,
    tagName: element.tagName,
    id: element.id,
    classes: Array.from(element.classList),
    attributes: getElementAttributes(element),
    text: element.textContent,
    value: element.value,
    isVisible: isElementVisible(element),
    position: {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height
    },
    styles: {
      display: computedStyle.display,
      visibility: computedStyle.visibility,
      opacity: computedStyle.opacity,
      zIndex: computedStyle.zIndex
    }
  };
}

// Wait for an element to appear in the DOM
function waitForElement(selector, timeout) {
  return new Promise((resolve, reject) => {
    // Check if element already exists
    const element = document.querySelector(selector);
    if (element) {
      resolve({ exists: true, timeElapsed: 0 });
      return;
    }
    
    const startTime = Date.now();
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);
    
    // Set up mutation observer to watch for the element
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve({
          exists: true,
          timeElapsed: Date.now() - startTime
        });
      }
    });
    
    // Start observing
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  });
}

// Scroll to a specific element or position
function scrollToElement(selector, options = {}) {
  if (selector) {
    const element = document.querySelector(selector);
    if (!element) {
      return { success: false, message: `Element not found: ${selector}` };
    }
    
    // Scroll to element with smooth behavior by default
    element.scrollIntoView({
      behavior: options.behavior || 'smooth',
      block: options.block || 'center',
      inline: options.inline || 'nearest'
    });
    
    return {
      success: true,
      message: `Scrolled to element: ${selector}`
    };
  } else if (options.x !== undefined || options.y !== undefined) {
    // Scroll to specific coordinates
    window.scrollTo({
      top: options.y || window.scrollY,
      left: options.x || window.scrollX,
      behavior: options.behavior || 'smooth'
    });
    
    return {
      success: true,
      message: `Scrolled to position: (${options.x || window.scrollX}, ${options.y || window.scrollY})`
    };
  }
  
  return { success: false, message: 'Missing selector or coordinates' };
}

// Global observer reference
let domObserver = null;

// Observe DOM changes for specific elements
function observeDOM(selector, options = {}) {
  // Stop any existing observation
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }
  
  const targetElement = selector ? document.querySelector(selector) : document.body;
  if (!targetElement) {
    return { success: false, message: `Target element not found: ${selector}` };
  }
  
  // Create a unique ID for this observation session
  const observationId = Date.now().toString();
  
  // Set up the observer
  domObserver = new MutationObserver((mutations) => {
    const changes = mutations.map(mutation => {
      const change = {
        type: mutation.type,
        target: describeNode(mutation.target)
      };
      
      if (mutation.type === 'attributes') {
        change.attributeName = mutation.attributeName;
        change.oldValue = mutation.oldValue;
        change.newValue = mutation.target.getAttribute(mutation.attributeName);
      } else if (mutation.type === 'characterData') {
        change.oldValue = mutation.oldValue;
        change.newValue = mutation.target.textContent;
      } else if (mutation.type === 'childList') {
        change.addedNodes = Array.from(mutation.addedNodes).map(describeNode);
        change.removedNodes = Array.from(mutation.removedNodes).map(describeNode);
      }
      
      return change;
    });
    
    // Send changes to background script
    chrome.runtime.sendMessage({
      type: 'domObservation',
      observationId,
      changes
    });
  });
  
  // Configure and start observation
  domObserver.observe(targetElement, {
    attributes: options.attributes !== false,
    childList: options.childList !== false,
    subtree: options.subtree !== false,
    characterData: options.characterData !== false,
    attributeOldValue: options.attributeOldValue !== false,
    characterDataOldValue: options.characterDataOldValue !== false
  });
  
  return {
    success: true,
    observationId,
    message: `Started observing ${selector || 'body'}`
  };
}

// Stop DOM observation
function stopObserving() {
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
    return { success: true, message: 'DOM observation stopped' };
  }
  return { success: false, message: 'No active observation to stop' };
}

// Helper function to describe a DOM node
function describeNode(node) {
  if (!node) return null;
  
  if (node.nodeType === Node.ELEMENT_NODE) {
    return {
      nodeType: 'ELEMENT',
      tagName: node.tagName,
      id: node.id,
      className: node.className,
      attributes: getElementAttributes(node)
    };
  } else if (node.nodeType === Node.TEXT_NODE) {
    return {
      nodeType: 'TEXT',
      textContent: node.textContent.substring(0, 100) + (node.textContent.length > 100 ? '...' : '')
    };
  } else {
    return {
      nodeType: 'OTHER',
      nodeTypeCode: node.nodeType
    };
  }
}

// Helper function to get all attributes of an element
function getElementAttributes(element) {
  const attributes = {};
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    attributes[attr.name] = attr.value;
  }
  return attributes;
}

// Helper function to check if an element is visible
function isElementVisible(element) {
  if (!element) return false;
  
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && 
         style.visibility !== 'hidden' && 
         style.opacity !== '0' &&
         element.offsetWidth > 0 &&
         element.offsetHeight > 0;
}

// Inform background script that content script is loaded
chrome.runtime.sendMessage({
  type: 'contentScriptLoaded',
  url: window.location.href
});

function doSomethingInPage() {
  console.log("페이지에서 실행되는 함수!");
  alert('test');
  return "함수 실행 결과";
}