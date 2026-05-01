
// The key used to store all app data in if necessary localStorage
const STORAGE_KEY = "mt_dms_v2";

// Default rule for the discount perk feature — purchases over this amount get the perk
const DEFAULT_DISCOUNT_RULE = {
  thresholdUSD: 50000,
  perkText: "Eligible for the monthly car wash discount (purchase over $50k)."
};

// Shortcut so we don't have to type document.querySelector every time
const $ = (sel) => document.querySelector(sel);

// Generates a unique ID string with an optional prefix, uses random hex + timestamp
function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

// Tries to parse a JSON string, returns null if it fails (instead of crashing)
function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

// Formats a number as a USD currency string (e.g. 25000 -> "$25,000.00")
function formatUSD(amount) {
  const num = Number(amount || 0);
  return num.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// Shows a small notification at the bottom of the screen for 2.4 seconds
function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2400);
}

// Escapes special HTML characters so user-provided strings can't break the page layout
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
// Same as escapeHtml — used specifically when putting values inside HTML attributes
function escapeAttr(s) { return escapeHtml(s); }

// Base URL for the backend API — all requests go to this server
const API = "http://localhost:3000/api";

// Sends data to the backend using a POST request (used for creating/updating records)
// Also saves data to prisma database so it persists on the server side
async function apiPost(endpoint, data) {
  try {
    const res = await fetch(`${API}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Server error");
    }
    return await res.json();
  } catch (err) {
    console.error("API error:", err.message);
    throw err;
  }
}

// Sends a DELETE request to the backend to remove a specific record
// The endpoint should include the ID, like "customers/123"
async function apiDelete(endpoint) {
  try {
    const res = await fetch(`${API}/${endpoint}`, {
      method: "DELETE"
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Server error");
    }
    // Some DELETE endpoints return nothing, so we handle an empty response
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.error("API error:", err.message);
    throw err;
  }
}

/* ---- State ---- */

// The global state object — everything the app needs is stored here
// It's loaded from localStorage on startup so data survives page refreshes
let state = loadState();

// Reads the saved state from localStorage and returns it as an object
// If nothing is saved yet (or it's corrupted), returns a fresh empty state
function loadState() {
  const parsed = safeJsonParse(localStorage.getItem(STORAGE_KEY));
  if (!parsed || typeof parsed !== "object") {
    return {
      session: null,        // logged-in user info (null = nobody logged in)
      vehicles: [],         // all vehicles in inventory
      customers: [],        // all customer records
      transactions: [],     // all completed transactions
      invoices: {},         // invoice text keyed by transaction id
      settings: { discountRule: { ...DEFAULT_DISCOUNT_RULE } },
      employees: [],        // registered employees
      driverLicenses: [],   // standalone driver's license records
      creditCards: []       // standalone credit card records
    };
  }
  // Validate each field so bad saved data doesn't crash the app
  return {
    session: parsed.session ?? null,
    vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    invoices: parsed.invoices ?? {},
    settings: parsed.settings ?? { discountRule: { ...DEFAULT_DISCOUNT_RULE } },
    employees: Array.isArray(parsed.employees) ? parsed.employees : [],
    driverLicenses: Array.isArray(parsed.driverLicenses) ? parsed.driverLicenses : [],
    creditCards: Array.isArray(parsed.creditCards) ? parsed.creditCards : []
  };
}

// Saves the current state to localStorage so it persists across page loads
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---- Auth ---- */

// Separate key from the main state — user accounts are stored independently
const USERS_KEY = "mt_users";

// Loads the list of registered users from localStorage
function loadUsers() {
  const parsed = safeJsonParse(localStorage.getItem(USERS_KEY));
  return Array.isArray(parsed) ? parsed : [];
}

// Saves the updated list of users back to localStorage
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// Creates a new user account — fails if the username is already taken
// Role ("manager" or "salesperson") is set at registration and stored with the user
function registerUser(username, password, role, fullName) {
  const users = loadUsers();
  if (users.find(u => u.username === username)) return { ok: false, msg: "Username already taken." };
  users.push({ username, password, role, fullName: fullName || "" });
  saveUsers(users);
  return { ok: true };
}

// Checks the credentials against stored users, then saves the session if valid
// Returns true on success, false if username/password don't match
function login(username, password) {
  const users = loadUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return false;
  state.session = { username: user.username, role: user.role };
  saveState();
  return true;
}

// Clears the current session and sends the user back to the login page
function logout() {
  state.session = null;
  saveState();
  window.location.href = "login.html";
}

// Redirects to login if no one is signed in — called at the top of every protected page
function requireAuth() {
  if (!state.session) window.location.href = "login.html";
}

// Hardcoded "team online" sidebar list — just for demo/display purposes
const MOCK_EMPLOYEES = [
  { name: "Ted Mosby",      role: "manager",     initials: "TM", online: true  },
  { name: "Rachel Green",   role: "salesperson", initials: "RG", online: true  },
  { name: "Chandler Bing",  role: "salesperson", initials: "CB", online: false },
];

// Updates the top-right profile chip and controls what's visible based on who's logged in
// Managers get access to the Analytics nav link; salespersons don't
function setSessionBadge() {
  const btn = $("#btnLogout");
  if (btn) btn.hidden = !state.session;

  // Analytics link: only visible for manager role
  const navAnalytics = $("#navAnalytics");
  if (navAnalytics) navAnalytics.hidden = !(state.session && state.session.role === "manager");

  const avatarEl   = $("#topbarAvatarEl");
  const usernameEl = $("#topbarUsername");
  const roleEl     = $("#topbarRole");

  if (state.session) {
    const initials = state.session.username.slice(0, 2).toUpperCase();
    if (avatarEl)   avatarEl.textContent   = initials;
    if (usernameEl) usernameEl.textContent = state.session.username;
    if (roleEl)     roleEl.textContent     = state.session.role;
  } else {
    if (avatarEl)   avatarEl.textContent   = "?";
    if (usernameEl) usernameEl.textContent = "Guest";
    if (roleEl)     roleEl.textContent     = "Not signed in";
  }
}

// Renders the team list in the sidebar footer with online/offline status dots
function renderPeopleOnline() {
  const wrap = $("#peopleOnline");
  const countEl = $("#onlineCount");
  if (!wrap) return;

  const onlineList = MOCK_EMPLOYEES.filter(e => e.online);
  if (countEl) countEl.textContent = `${onlineList.length} online`;

  wrap.innerHTML = MOCK_EMPLOYEES.map(e => `
    <div class="person-item" title="${escapeHtml(e.name)} — ${escapeHtml(e.role)}">
      <div class="person-avatar">${escapeHtml(e.initials)}</div>
      <div class="person-info"><div class="person-name">${escapeHtml(e.name)}</div><div class="person-role">${escapeHtml(e.role)}</div></div>
      <span class="status-dot ${e.online ? "online" : "offline"}"></span>
    </div>
  `).join("");
}

/* ---- Data operations ---- */

// Adds a new vehicle or updates an existing one — matched by VIN (unique identifier)
// If a vehicle with the same VIN already exists, it gets overwritten with the new data
function upsertVehicle(vehicle) {
  const vin = vehicle.vin.trim();
  if (!vin) throw new Error("VIN is required.");

  const idx = state.vehicles.findIndex(v => v.vin === vin);
  if (idx >= 0) state.vehicles[idx] = { ...state.vehicles[idx], ...vehicle, vin };
  else state.vehicles.push({ ...vehicle, id: uid("veh"), vin });

  saveState();
}

// Removes a vehicle from inventory by its VIN
function deleteVehicle(vin) {
  state.vehicles = state.vehicles.filter(v => v.vin !== vin);
  saveState();
}

// Adds a new customer or updates an existing one
// A driver's license and credit card must both be linked before saving
// Customers are matched first by customer_id (edit), then by drivers_license_id (new)
function upsertCustomer(customer) {
  if (!customer.drivers_license_id) throw new Error("A driver's license (drivers_license_id) must be linked.");
  if (!customer.credit_card_number) throw new Error("A credit card (credit_card_number) must be linked.");
  if (!customer.customer_name || !customer.customer_name.trim()) throw new Error("Customer name is required.");

  const dlId = Number(customer.drivers_license_id);
  const ccNum = Number(customer.credit_card_number);
  const dl = state.driverLicenses.find(d => d.drivers_license_id === dlId);
  const license = dl ? String(dl.drivers_license_id) : String(dlId);

  const record = {
    ...customer,
    customer_name: customer.customer_name.trim(),
    credit_score: Number(customer.credit_score || 0),
    drivers_license_id: dlId,
    credit_card_number: ccNum,
    license
  };

  const existingId = customer.customer_id;
  if (existingId) {
    // Editing an existing customer — find by their ID
    const idx = state.customers.findIndex(c => c.customer_id === existingId);
    if (idx >= 0) {
      state.customers[idx] = { ...state.customers[idx], ...record };
    } else {
      state.customers.push({ ...record, txHistory: [] });
    }
  } else {
    // New customer — check if someone with this license already exists (avoid duplicates)
    const idx = state.customers.findIndex(c => c.drivers_license_id === dlId);
    if (idx >= 0) {
      state.customers[idx] = { ...state.customers[idx], ...record };
    } else {
      state.customers.push({ ...record, customer_id: uid("cust"), txHistory: [] });
    }
  }

  saveState();
}

// Removes a customer from the list by their customer_id
function deleteCustomer(customer_id) {
  state.customers = state.customers.filter(c => c.customer_id !== customer_id);
  saveState();
}

/* ---- Employee operations ---- */

// Adds or updates an employee record
// Also derives initials from the name for display in the team sidebar
function upsertEmployee(emp) {
  if (!emp.employee_name || !emp.employee_name.trim()) throw new Error("Employee name is required.");
  const id = emp.id || uid("emp");
  const record = {
    ...emp,
    id,
    employee_id: emp.employee_id ? Number(emp.employee_id) : undefined,
    employee_name: emp.employee_name.trim(),
    department: emp.department || "",
    manager: emp.manager ? Number(emp.manager) : 0,  // 1 = manager, 0 = salesperson
    commission: emp.commission ? Number(emp.commission) : 0,
    name: emp.employee_name.trim(),
    initials: emp.employee_name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    online: emp.online ?? false
  };
  const idx = state.employees.findIndex(e => e.id === id);
  if (idx >= 0) state.employees[idx] = record;
  else state.employees.push(record);
  saveState();
}

// Removes an employee by their internal ID
function deleteEmployee(id) {
  state.employees = state.employees.filter(e => e.id !== id);
  saveState();
}

/* ---- Driver's license operations ---- */

// Adds or updates a driver's license record
// Uses the internal `id` for matching when editing; falls back to drivers_license_id for dedup
function upsertDriverLicense(dl) {
  if (!dl.drivers_license_id) throw new Error("License ID (drivers_license_id) is required.");
  const internalId = dl.id || uid("dl");
  const record = {
    ...dl,
    id: internalId,
    drivers_license_id: Number(dl.drivers_license_id)
  };
  const idx = state.driverLicenses.findIndex(d => d.id === internalId);
  if (idx >= 0) state.driverLicenses[idx] = record;
  else {
    // If this license number already exists, update it instead of adding a duplicate
    const dupIdx = state.driverLicenses.findIndex(d => d.drivers_license_id === record.drivers_license_id);
    if (dupIdx >= 0) state.driverLicenses[dupIdx] = { ...state.driverLicenses[dupIdx], ...record };
    else state.driverLicenses.push(record);
  }
  saveState();
}

// Removes a driver's license by its internal ID
function deleteDriverLicense(id) {
  state.driverLicenses = state.driverLicenses.filter(d => d.id !== id);
  saveState();
}

/* ---- Credit card operations ---- */

// Adds or updates a credit card record — same upsert pattern as driver's licenses
function upsertCreditCard(cc) {
  if (!cc.credit_card_number) throw new Error("Card number (credit_card_number) is required.");
  const internalId = cc.id || uid("cc");
  const record = {
    ...cc,
    id: internalId,
    credit_card_number: Number(cc.credit_card_number),
    security_code: Number(cc.security_code || 0),
    zip_code: Number(cc.zip_code || 0)
  };
  const idx = state.creditCards.findIndex(c => c.id === internalId);
  if (idx >= 0) state.creditCards[idx] = record;
  else {
    // Prevent duplicate card numbers
    const dupIdx = state.creditCards.findIndex(c => c.credit_card_number === record.credit_card_number);
    if (dupIdx >= 0) state.creditCards[dupIdx] = { ...state.creditCards[dupIdx], ...record };
    else state.creditCards.push(record);
  }
  saveState();
}

// Removes a credit card by its internal ID
function deleteCreditCard(id) {
  state.creditCards = state.creditCards.filter(c => c.id !== id);
  saveState();
}

function getDiscountPerks(finalPurchaseUSD) {
  const rule = state.settings.discountRule ?? DEFAULT_DISCOUNT_RULE;
  return (Number(finalPurchaseUSD) >= Number(rule.thresholdUSD)) ? [rule.perkText] : [];
}

function commissionRateForMonthlySales(totalSalesUSD) {
  const s = Number(totalSalesUSD || 0);
  if (s <= 100000) return 0.05;
  if (s <= 200000) return 0.07;
  return 0.10;
}

function monthlySalesForUser(username, yyyyMM) {
  return state.transactions
    .filter(tx => tx.salesperson === username && tx.date.startsWith(yyyyMM))
    .reduce((sum, tx) => sum + Number(tx.price_paid || 0), 0);
}

function calculateCommission(username, yyyyMM) {
  const total = monthlySalesForUser(username, yyyyMM);
  const rate = commissionRateForMonthlySales(total);
  return { totalSalesUSD: total, rate, commissionUSD: total * rate };
}

function buildInvoiceText(tx) {
  const customer = state.customers.find(c => c.customer_id === tx.customer_id);
  const vehicle = state.vehicles.find(v => v.vin === tx.vehicleVinBuy);
  if (!customer) throw new Error("Invoice error: customer missing.");
  if (!vehicle) throw new Error("Invoice error: vehicle missing.");

  const perks = getDiscountPerks(tx.price_paid);

  const lines = [
    "MR. TUCKER'S CAR DEALERSHIP",
    "INVOICE",
    "------------------------------------------------------------",
    `Invoice #: ${tx.invoiceNo}`,
    `Date:      ${tx.date}`,
    `Type:      ${tx.type.toUpperCase()}`,
    `Salesperson: ${tx.salesperson}`,
    "",
    "CUSTOMER",
    `Name: ${customer.customer_name}`,
    `Address: ${customer.address || "—"}`,
    `Phone: ${customer.phone || "—"}`,
    `Driver's License ID: ${customer.drivers_license_id}`,
    "",
    "VEHICLE",
    `${vehicle.model_year} ${vehicle.vehicle_brand} (${vehicle.is_used === 0 ? "New" : "Used"})`,
    `VIN: ${vehicle.vin}`,
    `Mileage: ${vehicle.mileage ?? 0}`,
    "",
    "PAYMENT SUMMARY"
  ];

  if (tx.type === "tradein") {
    lines.push(`Vehicle price:       ${formatUSD(tx.price_offered)}`);
    lines.push(`Trade-in value:     -${formatUSD(tx.discount)}`);
    lines.push(`----------------------------------------`);
  }
  lines.push(`Final purchase:      ${formatUSD(tx.price_paid)}`);

  if (perks.length) {
    lines.push("");
    lines.push("DISCOUNTS / PERKS");
    perks.forEach(p => lines.push(`- ${p}`));
  }

  lines.push("");
  lines.push("Thank you for your business!");
  return lines.join("\n");
}

function validateCustomerForPurchase(customer) {
  if (!customer.drivers_license_id) {
    throw new Error("Customer must have a linked driver's license (drivers_license_id) to purchase.");
  }
}

function createTransaction(txInput) {
  const customer = state.customers.find(c => c.customer_id === txInput.customer_id);
  const vehicle = state.vehicles.find(v => v.vin === txInput.vehicleVinBuy);

  if (!customer) throw new Error("Customer not found.");
  if (!vehicle) throw new Error("Vehicle not found.");

  validateCustomerForPurchase(customer);

  if (Number(vehicle.stock) <= 0) throw new Error("Vehicle is out of stock.");

  const price_offered = txInput.priceOverrideUSD ?? Number(vehicle.vehicle_price);
  const discount = txInput.type === "tradein" ? Number(txInput.discount || 0) : 0;
  const price_paid = Math.max(0, price_offered - discount);

  const tx = {
    id: uid("tx"),
    type: txInput.type,
    date: txInput.date,
    customer_id: txInput.customer_id,
    salesperson: txInput.salesperson,
    vehicleVinBuy: vehicle.vin,
    price_offered,
    tradeIn: txInput.type === "tradein" ? txInput.tradeIn : null,
    discount,
    price_paid,
    invoiceNo: `INV-${Date.now().toString(36).toUpperCase()}`
  };

  state.transactions.unshift(tx);

  vehicle.stock = Number(vehicle.stock) - 1;

  if (tx.type === "tradein" && txInput.tradeIn) {
    state.vehicles.unshift({
      id: uid("veh"),
      vin: `TRADE-${Date.now().toString(36).toUpperCase()}`,
      vehicle_brand: txInput.tradeIn.vehicle_brand || "Unknown",
      model_year: Number(txInput.tradeIn.model_year || new Date().getFullYear()),
      vehicle_type: "family",
      is_used: 1,
      mileage: Number(txInput.tradeIn.mileage || 0),
      vehicle_price: Number(txInput.tradeIn.estimatedResaleUSD || 0),
      stock: 1
    });
  }

  customer.txHistory = customer.txHistory || [];
  customer.txHistory.unshift({ txId: tx.id, date: tx.date, type: tx.type, amountUSD: tx.price_paid });

  state.invoices[tx.id] = buildInvoiceText(tx);
  saveState();
  return tx;
}

function globalSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) return { vehicles: [], customers: [], transactions: [] };

  const vehicles = state.vehicles.filter(v =>
    [v.vin, v.vehicle_brand, v.vehicle_type, String(v.model_year)]
      .some(x => String(x || "").toLowerCase().includes(q))
  );

  const customers = state.customers.filter(c =>
    [c.customer_name, String(c.drivers_license_id || ""), c.phone, c.address]
      .some(x => String(x || "").toLowerCase().includes(q))
  );

  const transactions = state.transactions.filter(t =>
    [t.id, t.invoiceNo, t.salesperson, t.date, t.type, t.vehicleVinBuy, String(t.customer_id || "")]
      .some(x => String(x || "").toLowerCase().includes(q))
  );

  return { vehicles, customers, transactions };
}

