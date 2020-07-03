import {TableModelProvider} from "./data-view.component";
import {COLS, DATA, ROWS} from "./data";

function rainbow(numOfSteps, step): string {
    let r = 0;
    let g = 0;
    let b = 0;
    const h = step / numOfSteps;
    // tslint:disable-next-line:no-bitwise
    const i = ~~(h * 6);
    const f = h * 6 - i;
    const q = 1 - f;
    switch (i % 6) {
        case 0:
            r = 1;
            g = f;
            b = 0;
            break;
        case 1:
            r = q;
            g = 1;
            b = 0;
            break;
        case 2:
            r = 0;
            g = 1;
            b = f;
            break;
        case 3:
            r = 0;
            g = q;
            b = 1;
            break;
        case 4:
            r = f;
            g = 0;
            b = 1;
            break;
        case 5:
            r = 1;
            g = 0;
            b = q;
            break;
    }
    // tslint:disable-next-line:no-bitwise
    const c = '#' + ('00' + (~~(r * 255)).toString(16)).slice(-2) + ('00' + (~~(g * 255)).toString(16)).slice(-2) + ('00' +
        // tslint:disable-next-line:no-bitwise
        (~~(b * 255)).toString(16)).slice(-2);
    return (c);
}

export class TestTableProvider implements TableModelProvider {
    classForCell(rowIndex: number, columnIndex: number): string {
        return `cell-${rowIndex}-${columnIndex}`;
    }

    getCellWidth(columnIndex: number): number | undefined {
        return undefined;
    }

    getDimension(): { rows: number; columns: number } {
        return {columns: COLS, rows: ROWS};
    }

    getRowContents(rowIndex: number): string[] {
        return DATA[rowIndex];
    }

    getRowHeight(rowIndex: number): number | undefined {
        return undefined;
    }

    handleClickCell(rowIndex: number, columnIndex: number): void {
        console.log(`Clicked (r: ${rowIndex}; c: ${columnIndex} )`);
    }

    stylingForCell(rowIndex: number, columnIndex: number): string {
        return `background-color: ${rainbow(ROWS + COLS, rowIndex + columnIndex)}`;
    }

    stylingForRow(rowIndex: number): string {
        return `font-weight: ${(rowIndex % 9) + 1}00 !important;`;
    }

}

export abstract class ITable {
    rows: number;
    cols: number;

    classForCell(rowi: number, coli: number): string {
        return `cell-${rowi}-${coli}`;
    }

    showRow(rowi: number): boolean {
        return true;
    }

    showColumn(coli: number): boolean {
        return true;
    }

    handleClickCell(rowi: number, coli: number): void {
        console.log(`Clicked (${rowi}, ${coli})`);
    }

    stylingForRow(rowi: number): string {
        return `color: black;`;
    }

    stylingForCell(rowi: number, coli: number): string {
        return `background-color: ${rainbow(this.rows + this.cols, rowi + coli)}`;
    }

    setData(data: string[][], rows: number, cols: number): void {
        this.rows = rows;
        this.cols = cols;
        this.setDataImpl(data);
    }

    abstract setDataImpl(data: string[][]): void;
}
