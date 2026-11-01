# Architettura di NOVALEN AI

La versione 1 aggiorna il repository esistente, conserva Groq, le modalità Pulse/Nexus/Apex e la compatibilità con il precedente URL del backend. Rimuove le risposte dimostrative.

## Tecnologie

- React 19 e TypeScript: interfaccia, stato delle conversazioni e controlli del compilatore.
- Vite: sviluppo locale e build statica. CSS con variabili e componenti riutilizzabili al posto di Tailwind: evita una dipendenza e mantiene un sistema visivo piccolo e leggibile.
- Cloudflare Worker: API basate su Request, Response e Streams standard, senza SDK proprietario nel frontend.
- Zod: validazione condivisa di richieste e archivi importati.
- React Markdown e remark-gfm: Markdown e tabelle, senza HTML eseguibile; le immagini remote non vengono caricate.

## Flusso di una richiesta

1. Il browser legge le chat dal repository locale e costruisce un contesto limitato ai turni recenti.
2. `POST /api/chat` verifica origine, limiti, codice d’accesso, dimensione del corpo e schema.
3. Il registro sceglie solo un modello autorizzato dal server. L’adapter Groq aggiunge il prompt di sistema e la chiave segreta.
4. Il server traduce lo streaming Groq in eventi `delta`, `done` ed `error`, evitando di esporre risposte d’errore grezze o ragionamento interno.
5. Il browser aggiorna il testo circa ogni 45 ms e salva con un ritardo di 400 ms. Non rilegge l’intero archivio a ogni token.

`GET /api/status` riporta presenza della configurazione, modelli e requisiti di accesso. **Configurato non significa verificato**: una chiave scaduta o un modello non autorizzato vengono rilevati alla richiesta. Non vengono fatti ping a pagamento in background.

## Organizzazione

| Percorso | Responsabilità |
|---|---|
| `src/App.tsx` | Navigazione, conversazioni, invio, rigenerazione, varianti |
| `src/components/` | Logo, Markdown, dialoghi accessibili, impostazioni |
| `src/lib/data.ts` | Archivio locale, import/export, allegati e contesto |
| `src/lib/api.ts` | URL backend, stato e streaming |
| `server/app.ts` | Routing e protocollo API |
| `server/security.ts` | Origini, accesso, dimensioni e limiti |
| `server/providers/` | Interfaccia estendibile e adapter Groq |
| `shared/` | Contratti validati e parser SSE |
| `tests/` | Test con trasporto iniettato: nessuna chiamata AI reale |

## Limiti espliciti

- 100 conversazioni, massimo 1.000 messaggi per conversazione e archivio di 4 milioni di caratteri. Il browser può esaurire prima lo spazio disponibile: l’app avvisa e permette l’esportazione.
- Input completo, allegati inclusi: massimo 12.000 caratteri per messaggio; contesto inviato massimo 24.000 caratteri e 39 messaggi. Il resto della cronologia non viene cancellato.
- Fino a 3 allegati UTF-8 per messaggio; ciascuno massimo 32.000 byte / 8.000 caratteri. Sono letti localmente e inviati come testo al provider solo con il messaggio.
- Risposte limitate a 2.048 token di completamento e 60 secondi. L’interruzione mantiene il testo già ricevuto e annulla la richiesta in corso; il provider potrebbe aver già consumato parte della quota.
- Modalità diverse = istruzioni diverse per lo stesso modello. Non sono modelli proprietari e Nexus non espone un controllo del ragionamento avanzato.
- Il codice di accesso protegge un’istanza privata. Non è un sistema di account per un servizio pubblico con molti utenti.

## Estensioni

`ConversationRepository` può essere sostituito da un repository HTTP/database. Serviranno identità utente, autorizzazione delle righe, migrazione dei dati ed eliminazione verificabile.

Per Gemini, OpenAI API e altri provider: implementare `Provider`, validare il contratto e registrarlo solo dopo i test. Non basta aggiungere un nome al menu. Gli attuali GPT-OSS sono modelli serviti da **Groq**, non chiamate alle API OpenAI.

Per PDF/immagini: aggiungere estrazione/OCR o un modello multimodale, limiti e validazione dedicati. Per ricerca web: integrare uno strumento vero con fonti e timeout. Per assistenti dedicati: introdurre profili persistenti con configurazione esplicita. Nessuna di queste funzioni è simulata nella versione attuale.
