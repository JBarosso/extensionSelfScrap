export type MessageType =
    | 'PING'
    | 'PONG'
    | 'TOGGLE_PICKER'
    | 'PICKER_STATUS_CHANGED'
    | 'ELEMENT_SELECTED'
    | 'SELECTOR_GENERATED'
    | 'APPLY_CUSTOM_SELECTOR'
    | 'TOGGLE_COLUMN_HIGHLIGHT'
    | 'SCRAPE_ALL';

export interface ExtensionMessage {
    type: MessageType;
    payload?: any;
}

export type DataType = 'text' | 'href' | 'src' | 'class' | 'id' | 'attribute';

export interface ScrapedElement {
    tagName: string;
    className: string;
    text: string;
    selector: string;
    href?: string | null;
    src?: string | null;
    id?: string | null;
    attribute?: string | null;
}

export interface Column {
    id: string;
    name: string;
    selector: string;
    dataType: DataType;
    data: string[]; // Array of extracted values
    createdAt: number;
    color: string;
    isHighlighted?: boolean;
}

export type ExportMode = 'table' | 'columns';

export interface DataRow {
    [columnName: string]: string | undefined;
}
