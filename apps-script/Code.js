/**
 * 2026 Personal Budget — Google Apps Script (v7)
 * ================================================
 *
 * HOW TO INSTALL:
 *   1. Open your "2026 Personal Budget" Google Sheet
 *   2. Go to Extensions → Apps Script
 *   3. Delete any existing code in Code.gs
 *   4. Paste this entire file
 *   5. Click Save (Ctrl+S)
 *   6. Close the Apps Script editor tab
 *   7. Refresh the Google Sheet — a "Budget Tools" menu will appear
 *
 * HOW TO USE:
 *   1. Budget Tools → Build Workbook   (FIRST TIME ONLY — creates everything)
 *   2. Budget Tools → Initialize Budget (generates all Budget rows)
 *   3. Budget Tools → Update Script     (SAFE — refreshes formulas after code updates)
 *   4. Budget Tools → Parse Emails      (scans Gmail for Scotiabank infoalerts)
 *   5. Budget Tools → Set API Key       (sets key for mobile categorizer app)
 *   6. To add categories: add to Setup cols D:E, then run "Add Category"
 *   7. To add fixed expenses: edit Fixed Monthly Expenses directly (auto-updates)
 *
 * WEB APP API (for mobile categorizer PWA):
 *   Deploy: Apps Script → Deploy → New deployment → Web app
 *     Execute as: Me | Who has access: Anyone
 *   Endpoints:
 *     GET  ?action=parseAndFetch&apiKey=KEY      → parse emails + return pending
 *     GET  ?action=categories&apiKey=KEY          → return category list
 *     POST {action:"categorize",apiKey,timestamp,category} → categorize a transaction
 *
 * See the Instructions tab in the sheet for full details.
 */

// ================================================================
// MENU
// ================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Budget Tools')
    .addItem('1. Build Workbook (first time)', 'buildWorkbook')
    .addItem('2. Initialize Budget', 'initializeBudget')
    .addItem('3. Update Script (safe)', 'updateWorkbook')
    .addSeparator()
    .addItem('Add Category', 'addCategory')
    .addItem('Parse Emails', 'processInfoAlerts')
    .addItem('Set API Key', 'setApiKey')
    .addSeparator()
    .addItem('View Activity Log', 'showLogsTab')
    .addToUi();
}

// ================================================================
// WEB APP API
// These functions handle HTTP requests from the mobile PWA.
// Deploy as: Execute as me → Anyone
// ================================================================

/**
 * Routes an action to its handler. Pure dispatch — errors bubble to the
 * entry point's wrapper for logging.
 */
function routeAction_(action, params) {
  if (action === 'parseAndFetch')    return handleParseAndFetch_(params);
  if (action === 'categories')       return handleCategories_();
  if (action === 'categorize')       return handleCategorize_(params);
  if (action === 'uncategorize')     return handleUncategorize_(params);
  if (action === 'addCategory')      return handleAddCategory_(params);
  if (action === 'batchCategorize')  return handleBatchCategorize_(params);
  return jsonResponse_({ success: false, error: 'Unknown action: ' + action });
}

/**
 * Handles GET requests from the PWA. Wraps every request with timing + logging.
 */
function doGet(e) {
  var start = Date.now();
  var params = (e && e.parameter) || {};
  var action = params.action || 'unknown';

  try {
    if (!validateApiKey_(params.apiKey)) {
      logActivity_(action, Date.now() - start, 'auth_fail', 'method: GET', 'Invalid API key');
      return jsonResponse_({ success: false, error: 'Invalid API key' });
    }

    var response = routeAction_(action, params);
    var duration = Date.now() - start;
    var parsed = { success: true };
    try { parsed = JSON.parse(response.getContent()); } catch (parseErr) { /* leave as default */ }

    logActivity_(
      action,
      duration,
      parsed.success ? 'success' : 'fail',
      summarizeResult_(action, parsed),
      parsed.success ? '' : (parsed.error || '')
    );
    return response;
  } catch (err) {
    var duration = Date.now() - start;
    logActivity_(action, duration, 'crash', 'method: GET', err.toString() + '\n' + (err.stack || ''));
    return jsonResponse_({ success: false, error: err.toString() });
  }
}

/**
 * Handles POST requests from the PWA. Kept for backward compat (PWA uses GET).
 * Also wrapped with timing + logging.
 */
function doPost(e) {
  var start = Date.now();
  var body = {};
  var action = 'unknown';

  try {
    body = JSON.parse(e.postData.contents);
    action = body.action || 'unknown';

    if (!validateApiKey_(body.apiKey)) {
      logActivity_(action, Date.now() - start, 'auth_fail', 'method: POST', 'Invalid API key');
      return jsonResponse_({ success: false, error: 'Invalid API key' });
    }

    var response = routeAction_(action, body);
    var duration = Date.now() - start;
    var parsed = { success: true };
    try { parsed = JSON.parse(response.getContent()); } catch (parseErr) { /* leave as default */ }

    logActivity_(
      action,
      duration,
      parsed.success ? 'success' : 'fail',
      summarizeResult_(action, parsed) + ' (POST)',
      parsed.success ? '' : (parsed.error || '')
    );
    return response;
  } catch (err) {
    var duration = Date.now() - start;
    logActivity_(action, duration, 'crash', 'method: POST', err.toString() + '\n' + (err.stack || ''));
    return jsonResponse_({ success: false, error: err.toString() });
  }
}

/**
 * parseAndFetch: runs email parser, then returns pending transactions.
 * Accepts optional knownTimestamps to exclude already-loaded transactions.
 */
function handleParseAndFetch_(params) {
  // Run email parser (internal, no UI)
  var parseResult = processInfoAlerts_();

  // Read pending transactions
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pending = ss.getSheetByName('Pending');
  if (!pending || pending.getLastRow() < 2) {
    return jsonResponse_({ success: true, parsed: parseResult.parsed, transactions: [] });
  }

  // Build set of known timestamps for dedup
  var knownSet = {};
  if (params.knownTimestamps) {
    var known = params.knownTimestamps.split(',');
    for (var k = 0; k < known.length; k++) {
      knownSet[known[k].trim()] = true;
    }
  }

  // Read all pending rows and filter
  var data = pending.getRange(2, 1, pending.getLastRow() - 1, 7).getValues();
  var transactions = [];
  for (var i = 0; i < data.length; i++) {
    var rawTs = data[i][0];
    var timestamp = (rawTs instanceof Date)
      ? Utilities.formatDate(rawTs, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
      : rawTs.toString();
    var status = data[i][5];
    // Only return pending (uncategorized) rows not already known to PWA
    if (status === 'pending' && !knownSet[timestamp]) {
      transactions.push({
        timestamp: timestamp,
        date: formatDate_(data[i][1]),
        merchant: data[i][2],
        amount: data[i][3]
      });
    }
  }

  return jsonResponse_({
    success: true,
    parsed: parseResult.parsed,
    parseErrors: parseResult.errors,
    transactions: transactions
  });
}

/**
 * categories: returns the category list from Setup tab.
 */
function handleCategories_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var setup = ss.getSheetByName('Setup');
  if (!setup) {
    return jsonResponse_({ success: false, error: 'Setup tab not found' });
  }

  var catRaw = setup.getRange('D2:E100').getValues();
  var categories = [];
  for (var c = 0; c < catRaw.length; c++) {
    if (catRaw[c][0] !== '' && catRaw[c][1] !== '' && catRaw[c][0] !== 'Income') {
      categories.push({ main: catRaw[c][0], sub: catRaw[c][1] });
    }
  }

  return jsonResponse_({ success: true, categories: categories });
}

