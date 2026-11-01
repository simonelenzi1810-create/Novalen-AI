# NOVALEN AI

**Spazio alle tue idee.** Assistente web di NOVALEN, fondata da Simone Lenzi.

Versione 1: frontend React/TypeScript responsive e backend Cloudflare Worker con adapter Groq reale. Questo è l’aggiornamento del progetto esistente: mantiene le modalità Pulse, Nexus e Apex, elimina le risposte dimostrative e aggiunge una cronologia vera.

> Stato della consegna: interfaccia e backend implementati; test automatici senza rete superati. Nessuna chiave API era disponibile durante lo sviluppo: la generazione con un account Groq reale resta da verificare. Nessun sito è stato pubblicato e nessun servizio a pagamento è stato attivato.

## Avvio semplice sul computer

Occorre **Node.js 22.13 o successivo** e un terminale. Dal Mac usa Terminale; lo ZIP del sorgente va estratto prima di eseguire i comandi. Non aprire `index.html` con un doppio clic: è un progetto con build.

```bash
npm ci
cp .env.example .env
npm run dev
```

Apri l’indirizzo mostrato nel terminale, normalmente `http://localhost:5173`.

L’interfaccia, la cronologia e le impostazioni funzionano anche senza una chiave. Se invii un messaggio senza aver configurato Groq, compare un errore esplicito: non viene inventata una risposta.

## Attivare l’AI sul computer

1. Usa un account Groq con piano **Free**, senza passare a Developer o aggiungere servizi a pagamento. Verifica le condizioni d’uso applicabili prima di creare un account.
2. Crea la chiave nella console ufficiale: https://console.groq.com/keys
3. Apri il file locale `.env` in un editor. Inserisci il valore solo dopo `GROQ_API_KEY=`. Non incollarlo in chat, nel sito, nei commit o in uno screenshot.
4. Riavvia `npm run dev`, apri NOVALEN AI e invia una domanda.
5. Per un controllo tecnico facoltativo, con il server avviato, esegui `npm run verify:live`. Effettua una vera richiesta breve e consuma una piccola parte della quota gratuita; non stampa la risposta né la chiave.

I modelli preconfigurati sono `openai/gpt-oss-20b` e `openai/gpt-oss-120b`, serviti da **Groq**. Non occorre una chiave OpenAI. Il catalogo autorizzato è configurabile sul server con `GROQ_MODELS`; una chiave presente viene indicata come configurata, non come già verificata. Permessi del modello e quote possono variare.

## Uso dell’app

- **Nuova conversazione** apre un nuovo spazio. La chat viene creata al primo invio.
- La sidebar permette ricerca in titoli e messaggi; il menu in alto rinomina, esporta in Markdown o elimina la chat.
- **Modifica** crea una variante e mantiene la conversazione originale. **Rigenera** sostituisce l’ultima risposta; **Interrompi** conserva il testo già ricevuto.
- Il selettore cambia modello; Pulse/Nexus/Apex cambiano lo stile delle istruzioni, non sono tre modelli proprietari.
- La graffetta accetta piccoli file UTF-8: TXT, Markdown, CSV, JSON e codice. PDF e immagini non sono ancora supportati.
- **Impostazioni → I tuoi dati** esporta tutte le chat in JSON, importa archivi e controlla il salvataggio locale.
- Su desktop: Invio invia; Maiusc+Invio va a capo. Su smartphone si usa il pulsante freccia per inviare. `Ctrl/Cmd+K` apre la ricerca.

## Pubblicazione gratuita consigliata: Cloudflare Workers

Questa soluzione serve frontend e backend insieme, senza configurare URL tra servizi. Usa il piano **Workers Free**; non eseguire i passaggi di pubblicazione finché non vuoi mettere online il progetto.

1. Esegui `npm run check` e `npm run build`.
2. Accedi al tuo account Cloudflare con `npx wrangler login`.
3. Pubblica con `npm run deploy`. All’inizio la chat resta bloccata senza i segreti.
4. Registra la chiave usando `npx wrangler secret put GROQ_API_KEY`, inserendola solo nel prompt segreto.
5. Registra un codice di accesso lungo e casuale (almeno 24 caratteri) con `npx wrangler secret put APP_ACCESS_TOKEN`. Il codice protegge la tua prima istanza privata: deve essere diverso dalla chiave Groq.
6. Apri l’URL restituito da Wrangler. In **Impostazioni → Connessione AI** inserisci solo il codice di accesso al sito. Lascia vuoto l’indirizzo del backend: è sullo stesso dominio.
7. Verifica una risposta reale. Per il test tecnico su un dominio diverso, imposta `NOVALEN_URL` nell’ambiente del comando `npm run verify:live` e passa il codice tramite `APP_ACCESS_TOKEN`, mai nell’URL.

