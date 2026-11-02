const SPREADSHEET_ID = "1HW5oZmIAxQcyU2bXlmGVUR84SrsolRr0CZ4lOqjYaZY";

const DATA_SHEETS = ['users', 'kelas', 'pertemuan', 'materi', 'lkpd', 'games', 'evaluasi', 'soal_evaluasi', 'submissions', 'reviews'];

const TOKEN_TTL_SEC = 12 * 3600;          
const TOKEN_GRACE_SEC = 7 * 24 * 3600;    
const CACHE_TTL_SEC = 600;                
const CACHE_CHUNK_CHARS = 30000; 
const LOGIN_MAX_GAGAL = 5;
const LOGIN_KUNCI_SEC = 600;

const STAF = ['guru', 'admin'];

const ACTION_RULES = {
  get_pdf_base64: { optional: true },
  upload_pdf: { roles: STAF },
  ocr_pdf_drive: { roles: STAF },
  add_user: { roles: ['admin'] },
  update_user: { roles: ['admin'] },
  delete_user: { roles: ['admin'] },
  save_kelas: { roles: ['admin'] },
  delete_kelas: { roles: ['admin'] },
  save_pertemuan: { roles: STAF },
  delete_pertemuan: { roles: STAF },
  save_materi: { roles: STAF },
  delete_materi: { roles: STAF },
  save_lkpd: { roles: STAF },
  delete_lkpd: { roles: STAF },
  save_field_map_lkpd: { roles: STAF },
  save_game: { roles: STAF },
  delete_game: { roles: STAF },
  save_evaluasi: { roles: STAF },
  delete_evaluasi: { roles: STAF },
  save_soal_evaluasi: { roles: STAF },
  delete_soal_evaluasi: { roles: STAF },
  grade_submisi: { roles: STAF },
  delete_submisi: { roles: STAF },
  submit_lkpd: { grace: true },
  submit_lkpd_isian: { grace: true },
  submit_game: { grace: true },
  submit_evaluasi: { grace: true },
  save_review: { grace: true },
  get_jawaban_lkpd_isian: {}
};

const ACTION_SHEETS = {
  add_user: ['users'], update_user: ['users'], delete_user: ['users'],
  save_kelas: ['kelas'], delete_kelas: ['kelas'],
  save_pertemuan: ['pertemuan'], delete_pertemuan: ['pertemuan'],
  save_materi: ['materi'], delete_materi: ['materi'],
  save_lkpd: ['lkpd'], delete_lkpd: ['lkpd'], save_field_map_lkpd: ['lkpd'],
  save_game: ['games'], delete_game: ['games'],
  save_evaluasi: ['evaluasi'], delete_evaluasi: ['evaluasi', 'soal_evaluasi'],
  save_soal_evaluasi: ['soal_evaluasi'], delete_soal_evaluasi: ['soal_evaluasi'],
  submit_lkpd: ['submissions'], submit_lkpd_isian: ['submissions'],
  submit_game: ['submissions'], submit_evaluasi: ['submissions'],
  grade_submisi: ['submissions'], delete_submisi: ['submissions'],
  save_review: ['reviews']
};

function respAuthGagal_() {
  return { success: false, auth: true, message: 'Sesi berakhir atau tidak valid. Silakan login ulang.' };
}

function getTokenSecret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('TOKEN_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('TOKEN_SECRET', s);
  }
  return s;
}

function signToken_(payloadB64) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payloadB64, getTokenSecret_())
  );
}

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function issueToken_(user) {
  const payload = {
    u: String(user.username || ''),
    r: String(user.role || ''),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC
  };
  const b64 = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8);
  return b64 + '.' + signToken_(b64);
}

function verifyToken_(token, graceSec) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  if (!safeEqual_(signToken_(parts[0]), parts[1])) return null;
  let p;
  try {
    p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  } catch (e) { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (!p || !p.u || now > Number(p.exp || 0) + Number(graceSec || 0)) return null;
  return { username: String(p.u), role: String(p.r) };
}

function authenticate_(token, graceSec) {
  const t = verifyToken_(token, graceSec);
  if (!t) return null;
  const u = readSheetCached('users').find(x =>
    String(x.username || '').trim().toLowerCase() === t.username.toLowerCase()
  );
  if (!u) return null;
  const roleNow = String(u.role || '').trim().toLowerCase();
  if (roleNow !== t.role) return null;
  return {
    username: String(u.username).trim(),
    name: u.nama_lengkap,
    role: roleNow,
    kelas: String(u.kelas || '').trim()
  };
}

function identitas_(data) {
  const a = data.__auth;
  if (!a) throw new Error('Identitas pengguna tidak ditemukan.');
  return { username: a.username, nama: a.name, kelas: a.kelas };
}

function cacheGen_(name) {
  const c = CacheService.getScriptCache();
  let g = c.get('g:' + name);
  if (!g) {
    g = Utilities.getUuid().slice(0, 8);
    c.put('g:' + name, g, 21600);
  }
  return g;
}

function bustCache_(name) {
  CacheService.getScriptCache().put('g:' + name, Utilities.getUuid().slice(0, 8), 21600);
}

function invalidateCacheForAction_(action) {
  const names = ACTION_SHEETS[action];
  if (names) names.forEach(bustCache_);
}

function readSheetCached(name) {
  const c = CacheService.getScriptCache();
  const base = 'd:' + name + ':' + cacheGen_(name);

  try {
    const n = Number(c.get(base + ':n') || 0);
    if (n > 0) {
      const keys = [];
      for (let i = 0; i < n; i++) keys.push(base + ':' + i);
      const got = c.getAll(keys);
      let json = '';
      let lengkap = true;
      for (let i = 0; i < n; i++) {
        if (got[keys[i]] === undefined || got[keys[i]] === null) { lengkap = false; break; }
        json += got[keys[i]];
      }
      if (lengkap) return JSON.parse(json);
    }
  } catch (e) {}

  const data = getSheetDataAsJson(getSheetCaseInsensitive(getSS(), name));

  try {
    const json = JSON.stringify(data);
    const parts = {};
    let n = 0;
    for (let i = 0; i < json.length; i += CACHE_CHUNK_CHARS) {
      parts[base + ':' + (n++)] = json.substr(i, CACHE_CHUNK_CHARS);
    }
    parts[base + ':n'] = String(n);
    c.putAll(parts, CACHE_TTL_SEC);
  } catch (e) {}

  return data;
}

function stripPassword_(u) {
  const o = {};
  Object.keys(u).forEach(k => { if (k !== 'password') o[k] = u[k]; });
  return o;
}

function filterSubmissions_(rows, auth) {
  if (!auth) return [];
  if (auth.role === 'guru' || auth.role === 'admin') return rows;
  const me = auth.username.toLowerCase();
  return rows.filter(s => String(s.username_siswa || '').trim().toLowerCase() === me);
}

