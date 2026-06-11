import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Sprout, LayoutDashboard, Bell, History, LogOut, RefreshCw,
  Wifi, WifiOff, Droplets, Activity, Thermometer, Waves,
} from "lucide-react";
import { api } from "./api.js";

const SANS = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const C = {
  bg: "#F4F7F3", panel: "#FFFFFF", line: "#E1E7DE",
  text: "#16281C", sub: "#5B6B5F", accent: "#2E7A47", accentSoft: "#E8F3EC",
  danger: "#B23B3B", warn: "#9A7B0A",
};

// ---- basit veri çekme + periyodik yenileme kancası ----
function usePolling(fn, deps, intervalMs, onOnline) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const savedFn = useRef(fn);
  savedFn.current = fn;

  const tick = useCallback(async () => {
    try {
      const d = await savedFn.current();
      setData(d);
      setError(null);
      onOnline && onOnline(true);
    } catch (e) {
      setError(e.message || String(e));
      onOnline && onOnline(false);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    setLoading(true);
    tick();
    if (!intervalMs) return;
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, intervalMs]);

  return { data, loading, error, refresh: tick };
}

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const fmt = (v, d = 2) => (num(v) === null || Number.isNaN(num(v)) ? "-" : num(v).toFixed(d));
const saat = (ts) => {
  if (!ts) return "";
  const dt = new Date(ts);
  return Number.isNaN(dt.getTime()) ? String(ts) : dt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
};

function Panel({ title, icon, right, children, style }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, ...style }}>
      {(title || right) && (
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div className="flex items-center" style={{ gap: 8, color: C.text, fontWeight: 600 }}>
            {icon}{title}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function Stat({ icon, label, value, unit }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16 }}>
      <div className="flex items-center" style={{ gap: 8, color: C.sub, fontSize: 13 }}>{icon}{label}</div>
      <div style={{ marginTop: 6, fontSize: 26, fontWeight: 700, color: C.text }}>
        {value}<span style={{ fontSize: 13, color: C.sub, fontWeight: 500 }}> {unit}</span>
      </div>
    </div>
  );
}

// ---------------- Giriş ----------------
function Login({ onLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: SANS }} className="flex items-center justify-center p-4">
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 20, padding: 28, width: 360 }}>
        <div className="flex items-center" style={{ gap: 10, marginBottom: 4 }}>
          <Sprout color={C.accent} />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>Çilek Dozlama Sistemi</h1>
        </div>
        <p style={{ color: C.sub, fontSize: 13, marginTop: 0 }}>Üretim uygulaması - canlı izleme</p>
        <label style={{ fontSize: 13, color: C.sub }}>Kullanıcı adı</label>
        <input value={u} onChange={(e) => setU(e.target.value)}
          className="border rounded-xl w-full" style={{ borderColor: C.line, padding: "10px 12px", margin: "4px 0 12px" }} />
        <label style={{ fontSize: 13, color: C.sub }}>Parola</label>
        <input type="password" value={p} onChange={(e) => setP(e.target.value)}
          className="border rounded-xl w-full" style={{ borderColor: C.line, padding: "10px 12px", margin: "4px 0 16px" }} />
        <button onClick={() => onLogin({ name: u || "operator" })}
          className="w-full rounded-xl font-semibold"
          style={{ background: C.accent, color: "#fff", padding: "10px 12px", border: "none", cursor: "pointer" }}>
          Giriş
        </button>
        <p style={{ color: C.sub, fontSize: 11, marginTop: 12, marginBottom: 0 }}>
          Not: Bu ekran istemci tarafı bir geçittir; üretimde kimlik doğrulama yerel sunucu üzerindeki
          servis tarafından (API) yapılmalıdır.
        </p>
      </div>
    </div>
  );
}

