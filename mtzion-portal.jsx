import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbzBigKTzH5Gx61Opru8yhRma8LNyX8UnE7Hxy81vG0hCZFW6Xr1RSEkx1W_Srip53j1Pg/exec";
const USE_SHEETS = true;

// Contact frequency → overdue threshold in days
const FREQ_DAYS = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90 };
const FREQ_LABELS = { weekly: "Weekly", biweekly: "Bi-weekly", monthly: "Monthly", quarterly: "Quarterly" };
const DEFAULT_FREQ = "monthly";

// ─── COLORS ────────────────────────────────────────────────────────────────
const C = {
  navy:      "#1B3A5C",
  navyDark:  "#0D2238",
  navyLight: "#2A5080",
  green:     "#16A34A",
  greenBg:   "#F0FDF4",
  amber:     "#D97706",
  amberBg:   "#FFFBEB",
  red:       "#DC2626",
  redBg:     "#FEF2F2",
  purple:    "#7C3AED",
  purpleBg:  "#F5F3FF",
  gray:      "#6B7280",
  grayLight: "#F3F4F6",
  white:     "#FFFFFF",
  border:    "#E5E7EB",
};

// ─── HELPERS ───────────────────────────────────────────────────────────────
function daysSince(dateStr) {
  if (!dateStr) return 9999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function statusFor(lastContact, frequency) {
  const threshold = FREQ_DAYS[frequency] || FREQ_DAYS[DEFAULT_FREQ];
  const warn = Math.floor(threshold * 0.6);
  const d = daysSince(lastContact);
  if (d === 9999)      return { dot: C.red,   bg: C.redBg,   label: "Overdue",  text: "Never contacted" };
  if (d > threshold)   return { dot: C.red,   bg: C.redBg,   label: "Overdue",  text: `${d}d ago` };
  if (d > warn)        return { dot: C.amber, bg: C.amberBg, label: "Due soon", text: `${d}d ago` };
  return                      { dot: C.green, bg: C.greenBg, label: "Current",  text: d === 0 ? "Today" : `${d}d ago` };
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function todayISO() { return new Date().toISOString().split("T")[0]; }

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const CONTACT_TYPES = [
  { id: "visitation", label: "Visitation", icon: "🏠", desc: "Home, hospital, or facility visit" },
  { id: "communion",  label: "Communion",  icon: "✝️", desc: "Sacrament of communion" },
  { id: "phone_call", label: "Phone Call", icon: "📞", desc: "Phone check-in" },
];

const GROUP_TYPES = [
  { id: "mens",   label: "Men's Group",   icon: "👔" },
  { id: "womens", label: "Women's Group", icon: "👗" },
];

// ─── MOUNTAIN LOGO (SVG inline) ─────────────────────────────────────────────
const LOGO = "data:image/png;base64,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";

// ─── SHEETS API ─────────────────────────────────────────────────────────────
async function sheetsGet() {
  const res = await fetch(SHEETS_URL + "?action=read", { redirect: "follow" });
  return res.json();
}

async function sheetsPost(payload) {
  const res = await fetch(SHEETS_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// ─── DEMO DATA ──────────────────────────────────────────────────────────────
const DEMO_TEAM = [
  { id:"t1", name:"Deacon John Edgar",         role:"chairman",  available:"Yes" },
  { id:"t2", name:"Deacon Marcus Thompson",     role:"deacon",    available:"Yes" },
  { id:"t3", name:"Deaconess Patricia Lewis",   role:"deaconess", available:"Yes" },
  { id:"t4", name:"Deacon Robert Williams",     role:"deacon",    available:"Yes" },
  { id:"t5", name:"Deaconess Sandra Johnson",   role:"deaconess", available:"Yes" },
];

const DEMO_RECIPIENTS = [
  { id:"r1", name:"Sister Mary Jackson",   assignedTo:"t2", frequency:"monthly",   lastContact:"2025-09-10", lastContactType:"visitation", notes:"Recovering from hip surgery", phone:"", address:"" },
  { id:"r2", name:"Brother James Carter",  assignedTo:"t2", frequency:"monthly",   lastContact:"2025-10-01", lastContactType:"phone_call",  notes:"",                           phone:"", address:"" },
  { id:"r3", name:"Sister Ruth Anderson",  assignedTo:"t3", frequency:"weekly",    lastContact:"2025-08-15", lastContactType:"communion",   notes:"Homebound, prefers mornings", phone:"", address:"" },
  { id:"r4", name:"Brother Samuel Davis",  assignedTo:"t3", frequency:"monthly",   lastContact:"",           lastContactType:"",            notes:"New to care list",            phone:"", address:"" },
  { id:"r5", name:"Sister Dorothy Wilson", assignedTo:"t4", frequency:"biweekly",  lastContact:"2025-10-10", lastContactType:"phone_call",  notes:"",                           phone:"", address:"" },
  { id:"r6", name:"Brother Charles Moore", assignedTo:"t4", frequency:"quarterly", lastContact:"2025-07-22", lastContactType:"visitation",  notes:"Extended care needed",        phone:"", address:"" },
  { id:"r7", name:"Sister Helen Taylor",   assignedTo:"t5", frequency:"monthly",   lastContact:"2025-09-28", lastContactType:"communion",   notes:"",                           phone:"", address:"" },
  { id:"r8", name:"Brother Frank Harris",  assignedTo:"",   frequency:"monthly",   lastContact:"",           lastContactType:"",            notes:"Hospital — Room 214",         phone:"", address:"" },
];

const DEMO_LOG = [];

// ─── SUBCOMPONENTS ──────────────────────────────────────────────────────────
function StatusDot({ lastContact, frequency, size = 12 }) {
  const s = statusFor(lastContact, frequency);
  return <span style={{ display:"inline-block", width:size, height:size, borderRadius:"50%", background:s.dot, flexShrink:0 }} />;
}

function ContactTypeBadge({ type }) {
  const t = CONTACT_TYPES.find(c => c.id === type);
  if (!t) return null;
  return <span style={{ fontSize:12, color:C.gray }}>{t.icon} {t.label}</span>;
}

function FreqBadge({ frequency }) {
  const label = FREQ_LABELS[frequency];
  if (!label) return null;
  return (
    <span style={{ fontSize:10, fontWeight:700, color:C.navy, background:"#DBEAFE", borderRadius:4, padding:"1px 5px", textTransform:"uppercase", letterSpacing:0.4 }}>
      {label}
    </span>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────────────────────
export default function App() {
  const [screen,      setScreen]     = useState("login");
  const [user,        setUser]       = useState(null);
  const [loginStep,   setLoginStep]  = useState("select"); // "select" | "pin"
  const [loginMember, setLoginMember]= useState(null);
  const [pinInput,    setPinInput]   = useState("");
  const [pinError,    setPinError]   = useState(false);
  const [team,        setTeam]       = useState([]);
  const [people,      setPeople]     = useState([]);
  const [logEntries,  setLogEntries] = useState([]);
  const [loading,     setLoading]    = useState(false);
  const [synced,      setSynced]     = useState(false);
  const [syncErr,     setSyncErr]    = useState(false);

  // View filter: "all" | "mine" | "unassigned"
  const [view,        setView]       = useState("all");
  const [expanded,    setExpanded]   = useState(null);

  // Log contact state
  const [logPerson,   setLogPerson]  = useState(null);
  const [logType,     setLogType]    = useState("");
  const [logNote,     setLogNote]    = useState("");
  const [logIsGroup,  setLogIsGroup] = useState(false);
  const [logGroupType,setLogGroupType] = useState("");
  const [logSaving,   setLogSaving]  = useState(false);
  const [logSaveMsg,  setLogSaveMsg] = useState("");

  // Frequency setter (chairman only)
  const [freqSaving,  setFreqSaving] = useState(null); // id of person being saved

  // Report state
  const now = new Date();
  const [repYear,  setRepYear]  = useState(now.getFullYear());
  const [repMonth, setRepMonth] = useState(now.getMonth()); // 0-indexed

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setSyncErr(false);
    if (!USE_SHEETS) {
      setTeam(DEMO_TEAM);
      setPeople(DEMO_RECIPIENTS);
      setLogEntries(DEMO_LOG);
      setSynced(false);
      setLoading(false);
      return;
    }
    try {
      const data = await sheetsGet();
      const t = (data.Team        || data.team        || []).map(normalizeTeam);
      const r = (data.Recipients  || data.recipients  || []).map(normalizeRecipient);
      const l = (data.ContactLog  || data.contactLog  || []).map(normalizeLogEntry);
      setTeam(t.length ? t : DEMO_TEAM);
      setPeople(r.length ? r : DEMO_RECIPIENTS);
      setLogEntries(l);
      setSynced(true);
    } catch {
      setTeam(DEMO_TEAM);
      setPeople(DEMO_RECIPIENTS);
      setLogEntries(DEMO_LOG);
      setSyncErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function normalizeTeam(row) {
    const r = k => {
      const v = row[k] ?? row[k.charAt(0).toUpperCase()+k.slice(1)] ?? "";
      return v === null || v === false ? "" : String(v).trim();
    };
    return {
      id:        r("id"),
      name:      r("name"),
      role:      r("role").toLowerCase() || "deacon",
      available: r("available") || "Yes",
      pin:       r("pin"),
    };
  }

  function normalizeRecipient(row) {
    const r = k => {
      const v = row[k] ?? row[k.charAt(0).toUpperCase()+k.slice(1)] ?? "";
      return v === null || v === false ? "" : String(v).trim();
    };
    // Support both "firstName"+"lastName" (original schema) and "name" (new schema)
    const firstName = r("firstName");
    const lastName  = r("lastName");
    let name = r("name");
    if (!name && (firstName || lastName)) {
      name = [firstName, lastName].filter(Boolean).join(" ");
    }
    // Support both "cellPhone"/"homePhone" (original) and "phone" (new)
    const phone = r("cellPhone") || r("homePhone") || r("phone");

    return {
      id:              r("id"),
      name,
      title:           r("title"),
      phone,
      homePhone:       r("homePhone"),
      address:         r("address"),
      notes:           r("notes"),
      assignedTo:      r("assignedTo"),
      frequency:       r("frequency") || DEFAULT_FREQ,
      lastContact:     r("lastContact"),
      lastContactType: r("lastContactType"),
      lat:             row.lat  ?? row.Lat  ?? null,
      lng:             row.lng  ?? row.Lng  ?? null,
      status:          r("status") || "active",
    };
  }

  function normalizeLogEntry(row) {
    const r = k => String(row[k] || row[k.charAt(0).toUpperCase()+k.slice(1)] || "");
    return {
      id:            r("id"),
      date:          r("date"),
      recipientId:   r("recipientId"),
      recipientName: r("recipientName"),
      caregiverId:   r("caregiverId"),
      caregiverName: r("caregiverName"),
      type:          r("type"),
      note:          r("note"),
      isGroup:       row.isGroup === true || r("isGroup") === "true",
      groupType:     r("groupType"),
    };
  }

  // ── Login / logout ─────────────────────────────────────────────────────────
  function handleSelectMember(member) {
    setLoginMember(member);
    setPinInput("");
    setPinError(false);
    setLoginStep("pin");
  }

  function handlePinSubmit() {
    const correct = loginMember.pin ? String(loginMember.pin) : "1234";
    if (pinInput === correct) {
      setUser(loginMember);
      setView("all");
      setExpanded(null);
      setLoginStep("select");
      setLoginMember(null);
      setPinInput("");
      setScreen("home");
    } else {
      setPinError(true);
      setPinInput("");
    }
  }

  function handleLogin(member) {
    setUser(member);
    setView("all");
    setExpanded(null);
    setScreen("home");
  }

  function handleLogout() {
    setUser(null);
    setLoginStep("select");
    setLoginMember(null);
    setPinInput("");
    setPinError(false);
    setScreen("login");
    setExpanded(null);
  }

  // ── Filtered people list ───────────────────────────────────────────────────
  function filteredPeople() {
    let list = [...people];
    if (view === "mine")       list = list.filter(p => p.assignedTo === user?.id);
    if (view === "unassigned") list = list.filter(p => !p.assignedTo);
    // Sort: overdue/never-contacted first, then by days since contact (most overdue on top)
    return list.sort((a, b) => daysSince(b.lastContact) - daysSince(a.lastContact));
  }

  function caregiverName(assignedTo) {
    const m = team.find(t => t.id === assignedTo);
    return m ? m.name : "";
  }

  // ── Log contact ────────────────────────────────────────────────────────────
  function openLog(person) {
    setLogPerson(person);
    setLogType("");
    setLogNote("");
    setLogIsGroup(false);
    setLogGroupType("");
    setLogSaveMsg("");
    setExpanded(null);
    setScreen("log");
  }

  async function saveContact() {
    if (!logType) return;
    setLogSaving(true);
    const today = todayISO();
    const logId = "log_" + Date.now();

    const newEntry = {
      id:            logId,
      date:          today,
      recipientId:   logPerson.id,
      recipientName: logPerson.name,
      caregiverId:   user.id,
      caregiverName: user.name,
      type:          logType,
      note:          logNote,
      isGroup:       logIsGroup,
      groupType:     logIsGroup ? logGroupType : "",
    };

    // Optimistic UI
    setPeople(prev => prev.map(p =>
      p.id === logPerson.id ? { ...p, lastContact: today, lastContactType: logType } : p
    ));
    setLogEntries(prev => [newEntry, ...prev]);

    if (USE_SHEETS) {
      try {
        const noteText = logNote
          ? (logPerson.notes ? `${logPerson.notes} | ${today}: ${logNote}` : `${today}: ${logNote}`)
          : logPerson.notes;
        await sheetsPost({
          action:        "logContact",
          recipientId:   logPerson.id,
          lastContact:   today,
          lastContactType: logType,
          notes:         noteText,
          log:           newEntry,
        });
        setLogSaveMsg("saved");
      } catch {
        setLogSaveMsg("offline");
      }
    } else {
      setLogSaveMsg("saved");
    }

    setLogSaving(false);
    setTimeout(() => { setScreen("home"); setLogPerson(null); }, 1100);
  }

  // ── Frequency update (chairman) ────────────────────────────────────────────
  async function setFrequency(person, freq) {
    setFreqSaving(person.id);
    setPeople(prev => prev.map(p => p.id === person.id ? { ...p, frequency: freq } : p));
    if (USE_SHEETS) {
      try {
        await sheetsPost({ action: "updateRecipient", id: person.id, frequency: freq });
      } catch { /* silent — optimistic update kept */ }
    }
    setFreqSaving(null);
  }

  // ─── REPORT NAVIGATION ─────────────────────────────────────────────────────
  function prevMonth() {
    if (repMonth === 0) { setRepMonth(11); setRepYear(y => y - 1); }
    else setRepMonth(m => m - 1);
  }
  function nextMonth() {
    const n = new Date();
    if (repYear === n.getFullYear() && repMonth === n.getMonth()) return; // can't go future
    if (repMonth === 11) { setRepMonth(0); setRepYear(y => y + 1); }
    else setRepMonth(m => m + 1);
  }

  function reportEntries() {
    const monthStr = `${repYear}-${String(repMonth + 1).padStart(2, "0")}`;
    let entries = logEntries.filter(e => e.date.startsWith(monthStr));
    // For non-chairman: only show their own entries
    if (user?.role !== "chairman") entries = entries.filter(e => e.caregiverId === user?.id);
    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === "login") {
    const available = team.filter(m => m.available !== "No");

    // ── Step 2: PIN entry ──────────────────────────────────────────────────
    if (loginStep === "pin" && loginMember) {
      return (
        <div style={{ minHeight:"100vh", background:C.navyDark, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 16px", fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
          <div style={{ width:"100%", maxWidth:400 }}>
            <div style={{ textAlign:"center", marginBottom:32 }}>
              <img src={LOGO} alt="Mt. Zion" style={{ width:80, height:80, marginBottom:12, borderRadius:"50%" }} />
              <div style={{ color:C.white, fontSize:22, fontWeight:700 }}>Mt. Zion Care Ministry</div>
              <div style={{ color:"#94A3B8", fontSize:13, marginTop:4 }}>Ontario & Ontario Ranch</div>
            </div>
            <div style={{ background:C.white, borderRadius:16, padding:"24px 20px", boxShadow:"0 8px 32px rgba(0,0,0,0.3)" }}>
              {/* Who is logging in */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, paddingBottom:16, borderBottom:"1px solid "+C.border }}>
                <div style={{ width:44, height:44, borderRadius:"50%", background:C.navy, color:C.white, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:15, flexShrink:0 }}>
                  {loginMember.name.split(" ").map(w=>w[0]).slice(0,2).join("")}
                </div>
                <div>
                  <div style={{ fontWeight:700, color:C.navyDark, fontSize:16 }}>{loginMember.name}</div>
                  <div style={{ fontSize:12, color:C.gray, textTransform:"capitalize" }}>{loginMember.role}</div>
                </div>
              </div>

              <div style={{ fontSize:15, fontWeight:700, color:C.navyDark, marginBottom:4 }}>Enter your PIN</div>
              <div style={{ fontSize:13, color:C.gray, marginBottom:14 }}>4-digit access code</div>

              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinInput}
                onChange={e => { setPinInput(e.target.value.replace(/\D/g,"")); setPinError(false); }}
                onKeyDown={e => e.key === "Enter" && pinInput.length === 4 && handlePinSubmit()}
                autoFocus
                placeholder="••••"
                style={{ width:"100%", border:"2px solid "+(pinError?C.red:C.border), borderRadius:10, padding:"14px 16px", fontSize:28, textAlign:"center", letterSpacing:12, outline:"none", boxSizing:"border-box", fontFamily:"monospace" }}
              />

              {pinError && (
                <div style={{ color:C.red, fontSize:13, textAlign:"center", marginTop:8, fontWeight:600 }}>
                  Incorrect PIN. Try again.
                </div>
              )}

              <button onClick={handlePinSubmit} disabled={pinInput.length < 4}
                style={{ width:"100%", marginTop:14, background:pinInput.length===4?C.navy:"#CBD5E1", color:C.white, border:"none", borderRadius:10, padding:"14px", fontSize:16, fontWeight:700, cursor:pinInput.length===4?"pointer":"not-allowed" }}>
                Sign In
              </button>

              <button onClick={() => { setLoginStep("select"); setLoginMember(null); setPinError(false); setPinInput(""); }}
                style={{ width:"100%", marginTop:10, background:"transparent", border:"none", color:C.gray, fontSize:13, cursor:"pointer", padding:"8px" }}>
                ← Back
              </button>
            </div>
            <div style={{ textAlign:"center", marginTop:14, fontSize:11, color:"#475569" }}>
              Contact Deacon Edgar if you need your PIN reset
            </div>
          </div>
        </div>
      );
    }

    // ── Step 1: Select name ────────────────────────────────────────────────
    return (
      <div style={{ minHeight:"100vh", background:C.navyDark, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 16px", fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div style={{ width:"100%", maxWidth:400 }}>
          <div style={{ textAlign:"center", marginBottom:32 }}>
            <img src={LOGO} alt="Mt. Zion" style={{ width:80, height:80, marginBottom:12, borderRadius:"50%" }} />
            <div style={{ color:C.white, fontSize:22, fontWeight:700 }}>Mt. Zion Care Ministry</div>
            <div style={{ color:"#94A3B8", fontSize:13, marginTop:4 }}>Ontario & Ontario Ranch</div>
          </div>
          <div style={{ background:C.white, borderRadius:16, padding:"24px 20px", boxShadow:"0 8px 32px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize:17, fontWeight:700, color:C.navyDark, marginBottom:4 }}>Who are you?</div>
            <div style={{ fontSize:13, color:C.gray, marginBottom:16 }}>Select your name to continue</div>
            {loading ? (
              <div style={{ textAlign:"center", padding:24, color:C.gray }}>Loading team…</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {available.map(m => (
                  <button key={m.id} onClick={() => handleSelectMember(m)}
                    style={{ background:C.grayLight, border:"1.5px solid "+C.border, borderRadius:10, padding:"12px 16px", textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:"50%", background:C.navy, color:C.white, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:14, flexShrink:0 }}>
                      {m.name.split(" ").map(w => w[0]).slice(0,2).join("")}
                    </div>
                    <div>
                      <div style={{ fontWeight:600, color:C.navyDark, fontSize:15 }}>{m.name}</div>
                      <div style={{ fontSize:12, color:C.gray, textTransform:"capitalize", marginTop:1 }}>{m.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {syncErr && <div style={{ marginTop:12, fontSize:12, color:C.amber, textAlign:"center" }}>⚠️ Could not reach live data. Showing demo names.</div>}
          </div>
          <div style={{ textAlign:"center", marginTop:16, fontSize:11, color:"#64748B" }}>Secure access — PIN required after selection</div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOG CONTACT
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === "log" && logPerson) {
    return (
      <div style={{ minHeight:"100vh", background:C.grayLight, display:"flex", flexDirection:"column", fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div style={{ background:C.navy, padding:"16px 20px", display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => setScreen("home")} style={{ background:"transparent", border:"none", color:C.white, fontSize:24, cursor:"pointer", padding:0, lineHeight:1 }}>←</button>
          <div style={{ color:C.white, fontWeight:700, fontSize:17 }}>Log Contact</div>
        </div>

        <div style={{ padding:"20px 16px", display:"flex", flexDirection:"column", gap:14, maxWidth:500, width:"100%", margin:"0 auto" }}>
          {/* Person card */}
          <div style={{ background:C.white, borderRadius:12, padding:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <StatusDot lastContact={logPerson.lastContact} frequency={logPerson.frequency} size={14} />
              <div style={{ fontWeight:700, fontSize:18, color:C.navyDark }}>{logPerson.name}</div>
            </div>
            <div style={{ fontSize:13, color:C.gray }}>
              Last: {fmtDate(logPerson.lastContact)}
              {logPerson.lastContactType && <> · <ContactTypeBadge type={logPerson.lastContactType} /></>}
            </div>
            {logPerson.notes && (
              <div style={{ marginTop:8, fontSize:13, color:C.navy, background:"#EFF6FF", borderRadius:6, padding:"6px 10px" }}>📋 {logPerson.notes}</div>
            )}
            {logPerson.phone && (
              <a href={`tel:${logPerson.phone}`} style={{ display:"block", marginTop:8, fontSize:14, color:C.navy, fontWeight:600, textDecoration:"none" }}>📞 {logPerson.phone}</a>
            )}
          </div>

          {/* Contact type */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:C.gray, marginBottom:8, textTransform:"uppercase", letterSpacing:0.8 }}>Type of Contact</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {CONTACT_TYPES.map(t => (
                <button key={t.id} onClick={() => setLogType(t.id)}
                  style={{ background:logType===t.id?C.navy:C.white, border:"2px solid "+(logType===t.id?C.navy:C.border), borderRadius:10, padding:"13px 16px", textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontSize:24 }}>{t.icon}</span>
                  <div>
                    <div style={{ fontWeight:600, fontSize:15, color:logType===t.id?C.white:C.navyDark }}>{t.label}</div>
                    <div style={{ fontSize:12, color:logType===t.id?"#93C5FD":C.gray, marginTop:1 }}>{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Group visit */}
          <div style={{ background:C.white, borderRadius:10, padding:"14px 16px" }}>
            <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
              <input type="checkbox" checked={logIsGroup} onChange={e => { setLogIsGroup(e.target.checked); if (!e.target.checked) setLogGroupType(""); }}
                style={{ width:18, height:18, cursor:"pointer" }} />
              <div>
                <div style={{ fontWeight:600, fontSize:15, color:C.navyDark }}>Group Visit</div>
                <div style={{ fontSize:12, color:C.gray, marginTop:1 }}>Multiple deacons/deaconesses attended</div>
              </div>
            </label>
            {logIsGroup && (
              <div style={{ display:"flex", gap:8, marginTop:12, paddingTop:12, borderTop:"1px solid "+C.border }}>
                {GROUP_TYPES.map(g => (
                  <button key={g.id} onClick={() => setLogGroupType(g.id)}
                    style={{ flex:1, background:logGroupType===g.id?C.navy:C.grayLight, border:"2px solid "+(logGroupType===g.id?C.navy:C.border), borderRadius:8, padding:"10px 8px", cursor:"pointer", textAlign:"center" }}>
                    <div style={{ fontSize:20 }}>{g.icon}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:logGroupType===g.id?C.white:C.navyDark, marginTop:4 }}>{g.label}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:C.gray, marginBottom:8, textTransform:"uppercase", letterSpacing:0.8 }}>Note (optional)</div>
            <textarea value={logNote} onChange={e => setLogNote(e.target.value)}
              placeholder="How did it go? Prayer requests?" rows={3}
              style={{ width:"100%", border:"1.5px solid "+C.border, borderRadius:10, padding:"10px 12px", fontSize:15, fontFamily:"inherit", resize:"none", outline:"none", boxSizing:"border-box" }} />
          </div>

          {/* Save */}
          {logSaveMsg ? (
            <div style={{ textAlign:"center", padding:16, borderRadius:10, background:logSaveMsg==="saved"?C.greenBg:C.amberBg, color:logSaveMsg==="saved"?C.green:C.amber, fontSize:16, fontWeight:600 }}>
              {logSaveMsg === "saved" ? "✅ Contact logged!" : "⚠️ Saved locally — sync when online."}
            </div>
          ) : (
            <button onClick={saveContact} disabled={!logType || logSaving}
              style={{ background:logType?C.navy:"#CBD5E1", color:C.white, border:"none", borderRadius:12, padding:"16px", fontSize:17, fontWeight:700, cursor:logType?"pointer":"not-allowed" }}>
              {logSaving ? "Saving…" : "Save Contact"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === "report") {
    const entries = reportEntries();
    const counts  = { visitation:0, communion:0, phone_call:0 };
    entries.forEach(e => { if (counts[e.type] !== undefined) counts[e.type]++; });
    const isCurrentMonth = repYear === now.getFullYear() && repMonth === now.getMonth();

    return (
      <div style={{ minHeight:"100vh", background:C.grayLight, display:"flex", flexDirection:"column", fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div style={{ background:C.navy, padding:"16px 20px", display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => setScreen("home")} style={{ background:"transparent", border:"none", color:C.white, fontSize:24, cursor:"pointer", padding:0, lineHeight:1 }}>←</button>
          <div style={{ color:C.white, fontWeight:700, fontSize:17, flex:1 }}>Monthly Report</div>
          {user?.role === "chairman" && <div style={{ color:"#94A3B8", fontSize:12 }}>All ministry activity</div>}
        </div>

        <div style={{ padding:"16px", maxWidth:600, width:"100%", margin:"0 auto" }}>
          {/* Month navigation */}
          <div style={{ background:C.white, borderRadius:12, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, boxShadow:"0 1px 3px rgba(0,0,0,0.07)" }}>
            <button onClick={prevMonth} style={{ background:C.grayLight, border:"none", borderRadius:8, padding:"8px 14px", fontSize:18, cursor:"pointer" }}>‹</button>
            <div style={{ fontWeight:700, fontSize:16, color:C.navyDark }}>{monthLabel(repYear, repMonth)}</div>
            <button onClick={nextMonth} disabled={isCurrentMonth}
              style={{ background:isCurrentMonth?"#F1F5F9":C.grayLight, border:"none", borderRadius:8, padding:"8px 14px", fontSize:18, cursor:isCurrentMonth?"default":"pointer", opacity:isCurrentMonth?0.4:1 }}>›</button>
          </div>

          {/* Summary tiles */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
            {[
              { label:"Visits",      count:counts.visitation, icon:"🏠", color:C.navy },
              { label:"Communion",   count:counts.communion,  icon:"✝️", color:C.purple },
              { label:"Phone Calls", count:counts.phone_call, icon:"📞", color:C.green },
            ].map(t => (
              <div key={t.label} style={{ background:C.white, borderRadius:10, padding:"12px 8px", textAlign:"center", boxShadow:"0 1px 3px rgba(0,0,0,0.07)" }}>
                <div style={{ fontSize:22 }}>{t.icon}</div>
                <div style={{ fontSize:26, fontWeight:800, color:t.color, lineHeight:1.1 }}>{t.count}</div>
                <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Entry list */}
          {entries.length === 0 ? (
            <div style={{ background:C.white, borderRadius:12, padding:32, textAlign:"center", color:C.gray }}>
              <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
              <div style={{ fontWeight:600, fontSize:15 }}>No contacts logged this month</div>
              <div style={{ fontSize:13, marginTop:6 }}>Contacts appear here as team members log them</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {entries.map(e => {
                const ct = CONTACT_TYPES.find(c => c.id === e.type);
                const gt = GROUP_TYPES.find(g => g.id === e.groupType);
                return (
                  <div key={e.id} style={{ background:C.white, borderRadius:10, padding:"13px 16px", boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:15, color:C.navyDark }}>{e.recipientName}</div>
                        <div style={{ fontSize:12, color:C.gray, marginTop:2 }}>
                          {ct?.icon} {ct?.label}
                          {e.isGroup && gt && <span style={{ marginLeft:6 }}>{gt.icon} {gt.label}</span>}
                          {e.isGroup && !gt && <span style={{ marginLeft:6 }}>👥 Group Visit</span>}
                        </div>
                        {user?.role === "chairman" && (
                          <div style={{ fontSize:11, color:C.navyLight, marginTop:2 }}>👤 {e.caregiverName}</div>
                        )}
                        {e.note && <div style={{ fontSize:12, color:C.gray, marginTop:4, fontStyle:"italic" }}>{e.note}</div>}
                      </div>
                      <div style={{ fontSize:12, color:C.gray, whiteSpace:"nowrap", marginTop:2 }}>{fmtDate(e.date)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ height:24 }} />
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOME
  // ═══════════════════════════════════════════════════════════════════════════
  const list      = filteredPeople();
  const overdue   = list.filter(p => daysSince(p.lastContact) > (FREQ_DAYS[p.frequency] || 30));
  const isChair   = user?.role === "chairman";

  // View tabs depend on role
  const viewTabs = isChair
    ? [{ id:"all", label:"All" }, { id:"unassigned", label:"Unassigned" }]
    : [{ id:"all", label:"All" }, { id:"mine", label:"My People" }];

  return (
    <div style={{ minHeight:"100vh", background:C.grayLight, display:"flex", flexDirection:"column", fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background:C.navy, padding:"14px 16px 10px" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <div style={{ color:C.white, fontWeight:700, fontSize:18 }}>Care Ministry</div>
            <div style={{ color:"#94A3B8", fontSize:13, marginTop:1 }}>{user?.name}</div>
          </div>
          <div style={{ display:"flex", gap:7 }}>
            <button onClick={() => setScreen("report")} title="Monthly Report"
              style={{ background:"rgba(255,255,255,0.15)", border:"none", color:C.white, borderRadius:8, padding:"6px 10px", fontSize:13, cursor:"pointer" }}>
              📊
            </button>
            <button onClick={loadData} title="Refresh"
              style={{ background:"rgba(255,255,255,0.15)", border:"none", color:C.white, borderRadius:8, padding:"6px 10px", fontSize:14, cursor:"pointer" }}>
              ↻
            </button>
            <button onClick={handleLogout}
              style={{ background:"rgba(255,255,255,0.15)", border:"none", color:C.white, borderRadius:8, padding:"6px 10px", fontSize:13, cursor:"pointer" }}>
              Out
            </button>
          </div>
        </div>
        <div style={{ marginTop:7, fontSize:12, color:loading?"#94A3B8":syncErr?"#FCA5A5":"#6EE7B7" }}>
          {loading ? "⏳ Loading…" : syncErr ? "⚠️ Could not sync — showing last data" : synced ? "🟢 Live — synced with Google Sheets" : "🔵 Demo mode"}
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ background:C.white, borderBottom:"1px solid "+C.border, padding:"11px 20px", display:"flex", gap:20 }}>
        {[
          { num: people.length, label: "Total on List" },
          { num: overdue.length, label: "Overdue", color: overdue.length ? C.red : C.navyDark },
          { num: people.length - overdue.length, label: "Current" },
        ].map((s, i) => (
          <div key={i} style={{ textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:800, color:s.color||C.navyDark, lineHeight:1 }}>{s.num}</div>
            <div style={{ fontSize:10, color:C.gray, textTransform:"uppercase", letterSpacing:0.5, marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* View filter tabs */}
      <div style={{ background:C.white, borderBottom:"1px solid "+C.border, padding:"10px 16px 0", display:"flex", gap:4 }}>
        {viewTabs.map(tab => (
          <button key={tab.id} onClick={() => { setView(tab.id); setExpanded(null); }}
            style={{ background:"transparent", border:"none", cursor:"pointer", padding:"6px 14px 10px", fontSize:14, fontWeight:view===tab.id?700:400, color:view===tab.id?C.navy:C.gray, borderBottom:`2.5px solid ${view===tab.id?C.navy:"transparent"}`, borderRadius:0 }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex:1, padding:"14px 16px", display:"flex", flexDirection:"column", gap:9, maxWidth:600, width:"100%", margin:"0 auto", boxSizing:"border-box" }}>
        {loading && list.length === 0 && (
          <div style={{ textAlign:"center", padding:48, color:C.gray }}>Loading care list…</div>
        )}
        {!loading && list.length === 0 && view === "unassigned" && (
          <div style={{ textAlign:"center", padding:40, background:C.white, borderRadius:12, color:C.gray }}>
            <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
            <div style={{ fontWeight:600 }}>Everyone is assigned</div>
            <div style={{ fontSize:13, marginTop:4 }}>All care recipients have a caregiver</div>
          </div>
        )}
        {!loading && list.length === 0 && view !== "unassigned" && (
          <div style={{ textAlign:"center", padding:40, color:C.gray }}>No people to show.</div>
        )}

        {list.map(person => {
          const s      = statusFor(person.lastContact, person.frequency);
          const isOpen = expanded === person.id;
          const caregiver = caregiverName(person.assignedTo);

          return (
            <div key={person.id} style={{ background:C.white, borderRadius:12, overflow:"hidden", border:"1.5px solid "+(isOpen?C.navy:C.border), boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
              {/* Row */}
              <div onClick={() => setExpanded(isOpen ? null : person.id)}
                style={{ padding:"13px 16px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", userSelect:"none" }}>
                <StatusDot lastContact={person.lastContact} frequency={person.frequency} size={13} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:15, color:C.navyDark, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {person.title && <span style={{ fontSize:11, color:C.navyLight, fontWeight:500, marginRight:4 }}>{person.title}</span>}
                    {person.name}
                  </div>
                  <div style={{ fontSize:12, color:C.gray, marginTop:2, display:"flex", gap:5, flexWrap:"wrap", alignItems:"center" }}>
                    <span>{s.text}</span>
                    {person.lastContactType && <><span style={{ opacity:0.3 }}>·</span><ContactTypeBadge type={person.lastContactType} /></>}
                  </div>
                  <div style={{ fontSize:11, marginTop:3, display:"flex", gap:6, alignItems:"center" }}>
                    <FreqBadge frequency={person.frequency} />
                    {isChair && caregiver && <span style={{ color:C.navyLight }}>👤 {caregiver}</span>}
                    {isChair && !caregiver && <span style={{ color:C.amber, fontWeight:600 }}>⚠ Unassigned</span>}
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:7, flexShrink:0 }}>
                  {s.label === "Overdue" && (
                    <span style={{ background:C.redBg, color:C.red, borderRadius:5, padding:"2px 6px", fontSize:10, fontWeight:700 }}>Overdue</span>
                  )}
                  <span style={{ color:C.gray, fontSize:20, display:"inline-block", transform:isOpen?"rotate(90deg)":"none", transition:"transform 0.15s" }}>›</span>
                </div>
              </div>

              {/* Expanded */}
              {isOpen && (
                <div style={{ borderTop:"1px solid "+C.border, padding:"12px 16px 16px", background:"#F8FAFC" }}>
                  {person.phone && (
                    <a href={`tel:${person.phone}`} style={{ display:"inline-flex", alignItems:"center", gap:6, color:C.navy, fontWeight:600, fontSize:14, textDecoration:"none", marginBottom:8 }}>
                      📞 {person.phone}
                    </a>
                  )}
                  {person.address && (
                    <div style={{ fontSize:13, color:C.gray, marginBottom:8 }}>📍 {person.address}</div>
                  )}
                  {person.notes && (
                    <div style={{ fontSize:13, color:C.navy, background:"#EFF6FF", borderRadius:6, padding:"7px 10px", marginBottom:10, lineHeight:1.4 }}>📋 {person.notes}</div>
                  )}

                  {/* Frequency setter — chairman only */}
                  {isChair && (
                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.gray, textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>Contact Frequency</div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {Object.entries(FREQ_LABELS).map(([freq, label]) => (
                          <button key={freq} disabled={freqSaving === person.id} onClick={() => setFrequency(person, freq)}
                            style={{ background:person.frequency===freq?C.navy:C.grayLight, color:person.frequency===freq?C.white:C.navyDark, border:"1.5px solid "+(person.frequency===freq?C.navy:C.border), borderRadius:6, padding:"5px 10px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={() => openLog(person)}
                    style={{ width:"100%", background:C.navy, color:C.white, border:"none", borderRadius:10, padding:"14px", fontSize:15, fontWeight:700, cursor:"pointer" }}>
                    + Log Contact
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div style={{ height:16 }} />
      </div>
    </div>
  );
}