function filterReviews_(rows, auth) {
  if (auth && (auth.role === 'guru' || auth.role === 'admin')) return rows;
  const me = auth ? auth.username.toLowerCase() : '';
  return rows.map(r => {
    if (me && String(r.username_siswa || '').trim().toLowerCase() === me) return r;
    return { id_review: r.id_review, id_materi: r.id_materi, rating: r.rating, timestamp: r.timestamp };
  });
}

function filterDataByRole_(raw, auth) {
  const role = auth ? auth.role : 'guest';
  const out = {};

  if (role === 'admin' || role === 'guru') {
    DATA_SHEETS.forEach(n => { out[n] = raw[n] || []; });
    out.users = out.users.map(stripPassword_);
    return out;
  }

  const kelasUser = auth ? String(auth.kelas || '').trim() : '';
  const inScope = r => {
    const k = String(r.id_kelas || '').trim();
    return k.toUpperCase() === 'ALL' || (kelasUser !== '' && k === kelasUser);
  };
  const visible = r => String(r.status || '').trim() === 'Publish' && inScope(r);

  out.kelas = raw.kelas || [];
  out.pertemuan = (raw.pertemuan || []).filter(visible);

  const ptmIds = {};
  out.pertemuan.forEach(p => { ptmIds[String(p.id_pertemuan || '').trim()] = true; });
  const anak = r => visible(r) && ptmIds[String(r.id_pertemuan || '').trim()] === true;

  out.materi = (raw.materi || []).filter(anak);
  out.lkpd = (raw.lkpd || []).filter(anak);
  out.games = (raw.games || []).filter(anak);
  out.evaluasi = (raw.evaluasi || []).filter(anak);

  const evalIds = {};
  out.evaluasi.forEach(ev => { evalIds[String(ev.id_evaluasi || '').trim()] = true; });

  out.soal_evaluasi = (raw.soal_evaluasi || [])
    .filter(s => evalIds[String(s.id_evaluasi || '').trim()] === true)
    .map(s => {
      const c = {};
      Object.keys(s).forEach(k => { if (k !== 'kunci_jawaban' && k !== 'pembahasan') c[k] = s[k]; });
      if (!auth) { c.pertanyaan = ''; c.opsi_a = ''; c.opsi_b = ''; c.opsi_c = ''; c.opsi_d = ''; }
      return c;
    });

  out.submissions = filterSubmissions_(raw.submissions || [], auth);
  out.reviews = filterReviews_(raw.reviews || [], auth);
  out.users = auth
    ? (raw.users || [])
        .filter(u => String(u.username || '').trim().toLowerCase() === auth.username.toLowerCase())
        .map(stripPassword_)
    : [];

  return out;
}

function hitungSkorEvaluasi_(idEvaluasi, jawaban) {
  let jw = jawaban;
  if (typeof jw === 'string') { try { jw = JSON.parse(jw); } catch (e) { jw = {}; } }
  jw = jw || {};

  const soal = readSheetCached('soal_evaluasi').filter(s =>
    String(s.id_evaluasi || '').trim() === String(idEvaluasi).trim()
  );
  if (soal.length === 0) return { ok: false };

  let benar = 0;
  soal.forEach(s => {
    const j = String(jw[s.id_soal] || '').trim().toUpperCase();
    const k = String(s.kunci_jawaban || '').trim().toUpperCase();
    if (j && j === k) benar++;
  });
  return { ok: true, benar: benar, total: soal.length, skor: Math.round((benar / soal.length) * 100) };
}

function isKnownDriveFile_(fileId) {
  const id = String(fileId).trim();
  return ['materi', 'lkpd'].some(n =>
    readSheetCached(n).some(r =>
      String(r.file_drive_id || '').trim() === id ||
      String(r.file_pdf_url || '').indexOf(id) !== -1
    )
  );
}

function bersihkanCache() {
  DATA_SHEETS.forEach(bustCache_);
}

function onEdit(e) {
  try {
    const name = String(e.range.getSheet().getName() || '').trim().toLowerCase();
    if (DATA_SHEETS.indexOf(name) !== -1) bustCache_(name);
  } catch (err) {}
}

function migrasiPasswordKeHash() {
  const sheet = getSheetCaseInsensitive(getSS(), 'users');
  if (!sheet || sheet.getLastRow() <= 1) return 'Tidak ada pengguna.';
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const col = headers.findIndex(h => String(h).trim() === 'password');
  if (col === -1) return 'Kolom password tidak ditemukan.';
  const range = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1);
  const vals = range.getValues();
  let diubah = 0;
  const baru = vals.map(r => {
    const v = String(r[0] || '').trim();
    if (v && !/^[0-9a-f]{64}$/.test(v)) { diubah++; return [hashPassword(v)]; }
    return [r[0]];
  });
  range.setValues(baru);
  bustCache_('users');
  return diubah + ' password dikonversi.';
}

function getSS() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "PASTE_ID_SPREADSHEET_DI_SINI") {
    throw new Error("ID Spreadsheet belum diisi pada variabel SPREADSHEET_ID!");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheetCaseInsensitive(ss, sheetName) {
  const sheets = ss.getSheets();
  const targetName = String(sheetName).trim().toLowerCase();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === targetName) {
      return sheets[i];
    }
  }
  return null;
}

function hashPassword(password) {
  if (!password) return '';
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password), Utilities.Charset.UTF_8);
  let txtHash = '';
  for (let i = 0; i < rawHash.length; i++) {
    let byteVal = rawHash[i];
    if (byteVal < 0) byteVal += 256;
    let byteHex = byteVal.toString(16);
    if (byteHex.length === 1) byteHex = '0' + byteHex;
    txtHash += byteHex;
  }
  return txtHash;
}

function doGet(e) {
  try {
    const p = (e && e.parameter) ? e.parameter : {};
    const action = p.action || '';
    const token = p.token || '';

    let auth = null;
    if (token) {
      auth = authenticate_(token, 0);
      if (!auth) return createJsonResponse(respAuthGagal_());
    }

    if (action === 'get_all_data') {
      return createJsonResponse({ success: true, data: getAllDataOptimized(auth) });
    }
    if (action === 'get_submissions') {
      if (!auth) return createJsonResponse(respAuthGagal_());
      return createJsonResponse({ success: true, data: getSubmissionsFor_(auth) });
    }
    if (action === 'get_reviews') {
      if (!auth) return createJsonResponse(respAuthGagal_());
      return createJsonResponse({ success: true, data: filterReviews_(readSheetCached('reviews'), auth) });
    }
    return createJsonResponse({ success: false, message: 'Action GET tidak dikenal' });
  } catch (err) {
    return createJsonResponse({ success: false, message: 'GET Error: ' + err.toString() });
  }
}

