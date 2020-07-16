import {AfterViewInit, Component, ElementRef, Input, NgZone, OnInit, Renderer2, ViewChild} from '@angular/core';
import * as DOMPurify from 'dompurify';

export interface TableModelProvider {
    getDimension(): { rows: number, columns: number };

    getRowHeight(rowIndex: number): number | undefined;

    getColumnWidth(columnIndex: number): number | undefined;

    stylingForRow(rowIndex: number): string;

    stylingForCell(rowIndex: number, columnIndex: number): string;

    classForCell(rowIndex: number, columnIndex: number): string;

    handleClickCell(rowIndex: number, columnIndex: number): void;

    getCellContents(rowIndex: number, columnIndex: number): string;

    getRowContents(rowIndex: number): string[];
}

export interface VirtualScrollingOptions {
    enabled: boolean;
    viewOverflow: Position;
    borderSpacing: number;
}

interface Position {
    horizontal: number;
    vertical: number;
}

interface VisibleItems {
    startIndex: number;
    count: number;
    startPosition: number;
    viewStartIndex: number;
    viewCount: number;
}

interface Viewport {
    horizontal: VisibleItems;
    vertical: VisibleItems;
}

class GridAxis {
    hiddenItems: Set<number> = new Set<number>();
    positionStart: number[] = [];
    visibleItems: number[] = []; // Ordered + hidden ones removed
    itemOrder: number[] = [];

    constructor(size: number,
                private border: number,
                private getSize: (i: number) => number) {
        this.itemOrder = Array.from(new Array(size)).map((e, i) => i);
        this.refresh();
    }

    get totalSize(): number {
        return this.positionStart[this.positionStart.length - 1];
    }

    refresh(): void {
        this.visibleItems = this.itemOrder.filter(i => !this.hiddenItems.has(i));
        this.positionStart = [0];
        for (let i = 0; i <= this.visibleItems.length - 1; i++) {
            const index = this.visibleItems[i];
            this.positionStart[i + 1] = this.positionStart[i] + this.getSize(index) + this.border;
        }
    }

    getVisibleItems(startPosition: number, size: number, viewStart: number, viewSize: number): VisibleItems {
        startPosition = clamp(startPosition, 0, this.totalSize);
        viewStart = clamp(viewStart, 0, this.totalSize);
        size = Math.min(size, this.totalSize - startPosition);
        viewSize = Math.min(viewSize, this.totalSize - viewStart);
        const startIndex = this.search(startPosition);
        const viewStartIndex = this.search(viewStart);
        const endIndex = this.search(startPosition + size);
        const viewEndIndex = this.search(viewStart + viewSize);
        return {
            startIndex: this.visibleItems[startIndex],
            count: Math.min(endIndex - startIndex + 1, this.visibleItems.length - startIndex),
            startPosition: this.positionStart[startIndex],
            viewStartIndex: viewStartIndex - startIndex,
            viewCount: Math.min(viewEndIndex - viewStartIndex + 1, this.visibleItems.length - viewStartIndex),
        };
    }

    private search(position: number, start?: number, end?: number): number {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = this.positionStart.length - 1;
        }
        if (start >= end) {
            return end;
        }
        const mid = Math.floor((start + end) / 2);
        const posStart = this.positionStart[mid];
        if (position < posStart) {
            return this.search(position, start, mid - 1);
        } else if (position > posStart) {
            return this.search(position, mid + 1, end);
        }
        return mid;
    }
}

interface RowStore {
    row: HTMLTableRowElement;
    cells: HTMLTableCellElement[];
}

class TableCache {
    rows: RowStore[] = [];
    activeArea: Position = {horizontal: 0, vertical: 0};

    constructor(private tbody: HTMLTableSectionElement) {
    }

    getRow(rowIndex: number): HTMLTableRowElement {
        if (rowIndex > this.activeArea.vertical) {
            return undefined;
        } else {
            return this.rows[rowIndex].row;
        }
    }

    getCell(rowIndex: number, cellIndex: number): HTMLTableCellElement {
        if (rowIndex > this.activeArea.vertical || cellIndex > this.activeArea.horizontal) {
            return undefined;
        }
        return this.rows[rowIndex].cells[cellIndex];
    }