// ---------------- Pano ----------------
function Pano({ seraId, setOnline }) {
  const { data, loading, error } = usePolling(
    () => api.okumalar(seraId, 120),
    [seraId],
    5000,
    setOnline
  );
  if (!seraId) return <Empty msg="Sera seçilmedi." />;
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox msg={error} />;

  const rows = Array.isArray(data) ? data : [];
  const seri = rows.map((r) => ({
    t: saat(r.okuma_zamani || r.zaman || r.t),
    ph: num(r.ph ?? r.pH),
    ec: num(r.ec ?? r.EC),
  }));
  const son = rows.length ? rows[rows.length - 1] : {};

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
      <Stat icon={<Droplets size={16} />} label="pH" value={fmt(son.ph ?? son.pH, 2)} unit="" />
      <Stat icon={<Activity size={16} />} label="EC" value={fmt(son.ec ?? son.EC, 2)} unit="mS/cm" />
      <Stat icon={<Thermometer size={16} />} label="Sıcaklık" value={fmt(son.sicaklik, 1)} unit="°C" />
      <Stat icon={<Waves size={16} />} label="Su seviyesi" value={fmt(son.su_seviye, 0)} unit="%" />

      <Panel title="pH (son okumalar)" style={{ gridColumn: "1 / -1" }}>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={seri} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fontSize: 11, fill: C.sub }} minTickGap={24} />
              <YAxis domain={[0, 14]} tick={{ fontSize: 11, fill: C.sub }} />
              <Tooltip />
              <Line type="monotone" dataKey="ph" stroke={C.accent} dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="EC (son okumalar)" style={{ gridColumn: "1 / -1" }}>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={seri} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fontSize: 11, fill: C.sub }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: C.sub }} />
              <Tooltip />
              <Line type="monotone" dataKey="ec" stroke="#2563B0" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}