function doPost(e) {
  let action = '';
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ success: false, message: 'Payload POST kosong!' });
    }

    const contents = JSON.parse(e.postData.contents);
    action = contents.action;

    contents.__auth = null;
    const rule = ACTION_RULES[action];
    if (rule) {
      const auth = authenticate_(contents.token, rule.grace ? TOKEN_GRACE_SEC : 0);
      if (!auth && !rule.optional) return createJsonResponse(respAuthGagal_());
      if (auth && rule.roles && rule.roles.indexOf(auth.role) === -1) {
        return createJsonResponse({ success: false, message: 'Akses ditolak untuk peran kamu.' });
      }
      contents.__auth = auth;
    }
    delete contents.token;

    let response;
    if (QUEUED_ACTIONS[action] && contents.queue_id) {
      response = handleQueuedAction(action, contents);
    } else {
      response = routePost_(action, contents);
    }
    return createJsonResponse(response);
  } catch (err) {
    return createJsonResponse({ success: false, message: 'POST Error: ' + err.toString() });
  } finally {
    invalidateCacheForAction_(action);
  }
}

function routePost_(action, contents) {
  switch (action) {
    case 'login': return handleLogin(contents);
    case 'upload_pdf': return handlePdfUpload(contents);
    case 'get_pdf_base64': return handleGetPdfBase64(contents);
    case 'add_user':
    case 'update_user': return handleUserSave(contents);
    case 'delete_user': return handleDeleteUser(contents);
    case 'save_kelas': return handleSaveKelas(contents);
    case 'delete_kelas': return handleDeleteKelas(contents);
    case 'save_pertemuan': return handleSavePertemuan(contents);
    case 'delete_pertemuan': return handleDeletePertemuan(contents);
    case 'save_materi': return handleSaveMateri(contents);
    case 'delete_materi': return handleDeleteMateri(contents);
    case 'save_lkpd': return handleSaveLkpd(contents);
    case 'delete_lkpd': return handleDeleteLkpd(contents);
    case 'save_game': return handleSaveGame(contents);
    case 'delete_game': return handleDeleteGame(contents);
    case 'save_evaluasi': return handleSaveEvaluasi(contents);
    case 'delete_evaluasi': return handleDeleteEvaluasi(contents);
    case 'save_soal_evaluasi': return handleSaveSoalEvaluasi(contents);
    case 'delete_soal_evaluasi': return handleDeleteSoalEvaluasi(contents);
    case 'submit_lkpd': return handleSubmitLkpd(contents);
    case 'submit_evaluasi': return handleSubmitEvaluasi(contents);
    case 'submit_game': return handleSubmitGame(contents);
    case 'grade_submisi': return handleGradeSubmisi(contents);
    case 'delete_submisi': return handleDeleteSubmisi(contents);
    case 'save_review': return handleSaveReview(contents);
    case 'save_field_map_lkpd': return handleSaveFieldMapLkpd(contents);
    case 'submit_lkpd_isian': return handleSubmitLkpdIsian(contents);
    case 'get_jawaban_lkpd_isian': return handleGetJawabanLkpdIsian(contents);
    case 'ocr_pdf_drive': return handleOcrPdfDrive(contents);
    default: return { success: false, message: 'Action invalid' };
  }
}

const QUEUED_ACTIONS = {
  submit_lkpd: 'submissions',
  submit_lkpd_isian: 'submissions',
  submit_game: 'submissions',
  submit_evaluasi: 'submissions',
  save_review: 'reviews'
};

function ensureColumn(sheet, colName) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const exists = headers.some(h => String(h).trim() === colName);
  if (!exists) sheet.getRange(1, lastCol + 1).setValue(colName);
}

function queueIdExists(sheetName, queueId) {
  const sheet = getSheetCaseInsensitive(getSS(), sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return false;

  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const colIdx = headers.findIndex(h => String(h).trim() === 'queue_id');
  if (colIdx === -1) return false;

  const values = sheet.getRange(2, colIdx + 1, sheet.getLastRow() - 1, 1).getValues();
  const target = String(queueId).trim();
  return values.some(row => String(row[0]).trim() === target);
}

function handleQueuedAction(action, contents) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return { success: false, message: 'Server sedang sibuk, akan dicoba lagi otomatis.' };
  }

  try {
    const sheetName = QUEUED_ACTIONS[action];
    const sheet = getSheetCaseInsensitive(getSS(), sheetName);
    if (sheet && sheet.getLastRow() > 0) ensureColumn(sheet, 'queue_id');

    if (queueIdExists(sheetName, contents.queue_id)) {
      return { success: true, duplicate: true, message: 'Data sudah diterima sebelumnya.' };
    }

    if (action === 'submit_lkpd') return handleSubmitLkpd(contents);
    if (action === 'submit_lkpd_isian') return handleSubmitLkpdIsian(contents);
    if (action === 'submit_game') return handleSubmitGame(contents);
    if (action === 'submit_evaluasi') {
      const hasil = handleSubmitEvaluasi(contents);
      if (hasil.duplicate) return { success: true, duplicate: true, message: hasil.message };
      return hasil;
    }
    if (action === 'save_review') return handleSaveReview(contents);
    return { success: false, message: 'Action invalid' };
  } catch (err) {
    return { success: false, message: 'POST Error: ' + err.toString() };
  } finally {
    lock.releaseLock();
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAllDataOptimized(auth) {
  const raw = {};
  DATA_SHEETS.forEach(n => {
    if (!auth && (n === 'users' || n === 'submissions')) { raw[n] = []; return; }
    raw[n] = readSheetCached(n);
  });
  return filterDataByRole_(raw, auth);
}

function getSubmissionsFor_(auth) {
  return filterSubmissions_(readSheetCached('submissions'), auth);
}

function getOrCreateSheet(sheetName, defaultHeaders) {
  const ss = getSS();
  let sheet = getSheetCaseInsensitive(ss, sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(defaultHeaders);
  }
  return sheet;
}

function getSheetDataAsJson(sheet) {
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0];
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    data.push(obj);
  }
  return data;
}

function getExistingCellValue(sheetName, idKey, idValue, colName) {
  const ss = getSS();
  const sheet = getSheetCaseInsensitive(ss, sheetName);
  if (!sheet) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  const idColIdx = headers.findIndex(h => String(h).trim() === String(idKey).trim());
  const colIdx = headers.findIndex(h => String(h).trim() === String(colName).trim());
  if (idColIdx === -1 || colIdx === -1) return null;

  const idColumnValues = sheet.getRange(1, idColIdx + 1, lastRow, 1).getValues();
  for (let i = 1; i < idColumnValues.length; i++) {
    if (String(idColumnValues[i][0]).trim() === String(idValue).trim()) {
      return sheet.getRange(i + 1, colIdx + 1).getValue();
    }
  }
  return null;
}

