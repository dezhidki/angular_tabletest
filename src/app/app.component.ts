import {Component} from '@angular/core';
import {COLS, DATA, ROWS} from './data';
import {ITable, TestTableProvider} from './ITable';
import {TableModelProvider} from "./data-view.component";

@Component({
    selector: 'app-root',
    template: `
        <h1>DataView</h1>
        <button (click)="show = true">Show</button>
        <div style="width: 50vw; height: 50vh; overflow: scroll; margin: auto">
            <app-data-view *ngIf="show" [stickyHeader]="true" [modelProvider]="dataProvider" [virtualScrolling]="false">
                <thead appFixedData>
                    <th *ngFor="let header of dataCols">{{header}}</th>
                </thead>
                <tbody appFixedData>
                    <td *ngFor="let header of dataCols">
                        <input type="text" [value]="header"/>
                    </td>
                </tbody>
            </app-data-view>
        </div>

        <h1>Original tests</h1>
        <details>
            <summary>Original tests</summary>
            <h1>Taulukkotesti</h1>
            <p>
                Tässä testataan eri taulukkototeutuksien soveltuvuutta suuren datamäärän käsittelyyn.
                Testin päätavoite on tarkastella datan näyttämiseen kuluva aika siitä hetkestä, kun käyttäjä painaa
                "näytä taulu".
            </p>
            <p>Koeasetelma vastaa TIM-järjestelmää mahdolisimman lähelle:</p>
            <ul>
                <li>Taulukon data on satunnaisesti generoitu. Taulukossa on 3000 riviä ja 12 saraketta.</li>
                <li>Jokaisella solulla on oma tyyli ja omat näkyvyysasetukset, joita tarkistetaan taulukon generoinnin
                    aikana
                </li>
                <li>Soluissa oleva data voi olla HTMLää, joka sanitoidaan DOMPurify-kirjastolla</li>
                <li>Taulun generointiaika sekä funktioiden suoritusajat lasketaan Chromen profilointityökalulla</li>
                <li><strong>Testien välissä sivu virkistetään, jotta edellisen taulun DOM-puu ei voisi vaikuttaa toisen
                    taulun
                    generointiaikoihin.</strong></li>
                <li>Ylimääräiset painikkeet ja toiminnot on jätetty pois testataakseen ainoastaan itse taulun
                    generointiin kuluva aika.
                </li>
            </ul>

            <h2>Angular taulu</h2>
            <p>Taulu generoidaan suoraan Angular 10-kirjastolla samalla tavalla kuin mitä TIM tekee</p>
            <p>Huomoita</p>
            <ul>
                <li>Generointi ERITTÄIN hidasta</li>
                <li>Eniten aikaa menee DOMPurify-sanitointikutsuissa
                    <ul>
                        <li>Osin johtuu siitä, että DOMPurify luo oman piilo-DOMin, jonka avulla se suorittaa
                            sanitoinnin
                        </li>
                        <li>Eli jokainen solu aiheuttaa oman DOM-puun rakentamisen ja sanitoinnin</li>
                    </ul>
                </li>
                <li>Toiseksi ensiten aikaa menee Angularin omissa template-kutsuissa
                    <ul>
                        <li>Aika paljon aikaa menee tarkistuksiin siitä, pitääkö jotain DOMia päivittää</li>
                    </ul>
                </li>
            </ul>
            <button (click)="showTable(naiveTableComponent)">Show table (Angular)</button>
            <div style="width: 50vw; height: 50vh; overflow: scroll; margin: auto;">
                <app-naive-table #naiveTableComponent></app-naive-table>
            </div>

            <h2>DOM-taulu</h2>
            <p>Taulu generoidaan suoraan selaimen DOM API:n avulla ja liitetään Angularilla luotuun elementtiin</p>
            <p>Huomioita</p>
            <ul>
                <li>Reilusti nopeampi kuin Angularin versio</li>
                <li>Eniten aikaa menee DOM API-kutsuihin, koska niitä on tosi paljon
                    <ul>
                        <li>Johtuu todnäk siitä, että jokainen DOM API-kutsu menee suoraan selaimen moottoriin asti,
                            mikä vaatii JS --> native tyyppimuunnoksia ja -tarkistuksia.
                        </li>
                    </ul>
                </li>
                <li>DOMPurify-sanitointi saatu erittäin nopeaksi (~100 ms tasolle)
                    <ul>
                        <li>Sanitointi tehdään suoraan koko taulukon DOMille, jolloin DOMPurify ei luo piilo-DOMia vaan
                            käyttää suoraan generoitavaa taulukkoa.
                        </li>
                    </ul>
                </li>
                <li>Reaktiivisuus onnistuu hyvin
                    <ul>
                        <li>Koska luodaan suoraan DOM-puu käsin, saadaan suoran viitteet DOM-elementteihin, joita
                            voidaan helposti manipuloida
                        </li>
                    </ul>
                </li>
            </ul>
            <button (click)="showTable(domTableComponent)">Show table (DOM)</button>
            <div style="width: 50vw; height: 50vh; overflow: scroll; margin: auto;">
                <app-dom-table #domTableComponent></app-dom-table>
            </div>

            <h2>innterHTML taulu</h2>
            <p>Taulu, joka generoi taulukon HTMLän merkkijonoon, sanitoi sen ja asettaa Angular-komponentiin
                innerHTML-ominaisuudella</p>
            <p>Huomioita</p>
            <ul>
                <li>Chromella näyttäisi olevan nopein tapa, jolla generoidaan koko taulukko
                    <ul>
                        <li>Johtuu todnäk siitä, että usean DOM API:n kutsun sijaan tehdään vain yksi
                            innerHTML-asettelu, jolloin itse DOM-puun generointi tapahtuu suoraan selaimen moottorissa
                        </li>
                        <li>Eli usean JS --> native -hypyn sijaan on vain yksi</li>
                    </ul>
                </li>
                <li>DOMPurify on hieman hitaampi kuin DOM taulussa, mutta nopeampi kuin Angularissa
                    <ul>
                        <li>Tässä toteutuksessa sanitoidaan koko taulu, joten generoidaan vain yksi piilo-DOM</li>
                    </ul>
                </li>
                <li>Ongelma: innerHTML ei suoraan antaa viitteitä generoituihin soluihin
                    <ul>
                        <li>Pitää hakea DOM API:n avulla luodusta DOMista --> hidastaa takaisin DOM taulun tasolle</li>
                        <li>Myös filtteröinti on vaikeaa, koska vaatii käytännössä taulun uudelleengeneroinnin</li>
                    </ul>
                </li>
            </ul>
            <button (click)="showTable(innerHTMLTableComponent)">Show table (innerHTML)</button>
            <div style="width: 50vw; height: 50vh; overflow: scroll; margin: auto;">
                <app-inner-htmltable #innerHTMLTableComponent></app-inner-htmltable>
            </div>

            <h2>DOM + Virtuaalinen skrollaus</h2>
            <p>Taulu, joka generoi DOMin DOM API:n avulla ja samalla käyttää virtuaalista skrollausta</p>
            <p>Huomioita</p>
            <ul>
                <li>Kaikista nopein alussa, sillä DOM API-kutsuja on vähän</li>
                <li>DOMPurify samalla tavalla kuin Angular taulussa, mutta tehdään laiskasti, minkä takia se on nopeaa
                </li>
                <li>Skrollaus voi hitaammilla koneilla olla vähän hitaampaa, koska skrollauksen yhteydessä pitää
                    päivittää solujen sisältö
                </li>
                <li>Rivien ja sarakkeiden liimaus yhteen onnistuu</li>
                <li>DOM taulun tapaan on pääsy suoraan DOM-elementteihin, jolloin tapahtumien käsittely onnistuu
                    helposti
                </li>
                <li>Edellyttää, että osataan laskea/tunnetaan rivien korkeudet ja sarakkeiden leveydet</li>
                <li>Voidaan helposti yhdistää DOM taulun kanssa, jolloin saadaan "hybridi", joka tarpeen mukaan voi
                    toimia virtuaalisena tai täydellisenä
                </li>
            </ul>
            <button (click)="showTable(virtualDOMTableComponent)">Show table (DOM + virtual scrolling)</button>
            <div>
                <app-virtual-domtable #virtualDOMTableComponent></app-virtual-domtable>
            </div>
        </details>
    `,
    styleUrls: ['./app.component.css']
})
export class AppComponent {
    dataCols = Array.from(new Array(COLS)).map((_, i) => i);
    show = false;
    dataProvider: TableModelProvider = new TestTableProvider();

    showTable(tab: ITable): void {
        tab.setData(DATA, ROWS, COLS);
    }
}
