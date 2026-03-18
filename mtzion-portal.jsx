import { useState, useEffect, useCallback } from "react";

// ── GOOGLE SHEETS CONFIG ──────────────────────────────────────────────
// Paste your Google Apps Script Web App URL below after deploying it.
// Instructions are in SETUP-GUIDE.md
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbykoAim3lv9YuThzigLHmjtbvshl9r2j6h0-azMyyeYxKkyi9bHQLaQ5ONuQ502vu17Ig/exec";
const USE_SHEETS = SHEETS_URL !== "PASTE_YOUR_APPS_SCRIPT_URL_HERE";

async function sheetsRead() {
  const res = await fetch(`${SHEETS_URL}?action=read`, { redirect:"follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function sheetsWrite(action, payload) {
  await fetch(SHEETS_URL, {
    method:"POST", redirect:"follow",
    headers:{"Content-Type":"text/plain"},
    body: JSON.stringify({ action, ...payload })
  });
}

// ── GEOCODING — converts addresses to lat/lng using free OpenStreetMap ──
// Caches results in sessionStorage so we only geocode once per session
async function geocodeAddress(address) {
  if (!address) return null;
  const cacheKey = `geo_${address}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const res = await fetch(url, { headers:{"Accept-Language":"en"} });
    const data = await res.json();
    if (data?.length) {
      const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      sessionStorage.setItem(cacheKey, JSON.stringify(coords));
      return coords;
    }
  } catch(e) { /* silent fail */ }
  return null;
}

// Geocode all records that are missing lat/lng, 300ms apart to respect rate limit
async function geocodeAll(records, onUpdate) {
  const results = [...records];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.address && (!r.lat || !r.lng)) {
      const coords = await geocodeAddress(r.address);
      if (coords) {
        results[i] = { ...r, lat: coords.lat, lng: coords.lng };
        onUpdate([...results]);
      }
      await new Promise(res => setTimeout(res, 300));
    }
  }
  return results;
}

const C = {
  navy:"#1B3A5C", navyL:"#2A5180", navyD:"#0D2238",
  gold:"#C9A84C", goldL:"#E8C96A", cream:"#F7F4EF", white:"#FFFFFF",
  dark:"#1A2740", muted:"#5A6A88", border:"#DDD8D0",
  success:"#1E6E42", successBg:"#ECFDF5", successBorder:"#6EE7B7",
  warn:"#A85206",   warnBg:"#FFFBEB",   warnBorder:"#FCD34D",
  danger:"#B91C1C", dangerBg:"#FEF2F2", dangerBorder:"#FECACA",
  info:"#1558A8",   infoBg:"#EFF6FF",   infoBorder:"#BFDBFE",
  purple:"#6D28D9", purpleBg:"#F5F3FF", purpleBorder:"#C4B5FD",
};
const SERIF = { fontFamily:"'Playfair Display', Georgia, serif" };
const SANS  = { fontFamily:"'Source Sans 3', 'Segoe UI', sans-serif" };
const STATUS = {
  open:             { label:"Open — Not Yet Done",      short:"Open",       color:C.info,    bg:C.infoBg,    border:C.infoBorder    },
  follow_up_needed: { label:"Needs Follow-Up",           short:"Follow-Up",  color:C.warn,    bg:C.warnBg,    border:C.warnBorder    },
  completed:        { label:"Completed",                 short:"Completed",  color:C.success, bg:C.successBg, border:C.successBorder },
  closed:           { label:"Closed / No Action Needed", short:"Closed",     color:C.muted,   bg:"#F3F4F6",   border:"#D1D5DB"       },
};
const TYPES = {
  visit:      { label:"Home Visit", icon:"🏠", dotColor:C.navy    },
  phone_call: { label:"Phone Call", icon:"📞", dotColor:C.success },
  communion:  { label:"Communion",  icon:"✝️", dotColor:C.purple  },
  other:      { label:"Other",      icon:"📋", dotColor:C.muted   },
};
const ROLE_CFG = {
  deacon:    { label:"Deacon",    plural:"Deacons",     color:C.navy,    bg:"#EFF6FF",  border:C.infoBorder,   icon:"👨‍⚕️" },
  deaconess: { label:"Deaconess", plural:"Deaconesses", color:C.purple,  bg:C.purpleBg, border:C.purpleBorder, icon:"👩‍⚕️" },
  pastor:    { label:"Pastor",    plural:"Pastors",     color:"#92400E", bg:C.warnBg,   border:C.warnBorder,   icon:"⛪"   },
  minister:  { label:"Minister",  plural:"Ministers",   color:C.navy,    bg:C.infoBg,   border:C.infoBorder,   icon:"📖"  },
};
const ASSIGN_ST = {
  pending:  { label:"Awaiting Response", color:C.warn,    bg:C.warnBg,    icon:"⏳" },
  accepted: { label:"Accepted",          color:C.success, bg:C.successBg, icon:"✅" },
  declined: { label:"Declined",          color:C.danger,  bg:C.dangerBg,  icon:"❌" },
};
const TITLES = ["Deacon","Deaconess","Minister","Pastor","Sister","Brother","Mr.","Mrs.","Ms."];
const inp = (ex={}) => ({ width:"100%", padding:"14px 15px", border:`2px solid ${C.border}`, borderRadius:"12px", fontSize:"16px", fontFamily:"'Source Sans 3','Segoe UI',sans-serif", background:"white", boxSizing:"border-box", outline:"none", color:C.dark, lineHeight:1.4, ...ex });

function haversine(la1,lo1,la2,lo2) {
  if(!la1||!lo1||!la2||!lo2) return null;
  const R=3958.8, dL=(la2-la1)*Math.PI/180, dO=(lo2-lo1)*Math.PI/180;
  const a=Math.sin(dL/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dO/2)**2;
  return R*2*Math.asin(Math.sqrt(a));
}

// ── MOCK DATA ─────────────────────────────────────────────────────────
const INIT_R = [
  {id:"r1",title:"Sister", firstName:"Mary",    lastName:"Johnson", cellPhone:"(909) 555-0101",homePhone:"(909) 555-0201",email:"mary.johnson@email.com",address:"123 Oak St, Ontario, CA 91764",          lat:34.067,lng:-117.651,status:"active",  notes:"Recovering from hip surgery. Needs frequent check-ins.",inactiveReason:""},
  {id:"r2",title:"Brother",firstName:"Charles", lastName:"Williams",cellPhone:"(909) 555-0102",homePhone:"",              email:"",                      address:"",                                          lat:null,  lng:null,   status:"active",  notes:"Homebound — limited mobility. Very appreciative of visits.",inactiveReason:""},
  {id:"r3",title:"Deacon", firstName:"Robert",  lastName:"Davis",   cellPhone:"(909) 555-0103",homePhone:"",              email:"rdavis@mtzion.org",     address:"",                                          lat:null,  lng:null,   status:"active",  notes:"",inactiveReason:""},
  {id:"r4",title:"Sister", firstName:"Dorothy", lastName:"Brown",   cellPhone:"(909) 555-0104",homePhone:"",              email:"",                      address:"450 Pine Ave, Pomona, CA 91768",            lat:34.057,lng:-117.749,status:"active",  notes:"Resides at Sunrise Assisted Living, Room 14B.",inactiveReason:""},
  {id:"r5",title:"Mrs.",   firstName:"Helen",   lastName:"Miller",  cellPhone:"(909) 555-0105",homePhone:"",              email:"",                      address:"",                                          lat:null,  lng:null,   status:"inactive",notes:"",inactiveReason:"Relocated to Arizona to be closer to family."},
  {id:"r6",title:"Brother",firstName:"James",   lastName:"Wilson",  cellPhone:"(909) 555-0106",homePhone:"",              email:"jwilson@email.com",     address:"742 Maple Ave, Ontario, CA 91762",         lat:34.061,lng:-117.658,status:"active",  notes:"Recently lost his wife. Needs bereavement support.",inactiveReason:""},
  {id:"r7",title:"Minister",firstName:"Grace",  lastName:"Taylor",  cellPhone:"(909) 555-0107",homePhone:"",              email:"",                      address:"892 Elm Dr, Rancho Cucamonga, CA 91730",   lat:34.108,lng:-117.598,status:"active",  notes:"",inactiveReason:""},
];
const INIT_T = [
  {id:"t1",firstName:"Marcus", lastName:"Thompson",role:"deacon",   phone:"(909) 555-1001",email:"m.thompson@mtzion.org", address:"450 Grove Ave, Ontario, CA 91764",              lat:34.069,lng:-117.645,isActive:true,linkedRecipientId:null},
  {id:"t2",firstName:"Samuel", lastName:"Carter",  role:"deacon",   phone:"(909) 555-1002",email:"s.carter@mtzion.org",   address:"892 Mountain View Dr, Rancho Cucamonga, CA 91730",lat:34.112,lng:-117.589,isActive:true,linkedRecipientId:null},
  {id:"t3",firstName:"David",  lastName:"Mitchell",role:"deacon",   phone:"(909) 555-1003",email:"d.mitchell@mtzion.org", address:"234 Riverside Dr, Ontario, CA 91761",           lat:34.051,lng:-117.621,isActive:true,linkedRecipientId:null},
  {id:"t4",firstName:"Thomas", lastName:"Anderson",role:"deacon",   phone:"(909) 555-1004",email:"t.anderson@mtzion.org", address:"567 Vineyard Ave, Ontario, CA 91764",           lat:34.074,lng:-117.638,isActive:true,linkedRecipientId:null},
  {id:"t5",firstName:"Patricia",lastName:"Lewis", role:"deaconess", phone:"(909) 555-2001",email:"p.lewis@mtzion.org",    address:"123 Benson Ave, Upland, CA 91786",              lat:34.099,lng:-117.652,isActive:true,linkedRecipientId:null},
  {id:"t6",firstName:"Ruth",   lastName:"Johnson", role:"deaconess", phone:"(909) 555-2002",email:"r.johnson@mtzion.org", address:"789 Central Ave, Chino, CA 91710",              lat:33.999,lng:-117.685,isActive:true,linkedRecipientId:null},
  {id:"t7",firstName:"Sandra", lastName:"Williams",role:"deaconess", phone:"(909) 555-2003",email:"s.williams@mtzion.org",address:"345 Euclid Ave, Ontario, CA 91762",             lat:34.062,lng:-117.661,isActive:true,linkedRecipientId:null},
  {id:"t8",firstName:"Joyce",  lastName:"Harrison",role:"deaconess", phone:"(909) 555-2004",email:"j.harrison@mtzion.org",address:"678 N Cypress St, Redlands, CA 92374",          lat:34.056,lng:-117.185,isActive:true,linkedRecipientId:null},
  {id:"t9",firstName:"James",  lastName:"Washington",role:"pastor", phone:"(909) 555-3001",email:"pastor.washington@mtzion.org",address:"100 Church St, Ontario, CA 91764",        lat:34.066,lng:-117.649,isActive:true,linkedRecipientId:null},
  {id:"t10",firstName:"Michael",lastName:"Roberts",role:"pastor",   phone:"(909) 555-3002",email:"pastor.roberts@mtzion.org",  address:"250 Grand Ave, Pomona, CA 91766",          lat:34.058,lng:-117.748,isActive:true,linkedRecipientId:null},
];
const INIT_A = [
  {id:"a1",teamMemberId:"t3",recipientId:"r1",assignedAt:"2026-02-15T09:00",status:"accepted",hasVisitedBefore:true},
  {id:"a2",teamMemberId:"t7",recipientId:"r1",assignedAt:"2026-02-15T09:00",status:"accepted",hasVisitedBefore:true},
  {id:"a3",teamMemberId:"t1",recipientId:"r4",assignedAt:"2026-02-20T10:00",status:"accepted",hasVisitedBefore:false},
  {id:"a4",teamMemberId:"t6",recipientId:"r4",assignedAt:"2026-02-20T10:00",status:"accepted",hasVisitedBefore:true},
  {id:"a5",teamMemberId:"t4",recipientId:"r6",assignedAt:"2026-03-01T08:00",status:"pending", hasVisitedBefore:false},
  {id:"a6",teamMemberId:"t5",recipientId:"r6",assignedAt:"2026-03-01T08:00",status:"pending", hasVisitedBefore:false},
];
const INIT_I = [
  {id:"i1",recipientId:"r1",recipientName:"Sister Mary Johnson",     contactType:"visit",     status:"open",            scheduledDate:"2026-03-03T10:00",notes:"Post-surgery check-in. Bring communion elements.",outcome:"",nextSteps:""},
  {id:"i2",recipientId:"r2",recipientName:"Brother Charles Williams",contactType:"communion", status:"open",            scheduledDate:"2026-03-03T14:00",notes:"Monthly communion service at his home.",outcome:"",nextSteps:""},
  {id:"i3",recipientId:"r4",recipientName:"Sister Dorothy Brown",    contactType:"phone_call",status:"completed",       scheduledDate:"2026-03-01T11:00",notes:"",outcome:"She's doing well and in good spirits.",nextSteps:"Schedule in-person visit for early April."},
  {id:"i4",recipientId:"r6",recipientName:"Brother James Wilson",    contactType:"visit",     status:"follow_up_needed",scheduledDate:"2026-03-02T09:00",notes:"Bereavement support visit.",outcome:"Very emotional. We prayed together.",nextSteps:"Schedule follow-up this week."},
  {id:"i5",recipientId:"r3",recipientName:"Deacon Robert Davis",     contactType:"phone_call",status:"open",            scheduledDate:"2026-03-05T13:00",notes:"Quarterly wellness check.",outcome:"",nextSteps:""},
  {id:"i6",recipientId:"r7",recipientName:"Minister Grace Taylor",   contactType:"visit",     status:"completed",       scheduledDate:"2026-02-28T10:00",notes:"",outcome:"Wonderful visit. Shared communion and read scripture.",nextSteps:""},
  {id:"i7",recipientId:"r6",recipientName:"Brother James Wilson",    contactType:"visit",     status:"open",            scheduledDate:"2026-03-07T11:00",notes:"Grief support follow-up.",outcome:"",nextSteps:""},
  {id:"i8",recipientId:"r4",recipientName:"Sister Dorothy Brown",    contactType:"communion", status:"open",            scheduledDate:"2026-03-15T14:00",notes:"Monthly communion at Sunrise Assisted Living.",outcome:"",nextSteps:""},
];

// ── ASSIGNMENT ENGINE ─────────────────────────────────────────────────
function autoAssign(recipientId, role, team, assignments, recipients) {
  const rec = recipients.find(r=>r.id===recipientId);
  const eligible = team.filter(t=>t.role===role&&t.isActive);
  const alreadyIn = new Set(assignments.filter(a=>a.recipientId===recipientId&&(a.status==="accepted"||a.status==="pending")).map(a=>a.teamMemberId));
  const loads = {};
  team.forEach(t=>{ loads[t.id]=assignments.filter(a=>a.teamMemberId===t.id&&a.status==="accepted").length; });
  const sorted = eligible.filter(t=>!alreadyIn.has(t.id))
    .map(t=>({...t, dist:haversine(rec?.lat,rec?.lng,t.lat,t.lng), load:loads[t.id]||0}))
    .sort((a,b)=>a.load!==b.load?a.load-b.load:(a.dist||999)-(b.dist||999));
  if(!sorted.length) return null;
  const pick=sorted[0];
  return { id:`a${Date.now()}${Math.random().toString(36).slice(2,5)}`, teamMemberId:pick.id, recipientId, assignedAt:new Date().toISOString(), status:"pending", hasVisitedBefore:assignments.some(a=>a.teamMemberId===pick.id&&a.recipientId===recipientId&&a.status==="accepted") };
}

function proximityList(rec, team, assignments) {
  if(!rec?.lat||!rec?.lng) return [];
  const loads = {};
  team.forEach(t=>{ loads[t.id]=assignments.filter(a=>a.teamMemberId===t.id&&a.status==="accepted").length; });
  return team.filter(t=>t.isActive).map(t=>({
    ...t,
    dist: haversine(rec.lat,rec.lng,t.lat,t.lng),
    load: loads[t.id]||0,
    assignment: assignments.find(a=>a.teamMemberId===t.id&&a.recipientId===rec.id),
    hasVisited: assignments.some(a=>a.teamMemberId===t.id&&a.recipientId===rec.id&&a.status==="accepted"),
  })).sort((a,b)=>(a.dist||999)-(b.dist||999));
}

// ── SHARED UI ─────────────────────────────────────────────────────────
function Toast({message,type,onDone}) {
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t);},[]);
  const bg=type==="success"?C.success:type==="error"?C.danger:type==="warn"?C.warn:C.navy;
  return <div style={{position:"fixed",top:"16px",left:"50%",transform:"translateX(-50%)",zIndex:9999,background:bg,color:"white",padding:"14px 22px",borderRadius:"16px",fontSize:"16px",fontWeight:600,boxShadow:"0 8px 24px rgba(0,0,0,0.3)",display:"flex",alignItems:"center",gap:"10px",maxWidth:"390px",width:"calc(100% - 32px)",...SANS}}>
    <span style={{fontSize:"20px"}}>{type==="success"?"✅":type==="error"?"❌":type==="warn"?"⚠️":"ℹ️"}</span>{message}
  </div>;
}

function Confirm({message,sub,onYes,onNo,yesLabel="Confirm",noLabel="Cancel",yesColor=C.navy}) {
  return <div style={{position:"fixed",inset:0,zIndex:800,background:"rgba(13,34,56,0.65)",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
    <div style={{background:"white",borderRadius:"20px",padding:"28px 24px",maxWidth:"360px",width:"100%",boxShadow:"0 20px 50px rgba(0,0,0,0.35)",...SANS}}>
      <div style={{fontSize:"20px",fontWeight:700,color:C.dark,marginBottom:"6px",lineHeight:1.3}}>{message}</div>
      {sub&&<div style={{fontSize:"15px",color:C.muted,lineHeight:1.5}}>{sub}</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginTop:"22px"}}>
        <button onClick={onNo} style={{padding:"14px",background:"#F3F4F6",color:C.muted,border:"none",borderRadius:"12px",fontSize:"16px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{noLabel}</button>
        <button onClick={onYes} style={{padding:"14px",background:yesColor,color:"white",border:"none",borderRadius:"12px",fontSize:"16px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{yesLabel}</button>
      </div>
    </div>
  </div>;
}

function SectionHead({title,count,hint}) {
  return <div style={{marginBottom:"12px"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{...SERIF,fontSize:"19px",color:C.dark,fontWeight:600}}>{title}</div>
      {count!==undefined&&<span style={{fontSize:"12px",background:C.navy,color:"white",borderRadius:"20px",padding:"3px 12px",fontWeight:700}}>{count}</span>}
    </div>
    {hint&&<div style={{color:C.muted,fontSize:"13px",marginTop:"3px"}}>{hint}</div>}
  </div>;
}

function EmptyCard({icon,text}) {
  return <div style={{background:"white",borderRadius:"16px",padding:"32px 20px",textAlign:"center",color:C.muted,fontSize:"15px",boxShadow:"0 2px 8px rgba(0,0,0,0.05)",lineHeight:1.5}}>
    <div style={{fontSize:"36px",marginBottom:"12px",opacity:0.5}}>{icon}</div>{text}
  </div>;
}
function InfoCard({children,style}) {
  return <div style={{background:"white",borderRadius:"14px",padding:"18px",boxShadow:"0 2px 8px rgba(0,0,0,0.07)",...style}}>{children}</div>;
}
function BigBtn({onClick,label,style={}}) {
  return <button onClick={onClick} style={{width:"100%",padding:"16px",background:`linear-gradient(135deg,${C.navyD},${C.navyL})`,color:"white",border:"none",borderRadius:"14px",fontSize:"16px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 6px 20px rgba(27,58,92,0.28)`,...style}}>{label}</button>;
}
function FRow({label,children,error}) {
  return <div style={{marginBottom:"18px"}}>
    <label style={{display:"block",fontSize:"13px",fontWeight:700,color:C.muted,marginBottom:"8px",textTransform:"uppercase",letterSpacing:"0.5px",lineHeight:1.4}}>{label}</label>
    {children}
    {error&&<div style={{color:C.danger,fontSize:"14px",marginTop:"6px",fontWeight:600}}>⚠️ {error}</div>}
  </div>;
}
function MenuGroup({title,items,onTab}) {
  return <div style={{marginBottom:"22px"}}>
    <div style={{fontSize:"11px",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:"10px"}}>{title}</div>
    <div style={{background:"white",borderRadius:"18px",overflow:"hidden",boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
      {items.map((item,i)=>(
        <div key={i} onClick={item.onClick} style={{display:"flex",alignItems:"center",gap:"14px",padding:"16px 18px",borderBottom:i<items.length-1?`1px solid ${C.border}`:"none",cursor:"pointer",minHeight:"62px"}}>
          <span style={{fontSize:"22px",width:"28px",textAlign:"center",flexShrink:0}}>{item.icon}</span>
          <div style={{flex:1}}><div style={{fontWeight:600,color:C.dark,fontSize:"16px"}}>{item.label}</div>{item.sub&&<div style={{fontSize:"13px",color:C.muted,marginTop:"2px"}}>{item.sub}</div>}</div>
          {item.adminOnly&&<span style={{fontSize:"11px",color:C.warn,fontWeight:700,background:C.warnBg,padding:"3px 8px",borderRadius:"8px",flexShrink:0}}>Admin</span>}
          <span style={{color:C.muted,fontSize:"22px",flexShrink:0}}>›</span>
        </div>
      ))}
    </div>
  </div>;
}
function BottomSheet({title,onClose,onSave,children}) {
  return <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(13,34,56,0.65)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{...SANS,background:C.cream,borderRadius:"24px 24px 0 0",width:"100%",maxWidth:"430px",maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 -10px 40px rgba(0,0,0,0.3)"}}>
      <div style={{display:"flex",justifyContent:"center",padding:"14px 0 4px"}}><div style={{width:"40px",height:"4px",borderRadius:"2px",background:C.border}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 22px 16px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{...SERIF,fontSize:"21px",color:C.dark,lineHeight:1.2}}>{title}</div>
        <button onClick={onClose} style={{background:"#F3F4F6",border:"none",borderRadius:"50%",width:"36px",height:"36px",cursor:"pointer",fontSize:"18px",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted}}>✕</button>
      </div>
      <div style={{overflowY:"auto",padding:"20px 22px",flex:1}}>{children}</div>
      <div style={{padding:"16px 22px 28px",borderTop:`1px solid ${C.border}`,display:"flex",gap:"12px"}}>
        <button onClick={onClose} style={{flex:1,padding:"15px",background:"white",color:C.muted,border:`2px solid ${C.border}`,borderRadius:"14px",fontSize:"16px",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
        <button onClick={onSave} style={{flex:2,padding:"15px",background:`linear-gradient(135deg,${C.navy},${C.navyL})`,color:"white",border:"none",borderRadius:"14px",fontSize:"16px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 4px 16px rgba(27,58,92,0.35)`}}>Save Changes</button>
      </div>
    </div>
  </div>;
}

function ItemRow({item,onSelect}) {
  const tc=TYPES[item.contactType], sc=STATUS[item.status];
  const d=new Date(item.scheduledDate);
  return <div onClick={onSelect} style={{background:"white",borderRadius:"16px",padding:"16px",marginBottom:"12px",boxShadow:"0 2px 10px rgba(0,0,0,0.07)",cursor:"pointer",display:"flex",gap:"12px",alignItems:"flex-start",borderLeft:`5px solid ${sc.color}`}}>
    <div style={{width:"46px",height:"46px",borderRadius:"12px",background:sc.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px",flexShrink:0}}>{tc.icon}</div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontWeight:700,color:C.dark,fontSize:"16px",lineHeight:1.2}}>{item.recipientName}</div>
      <div style={{color:C.muted,fontSize:"14px",marginTop:"4px"}}>{tc.label} · {d.toLocaleDateString("en-US",{month:"short",day:"numeric"})} at {d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</div>
      {item.notes&&<div style={{color:C.muted,fontSize:"13px",marginTop:"4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontStyle:"italic"}}>{item.notes}</div>}
    </div>
    <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"6px"}}>
      <span style={{fontSize:"11px",fontWeight:700,padding:"4px 9px",borderRadius:"20px",background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`,whiteSpace:"nowrap"}}>{sc.short}</span>
      <span style={{color:C.muted,fontSize:"22px",lineHeight:1}}>›</span>
    </div>
  </div>;
}

// ── LOGIN ─────────────────────────────────────────────────────────────
function LoginScreen({showPw,setShowPw,email,setEmail,pw,setPw,err,loading,onLogin}) {
  return <div style={{...SANS,minHeight:"100vh",background:`linear-gradient(160deg,${C.navyD},${C.navy} 55%,#1e4d7a)`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px",maxWidth:"430px",margin:"0 auto",position:"relative",overflow:"hidden"}}>
    <div style={{position:"absolute",top:"8%",left:"8%",fontSize:"200px",lineHeight:1,opacity:0.04,pointerEvents:"none"}}>✝</div>
    <div style={{textAlign:"center",marginBottom:"36px"}}>
      <div style={{width:"80px",height:"80px",borderRadius:"24px",background:`linear-gradient(135deg,${C.navy},${C.navyL})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px",boxShadow:"0 10px 30px rgba(201,168,76,0.45)",overflow:"hidden"}}>
        <img src="/icon-192.png" alt="Mt. Zion Ontario" style={{width:"80px",height:"80px",borderRadius:"24px",objectFit:"cover"}}/>
      </div>
      <div style={{...SERIF,color:"white",fontSize:"28px",fontWeight:700,marginBottom:"6px"}}>Mt. Zion Ontario</div>
      <div style={{color:C.gold,fontSize:"13px",letterSpacing:"2px",textTransform:"uppercase",fontWeight:600}}>Care Ministry Portal</div>
      <div style={{color:"rgba(255,255,255,0.45)",fontSize:"13px",marginTop:"8px"}}>Deacon · Deaconess · Minister · Pastor</div>
    </div>
    <div style={{background:"white",borderRadius:"24px",padding:"32px 28px 28px",width:"100%",maxWidth:"380px",boxShadow:"0 28px 60px rgba(0,0,0,0.35)"}}>
      <div style={{...SERIF,fontSize:"22px",color:C.dark,marginBottom:"4px"}}>Welcome Back</div>
      <div style={{color:C.muted,fontSize:"15px",marginBottom:"26px"}}>Sign in to your ministry account</div>
      {err&&<div style={{background:C.dangerBg,border:`1px solid ${C.dangerBorder}`,borderRadius:"12px",padding:"14px 16px",color:C.danger,fontSize:"15px",marginBottom:"18px"}}>⚠️ {err}</div>}
      <label style={{display:"block",fontSize:"13px",fontWeight:700,color:C.dark,marginBottom:"8px",textTransform:"uppercase",letterSpacing:"0.5px"}}>Email Address</label>
      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLogin()} style={{...inp(),marginBottom:"18px"}}/>
      <label style={{display:"block",fontSize:"13px",fontWeight:700,color:C.dark,marginBottom:"8px",textTransform:"uppercase",letterSpacing:"0.5px"}}>Password</label>
      <div style={{position:"relative",marginBottom:"28px"}}>
        <input type={showPw?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLogin()} style={{...inp(),paddingRight:"52px"}}/>
        <button onClick={()=>setShowPw(!showPw)} style={{position:"absolute",right:"14px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:"20px",color:C.muted}}>{showPw?"🙈":"👁️"}</button>
      </div>
      <button onClick={onLogin} disabled={loading} style={{width:"100%",padding:"16px",background:loading?C.muted:`linear-gradient(135deg,${C.navyD},${C.navy})`,color:"white",border:"none",borderRadius:"14px",fontSize:"18px",fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit",boxShadow:loading?"none":`0 6px 20px rgba(27,58,92,0.4)`}}>
        {loading?"Signing In…":"Sign In →"}
      </button>
      <div style={{marginTop:"18px",background:C.successBg,border:`1px solid ${C.successBorder}`,borderRadius:"12px",padding:"12px 16px",display:"flex",gap:"10px",alignItems:"center"}}>
        <span>✅</span><span style={{fontSize:"14px",color:C.success}}><strong>Demo:</strong> Credentials are pre-filled — tap <strong>Sign In</strong>.</span>
      </div>
    </div>
  </div>;
}

// ── HOME ──────────────────────────────────────────────────────────────
function HomeScreen({stats,items,assignments,team,recipients,myTeamId,onTab,onSelectItem,onAccept,onDecline}) {
  const TODAY_STR = new Date("2026-03-03").toDateString();
  const todayItems = items.filter(i=>new Date(i.scheduledDate).toDateString()===TODAY_STR);
  const myPending  = assignments.filter(a=>a.teamMemberId===myTeamId&&a.status==="pending");
  const me = team.find(t=>t.id===myTeamId);
  return <div style={{padding:"20px 16px"}}>
    <div style={{marginBottom:"22px"}}>
      <div style={{...SERIF,fontSize:"26px",color:C.dark,lineHeight:1.25}}>Good morning,<br/>Deacon John 🙏</div>
      <div style={{color:C.muted,fontSize:"15px",marginTop:"6px"}}>Tuesday, March 3, 2026</div>
    </div>

    {myPending.length>0&&<div style={{background:`linear-gradient(135deg,${C.warnBg},#FEF3C7)`,border:`2px solid ${C.warnBorder}`,borderRadius:"16px",padding:"18px",marginBottom:"20px"}}>
      <div style={{fontWeight:700,color:"#92400E",fontSize:"17px",marginBottom:"14px"}}>📬 You have been asked to serve:</div>
      {myPending.map(a=>{
        const rec=recipients.find(r=>r.id===a.recipientId);
        const dist=me?.lat&&rec?.lat?haversine(me.lat,me.lng,rec.lat,rec.lng):null;
        return <div key={a.id} style={{background:"white",borderRadius:"14px",padding:"14px",marginBottom:"10px",border:`1px solid ${C.warnBorder}`}}>
          <div style={{fontWeight:700,color:C.dark,fontSize:"16px"}}>{rec?.title} {rec?.firstName} {rec?.lastName}</div>
          <div style={{color:C.muted,fontSize:"13px",marginTop:"3px"}}>{rec?.address||"Address not on file"}</div>
          {dist&&<div style={{color:C.warn,fontSize:"13px",marginTop:"3px",fontWeight:600}}>📍 {dist.toFixed(1)} miles from your home</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginTop:"12px"}}>
            <button onClick={()=>onDecline(a.id)} style={{padding:"12px",background:C.dangerBg,color:C.danger,border:`2px solid ${C.dangerBorder}`,borderRadius:"12px",fontSize:"14px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>❌ Decline</button>
            <button onClick={()=>onAccept(a.id)} style={{padding:"12px",background:C.successBg,color:C.success,border:`2px solid ${C.successBorder}`,borderRadius:"12px",fontSize:"14px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✅ Accept</button>
          </div>
        </div>;
      })}
    </div>}

    {stats.followUps>0&&<div onClick={()=>onTab("items")} style={{background:`linear-gradient(135deg,${C.warnBg},#FEF3C7)`,border:`2px solid ${C.warnBorder}`,borderRadius:"16px",padding:"18px",marginBottom:"20px",cursor:"pointer",display:"flex",alignItems:"center",gap:"14px"}}>
      <span style={{fontSize:"32px",flexShrink:0}}>⚠️</span>
      <div style={{flex:1}}><div style={{fontWeight:700,color:"#92400E",fontSize:"17px"}}>{stats.followUps} Follow-Up{stats.followUps>1?"s":""} Need Attention</div><div style={{color:C.warn,fontSize:"14px",marginTop:"3px"}}>Tap here to see who needs follow-up</div></div>
      <span style={{color:C.warn,fontSize:"28px"}}>›</span>
    </div>}

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"26px"}}>
      {[
        {label:"People in Care", value:stats.active,   icon:"👥", accent:C.navy},
        {label:"Open Items",     value:stats.open,     icon:"📋", accent:C.info},
        {label:"Done This Month",value:stats.done,     icon:"✅", accent:C.success},
        {label:"Pending Assigns",value:stats.pending,  icon:"📬", accent:C.warn},
      ].map((c,i)=><div key={i} style={{background:"white",borderRadius:"16px",padding:"18px 16px",boxShadow:"0 2px 10px rgba(0,0,0,0.07)",borderTop:`4px solid ${c.accent}`}}>
        <div style={{fontSize:"34px",fontWeight:700,color:c.accent,lineHeight:1,marginBottom:"6px"}}>{c.value}</div>
        <div style={{fontSize:"12px",color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.3px"}}>{c.label}</div>
      </div>)}
    </div>

    <SectionHead title="Today's Contacts" count={todayItems.length}/>
    <div style={{marginBottom:"26px"}}>{todayItems.length===0?<EmptyCard icon="✅" text="Nothing scheduled today."/>:todayItems.map(i=><ItemRow key={i.id} item={i} onSelect={()=>onSelectItem(i)}/>)}</div>

    <SectionHead title="Quick Actions"/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"26px"}}>
      {[
        {label:"Care Roster",   sub:"See all people in care",  icon:"👥",tab:"roster",   bg:`linear-gradient(135deg,${C.navy},${C.navyL})`},
        {label:"Ministry Team", sub:"Deacons & deaconesses",   icon:"⛪",tab:"team",     bg:`linear-gradient(135deg,${C.purple},#7C3AED)`},
        {label:"Care Items",    sub:"Visits, calls & more",    icon:"📋",tab:"items",    bg:`linear-gradient(135deg,${C.info},#1D76C8)`},
        {label:"Schedule",      sub:"See what's coming up",    icon:"📅",tab:"schedule", bg:`linear-gradient(135deg,${C.success},#2D9A5F)`},
      ].map((a,i)=><div key={i} onClick={()=>onTab(a.tab)} style={{background:a.bg,borderRadius:"16px",padding:"18px 16px",cursor:"pointer",boxShadow:"0 4px 14px rgba(0,0,0,0.15)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:"8px",bottom:"6px",fontSize:"36px",opacity:0.2}}>{a.icon}</div>
        <div style={{fontSize:"28px",marginBottom:"8px"}}>{a.icon}</div>
        <div style={{fontSize:"14px",fontWeight:700,color:"white",lineHeight:1.2}}>{a.label}</div>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.7)",marginTop:"3px"}}>{a.sub}</div>
      </div>)}
    </div>

    <SectionHead title="Recent Activity"/>
    {items.slice(0,4).map(i=><ItemRow key={i.id} item={i} onSelect={()=>onSelectItem(i)}/>)}
  </div>;
}

// ── ROSTER ────────────────────────────────────────────────────────────
function RosterScreen({recipients,search,setSearch,filter,setFilter,onSelect,onAdd}) {
  return <div style={{padding:"16px"}}>
    <div style={{position:"relative",marginBottom:"12px"}}>
      <span style={{position:"absolute",left:"15px",top:"50%",transform:"translateY(-50%)",fontSize:"18px"}}>🔍</span>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or phone…" style={{...inp(),paddingLeft:"46px"}}/>
      {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:"14px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:"18px",color:C.muted}}>✕</button>}
    </div>
    <div style={{display:"flex",gap:"10px",marginBottom:"18px"}}>
      {[["all","All"],["active","Active"],["inactive","Inactive"]].map(([v,l])=><button key={v} onClick={()=>setFilter(v)} style={{flex:1,padding:"11px 8px",borderRadius:"24px",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"14px",fontWeight:700,background:filter===v?C.navy:"white",color:filter===v?"white":C.muted,boxShadow:"0 1px 6px rgba(0,0,0,0.09)"}}>{l}</button>)}
    </div>
    <div style={{fontSize:"14px",color:C.muted,marginBottom:"12px"}}>{recipients.length} {recipients.length===1?"person":"people"}</div>
    {recipients.length===0&&<EmptyCard icon="👥" text="No people match your search."/>}
    {recipients.map(r=><div key={r.id} onClick={()=>onSelect(r)} style={{background:"white",borderRadius:"18px",padding:"16px",marginBottom:"12px",boxShadow:"0 2px 10px rgba(0,0,0,0.07)",cursor:"pointer",display:"flex",alignItems:"center",gap:"14px",borderLeft:`5px solid ${r.status==="active"?C.navy:"#D1D5DB"}`}}>
      <div style={{width:"52px",height:"52px",borderRadius:"16px",background:r.status==="active"?`linear-gradient(135deg,${C.navy},${C.navyL})`:"#E5E7EB",display:"flex",alignItems:"center",justifyContent:"center",color:r.status==="active"?"white":C.muted,fontWeight:700,fontSize:"18px",flexShrink:0}}>
        {r.firstName[0]}{r.lastName?.[0]||""}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:700,color:C.dark,fontSize:"17px",lineHeight:1.2}}>{r.title} {r.firstName} {r.lastName}</div>
        {r.cellPhone&&<div style={{color:C.muted,fontSize:"14px",marginTop:"4px"}}>📞 {r.cellPhone}</div>}
        {r.notes&&<div style={{color:C.muted,fontSize:"13px",marginTop:"4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontStyle:"italic"}}>{r.notes}</div>}
        {r.lat&&<div style={{color:C.success,fontSize:"12px",marginTop:"3px",fontWeight:600}}>📍 Address on file</div>}
      </div>
      <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"6px"}}>
        <span style={{fontSize:"11px",fontWeight:700,padding:"4px 10px",borderRadius:"20px",background:r.status==="active"?"#DCFCE7":"#F3F4F6",color:r.status==="active"?"#166534":C.muted,textTransform:"uppercase"}}>{r.status==="active"?"Active":"Inactive"}</span>
        <span style={{color:C.muted,fontSize:"24px",lineHeight:1}}>›</span>
      </div>
    </div>)}
    <BigBtn onClick={onAdd} label="+ Add New Person to Roster" style={{marginTop:"10px"}}/>
  </div>;
}

// ── ITEMS SCREEN ──────────────────────────────────────────────────────
function ItemsScreen({items,stFilter,setStFilter,tyFilter,setTyFilter,onSelect,onAdd}) {
  return <div style={{padding:"16px"}}>
    <div style={{overflowX:"auto",marginBottom:"12px"}}><div style={{display:"flex",gap:"8px",paddingBottom:"4px",minWidth:"max-content"}}>
      {[["all","All"],["open","Open"],["follow_up_needed","Follow-Up"],["completed","Done"],["closed","Closed"]].map(([v,l])=>{
        const cfg=v==="all"?{color:C.navy}:STATUS[v];
        return <button key={v} onClick={()=>setStFilter(v)} style={{padding:"10px 16px",borderRadius:"24px",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"14px",fontWeight:700,whiteSpace:"nowrap",background:stFilter===v?cfg.color:"white",color:stFilter===v?"white":C.muted,boxShadow:"0 1px 5px rgba(0,0,0,0.09)"}}>{l}</button>;
      })}
    </div></div>
    <div style={{overflowX:"auto",marginBottom:"18px"}}><div style={{display:"flex",gap:"8px",minWidth:"max-content"}}>
      {[["all","All Types"],["visit","🏠 Visit"],["phone_call","📞 Call"],["communion","✝️ Communion"],["other","📋 Other"]].map(([v,l])=><button key={v} onClick={()=>setTyFilter(v)} style={{padding:"9px 14px",borderRadius:"24px",border:`2px solid ${tyFilter===v?C.gold:C.border}`,cursor:"pointer",fontFamily:"inherit",fontSize:"14px",fontWeight:600,whiteSpace:"nowrap",background:tyFilter===v?C.gold+"20":"white",color:tyFilter===v?C.navyD:C.muted}}>{l}</button>)}
    </div></div>
    <div style={{fontSize:"14px",color:C.muted,marginBottom:"12px"}}>{items.length} items</div>
    {items.length===0?<EmptyCard icon="📋" text="No items match the selected filters."/>:items.map(i=><ItemRow key={i.id} item={i} onSelect={()=>onSelect(i)}/>)}
    <BigBtn onClick={onAdd} label="+ Schedule New Care Item" style={{marginTop:"10px"}}/>
  </div>;
}

// ── TEAM SCREEN ───────────────────────────────────────────────────────
function TeamScreen({team,assignments,recipients,myTeamId,onSelect,onAdd,onAccept,onDecline}) {
  const [roleFilter,setRoleFilter]=useState("all");
  const [ts,setTs]=useState("");
  const workload=id=>assignments.filter(a=>a.teamMemberId===id&&a.status==="accepted").length;
  const pending=id=>assignments.filter(a=>a.teamMemberId===id&&a.status==="pending").length;
  const filtered=team.filter(t=>(roleFilter==="all"||t.role===roleFilter)&&(!ts||`${t.firstName} ${t.lastName}`.toLowerCase().includes(ts.toLowerCase())));
  const myPending=assignments.filter(a=>a.teamMemberId===myTeamId&&a.status==="pending");
  const grouped=["deacon","deaconess","pastor","minister"].reduce((acc,role)=>{const m=filtered.filter(t=>t.role===role&&t.isActive);if(m.length)acc[role]=m;return acc;},{});
  return <div style={{padding:"16px"}}>
    {myPending.length>0&&<div style={{background:`linear-gradient(135deg,${C.warnBg},#FEF3C7)`,border:`2px solid ${C.warnBorder}`,borderRadius:"16px",padding:"18px",marginBottom:"18px"}}>
      <div style={{fontWeight:700,color:"#92400E",fontSize:"16px",marginBottom:"12px"}}>📬 Pending Assignments — Your Response Needed:</div>
      {myPending.map(a=>{
        const rec=recipients.find(r=>r.id===a.recipientId);
        return <div key={a.id} style={{background:"white",borderRadius:"12px",padding:"14px",marginBottom:"10px"}}>
          <div style={{fontWeight:700,color:C.dark,fontSize:"15px"}}>{rec?.title} {rec?.firstName} {rec?.lastName}</div>
          <div style={{color:C.muted,fontSize:"13px",marginTop:"2px"}}>{rec?.address||"No address on file"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginTop:"10px"}}>
            <button onClick={()=>onDecline(a.id)} style={{padding:"11px",background:C.dangerBg,color:C.danger,border:`2px solid ${C.dangerBorder}`,borderRadius:"10px",fontSize:"14px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>❌ Decline</button>
            <button onClick={()=>onAccept(a.id)} style={{padding:"11px",background:C.successBg,color:C.success,border:`2px solid ${C.successBorder}`,borderRadius:"10px",fontSize:"14px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✅ Accept</button>
          </div>
        </div>;
      })}
    </div>}
    <div style={{position:"relative",marginBottom:"12px"}}>
      <span style={{position:"absolute",left:"15px",top:"50%",transform:"translateY(-50%)",fontSize:"18px"}}>🔍</span>
      <input value={ts} onChange={e=>setTs(e.target.value)} placeholder="Search team members…" style={{...inp(),paddingLeft:"46px"}}/>
    </div>
    <div style={{overflowX:"auto",marginBottom:"18px"}}><div style={{display:"flex",gap:"8px",minWidth:"max-content"}}>
      {[["all","All Roles"],["deacon","Deacons"],["deaconess","Deaconesses"],["pastor","Pastors"]].map(([v,l])=><button key={v} onClick={()=>setRoleFilter(v)} style={{padding:"10px 16px",borderRadius:"24px",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"14px",fontWeight:700,whiteSpace:"nowrap",background:roleFilter===v?C.navy:"white",color:roleFilter===v?"white":C.muted,boxShadow:"0 1px 5px rgba(0,0,0,0.09)"}}>{l}</button>)}
    </div></div>
    <InfoCard style={{marginBottom:"18px"}}>
      <div style={{fontSize:"12px",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"10px"}}>Team Workload Overview</div>
      <div style={{display:"flex",gap:"16px",flexWrap:"wrap"}}>
        {Object.entries(ROLE_CFG).map(([role,cfg])=>{
          const count=team.filter(t=>t.role===role&&t.isActive).length; if(!count) return null;
          const total=assignments.filter(a=>team.find(t=>t.id===a.teamMemberId&&t.role===role)&&a.status==="accepted").length;
          return <div key={role} style={{display:"flex",alignItems:"center",gap:"8px"}}>
            <div style={{width:"10px",height:"10px",borderRadius:"50%",background:cfg.color,flexShrink:0}}/>
            <span style={{fontSize:"13px",color:C.dark,fontWeight:600}}>{cfg.plural}: <span style={{color:cfg.color}}>{count} · {total} assigned</span></span>
          </div>;
        })}
      </div>
    </InfoCard>
    {Object.entries(grouped).map(([role,members])=>{
      const cfg=ROLE_CFG[role];
      return <div key={role} style={{marginBottom:"22px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"12px"}}>
          <div style={{width:"4px",height:"24px",borderRadius:"2px",background:cfg.color}}/>
          <div style={{...SERIF,fontSize:"19px",color:C.dark,fontWeight:600}}>{cfg.plural}</div>
          <span style={{fontSize:"12px",background:cfg.color,color:"white",borderRadius:"20px",padding:"2px 10px",fontWeight:700}}>{members.length}</span>
        </div>
        {members.map(m=>{
          const wl=workload(m.id), pd=pending(m.id), isMe=m.id===myTeamId;
          return <div key={m.id} onClick={()=>onSelect(m)} style={{background:"white",borderRadius:"16px",padding:"14px 16px",marginBottom:"10px",boxShadow:"0 2px 10px rgba(0,0,0,0.07)",cursor:"pointer",display:"flex",alignItems:"center",gap:"14px",borderLeft:`5px solid ${cfg.color}`}}>
            <div style={{width:"50px",height:"50px",borderRadius:"14px",background:`linear-gradient(135deg,${cfg.color},${cfg.color}99)`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"18px",flexShrink:0,position:"relative"}}>
              {m.firstName[0]}{m.lastName[0]}
              {isMe&&<span style={{position:"absolute",bottom:"-4px",right:"-4px",fontSize:"12px",background:"white",borderRadius:"50%",width:"16px",height:"16px",display:"flex",alignItems:"center",justifyContent:"center"}}>⭐</span>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,color:C.dark,fontSize:"16px"}}>{m.firstName} {m.lastName}{isMe?" (You)":""}</div>
              <div style={{color:C.muted,fontSize:"13px",marginTop:"3px"}}>📞 {m.phone}</div>
              <div style={{display:"flex",gap:"8px",marginTop:"6px",flexWrap:"wrap"}}>
                <span style={{fontSize:"11px",fontWeight:700,padding:"3px 8px",borderRadius:"20px",background:wl>3?C.dangerBg:C.successBg,color:wl>3?C.danger:C.success,border:`1px solid ${wl>3?C.dangerBorder:C.successBorder}`}}>{wl} assigned</span>
                {pd>0&&<span style={{fontSize:"11px",fontWeight:700,padding:"3px 8px",borderRadius:"20px",background:C.warnBg,color:C.warn,border:`1px solid ${C.warnBorder}`}}>{pd} pending</span>}
              </div>
            </div>
            <span style={{color:C.muted,fontSize:"22px"}}>›</span>
          </div>;
        })}
      </div>;
    })}
    <BigBtn onClick={onAdd} label="+ Add Team Member"/>
  </div>;
}

// ── RECIPIENT DETAIL (with proximity panel) ───────────────────────────
function RecipientDetail({recipient,items,team,assignments,recipients,onBack,onSelectItem,onEdit,onAddItem,onAutoAssign,onManualAssign,onRemoveAssignment}) {
  const rItems=items.filter(i=>i.recipientId===recipient.id);
  const isActive=recipient.status==="active";
  const currentAssignments=assignments.filter(a=>a.recipientId===recipient.id&&(a.status==="accepted"||a.status==="pending"));
  const proxList=proximityList(recipient,team,assignments);
  const byRole=role=>proxList.filter(t=>t.role===role);
  return <div style={{...SANS,backgroundColor:C.cream,minHeight:"100vh"}}>
    <div style={{background:`linear-gradient(150deg,${C.navyD},${C.navyL})`,padding:"20px 20px 24px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",right:"14px",top:"6px",opacity:0.06,fontSize:"90px"}}>✝</div>
      <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
        <div style={{width:"68px",height:"68px",borderRadius:"20px",background:`linear-gradient(135deg,${C.gold},${C.goldL})`,display:"flex",alignItems:"center",justifyContent:"center",color:C.navy,fontWeight:700,fontSize:"26px",flexShrink:0}}>{recipient.firstName[0]}{recipient.lastName?.[0]||""}</div>
        <div>
          <div style={{...SERIF,color:"white",fontSize:"22px",lineHeight:1.2}}>{recipient.title} {recipient.firstName} {recipient.lastName}</div>
          <span style={{display:"inline-block",marginTop:"8px",fontSize:"11px",fontWeight:700,padding:"4px 12px",borderRadius:"20px",background:isActive?"#DCFCE7":"#F3F4F6",color:isActive?"#166534":C.muted,textTransform:"uppercase"}}>{isActive?"✅ Active":"Inactive"}</span>
        </div>
      </div>
      {(recipient.cellPhone||recipient.homePhone||recipient.email)&&<div style={{display:"flex",gap:"10px",marginTop:"18px"}}>
        {recipient.cellPhone&&<a href={`tel:${recipient.cellPhone.replace(/\D/g,"")}`} style={{flex:1,textDecoration:"none"}}><div style={{background:"rgba(255,255,255,0.15)",borderRadius:"14px",padding:"12px 8px",textAlign:"center",border:"1.5px solid rgba(255,255,255,0.2)"}}><div style={{fontSize:"20px",marginBottom:"4px"}}>📞</div><div style={{color:"white",fontSize:"12px",fontWeight:700}}>Cell</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:"10px"}}>{recipient.cellPhone}</div></div></a>}
        {recipient.homePhone&&<a href={`tel:${recipient.homePhone.replace(/\D/g,"")}`} style={{flex:1,textDecoration:"none"}}><div style={{background:"rgba(255,255,255,0.15)",borderRadius:"14px",padding:"12px 8px",textAlign:"center",border:"1.5px solid rgba(255,255,255,0.2)"}}><div style={{fontSize:"20px",marginBottom:"4px"}}>☎️</div><div style={{color:"white",fontSize:"12px",fontWeight:700}}>Home</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:"10px"}}>{recipient.homePhone}</div></div></a>}
        {recipient.email&&<a href={`mailto:${recipient.email}`} style={{flex:1,textDecoration:"none"}}><div style={{background:"rgba(255,255,255,0.15)",borderRadius:"14px",padding:"12px 8px",textAlign:"center",border:"1.5px solid rgba(255,255,255,0.2)"}}><div style={{fontSize:"20px",marginBottom:"4px"}}>✉️</div><div style={{color:"white",fontSize:"12px",fontWeight:700}}>Email</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:"10px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{recipient.email.split("@")[0]}</div></div></a>}
      </div>}
    </div>
    <div style={{padding:"20px 16px"}}>
      {recipient.notes&&<div style={{background:C.warnBg,border:`1.5px solid ${C.warnBorder}`,borderRadius:"14px",padding:"16px",marginBottom:"16px"}}><div style={{fontWeight:700,color:"#92400E",marginBottom:"8px",fontSize:"13px",textTransform:"uppercase"}}>📝 Ministry Notes</div><div style={{color:"#78350F",fontSize:"16px",lineHeight:1.6}}>{recipient.notes}</div></div>}
      {recipient.address&&<InfoCard style={{marginBottom:"14px"}}><div style={{fontWeight:700,color:C.muted,marginBottom:"6px",fontSize:"12px",textTransform:"uppercase"}}>📍 Address</div><div style={{fontSize:"15px",color:C.dark}}>{recipient.address}</div><a href={`https://maps.google.com/?q=${encodeURIComponent(recipient.address)}`} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",marginTop:"8px",color:C.info,fontSize:"14px",fontWeight:600,textDecoration:"none"}}>Open in Maps →</a></InfoCard>}

      {/* ASSIGNED CAREGIVERS */}
      <div style={{marginBottom:"18px"}}>
        <SectionHead title="Assigned Caregivers" count={currentAssignments.length} hint="Tap a name to view details or remove assignment"/>
        {currentAssignments.length===0?<EmptyCard icon="👤" text="No caregivers assigned yet. Use the Nearest Caregiver panel below."/>:currentAssignments.map(a=>{
          const m=team.find(t=>t.id===a.teamMemberId); if(!m) return null;
          const cfg=ROLE_CFG[m.role]||ROLE_CFG.deacon, asCfg=ASSIGN_ST[a.status];
          return <div key={a.id} style={{background:"white",borderRadius:"14px",padding:"14px 16px",marginBottom:"10px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",gap:"12px",borderLeft:`5px solid ${cfg.color}`}}>
            <div style={{width:"46px",height:"46px",borderRadius:"12px",background:`linear-gradient(135deg,${cfg.color},${cfg.color}99)`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"17px",flexShrink:0}}>{m.firstName[0]}{m.lastName[0]}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:C.dark,fontSize:"15px"}}>{m.firstName} {m.lastName}</div>
              <div style={{fontSize:"12px",color:cfg.color,fontWeight:700,marginTop:"2px"}}>{cfg.icon} {cfg.label}</div>
              <div style={{display:"flex",gap:"6px",marginTop:"5px",flexWrap:"wrap"}}>
                <span style={{fontSize:"11px",fontWeight:700,padding:"2px 8px",borderRadius:"10px",background:asCfg.bg,color:asCfg.color}}>{asCfg.icon} {asCfg.label}</span>
                {a.hasVisitedBefore&&<span style={{fontSize:"11px",fontWeight:700,padding:"2px 8px",borderRadius:"10px",background:C.successBg,color:C.success}}>✅ Visited Before</span>}
                {recipient.lat&&m.lat&&<span style={{fontSize:"11px",color:C.muted,padding:"2px 4px"}}>📍 {haversine(recipient.lat,recipient.lng,m.lat,m.lng)?.toFixed(1)} mi</span>}
              </div>
            </div>
            <button onClick={()=>onRemoveAssignment(a.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:"18px",padding:"6px"}}>✕</button>
          </div>;
        })}
      </div>

      {/* NEAREST CAREGIVER PANEL */}
      <div style={{background:`linear-gradient(135deg,${C.navyD},${C.navy})`,borderRadius:"18px",padding:"18px",marginBottom:"18px",boxShadow:"0 4px 20px rgba(13,34,56,0.3)"}}>
        <div style={{...SERIF,color:"white",fontSize:"19px",marginBottom:"4px"}}>📍 Nearest Caregivers</div>
        <div style={{color:"rgba(255,255,255,0.6)",fontSize:"13px",marginBottom:"16px"}}>
          {recipient.lat?"Ranked by distance from this person's address — closest first.":"Add this person's address to see nearest caregivers."}
        </div>
        {!recipient.lat?<div style={{background:"rgba(255,255,255,0.12)",borderRadius:"12px",padding:"18px",textAlign:"center",color:"rgba(255,255,255,0.7)",fontSize:"14px",lineHeight:1.6}}>📍 No address on file.<br/><span style={{fontSize:"13px"}}>Edit this person's profile to add their address and enable proximity matching.</span></div>
        :["deacon","deaconess","pastor"].map(role=>{
          const cfg=ROLE_CFG[role];
          const members=byRole(role).slice(0,5); if(!members.length) return null;
          return <div key={role} style={{marginBottom:"18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
              <div style={{color:C.gold,fontWeight:700,fontSize:"14px",textTransform:"uppercase",letterSpacing:"0.5px"}}>{cfg.icon} {cfg.plural} — Closest First</div>
              <button onClick={()=>onAutoAssign(recipient.id,role)} style={{padding:"7px 14px",background:C.gold,color:C.navyD,border:"none",borderRadius:"10px",fontSize:"12px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>⚡ Auto-Assign</button>
            </div>
            {members.map((m,rank)=>{
              const isAssigned=m.assignment&&(m.assignment.status==="accepted"||m.assignment.status==="pending");
              const aCfg=m.assignment?ASSIGN_ST[m.assignment.status]:null;
              return <div key={m.id} style={{background:isAssigned?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.1)",borderRadius:"12px",padding:"12px 14px",marginBottom:"8px",border:isAssigned?"1.5px solid rgba(255,255,255,0.4)":"1.5px solid rgba(255,255,255,0.1)"}}>
                <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                  <div style={{width:"36px",height:"36px",borderRadius:"10px",background:isAssigned?C.gold:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",color:isAssigned?C.navyD:"white",fontWeight:700,fontSize:"14px",flexShrink:0}}>{rank+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:"white",fontWeight:700,fontSize:"15px"}}>{m.firstName} {m.lastName}</div>
                    <div style={{display:"flex",gap:"8px",marginTop:"4px",flexWrap:"wrap",alignItems:"center"}}>
                      {m.dist!=null&&<span style={{color:"rgba(255,255,255,0.7)",fontSize:"12px"}}>📍 {m.dist.toFixed(1)} mi</span>}
                      <span style={{fontSize:"11px",padding:"2px 7px",borderRadius:"8px",background:"rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.8)",fontWeight:600}}>{m.load} assigned</span>
                      {m.hasVisited&&<span style={{fontSize:"11px",padding:"2px 7px",borderRadius:"8px",background:C.successBg,color:C.success,fontWeight:700}}>✅ Visited before</span>}
                      {aCfg&&<span style={{fontSize:"11px",padding:"2px 7px",borderRadius:"8px",background:aCfg.bg,color:aCfg.color,fontWeight:700}}>{aCfg.icon} {aCfg.label}</span>}
                    </div>
                  </div>
                  {!isAssigned&&<button onClick={()=>onManualAssign(recipient.id,m.id)} style={{padding:"8px 14px",background:"white",color:C.navy,border:"none",borderRadius:"10px",fontSize:"13px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Assign</button>}
                </div>
              </div>;
            })}
          </div>;
        })}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"22px"}}>
        <button onClick={onEdit} style={{padding:"16px 12px",background:C.infoBg,color:C.info,border:`2px solid ${C.infoBorder}`,borderRadius:"14px",fontSize:"15px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}><span style={{fontSize:"22px"}}>✏️</span>Edit Profile</button>
        <button onClick={onAddItem} style={{padding:"16px 12px",background:C.successBg,color:C.success,border:`2px solid ${C.successBorder}`,borderRadius:"14px",fontSize:"15px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}><span style={{fontSize:"22px"}}>➕</span>Add Care Item</button>
      </div>
      <SectionHead title="Care History" count={rItems.length}/>
      {rItems.length===0?<EmptyCard icon="📋" text="No care items recorded yet."/>:rItems.map(i=><ItemRow key={i.id} item={i} onSelect={()=>onSelectItem(i)}/>)}
    </div>
  </div>;
}

// ── ITEM DETAIL ───────────────────────────────────────────────────────
function ItemDetail({item,onEdit,onStatusChange,showToast}) {
  const tc=TYPES[item.contactType],sc=STATUS[item.status];
  const [noteText,setNoteText]=useState(""); const [showNote,setShowNote]=useState(false); const [localNotes,setLocalNotes]=useState([]);
  const d=new Date(item.scheduledDate);
  const addNote=()=>{if(!noteText.trim())return;setLocalNotes(p=>[...p,{text:noteText,time:new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}]);setNoteText("");setShowNote(false);showToast("Note saved!");};
  return <div style={{...SANS,backgroundColor:C.cream,minHeight:"100vh"}}>
    <div style={{background:`linear-gradient(150deg,${C.navyD},${C.navyL})`,padding:"20px 20px 24px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",right:"14px",top:"6px",opacity:0.06,fontSize:"90px"}}>✝</div>
      <div style={{display:"flex",alignItems:"flex-start",gap:"14px"}}>
        <div style={{width:"60px",height:"60px",borderRadius:"16px",background:"rgba(255,255,255,0.13)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"30px",flexShrink:0}}>{tc.icon}</div>
        <div>
          <div style={{...SERIF,color:"white",fontSize:"21px",lineHeight:1.2}}>{item.recipientName}</div>
          <div style={{color:"rgba(255,255,255,0.65)",fontSize:"15px",marginTop:"4px"}}>{tc.label}</div>
          <div style={{marginTop:"10px"}}><span style={{fontSize:"11px",fontWeight:700,padding:"5px 12px",borderRadius:"20px",background:sc.bg,color:sc.color,textTransform:"uppercase"}}>{sc.short}</span></div>
        </div>
      </div>
    </div>
    <div style={{padding:"20px 16px"}}>
      <InfoCard style={{marginBottom:"14px"}}><div style={{display:"flex",gap:"14px",alignItems:"center"}}><span style={{fontSize:"28px"}}>📅</span><div><div style={{fontSize:"12px",color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:"3px"}}>Scheduled For</div><div style={{fontSize:"17px",fontWeight:700,color:C.dark}}>{d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</div><div style={{fontSize:"15px",color:C.muted,marginTop:"2px"}}>at {d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</div></div></div></InfoCard>
      {item.notes&&<InfoCard style={{marginBottom:"14px"}}><div style={{fontSize:"12px",color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:"8px"}}>📌 Instructions</div><div style={{fontSize:"16px",color:C.dark,lineHeight:1.6}}>{item.notes}</div></InfoCard>}
      {item.outcome&&<div style={{background:C.successBg,border:`1.5px solid ${C.successBorder}`,borderRadius:"14px",padding:"16px",marginBottom:"14px"}}><div style={{fontSize:"12px",color:C.success,fontWeight:700,textTransform:"uppercase",marginBottom:"8px"}}>✅ What Happened</div><div style={{fontSize:"16px",color:C.success,lineHeight:1.6}}>{item.outcome}</div></div>}
      {item.nextSteps&&<div style={{background:C.infoBg,border:`1.5px solid ${C.infoBorder}`,borderRadius:"14px",padding:"16px",marginBottom:"14px"}}><div style={{fontSize:"12px",color:C.info,fontWeight:700,textTransform:"uppercase",marginBottom:"8px"}}>➡️ Next Steps</div><div style={{fontSize:"16px",color:C.info,lineHeight:1.6}}>{item.nextSteps}</div></div>}
      <InfoCard style={{marginBottom:"14px"}}>
        <div style={{fontSize:"13px",color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:"14px"}}>Update Status</div>
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          {[{key:"completed",icon:"✅",label:"Mark as Completed",sub:"I finished this visit/call",color:C.success,bg:C.successBg,border:C.successBorder},{key:"follow_up_needed",icon:"🔁",label:"Needs Follow-Up",sub:"I need to check back soon",color:C.warn,bg:C.warnBg,border:C.warnBorder},{key:"open",icon:"📋",label:"Still Open",sub:"Nothing done yet",color:C.info,bg:C.infoBg,border:C.infoBorder},{key:"closed",icon:"🗂️",label:"Close This Item",sub:"No further action needed",color:C.muted,bg:"#F3F4F6",border:"#D1D5DB"}].map(opt=>{
            const isCur=item.status===opt.key;
            return <button key={opt.key} onClick={()=>!isCur&&onStatusChange(item,opt.key)} style={{padding:"14px 16px",background:isCur?opt.bg:"white",border:`2px solid ${isCur?opt.color:C.border}`,borderRadius:"14px",cursor:isCur?"default":"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:"12px",textAlign:"left"}}>
              <span style={{fontSize:"22px",flexShrink:0}}>{opt.icon}</span>
              <div style={{flex:1}}><div style={{fontSize:"15px",fontWeight:700,color:isCur?opt.color:C.dark}}>{opt.label}{isCur?" ← Current":""}</div><div style={{fontSize:"13px",color:C.muted,marginTop:"2px"}}>{opt.sub}</div></div>
            </button>;
          })}
        </div>
      </InfoCard>
      {localNotes.length>0&&<InfoCard style={{marginBottom:"14px"}}><div style={{fontSize:"13px",color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:"12px"}}>📝 My Notes</div>{localNotes.map((n,i)=><div key={i} style={{paddingBottom:i<localNotes.length-1?"12px":0,marginBottom:i<localNotes.length-1?"12px":0,borderBottom:i<localNotes.length-1?`1px solid ${C.border}`:"none"}}><div style={{fontSize:"16px",color:C.dark,lineHeight:1.5}}>{n.text}</div><div style={{fontSize:"12px",color:C.muted,marginTop:"5px"}}>Saved today at {n.time}</div></div>)}</InfoCard>}
      {showNote?<InfoCard style={{marginBottom:"14px"}}><div style={{fontSize:"13px",color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:"10px"}}>Write a Note</div><textarea value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Write what happened or what needs to happen next…" rows={5} style={{...inp(),resize:"vertical",lineHeight:1.6}}/><div style={{display:"flex",gap:"10px",marginTop:"12px"}}><button onClick={()=>setShowNote(false)} style={{flex:1,padding:"14px",background:"#F3F4F6",color:C.muted,border:"none",borderRadius:"12px",fontSize:"15px",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button><button onClick={addNote} style={{flex:2,padding:"14px",background:`linear-gradient(135deg,${C.navy},${C.navyL})`,color:"white",border:"none",borderRadius:"12px",fontSize:"15px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Save Note</button></div></InfoCard>
      :<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"14px"}}>
        <button onClick={()=>setShowNote(true)} style={{padding:"16px 12px",background:C.infoBg,color:C.info,border:`2px solid ${C.infoBorder}`,borderRadius:"14px",fontSize:"14px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}><span style={{fontSize:"22px"}}>📝</span>Add a Note</button>
        <button onClick={onEdit} style={{padding:"16px 12px",background:C.warnBg,color:C.warn,border:`2px solid ${C.warnBorder}`,borderRadius:"14px",fontSize:"14px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}><span style={{fontSize:"22px"}}>✏️</span>Edit Item</button>
      </div>}
    </div>
  </div>;
}

// ── SCHEDULE ──────────────────────────────────────────────────────────
function ScheduleScreen({items,onSelectItem,onAdd}) {
  const [vm,setVm]=useState({y:2026,m:2}); const [selDay,setSelDay]=useState(3);
  const {y,m}=vm; const TODAY={y:2026,m:2,d:3};
  const getDayItems=d=>items.filter(i=>{const dt=new Date(i.scheduledDate);return dt.getFullYear()===y&&dt.getMonth()===m&&dt.getDate()===d;});
  const cells=[]; for(let i=0;i<new Date(y,m,1).getDay();i++) cells.push(null); for(let d=1;d<=new Date(y,m+1,0).getDate();d++) cells.push(d);
  const selItems=getDayItems(selDay);
  return <div style={{padding:"16px"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
      <button onClick={()=>{if(m===0)setVm({y:y-1,m:11});else setVm({y,m:m-1});setSelDay(1);}} style={{width:"48px",height:"48px",borderRadius:"14px",border:`2px solid ${C.border}`,background:"white",cursor:"pointer",fontSize:"22px",display:"flex",alignItems:"center",justifyContent:"center",color:C.navy}}>‹</button>
      <div style={{...SERIF,fontSize:"20px",color:C.dark,fontWeight:600}}>{new Date(y,m,1).toLocaleDateString("en-US",{month:"long",year:"numeric"})}</div>
      <button onClick={()=>{if(m===11)setVm({y:y+1,m:0});else setVm({y,m:m+1});setSelDay(1);}} style={{width:"48px",height:"48px",borderRadius:"14px",border:`2px solid ${C.border}`,background:"white",cursor:"pointer",fontSize:"22px",display:"flex",alignItems:"center",justifyContent:"center",color:C.navy}}>›</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:"6px"}}>{["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=><div key={d} style={{textAlign:"center",fontSize:"11px",fontWeight:700,color:C.muted,padding:"4px 0"}}>{d}</div>)}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"3px",marginBottom:"20px"}}>
      {cells.map((day,idx)=>{if(!day)return <div key={idx}/>;const di=getDayItems(day),isT=y===TODAY.y&&m===TODAY.m&&day===TODAY.d,isSel=day===selDay;return <div key={idx} onClick={()=>setSelDay(day)} style={{borderRadius:"12px",padding:"7px 2px 6px",textAlign:"center",cursor:"pointer",background:isSel?C.navy:isT?"#EFF6FF":"white",border:isT&&!isSel?`2px solid ${C.navy}`:"2px solid transparent",minHeight:"50px",display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}><span style={{fontSize:"14px",fontWeight:isT||isSel?700:400,color:isSel?"white":isT?C.navy:C.dark,lineHeight:1}}>{day}</span>{di.length>0&&<div style={{display:"flex",gap:"2px",justifyContent:"center"}}>{[...new Set(di.map(i=>TYPES[i.contactType].dotColor))].slice(0,3).map((col,i)=><div key={i} style={{width:"6px",height:"6px",borderRadius:"50%",background:isSel?"rgba(255,255,255,0.8)":col}}/>)}</div>}</div>;})}
    </div>
    <div style={{background:"white",borderRadius:"18px",padding:"18px",boxShadow:"0 2px 12px rgba(0,0,0,0.08)",marginBottom:"16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
        <div style={{...SERIF,fontSize:"17px",color:C.dark}}>{new Date(y,m,selDay).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</div>
        <span style={{fontSize:"12px",background:C.navy,color:"white",borderRadius:"20px",padding:"4px 12px",fontWeight:700}}>{selItems.length} scheduled</span>
      </div>
      {selItems.length===0?<div style={{color:C.muted,fontSize:"15px",textAlign:"center",padding:"20px 0"}}>Nothing scheduled.</div>:selItems.map(i=><ItemRow key={i.id} item={i} onSelect={()=>onSelectItem(i)}/>)}
    </div>
    <BigBtn onClick={onAdd} label="+ Schedule a Care Item"/>
  </div>;
}

// ── MORE ──────────────────────────────────────────────────────────────
function MoreScreen({onLogout,onTab}) {
  return <div style={{padding:"20px 16px"}}>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyL})`,borderRadius:"20px",padding:"22px",marginBottom:"26px",display:"flex",alignItems:"center",gap:"16px",position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(27,58,92,0.3)"}}>
      <div style={{position:"absolute",right:"14px",top:"6px",opacity:0.07,fontSize:"80px"}}>✝</div>
      <div style={{width:"60px",height:"60px",borderRadius:"18px",background:`linear-gradient(135deg,${C.gold},${C.goldL})`,display:"flex",alignItems:"center",justifyContent:"center",color:C.navy,fontWeight:700,fontSize:"24px",flexShrink:0}}>J</div>
      <div><div style={{...SERIF,color:"white",fontSize:"19px"}}>Deacon John</div><div style={{color:"rgba(255,255,255,0.55)",fontSize:"13px",marginTop:"2px"}}>john@mtzion.org</div><div style={{color:C.gold,fontSize:"12px",marginTop:"4px",fontWeight:700}}>Deacon · Care Team Member</div></div>
    </div>
    <MenuGroup title="Navigation" items={[{icon:"📅",label:"Schedule",sub:"View the care calendar",onClick:()=>onTab("schedule")},{icon:"⛪",label:"Ministry Team",sub:"Deacons, deaconesses & pastors",onClick:()=>onTab("team")}]}/>
    <MenuGroup title="Ministry Tools" items={[{icon:"📊",label:"Activity Logs",sub:"See history of all activity",onClick:()=>{}},{icon:"📄",label:"Reports",sub:"Download care reports",onClick:()=>{}}]}/>
    <MenuGroup title="Administration (Admin Only)" items={[{icon:"👥",label:"Manage Users",sub:"Add or remove accounts",adminOnly:true,onClick:()=>{}},{icon:"⚙️",label:"Settings",sub:"App configuration",adminOnly:true,onClick:()=>{}}]}/>
    <button onClick={onLogout} style={{width:"100%",padding:"16px",background:C.dangerBg,color:C.danger,border:`2px solid ${C.dangerBorder}`,borderRadius:"14px",fontSize:"16px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:"6px",display:"flex",alignItems:"center",justifyContent:"center",gap:"10px"}}><span style={{fontSize:"20px"}}>🚪</span>Sign Out</button>
  </div>;
}

// ── FORMS ─────────────────────────────────────────────────────────────
function RecipientForm({data,onClose,onSave}) {
  const [f,setF]=useState(data||{title:"Sister",firstName:"",lastName:"",cellPhone:"",homePhone:"",email:"",address:"",lat:null,lng:null,notes:"",status:"active",inactiveReason:""});
  const [errors,setErrors]=useState({});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const validate=()=>{const e={};if(!f.firstName.trim())e.firstName="Please enter a first name.";setErrors(e);return!Object.keys(e).length;};
  return <BottomSheet title={data?"Edit Profile":"Add Person to Roster"} onClose={onClose} onSave={()=>validate()&&onSave(f)}>
    <FRow label="Title"><select value={f.title} onChange={e=>set("title",e.target.value)} style={inp()}>{TITLES.map(t=><option key={t}>{t}</option>)}</select></FRow>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
      <FRow label="First Name ✱" error={errors.firstName}><input value={f.firstName} onChange={e=>set("firstName",e.target.value)} style={inp({borderColor:errors.firstName?"#EF4444":C.border})} placeholder="First name"/></FRow>
      <FRow label="Last Name"><input value={f.lastName} onChange={e=>set("lastName",e.target.value)} style={inp()} placeholder="Last name"/></FRow>
    </div>
    <FRow label="Cell Phone"><input value={f.cellPhone} onChange={e=>set("cellPhone",e.target.value)} style={inp()} placeholder="(909) 555-0000" type="tel"/></FRow>
    <FRow label="Home Phone"><input value={f.homePhone} onChange={e=>set("homePhone",e.target.value)} style={inp()} placeholder="(909) 555-0000" type="tel"/></FRow>
    <FRow label="Email"><input value={f.email} onChange={e=>set("email",e.target.value)} style={inp()} placeholder="email@example.com" type="email"/></FRow>
    <FRow label="Home Address (needed for Nearest Caregiver feature)"><input value={f.address} onChange={e=>set("address",e.target.value)} style={inp()} placeholder="Street, City, State ZIP"/><div style={{fontSize:"12px",color:C.info,marginTop:"5px"}}>💡 Address enables proximity matching to assign nearest deacons/deaconesses</div></FRow>
    <FRow label="Active Status?">
      <div style={{display:"flex",gap:"14px"}}>
        {[["active","✅ Active"],["inactive","⏸️ Inactive"]].map(([v,l])=><label key={v} style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",flex:1,padding:"12px",borderRadius:"12px",border:`2px solid ${f.status===v?C.navy:C.border}`,background:f.status===v?"#EFF6FF":"white"}}><input type="radio" checked={f.status===v} onChange={()=>set("status",v)} style={{accentColor:C.navy,width:"18px",height:"18px"}}/><span style={{fontSize:"14px",fontWeight:600,color:f.status===v?C.navy:C.muted}}>{l}</span></label>)}
      </div>
    </FRow>
    {f.status==="inactive"&&<FRow label="Why inactive?"><input value={f.inactiveReason} onChange={e=>set("inactiveReason",e.target.value)} style={inp()} placeholder="e.g. Moved away, hospitalized…"/></FRow>}
    <FRow label="Ministry Notes"><textarea value={f.notes} onChange={e=>set("notes",e.target.value)} rows={4} style={{...inp(),resize:"vertical",lineHeight:1.6}} placeholder="Any special notes the care team should know…"/></FRow>
  </BottomSheet>;
}

function TeamMemberForm({data,onClose,onSave}) {
  const [f,setF]=useState(data||{firstName:"",lastName:"",role:"deacon",phone:"",email:"",address:"",lat:null,lng:null,isActive:true});
  const [errors,setErrors]=useState({});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const validate=()=>{const e={};if(!f.firstName.trim())e.firstName="First name required.";setErrors(e);return!Object.keys(e).length;};
  return <BottomSheet title={data?"Edit Team Member":"Add Team Member"} onClose={onClose} onSave={()=>validate()&&onSave(f)}>
    <FRow label="Ministry Role ✱">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
        {Object.entries(ROLE_CFG).map(([k,v])=>{const sel=f.role===k;return <div key={k} onClick={()=>set("role",k)} style={{display:"flex",alignItems:"center",gap:"8px",padding:"14px",borderRadius:"14px",border:`2px solid ${sel?v.color:C.border}`,cursor:"pointer",background:sel?v.bg:"white"}}><span style={{fontSize:"20px"}}>{v.icon}</span><span style={{fontSize:"14px",fontWeight:700,color:sel?v.color:C.muted}}>{v.label}</span></div>;})}
      </div>
    </FRow>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
      <FRow label="First Name ✱" error={errors.firstName}><input value={f.firstName} onChange={e=>set("firstName",e.target.value)} style={inp({borderColor:errors.firstName?"#EF4444":C.border})} placeholder="First name"/></FRow>
      <FRow label="Last Name"><input value={f.lastName} onChange={e=>set("lastName",e.target.value)} style={inp()} placeholder="Last name"/></FRow>
    </div>
    <FRow label="Phone"><input value={f.phone} onChange={e=>set("phone",e.target.value)} style={inp()} placeholder="(909) 555-0000" type="tel"/></FRow>
    <FRow label="Email"><input value={f.email} onChange={e=>set("email",e.target.value)} style={inp()} placeholder="email@mtzion.org" type="email"/></FRow>
    <FRow label="Home Address (required for proximity matching)"><input value={f.address} onChange={e=>set("address",e.target.value)} style={inp()} placeholder="Street, City, State ZIP"/><div style={{fontSize:"12px",color:C.info,marginTop:"5px"}}>💡 Used to calculate distance to care recipients</div></FRow>
    <FRow label="Active?">
      <div style={{display:"flex",gap:"14px"}}>
        {[[true,"✅ Active"],[false,"⏸️ Inactive"]].map(([v,l])=><label key={String(v)} style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",flex:1,padding:"12px",borderRadius:"12px",border:`2px solid ${f.isActive===v?C.navy:C.border}`,background:f.isActive===v?"#EFF6FF":"white"}}><input type="radio" checked={f.isActive===v} onChange={()=>set("isActive",v)} style={{accentColor:C.navy,width:"18px",height:"18px"}}/><span style={{fontSize:"14px",fontWeight:600,color:f.isActive===v?C.navy:C.muted}}>{l}</span></label>)}
      </div>
    </FRow>
  </BottomSheet>;
}

function ItemForm({data,recipients,prefill,onClose,onSave}) {
  const active=recipients.filter(r=>r.status==="active");
  const [f,setF]=useState(data||{recipientId:prefill?.recipientId||active[0]?.id||"",contactType:"visit",status:"open",scheduledDate:"2026-03-03T10:00",notes:"",outcome:"",nextSteps:""});
  const [errors,setErrors]=useState({});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const validate=()=>{const e={};if(!f.recipientId)e.rec="Please select a person.";if(!f.scheduledDate)e.date="Please choose a date.";setErrors(e);return!Object.keys(e).length;};
  const showOutcome=!!data||["completed","follow_up_needed","closed"].includes(f.status);
  return <BottomSheet title={data?"Edit Care Item":"Schedule New Care Item"} onClose={onClose} onSave={()=>validate()&&onSave(f)}>
    <FRow label="Who is this for? ✱" error={errors.rec}><select value={f.recipientId} onChange={e=>set("recipientId",e.target.value)} style={inp({borderColor:errors.rec?"#EF4444":C.border})}><option value="">— Select a person —</option>{active.map(r=><option key={r.id} value={r.id}>{r.title} {r.firstName} {r.lastName}</option>)}</select></FRow>
    <FRow label="Type of Contact">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
        {Object.entries(TYPES).map(([k,v])=>{const sel=f.contactType===k;return <div key={k} onClick={()=>set("contactType",k)} style={{display:"flex",alignItems:"center",gap:"10px",padding:"14px",borderRadius:"14px",border:`2px solid ${sel?C.navy:C.border}`,cursor:"pointer",background:sel?"#EFF6FF":"white"}}><span style={{fontSize:"22px"}}>{v.icon}</span><span style={{fontSize:"15px",fontWeight:700,color:sel?C.navy:C.muted}}>{v.label}</span></div>;})}
      </div>
    </FRow>
    <FRow label="When? ✱" error={errors.date}><input type="datetime-local" value={f.scheduledDate} onChange={e=>set("scheduledDate",e.target.value)} style={inp({borderColor:errors.date?"#EF4444":C.border})}/></FRow>
    <FRow label="Status"><select value={f.status} onChange={e=>set("status",e.target.value)} style={inp()}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></FRow>
    <FRow label="Instructions (optional)"><textarea value={f.notes} onChange={e=>set("notes",e.target.value)} rows={3} style={{...inp(),resize:"vertical",lineHeight:1.6}} placeholder="Any special instructions…"/></FRow>
    {showOutcome&&<><FRow label="What happened? (Outcome)"><textarea value={f.outcome} onChange={e=>set("outcome",e.target.value)} rows={3} style={{...inp(),resize:"vertical",lineHeight:1.6}} placeholder="Describe what happened…"/></FRow><FRow label="Next Steps"><textarea value={f.nextSteps} onChange={e=>set("nextSteps",e.target.value)} rows={2} style={{...inp(),resize:"vertical",lineHeight:1.6}} placeholder="Follow-up actions…"/></FRow></>}
  </BottomSheet>;
}

// ── MAIN APP ──────────────────────────────────────────────────────────
// ── INITIAL STATE — empty when Sheets is configured, demo data as fallback ──
const EMPTY = { recipients:[], team:[], assignments:[], items:[] };

const MY_TEAM_ID = "t4"; // Deacon John (Thomas Anderson for demo)

export default function App() {
  const [screen,setScreen]=useState("login");
  const [tab,setTab]=useState("home");
  const [showPw,setShowPw]=useState(false);
  const [email,setEmail]=useState("john.deacon@mtzion.org");
  const [pw,setPw]=useState("ministry2026");
  const [loginErr,setLoginErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [dataLoading,setDataLoading]=useState(false);
  const [dataErr,setDataErr]=useState("");
  const [recipients,setRecipients]=useState(USE_SHEETS?[]:INIT_R);
  const [team,setTeam]=useState(USE_SHEETS?[]:INIT_T);
  const [assignments,setAssignments]=useState(USE_SHEETS?[]:INIT_A);
  const [items,setItems]=useState(USE_SHEETS?[]:INIT_I);
  const [search,setSearch]=useState("");
  const [rFilter,setRFilter]=useState("all");
  const [stFilter,setStFilter]=useState("all");
  const [tyFilter,setTyFilter]=useState("all");
  const [selR,setSelR]=useState(null);
  const [selI,setSelI]=useState(null);
  const [selT,setSelT]=useState(null);
  const [modal,setModal]=useState(null);
  const [toast,setToast]=useState(null);
  const [confirm,setConfirm]=useState(null);

  useEffect(()=>{const l=document.createElement("link");l.href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Source+Sans+3:wght@300;400;500;600;700&display=swap";l.rel="stylesheet";document.head.appendChild(l);},[]);

  // ── LOAD FROM GOOGLE SHEETS ON LOGIN ─────────────────────────────────
  const loadFromSheets = useCallback(async () => {
    if (!USE_SHEETS) return;
    setDataLoading(true); setDataErr("");
    try {
      const data = await sheetsRead();
      const rawRecipients = data.recipients?.length ? data.recipients : [];
      const rawTeam       = data.team?.length       ? data.team       : [];
      setRecipients(rawRecipients);
      setTeam(rawTeam);
      setAssignments(data.assignments?.length ? data.assignments : []);
      setItems(data.items?.length ? data.items : []);
      setDataLoading(false);

      // Auto-geocode anyone missing coordinates — runs quietly in background
      const needsGeoR = rawRecipients.some(r=>r.address&&(!r.lat||!r.lng));
      const needsGeoT = rawTeam.some(t=>t.address&&(!t.lat||!t.lng));
      if (needsGeoR) {
        await geocodeAll(rawRecipients, setRecipients);
      }
      if (needsGeoT) {
        await geocodeAll(rawTeam, setTeam);
      }
    } catch(e) {
      setDataErr("Could not load live data. Check your connection and tap to retry.");
      setRecipients(r => r.length ? r : INIT_R);
      setTeam(t => t.length ? t : INIT_T);
      setAssignments(a => a.length ? a : INIT_A);
      setItems(i => i.length ? i : INIT_I);
      setDataLoading(false);
    }
  }, []);

  // ── SYNC WRITE TO SHEETS ─────────────────────────────────────────────
  const syncWrite = useCallback(async (action, payload) => {
    if (!USE_SHEETS) return;
    try { await sheetsWrite(action, payload); } catch(e) { /* silent — local state already updated */ }
  }, []);

  const showToast=(message,type="success")=>setToast({message,type});

  const handleLogin=()=>{if(!email||!pw){setLoginErr("Please enter your email and password.");return;}setLoginErr("");setLoading(true);setTimeout(()=>{setLoading(false);setScreen("app");loadFromSheets();},1200);};

  const handleAccept=id=>{setAssignments(p=>p.map(a=>a.id===id?{...a,status:"accepted"}:a));setConfirm(null);showToast("Assignment accepted! 🙏");syncWrite("updateAssignment",{id,status:"accepted"});};
  const handleDecline=id=>{
    const dec=assignments.find(a=>a.id===id);
    setAssignments(p=>p.map(a=>a.id===id?{...a,status:"declined"}:a));
    if(dec){const next=autoAssign(dec.recipientId,team.find(t=>t.id===dec.teamMemberId)?.role,team,assignments.map(a=>a.id===id?{...a,status:"declined"}:a),recipients);if(next){setAssignments(p=>[...p.map(a=>a.id===id?{...a,status:"declined"}:a),next]);syncWrite("addAssignment",next);}}
    setConfirm(null);showToast("Assignment declined. Next person notified.","warn");syncWrite("updateAssignment",{id,status:"declined"});
  };
  const handleAutoAssign=(recipientId,role)=>{const next=autoAssign(recipientId,role,team,assignments,recipients);if(next){setAssignments(p=>[...p,next]);const person=team.find(t=>t.id===next.teamMemberId);showToast(`${ROLE_CFG[role].label} ${person?.firstName} ${person?.lastName} notified!`);syncWrite("addAssignment",next);}else showToast(`No available ${ROLE_CFG[role].plural}.`,"warn");};
  const handleManualAssign=(recipientId,teamMemberId)=>{const already=assignments.find(a=>a.teamMemberId===teamMemberId&&a.recipientId===recipientId&&(a.status==="accepted"||a.status==="pending"));if(already){showToast("This person is already assigned.","warn");setConfirm(null);return;}const m=team.find(t=>t.id===teamMemberId);const nA={id:`a${Date.now()}`,teamMemberId,recipientId,assignedAt:new Date().toISOString(),status:"pending",hasVisitedBefore:assignments.some(a=>a.teamMemberId===teamMemberId&&a.recipientId===recipientId&&a.status==="accepted")};setAssignments(p=>[...p,nA]);showToast(`${m?.firstName} ${m?.lastName} notified!`);syncWrite("addAssignment",nA);setConfirm(null);};
  const removeAssignment=id=>{setAssignments(p=>p.filter(a=>a.id!==id));setConfirm(null);showToast("Assignment removed.");syncWrite("deleteAssignment",{id});};

  const saveRecipient=d=>{if(d.id){setRecipients(p=>p.map(r=>r.id===d.id?d:r));if(selR?.id===d.id)setSelR(d);showToast("Profile updated!");syncWrite("updateRecipient",d);}else{const nr={...d,id:`r${Date.now()}`};setRecipients(p=>[...p,nr]);showToast("Person added to roster!");syncWrite("addRecipient",nr);}setModal(null);};
  const saveTeam=d=>{if(d.id){setTeam(p=>p.map(t=>t.id===d.id?d:t));if(selT?.id===d.id)setSelT(d);showToast("Team member updated!");syncWrite("updateTeamMember",d);}else{const nt={...d,id:`t${Date.now()}`,isActive:true,linkedRecipientId:null};setTeam(p=>[...p,nt]);showToast(`${ROLE_CFG[d.role]?.label||d.role} added to team!`);syncWrite("addTeamMember",nt);}setModal(null);};
  const saveCareItem=d=>{if(d.id){setItems(p=>p.map(i=>i.id===d.id?d:i));if(selI?.id===d.id)setSelI(d);showToast("Care item updated!");syncWrite("updateItem",d);}else{const rec=recipients.find(r=>r.id===d.recipientId);const ni={...d,id:`i${Date.now()}`,recipientName:rec?`${rec.title} ${rec.firstName} ${rec.lastName}`:"Unknown"};setItems(p=>[...p,ni]);showToast("Care item scheduled!");syncWrite("addItem",ni);}setModal(null);};
  const updateItemStatus=(item,ns)=>{const u={...item,status:ns};setItems(p=>p.map(i=>i.id===item.id?u:i));if(selI?.id===item.id)setSelI(u);showToast({completed:"Marked Completed ✅",follow_up_needed:"Marked Needs Follow-Up",closed:"Marked Closed",open:"Reopened"}[ns]||"Status updated");syncWrite("updateItem",u);};

  const stats={active:recipients.filter(r=>r.status==="active").length,open:items.filter(i=>i.status==="open").length,done:items.filter(i=>i.status==="completed").length,followUps:items.filter(i=>i.status==="follow_up_needed").length,pending:assignments.filter(a=>a.status==="pending").length};
  const filtR=recipients.filter(r=>{const q=search.toLowerCase();return(!q||`${r.firstName} ${r.lastName}`.toLowerCase().includes(q)||(r.cellPhone||"").includes(q))&&(rFilter==="all"||r.status===rFilter);});
  const filtI=items.filter(i=>(stFilter==="all"||i.status===stFilter)&&(tyFilter==="all"||i.contactType===tyFilter));
  const goTab=t=>{setTab(t);setSelR(null);setSelI(null);setSelT(null);setSearch("");};
  const myPending=assignments.filter(a=>a.teamMemberId===MY_TEAM_ID&&a.status==="pending");

  if(screen==="login") return <LoginScreen showPw={showPw} setShowPw={setShowPw} email={email} setEmail={setEmail} pw={pw} setPw={setPw} err={loginErr} loading={loading} onLogin={handleLogin}/>;

  const headerTitle=selI?"Care Item":selT?"Team Member":selR?"Person's Profile":{home:"Home",roster:"Care Roster",items:"Care Items",schedule:"Schedule",team:"Ministry Team",more:"More"}[tab];

  return <div style={{...SANS,backgroundColor:C.cream,minHeight:"100vh",maxWidth:"430px",margin:"0 auto",display:"flex",flexDirection:"column"}}>
    {/* HEADER */}
    <div style={{background:`linear-gradient(150deg,${C.navyD},${C.navy} 55%,${C.navyL})`,padding:"52px 20px 18px",flexShrink:0,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",right:"16px",top:"6px",opacity:0.07,fontSize:"80px",lineHeight:1,pointerEvents:"none"}}>✝</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          {(selR||selI||selT)&&<button onClick={()=>{selI?setSelI(null):selT?setSelT(null):setSelR(null);}} style={{background:"none",border:"none",color:C.gold,cursor:"pointer",fontSize:"15px",fontFamily:"inherit",display:"flex",alignItems:"center",gap:"4px",fontWeight:600,padding:"0 0 8px",marginBottom:"2px"}}>‹ Back</button>}
          <div style={{...SERIF,color:C.gold,fontSize:"10px",letterSpacing:"2.5px",textTransform:"uppercase",marginBottom:"3px"}}>Mt. Zion Ontario</div>
          <div style={{color:"white",fontSize:"20px",fontWeight:700}}>{headerTitle}</div>
        </div>
        <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
          <button onClick={()=>goTab("team")} style={{position:"relative",background:"none",border:"none",cursor:"pointer",padding:"4px"}}>
            <span style={{fontSize:"22px"}}>🔔</span>
            {(stats.followUps+stats.pending)>0&&<span style={{position:"absolute",top:"-2px",right:"-2px",background:"#EF4444",color:"white",borderRadius:"50%",width:"18px",height:"18px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",fontWeight:700,border:"2px solid white"}}>{stats.followUps+stats.pending}</span>}
          </button>
          <div style={{width:"38px",height:"38px",borderRadius:"50%",background:`linear-gradient(135deg,${C.gold},${C.goldL})`,display:"flex",alignItems:"center",justifyContent:"center",color:C.navy,fontWeight:700,fontSize:"16px",cursor:"pointer",flexShrink:0}}>J</div>
        </div>
      </div>
    </div>

    {/* DATA LOADING / ERROR */}
    {dataLoading&&<div style={{background:C.infoBg,borderBottom:`2px solid ${C.infoBorder}`,padding:"12px 18px",display:"flex",gap:"10px",alignItems:"center",...SANS}}><span style={{fontSize:"18px"}}>⏳</span><span style={{fontSize:"14px",color:C.info,fontWeight:600}}>Loading live data from Google Sheets…</span></div>}
    {dataErr&&<div style={{background:C.warnBg,borderBottom:`2px solid ${C.warnBorder}`,padding:"12px 18px",display:"flex",gap:"10px",alignItems:"center",...SANS}} onClick={loadFromSheets}><span style={{fontSize:"18px"}}>⚠️</span><div><div style={{fontSize:"14px",color:C.warn,fontWeight:700}}>{dataErr}</div><div style={{fontSize:"12px",color:C.warn}}>Tap here to retry</div></div></div>}
    {USE_SHEETS&&!dataLoading&&!dataErr&&<div style={{background:C.successBg,borderBottom:`1px solid ${C.successBorder}`,padding:"8px 18px",display:"flex",gap:"8px",alignItems:"center",...SANS}}><span style={{fontSize:"14px"}}>🟢</span><span style={{fontSize:"12px",color:C.success,fontWeight:600}}>Live — synced with Google Sheets{(recipients.some(r=>r.address&&(!r.lat||!r.lng))||team.some(t=>t.address&&(!t.lat||!t.lng)))?" · 📍 Calculating distances…":""}</span><button onClick={loadFromSheets} style={{marginLeft:"auto",background:"none",border:"none",color:C.success,fontSize:"12px",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>Refresh ↻</button></div>}

    {/* PENDING BANNER */}
    {myPending.length>0&&!selR&&!selI&&!selT&&tab==="home"&&<div style={{background:`linear-gradient(135deg,${C.warnBg},#FEF3C7)`,borderBottom:`2px solid ${C.warnBorder}`,padding:"14px 18px",display:"flex",gap:"12px",alignItems:"center",cursor:"pointer"}} onClick={()=>goTab("team")}>
      <span style={{fontSize:"26px",flexShrink:0}}>📬</span>
      <div style={{flex:1}}><div style={{fontWeight:700,color:"#92400E",fontSize:"15px"}}>You have {myPending.length} pending assignment{myPending.length>1?"s":""}</div><div style={{color:C.warn,fontSize:"13px",marginTop:"2px"}}>Tap to view and accept or decline</div></div>
      <span style={{color:C.warn,fontSize:"24px"}}>›</span>
    </div>}

    {/* CONTENT */}
    <div style={{flex:1,overflowY:"auto",paddingBottom:"90px"}}>
      {selI?<ItemDetail item={selI} onEdit={()=>setModal({type:"editItem",data:selI})} onStatusChange={updateItemStatus} showToast={showToast}/>
      :selT?<TeamMemberDetailScreen member={selT} assignments={assignments} recipients={recipients} items={items} onEdit={()=>setModal({type:"editTeam",data:selT})} onAccept={id=>setConfirm({message:"Accept this assignment?",sub:"You will be shown as the assigned caregiver.",onYes:()=>handleAccept(id),onNo:()=>setConfirm(null),yesLabel:"Accept ✅",yesColor:C.success})} onDecline={id=>setConfirm({message:"Decline this assignment?",sub:"The next available person will be notified.",onYes:()=>handleDecline(id),onNo:()=>setConfirm(null),yesLabel:"Decline",yesColor:C.danger})}/>
      :selR?<RecipientDetail recipient={selR} items={items} team={team} assignments={assignments} recipients={recipients} onBack={()=>setSelR(null)} onSelectItem={i=>setSelI(i)} onEdit={()=>setModal({type:"editRecipient",data:selR})} onAddItem={()=>setModal({type:"addItem",data:{recipientId:selR.id}})} onAutoAssign={handleAutoAssign} onManualAssign={(rid,tid)=>setConfirm({message:"Assign this person?",sub:"They will receive a notification and can accept or decline.",onYes:()=>handleManualAssign(rid,tid),onNo:()=>setConfirm(null),yesLabel:"Assign & Notify",yesColor:C.navy})} onRemoveAssignment={id=>setConfirm({message:"Remove this assignment?",onYes:()=>removeAssignment(id),onNo:()=>setConfirm(null),yesLabel:"Remove",yesColor:C.danger})}/>
      :tab==="home"?<HomeScreen stats={stats} items={items} assignments={assignments} team={team} recipients={recipients} myTeamId={MY_TEAM_ID} onTab={goTab} onSelectItem={i=>setSelI(i)} onAccept={handleAccept} onDecline={handleDecline}/>
      :tab==="roster"?<RosterScreen recipients={filtR} search={search} setSearch={setSearch} filter={rFilter} setFilter={setRFilter} onSelect={r=>setSelR(r)} onAdd={()=>setModal({type:"addRecipient"})}/>
      :tab==="items"?<ItemsScreen items={filtI} stFilter={stFilter} setStFilter={setStFilter} tyFilter={tyFilter} setTyFilter={setTyFilter} onSelect={i=>setSelI(i)} onAdd={()=>setModal({type:"addItem"})}/>
      :tab==="schedule"?<ScheduleScreen items={items} onSelectItem={i=>setSelI(i)} onAdd={()=>setModal({type:"addItem"})}/>
      :tab==="team"?<TeamScreen team={team} assignments={assignments} recipients={recipients} myTeamId={MY_TEAM_ID} onSelect={t=>setSelT(t)} onAdd={()=>setModal({type:"addTeam"})} onAccept={handleAccept} onDecline={id=>setConfirm({message:"Decline this assignment?",sub:"Next person in rotation will be notified.",onYes:()=>handleDecline(id),onNo:()=>setConfirm(null),yesLabel:"Decline",yesColor:C.danger})}/>
      :tab==="more"?<MoreScreen onLogout={()=>{setScreen("login");setTab("home");}} onTab={goTab}/>:null}
    </div>

    {/* BOTTOM NAV */}
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:"430px",background:"white",borderTop:`1px solid ${C.border}`,display:"flex",paddingBottom:"env(safe-area-inset-bottom,8px)",paddingTop:"6px",boxShadow:"0 -4px 24px rgba(0,0,0,0.1)",zIndex:100}}>
      {[{id:"home",icon:"🏠",label:"Home"},{id:"roster",icon:"👥",label:"Roster"},{id:"items",icon:"📋",label:"Care Items"},{id:"team",icon:"⛪",label:"Team"},{id:"more",icon:"☰",label:"More"}].map(t=>{
        const isActive=tab===t.id&&!selR&&!selI&&!selT;
        return <button key={t.id} onClick={()=>goTab(t.id)} style={{flex:1,background:"none",border:"none",cursor:"pointer",padding:"6px 2px 6px",display:"flex",flexDirection:"column",alignItems:"center",gap:"2px",minHeight:"56px",justifyContent:"center"}}>
          <div style={{position:"relative"}}>
            <span style={{fontSize:"22px"}}>{t.icon}</span>
            {t.id==="items"&&stats.followUps>0&&<span style={{position:"absolute",top:"-5px",right:"-10px",background:"#EF4444",color:"white",borderRadius:"50%",width:"17px",height:"17px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",fontWeight:700}}>{stats.followUps}</span>}
            {t.id==="team"&&stats.pending>0&&<span style={{position:"absolute",top:"-5px",right:"-10px",background:C.warn,color:"white",borderRadius:"50%",width:"17px",height:"17px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",fontWeight:700}}>{stats.pending}</span>}
          </div>
          <span style={{fontSize:"10px",fontWeight:isActive?700:500,color:isActive?C.navy:C.muted}}>{t.label}</span>
          {isActive&&<div style={{width:"24px",height:"3px",borderRadius:"2px",background:C.gold}}/>}
        </button>;
      })}
    </div>

    {modal?.type==="addRecipient"  &&<RecipientForm onClose={()=>setModal(null)} onSave={saveRecipient}/>}
    {modal?.type==="editRecipient" &&<RecipientForm data={modal.data} onClose={()=>setModal(null)} onSave={saveRecipient}/>}
    {modal?.type==="addItem"       &&<ItemForm recipients={recipients} prefill={modal.data} onClose={()=>setModal(null)} onSave={saveCareItem}/>}
    {modal?.type==="editItem"      &&<ItemForm recipients={recipients} data={modal.data} onClose={()=>setModal(null)} onSave={saveCareItem}/>}
    {modal?.type==="addTeam"       &&<TeamMemberForm onClose={()=>setModal(null)} onSave={saveTeam}/>}
    {modal?.type==="editTeam"      &&<TeamMemberForm data={modal.data} onClose={()=>setModal(null)} onSave={saveTeam}/>}

    {toast&&<Toast {...toast} onDone={()=>setToast(null)}/>}
    {confirm&&<Confirm {...confirm}/>}
  </div>;
}

function TeamMemberDetailScreen({member,assignments,recipients,items,onEdit,onAccept,onDecline}) {
  const cfg=ROLE_CFG[member.role]||ROLE_CFG.deacon;
  const myA=assignments.filter(a=>a.teamMemberId===member.id);
  const accepted=myA.filter(a=>a.status==="accepted"), pending=myA.filter(a=>a.status==="pending");
  const theirIds=new Set(accepted.map(a=>a.recipientId));
  const visits=items.filter(i=>theirIds.has(i.recipientId)&&i.status==="completed");
  return <div style={{...SANS,backgroundColor:C.cream,minHeight:"100vh"}}>
    <div style={{background:`linear-gradient(150deg,${C.navyD},${C.navyL})`,padding:"20px 20px 24px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",right:"14px",top:"6px",opacity:0.06,fontSize:"90px"}}>✝</div>
      <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
        <div style={{width:"68px",height:"68px",borderRadius:"20px",background:`linear-gradient(135deg,${cfg.color},${cfg.color}cc)`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"26px",flexShrink:0}}>{member.firstName[0]}{member.lastName[0]}</div>
        <div><div style={{...SERIF,color:"white",fontSize:"22px",lineHeight:1.2}}>{member.firstName} {member.lastName}</div><span style={{display:"inline-block",marginTop:"6px",fontSize:"11px",fontWeight:700,padding:"4px 12px",borderRadius:"20px",background:cfg.bg,color:cfg.color,textTransform:"uppercase"}}>{cfg.icon} {cfg.label}</span></div>
      </div>
      <div style={{display:"flex",gap:"10px",marginTop:"18px"}}>
        <a href={`tel:${member.phone.replace(/\D/g,"")}`} style={{flex:1,textDecoration:"none"}}><div style={{background:"rgba(255,255,255,0.15)",borderRadius:"14px",padding:"12px 8px",textAlign:"center",border:"1.5px solid rgba(255,255,255,0.2)"}}><div style={{fontSize:"20px",marginBottom:"4px"}}>📞</div><div style={{color:"white",fontSize:"12px",fontWeight:700}}>Call</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:"10px"}}>{member.phone}</div></div></a>
        <a href={`mailto:${member.email}`} style={{flex:1,textDecoration:"none"}}><div style={{background:"rgba(255,255,255,0.15)",borderRadius:"14px",padding:"12px 8px",textAlign:"center",border:"1.5px solid rgba(255,255,255,0.2)"}}><div style={{fontSize:"20px",marginBottom:"4px"}}>✉️</div><div style={{color:"white",fontSize:"12px",fontWeight:700}}>Email</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:"10px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{member.email.split("@")[0]}</div></div></a>
        <div style={{flex:1}}><div style={{background:"rgba(255,255,255,0.15)",borderRadius:"14px",padding:"12px 8px",textAlign:"center",border:"1.5px solid rgba(255,255,255,0.2)"}}><div style={{fontSize:"20px",marginBottom:"4px"}}>🏠</div><div style={{color:"white",fontSize:"12px",fontWeight:700}}>Area</div><div style={{color:"rgba(255,255,255,0.6)",fontSize:"10px"}}>{member.address.split(",")[1]?.trim()||"CA"}</div></div></div>
      </div>
    </div>
    <div style={{padding:"20px 16px"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px",marginBottom:"18px"}}>
        {[{v:accepted.length,l:"Assigned",c:C.success,bg:C.successBg},{v:pending.length,l:"Pending",c:C.warn,bg:C.warnBg},{v:visits.length,l:"Completed",c:C.navy,bg:C.infoBg}].map((s,i)=><div key={i} style={{background:s.bg,borderRadius:"14px",padding:"14px 10px",textAlign:"center"}}><div style={{fontSize:"28px",fontWeight:700,color:s.c}}>{s.v}</div><div style={{fontSize:"11px",color:s.c,fontWeight:700,textTransform:"uppercase",marginTop:"3px"}}>{s.l}</div></div>)}
      </div>
      <InfoCard style={{marginBottom:"14px"}}><div style={{fontSize:"12px",color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:"8px"}}>📍 Home Address</div><div style={{fontSize:"15px",color:C.dark}}>{member.address}</div><a href={`https://maps.google.com/?q=${encodeURIComponent(member.address)}`} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",marginTop:"8px",color:C.info,fontSize:"14px",fontWeight:600,textDecoration:"none"}}>Open in Maps →</a></InfoCard>
      {pending.length>0&&<div style={{background:C.warnBg,border:`2px solid ${C.warnBorder}`,borderRadius:"14px",padding:"16px",marginBottom:"14px"}}>
        <div style={{fontWeight:700,color:"#92400E",fontSize:"15px",marginBottom:"12px"}}>📬 Pending — Your Response Needed</div>
        {pending.map(a=>{const rec=recipients.find(r=>r.id===a.recipientId);return <div key={a.id} style={{background:"white",borderRadius:"12px",padding:"14px",marginBottom:"10px"}}><div style={{fontWeight:700,color:C.dark,fontSize:"15px"}}>{rec?.title} {rec?.firstName} {rec?.lastName}</div><div style={{color:C.muted,fontSize:"13px",marginTop:"2px"}}>{rec?.address||"No address"}</div>{rec?.lat&&member.lat&&<div style={{color:C.warn,fontSize:"13px",fontWeight:600,marginTop:"3px"}}>📍 {haversine(member.lat,member.lng,rec.lat,rec.lng)?.toFixed(1)} miles away</div>}<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginTop:"10px"}}><button onClick={()=>onDecline(a.id)} style={{padding:"11px",background:C.dangerBg,color:C.danger,border:`2px solid ${C.dangerBorder}`,borderRadius:"10px",fontSize:"14px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>❌ Decline</button><button onClick={()=>onAccept(a.id)} style={{padding:"11px",background:C.successBg,color:C.success,border:`2px solid ${C.successBorder}`,borderRadius:"10px",fontSize:"14px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✅ Accept</button></div></div>;})}
      </div>}
      {accepted.length>0&&<div style={{marginBottom:"18px"}}><SectionHead title="Currently Assigned To" count={accepted.length}/>{accepted.map(a=>{const rec=recipients.find(r=>r.id===a.recipientId);return <div key={a.id} style={{background:"white",borderRadius:"14px",padding:"14px 16px",marginBottom:"10px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",display:"flex",alignItems:"center",gap:"12px"}}><div style={{width:"44px",height:"44px",borderRadius:"12px",background:`linear-gradient(135deg,${C.navy},${C.navyL})`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"16px",flexShrink:0}}>{rec?.firstName[0]}{rec?.lastName?.[0]||""}</div><div style={{flex:1}}><div style={{fontWeight:700,color:C.dark,fontSize:"15px"}}>{rec?.title} {rec?.firstName} {rec?.lastName}</div>{rec?.lat&&member.lat&&<div style={{color:C.muted,fontSize:"13px",marginTop:"2px"}}>📍 {haversine(member.lat,member.lng,rec.lat,rec.lng)?.toFixed(1)} mi away</div>}{a.hasVisitedBefore&&<span style={{fontSize:"11px",fontWeight:700,background:C.successBg,color:C.success,padding:"2px 8px",borderRadius:"10px",border:`1px solid ${C.successBorder}`,marginTop:"4px",display:"inline-block"}}>✅ Has visited before</span>}</div></div>;})}</div>}
      <BigBtn onClick={onEdit} label="✏️ Edit Team Member Profile"/>
    </div>
  </div>;
}
