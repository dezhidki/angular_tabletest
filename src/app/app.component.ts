import {Component, ViewChild} from '@angular/core';
import {NaiveTableComponent} from './naive-table.component';
import {COLS, DATA, ROWS} from './data';
import {DomTableComponent} from './dom-table.component';
import {ITable} from './ITable';

@Component({
    selector: 'app-root',
    template: `
        <h1>Table test</h1>
        <button (click)="showTable(naiveTableComponent)">Show table (Angular)</button>
        <div style="width: 50vw; height: 50vh; overflow: scroll; margin: auto;">
            <app-naive-table #naiveTableComponent></app-naive-table>
        </div>

        <button (click)="showTable(domTableComponent)">Show table (DOM)</button>
        <div style="width: 50vw; height: 50vh; overflow: scroll; margin: auto;">
            <app-dom-table #domTableComponent></app-dom-table>
        </div>

        <button (click)="showTable(innerHTMLTableComponent)">Show table (innerHTML)</button>
        <div style="width: 50vw; height: 50vh; overflow: scroll; margin: auto;">
            <app-inner-htmltable #innerHTMLTableComponent></app-inner-htmltable>
        </div>

        <button (click)="showTable(virtualDOMTableComponent)">Show table (DOM + virtual scrolling)</button>
        <div>
            <app-virtual-domtable #virtualDOMTableComponent></app-virtual-domtable>
        </div>
    `,
    styleUrls: ['./app.component.css']
})
export class AppComponent {
    showTable(tab: ITable): void {
        tab.setData(DATA, ROWS, COLS);
    }
}
