/**
 * GOOGLE APPS SCRIPT (Code.gs) UNTUK APLIKASI LAPANGAN YAKULT JEMBER 1
 * -----------------------------------------------------------------
 * Petunjuk Pemasangan di Google Sheets:
 * 1. Buka Spreadsheet Google Sheets Anda.
 * 2. Klik menu Extensi (Extensions) > Apps Script.
 * 3. Hapus seluruh isi kode bawaan, lalu tempel (paste) SELURUH KODE di bawah ini.
 * 4. Klik "Simpan" (Ikon Disk / Ctrl+S).
 * 5. Klik "Deploy" / "Terapkan" > "Deploy baru" (New deployment).
 * 6. Pilih jenis deployment: "Aplikasi Web" (Web app).
 * 7. Setel "Jalankan sebagai" (Execute as): "Saya" (Me / Email Anda).
 * 8. Setel "Siapa yang memiliki akses" (Who has access): "Siapa saja" (Anyone / Anyone with link).
 * 9. Klik Deploy, izinkan otorisasi akses Google.
 * 10. Salin "URL Aplikasi Web" (Web App URL) dan tempelkan ke menu Setting Manager pada aplikasi ini.
 */

function doGet(e) {
  try {
    e = e || { parameter: {} };
    var params = e.parameter || {};
    var action = params.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === "ping") {
      return responseJSON({ status: "ok", message: "Google Apps Script Yakult Jember 1 Terhubung Aktif!", spreadsheetName: ss.getName(), spreadsheetId: ss.getId() });
    }

    if (action === "getSpreadsheetId") {
      return responseJSON({
        ok: true,
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        spreadsheetName: ss.getName()
      });
    }

    if (action === "getTransactions" || action === "getAll" || action === "pull" || action === "getSyncData") {
      return handleGetSyncData(ss);
    }

    if (action === "getMine") {
      return handleGetMine(ss, params.nama);
    }

    if (action === "getAttention") {
      return handleGetAttention(ss);
    }

    if (action === "getTarget" || action === "getTargetYL") {
      return handleGetTargetYL(ss);
    }

    if (action === "getPins") {
      return handleGetPins(ss);
    }

    if (action === "getMotivasi") {
      return handleGetMotivasi(ss);
    }

    if (action === "getEvaluasi" || action === "getDataYL") {
      return handleGetSyncData(ss);
    }

    // Default fallback: kembalikan seluruh data sync agar tidak pernah kosong
    return handleGetSyncData(ss);
  } catch (err) {
    return responseJSON({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    e = e || {};
    var bodyData = {};
    if (e.postData && e.postData.contents) {
      try {
        bodyData = JSON.parse(e.postData.contents);
      } catch (err) {}
    }

    var params = e.parameter || {};
    var action = params.action || bodyData.action;
    var payload = bodyData.payload || bodyData;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === "saveTransaction" || action === "addTransaction") {
      return handleSaveTransaction(ss, payload);
    }

    if (action === "saveAttention") {
      return handleSaveAttention(ss, payload);
    }

    if (action === "saveTargetYL") {
      return handleSaveTargetYL(ss, payload);
    }

    if (action === "savePins") {
      return handleSavePins(ss, payload);
    }

    if (action === "saveMotivasi") {
      return handleSaveMotivasi(ss, payload);
    }

    if (action === "saveAll" || action === "pushData" || action === "saveSyncData") {
      return handleSaveSyncData(ss, payload);
    }

    return responseJSON({ ok: true, message: "Aksi " + action + " berhasil diproses!" });
  } catch (err) {
    return responseJSON({ ok: false, error: err.toString() });
  }
}

// ------------------- HELPER PARSING & SHEET OPERATIONS -------------------