/* ---- Rendering ---- */

let selectedInvoiceTxId = null;

function renderDashboard() {
  if (!$("#statVehicles")) return;
  $("#statVehicles").textContent = String(state.vehicles.length);
  $("#statCustomers").textContent = String(state.customers.length);
  $("#statTransactions").textContent = String(state.transactions.length);

  const [latestTx] = state.transactions;
  const recent = $("#recentInvoice");
  if (recent) recent.textContent = latestTx ? (state.invoices[latestTx.id] ?? "—") : "No invoices yet.";
}

function renderInventory() {
  const wrap = $("#inventoryList");
  if (!wrap) return;

  const q = ($("#inventoryFilter")?.value || "").trim().toLowerCase();
  const vehicles = state.vehicles.filter(v =>
    !q || [v.vin, v.vehicle_brand].some(x => String(x || "").toLowerCase().includes(q))
  );

  if (!vehicles.length) {
    wrap.innerHTML = `<div class="muted small">No vehicles found.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table aria-label="Inventory">
      <thead>
        <tr>
          <th>VIN</th><th>vehicle_brand</th><th>model_year</th><th>vehicle_type</th>
          <th>is_used</th><th>mileage</th><th>vehicle_price</th><th>Stock</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${vehicles.map(v => `
          <tr>
            <td class="mono">${escapeHtml(v.vin)}</td>
            <td>${escapeHtml(v.vehicle_brand)}</td>
            <td>${escapeHtml(v.model_year)}</td>
            <td>${escapeHtml(v.vehicle_type)}</td>
            <td>${v.is_used === 0 ? "New" : "Used"}</td>
            <td>${escapeHtml(v.mileage ?? 0)}</td>
            <td>${formatUSD(v.vehicle_price)}</td>
            <td>${escapeHtml(v.stock)}</td>
            <td>
              <button class="btn" data-act="editVehicle" data-vin="${escapeAttr(v.vin)}" type="button">Edit</button>
              <button class="btn" data-act="delVehicle" data-vin="${escapeAttr(v.vin)}" type="button">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderCustomers() {
  const wrap = $("#customerList");
  if (!wrap) return;

  const q = ($("#customerFilter")?.value || "").trim().toLowerCase();
  const customers = state.customers.filter(c => {
    if (!q) return true;
    return (
      String(c.customer_name || "").toLowerCase().includes(q) ||
      String(c.drivers_license_id || "").includes(q) ||
      String(c.phone || "").toLowerCase().includes(q)
    );
  });

  if (!customers.length) {
    wrap.innerHTML = `<div class="muted small">No customers found.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table aria-label="Customers">
      <thead>
        <tr>
          <th>customer_name</th><th>drivers_license_id</th><th>credit_card_number</th><th>credit_score</th><th>phone</th>
          <th>Address</th><th>Tx history</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${customers.map(c => {
          const dl = c.drivers_license_id ? state.driverLicenses.find(d => d.drivers_license_id === c.drivers_license_id) : null;
          const dlDisplay = dl
            ? `${escapeHtml(dl.drivers_license_id)} — ${escapeHtml(dl.holder_name)}`
            : (c.drivers_license_id ? escapeHtml(c.drivers_license_id) : `<span class="muted">—</span>`);
          const cc = c.credit_card_number ? state.creditCards.find(x => x.credit_card_number === c.credit_card_number) : null;
          const ccDisplay = cc
            ? `${escapeHtml(cc.credit_card_number)} — ${escapeHtml(cc.holder_name)}`
            : (c.credit_card_number ? escapeHtml(c.credit_card_number) : `<span class="muted">—</span>`);
          return `
          <tr>
            <td>${escapeHtml(c.customer_name)}</td>
            <td class="mono small">${dlDisplay}</td>
            <td class="mono small">${ccDisplay}</td>
            <td>${escapeHtml(c.credit_score)}</td>
            <td>${escapeHtml(c.phone || "—")}</td>
            <td>${escapeHtml(c.address || "—")}</td>
            <td class="mono small">${escapeHtml((c.txHistory || []).slice(0,3).map(t => `${t.date}:${t.type}:${Math.round(t.amountUSD)}`).join(" | ") || "—")}</td>
            <td>
              <button class="btn" data-act="editCustomer" data-id="${escapeAttr(c.customer_id)}" type="button">Edit</button>
              <button class="btn" data-act="delCustomer" data-id="${escapeAttr(c.customer_id)}" type="button">Delete</button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function refreshTransactionSelects() {
  const custSel = $("#txCustomer");
  const vehSel = $("#txVehicleBuy");
  if (!custSel || !vehSel) return;

  custSel.innerHTML = state.customers.length
    ? state.customers.map(c => `<option value="${escapeAttr(c.customer_id)}">${escapeHtml(c.customer_name)} — DL# ${escapeHtml(c.drivers_license_id)}</option>`).join("")
    : `<option value="">(No customers — add one first)</option>`;

  const available = state.vehicles.filter(v => Number(v.stock) > 0);
  vehSel.innerHTML = available.length
    ? available.map(v => `<option value="${escapeAttr(v.vin)}">${escapeHtml(v.model_year)} ${escapeHtml(v.vehicle_brand)} — ${escapeHtml(v.vin)} (stock ${escapeHtml(v.stock)})</option>`).join("")
    : `<option value="">(No vehicles in stock — add inventory)</option>`;
}

function renderTransactions() {
  const wrap = $("#txList");
  if (!wrap) return;

  if (!state.transactions.length) {
    wrap.innerHTML = `<div class="muted small">No transactions yet.</div>`;
    $("#invoicePreview") && ($("#invoicePreview").textContent = "No invoice selected.");
    $("#btnPrintInvoice") && ($("#btnPrintInvoice").disabled = true);
    $("#btnCopyInvoice") && ($("#btnCopyInvoice").disabled = true);
    return;
  }

  wrap.innerHTML = `
    <table aria-label="Transactions">
      <thead>
        <tr>
          <th>Date</th><th>Type</th><th>Customer</th><th>Vehicle VIN</th>
          <th>Final</th><th>Invoice</th><th>Salesperson</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${state.transactions.map(tx => {
          const customer = state.customers.find(c => c.customer_id === tx.customer_id);
          const name = customer ? customer.customer_name : "Unknown";
          return `
            <tr>
              <td>${escapeHtml(tx.date)}</td>
              <td>${escapeHtml(tx.type)}</td>
              <td>${escapeHtml(name)}</td>
              <td class="mono">${escapeHtml(tx.vehicleVinBuy)}</td>
              <td>${formatUSD(tx.price_paid)}</td>
              <td class="mono">${escapeHtml(tx.invoiceNo)}</td>
              <td class="mono">${escapeHtml(tx.salesperson)}</td>
              <td>
                <button class="btn" data-act="viewInvoice" data-tx="${escapeAttr(tx.id)}" type="button">View</button>
                <button class="btn" data-act="delTx" data-tx="${escapeAttr(tx.id)}" type="button">Delete</button>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  if (selectedInvoiceTxId && state.invoices[selectedInvoiceTxId] && $("#invoicePreview")) {
    $("#invoicePreview").textContent = state.invoices[selectedInvoiceTxId];
    $("#btnPrintInvoice") && ($("#btnPrintInvoice").disabled = false);
    $("#btnCopyInvoice") && ($("#btnCopyInvoice").disabled = false);
  }
}

function renderReports() {
  const wrap = $("#salesOverview");
  if (!wrap) return;

  const totals = {};
  let grand = 0;
  for (const tx of state.transactions) {
    grand += Number(tx.price_paid || 0);
    totals[tx.salesperson] = (totals[tx.salesperson] || 0) + Number(tx.price_paid || 0);
  }

  const lines = [];
  lines.push(`Total sales (all time): ${formatUSD(grand)}`);
  lines.push("");
  lines.push("By salesperson:");
  const entries = Object.entries(totals).sort((a,b) => b[1] - a[1]);
  if (!entries.length) lines.push("—");
  for (const [u, amt] of entries) lines.push(`- ${u}: ${formatUSD(amt)}`);
  wrap.textContent = lines.join("\n");

  const invWrap = $("#inventoryHealth");
  if (!invWrap) return;

  const low = state.vehicles.slice().sort((a,b) => Number(a.stock) - Number(b.stock)).slice(0, 12);
  invWrap.innerHTML = `
    <table aria-label="Inventory health">
      <thead><tr><th>Vehicle</th><th>VIN</th><th>Stock</th><th>Condition</th><th>Price</th></tr></thead>
      <tbody>
        ${low.map(v => `
          <tr>
            <td>${escapeHtml(v.model_year)} ${escapeHtml(v.vehicle_brand)}</td>
            <td class="mono">${escapeHtml(v.vin)}</td>
            <td>${escapeHtml(v.stock)}</td>
            <td>${v.is_used === 0 ? "New" : "Used"}</td>
            <td>${formatUSD(v.vehicle_price)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderSearch() {
  const wrap = $("#searchResults");
  if (!wrap) return;

  const q = $("#globalSearch")?.dataset?.lastQuery || "";
  if (!q) {
    wrap.innerHTML = `<div class="muted small">Enter a query to search.</div>`;
    return;
  }

  const res = globalSearch(q);

  wrap.innerHTML = `
    <div class="card">
      <h2>Vehicles</h2>
      ${res.vehicles.length ? res.vehicles.map(v => `
        <div class="muted small mono">${escapeHtml(v.vin)} — ${escapeHtml(v.model_year)} ${escapeHtml(v.vehicle_brand)} (${v.is_used === 0 ? "New" : "Used"}), stock ${escapeHtml(v.stock)}</div>
      `).join("") : `<div class="muted small">No matches.</div>`}
    </div>

    <div class="card">
      <h2>Customers</h2>
      ${res.customers.length ? res.customers.map(c => `
        <div class="muted small mono">DL#${escapeHtml(c.drivers_license_id)} — ${escapeHtml(c.customer_name)} (${escapeHtml(c.phone || "—")})</div>
      `).join("") : `<div class="muted small">No matches.</div>`}
    </div>

    <div class="card">
      <h2>Transactions</h2>
      ${res.transactions.length ? res.transactions.map(t => `
        <div class="muted small mono">${escapeHtml(t.invoiceNo)} — ${escapeHtml(t.date)} ${escapeHtml(t.type)} ${formatUSD(t.price_paid)} (${escapeHtml(t.salesperson)})</div>
      `).join("") : `<div class="muted small">No matches.</div>`}
    </div>
  `;
}

function updateNavBadges() {
  const nbInv = $("#nbInventory");
  const nbCust = $("#nbCustomers");
  const nbTx = $("#nbTransactions");
  const nbEmp = $("#nbEmployees");
  if (nbInv) nbInv.textContent = state.vehicles.length || "";
  if (nbCust) nbCust.textContent = state.customers.length || "";
  if (nbTx) nbTx.textContent = state.transactions.length || "";
  if (nbEmp) nbEmp.textContent = (MOCK_EMPLOYEES.length + state.employees.length) || "";
}

function renderSettings() {
  const rule = state.settings.discountRule ?? DEFAULT_DISCOUNT_RULE;
  const tEl = $("#dcThresholdText");
  if (tEl) tEl.textContent = `Purchases over ${formatUSD(rule.thresholdUSD)} get: "${rule.perkText}"`;
  renderDcPreview();
}

function renderUtilities() {
  const darkToggle = $("#utilDarkToggle");
  if (darkToggle && !darkToggle._wired) {
    darkToggle._wired = true;
    darkToggle.checked = document.documentElement.classList.contains("dark");
    darkToggle.addEventListener("change", () => {
      const isDark = darkToggle.checked;
      document.documentElement.classList.toggle("dark", isDark);
      localStorage.setItem("mt_theme", isDark ? "dark" : "light");
      syncThemeIcon();
    });
  }
}

function renderEmployeesPage() {
  const allEmployees = [
    ...MOCK_EMPLOYEES.map(e => ({ ...e, isMock: true })),
    ...state.employees.map(e => ({ ...e, isMock: false }))
  ];

  const totalEl = $("#empStatTotal");
  const onlineEl = $("#empStatOnline");
  const managersEl = $("#empStatManagers");
  if (totalEl) totalEl.textContent = String(allEmployees.length);
  if (onlineEl) onlineEl.textContent = String(allEmployees.filter(e => e.online).length);
  if (managersEl) managersEl.textContent = String(allEmployees.filter(e => e.role === "manager").length);

  const wrap = $("#employeesTable");
  if (!wrap) return;

  wrap.innerHTML = `
    <table aria-label="Employees">
      <thead><tr><th>employee_name</th><th>employee_id</th><th>Department</th><th>manager</th><th>commission</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${allEmployees.map(e => {
          const displayName = e.employee_name || e.name || "—";
          const initials = e.initials || displayName.slice(0,2).toUpperCase();
          return `
          <tr>
            <td><span class="emp-row-avatar">${escapeHtml(initials)}</span>${escapeHtml(displayName)}</td>
            <td class="mono">${escapeHtml(e.employee_id != null ? e.employee_id : "—")}</td>
            <td>${escapeHtml(e.department || "—")}</td>
            <td class="mono">${escapeHtml(e.manager != null ? e.manager : "—")}</td>
            <td class="mono">${escapeHtml(e.commission != null ? e.commission + "%" : "—")}</td>
            <td><span class="badge ${e.online ? "ok" : "subtle"}">${e.online ? "Online" : "Offline"}</span></td>
            <td>${e.isMock
              ? `<span class="muted small">Demo</span>`
              : `<button class="btn" data-act="editEmp" data-id="${escapeAttr(e.id)}" type="button">Edit</button>
                 <button class="btn" data-act="delEmp" data-id="${escapeAttr(e.id)}" type="button">Remove</button>`
            }</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function refreshCustomerFormSelects() {
  const dlSel = $("#cust_drivers_license_id");
  if (dlSel) {
    const prev = dlSel.value;
    dlSel.innerHTML = `<option value="">— select a driver's license —</option>` +
      state.driverLicenses.map(dl =>
        `<option value="${escapeAttr(dl.drivers_license_id)}">${escapeHtml(dl.holder_name)} — ID: ${escapeHtml(dl.drivers_license_id)}</option>`
      ).join("");
    if (prev) dlSel.value = prev;
  }
  const ccSel = $("#cust_credit_card_number");
  if (ccSel) {
    const prev = ccSel.value;
    ccSel.innerHTML = `<option value="">— select a credit card —</option>` +
      state.creditCards.map(cc =>
        `<option value="${escapeAttr(cc.credit_card_number)}">${escapeHtml(cc.holder_name)} — #${escapeHtml(cc.credit_card_number)}</option>`
      ).join("");
    if (prev) ccSel.value = prev;
  }
}

function renderDriverLicenseList() {
  const wrap = $("#dlList");
  if (!wrap) return;
  if (!state.driverLicenses.length) {
    wrap.innerHTML = `<div class="muted small" style="padding:12px 0">No driver's licenses on file.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table aria-label="Driver's Licenses">
      <thead>
        <tr><th>drivers_license_id</th><th>holder_name</th><th>birth_date</th><th>expiration_date</th><th>Linked customer</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${state.driverLicenses.map(dl => {
          const cust = state.customers.find(c => c.drivers_license_id === dl.drivers_license_id);
          const custCell = cust
            ? escapeHtml(cust.customer_name)
            : `<span class="muted">— unlinked —</span>`;
          return `
          <tr>
            <td class="mono">${escapeHtml(dl.drivers_license_id)}</td>
            <td>${escapeHtml(dl.holder_name)}</td>
            <td>${escapeHtml(dl.birth_date || "—")}</td>
            <td>${escapeHtml(dl.expiration_date || "—")}</td>
            <td>${custCell}</td>
            <td>
              <button class="btn" data-act="editDl" data-id="${escapeAttr(dl.id)}" type="button">Edit</button>
              <button class="btn" data-act="delDl" data-id="${escapeAttr(dl.id)}" type="button">Delete</button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderCreditCardList() {
  const wrap = $("#ccList");
  if (!wrap) return;
  if (!state.creditCards.length) {
    wrap.innerHTML = `<div class="muted small" style="padding:12px 0">No credit cards on file.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table aria-label="Credit Cards">
      <thead>
        <tr><th>credit_card_number</th><th>holder_name</th><th>security_code</th><th>expiration_date</th><th>zip_code</th><th>Linked customer</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${state.creditCards.map(cc => {
          const cust = state.customers.find(c => c.credit_card_number === cc.credit_card_number);
          const custCell = cust
            ? escapeHtml(cust.customer_name)
            : `<span class="muted">— unlinked —</span>`;
          return `
          <tr>
            <td class="mono">${escapeHtml(cc.credit_card_number)}</td>
            <td>${escapeHtml(cc.holder_name)}</td>
            <td class="mono">${escapeHtml(cc.security_code)}</td>
            <td class="mono">${escapeHtml(cc.expiration_date)}</td>
            <td>${escapeHtml(cc.zip_code)}</td>
            <td>${custCell}</td>
            <td>
              <button class="btn" data-act="editCc" data-id="${escapeAttr(cc.id)}" type="button">Edit</button>
              <button class="btn" data-act="delCc" data-id="${escapeAttr(cc.id)}" type="button">Delete</button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function rerenderAll() {
  setSessionBadge();
  renderPeopleOnline();
  updateNavBadges();
  renderDashboard();
  renderInventory();
  renderCustomers();
  refreshTransactionSelects();
  refreshCustomerFormSelects();
  renderTransactions();
  renderReports();
  renderSearch();
  renderSettings();
  renderUtilities();
  renderEmployeesPage();
  renderDriverLicenseList();
  renderCreditCardList();
}

/* ---- Wiring ---- */

$("#btnLogout") && $("#btnLogout").addEventListener("click", logout);

$("#loginForm") && $("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const username = $("#loginUser").value.trim();
  const password = $("#loginPass").value;

  if (!username || !password) {
    toast("Username and password are required.");
    return;
  }
  if (!login(username, password)) {
    toast("Invalid username or password.");
    return;
  }
  toast(`Signed in as ${username}`);

  // Cinematic exit: spinner button + card scale-fade
  const btn = document.querySelector('#loginForm button[type="submit"]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="spin" width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7.5 1A6.5 6.5 0 0 1 14 7.5"/></svg> Signing in\u2026';
  }
  const card = document.querySelector('.auth-card');
  if (card) {
    card.style.transition = 'opacity 300ms ease, transform 300ms cubic-bezier(0.4,0,1,1)';
    card.style.opacity = '0';
    card.style.transform = 'scale(1.03) translateY(-8px)';
  }
  sessionStorage.setItem('mt_from_login', '1');
  setTimeout(() => { window.location.href = "dashboard.html"; }, 310);
});

$("#btnLoadDemo") && $("#btnLoadDemo").addEventListener("click", () => {
  loadDemoData();
  const users = loadUsers();
  if (users.length === 0) {
    registerUser("demo", "demo", "manager", "Demo User");
    toast("Demo data loaded. Sign in: demo / demo (manager).");
  } else {
    toast("Demo data loaded.");
  }
  rerenderAll();
});

$("#vehicleForm") && $("#vehicleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const v = {
      id: $("#vehicleId").value || undefined,
      vin: $("#vehicleVin").value,
      vehicle_brand: $("#vehicle_brand").value,
      model_year: Number($("#model_year").value),
      vehicle_type: $("#vehicle_type").value,
      is_used: Number($("#is_used").value),
      mileage: Number($("#vehicleMileage").value || 0),
      vehicle_price: Number($("#vehicle_price").value),
      stock: Number($("#vehicleStock").value)
    };
    upsertVehicle(v);
    
    // ----- Jaylen API Routing -----
    // Add vehicle data into prisma
    const saved = await apiPost("inventory", {
      vehicle_brand: v.vehicle_brand,
      model_year: v.model_year,
      vehicle_type: v.vehicle_types,
      is_used: v.is_used,
      mileage: v.mileage,
      vehicle_price: v.vehicle_price,
      stock: v.stock         
    });
    // ------------------------------

    toast("Vehicle saved.");
    $("#vehicleForm").reset();
    $("#vehicleId").value = "";
    rerenderAll();
  } catch (err) {
    toast(err.message || "Failed to save vehicle.");
  }
});

$("#btnVehicleReset") && $("#btnVehicleReset").addEventListener("click", () => {
  $("#vehicleForm").reset();
  $("#vehicleId").value = "";
});

$("#inventoryFilter") && $("#inventoryFilter").addEventListener("input", renderInventory);

$("#inventoryList") && $("#inventoryList").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;

  const act = btn.dataset.act;
  const vin = btn.dataset.vin;

  if (act === "editVehicle") {
    const v = state.vehicles.find(x => x.vehicle_id === Number(id));
    if (!v) return;
    $("#vehicleId").value = v.id || "";
    $("#vehicleVin").value = v.vin;
    if ($("#vehicle_brand"))  $("#vehicle_brand").value = v.vehicle_brand || "";
    if ($("#model_year"))     $("#model_year").value = v.model_year || "";
    if ($("#vehicle_type"))   $("#vehicle_type").value = v.vehicle_type || "";
    if ($("#is_used"))        $("#is_used").value = v.is_used ?? 0;
    $("#vehicleMileage").value = v.mileage ?? 0;
    if ($("#vehicle_price"))  $("#vehicle_price").value = v.vehicle_price || "";
    $("#vehicleStock").value = v.stock;
    toast("Editing vehicle.");
  }

  if (act === "delVehicle") {
    const v = state.vehicles.find(x => x.vehicle_id === Number(id));
    deleteVehicle(Number(id));

    // ----- Jaylen API Routing -----
    // Delete vehicle data from prisma
    await apiDelete(`inventory/${v.vehicle_id}`);
    // ------------------------------

    toast("Vehicle deleted.");
    rerenderAll();
  }
});

$("#btnExportInventory") && $("#btnExportInventory").addEventListener("click", () => {
  downloadJson(state.vehicles, "inventory.json");
});

$("#customerForm") && $("#customerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const c = {
      customer_id: $("#customerId").value || undefined,
      customer_name: $("#cust_customer_name").value.trim(),
      credit_score: Number($("#cust_credit_score").value),
      drivers_license_id: Number($("#cust_drivers_license_id").value) || undefined,
      credit_card_number: Number($("#cust_credit_card_number").value) || undefined,
      address: $("#custAddress").value.trim(),
      phone: $("#cust_phone").value.trim()
    };
    upsertCustomer(c);

    // ----- Jaylen API Routing -----
    // Add customer form data into prisma
    const saved = await apiPost("customers", {
      customer_name: c.customer_name,
      credit_score: c.credit_score,
      address: c.address,
      phone: c.phone,
      drivers_license_id: c.drivers_license_id,
      credit_card_number: c.credit_card_number        
    });
    // ------------------------------
    
    const idx = state.customers.findIndex(cu => cu.drivers_license_id === c.drivers_license_id);
    if (idx >= 0 && saved?.customer_id) {
      state.customers[idx].customer_id = saved.customer_id;
      saveState();
    }

    toast("Customer saved.");
    $("#customerForm").reset();
    $("#customerId").value = "";
    rerenderAll();
  } catch (err) {
    toast(err.message || "Failed to save customer.");
  }
});

$("#btnCustomerReset") && $("#btnCustomerReset").addEventListener("click", () => {
  $("#customerForm").reset();
  $("#customerId").value = "";
});

$("#customerFilter") && $("#customerFilter").addEventListener("input", renderCustomers);

$("#customerList") && $("#customerList").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  
  const act = btn.dataset.act;
  const id = btn.dataset.id;

  if (act === "editCustomer") {
    const c = state.customers.find(x => x.customer_id === Number(id));
    if (!c) return;
    $("#customerId").value = c.customer_id || "";
    if ($("#cust_customer_name")) $("#cust_customer_name").value = c.customer_name || "";
    if ($("#cust_credit_score")) $("#cust_credit_score").value = c.credit_score || "";
    if ($("#custAddress")) $("#custAddress").value = c.address || "";
    if ($("#cust_phone")) $("#cust_phone").value = c.phone || "";
    if ($("#cust_drivers_license_id") && c.drivers_license_id) $("#cust_drivers_license_id").value = c.drivers_license_id;
    if ($("#cust_credit_card_number") && c.credit_card_number) $("#cust_credit_card_number").value = c.credit_card_number;
    toast("Editing customer.");
  }

  if (act === "delCustomer") {
    const c = state.customers.find(x => x.customer_id === Number(id));
    if (!c) return;
    deleteCustomer(Number(id));

    // ----- Jaylen API Routing -----
    // Delete customer data from prisma
    await apiDelete(`customers/${c.customer_id}`);
    // ------------------------------

    toast("Customer deleted.");
    rerenderAll();
  }
});

