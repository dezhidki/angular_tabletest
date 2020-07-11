import {
    AfterViewInit,
    Component,
    ContentChildren,
    ElementRef,
    HostBinding,
    Input,
    NgZone,
    OnInit,
    QueryList,
    Renderer2,
    ViewChild
} from '@angular/core';
import * as DOMPurify from 'dompurify';
import {FixedDataDirective} from './fixed-data.directive';

export interface TableModelProvider {
    getDimension(): { rows: number, columns: number };

    getRowHeight(rowIndex: number): number | undefined;

    getColumnWidth(columnIndex: number): number | undefined;

    stylingForRow(rowIndex: number): string;

    stylingForCell(rowIndex: number, columnIndex: number): string;

    classForCell(rowIndex: number, columnIndex: number): string;

    handleClickCell(rowIndex: number, columnIndex: number): void;

    getCellContents(rowIndex: number, columnIndex: number): string;
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
        viewSize = Math.min(viewSize, this.totalSize - startPosition);
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
            return start;
        }
        const mid = Math.floor((start + end) / 2);
        const posStart = this.positionStart[mid];
        if (position < posStart) {
            return this.search(position, start, mid - 1);
        } else if (position > posStart) {
            return this.search(position, mid + 1, end);
        }
        return start;
    }
}

// TODO: Make all headers virtual and part of the datagrid
// TODO: Don't draw when fast scrolling?
// TODO: Add ID + checkbox cols
// TODO: Support for hiding rows
// TODO: Support for row/column span

