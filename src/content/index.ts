import type { ExtensionMessage } from '../types';
import { extractElementData, findSimilarElements, generateSelector } from './selectorUtils';

console.log('[Scraper] Content script loaded');

// Picker state
let isPickerActive = false;
let highlightOverlay: HTMLDivElement | null = null;
let isCtrlPressed = false;
let currentHoveredElement: HTMLElement | null = null;
let disabledElements: HTMLElement[] = [];
let activeHighlights: Map<string, { selector: string, color: string }> = new Map();
let highlightsStyleTag: HTMLStyleElement | null = null;

// Update the global highlights style tag
function updateHighlightsStyle() {
    if (!highlightsStyleTag) {
        highlightsStyleTag = document.createElement('style');
        highlightsStyleTag.id = 'scraper-column-highlights';
        document.head.appendChild(highlightsStyleTag);
    }

    let css = '';
    activeHighlights.forEach(({ selector, color }) => {
        css += `
      ${selector} {
        outline: 2px dashed ${color} !important;
        outline-offset: -2px !important;
        position: relative !important;
        z-index: 10 !important;
      }
    `;
    });
    highlightsStyleTag.textContent = css;
}

// Restore pointer events on all disabled elements
function restoreDisabledElements() {
    if (disabledElements.length > 0) {
        console.log(`[Scraper] 💡 Restoring pointer-events on ${disabledElements.length} elements`);
        disabledElements.forEach(el => {
            try {
                el.style.pointerEvents = '';
            } catch (e) {
                console.error('[Scraper] Failed to restore pointer-events:', e);
            }
        });
        disabledElements = [];
    }
}

// Create highlight overlay element
function createHighlightOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.id = 'scraper-highlight-overlay';
    overlay.style.cssText = `
    position: absolute;
    pointer-events: none;
    border: 2px solid #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    z-index: 999999;
    transition: all 0.1s ease;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
  `;
    document.body.appendChild(overlay);
    return overlay;
}

// Remove highlight overlay
function removeHighlightOverlay() {
    if (highlightOverlay) {
        highlightOverlay.remove();
        highlightOverlay = null;
    }
}

// Update highlight position
function updateHighlight(element: HTMLElement) {
    if (!highlightOverlay) return;

    const rect = element.getBoundingClientRect();
    highlightOverlay.style.top = `${rect.top + window.scrollY}px`;
    highlightOverlay.style.left = `${rect.left + window.scrollX}px`;
    highlightOverlay.style.width = `${rect.width}px`;
    highlightOverlay.style.height = `${rect.height}px`;
}

// Mouse move handler
function handleMouseMove(e: MouseEvent) {
    if (!isPickerActive) return;

    const target = e.target as HTMLElement;

    if (target && target.id !== 'scraper-highlight-overlay') {
        currentHoveredElement = target;
        updateHighlight(target);
    }
}

// Click handler
function handleClick(e: MouseEvent) {
    if (!isPickerActive) return;

    e.preventDefault();
    e.stopPropagation();

    // Use the element we are currently highlighting (more consistent than e.target during drill-down)
    const target = currentHoveredElement;
    if (target && target.id !== 'scraper-highlight-overlay') {
        // console.log('[Scraper] ✅ Element selected:', target);

        // Get data type from state
        const dataType = (window as any).__scraperDataType || 'text';

        // Extract data
        const clickedValue = extractElementData(target, dataType);
        const similarElements = findSimilarElements(target);
        const similarValues = similarElements.map(el => extractElementData(el, dataType));
        const allValues = [clickedValue, ...similarValues];

        // console.log('[Scraper] Found', allValues.length, 'total values');

        // Send data to sidepanel
        chrome.runtime.sendMessage({
            type: 'ELEMENT_SELECTED',
            payload: {
                selector: generateSelector(target),
                data: allValues,
                count: allValues.length
            }
        } as ExtensionMessage);

        // Restore everything and stop
        restoreDisabledElements();
        togglePicker(false);
    }
}

// Toggle picker mode
function togglePicker(active: boolean) {
    isPickerActive = active;

    if (active) {
        highlightOverlay = createHighlightOverlay();
        window.addEventListener('mousemove', handleMouseMove, true);
        window.addEventListener('click', handleClick, true);
        window.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('keyup', handleKeyUp, true);
        document.body.style.cursor = 'crosshair';
    } else {
        restoreDisabledElements();
        removeHighlightOverlay();
        window.removeEventListener('mousemove', handleMouseMove, true);
        window.removeEventListener('click', handleClick, true);
        window.removeEventListener('keydown', handleKeyDown, true);
        window.removeEventListener('keyup', handleKeyUp, true);
        document.body.style.cursor = '';
        isCtrlPressed = false;
        currentHoveredElement = null;
    }
}