$("#btnExportCustomers") && $("#btnExportCustomers").addEventListener("click", () => {
  downloadJson(state.customers, "customers.json");
});

(function initTxDate() {
  if (!$("#txDate")) return;
  $("#txDate").value = new Date().toISOString().slice(0, 10);
})();

$("#txType") && $("#txType").addEventListener("change", () => {
  const isTrade = $("#txType").value === "tradein";
  $("#tradeinFields").hidden = !isTrade;
});

$("#txForm") && $("#txForm").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    const type = $("#txType").value;
    const txInput = {
      type,
      date: $("#txDate").value,
      customer_id: $("#txCustomer").value,
      salesperson: $("#txSalesperson").value.trim(),
      vehicleVinBuy: $("#txVehicleBuy").value,
      priceOverrideUSD: $("#txPriceOverride").value ? Number($("#txPriceOverride").value) : null,
      discount: type === "tradein" ? Number($("#txTradeValue").value || 0) : 0,
      tradeIn: type === "tradein" ? {
        vehicle_brand: $("#txTradeMake").value.trim(),
        model_year: Number($("#txTradeYear").value || 0),
        mileage: Number($("#txTradeMileage").value || 0),
        conditionNote: $("#txTradeCondition").value.trim(),
        estimatedResaleUSD: Number($("#txTradeValue").value || 0)
      } : null
    };

    const tx = createTransaction(txInput);
    toast(`Saved. Invoice ${tx.invoiceNo} created.`);
    $("#txForm").reset();
    $("#txDate").value = new Date().toISOString().slice(0,10);
    $("#tradeinFields").hidden = true;
    rerenderAll();
  } catch (err) {
    toast(err.message || "Failed to save transaction.");
  }
});