    resize(rows: number, columns: number): boolean {
        const rowDelta = rows - this.activeArea.vertical;
        const colDelta = columns - this.activeArea.horizontal;
        if (rowDelta > 0) {
            // Too few rows => grow
            // Readd possible hidden rows
            for (let rowNumber = 0; rowNumber < rows; rowNumber++) {
                let row = this.rows[rowNumber];
                if (row) {
                    row.row.hidden = false;
                    continue;
                }
                row = this.rows[rowNumber] = {
                    row: el('tr'),
                    cells: []
                };
                // Don't update col count to correct one yet, handle just rows first
                for (let columnNumber = 0; columnNumber < columns; columnNumber++) {
                    const cell = row.cells[columnNumber] = el('td');
                    row.row.appendChild(cell);
                }
                this.tbody.appendChild(row.row);
            }
        } else if (rowDelta < 0) {
            // Too many rows => hide unused ones
            for (let rowNumber = rows; rowNumber < this.rows.length; rowNumber++) {
                this.rows[rowNumber].row.hidden = true;
            }
        }

        if (colDelta > 0) {
            // Columns need to be added => make use of colcache here
            for (let rowNumber = 0; rowNumber < rows; rowNumber++) {
                const row = this.rows[rowNumber];
                for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
                    let cell = row.cells[columnIndex];
                    if (cell) {
                        cell.hidden = false;
                    } else {
                        cell = row.cells[columnIndex] = el('td');
                        row.row.appendChild(cell);
                    }
                }
            }
        } else if (colDelta < 0) {
            // Need to hide columns
            for (let rowNumber = 0; rowNumber < rows; rowNumber++) {
                const row = this.rows[rowNumber];
                for (let colNumber = columns; colNumber < row.cells.length; colNumber++) {
                    row.cells[colNumber].hidden = true;
                }
            }
        }
        this.activeArea = {
            horizontal: columns,
            vertical: rows
        };
        return rowDelta !== 0 && colDelta !== 0;
    }
}

// TODO: Make all headers virtual and part of the datagrid
// TODO: Add ID + checkbox cols
// TODO: Support for hiding rows
// TODO: Support for row/column span

@Component({
    selector: 'app-data-view',
    template: `
        <div class="header" #headerContainer>
            <table>
                <tbody #headerTable></tbody>
            </table>
        </div>
        <div class="ids" #idsContainer>
            <table #idTable>
                <tbody #idTableBody></tbody>
            </table>
        </div>
        <div class="data" style="height: 50vh; overflow: scroll;" #dataContainer>
            <table [class.virtual]="virtualScrolling.enabled" #tableContainer>
                <tbody class="content" #container></tbody>
            </table>
        </div>
    `,
    styleUrls: ['./data-view.component.scss']
})
export class DataViewComponent implements AfterViewInit, OnInit {
    @ViewChild('container') container!: ElementRef;
    @ViewChild('tableContainer') tableContainer!: ElementRef;
    @ViewChild('headerContainer') headerEl?: ElementRef;
    @ViewChild('dataContainer') dataEl?: ElementRef;
    @ViewChild('idTableBody') idTableBody?: ElementRef;
    @ViewChild('idTable') idTable?: ElementRef;
    @ViewChild('headerTable') headerTable?: ElementRef;
    @ViewChild('idsContainer') idsContainer?: ElementRef;
    @Input() modelProvider!: TableModelProvider; // TODO: Make optional and error out if missing
    @Input() virtualScrolling: VirtualScrollingOptions = {
        enabled: false,
        viewOverflow: {horizontal: 1, vertical: 1},
        borderSpacing: 2
    };
    viewPortdY = 0;
    private cellValueCache: Record<number, string[]> = {};
    private dataTableCache: TableCache;
    private idTableCache: TableCache;
    private headerTableCache: TableCache;
    private scheduledUpdate = false;
    private viewport: Viewport;
    private rowAxis: GridAxis;
    private colAxis: GridAxis;

    constructor(private r2: Renderer2, private zone: NgZone) {
    }

    private get tbody(): HTMLTableSectionElement {
        return this.container.nativeElement as HTMLTableSectionElement;
    }

    private get tableContainerEl(): HTMLElement {
        return this.tableContainer.nativeElement as HTMLElement;
    }

    private get dataContainer(): HTMLElement {
        return this.dataEl.nativeElement as HTMLElement;
    }

    ngOnInit(): void {
        if (this.virtualScrolling.enabled) {
            this.startCellPurifying();
        }
        const {rows, columns} = this.modelProvider.getDimension();
        this.rowAxis = new GridAxis(rows, this.virtualScrolling.borderSpacing, i => this.modelProvider.getRowHeight(i));
        this.colAxis = new GridAxis(columns, this.virtualScrolling.borderSpacing, i => this.modelProvider.getColumnWidth(i));
    }

