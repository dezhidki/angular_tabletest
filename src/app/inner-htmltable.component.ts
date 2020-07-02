import {Component} from '@angular/core';
import {ITable} from './ITable';
import * as DOMPurify from 'dompurify';

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