@Component({
    selector: 'app-data-view',
    template: `
        <ng-container *ngIf="virtualScrolling.enabled">
            <div class="header" #headerContainer>
                <table>
                    <ng-content *ngTemplateOutlet="headerContent"></ng-content>
                </table>
            </div>
            <div class="ids" #idsContainer>
                <table #idTable></table>
            </div>
        </ng-container>
        <div class="data" style="height: 50vh; overflow: scroll;" #dataContainer>
            <table [class.virtual]="virtualScrolling.enabled" #tableContainer>
                <ng-container *ngIf="!virtualScrolling.enabled">
                    <ng-content *ngTemplateOutlet="headerContent"></ng-content>
                </ng-container>
                <tbody class="content" #container>
                </tbody>
            </table>
        </div>
        <ng-template #headerContent>
            <ng-content></ng-content>
        </ng-template>
    `,
    styleUrls: ['./data-view.component.scss']
})
export class DataViewComponent implements AfterViewInit, OnInit {
    @ContentChildren(FixedDataDirective) fixedElements!: QueryList<FixedDataDirective>;
    @ViewChild('container') container!: ElementRef;
    @ViewChild('tableContainer') tableContainer!: ElementRef;
    @ViewChild('headerContainer') headerEl?: ElementRef;
    @ViewChild('dataContainer') dataEl?: ElementRef;
    @ViewChild('idTable') idTable?: ElementRef;
    @ViewChild('idsContainer') idsContainer?: ElementRef;
    @Input() modelProvider!: TableModelProvider; // TODO: Make optional and error out if missing
    @Input() virtualScrolling: VirtualScrollingOptions = {
        enabled: false,
        viewOverflow: {horizontal: 1, vertical: 1},
        borderSpacing: 2
    };
    @HostBinding('class.virtual') virtual = false;
    cellValueCache: Record<number, string[]> = {};
    cellCache: HTMLTableDataCellElement[][] = [];
    rowCache: HTMLTableRowElement[] = [];
    activeTableArea: Position = {horizontal: 0, vertical: 0};
    scheduledUpdate = false;
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
        this.virtual = this.virtualScrolling.enabled;
        const {rows, columns} = this.modelProvider.getDimension();
        this.rowAxis = new GridAxis(rows, this.virtualScrolling.borderSpacing, i => this.modelProvider.getRowHeight(i));
        this.colAxis = new GridAxis(columns, this.virtualScrolling.borderSpacing, i => this.modelProvider.getColumnWidth(i));
    }

    ngAfterViewInit(): void {
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
        this.viewport = this.getViewport();
        runMultiFrame(this.updateViewport());
    }

    buildTable(): void {
        // this.updateHeaderWidths();
        const tbody = this.tbody;

        this.viewport = this.getViewport();
        const {vertical, horizontal} = this.viewport;
        this.prepareTable();
        this.updateScroll();
        const getItem = (axis: GridAxis, index: number) =>
            this.virtualScrolling.enabled ? this.rowAxis.visibleItems[index] : this.rowAxis.itemOrder[index];

        for (let rowNumber = 0; rowNumber < vertical.count; rowNumber++) {
            const rowIndex = getItem(this.rowAxis, vertical.startIndex + rowNumber);
            const tr = this.makeRow(rowIndex);
            for (let columnNumber = 0; columnNumber < horizontal.count; columnNumber++) {
                const columnIndex = getItem(this.colAxis, horizontal.startIndex + columnNumber);
                tr.appendChild(this.makeCell(rowIndex, columnIndex, this.getCellValue(rowIndex, columnIndex)));
            }
            tbody.appendChild(tr);
        }
        this.activeTableArea = {
            vertical: vertical.count,
            horizontal: horizontal.count
        };
        // Optimization: sanitize whole tbody in place
        if (!this.virtualScrolling.enabled) {
            DOMPurify.sanitize(tbody, {IN_PLACE: true});
        }
        if (this.idTable) {
            this.buildIdTable(this.idTable.nativeElement);
        }
        this.updateHeaderIdsSizes();
    }

    private updateViewportSlots(): boolean {
        const rowDelta = this.viewport.vertical.count - this.activeTableArea.vertical;
        const colDelta = this.viewport.horizontal.count - this.activeTableArea.horizontal;
        if (rowDelta > 0) {
            // Too few rows => grow
            // Readd possible hidden rows
            const tbody = this.tbody;
            for (let rowNumber = 0; rowNumber < this.viewport.vertical.count; rowNumber++) {
                let tr = this.rowCache[rowNumber];
                if (tr) {
                    tr.hidden = false;
                    continue;
                }
                tr = this.rowCache[rowNumber] = el('tr');
                const cache = [];
                this.cellCache.push(cache);
                // Don't update col count to correct one yet, handle just rows first
                for (let columnIndex = 0; columnIndex < this.activeTableArea.horizontal; columnIndex++) {
                    cache[columnIndex] = tr.appendChild(el('td'));
                }
                tbody.appendChild(tr);
            }
        } else if (rowDelta < 0) {
            // Too many rows => hide unused ones
            for (let rowNumber = this.viewport.vertical.count; rowNumber < this.rowCache.length; rowNumber++) {
                this.rowCache[rowNumber].hidden = true;
            }
        }

        if (colDelta > 0) {
            // Columns need to be added => make use of colcache here
            for (let rowNumber = 0; rowNumber < this.viewport.vertical.count; rowNumber++) {
                const tr = this.rowCache[rowNumber];
                for (let colNumber = 0; colNumber < this.viewport.horizontal.count; colNumber++) {
                    let td = this.cellCache[rowNumber][colNumber];
                    if (td) {
                        td.hidden = false;
                        continue;
                    }
                    td = this.cellCache[rowNumber][colNumber] = tr.appendChild(el('td'));
                }
            }
        } else if (colDelta < 0) {
            // Need to hide columns
            for (let rowNumber = 0; rowNumber < this.viewport.vertical.count; rowNumber++) {
                const row = this.cellCache[rowNumber];
                for (let colNumber = this.activeTableArea.horizontal; colNumber < row.length; colNumber++) {
                    row[colNumber].hidden = true;
                }
            }
        }
        this.activeTableArea = {
            horizontal: this.viewport.horizontal.count,
            vertical: this.viewport.vertical.count
        };
        return rowDelta !== 0 && colDelta !== 0;
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
        this.updateScroll();
        this.updateViewportSlots();
        const {vertical, horizontal} = this.viewport;
        console.log(vertical);
        const render = (startRow: number, endRow: number) => {
            console.log(`Render ${startRow} => ${endRow - 1}`);
            for (let rowNumber = startRow; rowNumber < endRow; rowNumber++) {
                const tr = this.rowCache[rowNumber];
                tr.hidden = false;
                const rowIndex = this.rowAxis.visibleItems[vertical.startIndex + rowNumber];
                this.updateRow(tr, rowIndex);
                for (let columnNumber = 0; columnNumber < horizontal.count; columnNumber++) {
                    const td = this.cellCache[rowNumber][columnNumber];
                    td.hidden = false;
                    const columnIndex = horizontal.startIndex + columnNumber;
                    this.updateCell(td, rowIndex, columnIndex, this.getCellValue(rowIndex, columnIndex));
                }
            }
        };
        // Render in three parts:
        // * The main visible area
        // * The top part
        // * The bottom part
        render(vertical.viewStartIndex, vertical.viewStartIndex + vertical.viewCount);
        yield;
        render(0, vertical.viewStartIndex);
        yield;
        render(vertical.viewStartIndex + vertical.viewCount, vertical.count);
        yield;
        for (let r = 0; r < this.rowCache.length; r++) {
            const tr = this.rowCache[r];
            if (r > this.activeTableArea.vertical) {
                tr.hidden = true;
            }
            const row = this.cellCache[r];
            for (let c = this.activeTableArea.horizontal; c < row.length; c++) {
                row[c].hidden = true;
            }
        }
        yield;
        // If we veered off the new safe view zone, we need to update it again!
        if (this.isOutsideSafeViewZone()) {
            this.viewport = this.getViewport();
            runMultiFrame(this.updateViewport());
        } else {
            this.scheduledUpdate = false;
        }
    }

    private updateHeaderWidths(): void {
        if (this.fixedElements.length === 0 || !this.virtualScrolling.enabled) {
            return;
        }
        const {columns} = this.modelProvider.getDimension();
        const widths = Array.from(new Array(columns)).map((e, i) => this.modelProvider.getColumnWidth(i));
        for (const item of this.fixedElements) {
            item.setWidth(widths);
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
            console.log(data.scrollTop);
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
        table.style.height = `${this.rowAxis.totalSize}px`;
        table.style.width = `${this.colAxis.totalSize}px`;
        table.style.borderSpacing = `${this.virtualScrolling.borderSpacing}px`;
    }

    private updateHeaderIdsSizes(): void {
        const data = this.dataEl.nativeElement as HTMLElement;
        const header = this.headerEl.nativeElement as HTMLElement;
        const ids = this.idsContainer.nativeElement as HTMLElement;
        header.style.width = `${data.clientWidth}px`;
        ids.style.height = `${data.clientHeight}px`;
    }

    private buildIdTable(table: HTMLTableElement): void {
        // const {rows} = this.modelProvider.getDimension();
        // const tbody = el('tbody');
        // const rowHeight = this.modelProvider.getRowHeight();
        //
        // for (let row = 0; row < rows; row++) {
        //     const tr = tbody.appendChild(el('tr'));
        //     tr.style.height = `${rowHeight}px`;
        //     tr.appendChild(el('td', {
        //         textContent: `${row}`
        //     }));
        //     tr.appendChild(el('td')).appendChild(el('input', {
        //         type: 'checkbox'
        //     }));
        // }
        // table.appendChild(tbody);
    }

    private makeRow(row: number): HTMLTableRowElement {
        const rowEl = this.updateRow(el('tr'), row);
        if (this.virtualScrolling.enabled) {
            this.cellCache.push([]);
            this.rowCache.push(rowEl);
        }
        return rowEl;
    }

    private updateRow(row: HTMLTableRowElement, rowIndex: number): HTMLTableRowElement {
        Object.assign(row, {
            style: this.modelProvider.stylingForRow(rowIndex),
            hidden: !this.virtualScrolling.enabled && this.rowAxis.hiddenItems.has(rowIndex)
        });
        const rowHeight = this.modelProvider.getRowHeight(rowIndex);
        if (rowHeight) {
            row.style.height = `${rowHeight}px`;
            row.style.overflow = 'hidden';
        }
        return row;
    }

    private makeCell(row: number, column: number, contents?: string): HTMLTableDataCellElement {
        const cell = this.updateCell(el('td'), row, column, contents);
        if (this.virtualScrolling.enabled) {
            const cur = this.cellCache[this.cellCache.length - 1];
            cur.push(cell);
        }
        return cell;
    }

    private updateCell(cell: HTMLTableCellElement, rowIndex: number, columnIndex: number, contents?: string): HTMLTableCellElement {
        Object.assign(cell, {
            hidden: !this.virtualScrolling.enabled && this.colAxis.hiddenItems.has(columnIndex),
            className: this.modelProvider.classForCell(rowIndex, columnIndex),
            style: this.modelProvider.stylingForCell(rowIndex, columnIndex),
            onclick: () => this.modelProvider.handleClickCell(rowIndex, columnIndex)
        });
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
        // For virtual scrolling, we have to DOMPurify each cell separately, which can bring the performance down a bit
        return this.cellValueCache[rowIndex][columnIndex] = this.modelProvider.getCellContents(rowIndex, columnIndex);
    }

    private updateScroll(): void {
        this.tbody.style.transform = `translateX(${this.viewport.horizontal.startPosition}px) translateY(${this.viewport.vertical.startPosition}px)`;
    }
}

type HTMLKeys<K extends keyof HTMLElementTagNameMap> = Partial<{ [k in keyof HTMLElementTagNameMap[K]]: unknown }>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, opts?: HTMLKeys<K>): HTMLElementTagNameMap[K] {
    return Object.assign(document.createElement(tag), opts);
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