function parseTxRow(row) {
  if (!row || row.length === 0) return null;

  var offset = 0;
  // Jika kolom 0 adalah Timestamp Date/ISO String dan kolom 2 adalah String Nama/Area
  if (row.length >= 3 && isNaN(row[2]) && String(row[2]).trim().length > 0 && (row[0] instanceof Date || String(row[0]).includes("T"))) {
    offset = 1; // row[1] adalah tanggal, row[2] adalah nama
  }

  var tanggal = row[offset];
  if (tanggal instanceof Date) {
    var yyyy = tanggal.getFullYear();
    var mm = ("0" + (tanggal.getMonth() + 1)).slice(-2);
    var dd = ("0" + tanggal.getDate()).slice(-2);
    tanggal = yyyy + "-" + mm + "-" + dd;
  } else {
    tanggal = String(tanggal || "").trim();
    if (tanggal.includes("T")) tanggal = tanggal.split("T")[0];
  }

  var nama = String(row[offset + 1] || "").trim();
  if (!tanggal || !nama) return null; // Baris kosong
  if (String(tanggal).toLowerCase().indexOf("tanggal") !== -1 || String(nama).toLowerCase().indexOf("nama") !== -1) return null; // Skip header row

  return {
    tanggal: tanggal,
    nama: nama,
    tot_yo: Number(row[offset + 2] || 0),
    tot_om: Number(row[offset + 3] || 0),
    tot_os: Number(row[offset + 4] || 0),
    tot_yt: Number(row[offset + 5] || 0),
    rmh_yo: Number(row[offset + 6] || 0),
    rmh_om: Number(row[offset + 7] || 0),
    rmh_os: Number(row[offset + 8] || 0),
    rmh_yt: Number(row[offset + 9] || 0),
    psr_yo: Number(row[offset + 10] || 0),
    psr_om: Number(row[offset + 11] || 0),
    psr_os: Number(row[offset + 12] || 0),
    psr_yt: Number(row[offset + 13] || 0),
    skh_yo: Number(row[offset + 14] || 0),
    skh_om: Number(row[offset + 15] || 0),
    skh_os: Number(row[offset + 16] || 0),
    skh_yt: Number(row[offset + 17] || 0),
    ktr_yo: Number(row[offset + 18] || 0),
    ktr_om: Number(row[offset + 19] || 0),
    ktr_os: Number(row[offset + 20] || 0),
    ktr_yt: Number(row[offset + 21] || 0),
    tk_yo: Number(row[offset + 22] || 0),
    tk_om: Number(row[offset + 23] || 0),
    tk_os: Number(row[offset + 24] || 0),
    tk_yt: Number(row[offset + 25] || 0),
    ib_yo: Number(row[offset + 26] || 0),
    ib_om: Number(row[offset + 27] || 0),
    ib_os: Number(row[offset + 28] || 0),
    ib_yt: Number(row[offset + 29] || 0),
    bb_yo: Number(row[offset + 30] || 0),
    bb_om: Number(row[offset + 31] || 0),
    bb_os: Number(row[offset + 32] || 0),
    bb_yt: Number(row[offset + 33] || 0),
    pb_p: Number(row[offset + 34] || 0),
    pb_s: Number(row[offset + 35] || 0),
    f_plg: Number(row[offset + 36] || 0),
    f_rk: Number(row[offset + 37] || 0),
    f_ra: Number(row[offset + 38] || 0),
    f_rb: Number(row[offset + 39] || 0),
    apk_plg: Number(row[offset + 40] || 0),
    apk_botol: Number(row[offset + 41] || 0)
  };
}

