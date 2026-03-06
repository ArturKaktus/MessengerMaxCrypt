/**
 * Max Encrypted - Content Script
 * Шифрует исходящие сообщения и расшифровывает входящие
 */

console.log('%c🔐 Max Encrypted загружен', 'background: #4CAF50; color: white; font-size: 14px; padding: 5px;');

const Logger = {
    log: (...args) => console.log('%c🔐', 'color: #4CAF50; font-weight: bold;', ...args),
    success: (...args) => console.log('%c✅', 'color: green; font-weight: bold;', ...args),
    error: (...args) => console.log('%c❌', 'color: red; font-weight: bold;', ...args)
};

// ========== КРИПТОГРАФИЯ ==========

/**
 * Шифрует сообщение с использованием AES-GCM
 * @param {string} text - текст для шифрования
 * @param {string} key - ключ шифрования
 * @returns {Promise<string>} зашифрованная строка в формате base64
 */
async function encryptMessage(text, key) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        
        const keyData = new Uint8Array(32);
        const keyEncoder = new TextEncoder();
        const keyBytes = keyEncoder.encode(key);
        for (let i = 0; i < 32; i++) {
            keyData[i] = i < keyBytes.length ? keyBytes[i] : 0;
        }
        
        const cryptoKey = await crypto.subtle.importKey(
            'raw', keyData, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
        );
        
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv, tagLength: 128 }, cryptoKey, data
        );
        
        const result = new Uint8Array(iv.length + encrypted.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(encrypted), iv.length);
        
        let binary = '';
        for (let i = 0; i < result.length; i++) {
            binary += String.fromCharCode(result[i]);
        }
        
        return btoa(binary);
    } catch (error) {
        Logger.error('Ошибка шифрования:', error);
        throw error;
    }
}

/**
 * Дешифрует сообщение
 * @param {string} encryptedData - зашифрованные данные в base64
 * @param {string} key - ключ шифрования
 * @returns {Promise<string|null>} расшифрованный текст или null при ошибке
 */
async function decryptMessage(encryptedData, key) {
    try {
        const data = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
        const iv = data.slice(0, 12);
        const encrypted = data.slice(12);
        
        const keyData = new Uint8Array(32);
        const keyEncoder = new TextEncoder();
        const keyBytes = keyEncoder.encode(key);
        for (let i = 0; i < 32; i++) {
            keyData[i] = i < keyBytes.length ? keyBytes[i] : 0;
        }
        
        const cryptoKey = await crypto.subtle.importKey(
            'raw', keyData, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
        );
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv, tagLength: 128 },
            cryptoKey,
            encrypted
        );
        
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (error) {
        Logger.error('Ошибка дешифровки:', error);
        return null;
    }
}

// ========== РАБОТА С DOM ==========

/**
 * Находит поле ввода сообщения
 * @returns {Element|null}
 */
function findInputField() {
    const input = document.querySelector('div.contenteditable.svelte-1k31az8[contenteditable=""]');
    if (input) Logger.log('Поле ввода найдено');
    return input;
}

/**
 * Получает текст из поля ввода
 * @param {Element} input - поле ввода
 * @returns {string}
 */
function getInputText(input) {
    if (!input) return '';
    
    const span = input.querySelector('span[data-lexical-text="true"]');
    if (span?.textContent) return span.textContent;
    
    const p = input.querySelector('p.paragraph');
    if (p) return p.textContent || '';
    
    return input.textContent || '';
}

/**
 * Устанавливает текст в поле ввода
 * @param {Element} input - поле ввода
 * @param {string} text - новый текст
 */
function setInputText(input, text) {
    if (!input) return;
    
    Logger.log('Устанавливаем текст:', text);
    
    input.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, text);
    
    // Обновляем структуру HTML
    setTimeout(() => {
        let p = input.querySelector('p.paragraph');
        if (!p) {
            p = document.createElement('p');
            p.className = 'paragraph';
            p.setAttribute('dir', 'auto');
            input.appendChild(p);
        }
        
        let span = p.querySelector('span[data-lexical-text="true"]');
        if (!span) {
            span = document.createElement('span');
            span.setAttribute('data-lexical-text', 'true');
            p.appendChild(span);
        }
        
        span.textContent = text;
    }, 10);
    
    // Триггерим события
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('keyup', { bubbles: true }));
    
    Logger.success('Текст установлен');
}

/**
 * Находит кнопку отправки
 * @returns {Element|null}
 */
function findSendButton() {
    return document.querySelector('button[aria-label="Отправить сообщение"]');
}

// ========== РАБОТА С ХРАНИЛИЩЕМ ==========

/**
 * Получает текущий ключ из storage напрямую
 * @returns {Promise<string|null>}
 */
async function getCurrentKey() {
    try {
        const result = await browser.storage.local.get(['encryptionKey']);
        return result.encryptionKey;
    } catch (error) {
        Logger.error('Ошибка получения ключа из storage:', error);
        return null;
    }
}

/**
 * Слушает обновления ключа из popup
 * @param {Function} callback - функция при обновлении ключа
 */
function listenForKeyUpdates(callback) {
    browser.runtime.onMessage.addListener((request) => {
        if (request.action === 'keyUpdated') {
            Logger.log('Ключ обновлен:', request.key ? 'установлен' : 'очищен');
            callback(request.key);
        }
    });
}

// ========== ИНТЕРФЕЙС ==========

/**
 * Добавляет кнопку шифрования рядом с кнопкой отправки
 */
