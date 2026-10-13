# Novalen AI

Una prima applicazione web per Novalen AI: interfaccia scura responsive, cronologia locale delle conversazioni e chat AI tramite un backend separato.

## File

- \`index.html\`: sito statico da pubblicare con GitHub Pages.
- \`worker.js\`: backend Cloudflare Worker che inoltra le richieste a Groq senza esporre la chiave al browser.

## Importante: nessuna chiave segreta va su GitHub

Il repository è pubblico. **Non** inserire la chiave API in \`index.html\`, in \`worker.js\`, in questo README o in altri file del repository. La chiave viene letta dal secret Cloudflare \`GROQ_API_KEY\`.

## Passaggi per attivare la chat reale

### A. Pubblica il sito

1. In GitHub apri il repository \`Novalen-AI\`.
2. Vai in **Settings → Pages**.
3. In **Build and deployment**, seleziona **Deploy from a branch**.
4. Seleziona la branch \`main\` e la cartella \`/(root)\`, poi salva.
5. Attendi la pubblicazione. L'indirizzo previsto è \`https://simonelenzi1810-create.github.io/Novalen-AI/\`.

### B. Crea il backend Cloudflare

1. Apri il dashboard Cloudflare e vai in **Workers & Pages**.
2. Crea un nuovo Worker, ad esempio \`novalen-ai-api\`.
3. Nell'editor del Worker sostituisci il codice iniziale con l'intero contenuto del file \`worker.js\`, poi fai Deploy.
4. Apri il Worker e vai in **Settings → Variables and Secrets**.
5. Aggiungi un elemento di tipo **Secret** chiamato esattamente \`GROQ_API_KEY\`. Incolla il valore della tua chiave Groq solo lì, poi salva e ridistribuisci se richiesto.
6. Aggiungi una variabile di testo chiamata \`ALLOWED_ORIGIN\` con valore \`https://simonelenzi1810-create.github.io\`. Non aggiungere il percorso \`/Novalen-AI\`: l'origine è solo dominio + protocollo.
7. Lascia \`GROQ_MODEL\` non impostato per usare il modello predefinito \`openai/gpt-oss-20b\`, oppure impostalo solo dopo avere verificato che il tuo account Groq possa usarlo.
8. Copia l'URL del Worker. L'endpoint completo deve terminare con \`/api/chat\`, ad esempio \`https://NOME-WORKER.NOME-ACCOUNT.workers.dev/api/chat\`.

### C. Collega il sito al backend

1. Apri il sito Novalen AI pubblicato.
2. Tocca l'icona dell'ingranaggio in alto a destra.
3. Incolla l'endpoint completo del Worker nel campo **Indirizzo backend**.
4. Premi **Salva connessione** e prova a inviare un messaggio.

L'indirizzo del backend viene salvato nel browser. Non è la chiave API.

## Configurazione e limiti

- GitHub Pages serve solo il frontend statico; il backend va distribuito separatamente.
- La chiave è protetta nel secret di Cloudflare, non nel browser.
- Il Worker include una limitazione di richieste di base per ridurre gli abusi. La limitazione in memoria è solo una protezione iniziale, non un sistema completo contro gli attacchi. Prima di condividere pubblicamente il sito, aggiungi limiti di utilizzo/controlli adatti nel provider e nel servizio di hosting.
- L'accesso al modello e le quote dipendono dal tuo account Groq e possono cambiare. Controlla le condizioni, i limiti e l'eventuale fatturazione di Groq prima di usare la chiave.
- Le modalità **Pulse**, **Nexus** e **Apex** applicano stili diversi allo stesso modello AI in questa prima versione; non sono tre modelli proprietari separati.
- La cronologia è salvata nel localStorage del browser corrente. Non è sincronizzata tra dispositivi.
- Non inserire dati sensibili nei messaggi. La richiesta viene inoltrata a un provider AI esterno.
