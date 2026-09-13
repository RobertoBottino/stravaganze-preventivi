# Stravaganze Floreali - Preventivi PWA

PWA per creare preventivi matrimoniali da iPhone, Android e computer senza App Store o Play Store.

## Prima configurazione sul dispositivo

1. Apri la PWA.
2. In **Template statico**, carica il PDF completo di riferimento.
3. Per il file di esempio `Meizhi e Ior.pdf` lascia:
   - Storybrand: `1-7`
   - Testimonianze: `11-12`
4. Apri **Dati azienda e contratto** e compila una sola volta indirizzo, CF, P.IVA, IBAN, banca e BIC/SWIFT.

Il PDF di riferimento e i dati aziendali vengono salvati localmente nel browser del dispositivo e **non sono inclusi nel repository pubblico**.

## Funzioni

- archivio locale di più matrimoni;
- autosalvataggio tramite IndexedDB;
- dati sposi, cerimonia, ricevimento e date;
- pagine dinamiche con fino a 3 immagini per pagina;
- tabella preventivo con quantità e prezzo unitario;
- manodopera configurabile;
- IVA preimpostata al 22%;
- caparra e saldo automatici;
- bonus/omaggi;
- Storybrand e testimonianze copiati dal PDF di riferimento senza rasterizzarli;
- contratto e firme;
- PDF generato direttamente sul dispositivo;
- condivisione/download del PDF;
- backup e importazione JSON delle bozze;
- PWA installabile su iPhone/iPad e Android.

## Pubblicazione GitHub Pages

È presente `.github/workflows/deploy-pages.yml`.

Una sola volta, nel repository GitHub:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Dopo l'abilitazione, il workflow pubblica automaticamente ogni push sul branch `main`.

URL previsto:

`https://robertobottino.github.io/stravaganze-preventivi/`

## Installazione sul telefono

### iPhone / iPad

Apri il sito in Safari → Condividi → **Aggiungi alla schermata Home**.

### Android

Apri il sito in Chrome → menu → **Installa app** / **Aggiungi a schermata Home**.

## Privacy

Il repository contiene solo il codice dell'app. Il PDF di riferimento, foto dei clienti, dati delle bozze, coordinate bancarie e altri dati inseriti nell'app restano localmente sul dispositivo. Per le bozze importanti è consigliato usare il pulsante **Backup**.

## Nota sul contratto

Il generatore include una struttura contrattuale basata sul documento di riferimento. Prima dell'uso definitivo con i clienti è opportuno verificare il testo legale e le clausole con il professionista che segue l'attività.
