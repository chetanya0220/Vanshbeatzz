import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Volume2, VolumeX, Heart, Home, Search, Library } from 'lucide-react';


const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api'
});

api.interceptors.request.use(c => { const t = localStorage.getItem('vb_token'); if (t) c.headers.Authorization = 'Bearer ' + t; return c; });
const msg = e => e.response?.data?.error || 'Something went wrong';
const PC = createContext(); const usePlayer = () => useContext(PC);
const fmt = s => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

function PlayerProvider({ children }) {
  const a = useRef(new Audio());
  const [queue, setQueue] = useState([]), [i, setI] = useState(0), [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0), [dur, setDur] = useState(0), [vol, setVol] = useState(0.8), [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false), [repeat, setRepeat] = useState(false), [err, setErr] = useState('');
  const track = queue[i];
  const go = n => queue.length && setI((n + queue.length) % queue.length);
  const next = () => go(shuffle ? Math.floor(Math.random() * queue.length) : i + 1);
  const toggle = () => { const e = a.current; if (!track) return; e.paused ? e.play().then(() => setPlaying(true)).catch(() => setErr('Playback blocked or unavailable')) : (e.pause(), setPlaying(false)); };
  useEffect(() => {
    if (!track) return; const e = a.current; e.src = track.audioUrl; setErr('');
    e.play().then(() => setPlaying(true)).catch(x => { setPlaying(false); setErr(x.name === 'NotAllowedError' ? 'Press play to start (autoplay blocked)' : 'This track cannot be played'); });
    api.post(`/tracks/${track._id}/play`).catch(() => {});
  }, [track]);
  useEffect(() => {
    const e = a.current;
    const f = { timeupdate: () => setTime(e.currentTime), loadedmetadata: () => setDur(e.duration), ended: () => (repeat ? (e.currentTime = 0, e.play()) : next()), error: () => { setPlaying(false); setErr('Audio unavailable or URL expired'); } };
    Object.entries(f).forEach(([k, v]) => e.addEventListener(k, v));
    return () => Object.entries(f).forEach(([k, v]) => e.removeEventListener(k, v));
  });
  useEffect(() => { a.current.volume = vol; a.current.muted = muted; }, [vol, muted]);
  useEffect(() => { const k = e => { if (e.code === 'Space' && !['INPUT', 'SELECT'].includes(e.target.tagName)) { e.preventDefault(); toggle(); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  const play = (list, idx) => { setQueue(list); setI(idx); };
  return <PC.Provider value={{ track, play, playing, toggle, next, prev: () => go(i - 1), time, dur, seek: v => (a.current.currentTime = v), vol, setVol, muted, setMuted, shuffle, setShuffle, repeat, setRepeat, err }}>{children}</PC.Provider>;
}

function Bar() {
  const p = usePlayer(); const t = p.track;
  return <div className="bar" role="region" aria-label="Player">
    <div className="row">{t ? <><img src={t.cover} alt="" /><div><b>{t.title}</b><br /><small>{t.artist}</small>{t.externalUrl && <> · <a href={t.externalUrl} target="_blank" rel="noreferrer" style={{ color: '#1ed760' }}><small>Full song ↗</small></a></>}</div></> : <small>Pick a song to start</small>}</div>
    <div><div className="ctl">
      <button aria-label="Shuffle" className={p.shuffle ? 'on' : ''} onClick={() => p.setShuffle(!p.shuffle)}><Shuffle size={18} /></button>
      <button aria-label="Previous" onClick={p.prev}><SkipBack /></button>
      <button aria-label="Play or pause" className="btn" onClick={p.toggle}>{p.playing ? <Pause size={18} /> : <Play size={18} />}</button>
      <button aria-label="Next" onClick={p.next}><SkipForward /></button>
      <button aria-label="Repeat" className={p.repeat ? 'on' : ''} onClick={() => p.setRepeat(!p.repeat)}><Repeat size={18} /></button></div>
      <div className="ctl"><small>{fmt(p.time)}</small><input type="range" aria-label="Seek" min="0" max={p.dur || 0} value={p.time} onChange={e => p.seek(+e.target.value)} /><small>{fmt(p.dur)}</small></div>
      {p.err && <div className="err ctl"><small>{p.err}</small></div>}</div>
    <div className="ctl vol"><button aria-label="Mute" onClick={() => p.setMuted(!p.muted)}>{p.muted ? <VolumeX /> : <Volume2 />}</button><input type="range" aria-label="Volume" min="0" max="1" step="0.05" value={p.vol} onChange={e => p.setVol(+e.target.value)} /></div>
  </div>;
}

function useFetch(url, deps = []) {
  const [d, setD] = useState(null), [e, setE] = useState('');
  useEffect(() => { setD(null); setE(''); api.get(url).then(r => setD(r.data)).catch(x => setE(msg(x))); }, deps);
  return [d, e];
}
const Skeleton = () => <div className="grid">{Array.from({ length: 6 }, (_, k) => <div key={k} className="sk" />)}</div>;
function Cards({ items }) {
  const p = usePlayer(); const [likes, setLikes] = useState({});
  const like = async t => { try { const r = await api.post(`/tracks/${t._id}/like`); setLikes({ ...likes, [t._id]: r.data.liked }); } catch (e) { alert(e.response?.status === 401 ? 'Log in to like songs' : msg(e)); } };
  if (!items.length) return <p>Nothing here yet.</p>;
  return <div className="grid">{items.map((t, k) => <div className="card" key={t._id} onClick={() => p.play(items, k)}>
    <img src={t.cover} alt={t.title} loading="lazy" /><b>{t.title}</b><small>{t.artist}</small>
    <button aria-label="Like" className={likes[t._id] ? 'on' : ''} onClick={e => { e.stopPropagation(); like(t); }}><Heart size={16} /></button>
    <button aria-label="Add to playlist" onClick={async e => { e.stopPropagation(); try { const { data } = await api.get('/playlists'); const n = prompt('Add to which playlist?\n' + data.map((x, j) => `${j + 1}. ${x.name}`).join('\n')); const pl = data[n - 1]; if (pl) { await api.post(`/playlists/${pl._id}/tracks`, { trackId: t._id }); alert('Added'); } } catch (x) { alert(x.response?.status === 401 ? 'Log in first' : msg(x)); } }}>＋</button>
  </div>)}</div>;
}
function Section({ title, url }) {
  const [d, e] = useFetch(url, [url]);
  return <><h2>{title}</h2>{e ? <p className="err">{e}</p> : !d ? <Skeleton /> : <Cards items={d.items} />}</>;
}
const HomePage = () => <><h1 className="logo">VanshBeatzz</h1>
  <p><small>Songs play as official 30-second previews. Tap “Full song ↗” in the player to listen in full on Apple Music. First sync takes a few minutes after the backend starts; refresh to see more songs.</small></p>
  <Section title="New releases" url="/tracks?sort=new&limit=12" /><Section title="Trending" url="/tracks?sort=trending&limit=12" />
  {['Arijit Singh', 'Arjan Dhillon', 'Prem Dhillon', 'Masoom Sharma', 'Nusrat Fateh Ali Khan', 'Farak'].map(a => <Section key={a} title={a} url={`/tracks?q=${encodeURIComponent(a)}&limit=12`} />)}</>;

function SearchPage() {
  const [q, setQ] = useState(''), [r, setR] = useState(null), [e, setE] = useState('');
  useEffect(() => { if (!q.trim()) return setR(null); const h = setTimeout(() => api.get('/tracks', { params: { q } }).then(x => { setR(x.data.items); setE(''); }).catch(x => setE(msg(x))), 350); return () => clearTimeout(h); }, [q]);
  return <><h2>Search</h2><input placeholder="Song, artist, album or genre" value={q} onChange={x => setQ(x.target.value)} />{e && <p className="err">{e}</p>}{r && (r.length ? <Cards items={r} /> : <p>No results for “{q}”.</p>)}</>;
}

function LibraryPage({ authed }) {
  const [pls, setPls] = useState(null), [likes, setLikes] = useState([]), [e, setE] = useState(''); const p = usePlayer();
  const load = () => Promise.all([api.get('/playlists'), api.get('/me/likes')]).then(([a, b]) => { setPls(a.data); setLikes(b.data); }).catch(x => setE(msg(x)));
  useEffect(() => { if (authed) load(); }, [authed]);
  if (!authed) return <p>Please <NavLink to="/login">log in</NavLink> to see your library.</p>;
  const act = f => f().then(load).catch(x => setE(msg(x)));
  return <><h2>Your library</h2>{e && <p className="err">{e}</p>}
    <button className="btn" onClick={() => { const n = prompt('Playlist name'); n && act(() => api.post('/playlists', { name: n })); }}>New playlist</button>
    <h2>Liked songs</h2><Cards items={likes} />
    {pls?.map(pl => <div key={pl._id}><h2>{pl.name} <button onClick={() => { const n = prompt('Rename', pl.name); n && act(() => api.put('/playlists/' + pl._id, { name: n })); }}>rename</button> <button onClick={() => confirm('Delete playlist?') && act(() => api.delete('/playlists/' + pl._id))}>delete</button></h2>
      {pl.tracks.map((t, k) => <div className="row" key={t._id}><img src={t.cover} alt="" /><span className="t" onClick={() => p.play(pl.tracks, k)} style={{ cursor: 'pointer' }}>{t.title} — {t.artist}</span><button onClick={() => act(() => api.delete(`/playlists/${pl._id}/tracks/${t._id}`))}>remove</button></div>)}</div>)}</>;
}

function Login({ onAuth }) {
  const [f, setF] = useState({ name: '', email: '', password: '' }), [reg, setReg] = useState(false), [e, setE] = useState(''); const nav = useNavigate();
  const submit = async () => { try { const { data } = await api.post(reg ? '/auth/register' : '/auth/login', f); localStorage.setItem('vb_token', data.token); onAuth(true); nav('/'); } catch (x) { setE(msg(x)); } };
  return <><h2>{reg ? 'Create account' : 'Log in'}</h2>
    {reg && <input placeholder="Name" value={f.name} onChange={x => setF({ ...f, name: x.target.value })} />}
    <input placeholder="Email" value={f.email} onChange={x => setF({ ...f, email: x.target.value })} />
    <input placeholder="Password (8+ chars)" type="password" value={f.password} onChange={x => setF({ ...f, password: x.target.value })} />
    {e && <p className="err">{e}</p>}<button className="btn" onClick={submit}>{reg ? 'Register' : 'Log in'}</button> <button onClick={() => setReg(!reg)}>{reg ? 'Have an account?' : 'Need an account?'}</button>
    <p><small>Demo: demo@vanshbeatzz.dev / Demo@12345</small></p></>;
}

export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('vb_token'));
  return <PlayerProvider><div className="app">
    <nav><span className="logo">VanshBeatzz</span>
      <NavLink to="/"><Home size={18} />Home</NavLink><NavLink to="/search"><Search size={18} />Search</NavLink><NavLink to="/library"><Library size={18} />Library</NavLink>
      {authed ? <button onClick={() => { localStorage.removeItem('vb_token'); setAuthed(false); }}>Log out</button> : <NavLink to="/login">Log in</NavLink>}</nav>
    <main><Routes><Route path="/" element={<HomePage />} /><Route path="/search" element={<SearchPage />} /><Route path="/library" element={<LibraryPage authed={authed} />} /><Route path="/login" element={<Login onAuth={setAuthed} />} /></Routes></main>
    <Bar /></div></PlayerProvider>;
}
