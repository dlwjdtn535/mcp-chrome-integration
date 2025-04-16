chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script ^^^^^^^^^^^^^', message);
  
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
        // window.location.href = args[0];
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

async function executeCommand() {
  const code = jsCodeInput.value.trim();
  
  if (!code) {
    addToLog('Error: Please enter JavaScript code to execute');
    return;
  }

  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if the URL is restricted
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) {
      addToLog('Error: Cannot execute JavaScript in this page. Please try on a regular web page.');
      return;
    }

    // Parse command and arguments
    let command, args;
    if (code.startsWith('run-script')) {
      command = 'run-script';
      args = [code.substring('run-script'.length).trim()];
    } else {
      [command, ...args] = code.split(' ');
    }

    // Execute the code in the active tab
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (command, args) => {
        const commands = {
          'change-background': () => {
            document.body.style.backgroundColor = 'lightblue';
            return 'Background color changed to light blue';
          },
          'count-links': () => {
            const count = document.getElementsByTagName('a').length;
            alert(`Found ${count} links on this page`);
            console.log(`Found ${count} links on this page`);
            return `Found ${count} links on this page`;
          },
          'get-title': () => {
            return `Page title: ${document.title}`;
          },
          'get-url': () => {
            return `Current URL: ${window.location.href}`;
          },
          'scroll-to-bottom': () => {
            window.scrollTo(0, document.body.scrollHeight);
            return 'Scrolled to bottom of page';
          },
          'scroll-to-top': () => {
            window.scrollTo(0, 0);
            return 'Scrolled to top of page';
          },
          'get-html': () => {
            const html = document.documentElement.outerHTML;
            console.log('Page HTML:', html);
            return `HTML retrieved (${html.length} characters). Check console for full HTML.`;
          },
          'navigate-to': (url) => {
            if (!url) {
              throw new Error('URL is required. Usage: navigate-to https://example.com');
            }
            window.location.href = url;
            return `Navigating to ${url}...`;
          },
          'click-element': (selector) => {
            if (!selector) {
              throw new Error('Selector is required. Usage: click-element #submit-button or click-element .class-name');
            }
            
            // Try different selector types
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

            // Try different selector types
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

            // Focus the element
            element.focus();

            // Clear existing value if it's an input/textarea
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
              element.value = '';
              // Trigger input event
              element.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              // For contenteditable elements
              element.textContent = '';
            }

            // Type the text
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
              element.value = text;
              // Trigger input and change events
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              // For contenteditable elements
              element.textContent = text;
              element.dispatchEvent(new InputEvent('input', { bubbles: true }));
            }

            return `Typed "${text}" into element: ${selector}`;
          },
          'run-script': (script) => {
            if (!script) {
              throw new Error('Script is required. Usage: run-script <your JavaScript code>');
            }
            try {
              const scriptFunction = new Function(script);
              const result = scriptFunction();
              console.log('Script execution result:', result);
              return typeof result === 'undefined' ? 'Script executed successfully' : 
                     `Script result: ${JSON.stringify(result)}`;
            } catch (error) {
              console.error('Script execution error:', error);
              throw new Error(`Script execution failed: ${error.message}`);
            }
          },
          // New commands
          'get-meta-tags': () => {
            const metaTags = Array.from(document.getElementsByTagName('meta'));
            const metaInfo = metaTags.map(tag => ({
              name: tag.getAttribute('name'),
              property: tag.getAttribute('property'),
              content: tag.getAttribute('content'),
              charset: tag.getAttribute('charset'),
              httpEquiv: tag.getAttribute('http-equiv')
            }));
            console.log('Meta tags:', metaInfo);
            return `Found ${metaInfo.length} meta tags. Check console for details.`;
          },
          'get-images': () => {
            const images = Array.from(document.getElementsByTagName('img'));
            const imageInfo = images.map(img => ({
              src: img.src,
              alt: img.alt,
              width: img.width,
              height: img.height,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              loading: img.loading,
              className: img.className
            }));
            console.log('Images:', imageInfo);
            return `Found ${imageInfo.length} images. Check console for details.`;
          },
          'get-forms': () => {
            const forms = Array.from(document.getElementsByTagName('form'));
            const formInfo = forms.map(form => ({
              id: form.id,
              name: form.name,
              method: form.method,
              action: form.action,
              elements: Array.from(form.elements).map(element => ({
                type: element.type,
                name: element.name,
                id: element.id,
                value: element.type === 'password' ? '***' : element.value,
                required: element.required,
                disabled: element.disabled
              }))
            }));
            console.log('Forms:', formInfo);
            return `Found ${formInfo.length} forms. Check console for details.`;
          },
          'get-links': () => {
            const links = Array.from(document.getElementsByTagName('a'));
            const linkInfo = links.map(link => ({
              href: link.href,
              text: link.textContent.trim(),
              title: link.title,
              target: link.target,
              rel: link.rel,
              className: link.className,
              isVisible: link.offsetParent !== null
            }));
            console.log('Links:', linkInfo);
            return `Found ${linkInfo.length} links. Check console for details.`;
          },
          // Bookmark commands
          'list-bookmarks': async () => {
            const bookmarks = await chrome.bookmarks.getTree();
            console.log('Bookmarks:', bookmarks);
            return 'Bookmarks retrieved. Check console for details.';
          },
          'add-bookmark': async (url, title) => {
            if (!url) throw new Error('URL is required. Usage: add-bookmark [url] [title]');
            const bookmark = await chrome.bookmarks.create({
              url: url,
              title: title || url
            });
            return `Bookmark added: ${bookmark.title}`;
          },
          // History commands
          'get-history': async (searchQuery) => {
            const history = await chrome.history.search({
              text: searchQuery || '',
              maxResults: 100
            });
            console.log('History:', history);
            return `Found ${history.length} history items. Check console for details.`;
          },
          // Download commands
          'download-file': (url) => {
            if (!url) throw new Error('URL is required. Usage: download-file [url]');
            chrome.downloads.download({ url: url });
            return `Download started for: ${url}`;
          },
          'show-downloads': async () => {
            const downloads = await chrome.downloads.search({});
            console.log('Downloads:', downloads);
            return `Found ${downloads.length} downloads. Check console for details.`;
          },
          // Notification commands
          'show-notification': (title, message) => {
            if (!title || !message) throw new Error('Title and message required. Usage: show-notification [title] [message]');
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'images/icon128.png',
              title: title,
              message: message
            });
            return 'Notification sent';
          },
          // Clipboard commands
          'copy-to-clipboard': async (text) => {
            if (!text) throw new Error('Text is required. Usage: copy-to-clipboard [text]');
            await navigator.clipboard.writeText(text);
            return 'Text copied to clipboard';
          },
          'read-clipboard': async () => {
            const text = await navigator.clipboard.readText();
            return `Clipboard contents: ${text}`;
          },
          // Cookie commands
          'get-cookies': async () => {
            const cookies = await chrome.cookies.getAll({});
            console.log('Cookies:', cookies);
            return `Found ${cookies.length} cookies. Check console for details.`;
          },
          'delete-cookies': async (domain) => {
            if (!domain) throw new Error('Domain is required. Usage: delete-cookies [domain]');
            const removed = await chrome.cookies.getAll({ domain: domain });
            for (const cookie of removed) {
              await chrome.cookies.remove({
                url: `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`,
                name: cookie.name
              });
            }
            return `Removed ${removed.length} cookies from ${domain}`;
          },
          // System commands
          'get-system-info': async () => {
            const cpu = await chrome.system.cpu.getInfo();
            const memory = await chrome.system.memory.getInfo();
            const storage = await chrome.system.storage.getInfo();
            console.log('System Info:', { cpu, memory, storage });
            return 'System information retrieved. Check console for details.';
          },
          // Geolocation commands
          'get-location': () => {
            return new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  const { latitude, longitude } = position.coords;
                  resolve(`Location: ${latitude}, ${longitude}`);
                },
                (error) => reject(`Geolocation error: ${error.message}`)
              );
            });
          },
          // Power commands
          'get-power-info': async () => {
            if (navigator.getBattery) {
              const battery = await navigator.getBattery();
              return `Battery: ${(battery.level * 100).toFixed(1)}%, ${battery.charging ? 'Charging' : 'Not charging'}`;
            }
            return 'Battery information not available';
          }
        };

        if (commands[command]) {
          return { success: true, result: commands[command](...args) };
        } else {
          return { 
            success: false, 
            error: `Unknown command. Available commands: ${Object.keys(commands).join(', ')}`
          };
        }
      },
      args: [command, args]
    });

    // Log the result
    const executionResult = result[0].result;
    if (executionResult.success) {
      addToLog(`Success: ${executionResult.result}`);
    } else {
      addToLog(`Error: ${executionResult.error}`);
    }
  } catch (error) {
    addToLog(`Error: ${error.message}`);
  }
}
