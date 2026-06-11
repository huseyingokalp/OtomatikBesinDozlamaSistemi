import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceArea, AreaChart, Area,
} from "recharts";
import {
  Sprout, LayoutDashboard, Activity, FlaskConical, Database, Droplets, Bell,
  LogOut, Play, Pause, Thermometer, Waves, History, Pencil, ShieldCheck,
  Plus, X, Check, AlertTriangle, RefreshCw, User, Beaker, Clock, CircleDot,
} from "lucide-react";

/* ============================ TEMA ============================ */
const C = {
  bg:"#F4F6F1", panel:"#FFFFFF", line:"#E5E8E0", ink:"#16241C", sub:"#5C6B61",
  side:"#0F2E22", sideInk:"#C6E3D2", sideSub:"#6E8F7C", sideActive:"#1C5C40",
  green:"#1A7A47", greenSoft:"#E3F2E8", accent:"#27B768",
  red:"#C53A3A", redSoft:"#FBE7E7", amber:"#B8771C", amberSoft:"#FBEFD9",
  blue:"#2563B8", blueSoft:"#E5EEFA",
};
const SANS = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const COZ = {
  ASIT:{ad:"Asit (pH-)", c:C.red, b:C.redSoft},
  BAZ:{ad:"Baz (pH+)", c:C.blue, b:C.blueSoft},
  BESIN_A:{ad:"Besin A", c:C.green, b:C.greenSoft},
  BESIN_B:{ad:"Besin B", c:C.amber, b:C.amberSoft},
  SU:{ad:"Su", c:"#0E7490", b:"#DEF1F4"},
};