$("#btnTxReset") && $("#btnTxReset").addEventListener("click", () => {
  $("#txForm").reset();
  $("#txDate").value = new Date().toISOString().slice(0,10);
  $("#tradeinFields").hidden = true;
});

$("#btnExportTx") && $("#btnExportTx").addEventListener("click", () => downloadJson(state.transactions, "transactions.json"));

$("#btnClearInvoices") && $("#btnClearInvoices").addEventListener("click", () => {
  state.invoices = {};
  saveState();
  selectedInvoiceTxId = null;
  toast("Invoices cleared.");
  rerenderAll();
});

$("#txList") && $("#txList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;

  const act = btn.dataset.act;
  const txId = btn.dataset.tx;

  if (act === "viewInvoice") {
    selectedInvoiceTxId = txId;
    $("#invoicePreview") && ($("#invoicePreview").textContent = state.invoices[txId] || "Invoice not found.");
    $("#btnPrintInvoice") && ($("#btnPrintInvoice").disabled = !state.invoices[txId]);
    $("#btnCopyInvoice") && ($("#btnCopyInvoice").disabled = !state.invoices[txId]);
    toast("Invoice loaded.");
  }

  if (act === "delTx") {
    state.transactions = state.transactions.filter(t => t.id !== txId);
    delete state.invoices[txId];
    saveState();
    toast("Transaction deleted.");
    rerenderAll();
  }
});