    ngAfterViewInit(): void {
        this.dataTableCache = new TableCache(this.tbody);
        this.idTableCache = new TableCache(this.idTableBody.nativeElement as HTMLTableSectionElement);
        this.headerTableCache = new TableCache(this.headerTable.nativeElement as HTMLTableSectionElement);
        this.buildTable();
        if (this.virtualScrolling.enabled) {
            // Scrolling can cause change detection on some cases, which slows down the table
            // Since scrolling is
            // * Only used in vscrolling mode
            // * Doesn't change the template
            // it's better to run scroll events outside zones
            this.zone.runOutsideAngular(() => {
                this.r2.listen(this.dataEl.nativeElement, 'scroll', () => this.handleScroll());
            });
            this.zone.runOutsideAngular(() => {
                window.addEventListener('resize', () => this.handleWindowResize());
            });
        }
    }

    handleWindowResize(): void {
        this.updateHeaderIdsSizes();
        this.viewport = this.getViewport();
        runMultiFrame(this.updateViewport());
    }

    handleScroll(): void {
        this.syncHeaderScroll();
        if (this.scheduledUpdate) {
            return;
        }
        if (!this.isOutsideSafeViewZone()) {
            return;
        }
        this.scheduledUpdate = true;
        // Set viewport already here to account for subsequent handlers
        const newViewport = this.getViewport();
        this.viewPortdY = newViewport.vertical.startIndex - this.viewport.vertical.startIndex;
        this.viewport = newViewport;
        this.updateScroll();
        runMultiFrame(this.updateViewport());
    }

    buildTable(): void {
        const tbody = this.tbody;
        this.viewport = this.getViewport();
        const {vertical, horizontal} = this.viewport;
        this.prepareTable();
        this.updateScroll();
        this.dataTableCache.resize(vertical.count, horizontal.count);
        const getItem = (axis: GridAxis, index: number) =>
            this.virtualScrolling.enabled ? this.rowAxis.visibleItems[index] : this.rowAxis.itemOrder[index];

        for (let rowNumber = 0; rowNumber < vertical.count; rowNumber++) {
            const rowIndex = getItem(this.rowAxis, vertical.startIndex + rowNumber);
            this.updateRow(this.dataTableCache.getRow(rowNumber), rowIndex);
            for (let columnNumber = 0; columnNumber < horizontal.count; columnNumber++) {
                const columnIndex = getItem(this.colAxis, horizontal.startIndex + columnNumber);
                const cell = this.dataTableCache.getCell(rowNumber, columnNumber);
                this.updateCell(cell, rowIndex, columnIndex, this.getCellValue(rowIndex, columnIndex));
            }
        }
        // Optimization in normal mode: sanitize whole tbody in place
        if (!this.virtualScrolling.enabled) {
            DOMPurify.sanitize(tbody, {IN_PLACE: true});
        }
        this.buildIdTable();
        this.buildHeaderTable();
        this.updateHeaderIdsSizes();
    }

    private updateHeaderIdsSizes(): void {
        const data = this.dataEl.nativeElement as HTMLElement;
        const header = this.headerEl.nativeElement as HTMLElement;
        const ids = this.idsContainer.nativeElement as HTMLElement;
        header.style.width = `${data.clientWidth}px`;
        ids.style.height = `${data.clientHeight}px`;
    }

    private isOutsideSafeViewZone(): boolean {
        const data = this.dataContainer;
        const h = data.clientHeight * this.virtualScrolling.viewOverflow.vertical;
        const w = data.clientWidth * this.virtualScrolling.viewOverflow.horizontal;
        const overVertical = Math.abs(this.viewport.vertical.startPosition - this.dataContainer.scrollTop + h) > h;
        const overHorizontal = Math.abs(this.viewport.horizontal.startPosition - this.dataContainer.scrollLeft + w) > w;
        return overHorizontal || overVertical;
    }

