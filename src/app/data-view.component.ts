import {
    AfterViewInit,
    Component,
    ContentChildren,
    ElementRef, HostListener,
    Input,
    OnInit, QueryList,
    ViewChild
} from '@angular/core';
import * as DOMPurify from 'dompurify';
import {FixedDataDirective} from './fixed-data.directive';

export interface TableModelProvider {
    getDimension(): { rows: number, columns: number };

    getRowHeight(): number | undefined;

    getColumnWidth(columnIndex: number): number | undefined;

    stylingForRow(rowIndex: number): string;

    stylingForCell(rowIndex: number, columnIndex: number): string;

    classForCell(rowIndex: number, columnIndex: number): string;

    handleClickCell(rowIndex: number, columnIndex: number): void;

    getRowContents(rowIndex: number): string[];
}

export interface VirtualScrollingOptions {
    enabled: boolean;
    viewOverflow: number;
}

interface Viewport {
    start: number;
    count: number;
    paddedStart: number;
}

// TODO: Scrolling too fast can cause viewport to start/end too early/late
// TODO: Support for hiding rows
// TODO: Support for row/column span

@Component({
    selector: 'app-data-view',
    template: `
        <div class="header" *ngIf="virtualScrolling.enabled" #headerContainer>
            <table>
                <ng-content *ngTemplateOutlet="headerContent"></ng-content>
            </table>
        </div>
        <div (scroll)="handleScroll()" style="height: 50vh; overflow: scroll;" #dataContainer>
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
    @Input() modelProvider!: TableModelProvider; // TODO: Make optional and error out if missing
    @Input() virtualScrolling: VirtualScrollingOptions = {enabled: false, viewOverflow: 0};
    hiddenRows: Set<number> = new Set<number>();
    hiddenColumns: Set<number> = new Set<number>();
    rowOrder: number[] = [];
    cellValueCache: Record<number, string[]> = {};
    cellCache: HTMLTableDataCellElement[][] = [];
    rowCache: HTMLTableRowElement[] = [];
    activeRowCount = 0;

    scheduledUpdate = false;
    private viewport: Viewport = {start: 0, count: 0, paddedStart: 0};

    constructor() {
    }

    private get tbody(): HTMLTableSectionElement {
        return this.container.nativeElement as HTMLTableSectionElement;
    }

    private get tableContainerEl(): HTMLElement {
        return this.tableContainer.nativeElement as HTMLElement;
    }

    ngOnInit(): void {
        const {rows} = this.modelProvider.getDimension();
        this.rowOrder = Array.from(new Array(rows)).map((val, index) => index);
    }

    ngAfterViewInit(): void {
        this.buildTable();
    }

    @HostListener('window:resize')
    handleWindowResize(): void {
        this.updateViewport();
    }

    handleScroll(): void {
        if (!this.virtualScrolling.enabled || this.scheduledUpdate) {
            return;
        }
        this.scheduledUpdate = true;
        requestAnimationFrame(() => {
            this.syncHeaderScroll();
            this.updateViewport();
            this.scheduledUpdate = false;
        });
    }

    private updateViewportSlots(): boolean {
        const rowDelta = this.rowsInVirtualTable - this.activeRowCount;
        if (rowDelta > 0) {
            // Too few rows => grow
            // Readd possible hidden rows
            for (let rowNumber = this.activeRowCount; rowNumber < this.rowCache.length; rowNumber++) {
                this.rowCache[rowNumber].hidden = false;
            }
            const rowsToAdd = rowDelta - (this.rowCache.length - this.activeRowCount);
            const tbody = this.tbody;
            const {columns} = this.modelProvider.getDimension();
            for (let rowNumber = 0; rowNumber < rowsToAdd; rowNumber++) {
                const tr = document.createElement('tr');
                const cache = [];
                this.rowCache.push(tr);
                this.cellCache.push(cache);
                for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
                    cache.push(tr.appendChild(document.createElement('td')));
                }
                tbody.appendChild(tr);
            }
            this.activeRowCount = this.rowCache.length;
            return true;
        } else if (rowDelta < 0) {
            // Too many rows => hide unused ones
            for (let rowNumber = this.rowCache.length + rowDelta; rowNumber < this.rowCache.length; rowNumber++) {
                this.rowCache[rowNumber].hidden = true;
            }
            this.activeRowCount = this.rowCache.length + rowDelta;
            return true;
        }
        return false;
    }

    private updateViewport(): void {
        const newViewport = this.getViewport();
        const itemsInViewPortCount = this.itemsInViewportCount;
        const shouldUpdate = Math.abs(newViewport.start - this.viewport.start) >= itemsInViewPortCount;
        if (!shouldUpdate && !this.updateViewportSlots()) {
            return;
        }
        console.log(`Update (old: ${this.viewport.paddedStart}, new: ${newViewport.paddedStart}; start: ${newViewport.start})`);
        this.viewport = newViewport;
        const {columns} = this.modelProvider.getDimension();
        for (let rowNumber = 0; rowNumber < this.viewport.count; rowNumber++) {
            const tr = this.rowCache[rowNumber];
            tr.hidden = false;
            const rowIndex = this.rowOrder[this.viewport.start + rowNumber];
            this.updateRow(tr, rowIndex);
            const rowData = this.getRowValues(rowIndex);
            for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
                const td = this.cellCache[rowNumber][columnIndex];
                this.updateCell(td, rowIndex, columnIndex, rowData[columnIndex]);
            }
        }
        for (let rowNumber = this.viewport.count; rowNumber < this.rowCache.length; rowNumber++) {
            this.rowCache[rowNumber].hidden = true;
        }
        this.viewportScroll = this.viewport.start * this.modelProvider.getRowHeight();
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
        header.scrollLeft = data.scrollLeft;
    }

    private getViewport(): Viewport {
        const data = this.dataContainer;
        const {rows} = this.modelProvider.getDimension();
        if (this.virtualScrolling.enabled) {
            const itemHeight = this.modelProvider.getRowHeight();
            if (!itemHeight) {
                throw new Error('Virtual scrolling requires to have row height to be set');
            }
            const inViewItemsCount = this.itemsInViewportCount;
            const count = Math.min(inViewItemsCount * (1 + 2 * this.virtualScrolling.viewOverflow), rows);
            const start = clamp(Math.ceil(data.scrollTop / itemHeight) - inViewItemsCount * this.virtualScrolling.viewOverflow,
                0,
                rows - count);
            // Pad the real start to begin at the nearest viewport block
            const paddedStart = Math.floor(start / inViewItemsCount) * inViewItemsCount;
            return {start, count, paddedStart};
        }
        return {start: 0, count: rows, paddedStart: 0};
    }

    private prepareTable(start: number): void {
        if (!this.virtualScrolling.enabled) {
            return;
        }
        const {rows} = this.modelProvider.getDimension();
        const rowHeight = this.modelProvider.getRowHeight();
        const tableHeight = rows * rowHeight;
        const table = this.tableContainerEl;
        table.style.height = `${tableHeight}px`;
        this.viewportScroll = start * rowHeight;
    }

    buildTable(): void {
        this.updateHeaderWidths();
        const tbody = this.tbody;

        const {columns} = this.modelProvider.getDimension();
        this.viewport = this.getViewport();
        const {start, count} = this.viewport;
        this.prepareTable(start);

        for (let rowNumber = 0; rowNumber < count; rowNumber++) {
            const rowIndex = this.rowOrder[start + rowNumber];
            const tr = this.makeRow(rowIndex);
            const rowData = this.getRowValues(rowIndex);
            for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
                tr.appendChild(this.makeCell(rowIndex, columnIndex, rowData[columnIndex]));
            }
            tbody.appendChild(tr);
        }
        this.activeRowCount = this.rowCache.length;
        // Optimization: sanitize whole tbody in place
        if (!this.virtualScrolling.enabled) {
            DOMPurify.sanitize(tbody, {IN_PLACE: true});
        }
    }

    private makeRow(row: number): HTMLTableRowElement {
        const rowEl = this.updateRow(document.createElement('tr'), row);
        if (this.virtualScrolling.enabled) {
            this.cellCache.push([]);
            this.rowCache.push(rowEl);
        }
        return rowEl;
    }

    private updateRow(row: HTMLTableRowElement, rowIndex: number): HTMLTableRowElement {
        Object.assign(row, {
            style: this.modelProvider.stylingForRow(rowIndex),
            hidden: this.hiddenRows.has(rowIndex)
        });
        const rowHeight = this.modelProvider.getRowHeight();
        if (rowHeight) {
            row.style.height = `${rowHeight}px`;
            row.style.overflow = 'hidden';
        }
        return row;
    }

    private makeCell(row: number, column: number, contents?: string): HTMLTableDataCellElement {
        const cell = this.updateCell(document.createElement('td'), row, column, contents);
        if (this.virtualScrolling.enabled) {
            const cur = this.cellCache[this.cellCache.length - 1];
            cur.push(cell);
        }
        return cell;
    }

    private updateCell(cell: HTMLTableCellElement, rowIndex: number, columnIndex: number, contents?: string): HTMLTableCellElement {
        Object.assign(cell, {
            hidden: this.hiddenColumns.has(columnIndex),
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

    private getRowValues(rowIndex: number): string[] {
        if (!this.virtualScrolling.enabled) {
            return this.modelProvider.getRowContents(rowIndex);
        }
        if (this.cellValueCache[rowIndex]) {
            return this.cellValueCache[rowIndex];
        }
        // For virtual scrolling, we have to DOMPurify each cell separately, which can bring the performance down a bit
        return this.cellValueCache[rowIndex] = this.modelProvider.getRowContents(rowIndex).map(c => DOMPurify.sanitize(c));
    }

    private get itemsInViewportCount(): number {
        return Math.ceil(this.dataContainer.clientHeight / this.modelProvider.getRowHeight());
    }

    private get rowsInVirtualTable(): number {
        const {rows} = this.modelProvider.getDimension();
        return Math.min(this.itemsInViewportCount * (1 + 2 * this.virtualScrolling.viewOverflow), rows);
    }

    private set viewportScroll(y: number) {
        this.tbody.style.transform = `translateY(${y}px)`;
    }

    private get dataContainer(): HTMLElement {
        return this.dataEl.nativeElement as HTMLElement;
    }
}

type HTMLKeys<K extends keyof HTMLElementTagNameMap> = Partial<{ [k in keyof HTMLElementTagNameMap[K]]: unknown }>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, opts?: HTMLKeys<K>): HTMLElementTagNameMap[K] {
    return Object.assign(document.createElement(tag), opts);
}

function clamp(val: number, min: number, max: number): number {
    return Math.max(Math.min(val, max), min);
}