$("#btnPrintInvoice") && $("#btnPrintInvoice").addEventListener("click", () => {
  if (!selectedInvoiceTxId) return;
  const invoiceText = state.invoices[selectedInvoiceTxId];
  if (!invoiceText) return;

  const w = window.open("", "_blank", "width=800,height=900");
  w.document.write(`
    <pre style="font-family: ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; font-size: 12px;">
${escapeHtml(invoiceText)}
    </pre>
  `);
  w.document.close();
  w.focus();
  w.print();
});

$("#btnCopyInvoice") && $("#btnCopyInvoice").addEventListener("click", async () => {
  if (!selectedInvoiceTxId) return;
  const invoiceText = state.invoices[selectedInvoiceTxId];
  if (!invoiceText) return;
  await navigator.clipboard.writeText(invoiceText);
  toast("Invoice copied.");
});

$("#commissionForm") && $("#commissionForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const yyyyMM = $("#commMonth").value;
  const user = $("#commUser").value.trim();

  const result = calculateCommission(user, yyyyMM);

  const box = $("#commissionResult");
  box.hidden = false;
  box.innerHTML = `
    <div><strong>${escapeHtml(user)}</strong> for <strong>${escapeHtml(yyyyMM)}</strong></div>
    <div>Total sales: <span class="mono">${formatUSD(result.totalSalesUSD)}</span></div>
    <div>Rate: <span class="mono">${Math.round(result.rate * 100)}%</span></div>
    <div>Commission: <span class="mono">${formatUSD(result.commissionUSD)}</span></div>
  `;
});

$("#btnSearch") && $("#btnSearch").addEventListener("click", () => {
  const q = $("#globalSearch").value;
  $("#globalSearch").dataset.lastQuery = q;
  renderSearch();
});
$("#globalSearch") && $("#globalSearch").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("#btnSearch").click(); }
});

/* ━━ Topbar search redirect ━━ */
(function initTopbarSearch() {
  const inp = $("#topbarSearchInput");
  if (!inp) return;
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && inp.value.trim()) {
      window.location.href = `search.html?q=${encodeURIComponent(inp.value.trim())}`;
    }
  });
})();

/* ━━ Discount Calculator ━━ */
let _dcType = "percent";
const _dcQuotes = [];

function renderDcPreview() {
  const finalEl = $("#dcFinalValue");
  const subEl   = $("#dcPreviewSub");
  const bkEl    = $("#dcBreakdown");
  if (!finalEl) return;

  const orig     = parseFloat($("#dcOriginal")?.value || "0") || 0;
  const discVal  = parseFloat($("#dcDiscount")?.value  || "0") || 0;
  const taxRate  = parseFloat($("#dcTax")?.value       || "0") || 0;

  if (!orig) {
    finalEl.textContent = "—";
    if (subEl) subEl.textContent = "Enter values to see breakdown";
    if (bkEl)  bkEl.innerHTML = "";
    return;
  }

  const discountUSD = _dcType === "percent" ? orig * (discVal / 100) : discVal;
  const afterDisc   = Math.max(0, orig - discountUSD);
  const taxUSD      = afterDisc * (taxRate / 100);
  const final       = afterDisc + taxUSD;

  finalEl.textContent = formatUSD(final);
  if (subEl) subEl.textContent = `incl. ${taxRate}% tax`;

  if (bkEl) {
    bkEl.innerHTML = [
      ["Original price",  formatUSD(orig)],
      ["Discount",       `−${formatUSD(discountUSD)}`],
      ["After discount",  formatUSD(afterDisc)],
      ["Tax",            `+${formatUSD(taxUSD)}`],
      ["Final",           formatUSD(final)],
    ].map(([label, val]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
        <span class="muted small">${escapeHtml(label)}</span>
        <span class="mono small" style="font-weight:500">${escapeHtml(val)}</span>
      </div>
    `).join("");
  }
}

(function initDcForm() {
  if (!$("#dcForm")) return;

  ["dcOriginal","dcDiscount","dcTax"].forEach(id => {
    const el = $("#" + id);
    if (el) el.addEventListener("input", renderDcPreview);
  });

  document.querySelectorAll(".toggle-btn[data-type]").forEach(btn => {
    btn.addEventListener("click", () => {
      _dcType = btn.dataset.type;
      document.querySelectorAll(".toggle-btn[data-type]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const lbl = $("#dcDiscountLabel");
      if (lbl) lbl.childNodes[0].textContent = _dcType === "percent" ? "Discount %" : "Discount ($) ";
      renderDcPreview();
    });
  });

  $("#dcForm").addEventListener("submit", (e) => {
    e.preventDefault();
    renderDcPreview();
  });

  $("#btnDcReset")?.addEventListener("click", () => {
    $("#dcForm").reset();
    renderDcPreview();
  });

  $("#btnSaveQuote")?.addEventListener("click", () => {
    const orig    = parseFloat($("#dcOriginal")?.value || "0") || 0;
    const discVal = parseFloat($("#dcDiscount")?.value  || "0") || 0;
    const taxRate = parseFloat($("#dcTax")?.value       || "0") || 0;
    if (!orig) { toast("Enter a price first."); return; }

    const discountUSD = _dcType === "percent" ? orig * (discVal / 100) : discVal;
    const afterDisc   = Math.max(0, orig - discountUSD);
    const taxUSD      = afterDisc * (taxRate / 100);
    const final       = afterDisc + taxUSD;

    _dcQuotes.push({ orig, discountUSD, taxUSD, final, type: _dcType, discVal, taxRate, saved: new Date().toLocaleTimeString() });
    renderDcQuotes();
    toast("Quote saved.");
  });

  renderDcPreview();
})();

function renderDcQuotes() {
  const wrap = $("#dcQuotesList");
  if (!wrap) return;
  if (!_dcQuotes.length) { wrap.innerHTML = `<div class="muted small">No quotes saved yet.</div>`; return; }
  wrap.innerHTML = _dcQuotes.slice().reverse().map(q => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <span class="mono small" style="font-weight:600">${escapeHtml(formatUSD(q.final))}</span>
        <span class="muted small" style="margin-left:8px">orig ${escapeHtml(formatUSD(q.orig))} · disc ${escapeHtml(formatUSD(q.discountUSD))} · tax ${escapeHtml(formatUSD(q.taxUSD))}</span>
      </div>
      <span class="muted small">${escapeHtml(q.saved)}</span>
    </div>
  `).join("");
}

/* ━━ Utilities page ━━ */
(function initUtilities() {
  const csvBtn = $("#btnExportCSV");
  if (csvBtn) {
    csvBtn.addEventListener("click", () => {
      const headers = ["customer_name","drivers_license_id","credit_card_number","credit_score","phone","address"];
      const rows = state.customers.map(c => [c.customer_name||"", c.drivers_license_id||"", c.credit_card_number||"", c.credit_score||"", c.phone||"", c.address||""].map(v => `"${String(v).replace(/"/g,'""')}"`).join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "customers.csv"; a.click();
      URL.revokeObjectURL(url);
    });
  }

  const cpForm = $("#changePassForm");
  if (cpForm) {
    cpForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const current = $("#cpCurrent").value;
      const next    = $("#cpNew").value;
      const confirm = $("#cpConfirm").value;
      if (!state.session) { toast("Not logged in."); return; }
      const users = loadUsers();
      const user = users.find(u => u.username === state.session.username && u.password === current);
      if (!user) { toast("Current password is incorrect."); return; }
      if (next !== confirm) { toast("New passwords don't match."); return; }
      if (!next) { toast("New password cannot be empty."); return; }
      user.password = next;
      saveUsers(users);
      toast("Password updated.");
      cpForm.reset();
    });
  }
})();

/* ━━ Search page: pre-fill from URL query ━━ */
(function initSearchPage() {
  const inp = $("#globalSearch");
  if (!inp) return;
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  if (q) {
    inp.value = q;
    inp.dataset.lastQuery = q;
    renderSearch();
  }
})();

/* ━━ Register-employee page: pre-fill form when navigated via ?edit=<id> ━━ */
(function initRegisterEmployeePage() {
  if (!$("#employeeForm")) return;
  const params = new URLSearchParams(window.location.search);
  const editId = params.get("edit");
  if (!editId) return;
  const emp = state.employees.find(x => x.id === editId);
  if (!emp) return;
  if ($("#emp_internal_id"))   $("#emp_internal_id").value = emp.id;
  if ($("#emp_employee_id"))   $("#emp_employee_id").value = emp.employee_id != null ? emp.employee_id : "";
  if ($("#emp_employee_name")) $("#emp_employee_name").value = emp.employee_name || "";
  if ($("#empDepartment"))     $("#empDepartment").value = emp.department || "";
  if ($("#emp_manager"))       $("#emp_manager").value = emp.manager != null ? emp.manager : 0;
  if ($("#emp_commission"))    $("#emp_commission").value = emp.commission != null ? emp.commission : 0;
  toast("Editing " + (emp.employee_name || "employee") + ".");
})();

/* ---- Employee form ---- */

$("#employeeForm") && $("#employeeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const isEditing = !!($("#emp_internal_id")?.value);
    const emp = {
      id: $("#emp_internal_id")?.value || undefined,
      employee_id: Number($("#emp_employee_id").value) || undefined,
      employee_name: $("#emp_employee_name").value.trim(),
      department: $("#empDepartment").value.trim(),
      manager: Number($("#emp_manager").value) || 0,
      commission: Number($("#emp_commission").value) || 0
    };
    upsertEmployee(emp);

    if (!isEditing) {
      // ----- Jaylen API Routing -----
      // Add employee data into prisma
      const saved = await apiPost("register-employee", {
        employee_name: emp.employee_name,
        department: emp.department,
        manager: emp.manager,
        commission: emp.commission
      });
      // ------------------------------

      const idx = state.employees.findIndex(cu => cu.employee_name === emp.employee_name);
      if (idx >= 0 && saved?.employee_id) {
        state.employees[idx].employee_id = saved.employee_id;
        saveState();
      }
    }

    toast(isEditing ? "Employee updated." : "Employee registered.");
    $("#employeeForm").reset();
    $("#emp_employee_id").value = "";
    if ($("#emp_internal_id")) $("#emp_internal_id").value = "";
    rerenderAll();
  } catch (err) {
    toast(err.message || "Failed to save employee.");
  }
});

$("#btnEmpReset") && $("#btnEmpReset").addEventListener("click", () => {
  $("#employeeForm") && $("#employeeForm").reset();
  if ($("#emp_internal_id")) $("#emp_internal_id").value = "";
});

