# Novalen AI

Novalen AI è una prima versione responsive di una piattaforma AI con chat e cronologia locale.

## File del progetto

- `index.html`: interfaccia web da pubblicare su GitHub Pages.
- `worker.js`: backend Cloudflare Worker per inoltrare le richieste a Groq.
- `.github/workflows/deploy-pages.yml`: workflow che pubblica automaticamente solo l'interfaccia web.

## Sicurezza prima di tutto

Il repository è pubblico. Non aggiungere chiavi API o password ai file del repository. La chiave Groq deve essere registrata come Secret nel backend Cloudflare con nome `GROQ_API_KEY`, così non viene inviata al browser.

## 1. Pubblica l'interfaccia su GitHub Pages

È stato aggiunto un workflow automatico. Apri **Settings → Pages** e, in **Build and deployment**, seleziona **GitHub Actions** come sorgente se GitHub lo richiede. Poi apri la scheda **Actions** e controlla il workflow **Deploy Novalen AI to GitHub Pages**. L'URL previsto, dopo una pubblicazione riuscita, è:

https://simonelenzi1810-create.github.io/Novalen-AI/

La prima pubblicazione può richiedere qualche minuto. GitHub Pages è disponibile per repository pubblici sui piani gratuiti. Se il workflow fallisce, apri il dettaglio dell'esecuzione nella scheda Actions e guarda il primo passaggio rosso.

## 2. Configura il backend Cloudflare

1. Apri il dashboard Cloudflare e vai in **Workers & Pages**.
2. Crea un Worker, ad esempio `novalen-ai-api`.
3. Apri il file `worker.js` in questo repository, copia tutto il codice e incollalo nell'editor del Worker, poi fai Deploy.
4. Nel Worker vai in **Settings → Variables and Secrets** e aggiungi un valore di tipo **Secret** chiamato esattamente `GROQ_API_KEY`. Incolla la chiave Groq solo nel campo segreto di Cloudflare.
5. Aggiungi una variabile di testo chiamata `ALLOWED_ORIGIN` con valore `https://simonelenzi1810-create.github.io` (solo dominio e protocollo, senza `/Novalen-AI`).
6. Lascia `GROQ_MODEL` non impostato per usare il modello predefinito `openai/gpt-oss-20b`, oppure impostane uno che risulta disponibile nel tuo account Groq.
7. Copia l'URL del Worker. Il backend che inserirai nell'app deve terminare con `/api/chat`, ad esempio `https://NOME-WORKER.NOME-ACCOUNT.workers.dev/api/chat`.

Verifica le condizioni, i limiti e l'eventuale fatturazione del provider prima di usare una chiave. Non aggiungere una carta di pagamento se non vuoi un servizio a pagamento. Se le condizioni del servizio prevedono un'età minima maggiore della tua, chiedi assistenza a un genitore/tutore; non dichiarare un'età falsa.

## 3. Collega l'interfaccia al backend

1. Apri la pagina pubblicata.
2. Tocca l'ingranaggio in alto a destra.
3. Incolla l'URL completo del Worker che termina con `/api/chat`.
4. Premi **Salva connessione**, poi invia un messaggio di prova.

L'URL del backend viene memorizzato solo nel browser. La chiave API non va mai inserita in questa impostazione.

## Note

- GitHub Pages ospita solo il frontend statico; non esegue il backend.
- Le modalità Pulse, Nexus e Apex usano lo stesso modello AI con istruzioni diverse: non sono tre modelli proprietari distinti.
- La cronologia è conservata nel localStorage del browser corrente, non sincronizzata tra dispositivi.
- Il Worker contiene limiti basilari per un prototipo, non una protezione completa contro gli abusi. Per un sito pubblico aggiungi controlli di utilizzo adeguati.
- Non inserire dati sensibili in chat. Le richieste sono inoltrate al provider AI esterno.
