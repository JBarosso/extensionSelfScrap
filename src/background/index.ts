console.log('[Scraper] Background service worker started');

// Open sidepanel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
        await chrome.sidePanel.open({ tabId: tab.id });
        console.log('[Scraper] Sidepanel opened');
    }
});
