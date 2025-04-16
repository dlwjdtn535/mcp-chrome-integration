chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const command = message.type;
  const args = message.args || [];

  try {
    const commands = {
      'html': () => {
        return document.documentElement.outerHTML || 'No HTML found';
      },
      'changeBackground': () => {
        document.body.style.backgroundColor = 'lightblue';
        return 'Background color changed to light blue';
      },
      'navigateTo': () => {
        if (args.length === 0) {
          throw new Error('URL is required.');
        }
        window.location.href = args[0];
        return `Navigating to ${args[0]}...`;
      },
      'clickElement': (selector) => {
        if (!selector) {
          throw new Error('Selector is required. Usage: click-element #submit-button or click-element .class-name');
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
          throw new Error('Both selector and text are required. Usage: type-text [selector] [text]');
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

    if (commands[command]) {
      const result = commands[command](...args);
      sendResponse({ success: true, result });
    } else {
      sendResponse({
        success: false,
        error: `Unknown command. Available commands: ${Object.keys(commands).join(', ')}`
      });
    }
  } catch (error) {
    console.error('Command execution error:', error);
    sendResponse({ success: false, error: error.message });
  }

  return true; // 모든 메시지에 대해 비동기 응답을 허용
});

// Inform background script that content script is loaded
chrome.runtime.sendMessage({
  type: 'contentScriptLoaded',
  url: window.location.href
});