# Sicurezza e dati

## Controlli implementati

- Chiave `GROQ_API_KEY` solo sul server. Nessun campo per chiavi API nel frontend e nessuna variabile segreta con prefisso `VITE_`.
- Secret ed env esclusi da Git. `.env.example` contiene valori vuoti.
- Codice `APP_ACCESS_TOKEN` per istanze private: almeno 24 caratteri in produzione; confronto di hash SHA-256 senza uscita anticipata. Il browser lo conserva soltanto in memoria, non in localStorage, sessionStorage, URL o esportazioni.
- Backend chiuso in produzione finché non sono presenti i rate limiter e un codice privato, oppure un’esplicita scelta di apertura `ALLOW_PUBLIC_CHAT=true`.
- Due binding Cloudflare: 10 richieste/minuto per IP e 25/minuto condivise **per località Cloudflare**. Sono limiti approssimati, non un contatore mondiale o un tetto di spesa. In sviluppo si usa un contatore in memoria, non adatto alla produzione distribuita.
- Modelli ammessi dal server; URL del provider fisso. Il client non può scegliere endpoint arbitrari né inviare istruzioni con ruolo `system`.
- Origini esatte (stessa origine o allowlist); niente wildcard CORS. CORS non è autenticazione: strumenti non browser possono omettere o falsificare Origin, perciò il codice di accesso rimane necessario per un’istanza privata.
- Corpo HTTP limitato mentre viene letto, anche quando Content-Length manca o mente; validazione Zod e limiti del contesto.
- Timeout, annullamento, errori pubblici sintetici e assenza di log dei messaggi e dei secret.
- Markdown senza HTML eseguibile e link con `noopener noreferrer`; nessun caricamento automatico di immagini remote.
- Header CSP, anti-framing, nosniff e referrer policy per gli asset Cloudflare. GitHub Pages non applica `_headers`; il rendering sicuro rimane attivo ma i suoi header HTTP dipendono da GitHub.

## Riservatezza

Le chat sono nel browser in chiaro: non sono cifrate end-to-end né sincronizzate. Chi usa lo stesso profilo del browser può leggerle. Le esportazioni contengono conversazioni e testi degli allegati. La cancellazione elimina la copia locale; non revoca dati già trasmessi al provider o esportati.

Il provider riceve il contesto necessario alla risposta. Consultare le sue condizioni e impostazioni di conservazione. Questo progetto non dichiara certificazioni o conformità legale automaticamente.

I file allegati sono dati non affidabili. Il prompt lo esplicita, ma questo non garantisce immunità da prompt injection. La v1 non offre strumenti di esecuzione, accesso al web o azioni esterne che possano amplificarla.

## Prima di aprire un servizio pubblico

L’istanza privata preparata è adatta a una prima versione personale. Un lancio aperto richiede account o protezione anti-bot, quote per utente, un contatore centralizzato persistente se servono limiti rigorosi, monitoraggio senza contenuti sensibili e politiche sui dati. Non rimuovere il codice per rendere il backend pubblico senza progettare questi controlli.

Per mantenere budget zero, usare esclusivamente account sui piani gratuiti senza upgrade o fatturazione a consumo. L’app non può stabilire il piano di fatturazione dalla forma della chiave.

Riferimenti ufficiali verificati il 1 novembre 2026:

- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/billing-faqs
- https://console.groq.com/docs/your-data
