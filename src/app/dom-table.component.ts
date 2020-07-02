import {Component, ElementRef, Renderer2, ViewChild} from '@angular/core';
import {ITable} from './ITable';
import * as DOMPurify from 'dompurify';

/**
 *  DOM-based table generator -- generates the table DOM using DOM API and insert it into Angular component.
 *  Notes
 *  - Bypassing Angular templating clearly improves performance
 *  - Most of processing time goes in just generating the DOM element
 *      - DOM API binds directly into native API which JS engine has to jump through multiple times
 *  - Massive optimization: DOMPurify is run on the table DOM **in-place**
 *     - Cuts down sanitizing time to about 100 ms
 *  - Allows semi-easy data manipulation, because all nodes are easily accessible
 */

@Component({
    selector: 'app-dom-table',
    template: `
        <table #content>
        </table>
    `,
    styles: []
})
export class DomTableComponent extends ITable {
    @ViewChild('content') content: ElementRef;

    constructor(private renderer: Renderer2) {
        super();
    }

    setDataImpl(data: string[][]): void {
        const body = document.createElement('tbody');
        for (let row = 0; row < this.rows; row++) {
            const rowStart = Object.assign(document.createElement('tr'), {
                style: this.stylingForRow(row),
                hidden: !this.showRow(row)
            });
            rowStart.appendChild(Object.assign(document.createElement('td'), {
                textContent: row
            }));
            rowStart.appendChild(document.createElement('td')).appendChild(Object.assign(document.createElement('input'), {
                type: 'checkbox'
            }));

            for (let col = 0; col < this.cols; col++) {
                rowStart.appendChild(Object.assign(document.createElement('td'), {
                    hidden: !this.showColumn(col),
                    className: this.classForCell(row, col),
                    style: this.stylingForCell(row, col),
                    innerHTML: data[row][col],
                })).addEventListener('click', () => this.handleClickCell(row, col));
            }
            body.appendChild(rowStart);
        }
        DOMPurify.sanitize(body, {IN_PLACE: true});
        this.renderer.appendChild(this.content.nativeElement, body);
    }
}