function upsertRowByObject(sheetName, defaultHeaders, idKey, idValue, dataObject) {
  const sheet = getOrCreateSheet(sheetName, defaultHeaders);
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), 1);

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  const rowData = headers.map(header => {
    const key = String(header).trim();
    if (dataObject.hasOwnProperty(key)) {
      const val = dataObject[key];
      return (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val;
    }
    return '';
  });

  if (lastRow <= 1) {
    sheet.appendRow(rowData);
    return;
  }

  const idColIdx = headers.findIndex(h => String(h).trim() === String(idKey).trim());
  const searchCol = idColIdx !== -1 ? idColIdx + 1 : 1;

  const idColumnValues = sheet.getRange(1, searchCol, lastRow, 1).getValues();
  let rowIndex = -1;

  for (let i = 1; i < idColumnValues.length; i++) {
    if (String(idColumnValues[i][0]).trim() === String(idValue).trim()) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

function deleteRowById(sheetName, idValue) {
  const ss = getSS();
  const sheet = getSheetCaseInsensitive(ss, sheetName);
  if (!sheet) return { success: false, message: `Sheet ${sheetName} tidak ditemukan!` };

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, message: 'ID tidak ditemukan!' };

  const idColumnValues = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (let i = 1; i < idColumnValues.length; i++) {
    if (String(idColumnValues[i][0]).trim() === String(idValue).trim()) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'Data berhasil dihapus!' };
    }
  }
  return { success: false, message: 'ID tidak ditemukan!' };
}

function deleteRowsByColumn(sheetName, colName, value) {
  const ss = getSS();
  const sheet = getSheetCaseInsensitive(ss, sheetName);
  if (!sheet) return 0;

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const colIdx = headers.findIndex(h => String(h).trim() === String(colName).trim());
  if (colIdx === -1) return 0;

  const colValues = sheet.getRange(1, colIdx + 1, lastRow, 1).getValues();
  let removed = 0;
  for (let i = colValues.length - 1; i >= 1; i--) {
    if (String(colValues[i][0]).trim() === String(value).trim()) {
      sheet.deleteRow(i + 1);
      removed++;
    }
  }
  return removed;
}

function handleLogin(data) {
  const inputUsername = String(data.username || '').trim().toLowerCase();
  const inputPassword = String(data.password || '').trim();
  if (!inputUsername || !inputPassword) {
    return { success: false, message: 'Username dan password wajib diisi.' };
  }

  const cache = CacheService.getScriptCache();
  const failKey = 'lg:' + hashPassword(inputUsername).slice(0, 32);
  const gagal = Number(cache.get(failKey) || 0);
  if (gagal >= LOGIN_MAX_GAGAL) {
    return { success: false, message: 'Terlalu banyak percobaan gagal. Coba lagi dalam 10 menit.' };
  }

  const users = readSheetCached('users');
  const inputHash = hashPassword(inputPassword);

  const user = users.find(u => {
    const uNameMatch = String(u.username || '').trim().toLowerCase() === inputUsername;
    const storedPass = String(u.password || '').trim();
    const uPassMatch = (storedPass === inputHash) || (storedPass === inputPassword);
    return uNameMatch && uPassMatch;
  });

  if (!user) {
    cache.put(failKey, String(gagal + 1), LOGIN_KUNCI_SEC);
    return { success: false, message: 'Username atau password salah!' };
  }

  cache.remove(failKey);
  const safeUser = {
    name: user.nama_lengkap,
    role: String(user.role).toLowerCase(),
    username: user.username,
    kelas: user.kelas
  };
  return { success: true, token: issueToken_(safeUser), user: safeUser };
}

function handleGetPdfBase64(data) {
  try {
    const fileId = String(data.fileId || '').trim();
    if (!fileId) return { success: false, message: 'fileId tidak dikirim pada request.' };

    const auth = data.__auth;
    const staf = auth && (auth.role === 'guru' || auth.role === 'admin');
    if (!staf && !isKnownDriveFile_(fileId)) {
      return { success: false, message: 'File tidak terdaftar pada materi atau LKPD.' };
    }

    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());

    return {
      success: true,
      base64: base64,
      mimeType: blob.getContentType() || 'application/pdf'
    };
  } catch (e) {
    return { success: false, message: 'Gagal mengambil file PDF dari Drive: ' + e.toString() };
  }
}

function handlePdfUpload(data) {
  try {
    const base64Str = data.base64Data;
    const fileName = data.fileName || ('Berkas_LKPD_' + new Date().getTime() + '.pdf');
    let cleanBase64 = base64Str.indexOf('base64,') !== -1 ? base64Str.split('base64,')[1] : base64Str;
    const decoded = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(decoded, 'application/pdf', fileName);

    const file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    let extractedText = extractTextFromPdfBlob(blob);

    return {
      success: true,
      message: extractedText ? 'PDF berhasil diunggah & teks berhasil diekstraksi!' : 'PDF berhasil diunggah (Teks tidak terdeteksi secara otomatis).',
      fileId: file.getId(),
      url: 'https://drive.google.com/file/d/' + file.getId() + '/preview',
      extractedText: extractedText || ''
    };
  } catch (e) {
    return { success: false, message: 'Gagal mengunggah PDF: ' + e.toString() };
  }
}

function extractTextFromPdfBlob(blob) {
  try {
    var metadata = {
      title: 'temp_ocr_' + new Date().getTime(),
      mimeType: 'application/vnd.google-apps.document'
    };
    var uploadUrl = 'https://www.googleapis.com/upload/drive/v2/files?uploadType=multipart&ocr=true&ocrLanguage=id';
    var boundary = '-------314159265358979323846';
    var delimiter = "\r\n--" + boundary + "\r\n";
    var close_delim = "\r\n--" + boundary + "--";

    var metadataContentType = 'application/json; charset=UTF-8';
    var base64Data = Utilities.base64Encode(blob.getBytes());
    var multipartResponseBody =
        delimiter +
        'Content-Type: ' + metadataContentType + '\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/pdf\r\n' +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        base64Data +
        close_delim;

    var token = ScriptApp.getOAuthToken();
    var response = UrlFetchApp.fetch(uploadUrl, {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
      },
      payload: multipartResponseBody,
      muteHttpExceptions: true
    });

    var resText = response.getContentText();
    var resJson = JSON.parse(resText);

    if (resJson && resJson.id) {
      Utilities.sleep(1500);
      var doc = DocumentApp.openById(resJson.id);
      var extractedText = doc.getBody().getText();

      try {
        DriveApp.getFileById(resJson.id).setTrashed(true);
      } catch (eClean) {}

      return extractedText ? extractedText.trim() : '';
    } else {
      Logger.log('OCR Error Response: ' + resText);
    }
  } catch (err) {
    Logger.log('OCR Extraction Exception: ' + err.toString());
  }
  return '';
}

function saveCanvasImageToDrive(base64Data, filename) {
  if (!base64Data || base64Data.length < 50) return '';
  try {
    let cleanBase64 = base64Data.indexOf('base64,') !== -1 ? base64Data.split('base64,')[1] : base64Data;
    const decoded = Utilities.base64Decode(cleanBase64);
    const mimeType = base64Data.indexOf('image/jpeg') !== -1 ? 'image/jpeg' : 'image/png';
    const blob = Utilities.newBlob(decoded, mimeType, filename);
    const file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return 'https://lh3.googleusercontent.com/d/' + file.getId();
  } catch (err) {
    return '';
  }
}