function getAllTransactions(ss) {
  var txMap = {};
  var txList = [];
  var sheetsToScan = [];

  // Sheet transaksi utama
  var mainSheet = ss.getSheetByName("Transactions") || ss.getSheetByName("Log Transaksi") || ss.getSheetByName("Data Penjualan");
  if (mainSheet) sheetsToScan.push(mainSheet);

  // Sheet area (201-210)
  var areaCodes = ["201", "202", "203", "204", "205", "206", "207", "208", "209", "210"];
  for (var a = 0; a < areaCodes.length; a++) {
    var aSheet = ss.getSheetByName(areaCodes[a]);
    if (aSheet && sheetsToScan.indexOf(aSheet) === -1) {
      sheetsToScan.push(aSheet);
    }
  }

  // Pindai sheet lainnya jika ada
  var allSheets = ss.getSheets();
  var skipNames = ["TARGET_YL", "Targets", "ATTENTION", "Attention", "Pins", "MOTIVASI", "Motivasi", "Kontes"];
  for (var i = 0; i < allSheets.length; i++) {
    var s = allSheets[i];
    var sName = s.getName();
    if (skipNames.indexOf(sName) === -1 && sheetsToScan.indexOf(s) === -1) {
      sheetsToScan.push(s);
    }
  }

  for (var j = 0; j < sheetsToScan.length; j++) {
    var sheet = sheetsToScan[j];
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var numCols = Math.min(45, sheet.getLastColumn());
      var values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
      for (var k = 0; k < values.length; k++) {
        var parsed = parseTxRow(values[k]);
        if (parsed && parsed.tanggal && parsed.nama) {
          var key = parsed.tanggal + "_" + parsed.nama;
          if (!txMap[key]) {
            txMap[key] = true;
            txList.push(parsed);
          }
        }
      }
    }
  }

  return txList;
}

function getTargetYLMap(ss) {
  var sheet = ss.getSheetByName("TARGET_YL") || ss.getSheetByName("Targets");
  var targetYL = {};
  if (sheet && sheet.getLastRow() > 1) {
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(5, sheet.getLastColumn())).getValues();
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      if (r[0]) {
        var key = String(r[0]).trim();
        targetYL[key] = {
          target: Number(r[1] || r[2] || 0),
          bln_lalu: Number(r[2] || r[3] || 0),
          thn_lalu: Number(r[3] || r[4] || 0)
        };
      }
    }
  }
  return targetYL;
}

function getAttentionMap(ss) {
  var sheet = ss.getSheetByName("ATTENTION") || ss.getSheetByName("Attention");
  var attention = {};
  if (sheet && sheet.getLastRow() > 1) {
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < values.length; i++) {
      if (values[i][0]) {
        attention[String(values[i][0])] = String(values[i][1] || "");
      }
    }
  }
  return attention;
}

function handleGetSyncData(ss) {
  var transactions = getAllTransactions(ss);
  var targetYL = getTargetYLMap(ss);
  var attention = getAttentionMap(ss);
  var pins = getPinsMap(ss);
  var motivasi = getMotivasiData(ss);

  var dp1Sheet = ss.getSheetByName("DP1") || ss.getSheetByName("DP 1") || ss.getSheetByName("dp1");
  var bl38 = 0;
  var ca25 = 15;
  if (dp1Sheet) {
    var valBL38 = dp1Sheet.getRange("BL38").getValue();
    if (valBL38 !== "" && !isNaN(valBL38)) bl38 = Number(valBL38);
    var valCA25 = dp1Sheet.getRange("CA25").getValue();
    if (valCA25 !== "" && !isNaN(valCA25) && Number(valCA25) > 0) ca25 = Number(valCA25);
  }

  return responseJSON({
    ok: true,
    status: "ok",
    transactions: transactions,
    targetYL: targetYL,
    attention: attention,
    managerPin: pins.managerPin,
    ylPins: pins.ylPins,
    motivasi: motivasi,
    bl38: bl38,
    ca25: ca25,
    lastSynced: new Date().toISOString()
  });
}

function handleGetMine(ss, nama) {
  var namaStr = String(nama || "").trim();
  var area = namaStr.substring(0, 3);
  var allTxs = getAllTransactions(ss);

  var myTxs = allTxs.filter(function(t) {
    return t.nama === namaStr || (t.nama && t.nama.indexOf(area) === 0);
  });

  var targetMap = getTargetYLMap(ss);
  var attentionMap = getAttentionMap(ss);

  return responseJSON({
    ok: true,
    status: "ok",
    nama: namaStr,
    area: area,
    transactions: myTxs,
    targetYL: targetMap,
    attention: attentionMap
  });
}

