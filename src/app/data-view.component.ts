import {
    AfterViewInit,
    Component,
    ContentChildren,
    ElementRef,
    Input,
    OnInit, QueryList,
    Renderer2,
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
}

// TODO: Redo vscroll mode to consist of two tables instead of one
//      * Idea (https://uxdesign.cc/position-stuck-96c9f55d9526):
//           <div #parent>
//               <div #header>Header</div>
//               <div #data>Data here</div>
//           </div>
//      * Then sync scrolling of both
// TODO: fix shouldUpdate (right now top overflow not detected properly)
// TODO: Support for hiding rows
// TODO: Support for row/column span

@Component({
    selector: 'app-data-view',
    template: `
        <table (scroll)="handleScroll()" style="width: 50vw; height: 50vh; overflow: scroll;"
               [class.virtual]="virtualScrolling.enabled" #table>
            <ng-content></ng-content>
            <tbody class="content" #container>
            </tbody>
        </table>
    `,
    styleUrls: ['./data-view.component.scss']
})
export class DataViewComponent implements AfterViewInit, OnInit {

    constructor(private r2: Renderer2) {
    }

    private get tbody(): HTMLTableSectionElement {
        return this.container.nativeElement as HTMLTableSectionElement;
    }

    private get tableEl(): HTMLTableElement {
        return this.table.nativeElement as HTMLTableElement;
    }

    @ContentChildren(FixedDataDirective) fixedElements!: QueryList<FixedDataDirective>;
    @ViewChild('container') container!: ElementRef;
    @ViewChild('table') table!: ElementRef;
    @Input() modelProvider!: TableModelProvider; // TODO: Make optional and error out if missing
    @Input() virtualScrolling: VirtualScrollingOptions = {enabled: false, viewOverflow: 0};
    hiddenRows: Set<number> = new Set<number>();
    hiddenColumns: Set<number> = new Set<number>();
    rowOrder: number[] = [];
    cellValueCache: Record<number, string[]> = {};
    cellCache: HTMLTableDataCellElement[][] = [];
    rowCache: HTMLTableRowElement[] = [];

    scheduledUpdate = false;
    private viewport: Viewport = {start: 0, count: 0};

    ngOnInit(): void {
        const {rows} = this.modelProvider.getDimension();
        this.rowOrder = Array.from(new Array(rows)).map((val, index) => index);
    }

    ngAfterViewInit(): void {
        this.buildTable();
    }

    handleScroll(): void {
        if (!this.virtualScrolling.enabled || this.scheduledUpdate) {
            return;
        }
        this.scheduledUpdate = true;
        requestAnimationFrame(() => {
            this.updateStickyHeaders();
            const newViewport = this.getViewport();
            const shouldUpdate = Math.abs(newViewport.start - this.viewport.start) + 2 > this.itemsInViewportCount;
            if (shouldUpdate) {
                console.log('Update!');
                this.updateViewport(newViewport);
            }
            this.scheduledUpdate = false;
        });
    }

    private updateViewport(newViewport: Viewport): void {
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

    private updateStickyHeaders(): void {
        if (this.fixedElements.length === 0 || !this.virtualScrolling.enabled) {
            return;
        }
        const tableEl = this.tableEl;
        for (const item of this.fixedElements) {
            item.updateSticky(tableEl);
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

    private getViewport(): Viewport {
        const table = this.tableEl;
        const {rows} = this.modelProvider.getDimension();
        if (this.virtualScrolling.enabled) {
            const itemHeight = this.modelProvider.getRowHeight();
            if (!itemHeight) {
                throw new Error('Virtual scrolling requires to have row height to be set');
            }
            const inViewItemsCount = this.itemsInViewportCount;
            const start = Math.max(Math.ceil(table.scrollTop / itemHeight) - inViewItemsCount * this.virtualScrolling.viewOverflow, 0);
            const count = Math.min(inViewItemsCount * (1 + 2 * this.virtualScrolling.viewOverflow), rows - start);
            return {start, count};
        }
        return {start: 0, count: rows};
    }

    private prepareTable(start: number): void {
        if (!this.virtualScrolling.enabled) {
            return;
        }
        const {rows} = this.modelProvider.getDimension();
        const rowHeight = this.modelProvider.getRowHeight();
        const tableHeight = rows * rowHeight;
        const tbody = this.tbody;
        tbody.style.height = `${tableHeight}px`;
        this.viewportScroll = start * rowHeight;
    }

    buildTable(): void {
        this.updateStickyHeaders();
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
        return Math.ceil(this.tableEl.clientHeight / this.modelProvider.getRowHeight());
    }

    private set viewportScroll(y: number) {
        this.tbody.style.transform = `translateY(${y}px)`;
    }
}

type HTMLKeys<K extends keyof HTMLElementTagNameMap> = Partial<{ [k in keyof HTMLElementTagNameMap[K]]: unknown }>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, opts?: HTMLKeys<K>): HTMLElementTagNameMap[K] {
    return Object.assign(document.createElement(tag), opts);
}
