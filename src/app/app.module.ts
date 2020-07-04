import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { NaiveTableComponent } from './naive-table.component';
import { DomTableComponent } from './dom-table.component';
import { InnerHTMLTableComponent } from './inner-htmltable.component';
import { SafePipe } from './safe.pipe';
import { PurifyPipe } from './purify.pipe';
import { VirtualDOMTableComponent } from './virtual-domtable.component';
import { DataViewComponent } from './data-view.component';
import { FixedDataDirective } from './fixed-data.directive';

@NgModule({
  declarations: [
    AppComponent,
    NaiveTableComponent,
    DomTableComponent,
    InnerHTMLTableComponent,
    SafePipe,
    PurifyPipe,
    VirtualDOMTableComponent,
    DataViewComponent,
    FixedDataDirective,
  ],
  imports: [
    BrowserModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