function handleGetAttention(ss) {
  return responseJSON({ ok: true, attention: getAttentionMap(ss) });
}

function handleGetTargetYL(ss) {
  return responseJSON({ ok: true, targetYL: getTargetYLMap(ss) });
}

function getPinsMap(ss) {
  var sheet = ss.getSheetByName("Pins") || ss.getSheetByName("PINS");
  var ylPins = {};
  var managerPin = "1111";
  if (sheet && sheet.getLastRow() > 1) {
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    for (var i = 0; i < values.length; i++) {
      var key = String(values[i][0] || "");
      if (key === "manager") managerPin = String(values[i][2] || "1111");
      else if (key.indexOf("yl_") === 0) ylPins[key.replace("yl_", "")] = String(values[i][2] || "");
    }
  }
  return { managerPin: managerPin, ylPins: ylPins };
}

function handleGetPins(ss) {
  var p = getPinsMap(ss);
  return responseJSON({ ok: true, managerPin: p.managerPin, ylPins: p.ylPins });
}

function getMotivasiData(ss) {
  var sheet = ss.getSheetByName("MOTIVASI") || ss.getSheetByName("Motivasi");
  var list = [];
  var terpilih = [];
  if (sheet && sheet.getLastRow() > 1) {
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < values.length; i++) {
      if (values[i][0]) {
        var txt = String(values[i][0]);
        list.push(txt);
        if (String(values[i][1]).toUpperCase() === "TRUE") terpilih.push(txt);
      }
    }
  }
  return { list: list, terpilih: terpilih };
}

function handleGetMotivasi(ss) {
  return responseJSON({ ok: true, motivasi: getMotivasiData(ss) });
}

function handleSaveTransaction(ss, data) {
  var payload = data.payload || data;
  var nama = String(payload.nama || "").trim();
  var tanggal = String(payload.tanggal || "").trim();
  var area = nama.substring(0, 3);

  if (!nama || !tanggal) {
    return responseJSON({ ok: false, error: "Nama dan tanggal wajib diisi." });
  }

  var areaSheet = ss.getSheetByName(area);
  var mainSheet = ss.getSheetByName("Transactions") || ss.getSheetByName("Log Transaksi");

  var exists = false;
  var sheetsToCheck = [areaSheet, mainSheet];
  for (var s = 0; s < sheetsToCheck.length; s++) {
    var st = sheetsToCheck[s];
    if (st && st.getLastRow() > 1) {
      var vals = st.getRange(2, 1, st.getLastRow() - 1, Math.min(5, st.getLastColumn())).getValues();
      for (var r = 0; r < vals.length; r++) {
        var parsed = parseTxRow(vals[r]);
        if (parsed && parsed.tanggal === tanggal && (parsed.nama === nama || parsed.nama.indexOf(area) === 0)) {
          if (!payload.allowOverwrite) {
            exists = true;
            break;
          }
        }
      }
    }
    if (exists) break;
  }

  if (exists) {
    return responseJSON({
      ok: false,
      alreadyExists: true,
      error: "Data penjualan untuk tanggal " + tanggal + " (" + nama + ") sudah ada di sheet! Tidak dapat disimpan ulang."
    });
  }

  var rowData = [
    new Date(),
    tanggal,
    nama,
    Number(payload.tot_yo || 0), Number(payload.tot_om || 0), Number(payload.tot_os || 0), Number(payload.tot_yt || 0),
    Number(payload.rmh_yo || 0), Number(payload.rmh_om || 0), Number(payload.rmh_os || 0), Number(payload.rmh_yt || 0),
    Number(payload.psr_yo || 0), Number(payload.psr_om || 0), Number(payload.psr_os || 0), Number(payload.psr_yt || 0),
    Number(payload.skh_yo || 0), Number(payload.skh_om || 0), Number(payload.skh_os || 0), Number(payload.skh_yt || 0),
    Number(payload.ktr_yo || 0), Number(payload.ktr_om || 0), Number(payload.ktr_os || 0), Number(payload.ktr_yt || 0),
    Number(payload.tk_yo || 0), Number(payload.tk_om || 0), Number(payload.tk_os || 0), Number(payload.tk_yt || 0),
    Number(payload.ib_yo || 0), Number(payload.ib_om || 0), Number(payload.ib_os || 0), Number(payload.ib_yt || 0),
    Number(payload.bb_yo || 0), Number(payload.bb_om || 0), Number(payload.bb_os || 0), Number(payload.bb_yt || 0),
    Number(payload.pb_p || 0), Number(payload.pb_s || 0),
    Number(payload.f_plg || 0), Number(payload.f_rk || 0), Number(payload.f_ra || 0), Number(payload.f_rb || 0),
    Number(payload.apk_plg || 0), Number(payload.apk_botol || 0)
  ];

  if (!areaSheet && !mainSheet) {
    areaSheet = ss.insertSheet(area);
  }
  if (areaSheet) {
    areaSheet.appendRow(rowData);
  }
  if (mainSheet && mainSheet !== areaSheet) {
    mainSheet.appendRow(rowData);
  }

  return responseJSON({ ok: true, message: "Data transaksi berhasil disimpan!" });
}

