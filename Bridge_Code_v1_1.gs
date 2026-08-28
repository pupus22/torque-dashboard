/**
 * TORQUE SHEET -> FIREBASE MIRROR BRIDGE v1.0.0
 *
 * PROJECT BARU / TERPISAH.
 * TIDAK mengubah Receiver Apps Script lama.
 * TIDAK mengubah Dashboard Apps Script lama.
 *
 * Google Sheet existing tetap MASTER:
 * 1Hm-t595SCY2gI0gQX228AX0CfCz-mMyW4W5MEES8W4Q
 *
 * Firebase hanya mirror/cache untuk dashboard GitHub baru.
 */

var BRIDGE_VERSION = '1.1.0';
var SPREADSHEET_ID = '1Hm-t595SCY2gI0gQX228AX0CfCz-mMyW4W5MEES8W4Q';
var TZ = 'Asia/Jakarta';

var SHEETS = {
  RAW: 'RAW_LOG',
  LIVE: 'LIVE_STATE',
  SESSIONS: 'SESSIONS',
  DEVICES: 'DEVICES',
  PID: 'PID_CATALOG',
  EVENTS: 'EVENTS',
  NOTES: 'EVENT_NOTES',
  CONFIG: 'CONFIG'
};

var MAX_RAW_ROWS_PER_RUN = 2000;
var RETENTION_DAYS = 14;

/**
 * WAJIB isi Script Properties di:
 * Apps Script -> Project Settings -> Script properties
 *
 * FIREBASE_API_KEY
 * FIREBASE_DB_URL
 * FIREBASE_SYNC_EMAIL
 * FIREBASE_SYNC_PASSWORD
 *
 * FIREBASE_DB_URL contoh:
 * https://nama-project-default-rtdb.asia-southeast1.firebasedatabase.app
 */
function bridgeHealth() {
  var p = bridgeProps_();
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var raw = ss.getSheetByName(SHEETS.RAW);
  return {
    ok: true,
    version: BRIDGE_VERSION,
    spreadsheetId: SPREADSHEET_ID,
    firebaseDbUrl: p.dbUrl,
    rawLastRow: raw ? raw.getLastRow() : 0,
    rawLastSyncedRow: Number(PropertiesService.getScriptProperties().getProperty('RAW_LAST_ROW') || 0),
    retentionDays: RETENTION_DAYS,
    now: new Date().toISOString()
  };
}

/**
 * Jalankan SETELAH Script Properties sudah diisi.
 * Hanya menguji login + write ke Firebase.
 */
function testFirebaseConnection() {
  firebasePut_('mirror/meta/bridge_test', {
    ok: true,
    bridgeVersion: BRIDGE_VERSION,
    time: Date.now(),
    sourceSpreadsheet: SPREADSHEET_ID
  });
  Logger.log('Firebase OK');
}

/**
 * Initial import:
 * - DEVICES
 * - LIVE_STATE
 * - SESSIONS
 * - PID_CATALOG
 * - EVENTS
 * - EVENT_NOTES
 * - CONFIG
 * - RAW_LOG 14 hari terakhir secara bertahap
 *
 * Boleh dijalankan berulang sampai remainingRawRows = 0.
 */
function initialSync14Days() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  syncCore_(ss, true);

  var lastMarker = Number(props.getProperty('RAW_LAST_ROW') || 0);
  if (!lastMarker) {
    var firstRecent = findFirstRecentRawRow_(ss.getSheetByName(SHEETS.RAW), RETENTION_DAYS);
    props.setProperty('RAW_LAST_ROW', String(Math.max(1, firstRecent - 1)));
  }

  var result = syncRawIncremental_(ss, MAX_RAW_ROWS_PER_RUN);
  Logger.log(JSON.stringify(result));
  return result;
}

/**
 * Trigger utama setiap 1 menit.
 * Core sheet kecil disalin ulang agar perubahan status/session segera ikut.
 * RAW_LOG hanya incremental dari row terakhir yang sukses.
 */
function syncMinute() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return {ok:false, skipped:'LOCKED'};

  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    syncCore_(ss, false);
    var rawResult = syncRawIncremental_(ss, MAX_RAW_ROWS_PER_RUN);

    firebasePut_('mirror/meta/sync', {
      ok: true,
      bridgeVersion: BRIDGE_VERSION,
      syncedAt: Date.now(),
      rawLastRow: rawResult.lastSyncedRow,
      rawRemaining: rawResult.remainingRawRows
    });

    return {ok:true, raw:rawResult};
  } finally {
    lock.releaseLock();
  }
}

