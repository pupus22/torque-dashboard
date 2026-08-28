(function(){
'use strict';

var CFG = window.TORQUE_FIREBASE || {};
var APP_VERSION = 'GitHub Firebase v1.4.0 FOLLOW';
var MAX_COMPARE = 4;
var GPS_KEYS = {lat:'kff1006', lon:'kff1005', acc:'kff1239', bearing:'kff1007', speed:'kff1001'};
var DEFAULT_KEYS = ['kd','kc','k5','kff1203','kff1206','k42'];

var S = {
  auth:null,
  uid:'',
  devices:{},
  liveAll:{},
  catalog:{},
  config:{},
  deviceId:'',
  live:null,
  tab:'live',
  cardKeys:[],
  liveGraphKeys:[],
  historyGraphKeys:[],
  liveRangeMinutes:10,
  liveCustom:null,
  liveTrace:null,
  historySessions:{},
  historySession:null,
  historyTelemetry:null,
  historyRange:'whole',
  historyCustom:null,
  historyTrace:null,
  charts:{live:null, history:null},
  maps:{live:null, history:null},
  mapReady:{live:false, history:false},
  routeData:{live:null, history:null},
  traceMarkers:{live:null, history:null},
  vehicleMarker:null,
  liveFollow:true,
  liveFollowZoom:16,
  latestLiveGps:null,
  mapResizeObservers:{live:null, history:null},
  telemetryCache:{},
  timers:{live:null, freshness:null},
  lastError:''
};

function $(id){ return document.getElementById(id); }
function show(id){ var el=$(id); if(el) el.classList.remove('hidden'); }
function hide(id){ var el=$(id); if(el) el.classList.add('hidden'); }
function text(v){ return v == null ? '' : String(v); }
function num(v){
  if(v === '' || v === null || typeof v === 'undefined') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}
function ms(v){
  if(v === null || typeof v === 'undefined' || v === '') return 0;
  var n = Number(v);
  if(isFinite(n) && n > 100000000000) return n;
  var d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function pad2(n){ return String(n).padStart(2,'0'); }
function localDateKey(t){
  var d = new Date(t);
  return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
}
function fmtDateTime(t){
  if(!t) return 'N/A';
  try { return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(t)); }
  catch(e){ return new Date(t).toLocaleString(); }
}
function fmtTime(t){
  if(!t) return '';
  return new Date(t).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function fmtDuration(msVal){
  if(!msVal || msVal < 0) return 'N/A';
  var s=Math.floor(msVal/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60);
  return (h ? h+'j ' : '') + m+'m';
}
function fmtNumber(v, precision){
  var n=num(v);
  if(n===null) return 'N/A';
  var p = isFinite(Number(precision)) ? Number(precision) : (Math.abs(n)>=100 ? 0 : Math.abs(n)>=10 ? 1 : 2);
  return n.toLocaleString('id-ID',{maximumFractionDigits:p,minimumFractionDigits:0});
}
function ageText(t){
  if(!t) return 'waktu tidak tersedia';
  var sec=Math.max(0,Math.round((Date.now()-t)/1000));
  if(sec<60) return sec+' dtk lalu';
  if(sec<3600) return Math.floor(sec/60)+' mnt lalu';
  if(sec<86400) return Math.floor(sec/3600)+' jam lalu';
  return Math.floor(sec/86400)+' hari lalu';
}
function safeJson(s, fallback){
  if(s && typeof s === 'object') return s;
  try { return JSON.parse(s || ''); } catch(e){ return fallback; }
}
function htmlEscape(s){
  return text(s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
}
function safeKey(s){ return text(s).replace(/[.#$\[\]\/]/g,'_').replace(/\s+/g,'_'); }
function toast(msg){
  $('toast').textContent=msg; show('toast');
  clearTimeout(toast._t); toast._t=setTimeout(function(){hide('toast');},2200);
}
function setError(msg){
  S.lastError=text(msg);
  console.error(msg);
}
window.addEventListener('error',function(e){ setError(e.message || e.error); });
window.addEventListener('unhandledrejection',function(e){ setError(e.reason && e.reason.message || e.reason); });

/* =========================== AUTH + REST =========================== */

function storageForRemember(remember){ return remember ? localStorage : sessionStorage; }
function saveAuth(a, remember){
  var store=storageForRemember(remember);
  var other=remember ? sessionStorage : localStorage;
  other.removeItem('torqueAuth');
  store.setItem('torqueAuth',JSON.stringify(a));
  S.auth=a; S.uid=a.localId || '';
}
function loadAuth(){
  var raw=sessionStorage.getItem('torqueAuth') || localStorage.getItem('torqueAuth');
  if(!raw) return null;
  try { return JSON.parse(raw); } catch(e){ return null; }
}
function clearAuth(){
  sessionStorage.removeItem('torqueAuth');
  localStorage.removeItem('torqueAuth');
  S.auth=null; S.uid='';
}
async function signIn(email,password,remember){
  var url='https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(CFG.apiKey);
  var r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    email:email,password:password,returnSecureToken:true
  })});
  var j=await r.json();
  if(!r.ok) throw new Error((j.error && j.error.message) || 'Login gagal');
  var a={
    idToken:j.idToken,refreshToken:j.refreshToken,localId:j.localId,email:j.email,
    expiresAt:Date.now()+Number(j.expiresIn||3600)*1000-60000,
    remember:!!remember
  };
  saveAuth(a,remember);
  return a;
}
async function refreshAuth(){
  if(!S.auth || !S.auth.refreshToken) throw new Error('Sesi login habis');
  var url='https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(CFG.apiKey);
  var body='grant_type=refresh_token&refresh_token='+encodeURIComponent(S.auth.refreshToken);
  var r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body});
  var j=await r.json();
  if(!r.ok) throw new Error((j.error && j.error.message) || 'Refresh token gagal');
  S.auth.idToken=j.id_token;
  S.auth.refreshToken=j.refresh_token || S.auth.refreshToken;
  S.auth.localId=j.user_id || S.auth.localId;
  S.auth.expiresAt=Date.now()+Number(j.expires_in||3600)*1000-60000;
  saveAuth(S.auth,!!S.auth.remember);
}
async function ensureToken(){
  if(!S.auth) throw new Error('Belum login');
  if(Date.now()>=Number(S.auth.expiresAt||0)) await refreshAuth();
  return S.auth.idToken;
}
async function dbFetch(path, opts){
  opts=opts||{};
  var started=performance.now();
  var token=await ensureToken();
  var url=CFG.databaseURL.replace(/\/+$/,'')+'/'+path.replace(/^\/+/,'')+'.json?auth='+encodeURIComponent(token);
  var init={method:opts.method||'GET',headers:{}};
  if(opts.body !== undefined){
    init.headers['Content-Type']='application/json';
    init.body=JSON.stringify(opts.body);
  }
  var r=await fetch(url,init);
  if(r.status===401){
    await refreshAuth();
    token=await ensureToken();
    url=CFG.databaseURL.replace(/\/+$/,'')+'/'+path.replace(/^\/+/,'')+'.json?auth='+encodeURIComponent(token);
    r=await fetch(url,init);
  }
  var txt=await r.text();
  var data=txt ? safeJson(txt,txt) : null;
  if(!r.ok) throw new Error('Firebase '+r.status+' '+path+': '+text(data && data.error || data));
  return data;
}
async function dbPut(path,value){ return dbFetch(path,{method:'PUT',body:value}); }

/* =========================== BOOT =========================== */

async function boot(){
  S.auth=loadAuth();
  if(S.auth){
    S.uid=S.auth.localId||'';
    try{
      await ensureToken();
      hide('loginScreen'); show('app');
      await bootstrapData();
      return;
    }catch(e){
      clearAuth();
      setError(e.message);
    }
  }
  show('loginScreen'); hide('app');
}
async function bootstrapData(){
  setEmpty('Menghubungkan Firebase...');
  var results=await Promise.all([
    dbFetch('mirror/devices'),
    dbFetch('mirror/live'),
    dbFetch('mirror/pid_catalog'),
    dbFetch('mirror/config')
  ]);
  S.devices=results[0]||{};
  S.liveAll=results[1]||{};
  S.catalog=normalizeCatalog(results[2]||{});
  S.config=results[3]||{};
  renderVehicleOptions();

  var ids=Object.keys(S.devices).concat(Object.keys(S.liveAll)).filter(function(v,i,a){return a.indexOf(v)===i;});
  if(ids.length===1){
    $('vehicleSelect').value=ids[0];
    await selectVehicle(ids[0]);
  }else{
    setEmpty(ids.length ? 'Pilih salah satu kendaraan.' : 'Belum ada kendaraan di Firebase mirror.');
  }
}
function normalizeCatalog(raw){
  var out={};
  Object.keys(raw||{}).forEach(function(k){
    var r=raw[k]||{};
    out[k]={
      key:k,
      name:text(r.DISPLAY_NAME||r.SHORT_NAME||k),
      short:text(r.SHORT_NAME||r.DISPLAY_NAME||k),
      unit:text(r.UNIT||''),
      precision:num(r.PRECISION),
      freshness:num(r.FRESHNESS_MS),
      min:num(r.VALID_MIN),
      max:num(r.VALID_MAX),
      defaultCard:String(r.DEFAULT_CARD).toLowerCase()==='true' || Number(r.DEFAULT_CARD)===1,
      sort:num(r.SORT_ORDER)||9999
    };
  });
  return out;
}
function renderVehicleOptions(){
  var sel=$('vehicleSelect');
  sel.innerHTML='<option value="">Pilih kendaraan...</option>';
  var ids=Object.keys(S.devices).concat(Object.keys(S.liveAll)).filter(function(v,i,a){return a.indexOf(v)===i;});
  ids.sort(function(a,b){
    var la=S.liveAll[a]||{}, lb=S.liveAll[b]||{};
    return ms(lb.LAST_RECEIVED)-ms(la.LAST_RECEIVED);
  });
  ids.forEach(function(id){
    var d=S.devices[id]||{}, l=S.liveAll[id]||{};
    var profile=text(l.PROFILE_NAME||d.LAST_PROFILE||'Tanpa profile');
    var alias=text(d.DISPLAY_ALIAS||'');
    var label=(alias?alias+' · ':'')+profile+' · '+id.slice(0,6)+' · '+liveLabel(l);
    var o=document.createElement('option'); o.value=id; o.textContent=label; sel.appendChild(o);
  });
}
function liveLabel(live){
  var status=text(live && live.STATUS).toUpperCase();
  var age=Date.now()-ms(live && live.LAST_RECEIVED);
  if((status==='ACTIVE'||status==='LIVE') && age < 180000) return 'LIVE';
  return 'OFFLINE';
}
function setEmpty(msg){
  $('emptyPanel').textContent=msg;
  show('emptyPanel'); hide('livePanel'); hide('historyPanel');
}

/* =========================== VEHICLE / LIVE =========================== */

async function selectVehicle(id){
  stopTimers();
  S.deviceId=id||'';
  S.live=null; S.liveTrace=null; S.historySession=null; S.historyTelemetry=null;
  S.historySessions={};
  S.liveFollow=true;
  S.latestLiveGps=null;
  updateFollowButton();
  hide('liveTracePanel'); hide('historyDetail');
  if(!id){ setEmpty('Pilih kendaraan untuk menampilkan data.'); return; }

  showTab('live');
  hide('emptyPanel'); show('livePanel');
  await loadLive(true);
  loadPrefs().catch(setError);
  startTimers();
}
async function loadLive(initial){
  if(!S.deviceId) return;
  var live=await dbFetch('mirror/live/'+safeKey(S.deviceId));
  if(!live){ throw new Error('LIVE_STATE tidak ditemukan untuk kendaraan ini.'); }
  S.live=live;
  S.liveAll[S.deviceId]=live;
  renderLive();
  if(initial){
    buildGraphPidChecks('live');
    if(!S.liveGraphKeys.length) S.liveGraphKeys=defaultGraphKeys();
    syncGraphChecks('live');
    await loadLiveGraph();
  }
}
function renderLive(){
  var l=S.live||{}, d=S.devices[S.deviceId]||{};
  var pids=safeJson(l.LATEST_PID_JSON,{})||{};
  var pt=safeJson(l.PID_TIME_JSON,{})||{};
  var profile=text(l.PROFILE_NAME||d.LAST_PROFILE||'Tanpa profile');
  $('vehicleMeta').textContent='Profile: '+profile+' · Device: '+S.deviceId+' · Session: '+text(l.SESSION_ID||'-');

  var status=liveLabel(l);
  $('liveStatus').innerHTML=
    '<span class="status-dot '+(status==='LIVE'?'live':'offline')+'"></span>'+
    '<strong>'+status+'</strong>'+
    '<span class="badge">Data '+htmlEscape(ageText(ms(l.LAST_RECEIVED)))+'</span>'+
    '<span class="badge">Session '+htmlEscape(text(l.SESSION_ID||'-'))+'</span>'+
    '<span class="badge">Mirror '+htmlEscape(fmtTime(ms(l.UPDATED_AT||l.LAST_RECEIVED)))+'</span>';

  if(!S.cardKeys.length) S.cardKeys=defaultCardKeys(pids);
  renderSensorCards($('liveCards'),pids,pt,S.cardKeys);
  renderSensorTable(pids,pt);

  // Posisi kendaraan LIVE berasal langsung dari LIVE_STATE, jadi marker bisa
  // bergerak tanpa menunggu graph/telemetry dimuat ulang.
  updateLiveVehicleFromState(l);
}
function defaultCardKeys(pids){
  var keys=Object.keys(S.catalog).filter(function(k){ return S.catalog[k].defaultCard && pids[k] !== undefined; });
  if(!keys.length) keys=DEFAULT_KEYS.filter(function(k){return pids[k]!==undefined;});
  if(!keys.length) keys=Object.keys(pids).filter(isPidKey).slice(0,6);
  return keys.slice(0,12);
}
function defaultGraphKeys(){
  var p=safeJson(S.live && S.live.LATEST_PID_JSON,{})||{};
  var wanted=['kc','kd','k5','k11'];
  var out=wanted.filter(function(k){return p[k]!==undefined;});
  if(!out.length) out=Object.keys(p).filter(isPidKey).slice(0,1);
  return out.slice(0,MAX_COMPARE);
}
function isPidKey(k){ return /^k/i.test(k) && k.indexOf('kff1005')!==0 && k.indexOf('kff1006')!==0; }
function metaFor(k){
  return S.catalog[k] || {key:k,name:k,short:k,unit:'',precision:null,freshness:null,min:null,max:null,sort:9999};
}
function validPidValue(k,v){
  var n=num(v); if(n===null) return null;
  if(k==='kd' && n===255) return null;
  var m=metaFor(k);
  if(m.min!==null && n<m.min) return null;
  if(m.max!==null && n>m.max) return null;
  return n;
}
function renderSensorCards(container,pids,pidTimes,keys){
  container.innerHTML='';
  keys.forEach(function(k){
    if(pids[k]===undefined) return;
    var m=metaFor(k), v=validPidValue(k,pids[k]), t=ms(pidTimes[k]);
    var div=document.createElement('div'); div.className='sensor-card';
    div.innerHTML='<div class="sensor-name">'+htmlEscape(m.name)+'</div>'+
      '<div class="sensor-value">'+(v===null?'N/A':fmtNumber(v,m.precision))+
      (m.unit?'<span class="sensor-unit">'+htmlEscape(m.unit)+'</span>':'')+'</div>'+
      '<div class="sensor-age">'+htmlEscape(t?ageText(t):'timestamp N/A')+'</div>';
    container.appendChild(div);
  });
}
function renderSensorTable(pids,pidTimes){
  var keys=Object.keys(pids).filter(isPidKey).sort(function(a,b){return metaFor(a).sort-metaFor(b).sort;});
  $('sensorTable').innerHTML=keys.map(function(k){
    var m=metaFor(k),v=validPidValue(k,pids[k]),t=ms(pidTimes[k]);
    return '<div class="sensor-row"><div><strong>'+htmlEscape(m.name)+'</strong><div class="muted">'+
      htmlEscape(k)+(m.unit?' · '+htmlEscape(m.unit):'')+'</div></div><div>'+
      (v===null?'N/A':fmtNumber(v,m.precision))+'<div class="muted">'+htmlEscape(t?ageText(t):'')+'</div></div></div>';
  }).join('');
}

/* =========================== PREFS =========================== */

async function loadPrefs(){
  if(!S.uid || !S.deviceId) return;
  var p=await dbFetch('dashboard/prefs/'+safeKey(S.uid)+'/'+safeKey(S.deviceId));
  if(p && Array.isArray(p.cardKeys) && p.cardKeys.length){
    S.cardKeys=p.cardKeys;
    if(S.live) renderLive();
  }
}
function openDisplayPrefs(){
  var pids=safeJson(S.live && S.live.LATEST_PID_JSON,{})||{};
  var keys=Object.keys(pids).filter(isPidKey).sort(function(a,b){return metaFor(a).sort-metaFor(b).sort;});
  var selected={}; S.cardKeys.forEach(function(k,i){selected[k]=i+1;});
  $('displayPrefsList').innerHTML=keys.map(function(k){
    var checked=selected[k]?'checked':'';
    return '<div class="pref-row" data-key="'+htmlEscape(k)+'">'+
      '<input type="checkbox" '+checked+'>'+
      '<div><strong>'+htmlEscape(metaFor(k).name)+'</strong><div class="muted">'+htmlEscape(k)+'</div></div>'+
      '<button type="button" class="ghost pref-up">↑</button>'+
      '<button type="button" class="ghost pref-down">↓</button></div>';
  }).join('');
  $('displayDialog').showModal();
}
function movePrefRow(btn,dir){
  var row=btn.closest('.pref-row'), parent=row.parentNode;
  if(dir<0 && row.previousElementSibling) parent.insertBefore(row,row.previousElementSibling);
  if(dir>0 && row.nextElementSibling) parent.insertBefore(row.nextElementSibling,row);
}
async function savePrefs(){
  var rows=[].slice.call(document.querySelectorAll('#displayPrefsList .pref-row'));
  var keys=rows.filter(function(r){return r.querySelector('input').checked;}).map(function(r){return r.dataset.key;});
  S.cardKeys=keys.slice(0,20);
  await dbPut('dashboard/prefs/'+safeKey(S.uid)+'/'+safeKey(S.deviceId),{cardKeys:S.cardKeys,updatedAt:Date.now()});
  $('displayDialog').close(); renderLive(); toast('Tampilan disimpan');
}

/* =========================== TELEMETRY LOAD =========================== */

function sessionDates(start,end){
  var out=[], d=new Date(start); d.setHours(0,0,0,0);
  var e=new Date(end); e.setHours(0,0,0,0);
  var guard=0;
  while(d.getTime()<=e.getTime() && guard<20){
    out.push(localDateKey(d.getTime())); d.setDate(d.getDate()+1); guard++;
  }
  return out;
}
async function loadSessionTelemetry(deviceId, sessionId, startMs, endMs, force){
  var cacheKey=deviceId+'|'+sessionId;
  if(!force && S.telemetryCache[cacheKey]) return S.telemetryCache[cacheKey];

  var dates=sessionDates(startMs,endMs);
  var chunks=await Promise.all(dates.map(function(dateKey){
    return dbFetch('mirror/telemetry/'+dateKey+'/'+safeKey(deviceId)+'/'+safeKey(sessionId))
      .catch(function(){return null;});
  }));
  var packets=[];
  chunks.forEach(function(obj){
    Object.keys(obj||{}).forEach(function(k){
      var p=obj[k]||{};
      p._key=k;
      p._payload=safeJson(p.payloadJson||p.PAYLOAD_JSON,{})||{};
      p._time=ms(p.torqueTime||p.TORQUE_TIME);
      if(p._time) packets.push(p);
    });
  });
  packets.sort(function(a,b){return a._time-b._time;});
  S.telemetryCache[cacheKey]=packets;
  return packets;
}
function pointsForKey(packets,key,from,to){
  var out=[];
  packets.forEach(function(p){
    if(p._time<from || p._time>to) return;
    var v=validPidValue(key,p._payload[key]);
    if(v!==null) out.push({x:p._time,y:v,packet:p});
  });
  return out;
}
function gpsFromPacket(p){
  var q=p && p._payload || {};
  var lat=num(q[GPS_KEYS.lat]),lon=num(q[GPS_KEYS.lon]),acc=num(q[GPS_KEYS.acc]);
  if(lat===null||lon===null||lat===0||lon===0) return null;
  var maxAcc=num(S.config.MAX_GPS_ACCURACY_M)||80;
  if(acc!==null && acc>maxAcc) return null;
  return {lat:lat,lon:lon,acc:acc,bearing:num(q[GPS_KEYS.bearing]),speed:num(q[GPS_KEYS.speed]),time:p._time,packet:p};
}
function currentSessionBounds(){
  var l=S.live||{}, last=ms(l.LAST_TORQUE_TIME||l.LAST_RECEIVED);
  var start=last-24*3600000;
  return {start:start,end:last||Date.now()};
}

/* =========================== GRAPH =========================== */

function buildGraphPidChecks(context){
  var target=context==='live' ? $('livePidChecks') : $('historyPidChecks');
  var pids={};
  if(context==='live') pids=safeJson(S.live && S.live.LATEST_PID_JSON,{})||{};
  else if(S.historySession) {
    var keys=safeJson(S.historySession.PID_KEYS_JSON,[]);
    keys.forEach(function(k){pids[k]=1;});
  }
  var keys=Object.keys(pids).filter(isPidKey).sort(function(a,b){return metaFor(a).sort-metaFor(b).sort;});
  target.innerHTML=keys.map(function(k){
    return '<label class="pid-pill"><input type="checkbox" data-key="'+htmlEscape(k)+'"><span>'+
      htmlEscape(metaFor(k).short||metaFor(k).name)+'</span></label>';
  }).join('');
}
function syncGraphChecks(context){
  var arr=context==='live'?S.liveGraphKeys:S.historyGraphKeys;
  var root=context==='live'?$('livePidChecks'):$('historyPidChecks');
  [].slice.call(root.querySelectorAll('input[type=checkbox]')).forEach(function(cb){cb.checked=arr.indexOf(cb.dataset.key)>=0;});
}
function handlePidCheck(context,cb){
  var arr=context==='live'?S.liveGraphKeys:S.historyGraphKeys;
  var k=cb.dataset.key;
  if(cb.checked){
    if(arr.indexOf(k)<0 && arr.length<MAX_COMPARE) arr.push(k);
    else if(arr.length>=MAX_COMPARE){cb.checked=false;toast('Maksimal '+MAX_COMPARE+' PID');}
  }else arr=arr.filter(function(x){return x!==k;});
  if(context==='live') S.liveGraphKeys=arr; else S.historyGraphKeys=arr;
  if(context==='live') loadLiveGraph(); else loadHistoryGraph();
}
function chartOptions(context){
  return {
    responsive:true,maintainAspectRatio:false,animation:false,parsing:false,
    interaction:{mode:'nearest',intersect:false},
    plugins:{
      legend:{labels:{color:'#d9e5ef',boxWidth:10}},
      tooltip:{callbacks:{
        title:function(items){return items.length?fmtDateTime(items[0].parsed.x):'';}
      }},
      zoom:{
        pan:{enabled:true,mode:'x'},
        zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x'}
      }
    },
    scales:{
      x:{type:'linear',ticks:{color:'#8fa1b2',callback:function(v){return fmtTime(v);},maxTicksLimit:6},grid:{color:'rgba(120,150,180,.12)'}},
      y:{ticks:{color:'#8fa1b2'},grid:{color:'rgba(120,150,180,.12)'}}
    },
    onClick:function(evt,elements,chart){
      var x=chart.scales.x.getValueForPixel(evt.x);
      if(context==='live') traceLiveAt(x); else traceHistoryAt(x);
    }
  };
}
function makeDatasets(packets,keys,from,to,normalized){
  var datasets=[], stats=[];
  keys.forEach(function(k,idx){
    var pts=pointsForKey(packets,k,from,to);
    if(!pts.length) return;
    var vals=pts.map(function(p){return p.y;});
    var min=Math.min.apply(null,vals),max=Math.max.apply(null,vals),avg=vals.reduce(function(a,b){return a+b;},0)/vals.length;
    var plotted=pts;
    if(normalized){
      var span=max-min;
      plotted=pts.map(function(p){return {x:p.x,y:span?((p.y-min)/span*100):50,_raw:p.y,packet:p.packet};});
    }
    datasets.push({
      label:metaFor(k).short+(normalized?' (norm)':''),
      data:downsample(plotted,900),
      borderWidth:1.8,pointRadius:0,pointHoverRadius:4,spanGaps:false,tension:0.12
    });
    stats.push({key:k,min:min,max:max,avg:avg,count:vals.length});
  });
  return {datasets:datasets,stats:stats};
}
function downsample(arr,maxPts){
  if(arr.length<=maxPts) return arr;
  var step=arr.length/maxPts,out=[];
  for(var i=0;i<maxPts;i++){
    var a=Math.floor(i*step),b=Math.min(arr.length,Math.floor((i+1)*step));
    var slice=arr.slice(a,b);
    if(!slice.length) continue;
    if(slice.length<=2){out.push.apply(out,slice);continue;}
    var min=slice[0],max=slice[0];
    slice.forEach(function(p){if(p.y<min.y)min=p;if(p.y>max.y)max=p;});
    if(min.x<max.x){out.push(min,max);}else{out.push(max,min);}
  }
  out.sort(function(a,b){return a.x-b.x;});
  return out;
}
function renderStats(id,stats){
  $(id).innerHTML=stats.map(function(s){
    var m=metaFor(s.key);
    return '<div class="stat"><span>'+htmlEscape(m.short)+'</span><strong>'+
      'Min '+fmtNumber(s.min,m.precision)+(m.unit?' '+htmlEscape(m.unit):'')+'</strong>'+
      '<div>Avg '+fmtNumber(s.avg,m.precision)+' · Max '+fmtNumber(s.max,m.precision)+'</div></div>';
  }).join('');
}
function renderChart(context,datasets,from,to,normalized){
  var id=context==='live'?'liveChart':'historyChart', canvas=$(id);
  if(S.charts[context]) S.charts[context].destroy();
  var opts=chartOptions(context);
  if(normalized){
    opts.scales.y.min=0;opts.scales.y.max=100;
    opts.scales.y.ticks.callback=function(v){return v+'%';};
  }
  opts.scales.x.min=from; opts.scales.x.max=to;
  S.charts[context]=new Chart(canvas.getContext('2d'),{type:'line',data:{datasets:datasets},options:opts});
}
async function loadLiveGraph(){
  if(!S.deviceId || !S.live || !S.liveGraphKeys.length) return;
  show('liveGraphLoading');
  try{
    var last=ms(S.live.LAST_TORQUE_TIME||S.live.LAST_RECEIVED)||Date.now();
    var from,to=last;
    if(S.liveRangeMinutes==='custom' && S.liveCustom){
      from=S.liveCustom.from;to=S.liveCustom.to;
    }else from=last-Number(S.liveRangeMinutes||10)*60000;

    var bounds=currentSessionBounds();
    var packets=await loadSessionTelemetry(S.deviceId,text(S.live.SESSION_ID),Math.min(bounds.start,from),Math.max(bounds.end,to),true);
    var data=makeDatasets(packets,S.liveGraphKeys,from,to,$('normalizeLive').checked);
    renderStats('liveStats',data.stats);
    renderChart('live',data.datasets,from,to,$('normalizeLive').checked);
    $('graphSubtitle').textContent=fmtDateTime(from)+' → '+fmtDateTime(to);
    renderMap('live',packets,from,to);
  }catch(e){setError(e.message);toast('Grafik LIVE gagal: '+e.message);}
  finally{hide('liveGraphLoading');}
}

/* =========================== TRACE =========================== */

function nearestPacket(packets,target){
  var best=null,dist=Infinity;
  packets.forEach(function(p){
    var d=Math.abs(p._time-target);
    if(d<dist){dist=d;best=p;}
  });
  return dist<=15000?best:null;
}
function renderTrace(context,p){
  if(!p) return;
  var q=p._payload||{}, keys=Object.keys(q).filter(isPidKey).sort(function(a,b){return metaFor(a).sort-metaFor(b).sort;});
  var cards=context==='live'?$('liveTraceCards'):$('historyTraceCards');
  renderSensorCards(cards,q,{},keys);
  var tId=context==='live'?'liveTraceTime':'historyTraceTime';
  $(tId).textContent=fmtDateTime(p._time);

  var panel=context==='live'?'liveTracePanel':'historyTracePanel';
  show(panel);
  if(context==='live') S.liveTrace=p; else S.historyTrace=p;
  setTraceMarker(context,gpsFromPacket(p));
}
async function traceLiveAt(target){
  if(!S.live) return;
  var cache=S.telemetryCache[S.deviceId+'|'+text(S.live.SESSION_ID)]||[];
  var p=nearestPacket(cache,target);
  if(!p){toast('Tidak ada telemetry di sekitar waktu ini');return;}
  renderTrace('live',p);
}
async function traceHistoryAt(target){
  var p=nearestPacket(S.historyTelemetry||[],target);
  if(!p){toast('Tidak ada telemetry di sekitar waktu ini');return;}
  renderTrace('history',p);
}
/* =========================== LIVE MAP FOLLOW =========================== */

function liveGpsFromState(live){
  live=live||{};
  var lat=num(live.GPS_LAT), lon=num(live.GPS_LON), acc=num(live.GPS_ACCURACY);
  if(lat===null||lon===null||lat===0||lon===0)return null;
  var maxAcc=num(S.config.MAX_GPS_ACCURACY_M)||80;
  if(acc!==null&&acc>maxAcc)return null;
  return {
    lat:lat,
    lon:lon,
    acc:acc,
    bearing:num(live.GPS_BEARING),
    speed:num(live.GPS_SPEED),
    time:ms(live.GPS_TIME||live.LAST_TORQUE_TIME||live.LAST_RECEIVED)
  };
}
function updateFollowButton(){
  var b=$('liveFollowBtn');
  if(!b)return;
  if(S.liveFollow){
    b.textContent='● Ikuti Kendaraan';
    b.classList.add('active-follow');
    b.classList.remove('paused-follow');
    b.title='Peta otomatis mengikuti posisi GPS terbaru';
  }else{
    b.textContent='○ Ikuti Kendaraan';
    b.classList.remove('active-follow');
    b.classList.add('paused-follow');
    b.title='Klik untuk kembali mengikuti kendaraan';
  }
}
function setLiveFollow(enabled, recenter){
  S.liveFollow=!!enabled;
  updateFollowButton();

  if(S.liveFollow){
    // TRACE selesai saat kembali ke mode follow LIVE.
    if(S.traceMarkers.live){
      S.traceMarkers.live.remove();
      S.traceMarkers.live=null;
    }
    if(recenter!==false) centerOnLiveVehicle(true);
  }
}
function ensureVehicleMarker(g){
  if(!g||typeof maplibregl==='undefined')return;
  var m=ensureMap('live');
  if(!m)return;

  if(!S.vehicleMarker){
    var el=document.createElement('div');
    el.className='live-vehicle-marker';
    el.innerHTML='<span class="vehicle-pulse"></span><span class="vehicle-dot"></span>';
    S.vehicleMarker=new maplibregl.Marker({
      element:el,
      anchor:'center',
      rotationAlignment:'map',
      pitchAlignment:'map'
    }).setLngLat([g.lon,g.lat]).addTo(m);
  }else{
    S.vehicleMarker.setLngLat([g.lon,g.lat]);
  }
}
function centerOnLiveVehicle(forceZoom){
  var g=S.latestLiveGps;
  var m=S.maps.live;
  if(!g||!m||!S.mapReady.live)return;

  var targetZoom=m.getZoom();
  if(forceZoom || !isFinite(targetZoom) || targetZoom<14){
    targetZoom=S.liveFollowZoom;
  }

  m.easeTo({
    center:[g.lon,g.lat],
    zoom:targetZoom,
    duration:350,
    essential:true
  });
}
function updateLiveVehicleFromState(live){
  var g=liveGpsFromState(live);
  if(!g)return;
  S.latestLiveGps=g;

  var link=$('liveMapsLink');
  if(link){
    link.href='https://www.google.com/maps?q='+g.lat+','+g.lon;
    show('liveMapsLink');
  }

  // Map dibuat lazy; bila sudah ada, marker kendaraan langsung diperbarui.
  if(S.maps.live && S.mapReady.live){
    ensureVehicleMarker(g);
    if(S.liveFollow && !S.liveTrace) centerOnLiveVehicle(false);
  }
}

/* =========================== MAP =========================== */
/*
 * MapLibre GL JS + OpenFreeMap
 * - Gratis
 * - Tanpa API key
 * - Vector map, bukan raster tile Leaflet
 * - Style: Liberty
 */
function mapPacketsForContext(context){
  if(context==='live'){
    if(!S.live)return [];
    return S.telemetryCache[S.deviceId+'|'+text(S.live.SESSION_ID)]||[];
  }
  return S.historyTelemetry||[];
}
function routeIds(context){
  return {
    source:'torque-route-source-'+context,
    layer:'torque-route-layer-'+context
  };
}
function mapElementVisible(context){
  var el=$(context==='live'?'liveMap':'historyMap');
  if(!el)return false;
  var r=el.getBoundingClientRect();
  return r.width>50&&r.height>50&&getComputedStyle(el).display!=='none';
}
function ensureMap(context){
  if(typeof maplibregl==='undefined')return null;
  if(S.maps[context]){
    if(mapElementVisible(context))S.maps[context].resize();
    return S.maps[context];
  }

  var id=context==='live'?'liveMap':'historyMap';
  var el=$(id);
  var m=new maplibregl.Map({
    container:id,
    style:'https://tiles.openfreemap.org/styles/liberty',
    center:[112.75,-7.25],
    zoom:12,
    attributionControl:true,
    cooperativeGestures:false
  });

  m.addControl(new maplibregl.NavigationControl({showCompass:true,showZoom:true}),'top-right');

  m.on('load',function(){
    S.mapReady[context]=true;
    if(S.routeData[context])applyRouteToMap(context,S.routeData[context]);

    if(context==='live' && S.latestLiveGps){
      ensureVehicleMarker(S.latestLiveGps);
      if(S.liveFollow && !S.liveTrace){
        setTimeout(function(){centerOnLiveVehicle(true);},80);
      }
    }

    setTimeout(function(){m.resize();},50);
  });

  if(context==='live'){
    // Pengguna menggeser / zoom manual -> pause follow otomatis.
    // Klik tombol Ikuti Kendaraan untuk kembali ke posisi mobil.
    m.on('dragstart',function(){
      if(S.liveFollow)setLiveFollow(false,false);
    });
    m.on('zoomstart',function(e){
      if(S.liveFollow && e && e.originalEvent)setLiveFollow(false,false);
    });
    m.on('rotatestart',function(){
      if(S.liveFollow)setLiveFollow(false,false);
    });
  }

  m.on('click',function(e){
    var packets=mapPacketsForContext(context);
    var best=null,dist=Infinity;
    packets.forEach(function(p){
      var g=gpsFromPacket(p);
      if(!g)return;
      var dx=g.lon-e.lngLat.lng,dy=g.lat-e.lngLat.lat;
      var d=dx*dx+dy*dy;
      if(d<dist){dist=d;best=p;}
    });
    if(best){
      if(context==='live')renderTrace('live',best);
      else renderTrace('history',best);
    }
  });

  S.maps[context]=m;

  if(typeof ResizeObserver!=='undefined'&&el){
    S.mapResizeObservers[context]=new ResizeObserver(function(){
      if(S.maps[context]&&mapElementVisible(context))S.maps[context].resize();
    });
    S.mapResizeObservers[context].observe(el);
  }
  return m;
}
function applyRouteToMap(context,route){
  var m=S.maps[context];
  if(!m||!S.mapReady[context]||!route||!route.coords||!route.coords.length)return;

  var ids=routeIds(context);
  var geo={
    type:'Feature',
    properties:{},
    geometry:{type:'LineString',coordinates:route.coords}
  };

  if(m.getSource(ids.source)){
    m.getSource(ids.source).setData(geo);
  }else{
    m.addSource(ids.source,{type:'geojson',data:geo});
    m.addLayer({
      id:ids.layer,
      type:'line',
      source:ids.source,
      layout:{'line-join':'round','line-cap':'round'},
      paint:{
        'line-color':'#1976d2',
        'line-width':5,
        'line-opacity':0.9
      }
    });
  }

  var bounds=new maplibregl.LngLatBounds();
  route.coords.forEach(function(c){bounds.extend(c);});

  if(context==='live' && S.liveFollow && S.latestLiveGps && !S.liveTrace){
    ensureVehicleMarker(S.latestLiveGps);
    centerOnLiveVehicle(false);
  }else if(!bounds.isEmpty()){
    // Saat follow OFF atau pada Riwayat, tampilkan seluruh route/range.
    m.fitBounds(bounds,{padding:38,maxZoom:17,duration:0});
  }
  setTimeout(function(){m.resize();},80);
}
function renderMap(context,packets,from,to){
  var m=ensureMap(context);
  if(!m)return;

  var coords=[],lastPoint=null;
  packets.forEach(function(p){
    if(p._time<from||p._time>to)return;
    var g=gpsFromPacket(p);
    if(!g)return;
    coords.push([g.lon,g.lat]);
    lastPoint=g;
  });

  var infoId=context==='live'?'liveMapInfo':'historyMapInfo';
  var link=context==='live'?$('liveMapsLink'):$('historyMapsLink');

  if(!coords.length){
    $(infoId).textContent='GPS tidak tersedia pada range ini.';
    S.routeData[context]=null;
    hide(context==='live'?'liveMapsLink':'historyMapsLink');
    return;
  }

  S.routeData[context]={coords:coords,last:lastPoint};
  $(infoId).textContent=coords.length+' titik GPS · '+fmtDateTime(lastPoint.time);
  link.href='https://www.google.com/maps?q='+lastPoint.lat+','+lastPoint.lon;
  show(context==='live'?'liveMapsLink':'historyMapsLink');

  if(S.mapReady[context]){
    applyRouteToMap(context,S.routeData[context]);
    if(context==='live' && S.latestLiveGps){
      ensureVehicleMarker(S.latestLiveGps);
      if(S.liveFollow && !S.liveTrace) centerOnLiveVehicle(false);
    }
  }
}
function setTraceMarker(context,g){
  if(!g||typeof maplibregl==='undefined')return;

  if(context==='live'){
    // TRACE berarti pengguna sedang melihat waktu historis, jadi jangan
    // memaksa kamera kembali ke kendaraan LIVE.
    setLiveFollow(false,false);
  }

  var m=ensureMap(context);
  if(!m)return;

  if(S.traceMarkers[context]){
    S.traceMarkers[context].remove();
    S.traceMarkers[context]=null;
  }

  var el=document.createElement('div');
  el.className='trace-map-marker';
  S.traceMarkers[context]=new maplibregl.Marker({element:el,anchor:'center'})
    .setLngLat([g.lon,g.lat])
    .addTo(m);

  m.easeTo({center:[g.lon,g.lat],duration:300});
  var link=context==='live'?$('liveMapsLink'):$('historyMapsLink');
  link.href='https://www.google.com/maps?q='+g.lat+','+g.lon;
  show(context==='live'?'liveMapsLink':'historyMapsLink');
}

/* =========================== HISTORY =========================== */

async function showHistory(){
  if(!S.deviceId) return;
  showTab('history');
  if(!Object.keys(S.historySessions).length) await loadHistory();
}
async function loadHistory(force){
  if(!S.deviceId)return;
  show('historyLoading');
  try{
    if(force) S.historySessions={};
    var data=await dbFetch('mirror/sessions/'+safeKey(S.deviceId));
    S.historySessions=data||{};
    renderHistoryList();
  }catch(e){setError(e.message);toast('Riwayat gagal dimuat');}
  finally{hide('historyLoading');}
}
function renderHistoryList(){
  var from=$('historyFromDate').value?new Date($('historyFromDate').value+'T00:00:00').getTime():0;
  var to=$('historyToDate').value?new Date($('historyToDate').value+'T23:59:59').getTime():Infinity;
  var arr=Object.keys(S.historySessions).map(function(k){var r=S.historySessions[k]||{};r._id=k;return r;})
    .filter(function(r){var t=ms(r.START_TORQUE_TIME||r.START_RECEIVED);return t>=from&&t<=to;})
    .sort(function(a,b){return ms(b.START_TORQUE_TIME)-ms(a.START_TORQUE_TIME);});

  if(!arr.length){$('historyList').innerHTML='<div class="empty-state">Tidak ada session pada filter ini.</div>';return;}
  var dev=S.devices[S.deviceId]||{}, live=S.liveAll[S.deviceId]||{};
  $('historyList').innerHTML=arr.map(function(r){
    var start=ms(r.START_TORQUE_TIME||r.START_RECEIVED),end=ms(r.LAST_TORQUE_TIME||r.LAST_RECEIVED);
    var profile=text(r.PROFILE_NAME||live.PROFILE_NAME||dev.LAST_PROFILE||'Tanpa profile');
    return '<article class="history-card">'+
      '<div class="history-card-head"><div><div class="history-card-title">'+htmlEscape(profile)+'</div>'+
      '<div class="muted">'+htmlEscape(fmtDateTime(start))+' · '+htmlEscape(fmtDuration(end-start))+'</div></div>'+
      '<span class="badge">'+htmlEscape(text(r.STATUS||'FINALIZED'))+'</span></div>'+
      '<div class="history-kpis">'+
      kpi('Jarak',fmtNumber(r.TRIP_DISTANCE_KM,1)+' km')+
      kpi('Trip KPL',fmtNumber(r.TRIP_KPL,1))+
      kpi('Max RPM',fmtNumber(r.MAX_RPM,0))+
      kpi('Max Suhu',fmtNumber(r.MAX_COOLANT_C,1)+' °C')+
      '</div><button type="button" class="primary history-open" data-session-key="'+htmlEscape(text(r._id))+'">Lihat Detail</button></article>';
  }).join('');
}
function kpi(label,val){return '<div class="history-kpi"><small>'+label+'</small><strong>'+val+'</strong></div>';}
async function openHistorySession(sessionKey){
  // Gunakan KEY node Firebase sebagai identitas kanonis.
  // Jangan lookup ulang hanya dari SESSION_ID karena pada data lama field tersebut
  // bisa kosong/berbeda walaupun node session-nya valid.
  var r=S.historySessions[sessionKey]||null;
  if(!r){
    toast('Session tidak ditemukan');
    setError('History session key tidak ditemukan: '+sessionKey);
    return;
  }

  S.historySession=r;
  S.historySession._firebaseKey=sessionKey;
  S.historyTrace=null;
  S.historyRange='whole';
  S.historyCustom=null;

  // Detail harus tampil SEGERA dari summary SESSIONS.
  // Loading telemetry/grafik dilakukan setelah UI sudah visible.
  var listPanel=$('historyList').closest('.panel');
  if(listPanel) listPanel.classList.add('hidden');
  show('historyDetail');
  hide('historyTracePanel');
  $('historyDetailError').textContent='';

  var sessionId=text(r.SESSION_ID||sessionKey);
  $('historyDetailTitle').textContent='Detail Perjalanan';
  var start=ms(r.START_TORQUE_TIME||r.START_RECEIVED);
  var end=ms(r.LAST_TORQUE_TIME||r.LAST_RECEIVED);
  $('historyDetailSub').textContent=fmtDateTime(start)+' → '+fmtDateTime(end)+' · Session '+sessionId;
  renderHistorySummary(r);

  buildGraphPidChecks('history');
  S.historyGraphKeys=defaultHistoryGraphKeys(r);
  syncGraphChecks('history');

  try{
    await loadHistoryGraph(true);
  }catch(err){
    // Summary tetap visible walaupun telemetry/map/grafik gagal.
    setError(err.message||err);
    $('historyDetailError').textContent='Grafik/telemetry belum dapat dimuat: '+text(err.message||err);
  }

  // Di HP, langsung arahkan viewport ke awal detail.
  setTimeout(function(){
    var el=$('historyDetail');
    if(el && el.scrollIntoView) el.scrollIntoView({behavior:'smooth',block:'start'});
    if(S.maps.history) S.maps.history.resize();
  },50);
}
function defaultHistoryGraphKeys(r){
  var keys=safeJson(r.PID_KEYS_JSON,[])||[];
  var wanted=['kc','kd','k5','k11'];
  var out=wanted.filter(function(k){return keys.indexOf(k)>=0;});
  if(!out.length) out=keys.filter(isPidKey).slice(0,1);
  return out.slice(0,MAX_COMPARE);
}
function renderHistorySummary(r){
  var start=ms(r.START_TORQUE_TIME||r.START_RECEIVED),end=ms(r.LAST_TORQUE_TIME||r.LAST_RECEIVED);
  var items=[
    ['Mulai',fmtDateTime(start)],['Selesai',fmtDateTime(end)],['Durasi',fmtDuration(end-start)],
    ['Jarak',fmtNumber(r.TRIP_DISTANCE_KM,2)+' km'],['Trip KPL',fmtNumber(r.TRIP_KPL,2)+' km/L'],
    ['Max Speed',fmtNumber(r.MAX_SPEED_KMH,1)+' km/h'],['Max RPM',fmtNumber(r.MAX_RPM,0)+' rpm'],
    ['Max Coolant',fmtNumber(r.MAX_COOLANT_C,1)+' °C'],['Packet',fmtNumber(r.PACKET_COUNT,0)],
    ['GPS valid',fmtNumber(r.GPS_VALID_COUNT,0)],['Gap terpanjang',fmtNumber(r.LONGEST_GAP_SEC,1)+' dtk']
  ];
  $('historySummary').innerHTML=items.map(function(x){return '<div class="summary-item"><span>'+htmlEscape(x[0])+'</span><strong>'+htmlEscape(x[1])+'</strong></div>';}).join('');
}
function historyRangeBounds(){
  var r=S.historySession, start=ms(r.START_TORQUE_TIME||r.START_RECEIVED),end=ms(r.LAST_TORQUE_TIME||r.LAST_RECEIVED);
  if(S.historyRange==='whole')return {from:start,to:end};
  if(S.historyRange==='custom'&&S.historyCustom)return S.historyCustom;
  var mins=Number(S.historyRange)||15;
  var center=S.historyTrace?S.historyTrace._time:(start+end)/2;
  return {from:Math.max(start,center-mins*30000),to:Math.min(end,center+mins*30000)};
}
async function loadHistoryGraph(force){
  if(!S.historySession||!S.historyGraphKeys.length)return;
  show('historyGraphLoading');
  try{
    var r=S.historySession,start=ms(r.START_TORQUE_TIME||r.START_RECEIVED),end=ms(r.LAST_TORQUE_TIME||r.LAST_RECEIVED);
    var packets=await loadSessionTelemetry(S.deviceId,text(r.SESSION_ID),start,end,!!force);
    S.historyTelemetry=packets;
    var b=historyRangeBounds();
    var data=makeDatasets(packets,S.historyGraphKeys,b.from,b.to,$('normalizeHistory').checked);
    renderStats('historyStats',data.stats);
    renderChart('history',data.datasets,b.from,b.to,$('normalizeHistory').checked);
    $('historyGraphSubtitle').textContent=fmtDateTime(b.from)+' → '+fmtDateTime(b.to);
    renderMap('history',packets,start,end);
  }catch(e){setError(e.message);toast('Grafik riwayat gagal: '+e.message);}
  finally{hide('historyGraphLoading');}
}

/* =========================== TABS / TIMERS =========================== */

function showTab(tab){
  S.tab=tab;
  $('liveTabBtn').classList.toggle('active',tab==='live');
  $('historyTabBtn').classList.toggle('active',tab==='history');
  if(!S.deviceId){setEmpty('Pilih kendaraan untuk menampilkan data.');return;}
  hide('emptyPanel');
  if(tab==='live'){
    show('livePanel');hide('historyPanel');
    setTimeout(function(){
      if(S.maps.live){
        S.maps.live.resize();
        if(S.liveFollow && !S.liveTrace)centerOnLiveVehicle(false);
      }
    },80);
  }else{
    hide('livePanel');show('historyPanel');
    setTimeout(function(){if(S.maps.history)S.maps.history.resize();},80);
  }
}
function startTimers(){
  stopTimers();
  S.timers.live=setInterval(function(){
    if(document.hidden||S.tab!=='live'||!S.deviceId)return;
    loadLive(false).catch(setError);
  },15000);
  S.timers.freshness=setInterval(function(){if(S.live&&S.tab==='live')renderLive();},10000);
}
function stopTimers(){
  Object.keys(S.timers).forEach(function(k){if(S.timers[k])clearInterval(S.timers[k]);S.timers[k]=null;});
}

/* =========================== EVENTS =========================== */

function bind(){
  $('loginForm').addEventListener('submit',async function(e){
    e.preventDefault(); $('loginError').textContent='';
    try{
      await signIn($('loginEmail').value.trim(),$('loginPassword').value,$('rememberLogin').checked);
      hide('loginScreen');show('app');await bootstrapData();
    }catch(err){$('loginError').textContent=err.message;setError(err.message);}
  });

  $('logoutBtn').addEventListener('click',function(){stopTimers();clearAuth();location.reload();});
  $('vehicleSelect').addEventListener('change',function(){selectVehicle(this.value).catch(function(e){setError(e.message);toast(e.message);});});
  $('liveTabBtn').addEventListener('click',function(){showTab('live');});
  $('historyTabBtn').addEventListener('click',function(){showHistory();});
  $('displaySettingsBtn').addEventListener('click',openDisplayPrefs);
  $('displayPrefsList').addEventListener('click',function(e){
    if(e.target.classList.contains('pref-up'))movePrefRow(e.target,-1);
    if(e.target.classList.contains('pref-down'))movePrefRow(e.target,1);
  });
  $('saveDisplayPrefs').addEventListener('click',function(){savePrefs().catch(function(e){setError(e.message);toast(e.message);});});
  $('resetDisplayPrefs').addEventListener('click',function(){S.cardKeys=[];if(S.live)S.cardKeys=defaultCardKeys(safeJson(S.live.LATEST_PID_JSON,{})||{});openDisplayPrefs();});

  $('livePidChecks').addEventListener('change',function(e){if(e.target.matches('input[type=checkbox]'))handlePidCheck('live',e.target);});
  $('historyPidChecks').addEventListener('change',function(e){if(e.target.matches('input[type=checkbox]'))handlePidCheck('history',e.target);});
  $('liveFollowBtn').addEventListener('click',function(){
    if(S.liveFollow){
      setLiveFollow(false,false);
    }else{
      S.liveTrace=null;
      hide('liveTracePanel');
      setLiveFollow(true,true);
    }
  });
  $('graphRefreshBtn').addEventListener('click',loadLiveGraph);
  $('historyGraphRefreshBtn').addEventListener('click',function(){loadHistoryGraph(true);});
  $('normalizeLive').addEventListener('change',loadLiveGraph);
  $('normalizeHistory').addEventListener('change',loadHistoryGraph);

  $('liveRangeButtons').addEventListener('click',function(e){
    if(!e.target.dataset.minutes)return;
    [].slice.call(this.querySelectorAll('button')).forEach(function(b){b.classList.remove('active');});
    e.target.classList.add('active');
    var v=e.target.dataset.minutes;
    S.liveRangeMinutes=v==='custom'?'custom':Number(v);
    if(v==='custom'){show('liveCustomRange');return;} hide('liveCustomRange');loadLiveGraph();
  });
  $('liveCustomApply').addEventListener('click',function(){
    var f=new Date($('liveFrom').value).getTime(),t=new Date($('liveTo').value).getTime();
    if(!f||!t||f>=t){toast('Range Custom tidak valid');return;}
    S.liveCustom={from:f,to:t};S.liveRangeMinutes='custom';loadLiveGraph();
  });

  $('historyRangeButtons').addEventListener('click',function(e){
    if(!e.target.dataset.range)return;
    [].slice.call(this.querySelectorAll('button')).forEach(function(b){b.classList.remove('active');});
    e.target.classList.add('active');S.historyRange=e.target.dataset.range;
    if(S.historyRange==='custom'){show('historyCustomRange');return;} hide('historyCustomRange');loadHistoryGraph();
  });
  $('historyCustomApply').addEventListener('click',function(){
    var f=new Date($('historyFrom').value).getTime(),t=new Date($('historyTo').value).getTime();
    if(!f||!t||f>=t){toast('Range Custom tidak valid');return;}
    S.historyCustom={from:f,to:t};S.historyRange='custom';loadHistoryGraph();
  });

  $('backToNowBtn').addEventListener('click',function(){
    S.liveTrace=null;
    hide('liveTracePanel');
    setLiveFollow(true,true);
    loadLiveGraph();
  });
  $('resetHistoryRange').addEventListener('click',function(){S.historyRange='whole';S.historyTrace=null;hide('historyTracePanel');loadHistoryGraph();});

  $('historyRefreshBtn').addEventListener('click',function(){loadHistory(true);});
  $('historyFilterBtn').addEventListener('click',renderHistoryList);
  $('historyClearFilterBtn').addEventListener('click',function(){$('historyFromDate').value='';$('historyToDate').value='';renderHistoryList();});
  $('historyList').addEventListener('click',function(e){
    var b=e.target.closest('.history-open');
    if(!b)return;
    e.preventDefault();
    openHistorySession(b.dataset.sessionKey).catch(function(err){
      setError(err.message||err);
      toast('Detail gagal dibuka: '+text(err.message||err));
      $('historyDetailError').textContent='Detail gagal dibuka: '+text(err.message||err);
      show('historyDetail');
    });
  });
  $('closeHistoryDetail').addEventListener('click',function(){
    hide('historyDetail');
    $('historyDetailError').textContent='';
    var p=$('historyList').closest('.panel');
    if(p)p.classList.remove('hidden');
  });

  document.addEventListener('visibilitychange',function(){if(!document.hidden&&S.deviceId&&S.tab==='live')loadLive(false).catch(setError);});
}

bind();
boot().catch(function(e){setError(e.message);$('loginError').textContent=e.message;show('loginScreen');hide('app');});

})();