// Key down handler
function handleKeyDown(e: KeyboardEvent) {
    if (!isPickerActive) return;

    // Escape to cancel picking
    if (e.key === 'Escape') {
        togglePicker(false);

        // Notify sidepanel
        chrome.runtime.sendMessage({
            type: 'PICKER_STATUS_CHANGED',
            payload: { active: false, cancelled: true }
        } as ExtensionMessage);
        return;
    }

    // Ctrl for drill-down - apply once on keydown
    if (e.key === 'Control' || e.ctrlKey) {
        // If we are currently hovering something, disable it to "drill down"
        if (!isCtrlPressed && currentHoveredElement) {
            console.log('[Scraper] 🔍 Drilling down through:', currentHoveredElement.tagName);
            currentHoveredElement.style.pointerEvents = 'none';
            disabledElements.push(currentHoveredElement);

            // Force update to next element immediately
            const rect = highlightOverlay?.getBoundingClientRect();
            if (rect) {
                const nextEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) as HTMLElement;
                if (nextEl && nextEl !== currentHoveredElement) {
                    currentHoveredElement = nextEl;
                    updateHighlight(nextEl);
                }
            }
        }

        isCtrlPressed = true;
        if (highlightOverlay) {
            highlightOverlay.style.borderColor = '#f59e0b';
            highlightOverlay.style.boxShadow = '0 0 0 2px rgba(245, 158, 11, 0.3)';
        }
    }
}

// Key up handler
function handleKeyUp(e: KeyboardEvent) {
    if (!isPickerActive) return;

    if (e.key === 'Control' || !e.ctrlKey) {
        isCtrlPressed = false;
        restoreDisabledElements();

        if (highlightOverlay) {
            highlightOverlay.style.borderColor = '#3b82f6';
            highlightOverlay.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.3)';
        }
    }
}

// Message listener
chrome.runtime.onMessage.addListener((
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
) => {
    if (message.type === 'PING') {
        sendResponse({ type: 'PONG' });
    }

    if (message.type === 'PICKER_STATUS_CHANGED') {
        if (message.payload?.cancelled) {
            togglePicker(false);
        }

        if (typeof message.payload?.isCtrlPressed === 'boolean') {
            const wasCtrlPressed = isCtrlPressed;
            isCtrlPressed = message.payload.isCtrlPressed;

            if (isCtrlPressed && !wasCtrlPressed && currentHoveredElement) {
                currentHoveredElement.style.pointerEvents = 'none';
                disabledElements.push(currentHoveredElement);

                // Force update to next element immediately
                const rect = highlightOverlay?.getBoundingClientRect();
                if (rect) {
                    const nextEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) as HTMLElement;
                    if (nextEl && nextEl !== currentHoveredElement) {
                        currentHoveredElement = nextEl;
                        updateHighlight(nextEl);
                    }
                }
            }

            if (highlightOverlay) {
                if (isCtrlPressed) {
                    highlightOverlay.style.borderColor = '#f59e0b';
                    highlightOverlay.style.boxShadow = '0 0 0 2px rgba(245, 158, 11, 0.3)';
                } else {
                    restoreDisabledElements();
                    highlightOverlay.style.borderColor = '#3b82f6';
                    highlightOverlay.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.3)';
                }
            }
        }
    }

    if (message.type === 'TOGGLE_COLUMN_HIGHLIGHT') {
        const { id, selector, color, active } = message.payload;
        if (active) {
            activeHighlights.set(id, { selector, color });
        } else {
            activeHighlights.delete(id);
        }
        updateHighlightsStyle();
    }

    if (message.type === 'APPLY_CUSTOM_SELECTOR') {
        const { selector, dataType } = message.payload;
        console.log('[Scraper Content] 🔍 Applying custom selector:', selector);

        try {
            const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
            const values = elements.map(el => extractElementData(el, dataType));

            console.log(`[Scraper Content] Found ${values.length} matches for custom selector`);

            chrome.runtime.sendMessage({
                type: 'SELECTOR_GENERATED',
                payload: {
                    selector,
                    data: values
                }
            } as ExtensionMessage);
        } catch (e) {
            console.error('[Scraper Content] Invalid custom selector:', selector, e);
        }
    }

    if (message.type === 'TOGGLE_PICKER') {
        const active = message.payload?.active;
        const dataType = message.payload?.dataType || 'text';

        // Store dataType globally for use in click handler
        (window as any).__scraperDataType = dataType;

        togglePicker(active);
    }

    if (message.type === 'SCRAPE_ALL') {
        const { columns } = message.payload;
        const results = columns.map((col: any) => {
            try {
                const elements = Array.from(document.querySelectorAll(col.selector));
                const data = elements.map(el => extractElementData(el as HTMLElement, col.dataType));
                return { id: col.id, data };
            } catch (e) {
                console.error('Failed to scrap column:', col.name, e);
                return { id: col.id, data: [] };
            }
        });
        sendResponse({ results });
    }

    if (message.type === 'PING') {
        sendResponse({ type: 'PONG' });
    }
});