function handleUserSave(data) {
  try {
    const headers = ['user_id', 'nama_lengkap', 'username', 'password', 'role', 'kelas'];
    const isEdit = !!data.user_id;
    const userId = data.user_id || ('USR_' + new Date().getTime());
    const username = String(data.username || '').trim();
    if (!username) return { success: false, message: 'Username wajib diisi.' };

    const bentrok = getSheetDataAsJson(getSheetCaseInsensitive(getSS(), 'users')).find(u =>
      String(u.username || '').trim().toLowerCase() === username.toLowerCase() &&
      String(u.user_id || '').trim() !== String(userId).trim()
    );
    if (bentrok) return { success: false, message: 'Username "' + username + '" sudah dipakai pengguna lain.' };

    const role = String(data.role || 'siswa').toLowerCase();
    if (['siswa', 'guru', 'admin'].indexOf(role) === -1) {
      return { success: false, message: 'Peran tidak valid.' };
    }

    let passwordHash;
    const passBaru = String(data.password || '').trim();
    if (passBaru) {
      passwordHash = hashPassword(passBaru);
    } else if (isEdit) {
      passwordHash = String(getExistingCellValue('users', 'user_id', userId, 'password') || '');
    } else {
      return { success: false, message: 'Password wajib diisi untuk pengguna baru.' };
    }

    const dataObj = {
      user_id: userId,
      nama_lengkap: data.nama_lengkap || '',
      username: username,
      password: passwordHash,
      role: role,
      kelas: data.kelas || '-'
    };
    upsertRowByObject('users', headers, 'user_id', userId, dataObj);
    return { success: true, message: 'Data pengguna berhasil disimpan!' };
  } catch (e) { return { success: false, message: 'Gagal menyimpan pengguna: ' + e.toString() }; }
}

function handleDeleteUser(data) { return deleteRowById('users', data.user_id); }

function handleSaveKelas(data) {
  try {
    const headers = ['id_kelas', 'nama_kelas', 'tingkat', 'keterangan'];
    const idKelas = data.id_kelas || ('KLS_' + new Date().getTime());
    const dataObj = {
      id_kelas: idKelas,
      nama_kelas: data.nama_kelas || '',
      tingkat: data.tingkat || '',
      keterangan: data.keterangan || ''
    };
    upsertRowByObject('kelas', headers, 'id_kelas', idKelas, dataObj);
    return { success: true, message: 'Data kelas berhasil disimpan!' };
  } catch (e) { return { success: false, message: 'Gagal menyimpan kelas: ' + e.toString() }; }
}

function handleDeleteKelas(data) { return deleteRowById('kelas', data.id_kelas); }

function handleSavePertemuan(data) {
  try {
    const headers = ['id_pertemuan', 'id_kelas', 'nomor_pertemuan', 'judul_pertemuan', 'deskripsi', 'prompt_science', 'prompt_engineering', 'status'];
    const idPertemuan = data.id_pertemuan || ('PTM_' + new Date().getTime());
    const dataObj = {
      id_pertemuan: idPertemuan,
      id_kelas: data.id_kelas || 'ALL',
      nomor_pertemuan: data.nomor_pertemuan || 1,
      judul_pertemuan: data.judul_pertemuan || '',
      deskripsi: data.deskripsi || '',
      prompt_science: data.prompt_science || '',
      prompt_engineering: data.prompt_engineering || '',
      status: data.status || 'Publish'
    };
    upsertRowByObject('pertemuan', headers, 'id_pertemuan', idPertemuan, dataObj);
    return { success: true, message: 'Data pertemuan berhasil disimpan!' };
  } catch (e) { return { success: false, message: 'Gagal menyimpan pertemuan: ' + e.toString() }; }
}

function handleDeletePertemuan(data) { return deleteRowById('pertemuan', data.id_pertemuan); }

function handleSaveMateri(data) {
  try {
    const headers = ['id_materi', 'id_pertemuan', 'id_kelas', 'judul_materi', 'tipe_media', 'isi_teks', 'file_pdf_url', 'file_drive_id', 'urutan', 'status'];
    const idMateri = data.id_materi || ('MTR_' + new Date().getTime());
    const dataObj = {
      id_materi: idMateri,
      id_pertemuan: data.id_pertemuan || '',
      id_kelas: data.id_kelas || 'ALL',
      judul_materi: data.judul_materi || '',
      tipe_media: data.tipe_media || 'web_text',
      isi_teks: data.isi_teks || '',
      file_pdf_url: data.file_pdf_url || '',
      file_drive_id: data.file_drive_id || '',
      urutan: data.urutan || 1,
      status: data.status || 'Publish'
    };
    upsertRowByObject('materi', headers, 'id_materi', idMateri, dataObj);
    return { success: true, message: 'Bahan ajar berhasil disimpan!' };
  } catch (e) { return { success: false, message: 'Gagal menyimpan materi: ' + e.toString() }; }
}

function handleDeleteMateri(data) { return deleteRowById('materi', data.id_materi); }

function handleSaveLkpd(data) {
  try {
    const defaultHeaders = ['id_lkpd', 'id_pertemuan', 'id_kelas', 'judul_lkpd', 'tipe_lkpd', 'instruksi', 'file_pdf_url', 'file_drive_id', 'gambar_url', 'video_url', 'soal_json', 'fitur_kanvas', 'status', 'isi_teks', 'peta_field_json'];
    const idLkpd = data.id_lkpd || ('LKPD_' + new Date().getTime());

    const sheet = getOrCreateSheet('lkpd', defaultHeaders);
    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), 1);

    const allRangeValues = lastRow > 0 ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : [defaultHeaders];
    let headers = allRangeValues[0];

    if (headers.findIndex(h => String(h).trim() === 'video_url') === -1) {
      sheet.getRange(1, headers.length + 1).setValue('video_url');
      headers = headers.concat(['video_url']);
    }

    const idColIdx = headers.findIndex(h => String(h).trim() === 'id_lkpd');
    const petaColIdx = headers.findIndex(h => String(h).trim() === 'peta_field_json');

    let rowIndex = -1;
    let existingPetaField = '';

    if (lastRow > 1 && idColIdx !== -1) {
      for (let i = 1; i < allRangeValues.length; i++) {
        if (String(allRangeValues[i][idColIdx]).trim() === String(idLkpd).trim()) {
          rowIndex = i + 1;
          if (petaColIdx !== -1) {
            existingPetaField = allRangeValues[i][petaColIdx] || '';
          }
          break;
        }
      }
    }

    let petaFieldJson = data.peta_field_json;
    const petaFieldKosong = (petaFieldJson === undefined || petaFieldJson === null || String(petaFieldJson).trim() === '');

    if (petaFieldKosong) {
      petaFieldJson = existingPetaField;
    } else if (typeof petaFieldJson === 'object') {
      petaFieldJson = JSON.stringify(petaFieldJson);
    }

    const dataObj = {
      id_lkpd: idLkpd,
      id_pertemuan: data.id_pertemuan || '',
      id_kelas: data.id_kelas || 'ALL',
      judul_lkpd: data.judul_lkpd || '',
      tipe_lkpd: data.tipe_lkpd || 'manual',
      instruksi: data.instruksi || '',
      file_pdf_url: data.file_pdf_url || '',
      file_drive_id: data.file_drive_id || '',
      gambar_url: data.gambar_url || '',
      video_url: data.video_url || '',
      soal_json: typeof data.soal_json === 'object' ? JSON.stringify(data.soal_json) : (data.soal_json || '[]'),
      fitur_kanvas: data.fitur_kanvas ? 'TRUE' : 'FALSE',
      status: data.status || 'Publish',
      isi_teks: data.isi_teks || '',
      peta_field_json: petaFieldJson
    };

    const rowData = headers.map(header => {
      const key = String(header).trim();
      if (dataObj.hasOwnProperty(key)) {
        const val = dataObj[key];
        return (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val;
      }
      return '';
    });

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    return { success: true, message: 'LKPD interaktif berhasil disimpan!', id_lkpd: idLkpd };
  } catch (e) { 
    return { success: false, message: 'Gagal menyimpan LKPD: ' + e.toString() }; 
  }
}

