import {Component, ElementRef, Renderer2, ViewChild} from '@angular/core';
import {ITable} from './ITable';
import * as DOMPurify from 'dompurify';

@Component({
    selector: 'app-virtual-domtable',
    template: `
        <div id="root" #content (scroll)="handleScroll()">
        </div>
    `,
    styles: [
            `
            div#root {
                width: 50vw;
                height: 50vh;
                overflow: scroll;
                margin: auto;
            }
        `
    ]
})
export class VirtualDOMTableComponent extends ITable {
    itemHeight = 50;
    itemPadding = 1;
    itemWidth = 200;
    @ViewChild('content') content: ElementRef;
    purifiedDataCache: Record<number, string[]> = {};
    cells: HTMLTableDataCellElement[][] = [];
    rowElements: HTMLTableRowElement[] = [];
    data: string[][] = [];
    tableBody: HTMLTableSectionElement;

    constructor(private r: Renderer2) {
        super();
    }

    scrollAnimationRequested = false;
    prevScroll = -1;
    handleScroll(): void {
        if (!this.cells.length || this.scrollAnimationRequested) {
            return;
        }
        this.scrollAnimationRequested = true;
        requestAnimationFrame(() => {
            const el = this.content.nativeElement as HTMLElement;
            if (el.scrollTop === this.prevScroll) {
                this.scrollAnimationRequested = false;
                return;
            }
            this.prevScroll = el.scrollTop;
            const start = Math.max(Math.ceil(el.scrollTop / this.itemHeight) - this.itemPadding, 0);
            // TODO: Item count can change because of resize!
            const itemCount = Math.min(this.cells.length, this.data.length - start);
            const offsetY = start * this.itemHeight;
            this.tableBody.style.transform = `translateY(${offsetY}px)`;

            for (let vRow = 0; vRow < itemCount; vRow++) {
                this.rowElements[vRow].hidden = false;
                const row = vRow + start;
                const dataRow = this.getPurifiedDataRow(row);
                this.cells[vRow][0].textContent = `${row}`;
                for (let col = 0; col < this.cols; col++) {
                    const cell = this.cells[vRow][col + 2];
                    Object.assign(cell, {
                        hidden: !this.showColumn(col),
                        className: this.classForCell(row, col),
                        style: `${this.stylingForCell(row, col)}; width: ${this.itemWidth}px; overflow: hidden;`,
                        innerHTML: dataRow[col],
                    });
                }
            }
            for (let row = itemCount; row < this.cells.length; row++) {
                this.rowElements[row].hidden = true;
            }
            this.scrollAnimationRequested = false;
        });
    }

    private getPurifiedDataRow(row: number): string[] {
        if (this.purifiedDataCache[row]) {
            return this.purifiedDataCache[row];
        }
        const cacheRow = [];
        for (let col = 0; col < this.cols; col++) {
            console.log(`r: ${row}, c: ${col}`);
            cacheRow.push(DOMPurify.sanitize(this.data[row][col]));
        }
        this.purifiedDataCache[row] = cacheRow;
        return cacheRow;
    }

    setDataImpl(data: string[][]): void {
        this.data = data;
        const el = this.content.nativeElement as HTMLElement;
        const h = el.clientHeight;
        const tableHeight = data.length * this.itemHeight;

        const start = Math.max(Math.ceil(el.scrollTop / this.itemHeight) - this.itemPadding, 0);
        const itemCount = Math.min(Math.ceil(h / this.itemHeight) + 2 * this.itemPadding, data.length);

        const offsetY = start * this.itemHeight;

        const container = document.createElement('div');
        container.style.height = `${tableHeight}px`;
        const table = container.appendChild(document.createElement('table'));
        table.style.tableLayout = 'fixed';
        table.style.width = '100%';
        this.tableBody = table.appendChild(document.createElement('tbody'));
        table.style.transform = `translateY(${offsetY}px)`;

        for (let row = start; row < start + itemCount; row++) {
            const rowStart = Object.assign(document.createElement('tr'), {
                style: this.stylingForRow(row),
                hidden: !this.showRow(row)
            });
            this.rowElements.push(rowStart);
            rowStart.style.height = `${this.itemHeight}px`;
            rowStart.style.overflow = 'hidden';
            const cells = [];
            this.cells.push(cells);
            const idCell = rowStart.appendChild(Object.assign(document.createElement('td'), {
                textContent: row,
                style: 'width: 2em'
            }));
            cells.push(idCell);
            const cbCell = Object.assign(document.createElement('td'), {
                style: 'width: 2em'
            });
            cells.push(cbCell);
            rowStart.appendChild(cbCell).appendChild(Object.assign(document.createElement('input'), {
                type: 'checkbox'
            }));

            const dataRow = this.getPurifiedDataRow(row);
            for (let col = 0; col < this.cols; col++) {
                const rowEl = rowStart.appendChild(Object.assign(document.createElement('td'), {
                    hidden: !this.showColumn(col),
                    className: this.classForCell(row, col),
                    style: `${this.stylingForCell(row, col)}; width: ${this.itemWidth}px; overflow: hidden;`,
                    innerHTML: dataRow[col],
                }));
                // TODO: Event needs to take into account offset
                rowEl.addEventListener('click', () => this.handleClickCell(row - start, col));
                cells.push(rowEl);
            }
            this.tableBody.appendChild(rowStart);
        }

        this.r.appendChild(el, container);
    }
}
