import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, BookOpen, Check, ChevronDown, Code2, Copy, Download, FileText, Lightbulb, Menu, MessageSquare, MoreHorizontal, PanelLeftClose, Paperclip, PenLine, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Square, Trash2, X, Zap } from 'lucide-react';
import { modes, type Mode, type Status } from '../shared/contracts';
import { copyText } from './lib/clipboard';
import { Logo } from './components/Logo';
import { Modal } from './components/Modal';
import { Settings } from './components/Settings';
import { fetchStatus, streamChat } from './lib/api';
import { buildContext, downloadFile, localRepository, markdownExport, newConversation, parseArchive, readAttachment, STORAGE_KEY, uid, type Attachment, type Conversation, type Message } from './lib/data';
import { loadSettings, type Settings as SettingsData } from './lib/settings';

const Markdown = lazy(() => import('./components/Markdown').then(module => ({ default: module.Markdown })));

const fallbackModels = [
  { id: 'groq:openai/gpt-oss-20b', name: 'GPT-OSS 20B', provider: 'Groq', description: 'Veloce e versatile', configured: false },
  { id: 'groq:openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'Groq', description: 'Per richieste più articolate', configured: false },
];
const suggestions = [
  { icon: PenLine, title: 'Trova le parole giuste', text: 'Dai forma a quello che pensi', prompt: 'Aiutami a scrivere un testo chiaro e originale. Prima chiedimi l’argomento e a chi è rivolto.', mode: 'apex' },
  { icon: BookOpen, title: 'Rendi semplice il difficile', text: 'Un concetto, un passo alla volta', prompt: 'Aiutami a capire un argomento difficile, con esempi semplici. Chiedimi cosa sto studiando.', mode: 'nexus' },
  { icon: Code2, title: 'Costruisci qualcosa', text: 'Dall’idea alla prima riga di codice', prompt: 'Aiutami a sviluppare un progetto software. Chiedimi cosa vorrei realizzare e quali strumenti conosco.', mode: 'pulse' },
  { icon: Lightbulb, title: 'Segui una nuova idea', text: 'Esplora possibilità inaspettate', prompt: 'Facciamo brainstorming. Chiedimi quale problema voglio risolvere e aiutami a esplorare idee concrete.', mode: 'apex' },
] as const;

export default function App() {
  const initial = useMemo(() => { try { return { chats: localRepository.load(), error: '' }; } catch { return { chats: [] as Conversation[], error: 'La cronologia salvata non è leggibile. Non verrà sovrascritta: per ora le nuove chat restano solo in memoria.' }; } }, []);
  const [chats, setChats] = useState(initial.chats);
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState(loadSettings);
  const [accessCode, setAccessCode] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState('');
  const [statusLoading, setStatusLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mode, setMode] = useState<Mode>('pulse');
  const [model, setModel] = useState(fallbackModels[0].id);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [rename, setRename] = useState<Conversation | null>(null);
  const [renameText, setRenameText] = useState('');
  const [editing, setEditing] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const [toast, setToast] = useState(initial.error);
  const [storageError, setStorageError] = useState(initial.error);
  const [copiedId, setCopiedId] = useState('');
  const [contextNote, setContextNote] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const chatRef = useRef(chats); chatRef.current = chats;
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const active = chats.find(c => c.id === selected);
  const messages = active?.messages || [];
  const empty = !messages.length;
  const currentMode = active?.mode || mode;
  const currentModel = active?.model || model;
  const models = status?.models?.length ? status.models : fallbackModels;
  const modelInfo = models.find(m => m.id === currentModel) || models[0];
  const filtered = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt).filter(c => !query || `${c.title} ${c.messages.map(m => m.content).join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [chats, query]);

  const refresh = useCallback(async () => {
    setStatusLoading(true); setStatusError('');
    try { setStatus(await fetchStatus(settings.backend)); }
    catch (error) { setStatus(null); setStatusError(error instanceof TypeError ? 'Il backend non è raggiungibile.' : (error as Error).message); }
    finally { setStatusLoading(false); }
  }, [settings.backend]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    try { localStorage.setItem('novalen.settings.v1', JSON.stringify(settings)); } catch { setStorageError('Le preferenze non possono essere salvate in questo browser.'); }
  }, [settings]);
  useEffect(() => {
    if (!settings.saveHistory || initial.error) return;
    const timer = setTimeout(() => { try { localRepository.save(chats); setStorageError(''); } catch (e) { setStorageError((e as Error).message); } }, 400);
    return () => clearTimeout(timer);
  }, [chats, settings.saveHistory, initial.error]);
  useEffect(() => {
    const flush = () => { if (settingsRef.current.saveHistory && !initial.error) try { localRepository.save(chatRef.current); } catch { /* surfaced during the next save */ } };
    window.addEventListener('pagehide', flush); return () => { window.removeEventListener('pagehide', flush); };
  }, [initial.error]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 6500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (stickToBottom.current) scrollArea.current?.scrollTo({ top: scrollArea.current.scrollHeight, behavior: 'instant' }); }, [chats, busy]);
  useEffect(() => { if (input.current) { input.current.style.height = 'auto'; input.current.style.height = `${Math.min(input.current.scrollHeight, 180)}px`; } }, [draft]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSidebar(false); setModelOpen(false); setMenuOpen(false); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSidebar(true); setTimeout(() => document.getElementById('history-search')?.focus(), 0); }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  function updateChat(id: string, update: (chat: Conversation) => Conversation) { setChats(all => all.map(c => c.id === id ? update(c) : c)); }
  function startNew() {
    if (busyRef.current) { setToast('Interrompi la risposta prima di aprire una nuova chat.'); return; }
    setSelected(null); setDraft(''); setAttachments([]); setSidebar(false); setMenuOpen(false); setContextNote(false); input.current?.focus();
  }
  function chooseChat(chat: Conversation) {
    if (busyRef.current) { setToast('Interrompi la risposta prima di cambiare conversazione.'); return; }
    setSelected(chat.id); setMode(chat.mode); setModel(chat.model); setSidebar(false); setDraft(''); setAttachments([]); setContextNote(false); stickToBottom.current = true;
  }
  function chooseMode(value: Mode) { setMode(value); if (active) updateChat(active.id, c => ({ ...c, mode: value })); }
  function chooseModel(value: string) { setModel(value); if (active) updateChat(active.id, c => ({ ...c, model: value })); setModelOpen(false); }
  async function generate(chat: Conversation, history: Message[]) {
    if (busyRef.current) return;
    let context;
    try { context = buildContext(history); } catch (e) { setToast((e as Error).message); return; }
    if (!context.messages.length) return;
    busyRef.current = true; setBusy(true); setContextNote(context.omitted); stickToBottom.current = true;
    const abort = new AbortController(); abortRef.current = abort;
    const answer: Message = { id: uid(), role: 'assistant', content: '', status: 'streaming', model: chat.model };
    updateChat(chat.id, c => ({ ...c, messages: [...history, answer], updatedAt: Date.now() }));
    let content = ''; let lastPaint = 0; let finished = false;
    const paint = (patch: Partial<Message>) => updateChat(chat.id, c => ({ ...c, messages: c.messages.map(m => m.id === answer.id ? { ...m, ...patch } : m) }));
    try {
      await streamChat(settings.backend, accessCode, { messages: context.messages, model: chat.model, mode: chat.mode, instructions: settings.instructions, stream: true }, abort.signal, event => {
        if (event.type === 'delta') {
          content += event.text;
          if (performance.now() - lastPaint > 45) { paint({ content }); lastPaint = performance.now(); }
        } else if (event.type === 'done') {
          finished = true; paint({ content, status: 'complete', error: event.finishReason === 'length' ? 'Risposta al limite di lunghezza. Chiedi di continuare.' : undefined });
        }
      });
    } catch (error) {
      const stopped = abort.signal.aborted;
      paint({ content, status: stopped ? 'stopped' : 'error', error: stopped ? 'Generazione interrotta.' : error instanceof TypeError ? 'Connessione non riuscita. Verifica il backend e riprova.' : (error as Error).message });
    } finally {
      if (finished) paint({ content });
      busyRef.current = false; setBusy(false); abortRef.current = null;
    }
  }
  async function send() {
    if ((!draft.trim() && !attachments.length) || busyRef.current) return;
    if (active && active.messages.length >= 998) { setToast('Questa chat è molto lunga. Apri una nuova conversazione.'); return; }
    if (!active && chats.length >= 100) { setToast('Hai raggiunto 100 conversazioni. Esporta e rimuovi quelle che non ti servono.'); return; }
    const message: Message = { id: uid(), role: 'user', content: draft.trim() || 'Analizza il testo allegato.', status: 'complete', attachments };
    let history = [...messages];
    history.push(message);
    try { buildContext(history); } catch (e) { setToast((e as Error).message); return; }
    const chat = active || newConversation(mode, modelInfo.id);
    if (!active) { chat.title = message.content.slice(0, 65); chat.messages = history; setChats(all => [chat, ...all]); setSelected(chat.id); }
    setDraft(''); setAttachments([]); await generate(chat, history);
  }
  function retry() {
    if (!active || busyRef.current) return;
    let last = messages.length - 1;
    while (last >= 0 && messages[last].role !== 'user') last--;
    if (last >= 0) void generate(active, messages.slice(0, last + 1));
  }
  function editAndGenerate() {
    if (!active || !editing || !editText.trim()) return;
    const index = messages.findIndex(m => m.id === editing.id);
    const history = [...messages.slice(0, index), { ...editing, content: editText.trim() }];
    try { buildContext(history); } catch (e) { setToast((e as Error).message); return; }
    // Keep the original conversation so an edit never destroys a previous branch.
    if (chats.length >= 100) { setToast('Esporta e rimuovi una chat prima di creare una variante.'); return; }
    const branch = { ...active, id: uid(), title: `${active.title.slice(0, 75)} · variante`, createdAt: Date.now(), updatedAt: Date.now(), messages: history };
    setChats(all => [branch, ...all]); setSelected(branch.id); setEditing(null); void generate(branch, history);
  }
  async function addFiles(files: FileList | null) {
    if (!files) return;
    if (attachments.length + files.length > 3) { setToast('Puoi allegare al massimo 3 file per messaggio.'); return; }
    try { const values = await Promise.all(Array.from(files).map(readAttachment)); setAttachments(current => [...current, ...values].slice(0, 3)); }
    catch (e) { setToast((e as Error).message); }
  }
  async function copy(message: Message) { try { await copyText(message.content); setCopiedId(message.id); setTimeout(() => setCopiedId(''), 2000); } catch { setToast('Copia non disponibile: seleziona il testo e copialo manualmente.'); } }
  function exportAll() { downloadFile('novalen-conversazioni.json', JSON.stringify({ version: 1, conversations: chats }, null, 2)); }
  async function importAll(file: File) {
    if (busyRef.current) throw new Error('Interrompi la risposta prima di importare un archivio.');
    if (file.size > 4000000) throw new Error('Archivio troppo grande (massimo 4 MB).');
    const imported = parseArchive(await file.text());
    const existing = new Set(chats.map(c => c.id));
    const added = imported.filter(c => !existing.has(c.id)).map(c => ({ ...c, messages: c.messages.map(m => m.status === 'streaming' ? { ...m, status: 'stopped' as const } : m) }));
    if (added.length + chats.length > 100) throw new Error('L’importazione supererebbe 100 conversazioni.');
    setChats(all => [...added, ...all]); setToast(`${added.length} conversazioni importate. Le chat già presenti sono state conservate.`);
  }
  function saveSettings(value: SettingsData, code: string) { setSettings(value); setAccessCode(code); setSettingsOpen(false); setToast('Preferenze salvate.'); }
  const connectionText = statusLoading ? 'Verifica connessione' : status?.ready ? 'AI configurata' : 'AI da collegare';

  return <div className="app-shell">
    <a className="skip-link" href="#composer">Vai al messaggio</a>
    {sidebar && <button className="sidebar-scrim" aria-label="Chiudi navigazione" onClick={() => setSidebar(false)}/>}
    <aside className={`sidebar ${sidebar ? 'is-open' : ''}`} aria-label="Navigazione e cronologia">
      <div className="brand"><Logo/><span>NOVALEN<span className="brand-ai">AI</span></span><button className="icon-button mobile-only" aria-label="Chiudi navigazione" onClick={() => setSidebar(false)}><PanelLeftClose size={19}/></button></div>
      <button className="new-chat" onClick={startNew} disabled={busy}><Plus size={18}/><span>Nuova conversazione</span><span className="button-plus">↗</span></button>
      <div className="search-field"><Search size={16}/><input id="history-search" type="search" aria-label="Cerca nelle conversazioni" placeholder="Cerca nelle chat" value={query} onChange={e => setQuery(e.target.value)}/><kbd>⌘ K</kbd></div>
      <div className="history-label"><span>IL TUO SPAZIO</span><span>{chats.length ? String(chats.length).padStart(2, '0') : ''}</span></div>
      <div className="history-list">
        {filtered.map(chat => <div key={chat.id} className={`history-item ${selected === chat.id ? 'active' : ''}`}><button onClick={() => chooseChat(chat)} disabled={busy} title={chat.title}><MessageSquare size={15}/><span>{chat.title}</span></button><button className="history-edit" aria-label={`Rinomina ${chat.title}`} onClick={() => { setRename(chat); setRenameText(chat.title); }} disabled={busy}><PenLine size={13}/></button></div>)}
        {!filtered.length && <div className="history-empty"><MessageSquare size={23}/><p>{query ? 'Nessuna conversazione trovata.' : 'Ogni idea ha un inizio.'}</p><span>{query ? 'Prova con un’altra parola.' : 'Le tue conversazioni appariranno qui.'}</span></div>}
      </div>
      <div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={15}/><span>{settings.saveHistory ? 'Cronologia sul dispositivo' : 'Cronologia non salvata'}</span></div><button className="settings-button" onClick={() => setSettingsOpen(true)}><Settings2 size={17}/> Impostazioni <span>↗</span></button><div className="founder"><span className="avatar">SL</span><div><strong>Spazio personale</strong><span>NOVALEN · Simone Lenzi</span></div><span className="version">v1.0</span></div></div>
    </aside>
    <main className="workspace">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-only" onClick={() => setSidebar(true)} aria-label="Apri navigazione"><Menu size={20}/></button><span className="workspace-label">Workspace</span><span className="topbar-slash">/</span><span className="page-title">{empty ? 'Nuovo inizio' : active?.title}</span></div>
        <div className="topbar-right"><button className={`connection-status ${status?.ready ? 'connected' : ''}`} onClick={() => setSettingsOpen(true)}><i/>{connectionText}</button><div className="relative"><button className="icon-button" aria-label="Azioni conversazione" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={20}/></button>{menuOpen && <><button className="dismiss-popover" tabIndex={-1} aria-label="Chiudi menu" onClick={() => setMenuOpen(false)}/><div className="popover action-menu"><button disabled={!active || busy} onClick={() => { if (active) { setRename(active); setRenameText(active.title); } setMenuOpen(false); }}><PenLine size={15}/> Rinomina</button><button disabled={!active} onClick={() => { if (active) downloadFile(`novalen-${active.id.slice(0, 8)}.md`, markdownExport(active), 'text/markdown;charset=utf-8'); setMenuOpen(false); }}><Download size={15}/> Esporta in Markdown</button><button disabled={!active || busy} className="danger" onClick={() => { if (active) setDeleting(active); setMenuOpen(false); }}><Trash2 size={15}/> Elimina conversazione</button></div></>}</div></div>
      </header>
      <div className={`workspace-content ${empty ? 'welcome-content' : ''}`} ref={scrollArea} onScroll={() => { const el = scrollArea.current; if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
        {empty ? <section className="welcome"><div className="welcome-mark"><div className="mark-orbit"/><Logo/><span className="orbit-dot"/></div><div className="eyebrow">MENO RUMORE. PIÙ POSSIBILITÀ.</div><h1>Spazio alle tue <span>idee.</span></h1><p className="welcome-description">Un pensiero da esplorare. Qualcosa da creare.<br/>Da dove iniziamo oggi?</p>
          <div className="suggestion-grid">{suggestions.map(({ icon: Icon, title, text, prompt, mode: m }) => <button key={title} className="suggestion" onClick={() => { setDraft(prompt); chooseMode(m); input.current?.focus(); }}><div className="suggestion-top"><Icon size={20}/><ArrowUpRight size={16}/></div><strong>{title}</strong><span>{text}</span></button>)}</div>
          <div className="welcome-caption"><span/> IL TUO PROSSIMO PASSO COMINCIA QUI <span/></div>
        </section> : <section className="messages" aria-label="Conversazione">
          <div className="conversation-date">{new Date(active!.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} <span>·</span> {modes[currentMode].label}</div>
          {messages.map((message, index) => <article className={`message ${message.role}`} key={message.id}>
            <div className={`message-avatar ${message.role}`}>{message.role === 'assistant' ? <Logo/> : 'TU'}</div>
            <div className="message-main"><div className="message-heading"><strong>{message.role === 'user' ? 'Tu' : 'NOVALEN AI'}</strong>{message.role === 'assistant' && <span>{models.find(m => m.id === message.model)?.name || 'Assistente'}</span>}</div>
              {message.role === 'user' ? <div className="user-text">{message.content}</div> : message.content ? <Suspense fallback={<div className="user-text">{message.content}</div>}><Markdown content={message.content}/></Suspense> : message.status === 'streaming' ? <div className="thinking" role="status"><i/><i/><i/><span>Sto elaborando…</span></div> : null}
              {!!message.attachments?.length && <div className="message-files">{message.attachments.map(file => <span key={file.id}><FileText size={14}/>{file.name}</span>)}</div>}
              {message.error && <div className={`message-error ${message.status === 'stopped' ? 'muted' : ''}`} role="status">{message.error}{message.status === 'error' && !message.content && <button onClick={() => setSettingsOpen(true)}>Apri impostazioni <ArrowUpRight size={13}/></button>}</div>}
              <div className="message-actions">
                {message.content && <button aria-label="Copia messaggio" onClick={() => void copy(message)}>{copiedId === message.id ? <Check size={14}/> : <Copy size={14}/>}<span>{copiedId === message.id ? 'Copiato' : 'Copia'}</span></button>}
                {message.role === 'user' && <button disabled={busy} onClick={() => { setEditing(message); setEditText(message.content); }}><PenLine size={14}/><span>Modifica</span></button>}
                {message.role === 'assistant' && index === messages.length - 1 && <button disabled={busy} onClick={retry}><RefreshCw size={14}/><span>{message.status === 'error' ? 'Riprova' : 'Rigenera'}</span></button>}
              </div>
            </div>
          </article>)}
        </section>}
      </div>
      <div className="composer-area">
        {storageError && <div className="storage-warning" role="alert">{storageError}<button onClick={exportAll}>Esporta</button></div>}
        {contextNote && <div className="context-note">Per questa risposta sono inclusi solo i messaggi più recenti. La cronologia completa resta salvata.</div>}
        <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}>
          {!!attachments.length && <div className="attachment-list">{attachments.map(file => <span key={file.id}><FileText size={15}/>{file.name}<button type="button" onClick={() => setAttachments(values => values.filter(f => f.id !== file.id))} aria-label={`Rimuovi ${file.name}`}><X size={13}/></button></span>)}</div>}
          <textarea ref={input} id="composer" rows={2} maxLength={12000} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Chiedi, immagina, crea…" aria-label="Scrivi un messaggio" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); void send(); } }}/>
          <div className="composer-toolbar"><div className="composer-tools"><input type="file" multiple hidden ref={fileInput} accept=".txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.html,.css,.sql,.yml,.yaml" onChange={e => { void addFiles(e.target.files); e.target.value = ''; }}/><button type="button" className="icon-button attach-button" title="Allega file di testo · fino a 32 KB" aria-label="Allega file di testo" onClick={() => fileInput.current?.click()} disabled={busy}><Paperclip size={19}/></button><span className="toolbar-divider"/><div className="mode-control"><Zap size={14}/><select aria-label="Modalità assistente" value={currentMode} onChange={e => chooseMode(e.target.value as Mode)} disabled={busy}>{Object.entries(modes).map(([id, value]) => <option value={id} key={id}>{value.label}</option>)}</select></div></div>
            <div className="composer-right"><div className="model-picker relative"><button type="button" className="model-button" disabled={busy} onClick={() => setModelOpen(!modelOpen)} aria-expanded={modelOpen}><span>{modelInfo.name}</span><ChevronDown size={14}/></button>{modelOpen && <><button type="button" className="dismiss-popover" tabIndex={-1} aria-label="Chiudi modelli" onClick={() => setModelOpen(false)}/><div className="popover model-menu"><div className="popover-label">SCEGLI UN MODELLO</div>{models.map(item => <button key={item.id} type="button" onClick={() => chooseModel(item.id)}><span><strong>{item.name}</strong><small>{item.provider} · {item.configured ? item.description : 'Da configurare'}</small></span>{currentModel === item.id && <Check size={16}/>}</button>)}<p>I modelli sono ospitati da Groq.<br/>Le modalità cambiano lo stile, non il modello.</p></div></>}</div>{busy ? <button className="send-button stop-button" type="button" onClick={() => abortRef.current?.abort()} aria-label="Interrompi risposta"><Square size={15} fill="currentColor"/></button> : <button className="send-button" type="submit" disabled={!draft.trim() && !attachments.length} aria-label="Invia messaggio"><ArrowUp size={21}/></button>}</div>
          </div>
        </form>
        {!status?.ready && !statusLoading && <button className="setup-notice" onClick={() => setSettingsOpen(true)}><span className="status-dot"/><span>{statusError ? 'Collega il backend per attivare le risposte AI.' : status?.reason === 'security_setup' ? 'Completa la configurazione di accesso al server.' : 'Il tuo spazio è pronto. Collega Groq per attivare l’AI.'}</span><ArrowUpRight size={14}/></button>}
        <div className="composer-footnote"><span>NOVALEN AI può commettere errori. Verifica le informazioni importanti.</span><span className="keyboard-note">Invio per inviare <kbd>↵</kbd></span></div>
      </div>
    </main>
    {toast && <div className="toast" role="status"><span>{toast}</span><button aria-label="Chiudi avviso" onClick={() => setToast('')}><X size={16}/></button></div>}
    {settingsOpen && <Settings settings={settings} status={status} accessCode={accessCode} count={chats.length} onSave={saveSettings} onClose={() => setSettingsOpen(false)} onExport={exportAll} onImport={importAll} onRefresh={() => void refresh()} onClear={() => { if (busyRef.current) { setToast('Interrompi la risposta prima di eliminare le chat.'); return; } try { localStorage.removeItem(STORAGE_KEY); setChats([]); setSelected(null); setToast('Cronologia eliminata.'); } catch { setToast('Impossibile eliminare la cronologia dal browser.'); } }}/>}
    {rename && <Modal title="Un nome per questa idea" onClose={() => setRename(null)}><form onSubmit={e => { e.preventDefault(); if (renameText.trim()) { updateChat(rename.id, c => ({ ...c, title: renameText.trim().slice(0, 100) })); setRename(null); } }}><label className="field-title" htmlFor="chat-name">Nome della conversazione</label><input autoFocus id="chat-name" maxLength={100} value={renameText} onChange={e => setRenameText(e.target.value)}/><div className="modal-footer"><button className="text-button" type="button" onClick={() => setRename(null)}>Annulla</button><button className="primary-button" disabled={!renameText.trim()}>Salva nome</button></div></form></Modal>}
    {editing && <Modal title="Dai una nuova direzione" onClose={() => setEditing(null)}><p className="modal-subtitle">La modifica crea una variante della chat. La conversazione originale viene conservata.</p><textarea aria-label="Modifica messaggio" rows={6} maxLength={12000} autoFocus value={editText} onChange={e => setEditText(e.target.value)}/><div className="modal-footer"><button className="text-button" onClick={() => setEditing(null)}>Annulla</button><button className="primary-button" onClick={editAndGenerate} disabled={!editText.trim()}>Salva e rigenera</button></div></Modal>}
    {deleting && <Modal title="Eliminare questa conversazione?" onClose={() => setDeleting(null)}><p className="modal-subtitle">“{deleting.title}” verrà rimossa da questo browser. Puoi esportarla dal menu prima di procedere.</p><div className="modal-footer"><button className="text-button" onClick={() => setDeleting(null)}>Annulla</button><button className="danger-button" onClick={() => { setChats(all => all.filter(c => c.id !== deleting.id)); if (selected === deleting.id) setSelected(null); setDeleting(null); }}>Elimina conversazione</button></div></Modal>}
  </div>;
}
