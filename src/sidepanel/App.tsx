import { Info, MousePointer2, Trash2, Download, Plus, Table, Columns3, Circle, Edit2, Check, X, Eye, EyeOff, Moon, Sun, RotateCcw, ChevronRight } from 'lucide-react'
import { useState, useEffect } from 'react';
import type { ExtensionMessage, Column, DataType, ExportMode } from '../types';

function App() {
    const [isPickerActive, setIsPickerActive] = useState(false);
    const [columns, setColumns] = useState<Column[]>([]);
    const [showNameModal, setShowNameModal] = useState(false);
    const [columnName, setColumnName] = useState('');
    const [selectedDataType, setSelectedDataType] = useState<DataType>('text');
    const [exportMode, setExportMode] = useState<ExportMode>('table');
    const [isConnected, setIsConnected] = useState<boolean | null>(null);
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [devMode, setDevMode] = useState(false);
    const [isPaginationMode, setIsPaginationMode] = useState(false);
    const [paginationSelector, setPaginationSelector] = useState<string | null>(null);
    const [activeSelector, setActiveSelector] = useState<string | null>(null);
    const [tempSelector, setTempSelector] = useState('');
    const [showSelectorEditor, setShowSelectorEditor] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [autoScrapPending, setAutoScrapPending] = useState(false);
    const [devError, setDevError] = useState<string | null>(null);

    const stopPicker = async () => {
        setIsPickerActive(false);
        setPendingColumn(null);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'TOGGLE_PICKER',
                payload: { active: false }
            } as ExtensionMessage).catch(() => { });
        }
    };

    // Listen for Escape and Control in Sidepanel to cancel picking or drill-down
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            if (!isPickerActive) return;

            if (e.key === 'Escape') {
                console.log('[Sidepanel] Escape pressed - stopping picker');
                stopPicker();
            }

            if (e.key === 'Control') {
                console.log('[Sidepanel] Ctrl pressed - syncing to content');
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab?.id) {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'PICKER_STATUS_CHANGED',
                        payload: { isCtrlPressed: true }
                    } as ExtensionMessage).catch(() => { });
                }
            }
        };

        const handleKeyUp = async (e: KeyboardEvent) => {
            if (e.key === 'Control' && isPickerActive) {
                console.log('[Sidepanel] Ctrl released - syncing to content');
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab?.id) {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'PICKER_STATUS_CHANGED',
                        payload: { isCtrlPressed: false }
                    } as ExtensionMessage).catch(() => { });
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isPickerActive]);

    // Store pending column info while picking
    const [pendingColumn, setPendingColumn] = useState<{ name: string; dataType: DataType } | null>(null);

    // Load data from storage on mount
    useEffect(() => {
        chrome.storage.local.get(['columns', 'darkMode'], (result) => {
            if (result.columns && Array.isArray(result.columns)) setColumns(result.columns);
            if (typeof result.darkMode === 'boolean') setDarkMode(result.darkMode);
            setIsInitialized(true);
            console.log('[Sidepanel] State loaded from storage');
        });
    }, []);

    // Save data to storage on change
    useEffect(() => {
        if (isInitialized) {
            chrome.storage.local.set({ columns, darkMode });
        }
    }, [columns, darkMode, isInitialized]);

    // Apply dark mode class to root
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    // Ping content script to check connection
    useEffect(() => {
        const checkConnection = async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab?.id) {
                    chrome.tabs.sendMessage(tab.id, { type: 'PING' }, (_response) => {
                        if (chrome.runtime.lastError) {
                            setIsConnected(false);
                        } else {
                            const wasConnected = isConnected;
                            setIsConnected(true);

                            // If we just reconnected and a scrap was pending
                            if (wasConnected === false && autoScrapPending) {
                                console.log('[Sidepanel] Reconnected after navigation, triggering auto-scrap...');
                                triggerScrapeAll();
                            }
                        }
                    });
                } else {
                    setIsConnected(false);
                }
            } catch (e) {
                setIsConnected(false);
            }
        };

        checkConnection();
        const interval = setInterval(checkConnection, 2000);
        return () => clearInterval(interval);
    }, [isConnected, autoScrapPending, columns]);

    // Listen for messages from content script
    useEffect(() => {
        const messageListener = (message: ExtensionMessage) => {
            console.log('[Sidepanel] Received message:', message);

            if (message.type === 'ELEMENT_SELECTED') {
                const { selector, data } = message.payload;

                if (devMode) {
                    setActiveSelector(selector);
                    setTempSelector(selector);
                    // No need to set showSelectorEditor here as it's now tied to devMode
                    console.log('[Sidepanel] Dev Mode: Generated selector', selector);
                } else {
                    addColumnWithData(pendingColumn?.name || `Column ${columns.length + 1}`, pendingColumn?.dataType || 'text', selector, data);
                    setIsPickerActive(false);
                    setPendingColumn(null);
                }
            }

            if (message.type === 'SELECTOR_GENERATED') {
                const { selector, data } = message.payload;

                if (data && data.length > 0) {
                    setDevError(null);
                    // Case 1: Manual Refinement (started from New Column)
                    if (pendingColumn) {
                        addColumnWithData(pendingColumn.name, pendingColumn.dataType, selector, data);
                        setIsPickerActive(false);
                        setPendingColumn(null);
                        setActiveSelector(null);
                        setTempSelector('');
                        console.log('[Sidepanel] Added column with refined selector:', selector);
                    }
                    // Case 2: Pure Manual Mode (Dev Mode active, no pending column)
                    else if (devMode) {
                        const defaultName = `Col ${columns.length + 1}`;
                        addColumnWithData(defaultName, selectedDataType, selector, data);
                        console.log('[Sidepanel] Dev Mode: Created default column from manual selector');
                    }
                } else {
                    setDevError('Aucun élément trouvé avec ce sélecteur.');
                }
            }

            if (message.type === 'PICKER_STATUS_CHANGED' && message.payload?.cancelled) {
                setIsPickerActive(false);
                setIsPaginationMode(false);
                setPendingColumn(null);
                console.log('[Sidepanel] Picking cancelled');
            }

            if (message.type === 'ELEMENT_SELECTED' && isPaginationMode) {
                const { selector } = message.payload;
                setPaginationSelector(selector);
                setIsPaginationMode(false);
                setIsPickerActive(false);
                console.log('[Sidepanel] Pagination selector set:', selector);
                return; // Don't process as a column
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);
        return () => chrome.runtime.onMessage.removeListener(messageListener);
    }, [pendingColumn, devMode, activeSelector]);

    const confirmAndActivatePicker = async () => {
        if (!columnName.trim()) {
            alert('Please enter a column name');
            return;
        }

        setPendingColumn({
            name: columnName.trim(),
            dataType: selectedDataType
        });

        setIsPickerActive(true);
        setShowNameModal(false);
        setColumnName('');

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            const message: ExtensionMessage = {
                type: 'TOGGLE_PICKER',
                payload: { active: true, dataType: selectedDataType }
            };

            chrome.tabs.sendMessage(tab.id, message).catch((err: Error) => {
                console.error('Failed to send message:', err);
                setIsPickerActive(false);
                setPendingColumn(null);
            });
        }
    };

    const addColumnWithData = (name: string, dataType: DataType, selector: string, data: string[]) => {
        const randomColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
        const newColumn: Column = {
            id: crypto.randomUUID(),
            name,
            selector,
            dataType,
            data,
            createdAt: Date.now(),
            color: randomColor,
            isHighlighted: false
        };
        setColumns(prev => [...prev, newColumn]);
    };

    const toggleHighlight = async (colId: string) => {
        setColumns(prev => prev.map(col => {
            if (col.id === colId) {
                const newState = !col.isHighlighted;
                // Notify content script
                chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                    if (tab?.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'TOGGLE_COLUMN_HIGHLIGHT',
                            payload: {
                                id: col.id,
                                selector: col.selector,
                                color: col.color,
                                active: newState
                            }
                        } as ExtensionMessage).catch(() => { });
                    }
                });
                return { ...col, isHighlighted: newState };
            }
            return col;
        }));
    };

    const applyCustomSelector = async () => {
        if (!tempSelector.trim()) return;
        setDevError(null);

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'APPLY_CUSTOM_SELECTOR',
                payload: {
                    selector: tempSelector.trim(),
                    dataType: pendingColumn?.dataType || selectedDataType || 'text'
                }
            } as ExtensionMessage).catch(() => {
                setDevError('Impossible de communiquer avec la page. Rafraîchissez-la.');
            });
        }
    };

    const deleteColumn = (id: string) => {
        setColumns(prev => prev.filter(col => col.id !== id));
    };

    const clearAllColumns = () => {
        if (window.confirm('Are you sure you want to delete all columns?')) {
            setColumns([]);
        }
    };

    const startEditingColumn = (col: Column) => {
        setEditingColumnId(col.id);
        setEditingName(col.name);
    };

    const saveColumnName = () => {
        if (editingColumnId && editingName.trim()) {
            setColumns(prev => prev.map(col =>
                col.id === editingColumnId ? { ...col, name: editingName.trim() } : col
            ));
        }
        setEditingColumnId(null);
        setEditingName('');
    };

    const cancelEditing = () => {
        setEditingColumnId(null);
        setEditingName('');
    };

    const exportData = (format: 'json' | 'csv' = 'json') => {
        if (columns.length === 0) {
            alert('No data to export');
            return;
        }

        const sanitize = (text: string) => {
            if (!text) return '';
            return text
                .toString()
                .replace(/\s+/g, ' ') // Normalize spaces
                .replace(/&nbsp;/g, ' ')
                .trim();
        };

        if (format === 'csv') {
            const maxRows = Math.max(...columns.map(col => col.data.length));
            const headers = columns.map(col => `"${col.name.replace(/"/g, '""')}"`).join(';');
            let csvContent = 'sep=;\n' + headers + '\n';

            for (let i = 0; i < maxRows; i++) {
                const row = columns.map(col => {
                    const value = sanitize(col.data[i] || '');
                    return `"${value.replace(/"/g, '""')}"`;
                }).join(';');
                csvContent += row + '\n';
            }

            // Add UTF-8 BOM for Excel compatibility
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `scraper-export-${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            return;
        }

        let exportObj: any;

        if (exportMode === 'table') {
            const maxRows = Math.max(...columns.map(col => col.data.length));
            const rows = [];

            for (let i = 0; i < maxRows; i++) {
                const row: any = {};
                columns.forEach(col => {
                    row[col.name] = sanitize(col.data[i] || '');
                });
                rows.push(row);
            }

            exportObj = {
                mode: 'table',
                columns: columns.map(col => ({ name: col.name, dataType: col.dataType })),
                data: rows,
                exportedAt: new Date().toISOString()
            };
        } else {
            exportObj = {
                mode: 'columns',
                columns: columns.map(col => ({
                    name: col.name,
                    selector: col.selector,
                    dataType: col.dataType,
                    data: col.data.map(sanitize)
                })),
                exportedAt: new Date().toISOString()
            };
        }

        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scraper-export-${exportMode}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const startPaginationPicker = async () => {
        setIsPaginationMode(true);
        setIsPickerActive(true);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'TOGGLE_PICKER',
                payload: { active: true, dataType: 'text' }
            } as ExtensionMessage).catch(() => { });
        }
    };

    const triggerScrapeAll = async () => {
        if (columns.length === 0) return;

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'SCRAPE_ALL',
                payload: { columns: columns.map(c => ({ id: c.id, selector: c.selector, dataType: c.dataType })) }
            }, (response) => {
                if (response?.results) {
                    setColumns(prev => prev.map(col => {
                        const newResults = response.results.find((r: any) => r.id === col.id);
                        if (newResults) {
                            // Append ONLY new unique data (basic deduplication)
                            const currentData = new Set(col.data);
                            const filteredNewData = newResults.data.filter((val: string) => !currentData.has(val));
                            return { ...col, data: [...col.data, ...filteredNewData] };
                        }
                        return col;
                    }));
                    setAutoScrapPending(false);
                    console.log('[Sidepanel] Auto-scrap complete');
                }
            });
        }
    };

    const goToNextPage = async () => {
        if (!paginationSelector) return;
        setAutoScrapPending(true);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (selector) => {
                    const btn = document.querySelector(selector) as HTMLElement;
                    if (btn) {
                        btn.click();
                        // If it's a SPA navigation, it might not trigger a reload
                        // We might need to wait for DOM changes here, but for now we assume reload
                    }
                },
                args: [paginationSelector]
            });

            // Safety timeout: if page doesn't reload after 10s, try scraping anyway
            setTimeout(() => {
                if (autoScrapPending) {
                    triggerScrapeAll();
                }
            }, 5000);
        }
    };

    const maxRows = columns.length > 0 ? Math.max(...columns.map(col => col.data.length)) : 0;

    return (
        <div className={`w-full min-h-screen flex flex-col transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            <header className={`p-4 border-b sticky top-0 z-10 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between mb-3">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
                        Self Scraper
                    </h1>
                    <div className="flex items-center gap-2">
                        {/* Connection status */}
                        <div className="flex items-center gap-1 text-[10px]">
                            <Circle
                                size={8}
                                className={isConnected === null ? 'text-slate-300 fill-slate-300' : isConnected ? 'text-emerald-500 fill-emerald-500' : 'text-rose-500 fill-rose-500'}
                            />
                            <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
                                {isConnected === null ? 'Checking...' : isConnected ? 'Connected' : 'Offline'}
                            </span>
                        </div>
                        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
                        <button
                            onClick={() => setDarkMode(!darkMode)}
                            className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-slate-700 text-amber-400' : 'hover:bg-slate-100 text-slate-500'}`}
                        >
                            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <button
                            onClick={() => setIsHelpOpen(true)}
                            className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-blue-400' : 'hover:bg-slate-100 text-slate-500 hover:text-blue-600'}`}
                            title="Comment utiliser l'extension"
                        >
                            <Info size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => isPickerActive ? stopPicker() : setShowNameModal(true)}
                        disabled={isConnected === false}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all shadow-sm ${isPickerActive
                            ? 'bg-red-500 hover:bg-red-600 text-white'
                            : isConnected === false
                                ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-200 dark:border-slate-600'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                    >
                        {isPickerActive ? (
                            <><X size={18} /> Cancel Picking</>
                        ) : (
                            <><Plus size={18} /> New Column</>
                        )}
                    </button>
                    <div className="flex flex-col items-end gap-1 ml-auto">
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Pagination</span>
                            <button
                                onClick={() => paginationSelector ? setPaginationSelector(null) : startPaginationPicker()}
                                disabled={isConnected === false}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border ${paginationSelector
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : isConnected === false
                                        ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600 dark:border-slate-700'
                                        : darkMode ? 'bg-slate-700 text-slate-400 border-slate-600 hover:border-slate-500' : 'bg-slate-100 text-slate-600 border-slate-200 hover:border-slate-300'
                                    }`}
                                title={isConnected === false ? "Reconnect to use pagination" : (paginationSelector ? "Pagination active. Click to clear." : "Select Next Page button")}
                            >
                                {paginationSelector ? <Check size={12} /> : <Plus size={12} />}
                                {paginationSelector ? 'SET' : 'SELECT'}
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Dev Mode</span>
                            <button
                                onClick={() => {
                                    const next = !devMode;
                                    setDevMode(next);
                                    setShowSelectorEditor(next);
                                }}
                                disabled={isConnected === false}
                                className={`w-10 h-5 rounded-full transition-colors relative ${devMode ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'} ${isConnected === false ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${devMode ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {isConnected === false && (
                <div className={`p-3 border-b animate-in slide-in-from-top duration-300 ${darkMode ? 'bg-rose-500/10 border-rose-500/20' : 'bg-rose-50 border-rose-100'}`}>
                    <div className="flex items-center justify-between gap-4 max-w-xl mx-auto">
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${darkMode ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-500 text-white'}`}>
                                <RotateCcw size={16} className="animate-spin-slow" />
                            </div>
                            <div>
                                <p className={`text-xs font-bold ${darkMode ? 'text-rose-400' : 'text-rose-700'}`}>HORS LIGNE</p>
                                <p className={`text-[10px] ${darkMode ? 'text-rose-500/70' : 'text-rose-600'}`}>Impossible de communiquer avec la page.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                                    if (tab?.id) chrome.tabs.reload(tab.id);
                                });
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${darkMode
                                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                                : 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm'
                                }`}
                        >
                            Rafraîchir la page
                        </button>
                    </div>
                </div>
            )}

            <main className="flex-1 p-4 space-y-3 overflow-auto">
                {columns.length === 0 && !showSelectorEditor ? (
                    <div className="text-center py-12 text-slate-400">
                        <MousePointer2 size={48} className="mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Click "New Column" to start scraping</p>
                        {isConnected === false && (
                            <p className="text-xs mt-2 text-red-500">⚠️ Please refresh the page</p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Dev Mode Selector Editor */}
                        {showSelectorEditor && (
                            <div className={`mb-6 p-5 border rounded-2xl animate-in slide-in-from-top-4 duration-300 ${darkMode ? 'bg-blue-500/5 border-blue-500/20 shadow-lg shadow-black/20' : 'bg-blue-50 border-blue-100 shadow-sm'}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className={`text-sm font-bold flex items-center gap-2 ${darkMode ? 'text-blue-400' : 'text-blue-800'}`}>
                                        <Table size={16} /> {devMode ? 'Mode Manuel / Édition' : 'Refine Selector'}
                                    </h3>
                                    {devMode && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-500 font-bold tracking-widest uppercase">Expert</span>
                                    )}
                                </div>
                                <p className={`text-xs mb-4 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-blue-600'}`}>
                                    {devMode
                                        ? "Saisissez un sélecteur CSS ou utilisez le picker pour voir les résultats instantanément."
                                        : "Analysez et modifiez le sélecteur généré pour cibler plus précisément vos données."}
                                </p>
                                <div className="relative group">
                                    <input
                                        type="text"
                                        value={tempSelector}
                                        onChange={(e) => {
                                            setTempSelector(e.target.value);
                                            setDevError(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') applyCustomSelector();
                                        }}
                                        className={`w-full p-3 text-[13px] font-mono rounded-xl border-2 transition-all outline-none ${darkMode
                                            ? 'bg-slate-900 border-slate-700 text-emerald-400 focus:border-blue-500/50'
                                            : 'bg-white border-blue-100 text-blue-900 focus:border-blue-500'
                                            } ${devError ? 'border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : ''}`}
                                        placeholder="e.g. .product-card > h2.title"
                                        autoFocus
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Edit2 size={14} className="text-slate-400" />
                                    </div>
                                </div>
                                {devError && (
                                    <p className="text-[11px] mt-2 text-rose-500 font-bold flex items-center gap-1 animate-in fade-in slide-in-from-top-1">
                                        <Circle size={8} className="fill-current" /> {devError}
                                    </p>
                                )}
                                <div className="flex gap-2 mt-4">
                                    <button
                                        onClick={() => {
                                            setShowSelectorEditor(false);
                                            if (!devMode) {
                                                setIsPickerActive(false);
                                                setPendingColumn(null);
                                            }
                                        }}
                                        className={`flex-1 px-4 py-2.5 text-xs font-bold rounded-xl transition-all border ${darkMode
                                            ? 'bg-transparent border-slate-700 text-slate-400 hover:bg-slate-700'
                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                    >
                                        Fermer
                                    </button>
                                    <button
                                        onClick={applyCustomSelector}
                                        className="flex-1 px-4 py-2.5 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
                                    >
                                        Valider & Extraire
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Columns Grid */}
                        <div className={`rounded-xl shadow-lg border overflow-hidden transition-all ${darkMode ? 'bg-slate-800 border-slate-700 shadow-black/20' : 'bg-white border-slate-200'}`}>
                            <div className={`p-4 border-b flex items-center justify-between ${darkMode ? 'bg-slate-800/50 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'}`}>
                                <h3 className="font-bold text-sm tracking-tight flex items-center gap-2">
                                    <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
                                    Données Extraites ({maxRows} lignes)
                                </h3>
                                <button
                                    onClick={clearAllColumns}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${darkMode ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`}
                                >
                                    <RotateCcw size={14} /> Clear All
                                </button>
                            </div>
                            <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-[13px] border-collapse">
                                    <thead>
                                        <tr className={darkMode ? 'bg-slate-800' : 'bg-slate-100'}>
                                            <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase text-[10px] tracking-widest border-b dark:border-slate-700">#</th>
                                            {columns.map(col => (
                                                <th key={col.id} className="px-4 py-4 text-left border-b dark:border-slate-700 min-w-[180px] group transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                                                    <div className="flex items-center justify-between gap-4">
                                                        {editingColumnId === col.id ? (
                                                            <div className="flex items-center gap-1.5 w-full">
                                                                <input
                                                                    type="text"
                                                                    value={editingName}
                                                                    onChange={(e) => setEditingName(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') saveColumnName();
                                                                        if (e.key === 'Escape') cancelEditing();
                                                                    }}
                                                                    className={`px-2 py-1 border-2 border-blue-500 rounded-lg text-xs w-full outline-none shadow-sm ${darkMode ? 'bg-slate-900' : 'bg-white'}`}
                                                                    autoFocus
                                                                />
                                                                <div className="flex items-center gap-1">
                                                                    <button onClick={saveColumnName} className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-lg text-emerald-600 transition-colors">
                                                                        <Check size={14} />
                                                                    </button>
                                                                    <button onClick={cancelEditing} className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-lg text-rose-600 transition-colors">
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="flex items-center gap-3">
                                                                    <div
                                                                        className="w-2.5 h-2.5 rounded-full shadow-inner ring-2 ring-white dark:ring-slate-800"
                                                                        style={{ backgroundColor: col.color }}
                                                                    />
                                                                    <div className="flex flex-col">
                                                                        <div className={`font-bold text-[13px] tracking-tight ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{col.name}</div>
                                                                        <div className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{col.dataType}</div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all duration-200">
                                                                    <button
                                                                        onClick={() => toggleHighlight(col.id)}
                                                                        className={`p-1.5 rounded-lg transition-all ${col.isHighlighted
                                                                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
                                                                            : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400'}`}
                                                                        title={col.isHighlighted ? "Hide highlight" : "Show highlight"}
                                                                    >
                                                                        {col.isHighlighted ? <Eye size={14} /> : <EyeOff size={14} />}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => startEditingColumn(col)}
                                                                        className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-lg text-blue-600 dark:text-blue-400 transition-all"
                                                                        title="Edit column name"
                                                                    >
                                                                        <Edit2 size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => deleteColumn(col.id)}
                                                                        className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400 transition-all"
                                                                        title="Delete column"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: maxRows }).map((_, rowIdx) => (
                                            <tr key={rowIdx} className={`border-t transition-colors ${darkMode ? 'border-slate-700 hover:bg-slate-700/50' : 'border-slate-100 hover:bg-slate-50'}`}>
                                                <td className="px-4 py-2.5 text-slate-400 font-mono text-[11px]">{rowIdx + 1}</td>
                                                {columns.map(col => (
                                                    <td key={col.id} className={`px-4 py-2.5 max-w-[250px] truncate ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                                        {col.data[rowIdx] || <span className="text-slate-300 dark:text-slate-500 italic opacity-50">empty</span>}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {columns.length > 0 && (
                <footer className={`p-4 border-t space-y-4 ${darkMode ? 'bg-slate-800 border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.2)]' : 'bg-white border-slate-200'}`}>
                    {/* JSON Configuration Section */}
                    <div className={`p-3 rounded-2xl border transition-all ${darkMode ? 'bg-slate-900/40 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-center gap-2 mb-3 px-1">
                            <div className="w-1 h-3 bg-blue-500 rounded-full" />
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                Configuration JSON <span className="opacity-50 font-normal normal-case ml-1">(Export JSON uniquement)</span>
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setExportMode('table')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${exportMode === 'table'
                                    ? darkMode ? 'bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-inner' : 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                                    : darkMode ? 'bg-slate-700/50 text-slate-500 border-transparent hover:bg-slate-700' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                                    }`}
                            >
                                <Table size={14} />
                                TABLE MODE
                            </button>
                            <button
                                onClick={() => setExportMode('columns')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${exportMode === 'columns'
                                    ? darkMode ? 'bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-inner' : 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                                    : darkMode ? 'bg-slate-700/50 text-slate-500 border-transparent hover:bg-slate-700' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                                    }`}
                            >
                                <Columns3 size={14} />
                                COLUMNS MODE
                            </button>
                        </div>
                    </div>

                    {/* Export Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => exportData('json')}
                            className="group relative overflow-hidden flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all active:scale-95 font-black tracking-wide shadow-lg shadow-blue-600/20"
                        >
                            <Download size={18} className="group-hover:-translate-y-0.5 transition-transform" />
                            JSON
                        </button>
                        <button
                            onClick={() => exportData('csv')}
                            className="group relative overflow-hidden flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-all active:scale-95 font-black tracking-wide shadow-lg shadow-emerald-600/20"
                        >
                            <Download size={18} className="group-hover:-translate-y-0.5 transition-transform" />
                            CSV
                        </button>
                    </div>

                    {paginationSelector && (
                        <button
                            onClick={goToNextPage}
                            disabled={isConnected === false}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold transition-all border animate-in slide-in-from-bottom-2 ${isConnected === false
                                ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600 dark:border-slate-700'
                                : darkMode ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                                }`}
                        >
                            Suivant & Scraper <ChevronRight size={16} />
                        </button>
                    )}
                </footer>
            )}

            {showNameModal && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className={`rounded-2xl shadow-2xl max-w-sm w-full p-6 border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-500">
                                <Plus size={24} />
                            </div>
                            <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>Nouvelle Colonne</h2>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Nom de la colonne</label>
                                <input
                                    type="text"
                                    value={columnName}
                                    onChange={(e) => setColumnName(e.target.value)}
                                    placeholder="ex: Titre du produit"
                                    className={`w-full px-4 py-3 rounded-xl outline-none focus:ring-4 transition-all ${darkMode
                                        ? 'bg-slate-900 border-slate-700 text-slate-100 focus:ring-blue-500/20 border-2'
                                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/10 border-2'
                                        }`}
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && confirmAndActivatePicker()}
                                />
                            </div>

                            <div>
                                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Type de données</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {(['text', 'href', 'src', 'class', 'id'] as DataType[]).map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => setSelectedDataType(type)}
                                            className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all font-medium ${selectedDataType === type
                                                ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                                                : darkMode ? 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                                                }`}
                                        >
                                            <span className="capitalize">{type === 'href' ? 'Link (URL)' : type === 'src' ? 'Image (URL)' : type}</span>
                                            {selectedDataType === type && <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => {
                                    setShowNameModal(false);
                                    setColumnName('');
                                }}
                                className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                            >
                                Annuler
                            </button>
                            <button
                                onClick={confirmAndActivatePicker}
                                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                            >
                                Start Picking
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isHelpOpen && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-300">
                    <div className={`relative max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden border-2 animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
                        }`}>
                        {/* Header Modal */}
                        <div className={`px-6 py-5 border-b-2 flex items-center justify-between ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'
                            }`}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                                    <Info className="text-white" size={24} />
                                </div>
                                <div>
                                    <h2 className={`text-lg font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                        GUIDE D'UTILISATION
                                    </h2>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                        Maîtrisez Scraper Pro
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsHelpOpen(false)}
                                className={`p-2 rounded-lg transition-all ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-600'
                                    }`}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Content Scrollable */}
                        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">

                            {/* Étape 1 & 2 Core */}
                            <div className="grid grid-cols-1 gap-6">
                                <div className={`p-5 rounded-2xl border-2 transition-colors ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-blue-50/50 border-blue-100'
                                    }`}>
                                    <h3 className={`flex items-center gap-2 font-black mb-3 ${darkMode ? 'text-blue-400' : 'text-blue-800'}`}>
                                        <Plus size={20} /> 1. CRÉER & SÉLECTIONNER
                                    </h3>
                                    <p className={`text-sm leading-relaxed mb-4 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                        Cliquer sur <strong className="text-blue-500">New Column</strong>, donnez un nom, puis survolez la page. Le rectangle bleu indique ce qui sera capturé.
                                    </p>
                                    <div className={`p-4 rounded-xl border-2 flex items-start gap-3 bg-white dark:bg-slate-900 ${darkMode ? 'border-amber-500/30' : 'border-amber-200'
                                        }`}>
                                        <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
                                            <MousePointer2 size={16} />
                                        </div>
                                        <div>
                                            <p className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>PRO TIP: DRILL-DOWN</p>
                                            <p className={`text-xs leading-normal ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                                Maintenez <strong className="underline underline-offset-2">CTRL</strong> pour traverser les éléments et atteindre ce qui est caché dessous.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Étape 3 Pagination */}
                            <div className={`p-5 rounded-2xl border-2 ${darkMode ? 'bg-indigo-500/5 border-indigo-500/30' : 'bg-indigo-50 border-indigo-100'
                                }`}>
                                <h3 className={`flex items-center gap-2 font-black mb-3 ${darkMode ? 'text-indigo-400' : 'text-indigo-800'}`}>
                                    <RotateCcw size={20} /> 2. MULTI-PAGES (AUTO)
                                </h3>
                                <ul className={`space-y-3 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                    <li className="flex gap-3">
                                        <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
                                        <span>Cliquez sur <strong className="text-indigo-600 dark:text-indigo-400">SELECT</strong> dans la barre "Pagination".</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
                                        <span>Cliquez sur le bouton "Page suivante" sur le site.</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
                                        <span>Utilisez <strong className="text-indigo-600 dark:text-indigo-400">Suivant & Scraper</strong> pour parcourir les pages.</span>
                                    </li>
                                </ul>
                            </div>

                            {/* Étape 4 Expert */}
                            <div className={`p-5 rounded-2xl border-2 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                                }`}>
                                <h3 className={`flex items-center gap-2 font-black mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                                    <Table size={20} /> 3. MODE EXPERT (DEV)
                                </h3>
                                <p className={`text-sm mb-4 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                    Entrez vos propres sélecteurs CSS pour un contrôle total.
                                </p>
                                <div className={`p-3 font-mono text-[11px] rounded-lg ${darkMode ? 'bg-black text-emerald-400' : 'bg-white text-blue-600 border border-slate-200'
                                    }`}>
                                    .container {" > "} .item-title
                                </div>
                            </div>
                        </div>

                        {/* Footer Modal */}
                        <div className={`p-6 border-t-2 ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-100'
                            }`}>
                            <button
                                onClick={() => setIsHelpOpen(false)}
                                className="w-full py-4 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-600/30 active:scale-95 transition-all text-sm tracking-widest"
                            >
                                J'AI COMPRIS !
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
