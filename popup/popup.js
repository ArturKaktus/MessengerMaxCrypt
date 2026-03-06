document.addEventListener('DOMContentLoaded', async () => {
    const keyInput = document.getElementById('keyInput');
    const saveKeyBtn = document.getElementById('saveKeyBtn');
    const clearKeyBtn = document.getElementById('clearKeyBtn');
    const keyStatus = document.getElementById('keyStatus');
    const keyStatusText = document.getElementById('keyStatusText');
    const keyDisplay = document.getElementById('keyDisplay');
    const statusMessage = document.getElementById('statusMessage');
    
    // Загружаем ключ напрямую из storage
    const result = await browser.storage.local.get(['encryptionKey']);
    updateKeyStatus(result.encryptionKey);
    
    saveKeyBtn.addEventListener('click', async () => {
        const key = keyInput.value.trim();
        if (key) {
            await browser.storage.local.set({ encryptionKey: key });
            updateKeyStatus(key);
            keyInput.value = '';
            showStatus('✅ Ключ сохранен', 'success');
            
            // Оповещаем активную вкладку об изменении ключа
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                try {
                    await browser.tabs.sendMessage(tabs[0].id, { 
                        action: 'keyUpdated', 
                        key: key 
                    });
                    showStatus('✅ Ключ применен к текущей вкладке', 'success');
                } catch (e) {
                    // Игнорируем ошибки (например, если нет content script на странице)
                    showStatus('⚠️ Откройте страницу чата', 'warning');
                }
            }
        }
    });
    
    clearKeyBtn.addEventListener('click', async () => {
        await browser.storage.local.remove('encryptionKey');
        updateKeyStatus(null);
        showStatus('✅ Ключ удален', 'success');
        
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
            try {
                await browser.tabs.sendMessage(tabs[0].id, { 
                    action: 'keyUpdated', 
                    key: null 
                });
            } catch (e) {
                // Игнорируем
            }
        }
    });
    
    function updateKeyStatus(key) {
        if (key) {
            keyStatus.classList.add('active');
            keyStatusText.textContent = '✅ Ключ активен';
            keyDisplay.textContent = key;
        } else {
            keyStatus.classList.remove('active');
            keyStatusText.textContent = '❌ Ключ не установлен';
            keyDisplay.textContent = '';
        }
    }
    
    function showStatus(msg, type) {
        statusMessage.textContent = msg;
        statusMessage.className = `status-message ${type}`;
        setTimeout(() => {
            statusMessage.textContent = '';
            statusMessage.className = 'status-message';
        }, 3000);
    }
});