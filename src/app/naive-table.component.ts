import {Component} from '@angular/core';
import {ITable} from './ITable';


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
export class NaiveTableComponent extends ITable{

    constructor() {
        super();
    }

    data: string[][] = [];

    setDataImpl(data: string[][]): void {
        this.data = data;
    }
}