function handleDeleteLkpd(data) { return deleteRowById('lkpd', data.id_lkpd); }

function handleSaveGame(data) {
  try {
    const headers = ['id_game', 'id_pertemuan', 'id_kelas', 'judul_game', 'tipe_game', 'instruksi', 'konfigurasi_json', 'status'];
    const idGame = data.id_game || ('GM_' + new Date().getTime());
    const dataObj = {
      id_game: idGame,
      id_pertemuan: data.id_pertemuan || '',
      id_kelas: data.id_kelas || 'ALL',
      judul_game: data.judul_game || '',
      tipe_game: data.tipe_game || 'matching',
      instruksi: data.instruksi || '',
      konfigurasi_json: typeof data.konfigurasi_json === 'object' ? JSON.stringify(data.konfigurasi_json) : (data.konfigurasi_json || '{}'),
      status: data.status || 'Publish'
    };
    upsertRowByObject('games', headers, 'id_game', idGame, dataObj);
    return { success: true, message: 'Game interaktif berhasil disimpan!' };
  } catch (e) { return { success: false, message: 'Gagal menyimpan game: ' + e.toString() }; }
}

function handleDeleteGame(data) { return deleteRowById('games', data.id_game); }

function handleSaveEvaluasi(data) {
  try {
    const headers = ['id_evaluasi', 'id_pertemuan', 'id_kelas', 'judul_evaluasi', 'durasi_menit', 'status'];
    const idEvaluasi = data.id_evaluasi || ('EVL_' + new Date().getTime());

    const idPertemuanInput = String(data.id_pertemuan || '').trim();
    if (idPertemuanInput) {
      const evalSheet = getSheetCaseInsensitive(getSS(), 'evaluasi');
      const duplikat = getSheetDataAsJson(evalSheet).find(e =>
        String(e.id_pertemuan || '').trim() === idPertemuanInput &&
        String(e.id_evaluasi || '').trim() !== String(idEvaluasi).trim()
      );
      if (duplikat) {
        return {
          success: false,
          message: 'Pertemuan ini sudah punya modul evaluasi "' + (duplikat.judul_evaluasi || duplikat.id_evaluasi) + '". Edit atau hapus modul tersebut terlebih dahulu.'
        };
      }
    }

    const dataObj = {
      id_evaluasi: idEvaluasi,
      id_pertemuan: data.id_pertemuan || '',
      id_kelas: data.id_kelas || 'ALL',
      judul_evaluasi: data.judul_evaluasi || '',
      durasi_menit: data.durasi_menit || 30,
      status: data.status || 'Publish'
    };
    upsertRowByObject('evaluasi', headers, 'id_evaluasi', idEvaluasi, dataObj);
    return { success: true, message: 'Modul Evaluasi berhasil disimpan!', id_evaluasi: idEvaluasi };
  } catch (e) { return { success: false, message: 'Gagal menyimpan evaluasi: ' + e.toString() }; }
}

function handleDeleteEvaluasi(data) {
  const res = deleteRowById('evaluasi', data.id_evaluasi);
  if (!res.success) return res;
  const soalTerhapus = deleteRowsByColumn('soal_evaluasi', 'id_evaluasi', data.id_evaluasi);
  return { success: true, message: 'Modul evaluasi dan ' + soalTerhapus + ' soal berhasil dihapus!', soal_terhapus: soalTerhapus };
}

function handleSaveSoalEvaluasi(data) {
  try {
    const headers = ['id_soal', 'id_evaluasi', 'pertanyaan', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'kunci_jawaban', 'pembahasan'];
    const idSoal = data.id_soal || ('SOL_' + new Date().getTime());
    const dataObj = {
      id_soal: idSoal,
      id_evaluasi: data.id_evaluasi || '',
      pertanyaan: data.pertanyaan || '',
      opsi_a: data.opsi_a || '',
      opsi_b: data.opsi_b || '',
      opsi_c: data.opsi_c || '',
      opsi_d: data.opsi_d || '',
      kunci_jawaban: String(data.kunci_jawaban || 'A').toUpperCase(),
      pembahasan: data.pembahasan || ''
    };
    upsertRowByObject('soal_evaluasi', headers, 'id_soal', idSoal, dataObj);
    return { success: true, message: 'Soal evaluasi berhasil disimpan!' };
  } catch (e) { return { success: false, message: 'Gagal menyimpan soal: ' + e.toString() }; }
}

function handleDeleteSoalEvaluasi(data) { return deleteRowById('soal_evaluasi', data.id_soal); }