/* ============================ YARDIMCILAR ============================ */
let _ID = 7000;
const uid = () => ++_ID;
const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pad2 = (n) => String(n).padStart(2, "0");
const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
const fmtDT = (d) =>
  `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

function statusOf(v, min, max) {
  if (v < min) return { label: "DÜŞÜK", c: C.blue, b: C.blueSoft };
  if (v > max) return { label: "YÜKSEK", c: C.red, b: C.redSoft };
  return { label: "NORMAL", c: C.green, b: C.greenSoft };
}
function activeTargets(db, seraId) {
  const parti = db.parti.find((p) => p.sera_id === seraId && p.durum === "AKTIF") || null;
  const evre = parti ? db.buyume_evresi.find((e) => e.id === parti.aktif_evre_id) : null;
  if (!evre)
    return { ph_min:5.8, ph_max:6.2, ec_min:1.4, ec_max:1.8, sic_min:18, sic_max:24, evre:null, parti };
  return { ...evre, evre, parti };
}
const mkAlarm = (sera_id, turu, mesaj, deger, ts) => ({
  id: uid(), sera_id, alarm_turu: turu, mesaj, deger, zaman: ts, durum: "AKTIF", cozulme: null,
});

/* ============================ BAŞLANGIÇ VERİSİ ============================ */
function seedEngine() {
  const kullanici = [
    { id:1, kullanici_adi:"admin", sifre:"1234", ad_soyad:"Sistem Yöneticisi", yetki_seviyesi:1 },
    { id:2, kullanici_adi:"operator", sifre:"1234", ad_soyad:"Sera Operatörü", yetki_seviyesi:0 },
  ];
  const sera = [
    { id:1, sera_kodu:"SRA-01", sera_ad:"A Blok Serası", konum:"Kuzey Üretim Alanı" },
    { id:2, sera_kodu:"SRA-02", sera_ad:"B Blok Serası", konum:"Güney Üretim Alanı" },
  ];
  const recete = [
    { id:1, recete_kodu:"RCT-CLK", recete_ad:"Çilek Standart", cesit:"Albion", aciklama:"Genel amaçlı çilek besin reçetesi" },
    { id:2, recete_kodu:"RCT-CLK-Y", recete_ad:"Çilek Yoğun Verim", cesit:"San Andreas", aciklama:"Meyvelenmede yüksek EC" },
  ];
  const buyume_evresi = [
    { id:1, evre_kodu:"EVR-FID", evre_ad:"Fide", recete_id:1, ph_min:5.8, ph_max:6.2, ec_min:0.8, ec_max:1.2, sic_min:18, sic_max:24 },
    { id:2, evre_kodu:"EVR-VEJ", evre_ad:"Vejetatif", recete_id:1, ph_min:5.8, ph_max:6.2, ec_min:1.2, ec_max:1.6, sic_min:18, sic_max:24 },
    { id:3, evre_kodu:"EVR-CIC", evre_ad:"Çiçeklenme", recete_id:1, ph_min:5.8, ph_max:6.2, ec_min:1.4, ec_max:1.8, sic_min:18, sic_max:24 },
    { id:4, evre_kodu:"EVR-MEY", evre_ad:"Meyvelenme", recete_id:1, ph_min:5.6, ph_max:6.0, ec_min:1.6, ec_max:2.0, sic_min:18, sic_max:24 },
    { id:5, evre_kodu:"EVR-MEY-Y", evre_ad:"Meyvelenme (Yoğun)", recete_id:2, ph_min:5.6, ph_max:6.0, ec_min:2.0, ec_max:2.4, sic_min:18, sic_max:24 },
  ];
  const parti = [
    { id:1, parti_kodu:"PRT-2026-001", recete_id:1, sera_id:1, aktif_evre_id:3, ekim_tarihi:"2026-03-15", durum:"AKTIF" },
    { id:2, parti_kodu:"PRT-2026-002", recete_id:2, sera_id:2, aktif_evre_id:5, ekim_tarihi:"2026-02-20", durum:"AKTIF" },
  ];
  const tankSpec = [
    [1,1,"ASIT",16.2],[2,1,"BAZ",17.8],[3,1,"BESIN_A",14.5],[4,1,"BESIN_B",13.9],[5,1,"SU",19.0],
    [6,2,"ASIT",11.4],[7,2,"BAZ",12.0],[8,2,"BESIN_A",2.1],[9,2,"BESIN_B",9.7],[10,2,"SU",15.4],
  ];
  const tank = tankSpec.map(([id,sera_id,coz,mev]) => ({
    id, tank_kodu:`TNK-${pad2(id)}`, tank_ad:`${COZ[coz].ad} Tankı`, sera_id,
    cozelti_turu:coz, kapasite_litre:20, mevcut_litre:mev,
  }));
  let cid = 0;
  const cihaz = [];
  tank.forEach((t) => {
    cid++;
    cihaz.push({ id:cid, cihaz_kodu:`PMP-${pad2(cid)}`, cihaz_ad:`${COZ[t.cozelti_turu].ad} Pompası`,
      cihaz_turu:"POMPA", sera_id:t.sera_id, tank_id:t.id, durum:"AKTIF" });
  });
  sera.forEach((s) => {
    cid++;
    cihaz.push({ id:cid, cihaz_kodu:`SNS-${pad2(s.id)}`, cihaz_ad:"Çoklu Sensör Ünitesi (pH/EC/Sıc.)",
      cihaz_turu:"SENSOR", sera_id:s.id, tank_id:null, durum:"AKTIF" });
  });
  _ID = 7000;

  const cur = {
    1: { ph:6.05, ec:1.55, sic:21.0, su:82 },
    2: { ph:5.78, ec:2.18, sic:21.5, su:74 },
  };
  // geçmiş okumalarla grafikleri doldur
  const sensor_okuma = [];
  const base = Date.now() - 24 * 2000;
  sera.forEach((s) => {
    const c = cur[s.id];
    for (let i = 0; i < 24; i++) {
      sensor_okuma.push({
        id: uid(), sera_id: s.id, zaman: new Date(base + i * 2000),
        ph: r2(c.ph + rand(-0.12, 0.12)), ec: r2(c.ec + rand(-0.08, 0.08)),
        sicaklik: r1(c.sic + rand(-0.4, 0.4)), su: r1(c.su + (24 - i) * 0.15),
      });
    }
  });
  const alarm = [
    mkAlarm(1, "pH Yüksek", "pH değeri kısa süreliğine hedefin üzerine çıktı, otomatik düzeltildi", 6.42,
      new Date(Date.now() - 1000 * 60 * 18)),
  ];
  alarm[0].durum = "COZULDU";
  alarm[0].cozulme = new Date(Date.now() - 1000 * 60 * 17);

  return { db: { kullanici, sera, recete, buyume_evresi, parti, tank, cihaz, sensor_okuma, dozlama_kaydi: [], alarm }, cur };
}

/* ============================ SİMÜLASYON ADIMI ============================ */
function stepEngine(engine) {
  const { db } = engine;
  const cur = { ...engine.cur };
  const newReadings = [];
  const newDoses = [];
  const created = [];
  const tanks = db.tank.map((t) => ({ ...t }));
  const ts = new Date();
  const tankBy = (sId, coz) => tanks.find((t) => t.sera_id === sId && t.cozelti_turu === coz);
  const pumpBy = (tankId) => db.cihaz.find((c) => c.tank_id === tankId && c.cihaz_turu === "POMPA");
  const hasAlarm = (sId, turu) =>
    db.alarm.some((a) => a.sera_id === sId && a.alarm_turu === turu && a.durum === "AKTIF") ||
    created.some((a) => a.sera_id === sId && a.alarm_turu === turu);

  db.sera.forEach((s) => {
    const t = activeTargets(db, s.id);
    const v = { ...cur[s.id] };
    v.ph = clamp(v.ph + rand(-0.07, 0.07), 3.5, 8.5);
    v.ec = clamp(v.ec + rand(-0.06, 0.05), 0.2, 4.0);
    v.sic = clamp(v.sic + rand(-0.15, 0.15), 10, 35);
    v.su = clamp(v.su - rand(0.05, 0.3), 0, 100);
    newReadings.push({ id: uid(), sera_id: s.id, zaman: ts,
      ph: r2(v.ph), ec: r2(v.ec), sicaklik: r1(v.sic), su: r1(v.su) });

    const dose = (coz, ml, before, after) => {
      const tk = tankBy(s.id, coz);
      if (!tk || tk.mevcut_litre < ml / 1000) return false;
      tk.mevcut_litre = r2(tk.mevcut_litre - ml / 1000);
      const pump = pumpBy(tk.id);
      newDoses.push({ id: uid(), sera_id: s.id, tank_id: tk.id, cihaz_id: pump ? pump.id : null,
        parti_id: t.parti ? t.parti.id : null, zaman: ts, miktar_ml: r1(ml),
        tetik_turu: "OTOMATIK", oncesi: r2(before), sonrasi: r2(after), cozelti: coz });
      return true;
    };

    if (v.ph > t.ph_max + 0.03) {
      const dev = v.ph - t.ph_max, ml = clamp(dev * 220, 4, 24), before = v.ph;
      if (dose("ASIT", ml, before, t.ph_max - 0.02)) v.ph = clamp(before - dev * rand(0.7, 0.95), t.ph_min, 8.5);
    } else if (v.ph < t.ph_min - 0.03) {
      const dev = t.ph_min - v.ph, ml = clamp(dev * 220, 4, 24), before = v.ph;
      if (dose("BAZ", ml, before, t.ph_min + 0.02)) v.ph = clamp(before + dev * rand(0.7, 0.95), 3.5, t.ph_max);
    }
    if (v.ec < t.ec_min - 0.03) {
      const dev = t.ec_min - v.ec, ml = clamp(dev * 120, 3, 18), before = v.ec;
      const a = dose("BESIN_A", ml, before, before + dev * 0.5);
      const b = dose("BESIN_B", ml, before, before + dev * 0.5);
      if (a || b) v.ec = clamp(before + dev * rand(0.7, 0.95), 0.2, t.ec_max);
    } else if (v.ec > t.ec_max + 0.03) {
      const dev = v.ec - t.ec_max, ml = clamp(dev * 150, 4, 22), before = v.ec;
      if (dose("SU", ml, before, t.ec_max - 0.02)) { v.ec = clamp(before - dev * rand(0.6, 0.9), t.ec_min, 4.0); v.su = clamp(v.su + ml / 200, 0, 100); }
    }
    cur[s.id] = v;
  });

  db.sera.forEach((s) => {
    const t = activeTargets(db, s.id);
    const v = cur[s.id];
    if ((v.ph < t.ph_min - 0.5 || v.ph > t.ph_max + 0.5) && !hasAlarm(s.id, "pH Kritik"))
      created.push(mkAlarm(s.id, "pH Kritik", `pH değeri kritik seviyede: ${r2(v.ph)}`, r2(v.ph), ts));
    if ((v.ec < t.ec_min - 0.6 || v.ec > t.ec_max + 0.6) && !hasAlarm(s.id, "EC Kritik"))
      created.push(mkAlarm(s.id, "EC Kritik", `EC değeri kritik: ${r2(v.ec)} mS/cm`, r2(v.ec), ts));
    if (v.su < 20 && !hasAlarm(s.id, "Su Seviyesi Düşük"))
      created.push(mkAlarm(s.id, "Su Seviyesi Düşük", `Çözelti su seviyesi düşük: %${r1(v.su)}`, r1(v.su), ts));
  });
  tanks.forEach((tk) => {
    const pct = (tk.mevcut_litre / tk.kapasite_litre) * 100;
    const turu = `Tank Düşük - ${COZ[tk.cozelti_turu].ad}`;
    if (pct < 12 && !hasAlarm(tk.sera_id, turu))
      created.push(mkAlarm(tk.sera_id, turu, `${tk.tank_ad} seviyesi düşük (%${Math.round(pct)})`, r2(tk.mevcut_litre), ts));
  });

  return {
    cur,
    db: {
      ...db,
      tank: tanks,
      sensor_okuma: [...db.sensor_okuma, ...newReadings].slice(-260),
      dozlama_kaydi: [...db.dozlama_kaydi, ...newDoses].slice(-600),
      alarm: created.length ? [...created.reverse(), ...db.alarm] : db.alarm,
    },
  };
}

/* ============================ KÜÇÜK BİLEŞENLER ============================ */
function Pill({ c, b, children, mono }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ color: c, background: b, fontFamily: mono ? MONO : SANS }}>{children}</span>
  );
}
function Card({ children, className = "", style = {} }) {
  return (
    <div className={`rounded-2xl border ${className}`}
      style={{ background: C.panel, borderColor: C.line, boxShadow: "0 1px 2px rgba(16,40,28,.04)", ...style }}>
      {children}
    </div>
  );
}
function RangeBar({ value, min, max }) {
  const span = max - min || 1;
  const pad = span * 0.6;
  const lo = min - pad, hi = max + pad;
  const pct = clamp(((value - lo) / (hi - lo)) * 100, 0, 100);
  const tMin = clamp(((min - lo) / (hi - lo)) * 100, 0, 100);
  const tMax = clamp(((max - lo) / (hi - lo)) * 100, 0, 100);
  return (
    <div style={{ position: "relative", height: 8, borderRadius: 999, background: "#EAEDE7" }}>
      <div style={{ position: "absolute", left: `${tMin}%`, width: `${tMax - tMin}%`, top: 0, bottom: 0, background: "#C2E6CF", borderRadius: 999 }} />
      <div style={{ position: "absolute", left: `calc(${pct}% - 6px)`, top: -2, width: 12, height: 12, borderRadius: 999, background: C.side, border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium" style={{ color: C.sub }}>{label}</span>
      {children}
    </label>
  );
}
const inputCls = "px-3 py-2 rounded-lg border text-sm w-full outline-none";
const inputStyle = { borderColor: C.line, color: C.ink, background: "#fff", fontFamily: SANS };

function Modal({ title, onClose, onSubmit, submitLabel = "Kaydet", children }) {
  return (
    <div onClick={onClose} className="flex items-center justify-center p-4"
      style={{ position: "fixed", inset: 0, background: "rgba(15,30,22,.45)", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="border rounded-2xl w-full"
        style={{ background: C.panel, borderColor: C.line, maxWidth: 460, boxShadow: "0 24px 60px rgba(16,40,28,.25)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.line }}>
          <h3 className="font-semibold" style={{ color: C.ink }}>{title}</h3>
          <button onClick={onClose} style={{ color: C.sub }}><X size={18} /></button>
        </div>
        <div className="p-5 grid gap-3">{children}</div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: C.line }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: C.sub }}>İptal</button>
          <button onClick={onSubmit} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: C.green }}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ GİRİŞ EKRANI ============================ */
function Login({ db, onLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    const found = db.kullanici.find((k) => k.kullanici_adi === u.trim() && k.sifre === p);
    if (!found) { setErr("Kullanıcı adı veya parola hatalı."); return; }
    onLogin(found);
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ fontFamily: SANS, background: `radial-gradient(1200px 600px at 70% -10%, #1C5C40 0%, ${C.side} 45%, #0A2018 100%)` }}>
      <div className="w-full" style={{ maxWidth: 400 }}>
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="flex items-center justify-center rounded-2xl" style={{ width: 52, height: 52, background: C.accent }}>
            <Sprout size={28} color="#0A2018" />
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-tight">ÇİLEK DOZLAMA SİSTEMİ</div>
            <div className="text-xs" style={{ color: C.sideSub }}>Hidroponik İzleme & Kontrol</div>
          </div>
        </div>
        <div className="rounded-2xl p-6 border" style={{ background: C.panel, borderColor: "rgba(255,255,255,.15)" }}>
          <h2 className="font-semibold mb-1" style={{ color: C.ink }}>Sisteme Giriş</h2>
          <p className="text-sm mb-5" style={{ color: C.sub }}>Devam etmek için oturum açın.</p>
          <div className="grid gap-3">
            <Field label="Kullanıcı Adı">
              <input className={inputCls} style={inputStyle} value={u} onChange={(e) => setU(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="admin" />
            </Field>
            <Field label="Parola">
              <input type="password" className={inputCls} style={inputStyle} value={p}
                onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••" />
            </Field>
            {err && <div className="text-xs font-medium" style={{ color: C.red }}>{err}</div>}
            <button onClick={submit} className="mt-1 py-2.5 rounded-lg font-semibold text-white" style={{ background: C.green }}>
              Giriş Yap
            </button>
          </div>
          <div className="mt-5 pt-4 border-t text-xs" style={{ borderColor: C.line, color: C.sub }}>
            <div className="font-semibold mb-1" style={{ color: C.ink }}>Demo hesapları</div>
            Yönetici → <span style={{ fontFamily: MONO }}>admin / 1234</span><br />
            Operatör → <span style={{ fontFamily: MONO }}>operator / 1234</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ ANA UYGULAMA ============================ */
const VIEWS = [
  { key:"dashboard", label:"İzleme Paneli", icon:LayoutDashboard },
  { key:"trend", label:"Sensör Grafikleri", icon:Activity },
  { key:"recete", label:"Reçete & Evre", icon:FlaskConical },
  { key:"sera", label:"Sera & Parti", icon:Sprout },
  { key:"tank", label:"Tank & Cihaz", icon:Database },
  { key:"dozlama", label:"Dozlama Geçmişi", icon:Droplets },
  { key:"alarm", label:"Alarmlar", icon:Bell },
];

export default function App() {
  const [engine, setEngine] = useState(seedEngine);
  const [user, setUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [seraId, setSeraId] = useState(1);
  const [simOn, setSimOn] = useState(true);
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [receteSel, setReceteSel] = useState(1);
  const [dzSera, setDzSera] = useState("all");
  const [dzTetik, setDzTetik] = useState("all");
  const [dzCoz, setDzCoz] = useState("all");
  const [alarmF, setAlarmF] = useState("AKTIF");
  const isAdmin = user && user.yetki_seviyesi === 1;
  const db = engine.db;

  useEffect(() => {
    if (!user || !simOn) return;
    const id = setInterval(() => { setEngine((e) => stepEngine(e)); setNow(new Date()); }, 2000);
    return () => clearInterval(id);
  }, [user, simOn]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  if (!user) return <Login db={db} onLogin={(u) => setUser(u)} />;

  const aktifAlarmlar = db.alarm.filter((a) => a.durum === "AKTIF");

  /* ---------- aksiyonlar ---------- */
  const manualDose = (sId, coz, ml) => {
    setEngine((e) => {
      const tanks = e.db.tank.map((t) => ({ ...t }));
      const tk = tanks.find((t) => t.sera_id === sId && t.cozelti_turu === coz);
      if (!tk || tk.mevcut_litre < ml / 1000) { setToast({ ok: false, msg: `${COZ[coz].ad} tankı yetersiz` }); return e; }
      tk.mevcut_litre = r2(tk.mevcut_litre - ml / 1000);
      const pump = e.db.cihaz.find((c) => c.tank_id === tk.id && c.cihaz_turu === "POMPA");
      const cur = { ...e.cur }; const v = { ...cur[sId] };
      const before = coz === "ASIT" || coz === "BAZ" ? v.ph : v.ec;
      if (coz === "ASIT") v.ph = clamp(v.ph - ml * 0.012, 3.5, 8.5);
      if (coz === "BAZ") v.ph = clamp(v.ph + ml * 0.012, 3.5, 8.5);
      if (coz === "BESIN_A" || coz === "BESIN_B") v.ec = clamp(v.ec + ml * 0.006, 0.2, 4);
      if (coz === "SU") { v.ec = clamp(v.ec - ml * 0.004, 0.2, 4); v.su = clamp(v.su + ml / 200, 0, 100); }
      const after = coz === "ASIT" || coz === "BAZ" ? v.ph : v.ec;
      cur[sId] = v;
      const p = e.db.parti.find((p) => p.sera_id === sId && p.durum === "AKTIF");
      const dose = { id: uid(), sera_id: sId, tank_id: tk.id, cihaz_id: pump ? pump.id : null, parti_id: p ? p.id : null,
        zaman: new Date(), miktar_ml: ml, tetik_turu: "MANUEL", oncesi: r2(before), sonrasi: r2(after), cozelti: coz };
      setToast({ ok: true, msg: `Manuel dozlama: ${ml} ml ${COZ[coz].ad}` });
      return { cur, db: { ...e.db, tank: tanks, dozlama_kaydi: [...e.db.dozlama_kaydi, dose].slice(-600) } };
    });
  };
  const resolveAlarm = (id) =>
    setEngine((e) => ({ ...e, db: { ...e.db, alarm: e.db.alarm.map((a) => a.id === id ? { ...a, durum: "COZULDU", cozulme: new Date() } : a) } }));
  const refillTank = (id) =>
    setEngine((e) => {
      const tk = e.db.tank.find((t) => t.id === id);
      const turu = `Tank Düşük - ${COZ[tk.cozelti_turu].ad}`;
      return { ...e, db: { ...e.db,
        tank: e.db.tank.map((t) => t.id === id ? { ...t, mevcut_litre: t.kapasite_litre } : t),
        alarm: e.db.alarm.map((a) => a.sera_id === tk.sera_id && a.alarm_turu === turu && a.durum === "AKTIF" ? { ...a, durum: "COZULDU", cozulme: new Date() } : a) } };
    });
  const setActiveEvre = (partiId, evreId) =>
    setEngine((e) => ({ ...e, db: { ...e.db, parti: e.db.parti.map((p) => p.id === partiId ? { ...p, aktif_evre_id: evreId } : p) } }));

  /* ============================ GÖRÜNÜMLER ============================ */
  const tgt = activeTargets(db, seraId);
  const v = engine.cur[seraId];
  const seraReadings = db.sensor_okuma.filter((r) => r.sera_id === seraId).slice(-42)
    .map((r) => ({ t: fmtTime(r.zaman), ph: r.ph, ec: r.ec, sic: r.sicaklik, su: r.su }));

  function Dashboard() {
    const metrics = [
      { key:"ph", label:"pH Değeri", val:v.ph, unit:"", min:tgt.ph_min, max:tgt.ph_max, icon:FlaskConical, dec:2 },
      { key:"ec", label:"EC İletkenlik", val:v.ec, unit:"mS/cm", min:tgt.ec_min, max:tgt.ec_max, icon:Activity, dec:2 },
      { key:"sic", label:"Sıcaklık", val:v.sic, unit:"°C", min:tgt.sic_min, max:tgt.sic_max, icon:Thermometer, dec:1 },
      { key:"su", label:"Su Seviyesi", val:v.su, unit:"%", min:30, max:100, icon:Waves, dec:0 },
    ];
    const lastDoses = db.dozlama_kaydi.filter((d) => d.sera_id === seraId).slice(-5).reverse();
    const seraTanks = db.tank.filter((t) => t.sera_id === seraId);
    const seraAlarms = aktifAlarmlar.filter((a) => a.sera_id === seraId);
    return (
      <div className="grid gap-5">
        <Card className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
          <div className="flex items-center gap-2 text-sm" style={{ color: C.sub }}>
            <Sprout size={16} color={C.green} /><span className="font-semibold" style={{ color: C.ink }}>{db.sera.find((s) => s.id === seraId).sera_ad}</span>
          </div>
          {tgt.parti && <div className="text-sm" style={{ color: C.sub }}>Parti: <span style={{ fontFamily: MONO, color: C.ink }}>{tgt.parti.parti_kodu}</span></div>}
          {tgt.evre && <div className="text-sm" style={{ color: C.sub }}>Aktif Evre: <span className="font-semibold" style={{ color: C.ink }}>{tgt.evre.evre_ad}</span></div>}
          <div className="text-sm" style={{ color: C.sub }}>Hedef pH <span style={{ fontFamily: MONO, color: C.ink }}>{tgt.ph_min}-{tgt.ph_max}</span> · EC <span style={{ fontFamily: MONO, color: C.ink }}>{tgt.ec_min}-{tgt.ec_max}</span></div>
        </Card>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          {metrics.map((m) => {
            const st = statusOf(m.val, m.min, m.max);
            const Icon = m.icon;
            return (
              <Card key={m.key} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-medium" style={{ color: C.sub }}>
                    <Icon size={16} color={C.green} />{m.label}
                  </div>
                  <Pill c={st.c} b={st.b}>{st.label}</Pill>
                </div>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="text-3xl font-semibold" style={{ fontFamily: MONO, color: C.ink }}>{m.val.toFixed(m.dec)}</span>
                  <span className="text-sm" style={{ color: C.sub }}>{m.unit}</span>
                </div>
                <RangeBar value={m.val} min={m.min} max={m.max} />
                <div className="flex justify-between mt-1.5 text-xs" style={{ color: C.sub, fontFamily: MONO }}>
                  <span>{m.min}</span><span>Hedef Aralık</span><span>{m.max}</span>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm" style={{ color: C.ink }}>Canlı Eğilim - pH & EC</h3>
              <div className="flex items-center gap-3 text-xs" style={{ color: C.sub }}>
                <span className="flex items-center gap-1"><i style={{ width: 10, height: 3, background: C.green, display: "inline-block", borderRadius: 2 }} /> pH</span>
                <span className="flex items-center gap-1"><i style={{ width: 10, height: 3, background: C.amber, display: "inline-block", borderRadius: 2 }} /> EC</span>
              </div>
            </div>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={seraReadings} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="#EEF1EC" vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: C.sub, fontFamily: MONO }} interval="preserveEnd" minTickGap={28} />
                  <YAxis yAxisId="ph" domain={[tgt.ph_min - 1, tgt.ph_max + 1]} tick={{ fontSize: 10, fill: C.sub, fontFamily: MONO }} width={42} />
                  <YAxis yAxisId="ec" orientation="right" domain={[0, "auto"]} tick={{ fontSize: 10, fill: C.sub, fontFamily: MONO }} width={36} />
                  <Tooltip contentStyle={{ fontSize: 12, fontFamily: SANS, borderRadius: 10, borderColor: C.line }} />
                  <ReferenceArea yAxisId="ph" y1={tgt.ph_min} y2={tgt.ph_max} fill={C.green} fillOpacity={0.07} />
                  <Line yAxisId="ph" type="monotone" dataKey="ph" stroke={C.green} strokeWidth={2} dot={false} isAnimationActive={false} name="pH" />
                  <Line yAxisId="ec" type="monotone" dataKey="ec" stroke={C.amber} strokeWidth={2} dot={false} isAnimationActive={false} name="EC" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-4" style={{ gridTemplateRows: "auto 1fr" }}>
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm flex items-center gap-1.5" style={{ color: C.ink }}><Bell size={15} color={C.red} /> Aktif Alarmlar</h3>
                <Pill c={seraAlarms.length ? C.red : C.green} b={seraAlarms.length ? C.redSoft : C.greenSoft}>{seraAlarms.length}</Pill>
              </div>
              {seraAlarms.length === 0 ? <p className="text-xs" style={{ color: C.sub }}>Bu sera için aktif alarm yok.</p> :
                <div className="grid gap-2">{seraAlarms.slice(0, 4).map((a) => (
                  <div key={a.id} className="rounded-lg px-3 py-2" style={{ background: C.redSoft }}>
                    <div className="text-xs font-semibold" style={{ color: C.red }}>{a.alarm_turu}</div>
                    <div className="text-xs" style={{ color: C.sub }}>{a.mesaj}</div>
                  </div>))}
                </div>}
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold text-sm flex items-center gap-1.5 mb-2" style={{ color: C.ink }}><Droplets size={15} color={C.blue} /> Son Dozlamalar</h3>
              {lastDoses.length === 0 ? <p className="text-xs" style={{ color: C.sub }}>Henüz dozlama yapılmadı.</p> :
                <div className="grid gap-1.5">{lastDoses.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5"><CircleDot size={12} color={COZ[d.cozelti].c} /><span style={{ color: C.ink }}>{COZ[d.cozelti].ad}</span></span>
                    <span style={{ fontFamily: MONO, color: C.sub }}>{d.miktar_ml} ml · {fmtTime(d.zaman)}</span>
                  </div>))}
                </div>}
            </Card>
          </div>
        </div>

        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3" style={{ color: C.ink }}>Tank Seviyeleri - {db.sera.find((s) => s.id === seraId).sera_ad}</h3>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            {seraTanks.map((t) => {
              const pct = clamp((t.mevcut_litre / t.kapasite_litre) * 100, 0, 100);
              const low = pct < 15;
              return (
                <div key={t.id} className="rounded-xl border p-3" style={{ borderColor: C.line }}>
                  <div className="flex items-center justify-between mb-2">
                    <Pill c={COZ[t.cozelti_turu].c} b={COZ[t.cozelti_turu].b}>{COZ[t.cozelti_turu].ad}</Pill>
                    <span className="text-xs font-semibold" style={{ fontFamily: MONO, color: low ? C.red : C.sub }}>%{Math.round(pct)}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "#EAEDE7", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: low ? C.red : COZ[t.cozelti_turu].c, borderRadius: 999 }} />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs" style={{ fontFamily: MONO, color: C.sub }}>{t.mevcut_litre.toFixed(1)}/{t.kapasite_litre} L</span>
                    <button onClick={() => manualDose(seraId, t.cozelti_turu, 10)} className="text-xs font-medium px-2 py-1 rounded-md"
                      style={{ color: C.green, background: C.greenSoft }}>+10 ml</button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  }

  function Trend() {
    const charts = [
      { key:"ph", label:"pH Değeri", color:C.green, band:[tgt.ph_min, tgt.ph_max], dom:[tgt.ph_min - 1, tgt.ph_max + 1] },
      { key:"ec", label:"EC (mS/cm)", color:C.amber, band:[tgt.ec_min, tgt.ec_max], dom:[Math.max(0, tgt.ec_min - 1), tgt.ec_max + 1] },
      { key:"sic", label:"Sıcaklık (°C)", color:C.red, band:[tgt.sic_min, tgt.sic_max], dom:[tgt.sic_min - 4, tgt.sic_max + 4] },
    ];
    return (
      <div className="grid gap-4">
        {charts.map((ch) => (
          <Card key={ch.key} className="p-4">
            <h3 className="font-semibold text-sm mb-2" style={{ color: C.ink }}>{ch.label} - Zaman Serisi</h3>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={seraReadings} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="#EEF1EC" vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: C.sub, fontFamily: MONO }} minTickGap={30} />
                  <YAxis domain={ch.dom} tick={{ fontSize: 10, fill: C.sub, fontFamily: MONO }} width={42} />
                  <Tooltip contentStyle={{ fontSize: 12, fontFamily: SANS, borderRadius: 10, borderColor: C.line }} />
                  <ReferenceArea y1={ch.band[0]} y2={ch.band[1]} fill={ch.color} fillOpacity={0.08} />
                  <Line type="monotone" dataKey={ch.key} stroke={ch.color} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ))}
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-2" style={{ color: C.ink }}>Su Seviyesi (%) - Zaman Serisi</h3>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={seraReadings} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
                <defs><linearGradient id="suG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0E7490" stopOpacity={0.35} /><stop offset="100%" stopColor="#0E7490" stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid stroke="#EEF1EC" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: C.sub, fontFamily: MONO }} minTickGap={30} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.sub, fontFamily: MONO }} width={42} />
                <Tooltip contentStyle={{ fontSize: 12, fontFamily: SANS, borderRadius: 10, borderColor: C.line }} />
                <Area type="monotone" dataKey="su" stroke="#0E7490" strokeWidth={2} fill="url(#suG)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    );
  }

  function Recete() {
    const sel = receteSel, setSel = setReceteSel;
    const evreler = db.buyume_evresi.filter((e) => e.recete_id === sel);
    return (
      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" style={{ color: C.ink }}>Besin Reçeteleri</h3>
          {isAdmin && <button onClick={() => setModal({ type: "recete", form: {} })} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: C.green }}><Plus size={15} /> Yeni Reçete</button>}
        </div>
        <Card>
          <Tbl head={["Kod", "Reçete Adı", "Çeşit", "Açıklama", "Evre Sayısı"]}>
            {db.recete.map((rc) => (
              <tr key={rc.id} onClick={() => setSel(rc.id)} style={{ cursor: "pointer", background: sel === rc.id ? C.greenSoft : "transparent" }}>
                <Td mono>{rc.recete_kodu}</Td><Td bold>{rc.recete_ad}</Td><Td>{rc.cesit}</Td>
                <Td sub>{rc.aciklama}</Td><Td mono>{db.buyume_evresi.filter((e) => e.recete_id === rc.id).length}</Td>
              </tr>
            ))}
          </Tbl>
        </Card>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm" style={{ color: C.ink }}>Büyüme Evreleri - {db.recete.find((r) => r.id === sel).recete_ad}</h3>
          {isAdmin && <button onClick={() => setModal({ type: "evre", form: { recete_id: sel, ph_min: 5.8, ph_max: 6.2, ec_min: 1.4, ec_max: 1.8, sic_min: 18, sic_max: 24 } })} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg" style={{ color: C.green, background: C.greenSoft }}><Plus size={15} /> Yeni Evre</button>}
        </div>
        <Card>
          <Tbl head={["Kod", "Evre", "Hedef pH", "Hedef EC", "Hedef Sıcaklık", isAdmin ? "" : null].filter((x) => x !== null)}>
            {evreler.map((e) => (
              <tr key={e.id}>
                <Td mono>{e.evre_kodu}</Td><Td bold>{e.evre_ad}</Td>
                <Td mono>{e.ph_min} - {e.ph_max}</Td><Td mono>{e.ec_min} - {e.ec_max}</Td>
                <Td mono>{e.sic_min} - {e.sic_max} °C</Td>
                {isAdmin && <Td><button onClick={() => setModal({ type: "evreEdit", form: { ...e } })} className="flex items-center gap-1 text-xs font-medium" style={{ color: C.green }}><Pencil size={13} /> Düzenle</button></Td>}
              </tr>
            ))}
          </Tbl>
        </Card>
      </div>
    );
  }

  function SeraParti() {
    return (
      <div className="grid gap-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
          {db.sera.map((s) => {
            const p = db.parti.find((x) => x.sera_id === s.id && x.durum === "AKTIF");
            return (
              <Card key={s.id} className="p-4">
                <div className="flex items-center gap-2 mb-1"><Sprout size={16} color={C.green} /><span className="font-semibold" style={{ color: C.ink }}>{s.sera_ad}</span></div>
                <div className="text-xs mb-2" style={{ color: C.sub }}>{s.sera_kodu} · {s.konum}</div>
                <div className="text-sm" style={{ color: C.sub }}>Aktif parti: {p ? <span style={{ fontFamily: MONO, color: C.ink }}>{p.parti_kodu}</span> : "-"}</div>
              </Card>
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" style={{ color: C.ink }}>Partiler</h3>
          {isAdmin && <button onClick={() => setModal({ type: "parti", form: { ekim_tarihi: new Date().toISOString().slice(0, 10) } })} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: C.green }}><Plus size={15} /> Yeni Parti</button>}
        </div>
        <Card>
          <Tbl head={["Parti Kodu", "Reçete", "Sera", "Aktif Evre", "Ekim Tarihi", "Durum"]}>
            {db.parti.map((p) => {
              const rc = db.recete.find((r) => r.id === p.recete_id);
              const evreler = db.buyume_evresi.filter((e) => e.recete_id === p.recete_id);
              return (
                <tr key={p.id}>
                  <Td mono>{p.parti_kodu}</Td><Td>{rc ? rc.recete_ad : "-"}</Td>
                  <Td>{db.sera.find((s) => s.id === p.sera_id).sera_ad}</Td>
                  <Td>
                    {isAdmin ? (
                      <select value={p.aktif_evre_id || ""} onChange={(e) => setActiveEvre(p.id, +e.target.value)}
                        className="px-2 py-1 rounded-md border text-sm" style={inputStyle}>
                        {evreler.map((e) => <option key={e.id} value={e.id}>{e.evre_ad}</option>)}
                      </select>
                    ) : <span className="font-medium" style={{ color: C.ink }}>{(evreler.find((e) => e.id === p.aktif_evre_id) || {}).evre_ad || "-"}</span>}
                  </Td>
                  <Td mono>{p.ekim_tarihi}</Td>
                  <Td><Pill c={C.green} b={C.greenSoft}>{p.durum}</Pill></Td>
                </tr>
              );
            })}
          </Tbl>
        </Card>
      </div>
    );
  }

  function TankCihaz() {
    return (
      <div className="grid gap-4">
        <h3 className="font-semibold" style={{ color: C.ink }}>Tanklar</h3>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          {db.tank.map((t) => {
            const pct = clamp((t.mevcut_litre / t.kapasite_litre) * 100, 0, 100);
            const low = pct < 15;
            return (
              <Card key={t.id} className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <Pill c={COZ[t.cozelti_turu].c} b={COZ[t.cozelti_turu].b}>{COZ[t.cozelti_turu].ad}</Pill>
                  <span className="text-xs" style={{ fontFamily: MONO, color: C.sub }}>{t.tank_kodu}</span>
                </div>
                <div className="text-xs mb-2" style={{ color: C.sub }}>{db.sera.find((s) => s.id === t.sera_id).sera_ad}</div>
                <div style={{ height: 10, borderRadius: 999, background: "#EAEDE7", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: low ? C.red : COZ[t.cozelti_turu].c }} />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-semibold" style={{ fontFamily: MONO, color: low ? C.red : C.ink }}>{t.mevcut_litre.toFixed(1)}/{t.kapasite_litre} L</span>
                  {isAdmin && <button onClick={() => refillTank(t.id)} className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md" style={{ color: C.green, background: C.greenSoft }}><RefreshCw size={12} /> Doldur</button>}
                </div>
              </Card>
            );
          })}
        </div>
        <h3 className="font-semibold mt-1" style={{ color: C.ink }}>Cihazlar</h3>
        <Card>
          <Tbl head={["Kod", "Cihaz", "Tür", "Sera", "Bağlı Tank", "Durum"]}>
            {db.cihaz.map((c) => (
              <tr key={c.id}>
                <Td mono>{c.cihaz_kodu}</Td><Td bold>{c.cihaz_ad}</Td>
                <Td><Pill c={c.cihaz_turu === "POMPA" ? C.blue : C.green} b={c.cihaz_turu === "POMPA" ? C.blueSoft : C.greenSoft}>{c.cihaz_turu}</Pill></Td>
                <Td>{db.sera.find((s) => s.id === c.sera_id).sera_ad}</Td>
                <Td sub>{c.tank_id ? db.tank.find((t) => t.id === c.tank_id).tank_kodu : "-"}</Td>
                <Td><Pill c={C.green} b={C.greenSoft}>{c.durum}</Pill></Td>
              </tr>
            ))}
          </Tbl>
        </Card>
      </div>
    );
  }

  function Dozlama() {
    const fSera = dzSera, setFSera = setDzSera;
    const fTetik = dzTetik, setFTetik = setDzTetik;
    const fCoz = dzCoz, setFCoz = setDzCoz;
    const list = db.dozlama_kaydi.filter((d) =>
      (fSera === "all" || d.sera_id === +fSera) &&
      (fTetik === "all" || d.tetik_turu === fTetik) &&
      (fCoz === "all" || d.cozelti === fCoz)).slice().reverse();
    const today = new Date().toDateString();
    const todayCount = db.dozlama_kaydi.filter((d) => new Date(d.zaman).toDateString() === today).length;
    const sumBy = (c) => r1(db.dozlama_kaydi.filter((d) => d.cozelti === c).reduce((a, d) => a + d.miktar_ml, 0));
    const stat = [
      { l: "Bugünkü Dozlama", v: todayCount, u: "işlem" },
      { l: "Toplam Asit", v: sumBy("ASIT"), u: "ml" },
      { l: "Toplam Baz", v: sumBy("BAZ"), u: "ml" },
      { l: "Toplam Besin (A+B)", v: r1(sumBy("BESIN_A") + sumBy("BESIN_B")), u: "ml" },
    ];
    const csv = () => {
      const rows = [["Zaman", "Sera", "Cozelti", "Miktar_ml", "Tetik", "Oncesi", "Sonrasi"]];
      list.forEach((d) => rows.push([fmtDT(new Date(d.zaman)), db.sera.find((s) => s.id === d.sera_id).sera_ad, COZ[d.cozelti].ad, d.miktar_ml, d.tetik_turu, d.oncesi, d.sonrasi]));
      const blob = new Blob(["\ufeff" + rows.map((r) => r.join(";")).join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "dozlama_kaydi.csv"; a.click(); URL.revokeObjectURL(url);
    };
    return (
      <div className="grid gap-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
          {stat.map((s) => (
            <Card key={s.l} className="p-4">
              <div className="text-xs font-medium mb-1" style={{ color: C.sub }}>{s.l}</div>
              <div className="flex items-baseline gap-1"><span className="text-2xl font-semibold" style={{ fontFamily: MONO, color: C.ink }}>{s.v}</span><span className="text-xs" style={{ color: C.sub }}>{s.u}</span></div>
            </Card>
          ))}
        </div>
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <Sel value={fSera} onChange={setFSera} opts={[["all", "Tüm Seralar"], ...db.sera.map((s) => [String(s.id), s.sera_ad])]} />
          <Sel value={fTetik} onChange={setFTetik} opts={[["all", "Tüm Tetikler"], ["OTOMATIK", "Otomatik"], ["MANUEL", "Manuel"]]} />
          <Sel value={fCoz} onChange={setFCoz} opts={[["all", "Tüm Çözeltiler"], ...Object.keys(COZ).map((k) => [k, COZ[k].ad])]} />
          <div className="flex-1" />
          <button onClick={csv} className="text-sm font-medium px-3 py-1.5 rounded-lg" style={{ color: C.green, background: C.greenSoft }}>CSV İndir</button>
        </Card>
        <Card>
          <Tbl head={["Zaman", "Sera", "Çözelti / Tank", "Miktar", "Tetik", "Öncesi → Sonrası"]}>
            {list.slice(0, 120).map((d) => (
              <tr key={d.id}>
                <Td mono>{fmtTime(new Date(d.zaman))}</Td>
                <Td>{db.sera.find((s) => s.id === d.sera_id).sera_kodu}</Td>
                <Td><span className="flex items-center gap-1.5"><CircleDot size={12} color={COZ[d.cozelti].c} />{COZ[d.cozelti].ad}</span></Td>
                <Td mono bold>{d.miktar_ml} ml</Td>
                <Td><Pill c={d.tetik_turu === "MANUEL" ? C.amber : C.blue} b={d.tetik_turu === "MANUEL" ? C.amberSoft : C.blueSoft}>{d.tetik_turu}</Pill></Td>
                <Td mono sub>{d.oncesi} → {d.sonrasi}</Td>
              </tr>
            ))}
            {list.length === 0 && <tr><Td sub>Kayıt bulunamadı.</Td><Td></Td><Td></Td><Td></Td><Td></Td><Td></Td></tr>}
          </Tbl>
        </Card>
      </div>
    );
  }

  function Alarmlar() {
    const f = alarmF, setF = setAlarmF;
    const list = db.alarm.filter((a) => f === "all" || a.durum === f);
    return (
      <div className="grid gap-4">
        <Card className="p-3 flex items-center gap-2">
          {[["AKTIF", "Aktif"], ["COZULDU", "Çözüldü"], ["all", "Hepsi"]].map(([k, l]) => (
            <button key={k} onClick={() => setF(k)} className="text-sm font-medium px-3 py-1.5 rounded-lg"
              style={{ color: f === k ? "#fff" : C.sub, background: f === k ? C.green : "transparent" }}>{l}</button>
          ))}
        </Card>
        <Card>
          <Tbl head={["Durum", "Tür", "Mesaj", "Sera", "Zaman", ""]}>
            {list.map((a) => (
              <tr key={a.id}>
                <Td><Pill c={a.durum === "AKTIF" ? C.red : C.green} b={a.durum === "AKTIF" ? C.redSoft : C.greenSoft}>{a.durum}</Pill></Td>
                <Td bold><span className="flex items-center gap-1.5">{a.durum === "AKTIF" && <AlertTriangle size={14} color={C.red} />}{a.alarm_turu}</span></Td>
                <Td sub>{a.mesaj}</Td>
                <Td>{db.sera.find((s) => s.id === a.sera_id).sera_kodu}</Td>
                <Td mono sub>{fmtDT(new Date(a.zaman))}</Td>
                <Td>{a.durum === "AKTIF" && <button onClick={() => resolveAlarm(a.id)} className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md text-white" style={{ background: C.green }}><Check size={13} /> Çöz</button>}</Td>
              </tr>
            ))}
            {list.length === 0 && <tr><Td sub>Bu filtrede alarm yok.</Td><Td></Td><Td></Td><Td></Td><Td></Td><Td></Td></tr>}
          </Tbl>
        </Card>
      </div>
    );
  }

  const titleMap = Object.fromEntries(VIEWS.map((x) => [x.key, x.label]));

  return (
    <div className="flex" style={{ minHeight: "100vh", background: C.bg, fontFamily: SANS }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box} body{margin:0} ::-webkit-scrollbar{width:10px;height:10px} ::-webkit-scrollbar-thumb{background:#cfd6cd;border-radius:8px}`}</style>

      {/* SIDEBAR */}
      <aside className="flex flex-col" style={{ width: 248, background: C.side, position: "sticky", top: 0, height: "100vh" }}>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex items-center justify-center rounded-xl" style={{ width: 38, height: 38, background: C.accent }}><Sprout size={21} color="#0A2018" /></div>
          <div><div className="text-white font-bold text-sm leading-tight">ÇİLEK DOZLAMA</div><div className="text-xs" style={{ color: C.sideSub }}>Hidroponik Kontrol</div></div>
        </div>
        <nav className="px-3 grid gap-1 mt-2">
          {VIEWS.map((it) => {
            const Icon = it.icon; const active = view === it.key;
            const badge = it.key === "alarm" && aktifAlarmlar.length ? aktifAlarmlar.length : null;
            return (
              <button key={it.key} onClick={() => setView(it.key)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium"
                style={{ color: active ? "#fff" : C.sideInk, background: active ? C.sideActive : "transparent" }}>
                <Icon size={18} />{it.label}
                {badge && <span className="ml-auto rounded-full px-1.5 text-xs font-bold" style={{ background: C.red, color: "#fff" }}>{badge}</span>}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto px-3 pb-4">
          <div className="rounded-xl px-3 py-3 mb-2" style={{ background: "rgba(255,255,255,.06)" }}>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center rounded-full" style={{ width: 32, height: 32, background: C.sideActive }}>
                {isAdmin ? <ShieldCheck size={16} color="#fff" /> : <User size={16} color="#fff" />}
              </div>
              <div className="min-w-0"><div className="text-white text-sm font-medium truncate">{user.ad_soyad}</div><div className="text-xs" style={{ color: C.sideSub }}>{isAdmin ? "Yönetici" : "Operatör"}</div></div>
            </div>
          </div>
          <button onClick={() => { setUser(null); setView("dashboard"); }} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium w-full" style={{ color: C.sideInk }}>
            <LogOut size={16} /> Çıkış Yap
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 min-w-0">
        <header className="flex flex-wrap items-center gap-3 px-6 py-3.5 border-b sticky top-0 z-20" style={{ background: "rgba(244,246,241,.85)", borderColor: C.line, backdropFilter: "blur(6px)" }}>
          <h1 className="text-lg font-bold" style={{ color: C.ink }}>{titleMap[view]}</h1>
          <div className="flex-1" />
          <select value={seraId} onChange={(e) => setSeraId(+e.target.value)} className="px-3 py-1.5 rounded-lg border text-sm font-medium" style={inputStyle}>
            {db.sera.map((s) => <option key={s.id} value={s.id}>{s.sera_ad}</option>)}
          </select>
          <button onClick={() => setSimOn((x) => !x)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border"
            style={{ borderColor: C.line, color: simOn ? C.green : C.sub, background: "#fff" }}>
            {simOn ? <><span className="rounded-full animate-pulse" style={{ width: 8, height: 8, background: C.green, display: "inline-block" }} /> Canlı</> : <>Duraklatıldı</>}
            {simOn ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <div className="flex items-center gap-1.5 text-sm" style={{ color: C.sub, fontFamily: MONO }}><Clock size={14} />{fmtTime(now)}</div>
        </header>

        <div className="p-6">
          {view === "dashboard" && Dashboard()}
          {view === "trend" && Trend()}
          {view === "recete" && Recete()}
          {view === "sera" && SeraParti()}
          {view === "tank" && TankCihaz()}
          {view === "dozlama" && Dozlama()}
          {view === "alarm" && Alarmlar()}
        </div>
      </main>

      {/* TOAST */}
      {toast && (
        <div className="fixed flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium" style={{ bottom: 20, right: 20, zIndex: 60, background: toast.ok ? C.side : C.red, color: "#fff", boxShadow: "0 12px 30px rgba(16,40,28,.3)" }}>
          {toast.ok ? <Check size={16} /> : <AlertTriangle size={16} />} {toast.msg}
        </div>
      )}

      {/* MODALLER */}
      {modal && <ModalRouter modal={modal} setModal={setModal} db={db} setEngine={setEngine} setToast={setToast} />}
    </div>
  );
}

/* ---------- tablo yardımcıları ---------- */
function Tbl({ head, children }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>{head.map((h, i) => (
            <th key={i} className="text-left text-xs font-semibold px-4 py-2.5" style={{ color: C.sub, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({ children, mono, bold, sub }) {
  return (
    <td className="px-4 py-2.5 text-sm" style={{ borderBottom: `1px solid ${C.line}`, color: sub ? C.sub : C.ink, fontFamily: mono ? MONO : SANS, fontWeight: bold ? 600 : 400, whiteSpace: "nowrap" }}>{children}</td>
  );
}
function Sel({ value, onChange, opts }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="px-3 py-1.5 rounded-lg border text-sm" style={inputStyle}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

/* ---------- modal yönlendirici ---------- */
function ModalRouter({ modal, setModal, db, setEngine, setToast }) {
  const [form, setForm] = useState(modal.form || {});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const close = () => setModal(null);
  const numInput = (k, step = "0.1") => <input type="number" step={step} className={inputCls} style={inputStyle} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} />;

  if (modal.type === "recete")
    return (
      <Modal title="Yeni Reçete" onClose={close} onSubmit={() => {
        if (!form.recete_kodu || !form.recete_ad) { setToast({ ok: false, msg: "Kod ve ad zorunlu" }); return; }
        setEngine((e) => ({ ...e, db: { ...e.db, recete: [...e.db.recete, { id: uid(), recete_kodu: form.recete_kodu, recete_ad: form.recete_ad, cesit: form.cesit || "", aciklama: form.aciklama || "" }] } }));
        setToast({ ok: true, msg: "Reçete eklendi" }); close();
      }}>
        <Field label="Reçete Kodu"><input className={inputCls} style={inputStyle} value={form.recete_kodu || ""} onChange={(e) => set("recete_kodu", e.target.value)} placeholder="RCT-..." /></Field>
        <Field label="Reçete Adı"><input className={inputCls} style={inputStyle} value={form.recete_ad || ""} onChange={(e) => set("recete_ad", e.target.value)} /></Field>
        <Field label="Çeşit"><input className={inputCls} style={inputStyle} value={form.cesit || ""} onChange={(e) => set("cesit", e.target.value)} /></Field>
        <Field label="Açıklama"><input className={inputCls} style={inputStyle} value={form.aciklama || ""} onChange={(e) => set("aciklama", e.target.value)} /></Field>
      </Modal>
    );

  if (modal.type === "evre" || modal.type === "evreEdit") {
    const edit = modal.type === "evreEdit";
    return (
      <Modal title={edit ? "Evre Hedeflerini Düzenle" : "Yeni Büyüme Evresi"} onClose={close} onSubmit={() => {
        const rec = {
          evre_kodu: form.evre_kodu, evre_ad: form.evre_ad, recete_id: +form.recete_id,
          ph_min: +form.ph_min, ph_max: +form.ph_max, ec_min: +form.ec_min, ec_max: +form.ec_max, sic_min: +form.sic_min, sic_max: +form.sic_max,
        };
        if (!rec.evre_kodu || !rec.evre_ad) { setToast({ ok: false, msg: "Kod ve ad zorunlu" }); return; }
        setEngine((e) => ({ ...e, db: { ...e.db, buyume_evresi: edit
          ? e.db.buyume_evresi.map((x) => x.id === form.id ? { ...x, ...rec } : x)
          : [...e.db.buyume_evresi, { id: uid(), ...rec }] } }));
        setToast({ ok: true, msg: edit ? "Evre güncellendi" : "Evre eklendi" }); close();
      }}>
        {!edit && <Field label="Reçete"><select className={inputCls} style={inputStyle} value={form.recete_id} onChange={(e) => set("recete_id", e.target.value)}>{db.recete.map((r) => <option key={r.id} value={r.id}>{r.recete_ad}</option>)}</select></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Evre Kodu"><input className={inputCls} style={inputStyle} value={form.evre_kodu || ""} onChange={(e) => set("evre_kodu", e.target.value)} placeholder="EVR-..." /></Field>
          <Field label="Evre Adı"><input className={inputCls} style={inputStyle} value={form.evre_ad || ""} onChange={(e) => set("evre_ad", e.target.value)} /></Field>
          <Field label="Hedef pH (min)">{numInput("ph_min", "0.1")}</Field>
          <Field label="Hedef pH (max)">{numInput("ph_max", "0.1")}</Field>
          <Field label="Hedef EC (min)">{numInput("ec_min", "0.1")}</Field>
          <Field label="Hedef EC (max)">{numInput("ec_max", "0.1")}</Field>
          <Field label="Sıcaklık (min)">{numInput("sic_min", "0.5")}</Field>
          <Field label="Sıcaklık (max)">{numInput("sic_max", "0.5")}</Field>
        </div>
      </Modal>
    );
  }

  if (modal.type === "parti") {
    const evreler = db.buyume_evresi.filter((e) => e.recete_id === +form.recete_id);
    return (
      <Modal title="Yeni Parti" onClose={close} onSubmit={() => {
        if (!form.parti_kodu || !form.recete_id || !form.sera_id) { setToast({ ok: false, msg: "Zorunlu alanları doldurun" }); return; }
        setEngine((e) => ({ ...e, db: { ...e.db, parti: [...e.db.parti, {
          id: uid(), parti_kodu: form.parti_kodu, recete_id: +form.recete_id, sera_id: +form.sera_id,
          aktif_evre_id: form.aktif_evre_id ? +form.aktif_evre_id : null,
          ekim_tarihi: form.ekim_tarihi || new Date().toISOString().slice(0, 10), durum: "AKTIF" }] } }));
        setToast({ ok: true, msg: "Parti eklendi" }); close();
      }}>
        <Field label="Parti Kodu"><input className={inputCls} style={inputStyle} value={form.parti_kodu || ""} onChange={(e) => set("parti_kodu", e.target.value)} placeholder="PRT-2026-..." /></Field>
        <Field label="Reçete"><select className={inputCls} style={inputStyle} value={form.recete_id || ""} onChange={(e) => { set("recete_id", e.target.value); set("aktif_evre_id", ""); }}><option value="">Seçin...</option>{db.recete.map((r) => <option key={r.id} value={r.id}>{r.recete_ad}</option>)}</select></Field>
        <Field label="Sera"><select className={inputCls} style={inputStyle} value={form.sera_id || ""} onChange={(e) => set("sera_id", e.target.value)}><option value="">Seçin...</option>{db.sera.map((s) => <option key={s.id} value={s.id}>{s.sera_ad}</option>)}</select></Field>
        <Field label="Aktif Evre"><select className={inputCls} style={inputStyle} value={form.aktif_evre_id || ""} onChange={(e) => set("aktif_evre_id", e.target.value)} disabled={!form.recete_id}><option value="">Seçin...</option>{evreler.map((e) => <option key={e.id} value={e.id}>{e.evre_ad}</option>)}</select></Field>
        <Field label="Ekim Tarihi"><input type="date" className={inputCls} style={inputStyle} value={form.ekim_tarihi || ""} onChange={(e) => set("ekim_tarihi", e.target.value)} /></Field>
      </Modal>
    );
  }
  return null;
}
