import {
    AfterContentInit,
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
import {FixedDataDirective} from "./fixed-data.directive";

export interface TableModelProvider {
    getDimension(): { rows: number, columns: number };

    getRowHeight(rowIndex: number): number | undefined;

    getCellWidth(columnIndex: number): number | undefined;

    stylingForRow(rowIndex: number): string;

    stylingForCell(rowIndex: number, columnIndex: number): string;

    classForCell(rowIndex: number, columnIndex: number): string;

    handleClickCell(rowIndex: number, columnIndex: number): void;

    getRowContents(rowIndex: number): string[];
}

// TODO: In vscroll mode, replace [hidden] with value skip
// TODO: Handle vscroll mode

@Component({
    selector: 'app-data-view',
    template: `
        <table #table>
            <ng-content></ng-content>
            <tbody #container>
            </tbody>
        </table>
    `,
    styleUrls: ['./data-view.component.scss']
})
export class DataViewComponent implements AfterViewInit, OnInit {
    @ContentChildren(FixedDataDirective) fixedElements!: QueryList<FixedDataDirective>;
    @ViewChild('container') container!: ElementRef;
    @ViewChild('table') table!: ElementRef;
    @Input() modelProvider!: TableModelProvider; // TODO: Make optional and error out if missing
    @Input() virtualScrolling = false;
    @Input() stickyHeader = false;
    hiddenRows: Set<number> = new Set<number>();
    hiddenColumns: Set<number> = new Set<number>();
    rowOrder: number[] = [];
    cellValueCache: Record<number, string[]> = {};

    constructor(private r2: Renderer2) {
    }

    ngOnInit(): void {
        const {rows} = this.modelProvider.getDimension();
        this.rowOrder = [...new Array(rows)].map((val, index) => index);
    }

    ngAfterViewInit(): void {
        this.buildTable();
    }

    private updateStickyHeaders(): void {
        if (this.fixedElements.length === 0 || (!this.virtualScrolling && !this.stickyHeader)) {
            return;
        }
        const tableEl = this.table.nativeElement as HTMLTableElement;
        for (const item of this.fixedElements) {
            item.updateSticky(tableEl);
        }
    }

    buildTable(): void {
        this.updateStickyHeaders();
        const tbody = this.tbody;

        const {rows, columns} = this.modelProvider.getDimension();

        for (let rowNumber = 0; rowNumber < rows; rowNumber++) {
            const rowIndex = this.rowOrder[rowNumber];
            const tr = el('tr', {
                style: this.modelProvider.stylingForRow(rowIndex),
                hidden: this.hiddenRows.has(rowIndex)
            });
            const rowData = this.getRowValues(rowIndex);
            for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
                tr.appendChild(el('td', {
                    hidden: this.hiddenColumns.has(columnIndex),
                    className: this.modelProvider.classForCell(rowIndex, columnIndex),
                    style: this.modelProvider.stylingForCell(rowIndex, columnIndex),
                    onclick: () => this.modelProvider.handleClickCell(rowIndex, columnIndex),
                    innerHTML: rowData[columnIndex]
                }));
            }
            tbody.appendChild(tr);
        }
        // Optimization: sanitize whole tbody in place
        if (this.virtualScrolling) {
            DOMPurify.sanitize(tbody, {IN_PLACE: true});
        }
    }

    private getRowValues(rowIndex: number): string[] {
        if (!this.virtualScrolling) {
            return this.modelProvider.getRowContents(rowIndex);
        }
        if (this.cellValueCache[rowIndex]) {
            return this.cellValueCache[rowIndex];
        }
        return this.cellValueCache[rowIndex] = this.modelProvider.getRowContents(rowIndex).map(c => DOMPurify.sanitize(c));
    }

    private get tbody(): HTMLTableSectionElement {
        return this.container.nativeElement as HTMLTableSectionElement;
    }
}

type HTMLKeys<K extends keyof HTMLElementTagNameMap> = Partial<{ [k in keyof HTMLElementTagNameMap[K]]: unknown }>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, opts?: HTMLKeys<K>): HTMLElementTagNameMap[K] {
    return Object.assign(document.createElement(tag), opts);
}
