// Слушаем установку расширения
browser.runtime.onInstalled.addListener(() => {
    console.log('Encrypted Messenger extension installed');
});

// Обрабатываем сообщения от content script
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getKey') {
        browser.storage.local.get(['encryptionKey']).then((result) => {
            sendResponse({ key: result.encryptionKey });
        });
        return true; // Для асинхронного ответа
    }
});