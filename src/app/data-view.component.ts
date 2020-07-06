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

// TODO: Handle vscroll mode
//      * [hidden] is instead list of visible components

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

    scheduledUpdate = false;
    private viewport: Viewport = {start: 0, count: 0};

    ngOnInit(): void {
        const {rows, columns} = this.modelProvider.getDimension();
        this.rowOrder = [...new Array(rows)].map((val, index) => index);
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
            const shouldUpdate = Math.abs(newViewport.start - this.viewport.start) > this.itemsInViewportCount;
            if (shouldUpdate) {
                console.log('Update!');
            }
            this.scheduledUpdate = false;
        });
    }

    private updateStickyHeaders(): void {
        if (this.fixedElements.length === 0 || !this.virtualScrolling) {
            return;
        }
        const tableEl = this.tableEl;
        for (const item of this.fixedElements) {
            item.updateSticky(tableEl);
        }
    }

    private updateHeaderWidths(): void {
        if (this.fixedElements.length === 0 || !this.virtualScrolling) {
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
            const h = table.clientHeight;
            const inViewItemsCount = this.itemsInViewportCount;
            const start = Math.max(Math.ceil(table.scrollTop / itemHeight) - inViewItemsCount * this.virtualScrolling.viewOverflow, 0);
            const count = Math.min(inViewItemsCount * (1 + 2 * this.virtualScrolling.viewOverflow), rows);
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
        tbody.style.transform = `translateY(${start * rowHeight}px)`;
    }

    buildTable(): void {
        this.updateStickyHeaders();
        this.updateHeaderWidths();
        const tbody = this.tbody;

        const {columns} = this.modelProvider.getDimension();
        this.viewport = this.getViewport();
        const {start, count} = this.viewport;
        this.prepareTable(start);

        for (let rowNumber = start; rowNumber < count; rowNumber++) {
            const rowIndex = this.rowOrder[rowNumber];
            const tr = this.makeRow(rowIndex);
            const rowData = this.getRowValues(rowIndex);
            for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
                tr.appendChild(this.makeCell(rowIndex, columnIndex, rowData[columnIndex]));
            }
            tbody.appendChild(tr);
        }
        // Optimization: sanitize whole tbody in place
        if (!this.virtualScrolling) {
            DOMPurify.sanitize(tbody, {IN_PLACE: true});
        }
    }

    private makeRow(row: number): HTMLTableRowElement {
        const rowEl = el('tr', {
            style: this.modelProvider.stylingForRow(row),
            hidden: this.hiddenRows.has(row)
        });
        const rowHeight = this.modelProvider.getRowHeight();
        if (rowHeight) {
            rowEl.style.height = `${rowHeight}px`;
            rowEl.style.overflow = 'hidden';
        }
        return rowEl;
    }

    private makeCell(row: number, column: number, contents?: string): HTMLTableDataCellElement {
        const cell = el('td', {
            hidden: this.hiddenColumns.has(column),
            className: this.modelProvider.classForCell(row, column),
            style: this.modelProvider.stylingForCell(row, column),
            onclick: () => this.modelProvider.handleClickCell(row, column)
        });
        const colWidth = this.modelProvider.getColumnWidth(column);
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
}

type HTMLKeys<K extends keyof HTMLElementTagNameMap> = Partial<{ [k in keyof HTMLElementTagNameMap[K]]: unknown }>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, opts?: HTMLKeys<K>): HTMLElementTagNameMap[K] {
    return Object.assign(document.createElement(tag), opts);
}