/**
 * Jalankan sekali.
 * Membuat trigger BARU di project bridge ini saja.
 */
function setupBridgeTriggers() {
  var handlers = {'syncMinute':true, 'cleanupOldTelemetry':true};
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (handlers[t.getHandlerFunction()]) ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('syncMinute')
    .timeBased()
    .everyMinutes(1)
    .create();

  ScriptApp.newTrigger('cleanupOldTelemetry')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();

  Logger.log('Trigger sync 1 menit + cleanup harian dibuat.');
}

/**
 * Jalankan sekali setelah mengganti Bridge ke v1.1.
 * Memaksa PID_CATALOG existing dikirim ulang ke Firebase.
 */
function forceSyncPidCatalog() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var rows = readObjects_(ss.getSheetByName(SHEETS.PID));
  var keyed = rowsToKeyed_(rows, 'RAW_KEY');
  firebasePut_('mirror/pid_catalog', keyed);
  PropertiesService.getScriptProperties().setProperty('CATALOG_SYNCED', String(Date.now()));
  Logger.log('PID_CATALOG synced: ' + Object.keys(keyed).length + ' PID');
  return {ok:true, count:Object.keys(keyed).length};
}

/**
 * Menghapus TELEMETRY mirror yang lebih tua dari 14 hari.
 * Summary session tidak ikut dihapus.
 */
function cleanupOldTelemetry() {
  var cutoff = new Date();
  cutoff.setHours(0,0,0,0);
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  var dates = firebaseGet_('mirror/telemetry') || {};
  var removed = [];

  Object.keys(dates).forEach(function(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    var d = new Date(dateKey + 'T00:00:00+07:00');
    if (!isNaN(d.getTime()) && d.getTime() < cutoff.getTime()) {
      firebaseDelete_('mirror/telemetry/' + dateKey);
      removed.push(dateKey);
    }
  });

  firebasePut_('mirror/meta/cleanup', {
    cleanedAt: Date.now(),
    retentionDays: RETENTION_DAYS,
    removedDates: removed
  });

  Logger.log('Removed: ' + removed.join(', '));
  return removed;
}

/* =========================== CORE MIRROR =========================== */

function syncCore_(ss, includeCatalog) {
  firebasePut_('mirror/devices', rowsToKeyed_(readObjects_(ss.getSheetByName(SHEETS.DEVICES)), 'DEVICE_ID'));

  var liveRows = readObjects_(ss.getSheetByName(SHEETS.LIVE));
  firebasePut_('mirror/live', rowsToKeyed_(liveRows, 'DEVICE_ID'));

  var sessionRows = readObjects_(ss.getSheetByName(SHEETS.SESSIONS));
  firebasePut_('mirror/sessions', sessionsNested_(sessionRows));

  var eventRows = readObjects_(ss.getSheetByName(SHEETS.EVENTS));
  firebasePut_('mirror/events', eventsNested_(eventRows));

  var noteRows = readObjects_(ss.getSheetByName(SHEETS.NOTES));
  firebasePut_('mirror/notes', notesNested_(noteRows));

  firebasePut_('mirror/config', rowsToKeyed_(readObjects_(ss.getSheetByName(SHEETS.CONFIG)), 'KEY'));

  // PID_CATALOG kecil dan bisa berubah/bertambah ketika receiver belajar PID baru.
  // Sinkronkan SETIAP core sync supaya Firebase tidak menyimpan katalog lama.
  firebasePut_('mirror/pid_catalog',
    rowsToKeyed_(readObjects_(ss.getSheetByName(SHEETS.PID)), 'RAW_KEY'));
  PropertiesService.getScriptProperties().setProperty('CATALOG_SYNCED', String(Date.now()));

  firebasePut_('mirror/meta/core', {
    syncedAt: Date.now(),
    bridgeVersion: BRIDGE_VERSION
  });
}