async function addEncryptButton() {
    const sendButton = findSendButton();
    if (!sendButton) return;
    
    const container = sendButton.closest('.btn.svelte-nwz8cp');
    if (!container || container.querySelector('.encrypt-btn')) return;
    
    const key = await getCurrentKey();
    
    const encryptBtn = document.createElement('button');
    encryptBtn.className = 'encrypt-btn';
    encryptBtn.innerHTML = '🔐';
    encryptBtn.title = key ? 'Зашифровать текст' : 'Ключ не установлен';
    encryptBtn.style.cssText = `
        margin-right: 8px;
        width: 40px;
        height: 40px;
        border-radius: 8px;
        background: ${key ? '#4CAF50' : '#f44336'};
        color: white;
        border: none;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        transition: background 0.2s;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    
    encryptBtn.onmouseover = () => {
        encryptBtn.style.background = key ? '#45a049' : '#d32f2f';
    };
    encryptBtn.onmouseout = () => {
        encryptBtn.style.background = key ? '#4CAF50' : '#f44336';
    };
    
    encryptBtn.onclick = async () => {
        const currentKey = await getCurrentKey();
        if (!currentKey) {
            alert('Сначала установите ключ в расширении');
            return;
        }
        
        const input = findInputField();
        if (!input) {
            alert('Поле ввода не найдено');
            return;
        }
        
        const text = getInputText(input).trim();
        if (!text) {
            alert('Введите текст');
            return;
        }
        
        if (text.startsWith('🔒[')) {
            alert('Уже зашифровано');
            return;
        }
        
        try {
            encryptBtn.innerHTML = '⏳';
            encryptBtn.disabled = true;
            
            const encrypted = await encryptMessage(text, currentKey);
            setInputText(input, `🔒[${encrypted}]`);
            
            encryptBtn.innerHTML = '✅';
            setTimeout(() => {
                encryptBtn.innerHTML = '🔐';
                encryptBtn.disabled = false;
            }, 1000);
            
        } catch (error) {
            Logger.error('Ошибка:', error);
            encryptBtn.innerHTML = '❌';
            setTimeout(() => {
                encryptBtn.innerHTML = '🔐';
                encryptBtn.disabled = false;
            }, 1000);
        }
    };
    
    container.insertBefore(encryptBtn, sendButton);
    Logger.success('Кнопка шифрования добавлена');
    
    // Слушаем изменения ключа
    listenForKeyUpdates((newKey) => {
        const newColor = newKey ? '#4CAF50' : '#f44336';
        encryptBtn.style.background = newColor;
        encryptBtn.title = newKey ? 'Зашифровать текст' : 'Ключ не установлен';
    });
}

/**
 * Добавляет кнопки расшифровки к зашифрованным сообщениям
 */
function addDecryptButtons() {
    const messages = document.querySelectorAll('.message');
    
    messages.forEach(message => {
        if (message.querySelector('.decrypt-btn-added')) return;
        
        const metaDiv = message.querySelector('.meta.svelte-13lobfv');
        if (!metaDiv) return;
        
        const textSpan = message.querySelector('span.text.svelte-1htnb3l');
        if (!textSpan) return;
        
        const text = textSpan.textContent || '';
        
        if (text.includes('🔒[')) {
            const decryptBtn = document.createElement('button');
            decryptBtn.className = 'decrypt-btn-added';
            decryptBtn.innerHTML = '🔓';
            decryptBtn.title = 'Расшифровать сообщение';
            decryptBtn.style.cssText = `
                margin-left: 8px;
                padding: 2px 6px;
                border-radius: 4px;
                background: #4CAF50;
                color: white;
                border: none;
                cursor: pointer;
                font-size: 11px;
                font-weight: bold;
                line-height: 1.5;
                vertical-align: middle;
                transition: background 0.2s;
            `;
            
            decryptBtn.onmouseover = () => decryptBtn.style.background = '#45a049';
            decryptBtn.onmouseout = () => decryptBtn.style.background = '#4CAF50';
            
            decryptBtn.onclick = async (e) => {
                e.stopPropagation();
                
                const key = await getCurrentKey();
                if (!key) {
                    alert('Сначала установите ключ');
                    return;
                }
                
                decryptBtn.innerHTML = '⏳';
                decryptBtn.disabled = true;
                
                const match = text.match(/🔒\[(.*?)\]/);
                if (match) {
                    const decrypted = await decryptMessage(match[1], key);
                    
                    if (decrypted) {
                        textSpan.textContent = textSpan.textContent.replace(/🔒\[.*?\]/, `🔓 ${decrypted}`);
                        decryptBtn.remove();
                        Logger.success('Сообщение расшифровано');
                    } else {
                        decryptBtn.innerHTML = '❌';
                        setTimeout(() => {
                            decryptBtn.innerHTML = '🔓';
                            decryptBtn.disabled = false;
                        }, 2000);
                    }
                }
            };
            
            metaDiv.appendChild(decryptBtn);
        }
    });
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========

setTimeout(async () => {
    Logger.log('='.repeat(40));
    Logger.log('🔐 Max Encrypted');
    Logger.log('='.repeat(40));
    
    const input = findInputField();
    const sendButton = findSendButton();
    const key = await getCurrentKey();
    
    Logger.log(`Поле ввода: ${input ? '✅' : '❌'}`);
    Logger.log(`Кнопка: ${sendButton ? '✅' : '❌'}`);
    Logger.log(`Ключ: ${key ? '✅' : '❌'}`);
    
    if (input && sendButton) {
        await addEncryptButton();
        addDecryptButtons();
        
        const observer = new MutationObserver(() => addDecryptButtons());
        observer.observe(document.body, { childList: true, subtree: true });
        
        Logger.log('Наблюдение запущено');
    }
    
    Logger.log('='.repeat(40));
}, 2000);