// ---------------- Alarmlar ----------------
function Alarmlar({ setOnline }) {
  const { data, loading, error } = usePolling(() => api.alarmlar("acik"), [], 10000, setOnline);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox msg={error} />;
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return <Empty msg="Açık alarm yok." />;
  return (
    <Panel title="Açık Alarmlar" icon={<Bell size={16} color={C.danger} />}>
      <div className="grid gap-2">
        {rows.map((a, i) => (
          <div key={a.alarm_id ?? i} className="flex items-center justify-between"
            style={{ border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.danger}`, borderRadius: 12, padding: "10px 12px" }}>
            <div>
              <div style={{ fontWeight: 600, color: C.text }}>{a.parametre || a.tur || "Alarm"} - Sera {a.sera_id ?? "?"}</div>
              <div style={{ color: C.sub, fontSize: 13 }}>{a.mesaj || ""}</div>
            </div>
            <div style={{ color: C.sub, fontSize: 12 }}>{saat(a.olusma_zamani)}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---------------- Geçmiş ----------------
function Gecmis({ seraId, setOnline }) {
  const { data, loading, error } = usePolling(() => api.okumalar(seraId, 50), [seraId], 15000, setOnline);
  if (!seraId) return <Empty msg="Sera seçilmedi." />;
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox msg={error} />;
  const rows = (Array.isArray(data) ? data : []).slice().reverse();
  if (!rows.length) return <Empty msg="Kayıt bulunamadı." />;
  return (
    <Panel title="Son Okumalar" icon={<History size={16} />}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: C.sub, textAlign: "left" }}>
              <th style={{ padding: "6px 8px" }}>Zaman</th>
              <th style={{ padding: "6px 8px" }}>pH</th>
              <th style={{ padding: "6px 8px" }}>EC</th>
              <th style={{ padding: "6px 8px" }}>Sıcaklık</th>
              <th style={{ padding: "6px 8px" }}>Su %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${C.line}`, color: C.text }}>
                <td style={{ padding: "6px 8px" }}>{saat(r.okuma_zamani)}</td>
                <td style={{ padding: "6px 8px" }}>{fmt(r.ph ?? r.pH, 2)}</td>
                <td style={{ padding: "6px 8px" }}>{fmt(r.ec ?? r.EC, 2)}</td>
                <td style={{ padding: "6px 8px" }}>{fmt(r.sicaklik, 1)}</td>
                <td style={{ padding: "6px 8px" }}>{fmt(r.su_seviye, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Loading() {
  return <div style={{ color: C.sub, padding: 24, textAlign: "center" }}>Yükleniyor...</div>;
}
function Empty({ msg }) {
  return <div style={{ color: C.sub, padding: 24, textAlign: "center" }}>{msg}</div>;
}
function ErrorBox({ msg }) {
  return (
    <div style={{ color: C.danger, background: "#FBEDED", border: `1px solid #F0C9C9`, borderRadius: 12, padding: 14 }}>
      Veri alınamadı: {msg}
    </div>
  );
}

// ---------------- Kabuk ----------------
function Dashboard({ user, onLogout }) {
  const [tab, setTab] = useState("pano");
  const [seralar, setSeralar] = useState([]);
  const [seraId, setSeraId] = useState(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.seralar();
        if (!alive) return;
        const list = Array.isArray(s) ? s : [];
        setSeralar(list);
        if (list.length) setSeraId(list[0].sera_id ?? list[0].id);
        setOnline(true);
      } catch {
        if (alive) setOnline(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const tabs = [
    { id: "pano", label: "Pano", icon: <LayoutDashboard size={16} /> },
    { id: "alarm", label: "Alarmlar", icon: <Bell size={16} /> },
    { id: "gecmis", label: "Geçmiş", icon: <History size={16} /> },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: SANS }}>
      <header style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "12px 16px" }} className="flex items-center justify-between">
          <div className="flex items-center" style={{ gap: 10 }}>
            <Sprout color={C.accent} />
            <strong style={{ color: C.text }}>Çilek Dozlama - İzleme</strong>
            <span style={{ fontSize: 12, color: online ? C.accent : C.danger }} className="inline-flex items-center">
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}&nbsp;{online ? "Bağlı" : "Bağlantı yok"}
            </span>
          </div>
          <div className="flex items-center" style={{ gap: 10 }}>
            <select value={seraId ?? ""} onChange={(e) => setSeraId(e.target.value)}
              className="border rounded-lg" style={{ borderColor: C.line, padding: "6px 8px", fontSize: 13 }}>
              {seralar.length === 0 && <option value="">Sera yok</option>}
              {seralar.map((s) => {
                const id = s.sera_id ?? s.id;
                return <option key={id} value={id}>{s.ad || `Sera ${id}`}</option>;
              })}
            </select>
            <span style={{ fontSize: 13, color: C.sub }}>{user.name}</span>
            <button onClick={onLogout} className="inline-flex items-center rounded-lg"
              style={{ border: `1px solid ${C.line}`, background: "#fff", padding: "6px 10px", cursor: "pointer", color: C.text, fontSize: 13, gap: 6 }}>
              <LogOut size={14} /> Çıkış
            </button>
          </div>
        </div>
      </header>

      {!online && (
        <div style={{ maxWidth: 1080, margin: "12px auto 0", padding: "0 16px" }}>
          <div style={{ background: "#FFF7E6", border: "1px solid #F0DCA8", color: C.warn, borderRadius: 12, padding: "10px 14px", fontSize: 13 }}>
            Sunucuya bağlanılamadı. API adresi: <code>{api.base}</code> - yerel sunucu üzerindeki REST
            servisinin çalıştığını ve <code>VITE_API_URL</code> değerinin doğru olduğunu kontrol edin.
          </div>
        </div>
      )}

      <nav style={{ maxWidth: 1080, margin: "12px auto 0", padding: "0 16px" }} className="flex" >
        <div className="flex" style={{ gap: 6, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 4 }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="inline-flex items-center rounded-lg"
              style={{
                gap: 6, padding: "8px 12px", fontSize: 13, cursor: "pointer", border: "none",
                background: tab === t.id ? C.accentSoft : "transparent",
                color: tab === t.id ? C.accent : C.sub, fontWeight: tab === t.id ? 700 : 500,
              }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 1080, margin: "16px auto", padding: "0 16px 32px" }}>
        {tab === "pano" && <Pano seraId={seraId} setOnline={setOnline} />}
        {tab === "alarm" && <Alarmlar setOnline={setOnline} />}
        {tab === "gecmis" && <Gecmis seraId={seraId} setOnline={setOnline} />}
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  if (!user) return <Login onLogin={setUser} />;
  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}