function handleSubmitLkpd(data) {
  try {
    const who = identitas_(data);
    const headers = ['id_sub', 'id_pertemuan', 'id_game', 'tipe_sub', 'timestamp', 'username_siswa', 'nama_siswa', 'kelas', 'jawaban_json', 'canvas_image_base64', 'skor_otomatis', 'nilai_esai', 'catatan_guru', 'status', 'queue_id'];
    const idSub = 'SUB_LKPD_' + new Date().getTime();

    let imageUrl = '';
    if (data.canvas_image_base64) {
      imageUrl = saveCanvasImageToDrive(data.canvas_image_base64, `Kanvas_${who.username}_${idSub}.png`);
    }

    const dataObj = {
      id_sub: idSub,
      queue_id: data.queue_id || '',
      id_pertemuan: data.id_pertemuan || '',
      id_game: data.id_lkpd || '',
      tipe_sub: 'lkpd',
      timestamp: new Date().toISOString(),
      username_siswa: who.username,
      nama_siswa: who.nama,
      kelas: who.kelas,
      jawaban_json: typeof data.jawaban_json === 'object' ? JSON.stringify(data.jawaban_json) : (data.jawaban_json || '{}'),
      canvas_image_base64: imageUrl,
      skor_otomatis: 0,
      nilai_esai: '',
      catatan_guru: '',
      status: 'Belum Dinilai'
    };
    upsertRowByObject('submissions', headers, 'id_sub', idSub, dataObj);
    return { success: true, message: 'Jawaban LKPD berhasil dikirim ke guru!' };
  } catch (e) { return { success: false, message: 'Gagal mengirim LKPD: ' + e.toString() }; }
}

function handleSubmitGame(data) {
  try {
    const who = identitas_(data);
    const headers = ['id_sub', 'id_pertemuan', 'id_game', 'tipe_sub', 'timestamp', 'username_siswa', 'nama_siswa', 'kelas', 'jawaban_json', 'canvas_image_base64', 'skor_otomatis', 'nilai_esai', 'catatan_guru', 'status', 'queue_id'];
    const idSub = 'SUB_GM_' + new Date().getTime();
    const skor = Math.max(0, Math.min(100, Number(data.skor_game) || 0));
    const dataObj = {
      id_sub: idSub,
      queue_id: data.queue_id || '',
      id_pertemuan: data.id_pertemuan || '',
      id_game: data.id_game || '',
      tipe_sub: 'game',
      timestamp: new Date().toISOString(),
      username_siswa: who.username,
      nama_siswa: who.nama,
      kelas: who.kelas,
      jawaban_json: typeof data.jawaban_json === 'object' ? JSON.stringify(data.jawaban_json) : (data.jawaban_json || '{}'),
      canvas_image_base64: '',
      skor_otomatis: skor,
      nilai_esai: skor,
      catatan_guru: 'Otomatis dari Game Engine',
      status: 'Selesai Dinilai'
    };
    upsertRowByObject('submissions', headers, 'id_sub', idSub, dataObj);
    return { success: true, message: 'Skor game berhasil dicatat!' };
  } catch (e) { return { success: false, message: 'Gagal mencatat skor game: ' + e.toString() }; }
}

function handleSubmitEvaluasi(data) {
  try {
    const who = identitas_(data);
    const idEvaluasi = String(data.id_evaluasi || '').trim();

    const evalRow = readSheetCached('evaluasi').find(ev => String(ev.id_evaluasi || '').trim() === idEvaluasi);
    if (!evalRow || String(evalRow.status || '').trim() !== 'Publish') {
      return { success: false, message: 'Modul evaluasi tidak ditemukan atau belum dipublikasikan.' };
    }
    const idPertemuan = String(evalRow.id_pertemuan || '').trim();

    const sheet = getSheetCaseInsensitive(getSS(), 'submissions');
    if (sheet) {
      const existingSub = getSheetDataAsJson(sheet).find(s =>
        String(s.username_siswa || '').trim().toLowerCase() === who.username.toLowerCase() &&
        String(s.id_pertemuan || '').trim() === idPertemuan &&
        String(s.id_game || '').trim() === idEvaluasi &&
        String(s.tipe_sub || '').trim().toLowerCase() === 'evaluasi'
      );
      if (existingSub) {
        return {
          success: false,
          duplicate: true,
          message: 'Kamu sudah pernah mengerjakan dan mengirimkan jawaban evaluasi untuk pertemuan ini!'
        };
      }
    }

    const hasil = hitungSkorEvaluasi_(idEvaluasi, data.jawaban_json);
    if (!hasil.ok) return { success: false, message: 'Belum ada soal pada modul evaluasi ini.' };

    const headers = ['id_sub', 'id_pertemuan', 'id_game', 'tipe_sub', 'timestamp', 'username_siswa', 'nama_siswa', 'kelas', 'jawaban_json', 'canvas_image_base64', 'skor_otomatis', 'nilai_esai', 'catatan_guru', 'status', 'queue_id'];
    const idSub = 'SUB_EVL_' + new Date().getTime();
    const dataObj = {
      id_sub: idSub,
      queue_id: data.queue_id || '',
      id_pertemuan: idPertemuan,
      id_game: idEvaluasi,
      tipe_sub: 'evaluasi',
      timestamp: new Date().toISOString(),
      username_siswa: who.username,
      nama_siswa: who.nama,
      kelas: who.kelas,
      jawaban_json: typeof data.jawaban_json === 'object' ? JSON.stringify(data.jawaban_json) : (data.jawaban_json || '{}'),
      canvas_image_base64: '',
      skor_otomatis: hasil.skor,
      nilai_esai: hasil.skor,
      catatan_guru: 'Otomatis Kuis PG',
      status: 'Evaluasi Selesai'
    };

    upsertRowByObject('submissions', headers, 'id_sub', idSub, dataObj);
    return {
      success: true,
      message: 'Jawaban evaluasi berhasil dikirim!',
      skor_pg: hasil.skor,
      benar: hasil.benar,
      total: hasil.total
    };
  } catch (e) {
    return { success: false, message: 'Gagal mengirim evaluasi: ' + e.toString() };
  }
}

function handleGradeSubmisi(data) {
  try {
    const ss = getSS();
    const sheet = getSheetCaseInsensitive(ss, 'submissions');
    if (!sheet) return { success: false, message: 'Sheet submissions tidak ditemukan!' };

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'Data submisi kosong!' };

    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];

    const idSubIdx = headers.indexOf('id_sub');
    const nilaiEsaiIdx = headers.indexOf('nilai_esai');
    const catatanIdx = headers.indexOf('catatan_guru');
    const statusIdx = headers.indexOf('status');

    for (let i = 1; i < allData.length; i++) {
      if (String(allData[i][idSubIdx]).trim() === String(data.id_sub).trim()) {
        const nilai = Number(data.nilai_esai);
        if (isNaN(nilai) || nilai < 0 || nilai > 100) return { success: false, message: 'Nilai harus angka 0 sampai 100.' };
        if (nilaiEsaiIdx !== -1) sheet.getRange(i + 1, nilaiEsaiIdx + 1).setValue(nilai);
        if (catatanIdx !== -1) sheet.getRange(i + 1, catatanIdx + 1).setValue(data.catatan_guru || '');
        if (statusIdx !== -1) sheet.getRange(i + 1, statusIdx + 1).setValue('Selesai Dinilai');
        return { success: true, message: 'Penilaian siswa berhasil disimpan!' };
      }
    }
    return { success: false, message: 'ID Submisi tidak ditemukan!' };
  } catch (e) { return { success: false, message: 'Gagal menyimpan penilaian: ' + e.toString() }; }
}

