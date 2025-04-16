// Command definitions
const commands = {
  'status': () => {
    try {
      return {
        url: window.location.href || 'No URL available',
        html: document.documentElement.outerHTML || 'No HTML available',
      };
    } catch (e) {
      // chrome:// URL에서의 접근 오류 처리
      return {
        url: 'chrome:// URL (access restricted)',
        html: 'No HTML available (chrome:// URL)',
      };
    }
  },
  'changeBackground': () => {
    try {
      document.body.style.backgroundColor = 'lightblue';
      return 'Background color changed to light blue';
    } catch (e) {
      return 'Cannot change background on chrome:// URL';
    }
  },
  'navigateTo': (url) => {
    console.log('Navigating to', url);
    if (!url) {
      throw new Error('URL is required.');
    }
    // chrome:// URL로의 네비게이션 시도 방지
    if (url.startsWith('chrome://')) {
      throw new Error('Cannot navigate to chrome:// URLs');
    }
    window.location.href = url;
    return `Navigating to ${url}...`;
  },
  'clickElement': (selector) => {
    if (!selector) {
      throw new Error('Selector is required.');
    }

    let element = document.querySelector(selector);
    if (!element) {
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
  'typeText': (selector, text) => {
    if (!selector || !text) {
      throw new Error('Both selector and text are required.');
    }

    let element = document.querySelector(selector);
    if (!element) {
      element = Array.from(document.getElementsByTagName('input')).find(el =>
        el.placeholder?.toLowerCase().includes(selector.toLowerCase())
      );

      if (!element) {
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
  },
  'getElementInfo': (selector) => {
    if (!selector) {
      throw new Error('Selector is required');
    }

    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    
    return {
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      textContent: element.textContent?.trim(),
      attributes: Array.from(element.attributes).map(attr => ({
        name: attr.name,
        value: attr.value
      })),
      dimensions: {
        width: rect.width,
        height: rect.height,
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX
      },
      styles: {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        position: computedStyle.position,
        zIndex: computedStyle.zIndex,
        backgroundColor: computedStyle.backgroundColor,
        color: computedStyle.color
      },
      isVisible: rect.width > 0 && rect.height > 0 && 
                computedStyle.display !== 'none' && 
                computedStyle.visibility !== 'hidden'
    };
  },
  'waitForElement': async (selector, timeout = 5000) => {
    if (!selector) {
      throw new Error('Selector is required');
    }

    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        return { found: true, timeElapsed: Date.now() - startTime };
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Timeout waiting for element: ${selector}`);
  },
  'fillForm': (formData) => {
    if (!formData || typeof formData !== 'object') {
      throw new Error('Form data object is required');
    }

    const results = [];
    for (const [selector, value] of Object.entries(formData)) {
      try {
        const element = document.querySelector(selector);
        if (!element) {
          results.push({ selector, status: 'error', message: 'Element not found' });
          continue;
        }

        if (element.tagName === 'SELECT') {
          element.value = value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (element.type === 'checkbox' || element.type === 'radio') {
          element.checked = value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (['INPUT', 'TEXTAREA'].includes(element.tagName)) {
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        results.push({ selector, status: 'success' });
      } catch (error) {
        results.push({ selector, status: 'error', message: error.message });
      }
    }

    return results;
  },
  'extractTable': (selector) => {
    if (!selector) {
      throw new Error('Table selector is required');
    }

    const table = document.querySelector(selector);
    if (!table) {
      throw new Error(`Table not found: ${selector}`);
    }

    const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
    const rows = Array.from(table.querySelectorAll('tr')).map(tr => 
      Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
    ).filter(row => row.length > 0);

    return {
      headers,
      rows,
      rowCount: rows.length,
      columnCount: headers.length || (rows[0] && rows[0].length) || 0
    };
  },
  'takeScreenshot': async (selector) => {
    try {
      // This is a placeholder as actual screenshot functionality requires additional setup
      if (selector) {
        const element = document.querySelector(selector);
        if (!element) {
          throw new Error(`Element not found: ${selector}`);
        }
        return { message: 'Screenshot of element requested', selector };
      }
      return { message: 'Full page screenshot requested' };
    } catch (error) {
      throw new Error(`Screenshot failed: ${error.message}`);
    }
  }
};

// Handle messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const command = message.type;
  const args = message.args || [];

  // 비동기 작업을 처리하기 위해 Promise를 사용
  const handleCommand = async () => {
    try {
      if (commands[command]) {
        const result = await Promise.resolve(commands[command](...args));
        return { success: true, result };
      } else {
        return {
          success: false,
          error: `Unknown command. Available commands: ${Object.keys(commands).join(', ')}`
        };
      }
    } catch (error) {
      console.error('Command execution error:', error);
      return { success: false, error: error.message };
    }
  };

  // 비동기 응답을 처리하기 위해 handleCommand를 실행하고 결과를 sendResponse로 전달
  handleCommand().then(response => {
    try {
      sendResponse(response);
    } catch (error) {
      console.error('Error sending response:', error);
    }
  }).catch(error => {
    try {
      sendResponse({ success: false, error: error.message });
    } catch (e) {
      console.error('Error sending error response:', e);
    }
  });

  // true를 반환하여 메시지 채널을 열어둠
  return true;
});

// Inform background script that content script is loaded
chrome.runtime.sendMessage({
  type: 'contentScriptLoaded',
  url: window.location.href
}, (response) => {
  if (chrome.runtime.lastError) {
    console.error('Error sending contentScriptLoaded message:', chrome.runtime.lastError);
  }
});