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
// VERSION (auto-updated by deploy.sh — do not edit by hand except VERSION)
// ================================================================
var APP_SCRIPT_VERSION = 'v11.6';
var APP_SCRIPT_LAST_EDITED = '2026-04-19 19:16 MDT';

// B9: budget year constant. Used by buildFixedExpensesFormula_ to compute
// month-by-month checks. PayPeriods data (lines ~1559-1566) is also
// year-specific but kept hardcoded — annual rollover requires updating
// BOTH this constant AND the PayPeriods array.
var BUDGET_YEAR = 2026;
var LATEST_VERSION_URL = 'https://raw.githubusercontent.com/fahyad/gsheetbudget2026-categorizerApp/main/apps-script/VERSION.txt';

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
    .addItem('Refresh Version Info', 'refreshVersionInfo')
    .addToUi();

  // Auto-refresh version info on open. Fire-and-forget — don't block menu.
  try { refreshVersionInfo(); } catch (e) { /* fail silently */ }
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
  if (action === 'dumpSheet')        return handleDumpSheet_(params);
  if (action === 'version')          return handleVersion_(params);
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
 * parseAndFetch (v11.0 single-ledger): runs email parser, then returns
 * uncategorized transactions from the Transactions tab (where Category is
 * empty AND Timestamp is set). PWA contract is unchanged.
 */