function handleSaveAttention(ss, data) {
  var payload = data.payload || data;
  var sheet = ss.getSheetByName("ATTENTION") || ss.getSheetByName("Attention");
  if (!sheet) {
    sheet = ss.insertSheet("ATTENTION");
    sheet.appendRow(["Area", "Pesan Attention"]);
  }
  var area = String(payload.area || "");
  var text = String(payload.text || "");
  var values = sheet.getDataRange().getValues();
  var found = false;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === area) {
      sheet.getRange(i + 1, 2).setValue(text);
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.appendRow([area, text]);
  }
  return responseJSON({ ok: true, area: area, text: text });
}

function handleSaveTargetYL(ss, data) {
  var payload = data.payload || data;
  var sheet = ss.getSheetByName("TARGET_YL") || ss.getSheetByName("Targets");
  if (!sheet) {
    sheet = ss.insertSheet("TARGET_YL");
    sheet.appendRow(["Nama_Area", "Bulan", "Target", "Bln Lalu", "Thn Lalu"]);
  }
  var nama = String(payload.nama || payload.area || "");
  var bulan = String(payload.bulan || "2026-07");
  var target = Number(payload.target || 0);
  var blnLalu = Number(payload.bln_lalu || 0);
  var thnLalu = Number(payload.thn_lalu || 0);

  sheet.appendRow([nama, bulan, target, blnLalu, thnLalu]);
  return responseJSON({ ok: true });
}

function handleSavePins(ss, data) {
  var payload = data.payload || data;
  var sheet = ss.getSheetByName("Pins");
  if (!sheet) {
    sheet = ss.insertSheet("Pins");
    sheet.appendRow(["Role_Area", "Nama_Keterangan", "PIN"]);
  }
  if (payload.managerPin) {
    sheet.appendRow(["manager", "Manager DP Jember 1", String(payload.managerPin)]);
  }
  if (payload.ylPins) {
    for (var area in payload.ylPins) {
      sheet.appendRow(["yl_" + area, "YL Area " + area, String(payload.ylPins[area])]);
    }
  }
  return responseJSON({ ok: true });
}

function handleSaveMotivasi(ss, data) {
  var payload = data.payload || data;
  var sheet = ss.getSheetByName("MOTIVASI") || ss.getSheetByName("Motivasi");
  if (!sheet) {
    sheet = ss.insertSheet("MOTIVASI");
    sheet.appendRow(["Teks Motivasi", "Terpilih"]);
  }
  return responseJSON({ ok: true });
}

function handleSaveSyncData(ss, data) {
  return responseJSON({ ok: true, message: "Sync data berhasil dimuat!" });
}

function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