function handleDeleteSubmisi(data) {
  if (!data.id_sub) return { success: false, message: 'id_sub tidak dikirim pada request.' };
  return deleteRowById('submissions', data.id_sub);
}

function handleSaveReview(data) {
  try {
    const who = identitas_(data);
    const headers = ['id_review', 'id_materi', 'username_siswa', 'nama_siswa', 'rating', 'komentar', 'timestamp', 'queue_id'];
    const idReview = 'REV_' + new Date().getTime();
    const rating = Math.max(1, Math.min(5, Math.round(Number(data.rating) || 5)));
    const dataObj = {
      id_review: idReview,
      queue_id: data.queue_id || '',
      id_materi: data.id_materi || '',
      username_siswa: who.username,
      nama_siswa: who.nama,
      rating: rating,
      komentar: String(data.komentar || '').slice(0, 1000),
      timestamp: new Date().toISOString()
    };
    upsertRowByObject('reviews', headers, 'id_review', idReview, dataObj);
    return { success: true, message: 'Ulasan bahan ajar berhasil dikirim!' };
  } catch (e) { return { success: false, message: 'Gagal menyimpan ulasan: ' + e.toString() }; }
}

function handleSaveFieldMapLkpd(data) {
  try {
    if (!data.id_lkpd || !data.peta_field_json) {
      return { success: false, message: 'id_lkpd dan peta_field_json wajib diisi.' };
    }

    const ss = getSS();
    const sheet = getSheetCaseInsensitive(ss, 'lkpd');
    if (!sheet) return { success: false, message: 'Sheet lkpd tidak ditemukan!' };

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: 'Belum ada data LKPD di sheet.' };

    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    let petaFieldColIdx = headers.findIndex(h => String(h).trim() === 'peta_field_json');
    if (petaFieldColIdx === -1) {
      petaFieldColIdx = headers.length;
      sheet.getRange(1, petaFieldColIdx + 1).setValue('peta_field_json');
    }

    const idColIdx = headers.findIndex(h => String(h).trim() === 'id_lkpd');
    const idColumnValues = sheet.getRange(1, idColIdx + 1, lastRow, 1).getValues();

    for (let i = 1; i < idColumnValues.length; i++) {
      if (String(idColumnValues[i][0]).trim() === String(data.id_lkpd).trim()) {
        sheet.getRange(i + 1, petaFieldColIdx + 1).setValue(data.peta_field_json);
        return { success: true, message: 'Peta isian LKPD berhasil disimpan!' };
      }
    }

    return { success: false, message: 'LKPD dengan id_lkpd tersebut tidak ditemukan.' };

  } catch (e) {
    return { success: false, message: 'Gagal menyimpan peta field: ' + e.toString() };
  }
}

function handleSubmitLkpdIsian(data) {
  try {
    const who = identitas_(data);
    const headers = ['id_sub', 'id_pertemuan', 'id_game', 'tipe_sub', 'timestamp', 'username_siswa', 'nama_siswa', 'kelas', 'jawaban_json', 'canvas_image_base64', 'skor_otomatis', 'nilai_esai', 'catatan_guru', 'status', 'queue_id'];
    const idSub = 'SUB_LKPDISI_' + new Date().getTime();

    const dataObj = {
      id_sub: idSub,
      queue_id: data.queue_id || '',
      id_pertemuan: data.id_pertemuan || '',
      id_game: data.id_lkpd || '',
      tipe_sub: 'lkpd_isian',
      timestamp: new Date().toISOString(),
      username_siswa: who.username,
      nama_siswa: who.nama,
      kelas: who.kelas,
      jawaban_json: typeof data.jawaban_json === 'object' ? JSON.stringify(data.jawaban_json) : (data.jawaban_json || '{}'),
      canvas_image_base64: '',
      skor_otomatis: 0,
      nilai_esai: '',
      catatan_guru: '',
      status: 'Belum Dinilai'
    };

    upsertRowByObject('submissions', headers, 'id_sub', idSub, dataObj);
    return { success: true, message: 'Jawaban LKPD berhasil dikirim ke guru!' };

  } catch (e) {
    return { success: false, message: 'Gagal mengirim jawaban LKPD: ' + e.toString() };
  }
}

function handleGetJawabanLkpdIsian(data) {
  try {
    if (!data.id_lkpd) return { success: false, message: 'id_lkpd wajib diisi.' };

    const auth = data.__auth;
    const staf = auth.role === 'guru' || auth.role === 'admin';
    const target = staf && data.username_siswa ? String(data.username_siswa) : auth.username;

    const sheet = getSheetCaseInsensitive(getSS(), 'submissions');
    const allSubs = getSheetDataAsJson(sheet);

    const matches = allSubs.filter(s =>
      String(s.id_game) === String(data.id_lkpd) &&
      String(s.username_siswa).trim().toLowerCase() === target.trim().toLowerCase() &&
      s.tipe_sub === 'lkpd_isian'
    );

    if (matches.length === 0) {
      return { success: true, jawaban: {} };
    }

    matches.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const latest = matches[0];

    let jawabanObj = {};
    try { jawabanObj = JSON.parse(latest.jawaban_json || '{}'); } catch (parseErr) {}

    return { success: true, jawaban: jawabanObj };

  } catch (e) {
    return { success: false, message: 'Gagal mengambil jawaban: ' + e.toString() };
  }
}

function ocrPdfFromDrive(fileId) {
  var tempDocId = null;
  try {
    var originalFile = Drive.Files.get(fileId, { supportsAllDrives: true });

    var copyMetadata = {
      name: 'OCR_TEMP_' + originalFile.name,
      mimeType: MimeType.GOOGLE_DOCS,
      parents: originalFile.parents
    };

    var copiedFile = Drive.Files.copy(copyMetadata, fileId, {
      ocrLanguage: 'id',
      supportsAllDrives: true
    });

    tempDocId = copiedFile.id;

    var doc = DocumentApp.openById(tempDocId);
    var text = doc.getBody().getText();

    return text ? text.trim() : '';

  } catch (err) {
    Logger.log('OCR Error: ' + err.message);
    throw new Error('Gagal melakukan OCR: ' + err.message);

  } finally {
    if (tempDocId) {
      try {
        DriveApp.getFileById(tempDocId).setTrashed(true);
      } catch (cleanupErr) {
        Logger.log('Gagal menghapus file OCR sementara: ' + cleanupErr.message);
      }
    }
  }
}

function handleOcrPdfDrive(params) {
  try {
    if (!params.fileId) {
      return { success: false, message: 'fileId tidak ditemukan pada request.' };
    }

    var text = ocrPdfFromDrive(params.fileId);

    if (!text) {
      return { success: false, message: 'OCR selesai tapi tidak ada teks terdeteksi (kemungkinan PDF kosong atau kualitas gambar terlalu rendah).' };
    }

    return { success: true, text: text };

  } catch (err) {
    return { success: false, message: err.message };
  }
}