    private* updateViewport(): Generator {
        const {vertical, horizontal} = this.viewport;
        this.dataTableCache.resize(this.viewport.vertical.count, this.viewport.horizontal.count);
        this.idTableCache.resize(this.viewport.vertical.count, 2);
        const render = (startRow: number, endRow: number) => {
            for (let rowNumber = startRow; rowNumber < endRow; rowNumber++) {
                const tr = this.dataTableCache.getRow(rowNumber);
                tr.hidden = false;
                const rowIndex = this.rowAxis.visibleItems[vertical.startIndex + rowNumber];
                this.updateRow(tr, rowIndex);
                for (let columnNumber = 0; columnNumber < horizontal.count; columnNumber++) {
                    const td = this.dataTableCache.getCell(rowNumber, columnNumber);
                    td.hidden = false;
                    const columnIndex = this.colAxis.visibleItems[horizontal.startIndex + columnNumber];
                    this.updateCell(td, rowIndex, columnIndex, this.getCellValue(rowIndex, columnIndex));
                }

                const idCell = this.idTableCache.getCell(rowNumber, 0);
                idCell.textContent = `${rowIndex}`;
            }
        };
        // Render in three parts:
        // * The main visible area
        // * The top part
        // * The bottom part
        let renderOrder = [
            () => render(0, vertical.viewStartIndex),
            () => render(vertical.viewStartIndex + vertical.viewCount, vertical.count)
        ];
        if (this.viewPortdY > 0) {
            renderOrder = renderOrder.reverse();
        }
        render(vertical.viewStartIndex, vertical.viewStartIndex + vertical.viewCount);
        yield;
        for (const r of renderOrder) {
            r();
            yield;
        }
        // render(0, vertical.viewStartIndex);
        // yield;
        // render(vertical.viewStartIndex + vertical.viewCount, vertical.count);
        // yield;
        this.tbody.style.visibility = 'visible';
        // If we veered off the new safe view zone, we need to update it again!
        if (this.isOutsideSafeViewZone()) {
            // This could have been likely caused by fast scrolling, in which case hide the element to prevent
            // flickering
            this.tbody.style.visibility = 'hidden';
            this.viewport = this.getViewport();
            this.updateScroll();
            runMultiFrame(this.updateViewport());
        } else {
            this.scheduledUpdate = false;
        }
    }

    private syncHeaderScroll(): void {
        if (!this.headerEl || !this.dataEl) {
            return;
        }
        const header = this.headerEl.nativeElement as HTMLElement;
        const data = this.dataEl.nativeElement as HTMLElement;
        const ids = this.idsContainer.nativeElement as HTMLElement;
        header.scrollLeft = data.scrollLeft;
        ids.scrollTop = data.scrollTop;
    }

    private getViewport(): Viewport {
        const data = this.dataContainer;
        const {rows, columns} = this.modelProvider.getDimension();
        if (this.virtualScrolling.enabled) {
            const viewportWidth = data.clientWidth * (1 + 2 * this.virtualScrolling.viewOverflow.horizontal);
            const viewportHeight = data.clientHeight * (1 + 2 * this.virtualScrolling.viewOverflow.vertical);
            return {
                horizontal: this.colAxis.getVisibleItems(
                    data.scrollLeft - data.clientWidth * this.virtualScrolling.viewOverflow.horizontal,
                    viewportWidth,
                    data.scrollLeft,
                    data.clientWidth),
                vertical: this.rowAxis.getVisibleItems(
                    data.scrollTop - data.clientHeight * this.virtualScrolling.viewOverflow.vertical,
                    viewportHeight,
                    data.scrollTop,
                    data.clientHeight)
            };
        }
        return {
            horizontal: {startPosition: 0, count: columns, startIndex: 0, viewCount: 0, viewStartIndex: 0},
            vertical: {startPosition: 0, count: rows, startIndex: 0, viewCount: 0, viewStartIndex: 0},
        };
    }

    private prepareTable(): void {
        if (!this.virtualScrolling.enabled) {
            return;
        }
        const table = this.tableContainerEl;
        const idTable = this.idTable.nativeElement as HTMLElement;
        table.style.height = `${this.rowAxis.totalSize}px`;
        table.style.width = `${this.colAxis.totalSize}px`;
        table.style.borderSpacing = `${this.virtualScrolling.borderSpacing}px`;
        idTable.style.height = `${this.rowAxis.totalSize}px`;
        idTable.style.borderSpacing = `${this.virtualScrolling.borderSpacing}px`;
    }

    private buildHeaderTable(): void {
        if (!this.headerTableCache) {
            return;
        }
        this.headerTableCache.resize(2, this.viewport.horizontal.count);
        const {horizontal} = this.viewport;
        for (let column = 0; column < horizontal.count; column++) {
            const columnIndex = this.colAxis.visibleItems[column + horizontal.startIndex];
            const headerCell = this.headerTableCache.getCell(0, column);
            headerCell.textContent = `${columnIndex}`;
            headerCell.style.width = `${this.modelProvider.getColumnWidth(columnIndex)}px`;

            const filterCell = this.headerTableCache.getCell(1, column);
            const filterInput = el('input');
            filterInput.type = 'text';
            filterCell.style.width = `${this.modelProvider.getColumnWidth(columnIndex)}px`;
            filterCell.appendChild(filterInput);
        }
    }

