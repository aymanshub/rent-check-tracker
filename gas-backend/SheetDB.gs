/**
 * SheetDB.gs — Treats a Google Sheet tab as a database table.
 * Row 1 = headers. Data starts at row 2. Column A = primary key (id).
 */

function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    // Auto-create sheet with headers
    sheet = ss.insertSheet(name);
    var headers = CONFIG.HEADERS[name.toUpperCase()];
    if (headers) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    }
  }
  return sheet;
}

function readAll(sheetName) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // only headers or empty
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      var val = row[i];
      // Convert Date objects back to YYYY-MM-DD strings
      // (Google Sheets auto-converts date strings to Date objects)
      if (val instanceof Date) {
        var y = val.getFullYear();
        var m = String(val.getMonth() + 1).padStart(2, "0");
        var d = String(val.getDate()).padStart(2, "0");
        val = y + "-" + m + "-" + d;
      }
      obj[h] = val;
    });
    return obj;
  });
}

function findById(sheetName, id) {
  var all = readAll(sheetName);
  return all.find(function(row) { return row.id === id; }) || null;
}

function findByField(sheetName, field, value) {
  var all = readAll(sheetName);
  return all.filter(function(row) { return row[field] === value; });
}

function appendRow(sheetName, record) {
  var sheet = getSheet(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) {
    return record[h] !== undefined ? record[h] : "";
  });
  sheet.appendRow(row);
}

function bulkAppend(sheetName, records) {
  if (records.length === 0) return;
  var sheet = getSheet(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rows = records.map(function(record) {
    return headers.map(function(h) {
      return record[h] !== undefined ? record[h] : "";
    });
  });
  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
}

function updateById(sheetName, id, updates) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf("id");

  for (var r = 1; r < data.length; r++) {
    if (data[r][idCol] === id) {
      Object.keys(updates).forEach(function(key) {
        var col = headers.indexOf(key);
        if (col >= 0) {
          sheet.getRange(r + 1, col + 1).setValue(updates[key]);
        }
      });
      return true;
    }
  }
  return false;
}

function deleteById(sheetName, id) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  var idCol = 0; // Column A is always id

  // Delete from bottom to top to preserve row indices
  for (var r = data.length - 1; r >= 1; r--) {
    if (data[r][idCol] === id) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  return false;
}

function deleteByField(sheetName, field, value) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var col = headers.indexOf(field);

  // Delete from bottom to top
  for (var r = data.length - 1; r >= 1; r--) {
    if (data[r][col] === value) {
      sheet.deleteRow(r + 1);
    }
  }
}
