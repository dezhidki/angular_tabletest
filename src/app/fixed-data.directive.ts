import {Directive, ElementRef} from '@angular/core';

@Directive({
    selector: '[appFixedData]'
})
export class FixedDataDirective {

    constructor(private el: ElementRef) {
    }

    setWidth(widths: number[]): void {
        const realEl = this.el.nativeElement as HTMLElement;
        const els = realEl.querySelectorAll('td, th');
        els.forEach((el, index) => {
            if (el instanceof HTMLElement) {
                el.style.width = `${widths[index]}px`;
            }
        });
    }
}
