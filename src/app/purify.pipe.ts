import {Pipe, PipeTransform} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import * as DOMPurify from 'dompurify';

@Pipe({
    name: 'purify'
})
export class PurifyPipe implements PipeTransform {

    constructor(private sanitizer: DomSanitizer) {
    }

    transform(value: string): unknown {
        return this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(value));
    }

}