function syncRawIncremental_(ss, maxRows) {
  var sh = ss.getSheetByName(SHEETS.RAW);
  if (!sh || sh.getLastRow() < 2) {
    return {ok:true, lastSyncedRow:1, remainingRawRows:0};
  }

  var props = PropertiesService.getScriptProperties();
  var lastRow = sh.getLastRow();
  var lastSynced = Number(props.getProperty('RAW_LAST_ROW') || 1);
  if (lastSynced < 1) lastSynced = 1;
  if (lastSynced >= lastRow) {
    return {ok:true, lastSyncedRow:lastSynced, remainingRawRows:0};
  }

  var startRow = lastSynced + 1;
  var count = Math.min(maxRows || MAX_RAW_ROWS_PER_RUN, lastRow - lastSynced);
  var values = sh.getRange(startRow, 1, count, 9).getValues();

  // Group menjadi:
  // mirror/telemetry/YYYY-MM-DD/DEVICE_ID/SESSION_ID/{TORQUE_MS_HASH}
  var grouped = {};

  values.forEach(function(r, idx) {
    var receivedAt = ms_(r[0]);
    var torqueTime = ms_(r[1]);
    var deviceId = safeKey_(r[2]);
    var sessionId = safeKey_(r[3]);
    var profile = text_(r[4]);
    var packetHash = text_(r[5]);
    var payloadJson = text_(r[6]);
    var parserVersion = text_(r[7]);
    var qualityFlags = text_(r[8]);

    if (!deviceId || !sessionId || !torqueTime) return;

    var dateKey = Utilities.formatDate(new Date(torqueTime), TZ, 'yyyy-MM-dd');
    if (!grouped[dateKey]) grouped[dateKey] = {};
    if (!grouped[dateKey][deviceId]) grouped[dateKey][deviceId] = {};
    if (!grouped[dateKey][deviceId][sessionId]) grouped[dateKey][deviceId][sessionId] = {};

    var packetKey = String(torqueTime) + '_' + safeKey_(packetHash.substring(0, 12) || String(startRow + idx));
    grouped[dateKey][deviceId][sessionId][packetKey] = {
      receivedAt: receivedAt,
      torqueTime: torqueTime,
      deviceId: text_(r[2]),
      sessionId: text_(r[3]),
      profileName: profile,
      packetHash: packetHash,
      payloadJson: payloadJson,
      parserVersion: parserVersion,
      qualityFlags: qualityFlags,
      sourceRow: startRow + idx
    };
  });

  // PATCH per tanggal supaya request tidak terlalu besar.
  Object.keys(grouped).forEach(function(dateKey) {
    firebasePatch_('mirror/telemetry/' + dateKey, grouped[dateKey]);
  });

  var newLast = startRow + count - 1;
  props.setProperty('RAW_LAST_ROW', String(newLast));

  return {
    ok:true,
    startRow:startRow,
    count:count,
    lastSyncedRow:newLast,
    sourceLastRow:lastRow,
    remainingRawRows:Math.max(0, lastRow - newLast)
  };
}

/* =========================== INITIAL 14 DAYS =========================== */

function findFirstRecentRawRow_(sh, days) {
  if (!sh || sh.getLastRow() < 2) return 2;

  var cutoff = Date.now() - Number(days || 14) * 86400000;
  var last = sh.getLastRow();
  var block = 5000;
  var cursor = last;

  while (cursor >= 2) {
    var start = Math.max(2, cursor - block + 1);
    var vals = sh.getRange(start, 2, cursor - start + 1, 1).getValues();
    var firstRecentInBlock = -1;

    for (var i = 0; i < vals.length; i++) {
      var t = ms_(vals[i][0]);
      if (t && t >= cutoff) {
        firstRecentInBlock = start + i;
        break;
      }
    }

    if (firstRecentInBlock !== -1) {
      // Cek block sebelumnya untuk memastikan awal 14 hari tidak terlewat.
      if (start === 2) return firstRecentInBlock;
      cursor = start - 1;
      continue;
    }

    // Tidak ada recent di block ini. Berarti awal recent ada setelah block.
    return cursor + 1;
  }

  return 2;
}

/* =========================== FIREBASE AUTH/REST =========================== */

function bridgeProps_() {
  var p = PropertiesService.getScriptProperties();
  var apiKey = text_(p.getProperty('FIREBASE_API_KEY'));
  var dbUrl = text_(p.getProperty('FIREBASE_DB_URL')).replace(/\/+$/, '');
  var email = text_(p.getProperty('FIREBASE_SYNC_EMAIL'));
  var password = text_(p.getProperty('FIREBASE_SYNC_PASSWORD'));

  if (!apiKey || !dbUrl || !email || !password) {
    throw new Error(
      'Script Properties belum lengkap. Isi FIREBASE_API_KEY, FIREBASE_DB_URL, FIREBASE_SYNC_EMAIL, FIREBASE_SYNC_PASSWORD.'
    );
  }

  return {apiKey:apiKey, dbUrl:dbUrl, email:email, password:password};
}

function firebaseIdToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('FB_ID_TOKEN');
  if (cached) return cached;

  var p = bridgeProps_();
  var url = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(p.apiKey);
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      email: p.email,
      password: p.password,
      returnSecureToken: true
    }),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error('Firebase Auth gagal: HTTP ' + res.getResponseCode() + ' ' + res.getContentText());
  }

  var obj = JSON.parse(res.getContentText());
  if (!obj.idToken) throw new Error('Firebase Auth tidak mengembalikan idToken.');

  cache.put('FB_ID_TOKEN', obj.idToken, 3300);
  return obj.idToken;
}

function firebaseUrl_(path) {
  var p = bridgeProps_();
  return p.dbUrl + '/' + cleanPath_(path) + '.json?auth=' + encodeURIComponent(firebaseIdToken_());
}

function firebasePut_(path, value) {
  return firebaseFetch_(path, 'put', value);
}

function firebasePatch_(path, value) {
  return firebaseFetch_(path, 'patch', value);
}

function firebaseGet_(path) {
  var res = UrlFetchApp.fetch(firebaseUrl_(path), {
    method:'get',
    muteHttpExceptions:true
  });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error('Firebase GET gagal [' + path + ']: ' + res.getResponseCode() + ' ' + res.getContentText());
  }
  return JSON.parse(res.getContentText() || 'null');
}

function firebaseDelete_(path) {
  var res = UrlFetchApp.fetch(firebaseUrl_(path), {
    method:'delete',
    muteHttpExceptions:true
  });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error('Firebase DELETE gagal [' + path + ']: ' + res.getResponseCode() + ' ' + res.getContentText());
  }
  return true;
}

function firebaseFetch_(path, method, value) {
  var res = UrlFetchApp.fetch(firebaseUrl_(path), {
    method: method,
    contentType: 'application/json',
    payload: JSON.stringify(value == null ? null : value),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error('Firebase ' + method.toUpperCase() + ' gagal [' + path + ']: ' +
      res.getResponseCode() + ' ' + res.getContentText());
  }

  return true;
}

/* =========================== TRANSFORM =========================== */

function readObjects_(sh) {
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 1) return [];
  var values = sh.getDataRange().getValues();
  var headers = values.shift().map(function(h){ return text_(h); });

  return values.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      obj[h] = jsonSafe_(row[i]);
    });
    return obj;
  });
}

function rowsToKeyed_(rows, keyField) {
  var out = {};
  (rows || []).forEach(function(r) {
    var key = safeKey_(r[keyField]);
    if (key) out[key] = r;
  });
  return out;
}

function sessionsNested_(rows) {
  var out = {};
  (rows || []).forEach(function(r) {
    var d = safeKey_(r.DEVICE_ID);
    var s = safeKey_(r.SESSION_ID);
    if (!d || !s) return;
    if (!out[d]) out[d] = {};
    out[d][s] = r;
  });
  return out;
}

function eventsNested_(rows) {
  var out = {};
  (rows || []).forEach(function(r) {
    var d = safeKey_(r.DEVICE_ID);
    var s = safeKey_(r.SESSION_ID);
    var e = safeKey_(r.EVENT_ID || (r.START_TIME + '_' + r.RAW_KEY));
    if (!d || !s || !e) return;
    if (!out[d]) out[d] = {};
    if (!out[d][s]) out[d][s] = {};
    out[d][s][e] = r;
  });
  return out;
}

function notesNested_(rows) {
  var out = {};
  (rows || []).forEach(function(r) {
    var d = safeKey_(r.DEVICE_ID);
    var s = safeKey_(r.SESSION_ID);
    var n = safeKey_(r.NOTE_ID || r.TORQUE_TIME);
    if (!d || !s || !n) return;
    if (!out[d]) out[d] = {};
    if (!out[d][s]) out[d][s] = {};
    out[d][s][n] = r;
  });
  return out;
}

function jsonSafe_(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') {
    if (!isFinite(v)) return null;
    return v;
  }
  if (v === null || typeof v === 'undefined') return '';
  return v;
}

function ms_(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number' && isFinite(v)) return v;
  var n = Number(v);
  if (isFinite(n) && n > 100000000000) return n;
  var d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function text_(v) {
  return v == null ? '' : String(v).trim();
}

function safeKey_(v) {
  return text_(v)
    .replace(/[.#$\[\]\/]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 180);
}

function cleanPath_(p) {
  return String(p || '')
    .split('/')
    .filter(function(x){ return !!x; })
    .map(safeKey_)
    .join('/');
}