/**
 * categorize: moves a pending transaction to the Transactions tab.
 * Expects: { timestamp, category }
 */
function handleCategorize_(body) {
  var timestamp = body.timestamp;
  var category = body.category;

  if (!timestamp || !category) {
    return jsonResponse_({ success: false, error: 'Missing timestamp or category' });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse_({ success: false, error: 'Another operation in progress, try again' });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pending = ss.getSheetByName('Pending');
    var txn = ss.getSheetByName('Transactions');
    var setup = ss.getSheetByName('Setup');

    if (!pending || !txn || !setup) {
      return jsonResponse_({ success: false, error: 'Required tab not found' });
    }

    // Validate category against Setup
    var validCats = setup.getRange('E2:E100').getValues();
    var isValid = false;
    for (var c = 0; c < validCats.length; c++) {
      if (validCats[c][0] === category) { isValid = true; break; }
    }
    if (!isValid) {
      return jsonResponse_({ success: false, error: 'Invalid category: ' + category });
    }

    // Find the pending row by timestamp
    var lastRow = pending.getLastRow();
    if (lastRow < 2) {
      return jsonResponse_({ success: false, error: 'No pending transactions found' });
    }

    var data = pending.getRange(2, 1, lastRow - 1, 7).getValues();
    var foundRow = -1;
    var txnDate, txnMerchant, txnAmount;

    for (var i = 0; i < data.length; i++) {
      var rowTs = (data[i][0] instanceof Date)
        ? Utilities.formatDate(data[i][0], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
        : data[i][0].toString();
      if (rowTs === timestamp && data[i][5] === 'pending') {
        foundRow = i + 2;
        txnDate = data[i][1];
        txnMerchant = data[i][2];
        txnAmount = data[i][3];
        break;
      }
    }

    if (foundRow === -1) {
      return jsonResponse_({ success: false, error: 'Transaction not found or already categorized' });
    }

    // Write to Transactions tab
    var txnLastRow = findNextEmptyRow_(txn);
    txn.getRange(txnLastRow, 1, 1, 4).setValues([[txnDate, txnMerchant, txnAmount, category]]);
    SpreadsheetApp.flush();

    // Verify write
    var verify = txn.getRange(txnLastRow, 1, 1, 4).getValues()[0];
    if (String(verify[1]) !== String(txnMerchant)) {
      logActivity_('categorize_verify', 0, 'write_verify_fail',
        'Expected merchant "' + txnMerchant + '" at row ' + txnLastRow +
        ', got "' + verify[1] + '"', '');
      return jsonResponse_({
        success: false,
        error: 'Transaction write verification failed — Pending not updated. Check Logs tab.'
      });
    }

    // Update Pending row (batched into one setValues call)
    pending.getRange(foundRow, 6, 1, 2).setValues([['categorized', category]]);

    // Read back the auto-calculated Period from Transactions
    var period = txn.getRange(txnLastRow, 7).getDisplayValue();

    return jsonResponse_({
      success: true,
      transaction: {
        timestamp: timestamp,
        category: category,
        merchant: txnMerchant,
        amount: txnAmount,
        period: period
      }
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * uncategorize: reverses a categorization.
 * Deletes the matching row from Transactions, restores Pending row to "pending".
 * Expects: { timestamp, merchant, amount, category }
 */
function handleUncategorize_(body) {
  var timestamp = body.timestamp;
  var merchant = body.merchant;
  var amount = (typeof body.amount === 'string') ? parseFloat(body.amount) : body.amount;
  var category = body.category;

  if (!timestamp) {
    return jsonResponse_({ success: false, error: 'Missing timestamp' });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse_({ success: false, error: 'Another operation in progress, try again' });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var txn = ss.getSheetByName('Transactions');
    var pending = ss.getSheetByName('Pending');

    if (!txn || !pending) {
      return jsonResponse_({ success: false, error: 'Transactions or Pending tab not found' });
    }

    // Find and delete the matching row in Transactions (last match = most recent)
    var txnLastRow = txn.getLastRow();
    var deletedRow = -1;

    if (txnLastRow >= 2) {
      var txnData = txn.getRange(2, 1, txnLastRow - 1, 4).getValues();
      // Search from bottom up to find the most recently added match.
      // Skip rows with empty merchant (formula-only rows).
      for (var i = txnData.length - 1; i >= 0; i--) {
        var rowMerchant = txnData[i][1];
        if (rowMerchant === '' || rowMerchant === null) continue;
        var rowAmount = txnData[i][2];
        var rowCategory = txnData[i][3];

        if (rowMerchant === merchant && rowAmount === amount && rowCategory === category) {
          deletedRow = i + 2;
          break;
        }
      }

      if (deletedRow > 0) {
        txn.deleteRow(deletedRow);
      }
    }

    // Restore the Pending row regardless of whether Transactions row was found
    var pendingLastRow = pending.getLastRow();
    if (pendingLastRow >= 2) {
      var pendingData = pending.getRange(2, 1, pendingLastRow - 1, 7).getValues();
      for (var j = 0; j < pendingData.length; j++) {
        var rowTs = (pendingData[j][0] instanceof Date)
          ? Utilities.formatDate(pendingData[j][0], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
          : pendingData[j][0].toString();
        if (rowTs === timestamp) {
          var pendingRow = j + 2;
          pending.getRange(pendingRow, 6, 1, 2).setValues([['pending', '']]);
          break;
        }
      }
    }

    return jsonResponse_({
      success: true,
      transaction: {
        timestamp: timestamp,
        merchant: merchant,
        amount: amount
      }
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * addCategory: adds a new category to the Setup tab and rebuilds Budget rows.
 * Expects: { mainCategory, subCategory }
 */
function handleAddCategory_(body) {
  var mainCategory = (body.mainCategory || '').trim();
  var subCategory = (body.subCategory || '').trim();

  if (!mainCategory || !subCategory) {
    return jsonResponse_({ success: false, error: 'Main category and sub category are required' });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return jsonResponse_({ success: false, error: 'Another operation in progress, try again' });
  }

  try {
    return handleAddCategoryInner_(mainCategory, subCategory);
  } finally {
    lock.releaseLock();
  }
}

function handleAddCategoryInner_(mainCategory, subCategory) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var setup = ss.getSheetByName('Setup');

  if (!setup) {
    return jsonResponse_({ success: false, error: 'Setup tab not found' });
  }

  // Check for duplicate sub category
  var existingSubs = setup.getRange('E2:E100').getValues();
  for (var i = 0; i < existingSubs.length; i++) {
    if (existingSubs[i][0].toString().toLowerCase() === subCategory.toLowerCase()) {
      return jsonResponse_({ success: false, error: 'Category "' + subCategory + '" already exists' });
    }
  }

  // Find first empty row in D:E
  var catData = setup.getRange('D2:D100').getValues();
  var nextRow = 2;
  for (var j = 0; j < catData.length; j++) {
    if (catData[j][0] === '') {
      nextRow = j + 2;
      break;
    }
    nextRow = j + 3; // Past the last filled row
  }

  // Write the new category
  setup.getRange(nextRow, 4, 1, 2).setValues([[mainCategory, subCategory]]);

  // Rebuild Budget rows to include the new category
  var result = rebuildBudgetInternal_('add', ss);

  if (result.error) {
    return jsonResponse_({ success: false, error: result.error });
  }

  return jsonResponse_({
    success: true,
    category: { main: mainCategory, sub: subCategory },
    budgetRowsAdded: result.newCount
  });
}

/**
 * batchCategorize: processes multiple categorizations in one call.
 * Expects: { items: JSON string of [{ts, cat}, ...] }
 *
 * Guarantees:
 * - Serialized via LockService (no concurrent runs)
 * - Category validated against Setup E:E before writes
 * - Transactions written first; Pending only updated if Transactions write verifies
 * - Single setValues() for Transactions + Pending updates (batched)
 */
function handleBatchCategorize_(params) {
  if (!params.items) {
    return jsonResponse_({ success: false, error: 'Missing items parameter' });
  }

  var items;
  try {
    items = JSON.parse(params.items);
  } catch (e) {
    return jsonResponse_({ success: false, error: 'Invalid items JSON' });
  }

  if (!items.length) {
    return jsonResponse_({ success: true, results: [], summary: { total: 0, succeeded: 0, failed: 0 } });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse_({ success: false, error: 'Another operation in progress, try again' });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pending = ss.getSheetByName('Pending');
    var txn = ss.getSheetByName('Transactions');
    var setup = ss.getSheetByName('Setup');

    if (!pending || !txn || !setup) {
      return jsonResponse_({ success: false, error: 'Required tab not found (Pending/Transactions/Setup)' });
    }

    // Load valid categories once for validation
    var validCategories = {};
    var catData = setup.getRange('E2:E100').getValues();
    for (var c = 0; c < catData.length; c++) {
      if (catData[c][0]) validCategories[catData[c][0]] = true;
    }

    // Read ALL pending data once (not per-item)
    var pendingLastRow = pending.getLastRow();
    var pendingData = (pendingLastRow >= 2)
      ? pending.getRange(2, 1, pendingLastRow - 1, 7).getValues()
      : [];

    // Format all timestamps once for comparison (store at index 7)
    for (var p = 0; p < pendingData.length; p++) {
      pendingData[p][7] = (pendingData[p][0] instanceof Date)
        ? Utilities.formatDate(pendingData[p][0], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
        : pendingData[p][0].toString();
    }

    var results = [];
    var txnRows = [];         // Rows to batch-write to Transactions
    var pendingUpdates = [];  // {row, category} to update in Pending

    for (var i = 0; i < items.length; i++) {
      var timestamp = items[i].ts;
      var category = items[i].cat;

      if (!timestamp || !category) {
        results.push({ timestamp: timestamp || '', success: false, error: 'Missing timestamp or category' });
        continue;
      }

      // Validate category against Setup
      if (!validCategories[category]) {
        results.push({ timestamp: timestamp, success: false, error: 'Invalid category: ' + category });
        continue;
      }

      // Find matching pending row
      var foundIdx = -1;
      for (var j = 0; j < pendingData.length; j++) {
        if (pendingData[j][7] === timestamp && pendingData[j][5] === 'pending') {
          foundIdx = j;
          break;
        }
      }

      if (foundIdx === -1) {
        results.push({ timestamp: timestamp, success: false, error: 'Not found or already categorized' });
        continue;
      }

      // Mark as processed in local data (prevent double-matching within batch)
      pendingData[foundIdx][5] = 'categorized';

      // Queue the writes
      txnRows.push([pendingData[foundIdx][1], pendingData[foundIdx][2], pendingData[foundIdx][3], category]);
      pendingUpdates.push({ row: foundIdx + 2, category: category });
      results.push({ timestamp: timestamp, success: true });
    }

    // Write Transactions FIRST, verify, then update Pending.
    if (txnRows.length > 0) {
      var txnStartRow = findNextEmptyRow_(txn);
      txn.getRange(txnStartRow, 1, txnRows.length, 4).setValues(txnRows);
      SpreadsheetApp.flush();

      // Verify: read back the first row and confirm merchant matches
      var verify = txn.getRange(txnStartRow, 1, 1, 4).getValues()[0];
      if (String(verify[1]) !== String(txnRows[0][1]) ||
          Number(verify[2]) !== Number(txnRows[0][2])) {
        // Write did not land where we expected — do NOT update Pending
        logActivity_('batchCategorize_verify', 0, 'write_verify_fail',
          'Expected merchant "' + txnRows[0][1] + '" amount ' + txnRows[0][2] +
          ' at row ' + txnStartRow + ', got merchant "' + verify[1] + '" amount ' + verify[2], '');
        return jsonResponse_({
          success: false,
          error: 'Transaction write verification failed — Pending not updated. Check Logs tab.'
        });
      }

      // Update Pending in a single batched setValues when rows are contiguous
      pendingUpdates.sort(function(a, b) { return a.row - b.row; });
      var contiguous = true;
      for (var k = 1; k < pendingUpdates.length; k++) {
        if (pendingUpdates[k].row !== pendingUpdates[k - 1].row + 1) {
          contiguous = false;
          break;
        }
      }

      if (contiguous) {
        var updates = pendingUpdates.map(function(u) { return ['categorized', u.category]; });
        pending.getRange(pendingUpdates[0].row, 6, updates.length, 2).setValues(updates);
      } else {
        for (var u = 0; u < pendingUpdates.length; u++) {
          pending.getRange(pendingUpdates[u].row, 6, 1, 2)
            .setValues([['categorized', pendingUpdates[u].category]]);
        }
      }
    }

    return jsonResponse_({
      success: true,
      results: results,
      summary: {
        total: items.length,
        succeeded: txnRows.length,
        failed: items.length - txnRows.length
      }
    });
  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// ACTIVITY LOG
// ================================================================

/**
 * Returns the Logs tab, creating it if it doesn't exist.
 * Columns: Timestamp | Action | Duration (ms) | Status | Details | Error
 */
function getOrCreateLogsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Logs');
  if (!sheet) {
    sheet = ss.insertSheet('Logs');
    sheet.setTabColor('#9e9e9e');
    sheet.getRange(1, 1, 1, 6)
      .setValues([['Timestamp', 'Action', 'Duration (ms)', 'Status', 'Details', 'Error']])
      .setFontWeight('bold')
      .setBackground('#eeeeee');
    sheet.setColumnWidth(1, 160);  // Timestamp
    sheet.setColumnWidth(2, 140);  // Action
    sheet.setColumnWidth(3, 100);  // Duration
    sheet.setColumnWidth(4, 100);  // Status
    sheet.setColumnWidth(5, 350);  // Details
    sheet.setColumnWidth(6, 400);  // Error
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd HH:mm:ss');
  }
  return sheet;
}

/**
 * Inserts an activity log entry at row 2 (newest first). Also mirrors to
 * console.log/warn/error for Cloud Logging visibility (Apps Script → Executions).
 */
function logActivity_(action, duration, status, details, error) {
  try {
    var sheet = getOrCreateLogsSheet_();
    // Insert at row 2 so newest entries are always at the top
    sheet.insertRowBefore(2);
    sheet.getRange(2, 1, 1, 6).setValues([[
      new Date(),
      action || '',
      duration || 0,
      status || '',
      details || '',
      error || ''
    ]]);

    // Auto-rotate if Logs tab exceeds 5000 rows
    if (sheet.getLastRow() > 5001) {
      rotateLogsIfNeeded_(sheet);
    }
  } catch (logErr) {
    // Never let logging failure crash the handler
    console.error('logActivity_ failed:', logErr);
  }

  // Mirror to Cloud Logging
  var msg = '[' + action + '] ' + duration + 'ms ' + status +
    (details ? ' - ' + details : '') + (error ? ' - ERR: ' + error : '');
  if (status === 'crash' || status === 'error' || status === 'write_verify_fail') {
    console.error(msg);
  } else if (status === 'fail' || status === 'auth_fail') {
    console.warn(msg);
  } else {
    console.log(msg);
  }
}

/**
 * Archives the Logs tab to Logs_Archive_<date> and clears it (keeps header).
 */
function rotateLogsIfNeeded_(sheet) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var archiveName = 'Logs_Archive_' + Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    var archive = sheet.copyTo(ss).setName(archiveName);
    // Clear rows 2+ in the live Logs sheet
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 6).clearContent();
    }
    console.log('Logs rotated to ' + archiveName);
  } catch (rotErr) {
    console.error('rotateLogsIfNeeded_ failed:', rotErr);
  }
}

/**
 * Builds a one-line human-readable summary of an API response for the log's
 * Details column.
 */
function summarizeResult_(action, parsed) {
  if (!parsed || typeof parsed !== 'object') return '';
  try {
    if (action === 'parseAndFetch') {
      return 'parsed ' + (parsed.parsed || 0) +
        ', returned ' + ((parsed.transactions && parsed.transactions.length) || 0) + ' pending';
    }
    if (action === 'categories') {
      return 'returned ' + ((parsed.categories && parsed.categories.length) || 0) + ' categories';
    }
    if (action === 'batchCategorize') {
      var s = parsed.summary || {};
      var base = (s.succeeded || 0) + '/' + (s.total || 0) + ' succeeded';
      if (s.failed > 0 && parsed.results) {
        var failedTs = [];
        for (var i = 0; i < parsed.results.length; i++) {
          if (!parsed.results[i].success) {
            failedTs.push(parsed.results[i].timestamp + ':' + (parsed.results[i].error || ''));
          }
        }
        base += ' | failed: ' + failedTs.join('; ');
      }
      return base;
    }
    if (action === 'categorize') {
      if (parsed.transaction) {
        return parsed.transaction.merchant + ' → ' + parsed.transaction.category;
      }
      return '';
    }
    if (action === 'uncategorize') {
      if (parsed.transaction) {
        return 'restored ' + parsed.transaction.merchant;
      }
      return '';
    }
    if (action === 'addCategory') {
      if (parsed.category) {
        return parsed.category.main + ' > ' + parsed.category.sub +
          ', +' + (parsed.budgetRowsAdded || 0) + ' budget rows';
      }
      return '';
    }
  } catch (e) {
    return '';
  }
  return '';
}

/**
 * Menu function: opens the Logs tab (creates if missing).
 */
function showLogsTab() {
  var sheet = getOrCreateLogsSheet_();
  sheet.activate();
}

// ================================================================
// API HELPERS
// ================================================================

/**
 * Validates the API key against the stored Script Property.
 */
function validateApiKey_(key) {
  if (!key) return false;
  var storedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  return storedKey && key === storedKey;
}

/**
 * Returns a JSON response for the web app.
 */
function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Formats a date value to "yyyy-MM-dd" string.
 */
function formatDate_(dateVal) {
  if (!dateVal) return '';
  var d = new Date(dateVal);
  var y = d.getFullYear();
  var mo = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return y + '-' + mo + '-' + day;
}

/**
 * Finds the first empty row in a sheet (by checking column A).
 */
function findNextEmptyRow_(sheet) {
  // CRITICAL: cannot use getLastRow() alone — it counts formula-filled cells
  // (even those returning "") as content. Transactions and Pending tabs have
  // formulas pre-filled in rows 2-1000, so getLastRow() returns 1000 even when
  // empty. We scan column A (always real data, never a formula column) instead.
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 2;
  var colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = colA.length - 1; i >= 0; i--) {
    var v = colA[i][0];
    if (v !== '' && v !== null && v !== undefined) {
      return i + 3; // i is 0-indexed within rows 2..N, so data row = i+2, next = i+3
    }
  }
  return 2; // No data, start at row 2
}

/**
 * Menu function: prompts user for API key and saves to Script Properties.
 */
function setApiKey() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    'Set API Key',
    'Enter a secret API key for the mobile categorizer app.\n' +
    'This key must match the one configured in the PWA.\n\n' +
    'Use a random string (e.g., from a password generator):',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() === ui.Button.OK) {
    var key = result.getResponseText().trim();
    if (key.length < 8) {
      ui.alert('API key must be at least 8 characters long.');
      return;
    }
    PropertiesService.getScriptProperties().setProperty('API_KEY', key);
    ui.alert('API key saved!\n\nUse this same key when setting up the mobile categorizer app.');
  }
}

// ================================================================
// BUILD WORKBOOK
// Creates all tabs, populates Setup + Fixed Monthly Expenses,
// sets up formulas, named ranges, data validation, and formatting.
// ⚠️ FIRST-TIME ONLY — clears all existing data.
// ================================================================

function buildWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // Warn if any data tabs already have data
  var existingBudget = ss.getSheetByName('Budget');
  var existingTxn = ss.getSheetByName('Transactions');
  var hasData = (existingBudget && existingBudget.getLastRow() > 1) ||
                (existingTxn && existingTxn.getLastRow() > 1);
  if (hasData) {
    var resp = ui.alert(
      '⚠️ Warning — This will ERASE ALL DATA',
      'Budget and/or Transactions tabs have existing data.\n' +
      'Build Workbook will clear EVERYTHING and start fresh.\n\n' +
      'If you just updated the script code, use "Update Script" instead.\n\n' +
      'Continue with full rebuild?',
      ui.ButtonSet.YES_NO
    );
    if (resp !== ui.Button.YES) return;
  }

  // --- Create / get tabs ---
  var tabNames = ['Instructions', 'Setup', 'Fixed Monthly Expenses', 'Budget', 'Transactions', 'Pending'];
  var sheets = {};
  for (var t = 0; t < tabNames.length; t++) {
    var name = tabNames[t];
    sheets[name] = ss.getSheetByName(name) || ss.insertSheet(name);
  }

  // Remove default Sheet1
  var s1 = ss.getSheetByName('Sheet1');
  if (s1 && ss.getSheets().length > 1) ss.deleteSheet(s1);

  // Move Instructions to first position
  sheets['Instructions'].activate();
  ss.moveActiveSheet(1);

  var HDR_BG = '#d9ead3';

  // ============================================================
  // INSTRUCTIONS TAB
  // ============================================================
  buildInstructionsTab_(sheets['Instructions']);

  // ============================================================
  // SETUP TAB
  // ============================================================
  var setup = sheets['Setup'];
  setup.clear();

  var payDateArrays = [
    [2026,0,7],  [2026,0,21], [2026,1,4],  [2026,1,18],
    [2026,2,4],  [2026,2,18], [2026,3,1],  [2026,3,15],
    [2026,3,29], [2026,4,13], [2026,4,27], [2026,5,10],
    [2026,5,24], [2026,6,8],  [2026,6,22], [2026,7,5],
    [2026,7,19], [2026,8,2],  [2026,8,16], [2026,8,29],
    [2026,9,14], [2026,9,28], [2026,10,10],[2026,10,25],
    [2026,11,9], [2026,11,23]
  ];
  var payDates = [];
  for (var p = 0; p < payDateArrays.length; p++) {
    payDates.push(new Date(payDateArrays[p][0], payDateArrays[p][1], payDateArrays[p][2]));
  }

  setup.getRange('A1:E1')
    .setValues([['Period Start', 'Period End', 'Period Label', 'Main Category', 'Sub Category']])
    .setFontWeight('bold').setBackground(HDR_BG);

  var periodValues = [];
  for (var i = 0; i < 26; i++) {
    var start = (i === 0) ? new Date(2025, 11, 25) : payDates[i];
    var end;
    if (i < 25) {
      end = new Date(payDates[i + 1].getTime());
      end.setDate(end.getDate() - 1);
    } else {
      end = new Date(2027, 0, 5);
    }
    periodValues.push([start, end]);
  }
  setup.getRange(2, 1, 26, 2).setValues(periodValues).setNumberFormat('MMM d, yyyy');

  var labelFormulas = [];
  for (var r = 2; r <= 27; r++) {
    labelFormulas.push([
      '=TEXT(A' + r + ',"MMM D")&" - "&IF(MONTH(A' + r + ')=MONTH(B' + r + '),TEXT(B' + r + ',"D"),TEXT(B' + r + ',"MMM D"))'
    ]);
  }
  setup.getRange(2, 3, 26, 1).setFormulas(labelFormulas);

  var categories = [
    ['Income',      'Paycheck'],
    ['Living',      'Groceries'],
    ['Living',      'Gas'],
    ['Living',      'Parking'],
    ['Nice Things', 'House things'],
    ['Nice Things', 'Saajidah spending'],
    ['Nice Things', 'Fahyad spending'],
    ['Nice Things', 'Small trip']
  ];
  setup.getRange(2, 4, categories.length, 2).setValues(categories);
  setup.hideColumns(1, 2);

  // ============================================================
  // FIXED MONTHLY EXPENSES TAB
  // ============================================================
  var fixed = sheets['Fixed Monthly Expenses'];
  fixed.clear();

  fixed.getRange('A1:C1')
    .setValues([['Name', 'Monthly Amount', 'Due Day']])
    .setFontWeight('bold').setBackground(HDR_BG);

  var expenses = [
    ['Rent',          1550, 1],
    ['Epcor',           60, 1],
    ['Phones',          88, 1],
    ['Student Loans',  250, 1]
  ];
  fixed.getRange(2, 1, expenses.length, 3).setValues(expenses);
  fixed.getRange(2, 2, expenses.length, 1).setNumberFormat('$#,##0.00');

  // ============================================================
  // BUDGET TAB
  // ============================================================
  var budget = sheets['Budget'];
  budget.clear();

  budget.getRange('A1:F1')
    .setValues([['Period', 'Main Category', 'Category', 'Budgeted', 'Spent', 'Available']])
    .setFontWeight('bold').setBackground(HDR_BG);

  // ============================================================
  // TRANSACTIONS TAB
  // ============================================================
  var txn = sheets['Transactions'];
  txn.clear();

  txn.getRange('A1:G1')
    .setValues([['Date', 'Merchant', 'Amount', 'Category', 'Main Category', 'Transaction #', 'Period']])
    .setFontWeight('bold').setBackground(HDR_BG);

  txn.getRange('A2:A1000').setNumberFormat('MMM d, yyyy');
  txn.getRange('C2:C1000').setNumberFormat('$#,##0.00');
  setTransactionFormulas_(txn);

  var catRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(setup.getRange('E2:E100'), true)
    .setAllowInvalid(false)
    .build();
  txn.getRange('D2:D1000').setDataValidation(catRule);

  // ============================================================
  // PENDING TAB
  // ============================================================
  var pending = sheets['Pending'];
  pending.clear();

  pending.getRange('A1:G1')
    .setValues([['Timestamp', 'Date', 'Merchant', 'Amount', 'Email Subject', 'Status', 'Category']])
    .setFontWeight('bold').setBackground(HDR_BG);

  pending.getRange('A2:A1000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  pending.getRange('B2:B1000').setNumberFormat('MMM d, yyyy');
  pending.getRange('D2:D1000').setNumberFormat('$#,##0.00');
  pending.setTabColor('#ff9800');

  // ============================================================
  // NAMED RANGES (15 total)
  // ============================================================
  setNamedRanges_(ss, setup, fixed, budget, txn);

  // Auto-resize all tabs
  var allSheets = [setup, fixed, budget, txn, pending];
  for (var s = 0; s < allSheets.length; s++) {
    var cols = allSheets[s].getLastColumn();
    if (cols > 0) allSheets[s].autoResizeColumns(1, cols);
  }

  ui.alert(
    'Workbook built!\n\n' +
    '6 tabs created: Instructions, Setup, Fixed Monthly Expenses, Budget, Transactions, Pending\n' +
    '4 fixed expenses defined (add more anytime — no script needed)\n' +
    '15 named ranges defined\n\n' +
    'Next step: Run "Budget Tools → 2. Initialize Budget"'
  );
}

// ================================================================
// UPDATE WORKBOOK (safe — no data loss)
// ================================================================

function updateWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var setup = ss.getSheetByName('Setup');
  var fixed = ss.getSheetByName('Fixed Monthly Expenses');
  var budget = ss.getSheetByName('Budget');
  var txn = ss.getSheetByName('Transactions');

  if (!setup || !budget || !txn) {
    ui.alert('Error: Required tabs not found. Run "Build Workbook" first.');
    return;
  }

  // --- Create Pending tab if it doesn't exist (safe) ---
  var pending = ss.getSheetByName('Pending');
  if (!pending) {
    pending = ss.insertSheet('Pending');
    var HDR_BG = '#d9ead3';
    pending.getRange('A1:G1')
      .setValues([['Timestamp', 'Date', 'Merchant', 'Amount', 'Email Subject', 'Status', 'Category']])
      .setFontWeight('bold').setBackground(HDR_BG);
    pending.getRange('A2:A1000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    pending.getRange('B2:B1000').setNumberFormat('MMM d, yyyy');
    pending.getRange('D2:D1000').setNumberFormat('$#,##0.00');
    pending.setTabColor('#ff9800');
    pending.autoResizeColumns(1, 7);
  }

  // --- Update Instructions tab ---
  var instructions = ss.getSheetByName('Instructions') || ss.insertSheet('Instructions');
  buildInstructionsTab_(instructions);
  instructions.activate();
  ss.moveActiveSheet(1);

  // --- Update Transactions formulas (cols E and G) ---
  setTransactionFormulas_(txn);

  // --- Update data validation ---
  var catRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(setup.getRange('E2:E100'), true)
    .setAllowInvalid(false)
    .build();
  txn.getRange('D2:D1000').setDataValidation(catRule);

  // --- Update named ranges ---
  if (!fixed) fixed = ss.getSheetByName('Fixed Monthly Expenses');
  setNamedRanges_(ss, setup, fixed, budget, txn);

  // --- Update Budget formulas ---
  var lastRow = budget.getLastRow();
  if (lastRow > 1) {
    var budgetData = budget.getRange(2, 1, lastRow - 1, 4).getValues();

    for (var i = 0; i < budgetData.length; i++) {
      var row = i + 2;
      var category = budgetData[i][2];

      if (category === '_income') {
        budget.getRange(row, 2).setFormula('=""');
        budget.getRange(row, 4).setFormula(buildIncomeFormula_(row));
        budget.getRange(row, 5).setFormula(
          '=SUMIFS(Budget_Budgeted,Budget_Period,A' + row + ',Budget_Category,"<>_income")'
        );
        budget.getRange(row, 6).setFormula('=D' + row + '-E' + row);
      } else if (category !== '') {
        budget.getRange(row, 2).setFormula(
          '=IFERROR(INDEX(Setup!$D$2:$D$100,MATCH(C' + row + ',Setup!$E$2:$E$100,0)),"")'
        );
        budget.getRange(row, 5).setFormula(
          '=-SUMIFS(Transactions_Amount,Transactions_Period,A' + row + ',Transactions_Category,C' + row + ')'
        );
        budget.getRange(row, 6).setFormula(
          '=IFERROR(SUMIFS(Budget_Available,Budget_Period,INDEX(PayPeriods_Label,MATCH(A' + row + ',PayPeriods_Label,0)-1),Budget_Category,C' + row + '),0)+D' + row + '-E' + row
        );
      }
    }
  }

  ui.alert(
    'Script updated!\n\n' +
    'Formulas, named ranges, and data validation have been refreshed.\n' +
    'Pending tab verified/created.\n' +
    'Your data (transactions, budgeted amounts, pending) was NOT changed.\n' +
    'Instructions tab has been updated.'
  );
}

// ================================================================
// PARSE EMAILS
// Menu wrapper (with UI alerts) and internal function (returns data).
// ================================================================

/**
 * Menu version — shows UI alerts. Calls internal function.
 */
function processInfoAlerts() {
  var ui = SpreadsheetApp.getUi();
  var result = processInfoAlerts_();

  var report = result.parsed + ' transaction(s) parsed from ' + result.threads + ' email(s).';
  if (result.errors > 0) {
    report += '\n\n⚠️ Could not parse ' + result.errors + ' email(s):\n' + result.errorDetails.join('\n');
  }
  if (result.parsed === 0 && result.threads === 0) {
    report = 'No new infoalert emails found.\n\nAll Scotiabank alerts have already been processed.';
  }
  report += '\n\nCheck the Pending tab to see them.';
  ui.alert(report);
}

/**
 * Internal version — no UI calls. Returns result object.
 * Safe to call from doGet() web app context.
 */
function processInfoAlerts_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pending = ss.getSheetByName('Pending');

  var result = { parsed: 0, threads: 0, errors: 0, errorDetails: [] };

  if (!pending) return result;

  // --- Step 1: Search for unprocessed infoalert emails ---
  var query = 'from:infoalerts@scotiabank.com subject:"Authorization on your" -label:Budget-Processed';
  var threads = GmailApp.search(query);
  result.threads = threads.length;

  if (threads.length === 0) return result;

  // --- Step 2: Batch fetch all messages ---
  var allMessages = GmailApp.getMessagesForThreads(threads);

  // --- Step 3: Parse each message in memory ---
  var regex = /for \$([\d,]+\.\d{2}) at (.+?) on account .+? at\s+(\d{1,2}:\d{2}\s*[ap]m)/i;
  var newRows = [];

  for (var t = 0; t < allMessages.length; t++) {
    for (var m = 0; m < allMessages[t].length; m++) {
      var msg = allMessages[t][m];
      var body = msg.getBody()
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#39;/g, "'")
        .replace(/&#34;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ');
      var subject = msg.getSubject();
      var emailDate = msg.getDate();

      var match = regex.exec(body);
      if (match) {
        var amountStr = match[1].replace(/,/g, '');
        var amount = -parseFloat(amountStr);
        var merchant = match[2].trim();
        var timeStr = match[3].trim();
        var timestamp = buildTimestamp_(emailDate, timeStr);

        newRows.push([timestamp, emailDate, merchant, amount, subject, 'pending', '']);
      } else {
        result.errors++;
        result.errorDetails.push(subject + ' (' + emailDate.toDateString() + ')');
      }
    }
  }

  // --- Step 4: Batch write ---
  if (newRows.length > 0) {
    var lastRow = pending.getLastRow();
    pending.getRange(lastRow + 1, 1, newRows.length, 7).setValues(newRows);
    pending.autoResizeColumns(1, 7);
  }
  result.parsed = newRows.length;

  // --- Step 5: Batch label ---
  var label = GmailApp.getUserLabelByName('Budget/Processed');
  if (!label) {
    label = GmailApp.createLabel('Budget/Processed');
  }
  label.addToThreads(threads);

  return result;
}

// ================================================================
// SHARED HELPERS
// ================================================================

/**
 * Builds a timestamp string from an email date and a parsed time string.
 */
function buildTimestamp_(emailDate, timeStr) {
  var timeParts = timeStr.match(/(\d{1,2}):(\d{2})\s*([ap]m)/i);
  if (timeParts) {
    var hours = parseInt(timeParts[1], 10);
    var minutes = parseInt(timeParts[2], 10);
    var ampm = timeParts[3].toLowerCase();

    if (ampm === 'pm' && hours !== 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    var y = emailDate.getFullYear();
    var mo = ('0' + (emailDate.getMonth() + 1)).slice(-2);
    var d = ('0' + emailDate.getDate()).slice(-2);
    var h = ('0' + hours).slice(-2);
    var mi = ('0' + minutes).slice(-2);

    return y + '-' + mo + '-' + d + ' ' + h + ':' + mi + ':00';
  }
  return Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Sets formulas for Transactions columns E (Main Category) and G (Period).
 */
function setTransactionFormulas_(txn) {
  var txnFormulasE = [];
  var txnFormulasG = [];
  for (var tr = 2; tr <= 1000; tr++) {
    txnFormulasE.push([
      '=IF(D' + tr + '="","",IFERROR(INDEX(Setup!$D$2:$D$100,MATCH(D' + tr + ',Setup!$E$2:$E$100,0)),""))'
    ]);
    txnFormulasG.push([
      '=IF(A' + tr + '="","",IFERROR(FILTER(Setup!$C$2:$C$27,Setup!$A$2:$A$27<=A' + tr + ',Setup!$B$2:$B$27>=A' + tr + '),"Unassigned"))'
    ]);
  }
  txn.getRange(2, 5, 999, 1).setFormulas(txnFormulasE);
  txn.getRange(2, 7, 999, 1).setFormulas(txnFormulasG);
}

/**
 * Sets all 15 named ranges. Safe to call repeatedly.
 */
function setNamedRanges_(ss, setup, fixed, budget, txn) {
  var existing = ss.getNamedRanges();
  for (var n = 0; n < existing.length; n++) existing[n].remove();

  ss.setNamedRange('PayPeriods',       setup.getRange('A2:C27'));
  ss.setNamedRange('PayPeriods_Label', setup.getRange('C2:C27'));
  ss.setNamedRange('PayPeriods_Start', setup.getRange('A2:A27'));
  ss.setNamedRange('PayPeriods_End',   setup.getRange('B2:B27'));
  ss.setNamedRange('CategoryList',     setup.getRange('E2:E100'));
  ss.setNamedRange('CategoryMain',     setup.getRange('D2:D100'));

  ss.setNamedRange('FixedExpenses_Amount', fixed.getRange('B2:B50'));
  ss.setNamedRange('FixedExpenses_DueDay', fixed.getRange('C2:C50'));

  ss.setNamedRange('Budget_Period',    budget.getRange('A2:A500'));
  ss.setNamedRange('Budget_Category',  budget.getRange('C2:C500'));
  ss.setNamedRange('Budget_Budgeted',  budget.getRange('D2:D500'));
  ss.setNamedRange('Budget_Available', budget.getRange('F2:F500'));

  ss.setNamedRange('Transactions_Amount',   txn.getRange('C2:C1000'));
  ss.setNamedRange('Transactions_Category', txn.getRange('D2:D1000'));
  ss.setNamedRange('Transactions_Period',   txn.getRange('G2:G1000'));
}

// ================================================================
// INSTRUCTIONS TAB BUILDER
// ================================================================

function buildInstructionsTab_(sheet) {
  sheet.clear();
  sheet.setTabColor('#4285f4');
  sheet.setColumnWidth(1, 600);

  if (sheet.getMaxColumns() > 1) {
    sheet.hideColumns(2, sheet.getMaxColumns() - 1);
  }

  var rows = [
    ['BUDGET TOOLS — INSTRUCTIONS', 16, true, '#4285f4', '#ffffff'],
    ['', 10, false, null, null],

    ['MENU FUNCTIONS', 13, true, '#e8eaf6', '#1a237e'],
    ['', 10, false, null, null],

    ['1. Build Workbook', 11, true, '#ffcdd2', '#b71c1c'],
    ['FIRST-TIME SETUP ONLY', 10, true, '#ffcdd2', '#b71c1c'],
    ['Creates all tabs: Instructions, Setup, Fixed Monthly Expenses, Budget, Transactions, Pending', 10, false, null, null],
    ['Populates pay periods, categories, and fixed expenses', 10, false, null, null],
    ['Sets up named ranges and data validation', 10, false, null, null],
    ['CLEARS ALL EXISTING DATA — never run after you have started entering transactions', 10, true, '#ffcdd2', '#b71c1c'],
    ['', 10, false, null, null],

    ['2. Initialize Budget', 11, true, '#fff9c4', '#f57f17'],
    ['USE WITH CAUTION', 10, true, '#fff9c4', '#f57f17'],
    ['Rebuilds all Budget rows from scratch', 10, false, null, null],
    ['Preserves your Budgeted dollar amounts', 10, false, null, null],
    ['Use when you need a full Budget reset', 10, false, null, null],
    ['Clears Budget tab (but keeps Budgeted values)', 10, true, '#fff9c4', '#f57f17'],
    ['', 10, false, null, null],

    ['3. Update Script', 11, true, '#c8e6c9', '#1b5e20'],
    ['SAFE TO RUN ANYTIME', 10, true, '#c8e6c9', '#1b5e20'],
    ['Updates formulas, named ranges, and data validation only', 10, false, null, null],
    ['Does NOT delete any data', 10, false, null, null],
    ['Use after pasting updated Code.gs into the Apps Script editor', 10, false, null, null],
    ['Run this instead of Build Workbook when the script code has been updated', 10, false, null, null],
    ['', 10, false, null, null],

    ['4. Add Category', 11, true, '#c8e6c9', '#1b5e20'],
    ['SAFE TO RUN ANYTIME', 10, true, '#c8e6c9', '#1b5e20'],
    ['First: add your new category to the Setup tab (columns D and E)', 10, false, null, null],
    ['Then: run Add Category from the Budget Tools menu', 10, false, null, null],
    ['Adds new Budget rows for all 26 pay periods', 10, false, null, null],
    ['Preserves all existing data', 10, false, null, null],
    ['', 10, false, null, null],

    ['5. Parse Emails', 11, true, '#c8e6c9', '#1b5e20'],
    ['SAFE TO RUN ANYTIME', 10, true, '#c8e6c9', '#1b5e20'],
    ['Scans Gmail for new Scotiabank infoalert emails', 10, false, null, null],
    ['Parses transaction details: amount, merchant, date/time', 10, false, null, null],
    ['Adds parsed transactions to the Pending tab with status "pending"', 10, false, null, null],
    ['Labels processed emails as "Budget/Processed" in Gmail (prevents duplicates)', 10, false, null, null],
    ['Also available from the mobile categorizer app', 10, false, null, null],
    ['', 10, false, null, null],

    ['6. Set API Key', 11, true, '#c8e6c9', '#1b5e20'],
    ['REQUIRED FOR MOBILE APP', 10, true, '#c8e6c9', '#1b5e20'],
    ['Sets a secret key that the mobile categorizer app uses to authenticate', 10, false, null, null],
    ['Must match the key configured in the PWA', 10, false, null, null],
    ['', 10, false, null, null],

    ['HOW TO ADD CATEGORIES', 13, true, '#e8eaf6', '#1a237e'],
    ['1. Go to the Setup tab', 10, false, null, null],
    ['2. Add a row in columns D (Main Category) and E (Sub Category) below existing categories', 10, false, null, null],
    ['3. Go to Budget Tools → Add Category', 10, false, null, null],
    ['4. New Budget rows will appear for all 26 pay periods', 10, false, null, null],
    ['', 10, false, null, null],

    ['HOW TO ADD FIXED MONTHLY EXPENSES', 13, true, '#e8eaf6', '#1a237e'],
    ['1. Go to the Fixed Monthly Expenses tab', 10, false, null, null],
    ['2. Add a new row with: Name (col A), Monthly Amount (col B), Due Day (col C)', 10, false, null, null],
    ['3. Budget _income rows update automatically — no menu action needed', 10, false, null, null],
    ['', 10, false, null, null],

    ['HOW TO UPDATE THE SCRIPT CODE', 13, true, '#e8eaf6', '#1a237e'],
    ['1. Go to Extensions → Apps Script', 10, false, null, null],
    ['2. Delete all existing code in Code.gs', 10, false, null, null],
    ['3. Paste the new code and click Save', 10, false, null, null],
    ['4. Close the Apps Script editor and refresh the sheet', 10, false, null, null],
    ['5. Run Budget Tools → Update Script (safe — no data loss)', 10, false, null, null],
    ['6. If using the mobile app: Deploy → Manage deployments → Edit → New version → Deploy', 10, false, null, null],
    ['', 10, false, null, null],

    ['HOW TO DEPLOY THE MOBILE APP API', 13, true, '#e8eaf6', '#1a237e'],
    ['1. Run Budget Tools → Set API Key (choose a secret key)', 10, false, null, null],
    ['2. Go to Extensions → Apps Script', 10, false, null, null],
    ['3. Click Deploy → New deployment', 10, false, null, null],
    ['4. Type: Web app | Execute as: Me | Who has access: Anyone', 10, false, null, null],
    ['5. Click Deploy and copy the URL', 10, false, null, null],
    ['6. Enter the URL and API key in the mobile categorizer app', 10, false, null, null],
    ['', 10, false, null, null],

    ['DO NOT', 13, true, '#ffcdd2', '#b71c1c'],
    ['Do not run Build Workbook after initial setup — it erases all data', 10, false, '#fff3e0', '#e65100'],
    ['Do not manually edit Budget formula columns (B, E, F) — they are auto-generated', 10, false, '#fff3e0', '#e65100'],
    ['Do not delete or reorder rows in the Setup tab (periods in A:C are used by formulas)', 10, false, '#fff3e0', '#e65100'],
    ['Do not rename any tabs — the script and formulas reference them by name', 10, false, '#fff3e0', '#e65100'],
    ['Do not remove the "Budget/Processed" label from emails in Gmail — it prevents re-parsing', 10, false, '#fff3e0', '#e65100'],
    ['Do not share your API key or web app URL publicly', 10, false, '#fff3e0', '#e65100'],
  ];

  var values = [];
  for (var i = 0; i < rows.length; i++) {
    values.push([rows[i][0]]);
  }
  sheet.getRange(1, 1, rows.length, 1).setValues(values);

  for (var j = 0; j < rows.length; j++) {
    var range = sheet.getRange(j + 1, 1);
    range.setFontSize(rows[j][1]);
    if (rows[j][2]) range.setFontWeight('bold');
    if (rows[j][3]) range.setBackground(rows[j][3]);
    if (rows[j][4]) range.setFontColor(rows[j][4]);
    range.setWrap(true);
  }

  var protection = sheet.protect().setDescription('Instructions — do not edit');
  protection.setWarningOnly(true);
}

// ================================================================
// INITIALIZE BUDGET
// ================================================================

function initializeBudget() {
  rebuildBudget_('initialize');
}

function addCategory() {
  rebuildBudget_('add');
}

function buildIncomeFormula_(row) {
  var monthChecks = [];
  for (var m = 1; m <= 13; m++) {
    monthChecks.push('((DATE(2026,' + m + ',dd)>=s)*(DATE(2026,' + m + ',dd)<=e))');
  }

  return '=IFERROR(SUMIFS(Transactions_Amount,Transactions_Period,A' + row +
    ',Transactions_Category,"Paycheck"),0)' +
    '-IFERROR(LET(' +
      's,INDEX(PayPeriods_Start,MATCH(A' + row + ',PayPeriods_Label,0)),' +
      'e,INDEX(PayPeriods_End,MATCH(A' + row + ',PayPeriods_Label,0)),' +
      'amt,FixedExpenses_Amount,' +
      'dd,FixedExpenses_DueDay,' +
      'valid,(amt<>"")*(dd<>""),' +
      'SUMPRODUCT(valid*amt*(' + monthChecks.join('+') + '))' +
    '),0)';
}

function rebuildBudget_(mode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var result = rebuildBudgetInternal_(mode, ss);

  if (result.error) {
    ui.alert('Error: ' + result.error);
    return;
  }

  if (mode === 'initialize') {
    ui.alert(
      'Budget initialized!\n\n' +
      result.totalRows + ' rows created\n' +
      result.periods + ' pay periods \u00D7 ' + result.categories + ' categories\n\n' +
      'Use the slicer (column H area) to filter by pay period.'
    );
  } else {
    ui.alert(
      'Categories updated!\n\n' +
      (result.newCount > 0 ? result.newCount + ' new rows added across all periods.' : 'No new rows needed.')
    );
  }
}

/**
 * Internal budget rebuild — no UI calls, safe for web app context.
 * Returns { error, totalRows, periods, categories, newCount }
 */
function rebuildBudgetInternal_(mode, ss) {
  var setup = ss.getSheetByName('Setup');
  var budget = ss.getSheetByName('Budget');

  if (!setup || !budget) {
    return { error: 'Setup or Budget tab not found. Run "Build Workbook" first.' };
  }

  var labelsRaw = setup.getRange('C2:C27').getValues();
  var labels = [];
  for (var i = 0; i < labelsRaw.length; i++) {
    if (labelsRaw[i][0] !== '') labels.push(labelsRaw[i][0]);
  }
  if (labels.length === 0) {
    return { error: 'No period labels found in Setup. Run "Build Workbook" first.' };
  }

  var catRaw = setup.getRange('D2:E100').getValues();
  var budgetCats = [];
  for (var c = 0; c < catRaw.length; c++) {
    if (catRaw[c][0] !== '' && catRaw[c][1] !== '' && catRaw[c][0] !== 'Income') {
      budgetCats.push(catRaw[c][1]);
    }
  }
  if (budgetCats.length === 0) {
    return { error: 'No spending categories found in Setup.' };
  }

  var lastRow = budget.getLastRow();
  var budgetedMap = {};
  var existingKeys = {};

  if (lastRow > 1) {
    var existingData = budget.getRange(2, 1, lastRow - 1, 4).getValues();
    for (var e = 0; e < existingData.length; e++) {
      var period = existingData[e][0];
      var category = existingData[e][2];
      var budgeted = existingData[e][3];
      var key = period + '|' + category;
      existingKeys[key] = true;
      if (category !== '_income' && typeof budgeted === 'number') {
        budgetedMap[key] = budgeted;
      }
    }
  }

  var newCount = 0;
  for (var li = 0; li < labels.length; li++) {
    if (!existingKeys[labels[li] + '|_income']) newCount++;
    for (var ci = 0; ci < budgetCats.length; ci++) {
      if (!existingKeys[labels[li] + '|' + budgetCats[ci]]) newCount++;
    }
  }

  if (mode === 'add' && newCount === 0) {
    return { error: null, totalRows: 0, periods: labels.length, categories: budgetCats.length, newCount: 0 };
  }

  if (lastRow > 1) {
    budget.getRange(2, 1, lastRow - 1, 6).clear();
  }

  var allValues = [];
  var rowTypes = [];

  for (var pi = 0; pi < labels.length; pi++) {
    var label = labels[pi];
    allValues.push([label, '', '_income', 0, 0, 0]);
    rowTypes.push('income');

    for (var ki = 0; ki < budgetCats.length; ki++) {
      var cat = budgetCats[ki];
      var mapKey = label + '|' + cat;
      var bVal = (budgetedMap[mapKey] !== undefined) ? budgetedMap[mapKey] : 0;
      allValues.push([label, '', cat, bVal, 0, 0]);
      rowTypes.push('category');
    }
  }

  var totalRows = allValues.length;
  budget.getRange(2, 1, totalRows, 6).setValues(allValues);

  var formulasB = [];
  for (var bi = 0; bi < totalRows; bi++) {
    var bRow = bi + 2;
    if (rowTypes[bi] === 'income') {
      formulasB.push(['=""']);
    } else {
      formulasB.push([
        '=IFERROR(INDEX(Setup!$D$2:$D$100,MATCH(C' + bRow + ',Setup!$E$2:$E$100,0)),"")'
      ]);
    }
  }
  budget.getRange(2, 2, totalRows, 1).setFormulas(formulasB);

  var formulasEF = [];
  for (var ef = 0; ef < totalRows; ef++) {
    var efRow = ef + 2;
    if (rowTypes[ef] === 'income') {
      formulasEF.push([
        '=SUMIFS(Budget_Budgeted,Budget_Period,A' + efRow + ',Budget_Category,"<>_income")',
        '=D' + efRow + '-E' + efRow
      ]);
    } else {
      formulasEF.push([
        '=-SUMIFS(Transactions_Amount,Transactions_Period,A' + efRow + ',Transactions_Category,C' + efRow + ')',
        '=IFERROR(SUMIFS(Budget_Available,Budget_Period,INDEX(PayPeriods_Label,MATCH(A' + efRow + ',PayPeriods_Label,0)-1),Budget_Category,C' + efRow + '),0)+D' + efRow + '-E' + efRow
      ]);
    }
  }
  budget.getRange(2, 5, totalRows, 2).setFormulas(formulasEF);

  for (var di = 0; di < totalRows; di++) {
    if (rowTypes[di] === 'income') {
      var dRow = di + 2;
      budget.getRange(dRow, 4).setFormula(buildIncomeFormula_(dRow));
    }
  }

  budget.getRange(2, 4, totalRows, 3).setNumberFormat('$#,##0.00');
  budget.autoResizeColumns(1, 6);

  var slicers = budget.getSlicers();
  if (slicers.length === 0) {
    budget.insertSlicer(
      budget.getRange(1, 1, totalRows + 1, 6),
      1, 8
    );
  }

  return { error: null, totalRows: totalRows, periods: labels.length, categories: budgetCats.length, newCount: newCount };
}