    private buildIdTable(): void {
        if (!this.idTableCache) {
            return;
        }
        this.idTableCache.resize(this.viewport.vertical.count, 2);
        const {vertical} = this.viewport;
        for (let row = 0; row < vertical.count; row++) {
            const rowIndex = this.rowAxis.visibleItems[row + vertical.startIndex];

            const tr = this.idTableCache.getRow(row);
            tr.style.height = `${this.modelProvider.getRowHeight(rowIndex)}px`;

            const idCell = this.idTableCache.getCell(row, 0);
            idCell.textContent = `${rowIndex}`;
            idCell.style.width = '2em';

            const selectCell = this.idTableCache.getCell(row, 1);
            const input = el('input');
            input.type = 'checkbox';
            selectCell.appendChild(input);
        }
    }

    private updateRow(row: HTMLTableRowElement, rowIndex: number): HTMLTableRowElement {
        row.style.cssText = this.modelProvider.stylingForRow(rowIndex);
        row.hidden = !this.virtualScrolling.enabled && this.rowAxis.hiddenItems.has(rowIndex);
        const rowHeight = this.modelProvider.getRowHeight(rowIndex);
        if (rowHeight) {
            row.style.height = `${rowHeight}px`;
            row.style.overflow = 'hidden';
        }
        return row;
    }

    private updateCell(cell: HTMLTableCellElement, rowIndex: number, columnIndex: number, contents?: string): HTMLTableCellElement {
        cell.hidden = !this.virtualScrolling.enabled && this.colAxis.hiddenItems.has(columnIndex);
        cell.className = this.modelProvider.classForCell(rowIndex, columnIndex);
        cell.style.cssText = this.modelProvider.stylingForCell(rowIndex, columnIndex);
        cell.onclick = () => this.modelProvider.handleClickCell(rowIndex, columnIndex);
        const colWidth = this.modelProvider.getColumnWidth(columnIndex);
        if (colWidth) {
            cell.style.width = `${colWidth}px`;
            cell.style.overflow = 'hidden';
        }
        if (contents) {
            cell.innerHTML = contents;
        }
        return cell;
    }

    private getCellValue(rowIndex: number, columnIndex: number): string {
        if (!this.virtualScrolling.enabled) {
            return this.modelProvider.getCellContents(rowIndex, columnIndex);
        }
        const row = this.cellValueCache[rowIndex];
        if (row?.[columnIndex]) {
            return this.cellValueCache[rowIndex][columnIndex];
        }
        if (!row) {
            this.cellValueCache[rowIndex] = [];
        }
        // If the web worker hasn't sanitized the contents yet, do it ourselves
        return this.cellValueCache[rowIndex][columnIndex] = DOMPurify.sanitize(this.modelProvider.getCellContents(rowIndex, columnIndex));
    }

    private updateScroll(): void {
        const idTable = this.idTableBody.nativeElement as HTMLElement;
        this.tbody.style.transform = `translateX(${this.viewport.horizontal.startPosition}px) translateY(${this.viewport.vertical.startPosition}px)`;
        idTable.style.transform = `translateX(${this.viewport.horizontal.startPosition}px) translateY(${this.viewport.vertical.startPosition}px)`;
    }

    private startCellPurifying(): void {
        if (typeof Worker !== 'undefined') {
            const worker = new Worker('./table-purify.worker', {type: 'module'});
            worker.onmessage = ({data}: { data: PurifyData }) => {
                this.cellValueCache[data.row] = data.data;
            };
            const {rows} = this.modelProvider.getDimension();
            for (let row = 0; row < rows; row++) {
                worker.postMessage({
                    row,
                    data: this.modelProvider.getRowContents(row)
                } as PurifyData);
            }
        }
    }
}

type HTMLKeys<K extends keyof HTMLElementTagNameMap> = Partial<{ [k in keyof HTMLElementTagNameMap[K]]: unknown }>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
    return document.createElement(tag);
}

function clamp(val: number, min: number, max: number): number {
    return Math.max(Math.min(val, max), min);
}

function runMultiFrame(iter: Generator): void {
    const cb = () => {
        const result = iter.next();
        if (!result.done) {
            requestAnimationFrame(cb);
        }
    };
    requestAnimationFrame(cb);
}

function waitForFrame(): Promise<void> {
    return new Promise<void>(r => requestAnimationFrame(() => {
        r();
    }));
}

interface PurifyData {
    row: number;
    data: string[];
}