$("#employeesTable") && $("#employeesTable").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  const id  = btn.dataset.id;

  if (act === "editEmp") {
    const emp = state.employees.find(x => x.id === id);
    if (!emp) return;
    location.href = "register-employee.html?edit=" + encodeURIComponent(id);
  }

  if (act === "delEmp") {
    const emp = state.employees.find(x => x.id === id);
    if (!emp) return;
    deleteEmployee(id);
    toast("Employee removed.");
    rerenderAll();

    // ----- Jaylen API Routing -----
    // Delete employee data from prisma (fire-and-forget — UI already updated)
    if (emp.employee_id) {
      apiDelete(`register-employee/${emp.employee_id}`).catch(() => {});
    }
    // ------------------------------
  }
});

/* ---- Driver's license form ---- */

$("#dlForm") && $("#dlForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const dl = {
      id: $("#dlId").value || undefined,
      drivers_license_id: Number($("#dl_drivers_license_id").value),
      holder_name: $("#dl_holder_name").value.trim(),
      birth_date: $("#dl_birth_date").value,
      expiration_date: $("#dl_expiration_date").value,
      sex: $("#dl_sex").value,
      eye_color: $("#dl_eye_color").value.trim(),
      weight: Number($("#dl_weight").value || 0),
      address: $("#dl_address").value.trim(),
      restrictions: $("#dl_restrictions").value.trim()
    };
    upsertDriverLicense(dl);

    // ----- Jaylen API Routing -----
    // Add driver's license data into prisma
    await apiPost("driver-license", {
      drivers_license_id: dl.drivers_license_id,
      holder_name : dl.holder_name,
      expiration_date: dl.expiration_date,
      address: dl.address,
      birth_date: dl.birth_date,
      sex: dl.sex,
      eye_color: dl.eye_color,
      weight: dl.weight,
      restrictions: dl.restrictions
    });
    // ------------------------------

    toast("Driver's license saved.");
    $("#dlForm").reset();
    $("#dlId").value = "";
    rerenderAll();
  } catch (err) {
    toast(err.message || "Failed to save license.");
  }
});

$("#btnDlReset") && $("#btnDlReset").addEventListener("click", () => {
  $("#dlForm") && $("#dlForm").reset();
  if ($("#dlId")) $("#dlId").value = "";
});

$("#dlList") && $("#dlList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  const id  = btn.dataset.id;

  if (act === "editDl") {
    const dl = state.driverLicenses.find(x => x.id === id);
    if (!dl) return;
    if ($("#dlId"))                   $("#dlId").value = dl.id;
    if ($("#dl_drivers_license_id"))  $("#dl_drivers_license_id").value = dl.drivers_license_id || "";
    if ($("#dl_holder_name"))         $("#dl_holder_name").value = dl.holder_name || "";
    if ($("#dl_birth_date"))          $("#dl_birth_date").value = dl.birth_date || "";
    if ($("#dl_expiration_date"))     $("#dl_expiration_date").value = dl.expiration_date || "";
    if ($("#dl_sex"))                 $("#dl_sex").value = dl.sex || "";
    if ($("#dl_eye_color"))           $("#dl_eye_color").value = dl.eye_color || "";
    if ($("#dl_weight"))              $("#dl_weight").value = dl.weight || "";
    if ($("#dl_address"))             $("#dl_address").value = dl.address || "";
    if ($("#dl_restrictions"))        $("#dl_restrictions").value = dl.restrictions || "";
    toast("Editing license.");
  }

  if (act === "delDl") {
    const dl = state.driverLicenses.find(x => x.id === id);
    deleteDriverLicense(id);

    // ----- Jaylen API Routing -----
    // Delete driver's license data from prisma
    apiDelete(`driver-license/${dl.drivers_license_id}`);
    // ------------------------------

    toast("License deleted.");
    rerenderAll();
  }
});

/* ---- Credit card form ---- */

$("#ccForm") && $("#ccForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const cc = {
      id: $("#ccId").value || undefined,
      credit_card_number: Number($("#cc_credit_card_number").value),
      holder_name: $("#cc_holder_name").value.trim(),
      security_code: Number($("#cc_security_code").value || 0),
      expiration_date: $("#cc_expiration_date").value.trim(),
      zip_code: Number($("#cc_zip_code").value || 0)
    };
    upsertCreditCard(cc);

    // ----- Jaylen API Routing -----
    // Add credit card data into prisma
    await apiPost("creditcard", {
      credit_card_number: cc.credit_card_number,
      holder_name : cc.holder_name,
      security_code: cc.security_code,
      expiration_date: cc.expiration_date,
      zip_code: cc.zip_code
    });
    // ------------------------------

    toast("Credit card saved.");
    $("#ccForm").reset();
    $("#ccId").value = "";
    rerenderAll();
  } catch (err) {
    toast(err.message || "Failed to save card.");
  }
});

$("#btnCcReset") && $("#btnCcReset").addEventListener("click", () => {
  $("#ccForm") && $("#ccForm").reset();
  if ($("#ccId")) $("#ccId").value = "";
});

$("#ccList") && $("#ccList").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  const id  = btn.dataset.id;

  if (act === "editCc") {
    const cc = state.creditCards.find(x => x.id === id);
    if (!cc) return;
    if ($("#ccId"))                  $("#ccId").value = cc.id;
    if ($("#cc_credit_card_number")) $("#cc_credit_card_number").value = cc.credit_card_number || "";
    if ($("#cc_holder_name"))        $("#cc_holder_name").value = cc.holder_name || "";
    if ($("#cc_security_code"))      $("#cc_security_code").value = cc.security_code || "";
    if ($("#cc_expiration_date"))    $("#cc_expiration_date").value = cc.expiration_date || "";
    if ($("#cc_zip_code"))           $("#cc_zip_code").value = cc.zip_code || "";
    toast("Editing card.");
  }

  if (act === "delCc") {
    const cc = state.creditCards.find(x => x.id === id);
    deleteCreditCard(id);
    
    // ----- Jaylen API Routing -----
    // Delete credit card data from prisma
    apiDelete(`creditcard/${cc.credit_card_number}`);
    // ------------------------------
    
    toast("Card deleted.");
    rerenderAll();
  }
});

/* ---- Customer-page form tabs ---- */
(function initCustomerFormTabs() {
  const tabsNav = $("#custFormTabs");
  if (!tabsNav) return;

  tabsNav.addEventListener("click", (e) => {
    const tab = e.target.closest(".form-tab");
    if (!tab) return;

    tabsNav.querySelectorAll(".form-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    ["panelCustomer", "panelLicense", "panelCard"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.hidden = (id !== tab.dataset.panel);
    });
  });
})();

/* ---- DL and CC records are standalone; customers link to them via the customer form ---- */

