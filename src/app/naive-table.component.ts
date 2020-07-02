import {Component} from '@angular/core';
import {ITable} from './ITable';

/**
 * Table implemented via pure Angular -- basically the same as in TIM.
 * Notes
 * - REALLY slow load on big data
 * - DOMPurify is the biggest, because it has to be run on every cell
 *    - Each DOMPurify run generates its own shadow DOM
 * - Angular template runner is second slowest because it has to check for dirty elements and validate input
 */

@Component({
    selector: 'app-naive-table',
    template: `
        <table>
            <tbody>
            <tr *ngFor="let row of data; let rowi = index"
                [style]="stylingForRow(rowi)"
                [hidden]="!showRow(rowi)">
                <td>{{rowi}}</td>
                <td>
                    <input type="checkbox"/>
                </td>
                <ng-container *ngFor="let data of row; let coli = index">
                    <td [hidden]="!showColumn(coli)"
                        [class]="classForCell(rowi, coli)"
                        [style]="stylingForCell(rowi, coli)"
                        (click)="handleClickCell(rowi, coli)"
                        [innerHTML]="data | purify">
                    </td>
                </ng-container>
            </tr>
            </tbody>
        </table>
    `
})
export class NaiveTableComponent extends ITable {

    constructor() {
        super();
    }

    data: string[][] = [];

    setDataImpl(data: string[][]): void {
        this.data = data;
    }
}
