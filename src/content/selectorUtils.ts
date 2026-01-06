/**
 * Clean classes by removing common dynamic/state classes
 */
function cleanClasses(classes: string[]): string[] {
    const dynamicPatterns = [
        /^is-/, /^active/, /^hover/, /^selected/, /^focused/, /^open/,
        /^ng-/, /^v-/, /^_/, /[0-9]{3,}/ // Hash-like or unique numbers
    ];
    return classes.filter(cls =>
        cls &&
        !dynamicPatterns.some(pattern => pattern.test(cls)) &&
        !cls.startsWith('scraper-')
    );
}

/**
 * Generate a CSS selector for an element with balance between specificity and similarity
 */
export function generateSelector(element: HTMLElement): string {
    const tag = element.tagName.toLowerCase();

    // 1. Try with common classes (most reliable for lists)
    const classes = cleanClasses(Array.from(element.classList));
    if (classes.length > 0) {
        const selector = `${tag}.${classes.join('.')}`;
        // If it finds multiple elements, it's likely a good "similarity" selector
        if (document.querySelectorAll(selector).length > 1) {
            return selector;
        }
    }

    // 2. Try with parent context
    const parent = element.parentElement;
    if (parent) {
        const parentTag = parent.tagName.toLowerCase();
        const parentClasses = cleanClasses(Array.from(parent.classList));
        const parentSelector = parentClasses.length > 0 ? `${parentTag}.${parentClasses[0]}` : parentTag;
        const finalSelector = `${parentSelector} > ${tag}`;

        if (document.querySelectorAll(finalSelector).length > 1) {
            return finalSelector;
        }
    }

    // 3. Fallback to ID ONLY if it's the only one (for specific picking)
    if (element.id && !/[0-9]/.test(element.id)) { // Avoid IDs with numbers which are often dynamic
        return `#${element.id}`;
    }

    // 4. Ultimate fallback: tag only
    return tag;
}

/**
 * Find all similar elements based on a selector
 */
export function findSimilarElements(element: HTMLElement): HTMLElement[] {
    const selector = generateSelector(element);

    try {
        const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
        return elements.filter(el => el !== element && isVisible(el));
    } catch (e) {
        console.warn('[Scraper] Invalid selector:', selector, e);
        return [];
    }
}

/**
 * Check if element is visible
 */
function isVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0';
}

/**
 * Extract text content from element
 */
export function extractText(element: HTMLElement): string {
    return element.innerText?.trim() || element.textContent?.trim() || '';
}

/**
 * Extract data from an element based on data type
 */
export function extractElementData(element: HTMLElement, dataType: 'text' | 'href' | 'src' | 'class' | 'id' = 'text'): string {
    switch (dataType) {
        case 'text':
            return extractText(element);
        case 'href':
            return element instanceof HTMLAnchorElement ? element.href : '';
        case 'src':
            return element instanceof HTMLImageElement ? element.src :
                (element.getAttribute('src') || '');
        case 'class':
            return element.className;
        case 'id':
            return element.id;
        default:
            return extractText(element);
    }
}