$("#btnResetAll") && $("#btnResetAll").addEventListener("click", () => {
  if (!confirm("Reset ALL data? This cannot be undone.")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadState();
  selectedInvoiceTxId = null;
  toast("All data reset.");
  rerenderAll();
});

$("#btnBackup") && $("#btnBackup").addEventListener("click", () => downloadJson(state, "mt-dms-backup.json"));

$("#backupFile") && $("#backupFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const parsed = safeJsonParse(await file.text());
    if (!parsed) throw new Error("Invalid JSON backup.");
    state = parsed;
    saveState();
    toast("Backup restored.");
    rerenderAll();
  } catch (err) {
    toast(err.message || "Restore failed.");
  } finally {
    e.target.value = "";
  }
});

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function loadDemoData() {
  // Reset state before loading fresh demo data
  state.transactions = [];
  state.invoices    = {};

  // ── Vehicles ──
  // Stock = desired final count + number of demo purchases against this VIN
  state.vehicles = [
    { id: uid("veh"), vin: "JH4KA7650MC000001", vehicle_brand: "Porsche",    model_year: 2023, vehicle_type: "sport",        is_used: 0, mileage: 0,      vehicle_price: 112000, stock: 2  },
    { id: uid("veh"), vin: "1HGCM82633A000002", vehicle_brand: "Honda",      model_year: 2022, vehicle_type: "family",       is_used: 1, mileage: 28400,  vehicle_price: 24500,  stock: 5  },
    { id: uid("veh"), vin: "2T1BURHE0JC000003", vehicle_brand: "Toyota",     model_year: 2024, vehicle_type: "sport",        is_used: 0, mileage: 0,      vehicle_price: 57000,  stock: 5  },
    { id: uid("veh"), vin: "WBS8M9C50J5J00004", vehicle_brand: "BMW",        model_year: 2021, vehicle_type: "sport",        is_used: 1, mileage: 14200,  vehicle_price: 58900,  stock: 2  },
    { id: uid("veh"), vin: "1G1FB1RX5J0000005", vehicle_brand: "Chevrolet",  model_year: 2024, vehicle_type: "sport",        is_used: 0, mileage: 0,      vehicle_price: 89500,  stock: 1  },
    { id: uid("veh"), vin: "5YJSA1E26MF000006", vehicle_brand: "Tesla",      model_year: 2022, vehicle_type: "family",       is_used: 1, mileage: 19800,  vehicle_price: 71000,  stock: 3  },
    { id: uid("veh"), vin: "3VWF17AT1DM000007", vehicle_brand: "Volkswagen", model_year: 2020, vehicle_type: "sport",        is_used: 1, mileage: 44100,  vehicle_price: 18200,  stock: 3  },
    { id: uid("veh"), vin: "2HKRM4H73FH000008", vehicle_brand: "Honda",      model_year: 2023, vehicle_type: "family",       is_used: 0, mileage: 0,      vehicle_price: 36400,  stock: 7  },
    { id: uid("veh"), vin: "1FM5K8GC1LGB00009", vehicle_brand: "Ford",       model_year: 2023, vehicle_type: "family",       is_used: 1, mileage: 22000,  vehicle_price: 38700,  stock: 4  },
    { id: uid("veh"), vin: "WDDUG8CB4EA000010", vehicle_brand: "Mercedes",   model_year: 2022, vehicle_type: "family",       is_used: 1, mileage: 18500,  vehicle_price: 94000,  stock: 2  },
    { id: uid("veh"), vin: "JN1AZ4EH4FM000011", vehicle_brand: "Nissan",     model_year: 2021, vehicle_type: "sport",        is_used: 1, mileage: 9800,   vehicle_price: 98500,  stock: 2  },
    { id: uid("veh"), vin: "1FADP3F27EL000012", vehicle_brand: "Ford",       model_year: 2023, vehicle_type: "sport",        is_used: 0, mileage: 0,      vehicle_price: 31200,  stock: 3  },
    { id: uid("veh"), vin: "2C3CCAGG4FH000013", vehicle_brand: "Dodge",      model_year: 2022, vehicle_type: "sport",        is_used: 1, mileage: 31000,  vehicle_price: 32400,  stock: 2  },
    { id: uid("veh"), vin: "KNDJN2A24G7000014", vehicle_brand: "Kia",        model_year: 2023, vehicle_type: "recreational", is_used: 0, mileage: 0,      vehicle_price: 22100,  stock: 7  },
    { id: uid("veh"), vin: "3CZRU6H52KM000015", vehicle_brand: "Honda",      model_year: 2022, vehicle_type: "recreational", is_used: 1, mileage: 16400,  vehicle_price: 24800,  stock: 2  },
  ];

  // ── Driver's Licenses and Credit Cards (schema field names; drivers_license_id and credit_card_number are Ints) ──
  // dlId starts at 1001, ccNum starts at 10001 — both sequential integers
  const _demoSpecs = [
    // Friends                                                                                          dlId   ccNum    cvv  ccExp    zip
    { dlId: 1001, ccNum: 10001, name: "Ross Geller",       dob: "1969-10-18", exp: "2028-10-18", sex: "M", eye: "BRN", wt: 185, addr: "15 Grove St, New York, NY",               cvv: 452, ccExp: "11/28", zip: 10014, phone1: "+1 212 555 0181", score: 720 },
    { dlId: 1002, ccNum: 10002, name: "Monica Geller",     dob: "1969-04-22", exp: "2028-04-22", sex: "F", eye: "BRN", wt: 125, addr: "90 Bedford St, New York, NY",             cvv: 883, ccExp: "06/27", zip: 10014, phone1: "+1 212 555 0182", score: 780 },
    { dlId: 1003, ccNum: 10003, name: "Chandler Bing",     dob: "1968-08-19", exp: "2027-08-19", sex: "M", eye: "BLU", wt: 175, addr: "14 Yemen Rd, New York, NY",               cvv: 114, ccExp: "03/26", zip: 10014, phone1: "+1 212 555 0183", score: 695 },
    { dlId: 1004, ccNum: 10004, name: "Joey Tribbiani",    dob: "1968-01-09", exp: "2027-01-09", sex: "M", eye: "BRN", wt: 180, addr: "90 Bedford St Apt 19, New York, NY",      cvv: 339, ccExp: "09/26", zip: 10014, phone1: "+1 212 555 0184", score: 520 },
    { dlId: 1005, ccNum: 10005, name: "Rachel Green",      dob: "1969-05-05", exp: "2028-05-05", sex: "F", eye: "GRN", wt: 120, addr: "495 Grove St, New York, NY",              cvv: 774, ccExp: "04/28", zip: 10014, phone1: "+1 212 555 0185", score: 760 },
    { dlId: 1006, ccNum: 10006, name: "Phoebe Buffay",     dob: "1967-02-16", exp: "2027-02-16", sex: "F", eye: "BLU", wt: 115, addr: "5 Morton St, New York, NY",               cvv: 660, ccExp: "12/26", zip: 10014, phone1: "+1 212 555 0186", score: 610 },
    // HIMYM
    { dlId: 1007, ccNum: 10007, name: "Barney Stinson",    dob: "1976-05-25", exp: "2029-05-25", sex: "M", eye: "BLU", wt: 180, addr: "GNB Tower, New York, NY",                 cvv: 990, ccExp: "08/29", zip: 10036, phone1: "+1 212 555 0199", score: 810 },
    { dlId: 1008, ccNum: 10008, name: "Marshall Eriksen",  dob: "1978-01-23", exp: "2027-01-23", sex: "M", eye: "BRN", wt: 195, addr: "2030 Maple Ave, St Paul, MN",             cvv: 225, ccExp: "07/27", zip: 55101, phone1: "+1 651 555 0143", score: 695 },
    { dlId: 1009, ccNum: 10009, name: "Lily Aldrin",       dob: "1978-03-22", exp: "2027-03-22", sex: "F", eye: "GRN", wt: 120, addr: "2030 Maple Ave, St Paul, MN",             cvv: 448, ccExp: "01/28", zip: 55101, phone1: "+1 651 555 0144", score: 710 },
    { dlId: 1010, ccNum: 10010, name: "Ted Mosby",         dob: "1978-04-25", exp: "2027-04-25", sex: "M", eye: "BLU", wt: 170, addr: "214 W 82nd St, New York, NY",             cvv: 331, ccExp: "05/27", zip: 10024, phone1: "+1 614 555 0101", score: 680 },
    { dlId: 1011, ccNum: 10011, name: "Robin Scherbatsky", dob: "1980-06-23", exp: "2028-06-23", sex: "F", eye: "BRN", wt: 118, addr: "870 5th Ave, New York, NY",               cvv: 886, ccExp: "10/28", zip: 10065, phone1: "+1 604 555 0177", score: 735 },
    // One Piece
    { dlId: 1012, ccNum: 10012, name: "Monkey D. Luffy",   dob: "1997-05-05", exp: "2029-05-05", sex: "M", eye: "BLK", wt: 155, addr: "1 Thousand Sunny Blvd, Los Angeles, CA", cvv: 101, ccExp: "05/29", zip: 90001, phone1: "+1 310 555 0177", score: 540 },
    { dlId: 1013, ccNum: 10013, name: "Roronoa Zoro",      dob: "1995-11-11", exp: "2028-11-11", sex: "M", eye: "BLK", wt: 185, addr: "Dojo District, East Blue, CA",            cvv: 102, ccExp: "11/28", zip: 90002, phone1: "+1 310 555 0178", score: 640 },
    { dlId: 1014, ccNum: 10014, name: "Nami",              dob: "1997-07-03", exp: "2029-07-03", sex: "F", eye: "BRN", wt: 110, addr: "88 Tangerine Grove, Cocoyasi, CA",        cvv: 103, ccExp: "07/29", zip: 90003, phone1: "+1 310 555 0179", score: 750 },
    { dlId: 1015, ccNum: 10015, name: "Usopp",             dob: "1997-04-01", exp: "2029-04-01", sex: "M", eye: "BRN", wt: 130, addr: "1 Syrup Village Rd, Los Angeles, CA",     cvv: 104, ccExp: "04/29", zip: 90004, phone1: "+1 310 555 0180", score: 490 },
    { dlId: 1016, ccNum: 10016, name: "Sanji",             dob: "1996-03-02", exp: "2028-03-02", sex: "M", eye: "GRY", wt: 165, addr: "Baratie Restaurant, Los Angeles, CA",     cvv: 105, ccExp: "03/28", zip: 90005, phone1: "+1 310 555 0181", score: 700 },
    { dlId: 1017, ccNum: 10017, name: "Nico Robin",        dob: "1990-02-06", exp: "2027-02-06", sex: "F", eye: "BLU", wt: 112, addr: "Ohara Archives Ln, Los Angeles, CA",      cvv: 106, ccExp: "02/27", zip: 90006, phone1: "+1 310 555 0182", score: 770 },
    { dlId: 1018, ccNum: 10018, name: "Franky",            dob: "1988-03-09", exp: "2027-03-09", sex: "M", eye: "BLU", wt: 220, addr: "Shipyard Blvd, Water 7, CA",              cvv: 107, ccExp: "03/27", zip: 90007, phone1: "+1 310 555 0183", score: 620 },
    // JJK
    { dlId: 1019, ccNum: 10019, name: "Yuji Itadori",      dob: "2003-03-20", exp: "2027-03-20", sex: "M", eye: "BRN", wt: 176, addr: "Jujutsu High, Tokyo Block, SF, CA",       cvv: 201, ccExp: "03/27", zip: 94102, phone1: "+1 415 555 0122", score: 590 },
    { dlId: 1020, ccNum: 10020, name: "Megumi Fushiguro",  dob: "2003-12-22", exp: "2027-12-22", sex: "M", eye: "BLU", wt: 165, addr: "Zenin Estate Dr, SF, CA",                 cvv: 202, ccExp: "12/27", zip: 94103, phone1: "+1 415 555 0123", score: 670 },
    { dlId: 1021, ccNum: 10021, name: "Nobara Kugisaki",   dob: "2003-08-07", exp: "2027-08-07", sex: "F", eye: "BRN", wt: 108, addr: "Harajuku Ave, SF, CA",                    cvv: 203, ccExp: "08/27", zip: 94104, phone1: "+1 415 555 0124", score: 610 },
    { dlId: 1022, ccNum: 10022, name: "Satoru Gojo",       dob: "1989-12-07", exp: "2028-12-07", sex: "M", eye: "BLU", wt: 176, addr: "Infinity Tower, SF, CA",                  cvv: 204, ccExp: "12/28", zip: 94105, phone1: "+1 415 555 0125", score: 850 },
    { dlId: 1023, ccNum: 10023, name: "Suguru Geto",       dob: "1989-02-03", exp: "2028-02-03", sex: "M", eye: "BLK", wt: 170, addr: "Occult Circle, SF, CA",                   cvv: 205, ccExp: "02/28", zip: 94106, phone1: "+1 415 555 0126", score: 730 },
    // Naruto
    { dlId: 1024, ccNum: 10024, name: "Naruto Uzumaki",    dob: "1999-10-10", exp: "2027-10-10", sex: "M", eye: "BLU", wt: 162, addr: "1 Hokage Rock Rd, Portland, OR",          cvv: 301, ccExp: "10/27", zip: 97201, phone1: "+1 503 555 0001", score: 580 },
    { dlId: 1025, ccNum: 10025, name: "Sasuke Uchiha",     dob: "1999-07-23", exp: "2027-07-23", sex: "M", eye: "BLK", wt: 165, addr: "Uchiha District, Portland, OR",           cvv: 302, ccExp: "07/27", zip: 97202, phone1: "+1 503 555 0002", score: 720 },
    { dlId: 1026, ccNum: 10026, name: "Sakura Haruno",     dob: "1999-03-28", exp: "2027-03-28", sex: "F", eye: "GRN", wt: 110, addr: "7 Medical Ninja Way, Portland, OR",       cvv: 303, ccExp: "03/27", zip: 97203, phone1: "+1 503 555 0003", score: 690 },
    // Attack on Titan
    { dlId: 1027, ccNum: 10027, name: "Eren Yeager",       dob: "2003-03-30", exp: "2027-03-30", sex: "M", eye: "GRN", wt: 170, addr: "Wall Maria St, Seattle, WA",              cvv: 401, ccExp: "03/27", zip: 98101, phone1: "+1 206 555 0001", score: 550 },
    { dlId: 1028, ccNum: 10028, name: "Mikasa Ackerman",   dob: "2003-02-10", exp: "2027-02-10", sex: "F", eye: "BLK", wt: 130, addr: "Scout Regiment Ave, Seattle, WA",         cvv: 402, ccExp: "02/27", zip: 98102, phone1: "+1 206 555 0002", score: 740 },
    { dlId: 1029, ccNum: 10029, name: "Armin Arlert",      dob: "2003-11-03", exp: "2027-11-03", sex: "M", eye: "BLU", wt: 145, addr: "104th Corps Blvd, Seattle, WA",           cvv: 403, ccExp: "11/27", zip: 98103, phone1: "+1 206 555 0003", score: 700 },
    { dlId: 1030, ccNum: 10030, name: "Levi Ackerman",     dob: "1990-12-25", exp: "2028-12-25", sex: "M", eye: "GRY", wt: 160, addr: "1 Special Ops Tower, Seattle, WA",        cvv: 404, ccExp: "12/28", zip: 98104, phone1: "+1 206 555 0004", score: 800 },
  ];

  state.driverLicenses = _demoSpecs.map(s => ({
    id: uid("dl"),
    drivers_license_id: s.dlId,
    holder_name: s.name,
    birth_date: s.dob,
    expiration_date: s.exp,
    sex: s.sex,
    eye_color: s.eye,
    weight: s.wt,
    address: s.addr,
    restrictions: "None"
  }));

  state.creditCards = _demoSpecs.map(s => ({
    id: uid("cc"),
    credit_card_number: s.ccNum,
    holder_name: s.name,
    security_code: s.cvv,
    expiration_date: s.ccExp,
    zip_code: s.zip
  }));

  // ── Customers (schema field names; linked by Int FKs) ──
  state.customers = _demoSpecs.map(s => ({
    customer_id: uid("cust"),
    customer_name: s.name,
    address: s.addr,
    phone: s.phone1,
    credit_score: s.score,
    drivers_license_id: s.dlId,
    credit_card_number: s.ccNum,
    txHistory: []
  }));

  state.settings = { discountRule: { ...DEFAULT_DISCOUNT_RULE } };

  // Helper: find customer_id by drivers_license_id (Int)
  const cId = (dlId) => state.customers.find(c => c.drivers_license_id === dlId)?.customer_id;

  // ── Transactions ── spread Sept 2025 → Mar 2026 for chart data
  const demoTxs = [
    // Sep 2025
    { type: "purchase", date: "2025-09-04", customer_id: cId(1007), salesperson: "ted_mosby",    vehicleVinBuy: "JH4KA7650MC000001", priceOverrideUSD: 112000, discount: 0,     tradeIn: null },
    { type: "purchase", date: "2025-09-18", customer_id: cId(1001), salesperson: "rachel_green", vehicleVinBuy: "1HGCM82633A000002", priceOverrideUSD: 23800,  discount: 0,     tradeIn: null },
    // Oct 2025
    { type: "purchase", date: "2025-10-02", customer_id: cId(1030), salesperson: "chandler_bing",vehicleVinBuy: "WBS8M9C50J5J00004", priceOverrideUSD: 58900,  discount: 0,     tradeIn: null },
    { type: "purchase", date: "2025-10-15", customer_id: cId(1022), salesperson: "ted_mosby",    vehicleVinBuy: "WDDUG8CB4EA000010", priceOverrideUSD: 94000,  discount: 0,     tradeIn: null },
    { type: "purchase", date: "2025-10-28", customer_id: cId(1028), salesperson: "rachel_green", vehicleVinBuy: "5YJSA1E26MF000006", priceOverrideUSD: 71000,  discount: 0,     tradeIn: null },
    // Nov 2025
    { type: "purchase", date: "2025-11-05", customer_id: cId(1011), salesperson: "chandler_bing",vehicleVinBuy: "2HKRM4H73FH000008", priceOverrideUSD: 35900,  discount: 0,     tradeIn: null },
    { type: "purchase", date: "2025-11-14", customer_id: cId(1025), salesperson: "ted_mosby",    vehicleVinBuy: "JN1AZ4EH4FM000011", priceOverrideUSD: 98500,  discount: 0,     tradeIn: null },
    { type: "purchase", date: "2025-11-22", customer_id: cId(1017), salesperson: "rachel_green", vehicleVinBuy: "1FM5K8GC1LGB00009", priceOverrideUSD: 37200,  discount: 0,     tradeIn: null },
    // Dec 2025
    { type: "purchase", date: "2025-12-03", customer_id: cId(1008), salesperson: "chandler_bing",vehicleVinBuy: "2HKRM4H73FH000008", priceOverrideUSD: 36000,  discount: 0,     tradeIn: null },
    { type: "tradein",  date: "2025-12-11", customer_id: cId(1024), salesperson: "ted_mosby",    vehicleVinBuy: "2T1BURHE0JC000003", priceOverrideUSD: 57000,  discount: 12000,
      tradeIn: { vehicle_brand: "Jeep", model_year: 2016, mileage: 88000, estimatedResaleUSD: 12000 } },
    { type: "purchase", date: "2025-12-19", customer_id: cId(1014), salesperson: "rachel_green", vehicleVinBuy: "1HGCM82633A000002", priceOverrideUSD: 24200,  discount: 0,     tradeIn: null },
    // Jan 2026
    { type: "purchase", date: "2026-01-07", customer_id: cId(1020), salesperson: "chandler_bing",vehicleVinBuy: "3VWF17AT1DM000007", priceOverrideUSD: 17500,  discount: 0,     tradeIn: null },
    { type: "purchase", date: "2026-01-15", customer_id: cId(1002), salesperson: "rachel_green", vehicleVinBuy: "2HKRM4H73FH000008", priceOverrideUSD: 35900,  discount: 0,     tradeIn: null },
    { type: "purchase", date: "2026-01-24", customer_id: cId(1016), salesperson: "ted_mosby",    vehicleVinBuy: "2T1BURHE0JC000003", priceOverrideUSD: 55500,  discount: 0,     tradeIn: null },
    // Feb 2026
    { type: "tradein",  date: "2026-02-03", customer_id: cId(1029), salesperson: "chandler_bing",vehicleVinBuy: "KNDJN2A24G7000014", priceOverrideUSD: 22100,  discount: 5500,
      tradeIn: { vehicle_brand: "Toyota", model_year: 2014, mileage: 74000, estimatedResaleUSD: 5500 } },
    { type: "purchase", date: "2026-02-12", customer_id: cId(1009), salesperson: "rachel_green", vehicleVinBuy: "1FM5K8GC1LGB00009", priceOverrideUSD: 38200,  discount: 0,     tradeIn: null },
    { type: "purchase", date: "2026-02-20", customer_id: cId(1015), salesperson: "chandler_bing",vehicleVinBuy: "KNDJN2A24G7000014", priceOverrideUSD: 21500,  discount: 0,     tradeIn: null },
    // Mar 2026
    { type: "tradein",  date: "2026-03-10", customer_id: cId(1019), salesperson: "ted_mosby",    vehicleVinBuy: "2T1BURHE0JC000003", priceOverrideUSD: 57000,  discount: 9500,
      tradeIn: { vehicle_brand: "Dodge", model_year: 2018, mileage: 62000, estimatedResaleUSD: 9500 } },
    { type: "purchase", date: "2026-03-14", customer_id: cId(1002), salesperson: "rachel_green", vehicleVinBuy: "2C3CCAGG4FH000013", priceOverrideUSD: 31900,  discount: 0,     tradeIn: null },
    { type: "purchase", date: "2026-03-15", customer_id: cId(1012), salesperson: "ted_mosby",    vehicleVinBuy: "3VWF17AT1DM000007", priceOverrideUSD: 17500,  discount: 0,     tradeIn: null },
  ];

  for (const txInput of demoTxs) {
    try { createTransaction(txInput); }
    catch (e) { console.warn("Demo tx skipped:", e.message); }
  }

  saveState();
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Page reveal — called after all rendering is done
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function revealPage() {
  const content = document.querySelector('.content');
  if (!content) return;
  content.style.transition = 'opacity 280ms cubic-bezier(0.16,1,0.3,1), transform 280ms cubic-bezier(0.16,1,0.3,1)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    content.style.opacity = '1';
    content.style.transform = 'translateY(0)';
  }));
}