`wrangler.jsonc` contiene già asset, rate limiter e modello. Non inserire secret in quel file. Non impostare `ALLOW_PUBLIC_CHAT=true` per aggirare il codice: un lancio pubblico richiede ulteriori controlli, descritti in `docs/SECURITY.md`.

## Alternativa: GitHub Pages + backend Cloudflare

GitHub Pages esegue solo il frontend. **Non può proteggere una chiave API né eseguire il backend**.

1. Carica/revisiona il progetto nel repository `simonelenzi1810-create/Novalen-AI`.
2. Configura il Worker seguendo la sezione precedente.
3. Nel Worker aggiungi `ALLOWED_ORIGIN=https://simonelenzi1810-create.github.io` (solo origine, senza il nome del repository), mantenendo i secret.
4. Dopo aver approvato la pubblicazione, in GitHub **Settings → Pages** seleziona GitHub Actions. Avvia manualmente **Publish NOVALEN AI frontend (manual)** nella scheda Actions.
5. Apri l’URL effettivamente restituito dal workflow. In NOVALEN AI, **Impostazioni → Connessione AI**, salva il dominio HTTPS del Worker e il codice d’accesso.

Il workflow non pubblica a ogni commit. La build usa percorsi relativi, adatti alla sottocartella di GitHub Pages. Il vecchio URL salvato con `/api/chat` viene normalizzato automaticamente; il vecchio Worker va aggiornato, perché la nuova interfaccia richiede anche `/api/status` e lo streaming.

## Comandi disponibili

| Comando | Scopo |
|---|---|
| `npm run dev` | App e API locali con lo stesso codice server della produzione |
| `npm run check` | TypeScript e test isolati senza chiamate AI |
| `npm run build` | Build statica di produzione in `dist/` |
| `npm run worker:check` | Bundle Worker in dry-run: nessuna pubblicazione |
| `npm run verify:live` | Una richiesta reale al backend configurato |
| `npm run deploy` | Pubblicazione esplicita su Cloudflare |
| `npm run preview` | Solo anteprima degli asset compilati; richiede un backend separato per la chat |

## Funzioni completate

Chat con streaming, annullamento, Markdown e codice copiabile; modifica con varianti, rigenerazione, cronologia e ricerca; rinomina/eliminazione; import JSON ed export JSON/Markdown; allegati testuali; istruzioni personali; selezione dei modelli Groq; temi scuro/chiaro; interfaccia responsive; controlli di input, accesso, origini e rate limit; build, test e workflow CI.

## Da configurare o sviluppare

- **Configurazione:** chiave Groq valida, prova reale, account hosting e codice privato; pubblicazione definitiva dopo approvazione.
- **Sviluppo futuro:** API Gemini/OpenAI dirette, account e database, sincronizzazione, PDF/OCR, immagini, ricerca web, assistenti dedicati e controllo del ragionamento avanzato.
- La v1 non è un’infrastruttura per un grande servizio pubblico. Il dettaglio dei limiti è in `docs/ARCHITECTURE.md` e `docs/SECURITY.md`.

## Budget e fonti

Non sono necessari pagamenti per lo sviluppo locale. Le opzioni online dipendono dai piani gratuiti e dalle quote effettive dell’account; non sono risorse illimitate. La documentazione Cloudflare indica 100.000 richieste Worker/giorno sul piano Free; gli asset statici hanno una contabilizzazione separata. Groq applica quote per organizzazione e modello. Non aggiornare a piani a consumo per superare i limiti.

Fonti ufficiali verificate il **1 novembre 2026**:

- [Groq: modelli](https://console.groq.com/docs/models)
- [Groq: limiti](https://console.groq.com/docs/rate-limits)
- [Groq: fatturazione](https://console.groq.com/docs/billing-faqs)
- [Cloudflare: limiti Workers](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare: asset statici](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)

La dipendenza dai provider non viene nascosta: NOVALEN AI è una piattaforma software con un’identità propria, che usa modelli esterni autorizzati.
