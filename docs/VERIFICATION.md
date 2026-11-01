# Verifica della consegna

Verifiche eseguite il 1 novembre 2026.

## Esito automatico

- `npm run check`: TypeScript e 28 test superati, nessun fallimento.
- `npm run build`: build di produzione completata.
- `npm run worker:check`: bundle Cloudflare Worker completato in dry-run, senza pubblicazione.
- `npm audit --omit=dev`: nessuna vulnerabilità nota rilevata nelle dipendenze di produzione alla data del controllo.

I test coprono validazione, origini, autenticazione, limiti, errori del provider, streaming frammentato, annullamento, protezione Markdown, import/export dei dati e selezione del contesto. Il trasporto Groq nei test è sostituito con risposte controllate: non è una verifica delle credenziali o del servizio remoto.

## Verifica dell’interfaccia

Controllati nel browser: layout desktop e viewport mobile 390 × 844, temi scuro/chiaro, apertura sidebar, ricerca, rinomina, creazione di varianti, persistenza dopo ricaricamento, copia negli appunti e messaggio esplicito per chiave API assente. Nessun overflow orizzontale rilevato nella vista mobile controllata.

La serializzazione e la validazione degli archivi sono coperte dai test automatici. Il completamento del download tramite browser non è stato confermato dall’automazione. Non sono stati eseguiti test su dispositivi fisici o una matrice di browser differenti.

## Verifiche ancora necessarie prima del lancio

1. Configurare una chiave Groq valida sul server ed eseguire `npm run verify:live`.
2. Verificare risposta, streaming e interruzione con il provider reale.
3. Dopo approvazione della pubblicazione, verificare dominio HTTPS, segreti e limiti nell’account Cloudflare effettivo.
4. Verificare import/export e accessibilità sui browser e dispositivi usati dal pubblico previsto.

Non è stata effettuata una revisione di sicurezza indipendente. La prima versione è pensata per un’istanza privata protetta; gli aspetti necessari per un servizio pubblico sono descritti in SECURITY.md.
