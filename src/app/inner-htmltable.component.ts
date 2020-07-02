import {Component} from '@angular/core';
import {ITable} from './ITable';
import * as DOMPurify from 'dompurify';

/**
 * InnerHTML Table -- generates table as a string and inserts it using innerHTML.
 * Notes
 * - By far the fastest "full table generation" approach
 *      - all DOM generation happens on native side, which removes any JS<->native overhead
 * - DOMPurify is slowing it a bit down as it sanitizes the whole table instead of specific cells
 * - Massive downside: no easy way to access generated DOM elements
 *      - Requires DOM lookups => ids must be globally unique + lookup overhead likely compensates the fast generation
 */

@Component({
    selector: 'app-inner-htmltable',
    template: `
        <div [innerHTML]="innerHTML | safe"></div>
    `,
    styles: []
})
export class InnerHTMLTableComponent extends ITable {

    innerHTML = '';

    constructor() {
        super();
    }

    setDataImpl(data: string[][]): void {
        this.innerHTML = DOMPurify.sanitize(`
            <table>
                <tbody>
                ${data.map((row, rowi) => `
                <tr
                    style="${this.stylingForRow(rowi)}">
                    <td>${rowi}</td>
                    <td><input type="checkbox" /></td>
                        ${row.map((col, coli) => `
                            <td
                                class="${this.classForCell(rowi, coli)}"
                                style="${this.stylingForCell(rowi, coli)}">
                                    ${col}
                            </td>
                            `).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `);
    }
}
