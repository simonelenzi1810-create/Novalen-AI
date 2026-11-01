import { useState, useRef } from 'react';
import { Sun, Moon, Plug, Shield, Download, Upload, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { Modal } from './Modal';
import { normalizeBackend } from '../lib/api';
import type { Settings as SettingsData } from '../lib/settings';
import type { Status } from '../../shared/contracts';

type Props = {
  settings: SettingsData; status: Status | null; accessCode: string; count: number;
  onSave: (value: SettingsData, accessCode: string) => void; onClose: () => void;
  onExport: () => void; onImport: (file: File) => Promise<void>; onClear: () => void; onRefresh: () => void;
};
export function Settings({ settings, status, accessCode, count, onSave, onClose, onExport, onImport, onClear, onRefresh }: Props) {
  const [tab, setTab] = useState(status?.ready ? 'general' : 'connection');
  const [draft, setDraft] = useState(settings);
  const [code, setCode] = useState(accessCode);
  const [error, setError] = useState('');
  const importer = useRef<HTMLInputElement>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  function save() {
    try { const backend = normalizeBackend(draft.backend); onSave({ ...draft, backend }, code); }
    catch (e) { setError((e as Error).message); }
  }
  return <Modal title="Il tuo spazio, le tue regole." onClose={onClose} wide>
    <p className="modal-subtitle">Personalizza NOVALEN AI.</p>
    <nav className="settings-tabs" aria-label="Sezioni impostazioni">
      {[['general', 'Generali'], ['connection', 'Connessione AI'], ['data', 'I tuoi dati']].map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} aria-pressed={tab === id} onClick={() => { setTab(id); setError(''); }}>{label}</button>)}
    </nav>
    <div className="settings-content">
      {tab === 'general' && <>
        <label className="field-title">Aspetto</label>
        <div className="theme-choices">{(['dark', 'light'] as const).map(theme => <button className={draft.theme === theme ? 'selected' : ''} onClick={() => setDraft({ ...draft, theme })} key={theme} aria-pressed={draft.theme === theme}>
          {theme === 'dark' ? <Moon size={19}/> : <Sun size={19}/>} {theme === 'dark' ? 'Scuro' : 'Chiaro'} {draft.theme === theme && <Check size={16}/>}</button>)}</div>
        <label className="field-title" htmlFor="instructions">Come vorresti che rispondesse?</label>
        <p className="field-hint">Preferenze di tono, lingua o livello di dettaglio. Si applicano ai prossimi messaggi.</p>
        <textarea id="instructions" rows={4} maxLength={1500} value={draft.instructions} onChange={e => setDraft({ ...draft, instructions: e.target.value })} placeholder="Per esempio: usa un linguaggio semplice e aggiungi esempi concreti."/>
        <span className="character-count">{draft.instructions.length} / 1.500</span>
        <div className="info-box"><Shield size={18}/><p>Le conversazioni rimangono in questo browser. Solo i messaggi necessari alla risposta vengono inviati al provider AI configurato.</p></div>
      </>}
      {tab === 'connection' && <>
        <div className="provider-list">{(status?.providers || [{ id: 'groq', name: 'Groq', state: 'not_configured' }, { id: 'gemini', name: 'Google Gemini', state: 'planned' }, { id: 'openai', name: 'OpenAI API', state: 'planned' }]).map(p => <div className="provider-row" key={p.id}><span><Plug size={16}/>{p.name}</span><span className={`small-tag ${p.state === 'configured' ? 'good' : ''}`}>{p.state === 'configured' ? 'Configurato · da verificare' : p.state === 'planned' ? 'In programma' : 'Da configurare'}</span></div>)}</div>
        <label className="field-title" htmlFor="backend">Indirizzo del backend</label>
        <p className="field-hint">Lascia vuoto se sito e backend sono ospitati insieme. Con GitHub Pages, inserisci il dominio del tuo Worker.</p>
        <input id="backend" type="url" value={draft.backend} onChange={e => setDraft({ ...draft, backend: e.target.value })} placeholder="https://novalen-ai.…workers.dev" autoComplete="off"/>
        <label className="field-title" htmlFor="access-code">Codice di accesso al sito</label>
        <input id="access-code" type="password" maxLength={256} value={code} onChange={e => setCode(e.target.value)} placeholder="Solo se richiesto dal gestore" autoComplete="off"/>
        <p className="field-hint">Rimane soltanto in memoria fino alla chiusura o al ricaricamento della pagina. Non inserire qui chiavi API.</p>
        <div className="info-box"><Shield size={18}/><p>La chiave Groq va configurata esclusivamente come segreto sul server. Le istruzioni sono nel README del progetto.</p></div>
        <button className="text-button" onClick={onRefresh}><RefreshCw size={14}/> Aggiorna stato della connessione salvata</button>
        <a className="external-link" href="https://console.groq.com/docs/quickstart" target="_blank" rel="noopener noreferrer">Documentazione Groq <ExternalLink size={13}/></a>
      </>}
      {tab === 'data' && <>
        <div className="setting-row"><div><strong>Salva la cronologia</strong><p>Solo su questo dispositivo, senza sincronizzazione.</p></div><button className={`switch ${draft.saveHistory ? 'on' : ''}`} role="switch" aria-checked={draft.saveHistory} aria-label="Salva la cronologia" onClick={() => setDraft({ ...draft, saveHistory: !draft.saveHistory })}><span/></button></div>
        <p className="field-hint">Disattivarla interrompe i nuovi salvataggi. Per rimuovere anche le chat già salvate usa “Elimina cronologia”.</p>
        <div className="data-actions"><button className="secondary-button" onClick={onExport} disabled={!count}><Download size={16}/> Esporta tutto · JSON</button><button className="secondary-button" onClick={() => importer.current?.click()}><Upload size={16}/> Importa archivio</button></div>
        <input ref={importer} type="file" accept=".json" hidden onChange={async e => { const file = e.target.files?.[0]; if (file) { try { await onImport(file); setError(''); } catch (error) { setError((error as Error).message); } } e.target.value = ''; }}/>
        <p className="field-hint">{count} conversazioni. Gli archivi esportati includono i testi degli allegati.</p>
        <div className="future-features"><strong>In programma</strong><p>Sincronizzazione tra dispositivi, PDF, analisi di immagini, ricerca web e assistenti dedicati. Queste funzioni non sono ancora attive.</p></div>
        {!clearConfirm ? <button className="danger-link" onClick={() => setClearConfirm(true)} disabled={!count}>Elimina cronologia</button> : <div className="confirm-inline"><p>Eliminare tutte le conversazioni da questo browser? Esportale prima se vuoi conservarle.</p><button className="danger-button" onClick={() => { onClear(); setClearConfirm(false); }}>Elimina tutto</button><button className="text-button" onClick={() => setClearConfirm(false)}>Annulla</button></div>}
      </>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="modal-footer"><span>NOVALEN AI · v1.0</span><button className="primary-button" onClick={save}>Salva preferenze</button></footer>
  </Modal>;
}