/* ---- Boot ---- */

if (!window.location.pathname.endsWith("login.html")) requireAuth();
setSessionBadge();

// Restore sidebar scroll before rendering
const _sidebarEl = document.querySelector('.sidebar');
if (_sidebarEl) {
  const _savedScroll = sessionStorage.getItem('sidebar_scroll');
  if (_savedScroll) { _sidebarEl.scrollTop = Number(_savedScroll); sessionStorage.removeItem('sidebar_scroll'); }
}

rerenderAll();

// Pre-populate employee form from ?edit= URL param on register-employee.html
(function() {
  var params = new URLSearchParams(location.search);
  var editId = params.get("edit");
  if (!editId || !$("#employeeForm")) return;
  var emp = state && state.employees && state.employees.find(function(x) { return x.id === editId; });
  if (!emp) return;
  if ($("#employeeId"))        $("#employeeId").value = emp.id;
  if ($("#emp_employee_name")) $("#emp_employee_name").value = emp.employee_name || emp.name || "";
  if ($("#emp_employee_id"))   $("#emp_employee_id").value = emp.employee_id != null ? emp.employee_id : "";
  if ($("#empUsername"))       $("#empUsername").value = emp.username || "";
  if ($("#empRole"))           $("#empRole").value = emp.role || "salesperson";
  if ($("#empDepartment"))     $("#empDepartment").value = emp.department || "";
  if ($("#emp_manager"))       $("#emp_manager").value = emp.manager != null ? emp.manager : "";
  if ($("#emp_commission"))    $("#emp_commission").value = emp.commission != null ? emp.commission : "";
})();

// Staggered stat card entrance when arriving from login
if (sessionStorage.getItem('mt_from_login') === '1') {
  sessionStorage.removeItem('mt_from_login');
  document.querySelectorAll('.stat-card').forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    card.style.transition = `opacity 350ms cubic-bezier(0.16,1,0.3,1) ${i * 90}ms, transform 350ms cubic-bezier(0.16,1,0.3,1) ${i * 90}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }));
  });
}

revealPage();

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Theme toggle — light-first, html.dark for dark mode
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function syncThemeIcon() {
  const btn = document.getElementById("btnTheme");
  if (!btn) return;
  const isDark = document.documentElement.classList.contains("dark");
  // Sun = currently dark (click to go light), Moon = currently light (click to go dark)
  btn.innerHTML = isDark
    ? `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="7.5" cy="7.5" r="2.5"/><path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M3.05 3.05l1.06 1.06M10.89 10.89l1.06 1.06M3.05 11.95l1.06-1.06M10.89 4.11l1.06-1.06"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 7.5a5.5 5.5 0 0 0 9.9 3.28A5.5 5.5 0 0 1 6.22 1.1 5.5 5.5 0 0 0 2 7.5z"/></svg>`;
}

(function initTheme() {
  const root = document.documentElement;

  // Remove notransition after full page load — prevents theme-flash on first paint
  window.addEventListener('load', () => { document.documentElement.classList.remove('notransition'); });

  syncThemeIcon();

  const btnTheme = document.getElementById("btnTheme");
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      const isDarkNow = root.classList.toggle("dark");
      localStorage.setItem("mt_theme", isDarkNow ? "dark" : "light");
      syncThemeIcon();
      const utilToggle = document.getElementById("utilDarkToggle");
      if (utilToggle) utilToggle.checked = isDarkNow;
    });
  }
})();

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Page transitions — smooth SPA-style nav
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function initTransitions() {
  // Fade out on nav-item click, then navigate (skip if already on page)
  document.querySelectorAll('a.nav-item').forEach(link => {
    link.addEventListener('click', function (e) {
      if (this.classList.contains('active')) return;
      const href = this.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || this.target === '_blank') return;
      e.preventDefault();
      // Persist sidebar scroll position for restore on next page
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sessionStorage.setItem('sidebar_scroll', sidebar.scrollTop);
      const content = document.querySelector('.content');
      if (content) {
        content.style.opacity = '0';
        content.style.transform = 'translateY(-6px)';
        content.style.transition = 'opacity 160ms ease, transform 160ms ease';
        setTimeout(() => { window.location.href = href; }, 165);
      } else {
        window.location.href = href;
      }
    });
  });
})();

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Auth page — tab switching
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function initAuthTabs() {
  const tabs   = document.querySelectorAll(".auth-tab");
  const panels = document.querySelectorAll(".auth-panel");
  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      panels.forEach(p => { p.hidden = true; });

      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      const target = document.getElementById(tab.dataset.panel);
      if (target) target.hidden = false;
    });
  });
})();

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Register form
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
$("#registerForm") && $("#registerForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const fullName = $("#regName").value.trim();
  const username = $("#regUser").value.trim();
  const pass     = $("#regPass").value;
  const confirm  = $("#regPassConfirm").value;
  const role     = $("#regRole").value;

  if (!username) {
    toast("Username is required.");
    return;
  }
  if (!pass) {
    toast("Password is required.");
    return;
  }
  if (pass !== confirm) {
    toast("Passwords don't match.");
    return;
  }

  const result = registerUser(username, pass, role, fullName);
  if (!result.ok) {
    toast(result.msg);
    return;
  }

  login(username, pass);
  toast(`Account created. Signed in as ${username} (${role}).`);
  window.location.href = "dashboard.html";
});