function handleParseAndFetch_(params) {
  // Run email parser (internal, no UI) — writes new emails to Transactions tab
  var parseResult = processInfoAlerts_();

  // Read uncategorized transactions from Transactions
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var txn = ss.getSheetByName('Transactions');
  if (!txn || txn.getLastRow() < 2) {
    return jsonResponse_({ success: true, parsed: parseResult.parsed, transactions: [] });
  }

  // Build set of known timestamps for dedup (legacy PWA support)
  var knownSet = {};
  if (params.knownTimestamps) {
    var known = params.knownTimestamps.split(',');
    for (var k = 0; k < known.length; k++) {
      knownSet[known[k].trim()] = true;
    }
  }

  // Read cols A-D + H (Date, Merchant, Amount, Category, Timestamp)
  // Could read 8 cols, but we only need A-D and H
  var lastRow = txn.getLastRow();
  var data = txn.getRange(2, 1, lastRow - 1, 8).getValues();
  var transactions = [];
  for (var i = 0; i < data.length; i++) {
    var date = data[i][0];           // A
    var merchant = data[i][1];       // B
    var amount = data[i][2];         // C
    var category = data[i][3];       // D
    var rawTs = data[i][7];          // H

    // Skip rows that are categorized OR have no Timestamp (manual entries)
    if (category && category !== '') continue;
    if (!rawTs) continue;
    if (!merchant) continue;  // safety: skip rows where merchant somehow missing

    var timestamp = (rawTs instanceof Date)
      ? Utilities.formatDate(rawTs, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
      : rawTs.toString();

    if (knownSet[timestamp]) continue;

    transactions.push({
      timestamp: timestamp,
      date: formatDate_(date),
      merchant: merchant,
      amount: amount
    });
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
 * categorize (v11.0 single-ledger): updates the Category cell of an existing
 * Transactions row matched by Timestamp.
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
    var txn = ss.getSheetByName('Transactions');
    var setup = ss.getSheetByName('Setup');

    if (!txn || !setup) {
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

    // Find Transactions row by Timestamp where Category is currently empty
    var lastRow = txn.getLastRow();
    if (lastRow < 2) {
      return jsonResponse_({ success: false, error: 'No transactions found' });
    }

    // Read Category (col D) and Timestamp (col H) for all rows
    var range = txn.getRange(2, 4, lastRow - 1, 5).getValues();  // D..H
    var foundRow = -1;
    var txnMerchant, txnAmount, txnDate;

    for (var i = 0; i < range.length; i++) {
      var existingCat = range[i][0];     // col D
      var ts = range[i][4];               // col H
      var rowTs = (ts instanceof Date)
        ? Utilities.formatDate(ts, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
        : (ts ? ts.toString() : '');

      if (rowTs === timestamp && (!existingCat || existingCat === '')) {
        foundRow = i + 2;
        // Read merchant + date for response
        var rowFull = txn.getRange(foundRow, 1, 1, 3).getValues()[0];
        txnDate = rowFull[0];
        txnMerchant = rowFull[1];
        txnAmount = rowFull[2];
        break;
      }
    }

    if (foundRow === -1) {
      return jsonResponse_({ success: false, error: 'Transaction not found or already categorized' });
    }

    // Update Category cell
    txn.getRange(foundRow, 4).setValue(category);
    SpreadsheetApp.flush();

    // Verify
    var actual = txn.getRange(foundRow, 4).getValue();
    if (String(actual) !== String(category)) {
      logActivity_('categorize_verify', 0, 'write_verify_fail',
        'Expected category "' + category + '" at row ' + foundRow + ', got "' + actual + '"', '');
      return jsonResponse_({
        success: false,
        error: 'Categorize verification failed. Check Logs tab.'
      });
    }

    var period = txn.getRange(foundRow, 7).getDisplayValue();

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
 * uncategorize (v11.0 single-ledger): clears the Category cell of an existing
 * Transactions row matched by Timestamp.
 * Expects: { timestamp } (merchant/amount/category fields ignored — kept for
 * backward compat with PWA's API contract)
 */
function handleUncategorize_(body) {
  var timestamp = body.timestamp;

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

    if (!txn) {
      return jsonResponse_({ success: false, error: 'Transactions tab not found' });
    }

    var lastRow = txn.getLastRow();
    // A8: empty sheet means the row genuinely doesn't exist — that's a
    // failure, not a success. Previously this returned success: true and
    // the PWA would silently delete the item from its local syncQueue.
    if (lastRow < 2) {
      return jsonResponse_({
        success: false,
        error: 'No transactions exist; nothing to uncategorize for ' + timestamp
      });
    }

    // Find row by Timestamp (search from bottom — likely most recent)
    var range = txn.getRange(2, 8, lastRow - 1, 1).getValues();  // col H = Timestamp
    var foundRow = -1;
    for (var i = range.length - 1; i >= 0; i--) {
      var ts = range[i][0];
      var rowTs = (ts instanceof Date)
        ? Utilities.formatDate(ts, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
        : (ts ? ts.toString() : '');
      if (rowTs === timestamp) {
        foundRow = i + 2;
        break;
      }
    }

    // A8: if no matching row was found, fail loudly. The PWA was previously
    // treating no-match as success, removing the item from syncQueue and
    // hiding the failure from the user.
    if (foundRow < 0) {
      return jsonResponse_({
        success: false,
        error: 'Row not found for timestamp: ' + timestamp
      });
    }

    txn.getRange(foundRow, 4).setValue('');  // Clear Category

    return jsonResponse_({
      success: true,
      transaction: { timestamp: timestamp }
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

  // A5: find first empty row in D:E. Previous logic would let nextRow advance
  // to 101 if all 99 slots were full, then silently write outside the named
  // range (CategoryMain = D2:D100). New behavior: detect "no empty slot" and
  // return a clean capacity error.
  var catData = setup.getRange('D2:D100').getValues();
  var nextRow = -1;
  for (var j = 0; j < catData.length; j++) {
    var v = catData[j][0];
    if (v === '' || v === null || v === undefined) {
      nextRow = j + 2;
      break;
    }
  }

  if (nextRow === -1) {
    return jsonResponse_({
      success: false,
      error: 'Categories tab full (D2:D100 has 99 entries). Cannot add more without expanding the named range.'
    });
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
 * batchCategorize (v11.0 single-ledger): updates the Category cell of existing
 * Transactions rows matched by Timestamp. No copy/move — the Pending tab is gone.
 *
 * Expects: { items: JSON string of [{ts, cat}, ...] }
 *
 * Guarantees:
 * - Serialized via LockService (no concurrent runs)
 * - Category validated against Setup E:E before writes
 * - Per-row verification after update — rollback (clear Category) if any verify fails
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
    var txn = ss.getSheetByName('Transactions');
    var setup = ss.getSheetByName('Setup');

    if (!txn || !setup) {
      return jsonResponse_({ success: false, error: 'Required tab not found (Transactions/Setup)' });
    }

    // Load valid categories once for validation
    var validCategories = {};
    var catData = setup.getRange('E2:E100').getValues();
    for (var c = 0; c < catData.length; c++) {
      if (catData[c][0]) validCategories[catData[c][0]] = true;
    }

    // Read all Transactions Timestamps + Category once. We scan to find rows
    // matching each item's timestamp where Category is currently empty.
    var txnLastRow = txn.getLastRow();
    var txnData = (txnLastRow >= 2)
      ? txn.getRange(2, 4, txnLastRow - 1, 5).getValues()  // cols D..H = Category, MainCat, Tx#, Period, Timestamp
      : [];

    // Normalize Timestamps to strings for comparison
    for (var p = 0; p < txnData.length; p++) {
      var ts = txnData[p][4];  // col H = index 4 in our slice (D=0, E=1, F=2, G=3, H=4)
      txnData[p][5] = (ts instanceof Date)
        ? Utilities.formatDate(ts, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
        : (ts ? ts.toString() : '');
    }

    var results = [];
    var updates = [];  // {row, category} — rows where we'll write the Category

    for (var i = 0; i < items.length; i++) {
      var timestamp = items[i].ts;
      var category = items[i].cat;

      if (!timestamp || !category) {
        results.push({ timestamp: timestamp || '', success: false, error: 'Missing timestamp or category' });
        continue;
      }

      if (!validCategories[category]) {
        results.push({ timestamp: timestamp, success: false, error: 'Invalid category: ' + category });
        continue;
      }

      // Find matching Transactions row by Timestamp where Category is empty
      var foundIdx = -1;
      for (var j = 0; j < txnData.length; j++) {
        var existingCat = txnData[j][0];  // col D
        var rowTs = txnData[j][5];         // normalized timestamp
        if (rowTs === timestamp && (!existingCat || existingCat === '')) {
          foundIdx = j;
          break;
        }
      }

      if (foundIdx === -1) {
        results.push({ timestamp: timestamp, success: false, error: 'Not found or already categorized' });
        continue;
      }

      // Mark in local data to prevent double-matching within this batch
      txnData[foundIdx][0] = category;

      var sheetRow = foundIdx + 2;
      updates.push({ row: sheetRow, category: category, timestamp: timestamp });
      results.push({ timestamp: timestamp, success: true });
    }

    // Apply updates to col D of each row, then verify.
    // Writes are individual (rows are non-contiguous in the typical batch).
    // Verify is batched into ONE read covering min..max row — was previously
    // N getValue calls, which on a 30-item batch was ~30x more sheet I/O than
    // necessary. (A2)
    if (updates.length > 0) {
      for (var u = 0; u < updates.length; u++) {
        txn.getRange(updates[u].row, 4).setValue(updates[u].category);
      }
      SpreadsheetApp.flush();

      // A2: compute min/max row, do one bulk read of col D over that range.
      var minRow = updates[0].row;
      var maxRow = updates[0].row;
      for (var b = 1; b < updates.length; b++) {
        if (updates[b].row < minRow) minRow = updates[b].row;
        if (updates[b].row > maxRow) maxRow = updates[b].row;
      }
      var verifySpan = txn.getRange(minRow, 4, maxRow - minRow + 1, 1).getValues();

      var rollback = [];
      for (var v = 0; v < updates.length; v++) {
        var actual = verifySpan[updates[v].row - minRow][0];
        if (String(actual) !== String(updates[v].category)) {
          rollback.push(updates[v]);
        }
      }

      if (rollback.length > 0) {
        // Roll back ALL updates from this batch (atomicity).
        // Individual writes here too — rare path, optimization not worth it.
        for (var r = 0; r < updates.length; r++) {
          txn.getRange(updates[r].row, 4).setValue('');
        }
        logActivity_('batchCategorize_verify', 0, 'write_verify_fail',
          rollback.length + '/' + updates.length + ' verifications failed — rolled back batch', '');
        return jsonResponse_({
          success: false,
          error: 'Verification failed for ' + rollback.length + ' rows — entire batch rolled back. Check Logs tab.'
        });
      }
    }

    return jsonResponse_({
      success: true,
      results: results,
      summary: {
        total: items.length,
        succeeded: updates.length,
        failed: items.length - updates.length
      }
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * dumpSheet: read-only inspection of any tab/range in the spreadsheet.
 * Used by Claude to inspect sheet state without OAuth/Sheets-API access.
 * Gated by API key (same as other endpoints). Caps response at 10000 cells.
 *
 * Params:
 *   tab            - sheet name (e.g. "Budget"). Required unless metadata=true.
 *   range          - A1 notation (e.g. "A1:F50"). Optional. Defaults to whole used range.
 *   includeFormulas - "true" to return formulas; otherwise returns evaluated values.
 *   metadata       - "true" to return list of all tabs + dimensions (no tab/range needed).
 */
function handleDumpSheet_(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Metadata mode: list all tabs + dimensions
  if (params.metadata === 'true' || params.metadata === '1') {
    var sheetList = ss.getSheets().map(function(s) {
      var color = null;
      try {
        var co = s.getTabColorObject();
        if (co) color = co.asRgbColor().asHexString();
      } catch (e) { /* tab has no color or unsupported color type */ }
      return {
        name: s.getName(),
        rows: s.getLastRow(),
        cols: s.getLastColumn(),
        maxRows: s.getMaxRows(),
        maxCols: s.getMaxColumns(),
        hidden: s.isSheetHidden(),
        tabColor: color
      };
    });
    return jsonResponse_({
      success: true,
      spreadsheetName: ss.getName(),
      sheets: sheetList
    });
  }

  if (!params.tab) {
    return jsonResponse_({ success: false, error: 'Missing tab parameter (or use metadata=true)' });
  }

  var sheet = ss.getSheetByName(params.tab);
  if (!sheet) {
    return jsonResponse_({ success: false, error: 'Tab not found: ' + params.tab });
  }

  // Resolve range
  var range;
  try {
    if (params.range) {
      range = sheet.getRange(params.range);
    } else {
      // Default: data range (only cells with content)
      var lastRow = Math.max(sheet.getLastRow(), 1);
      var lastCol = Math.max(sheet.getLastColumn(), 1);
      range = sheet.getRange(1, 1, lastRow, lastCol);
    }
  } catch (e) {
    return jsonResponse_({ success: false, error: 'Invalid range: ' + e.toString() });
  }

  var numRows = range.getNumRows();
  var numCols = range.getNumColumns();
  var totalCells = numRows * numCols;
  if (totalCells > 10000) {
    return jsonResponse_({
      success: false,
      error: 'Range too large (' + totalCells + ' cells, max 10000). Narrow with ?range=A1:Z100'
    });
  }

  var data;
  if (params.includeFormulas === 'true' || params.includeFormulas === '1') {
    // Mix: formulas where present, values otherwise
    var formulas = range.getFormulas();
    var values = range.getValues();
    data = formulas.map(function(row, r) {
      return row.map(function(f, c) {
        return f ? f : values[r][c];
      });
    });
  } else {
    // displayValues = formatted strings (dates as "Apr 14, 2026", currency as "$50.00")
    data = range.getDisplayValues();
  }

  return jsonResponse_({
    success: true,
    tab: params.tab,
    range: range.getA1Notation(),
    rows: numRows,
    cols: numCols,
    values: data
  });
}

// ================================================================
// VERSION INFO
// ================================================================

/**
 * Fetches the latest version info from VERSION.txt on GitHub. Cached for 1 hour
 * in Script Properties to avoid hammering GitHub on every onOpen.
 *
 * Returns: { latestVersion, latestLastEdited, fetchedAt, error? }
 */
function getLatestVersionInfo_() {
  var props = PropertiesService.getScriptProperties();
  var cachedRaw = props.getProperty('LATEST_VERSION_CACHE');
  var now = new Date().getTime();

  if (cachedRaw) {
    try {
      var cached = JSON.parse(cachedRaw);
      // Cache TTL: 1 hour
      if (cached.fetchedAtMs && (now - cached.fetchedAtMs < 3600000)) {
        return cached;
      }
    } catch (e) { /* corrupt cache — fall through to refresh */ }
  }

  var info;
  try {
    var resp = UrlFetchApp.fetch(LATEST_VERSION_URL, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      throw new Error('HTTP ' + resp.getResponseCode());
    }
    var lines = resp.getContentText().trim().split('\n');
    info = {
      latestVersion: (lines[0] || '').trim(),
      latestLastEdited: (lines[1] || '').trim(),
      fetchedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm zzz'),
      fetchedAtMs: now
    };
  } catch (err) {
    // Network failure: fall back to cached value (may be > 1 hr old) or empty
    if (cachedRaw) {
      try {
        info = JSON.parse(cachedRaw);
        info.error = 'fetch failed: ' + err.toString() + ' (using cached)';
        return info;
      } catch (e) { /* fall through */ }
    }
    info = {
      latestVersion: '?',
      latestLastEdited: '?',
      fetchedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm zzz'),
      fetchedAtMs: now,
      error: 'fetch failed: ' + err.toString()
    };
    // Don't cache failures — try again next time
    return info;
  }

  props.setProperty('LATEST_VERSION_CACHE', JSON.stringify(info));
  return info;
}

/**
 * Writes the version block to rows 1-6 of the Instructions tab.
 * Layout:
 *   Row 1: APPS SCRIPT VERSION (header bar)
 *   Row 2: Version: vX.Y
 *   Row 3: Last edited: ...
 *   Row 4: Update needed: Yes/No (with color)
 *   Row 5: Last checked: ...
 *   Row 6: blank spacer
 */
function writeVersionBlock_(sheet) {
  var latest = getLatestVersionInfo_();
  var updateNeeded = latest.latestVersion && latest.latestVersion !== '?' &&
                     latest.latestVersion !== APP_SCRIPT_VERSION;

  var updateText;
  if (latest.error) {
    updateText = 'Update needed: ? (could not check — ' + latest.error + ')';
  } else if (updateNeeded) {
    updateText = 'Update needed: YES — latest is ' + latest.latestVersion +
                 ' (this sheet has ' + APP_SCRIPT_VERSION + ')';
  } else {
    updateText = 'Update needed: No (latest is ' + latest.latestVersion + ')';
  }

  var rows = [
    ['APPS SCRIPT VERSION'],
    ['Version: ' + APP_SCRIPT_VERSION],
    ['Last edited: ' + APP_SCRIPT_LAST_EDITED],
    [updateText],
    ['Last checked: ' + (latest.fetchedAt || '?')],
    ['']
  ];

  sheet.getRange(1, 1, 6, 1).setValues(rows);

  // Formatting
  // Row 1: header bar
  sheet.getRange(1, 1).setFontSize(14).setFontWeight('bold')
    .setBackground('#1a237e').setFontColor('#ffffff').setHorizontalAlignment('center');
  // Rows 2-3: regular
  sheet.getRange(2, 1, 2, 1).setFontSize(11).setFontWeight('normal')
    .setBackground(null).setFontColor('#333333');
  // Row 4: colored by update status
  var updateBg = updateNeeded ? '#ffcdd2' : '#c8e6c9';
  var updateFg = updateNeeded ? '#b71c1c' : '#1b5e20';
  if (latest.error) { updateBg = '#fff9c4'; updateFg = '#827717'; }
  sheet.getRange(4, 1).setFontSize(11).setFontWeight('bold')
    .setBackground(updateBg).setFontColor(updateFg);
  // Row 5: last checked (small italic)
  sheet.getRange(5, 1).setFontSize(9).setFontStyle('italic')
    .setBackground(null).setFontColor('#666666');
  // Row 6: clear formatting
  sheet.getRange(6, 1).setBackground(null).setFontColor('#000000')
    .setFontWeight('normal').setFontStyle('normal').setFontSize(11);
}

/**
 * One-time setup: run this from the Apps Script editor to grant the
 * UrlFetchApp permission. We deliberately call UrlFetchApp.fetch with NO
 * try/catch so that if permission is missing, Google shows the auth dialog.
 * Once you grant the permission, refreshVersionInfo + the version endpoint
 * will work properly.
 *
 * After running, check Execution log → should show "OK — fetched VERSION.txt".
 */
function requestPermissions() {
  // This call will trigger the auth dialog if scope is not granted.
  var resp = UrlFetchApp.fetch(LATEST_VERSION_URL);
  var content = resp.getContentText();
  Logger.log('OK — fetched VERSION.txt (' + content.length + ' bytes):\n' + content);
  // Clear the cache so subsequent fetches re-pull the real value
  PropertiesService.getScriptProperties().deleteProperty('LATEST_VERSION_CACHE');
  return content;
}

/**
 * Menu function: refreshes the version block on the Instructions tab.
 * Forces a fresh GitHub fetch (clears the 1-hour cache first).
 */
function refreshVersionInfo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Instructions');
  if (!sheet) return; // no instructions tab — fail silently
  // Force fresh fetch
  PropertiesService.getScriptProperties().deleteProperty('LATEST_VERSION_CACHE');
  writeVersionBlock_(sheet);
}

/**
 * version: API endpoint that returns version info for the PWA to display.
 */
function handleVersion_(params) {
  var latest = getLatestVersionInfo_();
  var updateNeeded = latest.latestVersion && latest.latestVersion !== '?' &&
                     latest.latestVersion !== APP_SCRIPT_VERSION;

  return jsonResponse_({
    success: true,
    appsScript: {
      version: APP_SCRIPT_VERSION,
      lastEdited: APP_SCRIPT_LAST_EDITED,
      latestVersion: latest.latestVersion,
      latestLastEdited: latest.latestLastEdited,
      updateNeeded: !!updateNeeded,
      lastChecked: latest.fetchedAt,
      error: latest.error || null
    }
  });
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
    if (action === 'dumpSheet') {
      if (parsed.sheets) {
        return 'metadata: ' + parsed.sheets.length + ' tabs';
      }
      return (parsed.tab || '') + ' ' + (parsed.range || '') +
        ' (' + (parsed.rows || 0) + 'x' + (parsed.cols || 0) + ')';
    }
    if (action === 'version') {
      if (!parsed.appsScript) return '';
      var v = parsed.appsScript;
      return v.version + ' (latest: ' + v.latestVersion + ', update: ' +
        (v.updateNeeded ? 'YES' : 'no') + ')';
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
// V11.0 MIGRATION — Pending tab → Transactions tab (one-time)
// ================================================================

/**
 * Migrates all data from the Pending tab into the Transactions tab using the
 * v11.0 single-ledger model. Then deletes the Pending tab.
 *
 * Logic:
 *   - "pending" rows in Pending → write to Transactions with empty Category + Timestamp
 *   - "categorized" rows in Pending → search Transactions for matching row by
 *     Date+Merchant+Amount; if found (e.g. orphan rows at 1001-1008), update
 *     in place with Timestamp + Category. If not found, write new row.
 *   - After migration, scan Transactions rows 1001+ for any leftover orphans
 *     and move them to first empty rows in 2-1000.
 *   - Backup Pending data to a Pending_Archive tab, then delete Pending.
 *
 * Safe to run multiple times — second run will find no Pending tab and do nothing.
 */
/**
 * Consolidates Transactions data by compacting all non-empty rows into the
 * top of the sheet (starting at row 2). Useful as a "rescue" if data ends
 * up scattered (e.g., from a migration bug, or the orphan-row class of bug).
 *
 * Preserves: formulas in cols E (Main Cat) and G (Period) — those auto-fill
 * from cols D and A respectively.
 *
 * Read/Write columns A (Date), B (Merchant), C (Amount), D (Category),
 * F (Tx#), and H (Timestamp) — skips E and G.
 *
 * ⚠️ DESTRUCTIVE RESCUE FUNCTION — DO NOT RUN WITHOUT A BACKUP.
 * This rewrites every data row in-place. The "Rescue" suffix is to deter
 * accidental triggering: NOT exposed via the Budget Tools menu. Run only
 * from the Apps Script editor → function dropdown when explicitly fixing
 * orphan rows.
 *
 * One-shot fix originally written for the v10 → v11 orphan-row cleanup
 * (rows at 1001-1008 outside named ranges). Kept around in case the same
 * class of bug ever recurs.
 */
function consolidateTransactionsRescue() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var txn = ss.getSheetByName('Transactions');
  if (!txn) { ui.alert('Transactions tab not found'); return; }

  var lastRow = txn.getLastRow();
  if (lastRow < 2) { ui.alert('Nothing to consolidate'); return; }

  // Read all data cols for rows 2..lastRow (we'll use B = Merchant as "non-empty" marker)
  var data = txn.getRange(2, 1, lastRow - 1, 8).getValues();

  // Filter rows where Merchant has data (skips truly empty rows that just have formulas)
  var nonEmpty = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][1] && String(data[i][1]).trim() !== '') {
      nonEmpty.push(data[i]);
    }
  }

  if (nonEmpty.length === 0) {
    ui.alert('No data rows found.');
    return;
  }

  var confirm = ui.alert(
    'Consolidate Transactions',
    'Found ' + nonEmpty.length + ' rows with data.\n' +
    'This will move them all to rows 2-' + (1 + nonEmpty.length) + '.\n' +
    '(Cols E, G are formulas — they\'ll auto-recompute.)\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // Clear data cols (A:D, F, H) — leave E and G alone (formulas)
  if (lastRow > 1) {
    var rowCount = lastRow - 1;
    txn.getRange(2, 1, rowCount, 4).clearContent();    // A:D
    txn.getRange(2, 6, rowCount, 1).clearContent();    // F
    txn.getRange(2, 8, rowCount, 1).clearContent();    // H
  }
  SpreadsheetApp.flush();

  // Write data back starting at row 2 (cols A:D, F, H separately)
  var rowsAD = nonEmpty.map(function(r) { return [r[0], r[1], r[2], r[3]]; });
  var rowsF  = nonEmpty.map(function(r) { return [r[5]]; });
  var rowsH  = nonEmpty.map(function(r) { return [r[7]]; });
  txn.getRange(2, 1, nonEmpty.length, 4).setValues(rowsAD);
  txn.getRange(2, 6, nonEmpty.length, 1).setValues(rowsF);
  txn.getRange(2, 8, nonEmpty.length, 1).setValues(rowsH);
  SpreadsheetApp.flush();

  logActivity_('consolidateTransactionsRescue', 0, 'success',
    'Consolidated ' + nonEmpty.length + ' rows', '');

  ui.alert('Consolidation complete.\n\n' + nonEmpty.length + ' rows now at rows 2-' + (1 + nonEmpty.length) + '.');
}

function migratePendingToTransactions() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pending = ss.getSheetByName('Pending');
  var txn = ss.getSheetByName('Transactions');

  if (!txn) {
    ui.alert('Error: Transactions tab not found. Run Build Workbook first.');
    return;
  }

  if (!pending) {
    ui.alert('No Pending tab found — migration already complete (or nothing to migrate).');
    return;
  }

  // Confirm with user
  var confirm = ui.alert(
    'Migrate Pending → Transactions',
    'This will:\n' +
    '  1. Move all Pending rows into Transactions\n' +
    '  2. Move orphan rows from row 1001+ back into the visible range\n' +
    '  3. Backup Pending to a Pending_Archive_<timestamp> tab\n' +
    '  4. DELETE the Pending tab\n\n' +
    'This is a one-way operation. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // Ensure Transactions has H column header (Timestamp)
  if (txn.getRange('H1').getValue() !== 'Timestamp') {
    txn.getRange('H1').setValue('Timestamp')
      .setFontWeight('bold').setBackground('#d9ead3');
    txn.getRange('H2:H1000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  }

  var stats = { pendingMigrated: 0, categorizedMerged: 0, categorizedNew: 0,
                orphansMoved: 0, errors: 0 };

  // --- Step 1: Read all Pending data ---
  var pendingLastRow = pending.getLastRow();
  if (pendingLastRow < 2) {
    ui.alert('Pending tab has no data — nothing to migrate. Will still delete the tab.');
  }

  var pendingData = (pendingLastRow >= 2)
    ? pending.getRange(2, 1, pendingLastRow - 1, 7).getValues()
    : [];

  // --- Step 2: Read all Transactions data for matching ---
  var txnLastRow = txn.getLastRow();
  // Read cols A:D for matching (Date, Merchant, Amount, Category)
  var txnData = (txnLastRow >= 2)
    ? txn.getRange(2, 1, txnLastRow - 1, 4).getValues()
    : [];

  // --- Step 3: Process each Pending row ---
  // Collect updates separately for: in-place merge, new pending rows, new categorized rows
  var inPlaceUpdates = [];   // { sheetRow, timestamp, category }
  var newPendingRows = [];   // [date, merchant, amount, '', '', '', '', timestamp]
  var newCategorizedRows = []; // same shape with category set

  for (var i = 0; i < pendingData.length; i++) {
    var pTimestamp = pendingData[i][0];
    var pDate = pendingData[i][1];
    var pMerchant = pendingData[i][2];
    var pAmount = pendingData[i][3];
    var pStatus = pendingData[i][5];
    var pCategory = pendingData[i][6];

    if (!pMerchant || !pDate) continue; // skip blank rows

    var tsStr = (pTimestamp instanceof Date)
      ? Utilities.formatDate(pTimestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
      : (pTimestamp ? pTimestamp.toString() : '');

    if (pStatus === 'pending' || pStatus === '') {
      // Uncategorized — append to Transactions with empty Category
      newPendingRows.push({
        date: pDate, merchant: pMerchant, amount: pAmount,
        category: '', timestamp: tsStr
      });
      stats.pendingMigrated++;
    } else if (pStatus === 'categorized') {
      // Search Transactions for matching row by Date+Merchant+Amount
      var matchedRow = -1;
      for (var j = 0; j < txnData.length; j++) {
        var tDate = txnData[j][0];
        var tMerchant = txnData[j][1];
        var tAmount = txnData[j][2];
        if (!tMerchant) continue;
        // Match dates by string conversion (avoids tz issues)
        var dateMatch = (tDate instanceof Date && pDate instanceof Date)
          ? (Utilities.formatDate(tDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') ===
             Utilities.formatDate(pDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'))
          : (String(tDate) === String(pDate));
        if (dateMatch && String(tMerchant) === String(pMerchant) &&
            Number(tAmount) === Number(pAmount)) {
          matchedRow = j + 2;  // sheet row
          break;
        }
      }

      if (matchedRow > 0) {
        // Update in place: set Timestamp at H, ensure Category at D
        inPlaceUpdates.push({ sheetRow: matchedRow, timestamp: tsStr, category: pCategory });
        stats.categorizedMerged++;
      } else {
        // Categorized in Pending but not found in Transactions — append as new
        newCategorizedRows.push({
          date: pDate, merchant: pMerchant, amount: pAmount,
          category: pCategory, timestamp: tsStr
        });
        stats.categorizedNew++;
      }
    }
  }

  // --- Step 4: Apply in-place updates ---
  for (var u = 0; u < inPlaceUpdates.length; u++) {
    var upd = inPlaceUpdates[u];
    txn.getRange(upd.sheetRow, 4).setValue(upd.category);
    txn.getRange(upd.sheetRow, 8).setValue(upd.timestamp);
  }

  // --- Step 5: Append new rows (cols A:D + H, skip E/F/G to preserve formulas) ---
  function appendNewRows(rows) {
    if (!rows.length) return;
    var startRow = findNextEmptyRow_(txn);
    var rowsAD = rows.map(function(r) { return [r.date, r.merchant, r.amount, r.category]; });
    var rowsH = rows.map(function(r) { return [r.timestamp]; });
    txn.getRange(startRow, 1, rows.length, 4).setValues(rowsAD);
    txn.getRange(startRow, 8, rows.length, 1).setValues(rowsH);
  }
  appendNewRows(newPendingRows);
  appendNewRows(newCategorizedRows);
  SpreadsheetApp.flush();

  // --- Step 6: Clean up orphan rows at 1001+ ---
  // Re-read Transactions to find any rows past 1000 with data
  var newLastRow = txn.getLastRow();
  if (newLastRow > 1000) {
    var orphanRange = txn.getRange(1001, 1, newLastRow - 1000, 8).getValues();
    var orphansToMove = [];
    var orphanSheetRows = [];
    for (var o = 0; o < orphanRange.length; o++) {
      var oMerchant = orphanRange[o][1];
      if (oMerchant && oMerchant !== '') {
        orphansToMove.push({
          date: orphanRange[o][0],
          merchant: orphanRange[o][1],
          amount: orphanRange[o][2],
          category: orphanRange[o][3],
          timestamp: orphanRange[o][7] || ''
        });
        orphanSheetRows.push(1001 + o);
      }
    }
    if (orphansToMove.length > 0) {
      // Append to first empty rows in 2-1000
      appendNewRows(orphansToMove);
      // Clear the orphan rows (cols A-H, leave formulas in E and G to recompute as empty)
      for (var or = 0; or < orphanSheetRows.length; or++) {
        var sr = orphanSheetRows[or];
        txn.getRange(sr, 1, 1, 4).clearContent();  // A:D (Date, Merchant, Amount, Category)
        txn.getRange(sr, 8).clearContent();         // H (Timestamp)
        // F (Tx#) is rarely set; leave it
      }
      stats.orphansMoved = orphansToMove.length;
    }
  }
  SpreadsheetApp.flush();

  // --- Step 7: Archive Pending tab ---
  var archiveName = 'Pending_Archive_' + Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var archive = pending.copyTo(ss).setName(archiveName);

  // --- Step 8: Delete Pending tab ---
  ss.deleteSheet(pending);

  // --- Step 9: Refresh named ranges (Transactions_Timestamp etc.) ---
  var setup = ss.getSheetByName('Setup');
  var fixed = ss.getSheetByName('Fixed Monthly Expenses');
  var budget = ss.getSheetByName('Budget');
  if (setup && fixed && budget) {
    setNamedRanges_(ss, setup, fixed, budget, txn);
  }

  // --- Step 10: Log + summary alert ---
  var summary = 'Migration complete:\n' +
    '  • Pending → Transactions: ' + stats.pendingMigrated + ' uncategorized rows\n' +
    '  • Categorized merged with existing Transactions rows: ' + stats.categorizedMerged + '\n' +
    '  • Categorized appended as new rows: ' + stats.categorizedNew + '\n' +
    '  • Orphan rows (row 1001+) moved into visible range: ' + stats.orphansMoved + '\n\n' +
    'Pending tab archived as: ' + archiveName + '\n' +
    'Pending tab deleted.';
  logActivity_('migratePendingToTransactions', 0, 'success', JSON.stringify(stats), '');
  ui.alert(summary);
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
 * Trims whitespace from all Setup category cells (D2:E100). Returns count of
 * cells changed. Catches edge cases where Sheets-direct edits or pre-trim API
 * writes leave whitespace that breaks INDEX/MATCH lookups.
 */
function cleanupSetupWhitespace_(ss) {
  var setup = ss.getSheetByName('Setup');
  if (!setup) return 0;
  var range = setup.getRange('D2:E100');
  var values = range.getValues();
  var changed = 0;
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < 2; c++) {
      var v = values[r][c];
      if (typeof v === 'string') {
        var trimmed = v.trim();
        if (trimmed !== v) {
          values[r][c] = trimmed;
          changed++;
        }
      }
    }
  }
  if (changed > 0) range.setValues(values);
  return changed;
}

/**
 * Finds the first empty row in a sheet (by checking column A).
 */
function findNextEmptyRow_(sheet, maxRow) {
  // CRITICAL: cannot use getLastRow() alone — it counts formula-filled cells
  // (even those returning "") as content. The Transactions tab has formulas
  // pre-filled in rows 2-1000 (cols E, G), so getLastRow() returns 1000 even
  // when empty. We scan column A (always real data, never a formula column).
  //
  // B1: throw if the next available row would land past the named-range
  // ceiling. Previously it would silently return 1001+, which produced
  // orphan rows invisible to all formulas using Transactions_* named ranges.
  // Default ceiling matches our existing named ranges (row 1000).
  if (typeof maxRow === 'undefined') maxRow = 1000;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 2;
  var colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = colA.length - 1; i >= 0; i--) {
    var v = colA[i][0];
    if (v !== '' && v !== null && v !== undefined) {
      var nextRow = i + 3; // i is 0-indexed within rows 2..N, so data row = i+2, next = i+3
      if (nextRow > maxRow + 1) {
        throw new Error(
          'findNextEmptyRow_: sheet "' + sheet.getName() + '" has data past row ' + maxRow +
          '; refusing to write at row ' + nextRow + ' (named ranges only cover rows 2-' + maxRow +
          '). Compact existing rows or extend the named ranges before retrying.'
        );
      }
      return nextRow;
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
  // (Pending tab removed in v11.0 — single-ledger architecture; Transactions
  // is now the source of truth, with empty Category = "needs categorization".)
  var tabNames = ['Instructions', 'Setup', 'Fixed Monthly Expenses', 'Budget', 'Transactions'];
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
  // Header at row 7 (rows 1-6 are reserved for the dashboard, populated by
  // buildBudgetDashboard_ which is called from rebuildBudgetInternal_).
  var budget = sheets['Budget'];
  budget.clear();

  budget.getRange('A7:F7')
    .setValues([['Period', 'Main Category', 'Category', 'Budgeted', 'Spent', 'Available']])
    .setFontWeight('bold').setBackground(HDR_BG);

  // ============================================================
  // TRANSACTIONS TAB
  // ============================================================
  var txn = sheets['Transactions'];
  txn.clear();

  // 8 columns now — added Timestamp at H in v11.0 for PWA dedup matching.
  // Empty Category (col D) = "needs categorization" (replaces old Pending tab).
  txn.getRange('A1:H1')
    .setValues([['Date', 'Merchant', 'Amount', 'Category', 'Main Category', 'Transaction #', 'Period', 'Timestamp']])
    .setFontWeight('bold').setBackground(HDR_BG);

  txn.getRange('A2:A1000').setNumberFormat('MMM d, yyyy');
  txn.getRange('C2:C1000').setNumberFormat('$#,##0.00');
  txn.getRange('H2:H1000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  setTransactionFormulas_(txn);

  // A7: setAllowInvalid(false) — strict. Same policy as updateWorkbook now.
  // Empty cells are allowed regardless of this flag (data validation never
  // rejects empty), so the previous "allow empty" comment was misleading.
  var catRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(setup.getRange('E2:E100'), true)
    .setAllowInvalid(false)
    .build();
  txn.getRange('D2:D1000').setDataValidation(catRule);

  // (Pending tab removed in v11.0 — single-ledger architecture)

  // ============================================================
  // NAMED RANGES (16 total — added Transactions_Timestamp in v11.0)
  // ============================================================
  setNamedRanges_(ss, setup, fixed, budget, txn);

  // Auto-resize all tabs
  var allSheets = [setup, fixed, budget, txn];
  for (var s = 0; s < allSheets.length; s++) {
    var cols = allSheets[s].getLastColumn();
    if (cols > 0) allSheets[s].autoResizeColumns(1, cols);
  }

  ui.alert(
    'Workbook built!\n\n' +
    '5 tabs created: Instructions, Setup, Fixed Monthly Expenses, Budget, Transactions\n' +
    'Logs tab will be created on first API call.\n' +
    '4 fixed expenses defined (add more anytime — no script needed)\n' +
    '16 named ranges defined\n\n' +
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

  // --- Trim whitespace in Setup categories (catches Sheets-direct edits) ---
  var trimmedCount = cleanupSetupWhitespace_(ss);
  if (trimmedCount > 0) {
    console.log('cleanupSetupWhitespace_: trimmed ' + trimmedCount + ' Setup category cell(s)');
  }

  // (v11.0: Pending tab is no longer created or maintained. Use
  // "Migrate from Pending (one-time)" menu item to migrate existing data.)

  // --- Add Timestamp column (H) to Transactions if missing (v11.0 migration) ---
  var txnH1 = txn.getRange('H1').getValue();
  if (txnH1 !== 'Timestamp') {
    txn.getRange('H1').setValue('Timestamp')
      .setFontWeight('bold').setBackground('#d9ead3');
    txn.getRange('H2:H1000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
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

  // --- Refresh Budget tab dashboard (rows 1-6) and header (row 7) ---
  // (rewriting these defensively in case a previous bad updateWorkbook
  // clobbered them with stale formulas)
  buildBudgetDashboard_(budget);
  budget.getRange(7, 1, 1, 6)
    .setValues([['Period', 'Main Category', 'Category', 'Budgeted', 'Spent', 'Available']])
    .setFontWeight('bold').setBackground('#d9ead3');
  // Clear any stray formulas in row 7 cols B/E/F (left over from the v11.0/11.1 bug)
  budget.getRange(7, 2).clearContent();
  budget.getRange(7, 5).clearContent();
  budget.getRange(7, 6).clearContent();
  budget.getRange(7, 1, 1, 6)
    .setValues([['Period', 'Main Category', 'Category', 'Budgeted', 'Spent', 'Available']]);

  // --- Update Budget category formulas ---
  // Only refresh rows where col A is a valid PayPeriods_Label (i.e., a real
  // data row). This skips the dashboard rows (1-6 with labels like "Net
  // Income" in A3) and the header row (7 with "Period" in A7).
  // Pre-load PayPeriods_Label into a Set for O(1) membership check.
  var validPeriods = {};
  var labelData = setup.getRange('C2:C27').getValues();
  for (var p = 0; p < labelData.length; p++) {
    if (labelData[p][0]) validPeriods[labelData[p][0]] = true;
  }

  var lastRow = budget.getLastRow();
  if (lastRow > 1) {
    var budgetData = budget.getRange(2, 1, lastRow - 1, 4).getValues();

    for (var i = 0; i < budgetData.length; i++) {
      var row = i + 2;
      var period = budgetData[i][0];
      var category = budgetData[i][2];

      // Skip if A is not a valid period label (dashboard rows, header row, blanks)
      if (!period || !validPeriods[period]) continue;
      // Skip _income rows (legacy — should be removed via Initialize Budget) and blanks
      if (!category || category === '_income') continue;

      budget.getRange(row, 2).setFormula(
        '=IFERROR(INDEX(Setup!$D$2:$D$100,MATCH(C' + row + ',Setup!$E$2:$E$100,0)),"")'
      );
      budget.getRange(row, 5).setFormula(
        '=-SUMIFS(Transactions_Amount,Transactions_Period,A' + row + ',Transactions_Category,C' + row + ')'
      );
      // Available formula: see buildAvailableFormula_ helper (v10.4 wrap fix).
      budget.getRange(row, 6).setFormula(buildAvailableFormula_(row));
    }
  }

  ui.alert(
    'Script updated!\n\n' +
    'Formulas, named ranges, and data validation have been refreshed.\n' +
    'Transactions tab Timestamp column verified/added.\n' +
    'Budget dashboard refreshed.\n' +
    'Your data (transactions, budgeted amounts) was NOT changed.\n' +
    'Instructions tab has been updated.\n\n' +
    'NOTE: If your Budget tab still shows old _income rows, run\n' +
    '"Initialize Budget" to fully migrate to the new layout.'
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
  report += '\n\nCheck the Transactions tab — newly-parsed rows have an empty Category column (PWA will pick them up).';
  ui.alert(report);
}

/**
 * Internal version — no UI calls. Returns result object.
 * Safe to call from doGet() web app context.
 */
function processInfoAlerts_() {
  // v11.3 (S4): Wrap body in LockService so this trigger can't race with
  // user-initiated writes (handleBatchCategorize_, handleCategorize_, etc.).
  // Without this, two writers can both call findNextEmptyRow_ and pick the
  // same row, silently clobbering one another.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    // Another writer holds the lock. Skip this run; emails are still
    // unlabeled, so the next trigger will pick them up. Logged so we can
    // detect contention if it ever becomes frequent.
    logActivity_('processInfoAlerts', 0, 'lock_timeout',
      'lock unavailable after 20s; skipping run, emails retry on next trigger', '');
    return { parsed: 0, threads: 0, errors: 0, errorDetails: [], skipped: true };
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var txn = ss.getSheetByName('Transactions');

    var result = { parsed: 0, threads: 0, errors: 0, errorDetails: [] };

    if (!txn) return result;

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

    // v11.3 (S3): Track timestamps assigned in this batch so we can guarantee
    // uniqueness even if two emails share the exact same merchant+amount+second.
    var batchKeys = {};

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
          var baseTimestamp = buildTimestamp_(emailDate, timeStr);

          // v11.3 (S3): Append a 4-char hash of merchant+amount, plus a
          // collision counter, so two charges in the same second are always
          // distinguishable. Old rows without a suffix still match correctly
          // (string equality) — backward compatible.
          var timestamp = baseTimestamp + uniqueSuffix_(baseTimestamp, merchant, amount, batchKeys);

          // v11.0 single-ledger: data-only fields. Cols E (Main Cat) and G (Period)
          // are pre-existing formulas that auto-fill from D and A respectively —
          // writing them here would clobber the formulas. We write A,B,C,D + H only.
          newRows.push({
            date: emailDate, merchant: merchant, amount: amount,
            category: '', timestamp: timestamp
          });
        } else {
          result.errors++;
          result.errorDetails.push(subject + ' (' + emailDate.toDateString() + ')');
        }
      }
    }

    // --- Step 4: Batch write to Transactions tab ---
    // Write cols A:D and col H separately to avoid clobbering formulas in E and G.
    if (newRows.length > 0) {
      var startRow = findNextEmptyRow_(txn);
      var rowsAD = newRows.map(function(r) { return [r.date, r.merchant, r.amount, r.category]; });
      var rowsH = newRows.map(function(r) { return [r.timestamp]; });
      txn.getRange(startRow, 1, newRows.length, 4).setValues(rowsAD);
      txn.getRange(startRow, 8, newRows.length, 1).setValues(rowsH);
      SpreadsheetApp.flush();
    }
    result.parsed = newRows.length;

    // --- Step 5: Batch label emails as processed ---
    var label = GmailApp.getUserLabelByName('Budget/Processed');
    if (!label) {
      label = GmailApp.createLabel('Budget/Processed');
    }
    label.addToThreads(threads);

    return result;
  } finally {
    lock.releaseLock();
  }
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
 * v11.3 (S3): Returns a 4-char hex hash of an input string.
 * Non-cryptographic — used only for distinguishing transactions with the
 * same timestamp.
 */
function shortHash_(input) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, input);
  var hex = '';
  for (var i = 0; i < 2; i++) {
    var b = bytes[i] & 0xff;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

/**
 * v11.3 (S3): Returns a unique suffix to append to a timestamp so that
 * two charges arriving in the same second don't collide in PWA storage
 * or batchCategorize matching.
 *
 * Format: '#<hex>' for the first occurrence, '#<hex>-<n>' if the same
 * (timestamp, merchant, amount) triple repeats inside the same batch.
 *
 * batchKeys: object the caller passes in once per processInfoAlerts_ run;
 * we mutate it to track collisions.
 */
function uniqueSuffix_(timestamp, merchant, amount, batchKeys) {
  var hex = shortHash_(merchant + '|' + amount);
  var key = timestamp + '#' + hex;
  if (!batchKeys[key]) {
    batchKeys[key] = 1;
    return '#' + hex;
  }
  batchKeys[key]++;
  return '#' + hex + '-' + batchKeys[key];
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
  // B3: only remove ranges we own — previously this wiped EVERY named range
  // including any user-defined ones. Owned-prefix list mirrors the names
  // we re-create below. Match by exact name OR known prefix (e.g.
  // "PayPeriods_Label" matches the "PayPeriods" entry).
  var ownedPrefixes = [
    'PayPeriods', 'CategoryList', 'CategoryMain',
    'FixedExpenses_', 'Budget_', 'Transactions_'
  ];
  var existing = ss.getNamedRanges();
  for (var n = 0; n < existing.length; n++) {
    var nm = existing[n].getName();
    var owned = false;
    for (var p = 0; p < ownedPrefixes.length; p++) {
      if (nm === ownedPrefixes[p] || nm.indexOf(ownedPrefixes[p]) === 0) {
        owned = true;
        break;
      }
    }
    if (owned) existing[n].remove();
  }

  ss.setNamedRange('PayPeriods',       setup.getRange('A2:C27'));
  ss.setNamedRange('PayPeriods_Label', setup.getRange('C2:C27'));
  ss.setNamedRange('PayPeriods_Start', setup.getRange('A2:A27'));
  ss.setNamedRange('PayPeriods_End',   setup.getRange('B2:B27'));
  ss.setNamedRange('CategoryList',     setup.getRange('E2:E100'));
  ss.setNamedRange('CategoryMain',     setup.getRange('D2:D100'));

  ss.setNamedRange('FixedExpenses_Amount', fixed.getRange('B2:B50'));
  ss.setNamedRange('FixedExpenses_DueDay', fixed.getRange('C2:C50'));

  // Budget_* ranges start at row 8 — rows 1-6 are dashboard, row 7 is header.
  ss.setNamedRange('Budget_Period',    budget.getRange('A8:A500'));
  ss.setNamedRange('Budget_Category',  budget.getRange('C8:C500'));
  ss.setNamedRange('Budget_Budgeted',  budget.getRange('D8:D500'));
  ss.setNamedRange('Budget_Available', budget.getRange('F8:F500'));

  ss.setNamedRange('Transactions_Amount',    txn.getRange('C2:C1000'));
  ss.setNamedRange('Transactions_Category',  txn.getRange('D2:D1000'));
  ss.setNamedRange('Transactions_Period',    txn.getRange('G2:G1000'));
  // Added v11.0 for single-ledger PWA dedup matching
  ss.setNamedRange('Transactions_Timestamp', txn.getRange('H2:H1000'));
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

    ['WHAT IS THIS?', 13, true, '#e8eaf6', '#1a237e'],
    ['A personal budget system: Google Sheet + mobile PWA categorizer.', 10, false, null, null],
    ['Tracks 26 bi-weekly pay periods. Auto-parses Scotiabank email alerts.', 10, false, null, null],
    ['Source: github.com/fahyad/gsheetbudget2026-categorizerApp', 10, false, null, null],
    ['', 10, false, null, null],

    ['TABS', 13, true, '#e8eaf6', '#1a237e'],
    ['Setup            — Pay periods + categories', 10, false, null, null],
    ['Fixed Monthly    — Recurring expenses (rent, phone, etc.)', 10, false, null, null],
    ['Budget           — Budgeted vs Spent per period', 10, false, null, null],
    ['Transactions     — All categorized transactions', 10, false, null, null],
    ['(v11.0+: Pending tab removed — Transactions is the single ledger)', 10, false, null, null],
    ['Logs             — API activity log (debugging)', 10, false, null, null],
    ['Instructions     — This tab (with version info at top)', 10, false, null, null],
    ['', 10, false, null, null],

    ['MENU FUNCTIONS', 13, true, '#e8eaf6', '#1a237e'],
    ['Build Workbook         ⚠ DESTROYS DATA  First-time only.', 11, true, '#ffcdd2', '#b71c1c'],
    ['Initialize Budget      ⚠ Resets Budget rows (keeps amounts).', 11, true, '#fff9c4', '#f57f17'],
    ['Update Script          ✓ Safe. Refresh formulas after deploy.', 11, true, '#c8e6c9', '#1b5e20'],
    ['Add Category           ✓ Adds Budget rows for new categories.', 11, true, '#c8e6c9', '#1b5e20'],
    ['Parse Emails           ✓ Pulls bank emails into Transactions (uncategorized).', 11, true, '#c8e6c9', '#1b5e20'],
    ['Set API Key            ✓ Required for PWA to authenticate.', 11, true, '#c8e6c9', '#1b5e20'],
    ['View Activity Log      ℹ Opens Logs tab.', 11, false, '#f5f5f5', '#424242'],
    ['Refresh Version Info   ℹ Re-checks GitHub for latest version.', 11, false, '#f5f5f5', '#424242'],
    ['', 10, false, null, null],

    ['FIRST-TIME SETUP', 13, true, '#e8eaf6', '#1a237e'],
    ['1. Run Build Workbook', 10, false, null, null],
    ['2. Run Initialize Budget', 10, false, null, null],
    ['3. Run Set API Key (paste a strong random key)', 10, false, null, null],
    ['4. Open PWA → Settings → enter same key → Save', 10, false, null, null],
    ['', 10, false, null, null],

    ['DAILY USE', 13, true, '#e8eaf6', '#1a237e'],
    ['1. Open the PWA on your phone', 10, false, null, null],
    ['2. Tap Refresh — pulls new uncategorized transactions', 10, false, null, null],
    ['3. Tap each transaction → tap a category', 10, false, null, null],
    ['4. Tap Sync — writes them to the Transactions tab', 10, false, null, null],
    ['5. Check Budget tab for updated Spent / Available', 10, false, null, null],
    ['', 10, false, null, null],

    ['ADD / EDIT DATA', 13, true, '#e8eaf6', '#1a237e'],
    ['New category:', 11, true, null, null],
    ['  1. Setup tab → add row in cols D & E (Main + Sub)', 10, false, null, null],
    ['  2. Menu: Budget Tools → Add Category', 10, false, null, null],
    ['', 10, false, null, null],
    ['New fixed expense:', 11, true, null, null],
    ['  1. Fixed Monthly Expenses tab', 10, false, null, null],
    ['  2. Add row: Name, Amount, Due Day (1-31)', 10, false, null, null],
    ['  Budget updates automatically — no menu action needed.', 10, false, null, null],
    ['', 10, false, null, null],
    ['Edit budgeted amounts:', 11, true, null, null],
    ['  Edit the Budgeted column directly in the Budget tab.', 10, false, null, null],
    ['  Spent and Available auto-calculate.', 10, false, null, null],
    ['', 10, false, null, null],

    ['TROUBLESHOOTING', 13, true, '#e8eaf6', '#1a237e'],
    ['PWA shows no categories             → Tap Refresh in PWA', 10, false, null, null],
    ['"No transactions" but sheet has     → Close + reopen PWA (cache)', 10, false, null, null],
    ['Sync fails (nothing reaches sheet)  → Check Logs tab for the error', 10, false, null, null],
    ['"Update needed: YES" at top         → Re-deploy Apps Script (see Developers)', 10, false, null, null],
    ['PWA says "Invalid API key"          → Run Set API Key + re-enter in PWA', 10, false, null, null],
    ['', 10, false, null, null],

    ['DO NOT', 13, true, '#ffcdd2', '#b71c1c'],
    ['⚠ Run Build Workbook after setup (erases all data)', 10, false, '#fff3e0', '#e65100'],
    ['⚠ Edit Budget cols B, E, F (auto-generated formulas)', 10, false, '#fff3e0', '#e65100'],
    ['⚠ Delete Setup rows 2-27 (pay periods used by formulas)', 10, false, '#fff3e0', '#e65100'],
    ['⚠ Rename any tab (script references by name)', 10, false, '#fff3e0', '#e65100'],
    ['⚠ Remove "Budget/Processed" Gmail label (causes re-parsing)', 10, false, '#fff3e0', '#e65100'],
    ['⚠ Share your API key or web app URL publicly', 10, false, '#fff3e0', '#e65100'],
    ['', 10, false, null, null],

    ['FOR DEVELOPERS', 13, true, '#eeeeee', '#424242'],
    ['Repo:    github.com/fahyad/gsheetbudget2026-categorizerApp', 10, false, null, null],
    ['PWA:     fahyad.github.io/gsheetbudget2026-categorizerApp/', 10, false, null, null],
    ['Deploy:  cd apps-script && ./deploy.sh "vXX — description"', 10, false, null, null],
    ['Docs:    docs/findings.md (architecture), docs/task_plan.md (state)', 10, false, null, null],
  ];

  // Existing instruction content starts at row 7 — rows 1-6 reserved for
  // the version block (written by writeVersionBlock_ below).
  var INSTRUCTION_START_ROW = 7;

  var values = [];
  for (var i = 0; i < rows.length; i++) {
    values.push([rows[i][0]]);
  }
  sheet.getRange(INSTRUCTION_START_ROW, 1, rows.length, 1).setValues(values);

  for (var j = 0; j < rows.length; j++) {
    var range = sheet.getRange(j + INSTRUCTION_START_ROW, 1);
    range.setFontSize(rows[j][1]);
    if (rows[j][2]) range.setFontWeight('bold');
    if (rows[j][3]) range.setBackground(rows[j][3]);
    if (rows[j][4]) range.setFontColor(rows[j][4]);
    range.setWrap(true);
  }

  // Populate version block in rows 1-6
  try { writeVersionBlock_(sheet); } catch (e) { /* fail silently if GitHub unreachable */ }

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

/**
 * Builds the Budget tab dashboard (rows 1-6) with display-only metrics
 * for the selected period (B1 dropdown).
 *
 * Layout:
 *   Row 1: PERIOD: [dropdown]                               PROGRESS: Day X of Y (Z% elapsed)
 *   Row 2: (spacer)
 *   Row 3: Net Income | Fixed Expenses | Total Budgeted     | | READY TO ASSIGN
 *   Row 4:   $...        $...             $...                  $... (color-coded)
 *   Row 5: (spacer)
 *   Row 6: (spacer)
 *   Row 7: Period | Main Category | Category | Budgeted | Spent | Available  ← original header
 */
function buildBudgetDashboard_(budget) {
  // --- Clear and set values for rows 1-6 ---
  budget.getRange(1, 1, 6, 6).clearContent().clearFormat();

  // Row 1: labels + dropdown + progress
  budget.getRange('A1').setValue('PERIOD:');
  budget.getRange('E1').setValue('PROGRESS:');
  budget.getRange('F1').setFormula(
    '=IFERROR(LET(' +
      's,INDEX(PayPeriods_Start,MATCH($B$1,PayPeriods_Label,0)),' +
      'e,INDEX(PayPeriods_End,MATCH($B$1,PayPeriods_Label,0)),' +
      'total,e-s+1,' +
      'elapsed,MAX(0,MIN(TODAY()-s+1,total)),' +
      'pct,elapsed/total,' +
      '"Day "&elapsed&" of "&total&" ("&TEXT(pct,"0%")&" elapsed)"' +
    '),"")'
  );

  // Row 3: metric labels
  budget.getRange('A3').setValue('Net Income');
  budget.getRange('B3').setValue('Fixed Expenses');
  budget.getRange('C3').setValue('Total Budgeted');
  budget.getRange('F3').setValue('READY TO ASSIGN');

  // Row 4: metric values
  budget.getRange('A4').setFormula(buildPaycheckFormula_('$B$1'));
  budget.getRange('B4').setFormula(buildFixedExpensesFormula_('$B$1'));
  budget.getRange('C4').setFormula('=IFERROR(SUMIFS(Budget_Budgeted,Budget_Period,$B$1),0)');
  budget.getRange('F4').setFormula('=A4-B4-C4');

  // --- Period dropdown on B1 ---
  var ss = budget.getParent();
  var setup = ss.getSheetByName('Setup');
  if (setup) {
    var periodRule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(setup.getRange('C2:C27'), true)
      .setAllowInvalid(false)
      .build();
    budget.getRange('B1').setDataValidation(periodRule);
    // Default to first period if blank
    if (!budget.getRange('B1').getValue()) {
      budget.getRange('B1').setValue('Dec 25 - Jan 20');
    }
  }

  // --- Formatting ---
  // Row 1: header bar (dark blue, white text)
  budget.getRange('A1:F1').setBackground('#1a237e').setFontColor('#ffffff').setFontWeight('bold');
  budget.getRange('B1').setBackground('#ffffff').setFontColor('#000000').setHorizontalAlignment('center');
  budget.getRange('F1').setBackground('#ffffff').setFontColor('#000000').setFontWeight('normal').setHorizontalAlignment('center');

  // Row 3: metric labels (light blue bg, dark blue text, small caps style)
  budget.getRange('A3:F3').setBackground('#e8eaf6').setFontColor('#1a237e').setFontWeight('bold').setFontSize(10);

  // Row 4: metric values (currency format, larger font)
  budget.getRange('A4:C4').setNumberFormat('$#,##0.00').setFontSize(13).setHorizontalAlignment('center');
  budget.getRange('F4').setNumberFormat('$#,##0.00').setFontSize(14).setFontWeight('bold').setHorizontalAlignment('center');

  // Rows 2, 5, 6: spacers (light gray)
  budget.getRange('A2:F2').setBackground('#f5f5f5');
  budget.getRange('A5:F6').setBackground('#f5f5f5');

  // --- Conditional formatting on F4 (Ready to Assign) ---
  // Clear existing CF rules on F4 first
  var rules = budget.getConditionalFormatRules();
  var newRules = [];
  for (var i = 0; i < rules.length; i++) {
    var ranges = rules[i].getRanges();
    var keep = true;
    for (var j = 0; j < ranges.length; j++) {
      if (ranges[j].getA1Notation() === 'F4') { keep = false; break; }
    }
    if (keep) newRules.push(rules[i]);
  }
  // Add new rules: red if <0, green if =0, yellow if >0
  newRules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(0)
    .setBackground('#ffcdd2').setFontColor('#b71c1c')
    .setRanges([budget.getRange('F4')])
    .build());
  newRules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberEqualTo(0)
    .setBackground('#c8e6c9').setFontColor('#1b5e20')
    .setRanges([budget.getRange('F4')])
    .build());
  newRules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0)
    .setBackground('#fff9c4').setFontColor('#f57f17')
    .setRanges([budget.getRange('F4')])
    .build());
  budget.setConditionalFormatRules(newRules);

  // --- Freeze rows 1-7 (dashboard rows 1-6 + header row 7) ---
  budget.setFrozenRows(7);
}

/**
 * Returns the formula for "Paycheck income in selected period" (positive).
 * @param periodCellRef e.g. '$B$1' (the dashboard period dropdown cell)
 */
function buildPaycheckFormula_(periodCellRef) {
  return '=IFERROR(SUMIFS(Transactions_Amount,Transactions_Period,' + periodCellRef +
    ',Transactions_Category,"Paycheck"),0)';
}

/**
 * Returns the Budget tab "Available" formula for a given row.
 * Format: `prevPeriodAvailable + Budgeted - Spent`.
 * The IF(MATCH>1, ..., 0) wrapper avoids the period-1 INDEX-with-row-0
 * circular-reference bug fixed in v10.4.
 *
 * B10: was duplicated in two places (rebuildBudgetInternal_ for full
 * rebuild, processInfoAlerts-adjacent path for incremental). Centralized
 * here so future formula edits land in one place.
 */
function buildAvailableFormula_(row) {
  return '=IF(MATCH(A' + row + ',PayPeriods_Label,0)>1,' +
    'IFERROR(SUMIFS(Budget_Available,Budget_Period,INDEX(PayPeriods_Label,MATCH(A' + row + ',PayPeriods_Label,0)-1),Budget_Category,C' + row + '),0),' +
    '0)+D' + row + '-E' + row;
}

/**
 * Returns the formula for "Fixed expenses due in selected period" (positive).
 * Sums across 13 months (Jan BUDGET_YEAR - Jan BUDGET_YEAR+1) any fixed
 * expense whose DATE(BUDGET_YEAR, M, dueDay) falls within the period's
 * start/end range.
 * @param periodCellRef e.g. '$B$1' (the dashboard period dropdown cell)
 *
 * B9: year was hardcoded inline; now sourced from BUDGET_YEAR constant
 * at the top of the file. Bump there once per year.
 */
function buildFixedExpensesFormula_(periodCellRef) {
  var monthChecks = [];
  for (var m = 1; m <= 13; m++) {
    monthChecks.push('((DATE(' + BUDGET_YEAR + ',' + m + ',dd)>=s)*(DATE(' + BUDGET_YEAR + ',' + m + ',dd)<=e))');
  }
  return '=IFERROR(LET(' +
    's,INDEX(PayPeriods_Start,MATCH(' + periodCellRef + ',PayPeriods_Label,0)),' +
    'e,INDEX(PayPeriods_End,MATCH(' + periodCellRef + ',PayPeriods_Label,0)),' +
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

  // Read existing Budgeted values to preserve. Scan from row 2 to lastRow —
  // works for both old format (data at row 2, with _income rows) and new
  // format (data at row 8, no _income rows). _income filtered out by category check.
  var lastRow = budget.getLastRow();
  var budgetedMap = {};
  var existingKeys = {};

  if (lastRow > 1) {
    var existingData = budget.getRange(2, 1, lastRow - 1, 4).getValues();
    for (var e = 0; e < existingData.length; e++) {
      var period = existingData[e][0];
      var category = existingData[e][2];
      var budgeted = existingData[e][3];
      if (!period || !category) continue;
      var key = period + '|' + category;
      existingKeys[key] = true;
      if (category !== '_income' && typeof budgeted === 'number') {
        budgetedMap[key] = budgeted;
      }
    }
  }

  // Count NEW category rows (for "add" mode optimization)
  var newCount = 0;
  for (var li = 0; li < labels.length; li++) {
    for (var ci = 0; ci < budgetCats.length; ci++) {
      if (!existingKeys[labels[li] + '|' + budgetCats[ci]]) newCount++;
    }
  }

  if (mode === 'add' && newCount === 0) {
    // Nothing structurally new, but refresh dashboard in case it's missing
    buildBudgetDashboard_(budget);
    return { error: null, totalRows: 0, periods: labels.length, categories: budgetCats.length, newCount: 0 };
  }

  // Wipe entire Budget tab (dashboard, header, data — clean slate)
  budget.clear();

  // Build dashboard at rows 1-6 (sets frozen rows = 7, period dropdown, formulas)
  buildBudgetDashboard_(budget);

  // Header row at row 7
  budget.getRange(7, 1, 1, 6)
    .setValues([['Period', 'Main Category', 'Category', 'Budgeted', 'Spent', 'Available']])
    .setFontWeight('bold').setBackground('#d9ead3');

  // Build category rows (no more _income rows)
  var DATA_START_ROW = 8;
  var allValues = [];
  for (var pi = 0; pi < labels.length; pi++) {
    var label = labels[pi];
    for (var ki = 0; ki < budgetCats.length; ki++) {
      var cat = budgetCats[ki];
      var mapKey = label + '|' + cat;
      var bVal = (budgetedMap[mapKey] !== undefined) ? budgetedMap[mapKey] : 0;
      allValues.push([label, '', cat, bVal, 0, 0]);
    }
  }

  var totalRows = allValues.length;
  budget.getRange(DATA_START_ROW, 1, totalRows, 6).setValues(allValues);

  // Column B (Main Category) — lookup formula
  var formulasB = [];
  for (var bi = 0; bi < totalRows; bi++) {
    var bRow = bi + DATA_START_ROW;
    formulasB.push([
      '=IFERROR(INDEX(Setup!$D$2:$D$100,MATCH(C' + bRow + ',Setup!$E$2:$E$100,0)),"")'
    ]);
  }
  budget.getRange(DATA_START_ROW, 2, totalRows, 1).setFormulas(formulasB);

  // Columns E (Spent) and F (Available) — formulas.
  // Available formula centralized in buildAvailableFormula_ (B10).
  var formulasEF = [];
  for (var ef = 0; ef < totalRows; ef++) {
    var efRow = ef + DATA_START_ROW;
    formulasEF.push([
      '=-SUMIFS(Transactions_Amount,Transactions_Period,A' + efRow + ',Transactions_Category,C' + efRow + ')',
      buildAvailableFormula_(efRow)
    ]);
  }
  budget.getRange(DATA_START_ROW, 5, totalRows, 2).setFormulas(formulasEF);

  // Currency format on Budgeted/Spent/Available columns
  budget.getRange(DATA_START_ROW, 4, totalRows, 3).setNumberFormat('$#,##0.00');
  budget.autoResizeColumns(1, 6);

  // Recreate slicer over header + data only (skip dashboard rows 1-6).
  // Explicitly set the filter column to 1 (Period) so the slicer shows period
  // values when clicked. Without setColumnPosition, programmatically-created
  // slicers default to no filter column → broken filtering UX.
  var existingSlicers = budget.getSlicers();
  for (var s = 0; s < existingSlicers.length; s++) {
    existingSlicers[s].remove();
  }
  var newSlicer = budget.insertSlicer(
    budget.getRange(7, 1, totalRows + 1, 6),
    1, 8
  );
  newSlicer.setColumnPosition(1);  // Filter by Period (col A of the data range)

  return { error: null, totalRows: totalRows, periods: labels.length, categories: budgetCats.length, newCount: newCount };
}
