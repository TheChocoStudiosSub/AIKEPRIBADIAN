const API_AUTH = "/api/admin/auth";
const API_LICENSES = "/api/admin/licenses";
const API_PAYMENTS = "/api/admin/payments";
const API_APP_CONTROL = "/api/admin/app-control";
const state = {
  view: "overview",
  stats: {},
  requests: [],
  inventory: [],
  licenses: [],
  events: [],
  products: [],
  payments: []
};

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

function money(value) {
  if (value === null || value === undefined || value === "") return "Belum diatur";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function shortId(value) {
  const text = String(value || "");
  return text.length > 14 ? text.slice(0, 8) + "…" + text.slice(-4) : text || "—";
}

function badge(value) {
  const raw = String(value || "unknown").toLowerCase();
  const labels = {
    pending: "Menunggu", verified: "Terverifikasi", hold: "Ditahan", approved: "Disetujui",
    rejected: "Ditolak", expired: "Kedaluwarsa", active: "Aktif", suspended: "Ditangguhkan",
    revoked: "Dicabut", available: "Tersedia", assigned: "Dialokasikan", unverified: "Belum diverifikasi",
    funds_received: "Dana diterima", disputed: "Sengketa", refunded: "Dikembalikan", cancelled: "Dibatalkan",
    settlement: "Lunas", capture: "Berhasil", deny: "Ditolak", cancel: "Dibatalkan", expire: "Kedaluwarsa",
    refund: "Dikembalikan", partial_refund: "Pengembalian sebagian", challenge: "Pemeriksaan", failure: "Gagal",
    not_linked: "Tanpa lisensi", awaiting_payment: "Menunggu pembayaran", awaiting_inventory: "Menunggu stok kunci", issued: "Lisensi diterbitkan"
  };
  return '<span class="badge ' + escapeHTML(raw) + '">' + escapeHTML(labels[raw] || raw) + "</span>";
}

function errorText(code) {
  const messages = {
    owner_auth_unavailable: "Layanan verifikasi Panel Admin sedang tidak tersedia.",
    owner_panel_auth_not_configured: "Konfigurasi autentikasi Panel Admin belum lengkap.",
    owner_verifier_unavailable: "Data verifikasi Owner tidak dapat dibaca.",
    owner_session_unavailable: "Sesi Owner belum dapat dibuat.",
    invalid_credentials: "Kredensial Owner tidak valid.",
    rate_limited: "Terlalu banyak percobaan. Tunggu 15 menit sebelum mencoba kembali.",
    owner_session_required: "Sesi Owner sudah berakhir. Silakan masuk kembali.",
    product_price_not_configured: "Harga resmi produk belum dikonfigurasi.",
    amount_mismatch: "Nominal yang diverifikasi tidak sama dengan harga resmi produk.",
    buyer_mismatch: "Username pembeli tidak cocok dengan data permintaan.",
    transaction_reference_mismatch: "ID transaksi tidak cocok dengan data permintaan.",
    product_sku_mismatch: "SKU produk tidak cocok dengan produk yang diminta.",
    product_not_registered: "Produk atau SKU belum terdaftar atau sudah dinonaktifkan.",
    purchase_not_verified: "Pembayaran belum diverifikasi. Kunci tidak dapat dialokasikan.",
    inventory_empty: "Belum ada kunci pre-issued yang tersedia untuk produk ini.",
    request_not_found: "Permintaan tidak ditemukan atau token aksesnya tidak valid.",
    request_not_pending: "Permintaan ini tidak lagi berada dalam status menunggu.",
    request_expired: "Masa berlaku permintaan telah berakhir.",
    request_rejected: "Permintaan ini sudah ditolak.",
    already_verified: "Pembayaran pada permintaan ini sudah diverifikasi.",
    funds_not_received: "Persetujuan hanya dapat dilakukan setelah dana benar-benar diterima.",
    invalid_inventory_input: "Format produk atau kunci lisensi tidak valid.",
    invalid_license_key: "Format kunci lisensi tidak sesuai.",
    license_key_already_exists: "Kunci tersebut sudah pernah diimpor.",
    license_encryption_not_configured: "Enkripsi inventaris lisensi belum dikonfigurasi.",
    license_terminal_status: "Lisensi yang sudah dicabut atau kedaluwarsa tidak dapat diaktifkan kembali.",
    payment_backend_not_configured: "Backend pembayaran belum dikonfigurasi.",
    payment_records_unavailable: "Riwayat transaksi pembayaran belum dapat dimuat.",
    payment_service_unavailable: "Layanan pembayaran sedang tidak tersedia."
  };
  return messages[code] || String(code || "Terjadi kesalahan yang tidak diketahui.");
}

function toast(message, isError = false) {
  const region = $("toastRegion");
  region.innerHTML = '<div class="toast' + (isError ? " error" : "") + '">' + escapeHTML(message) + "</div>";
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => { region.innerHTML = ""; }, 5500);
}

async function postJSON(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(errorText(data.error || "request_failed"));
    error.code = data.error;
    error.data = data;
    throw error;
  }
  return data;
}

const authCall = (action, payload = {}) => postJSON(API_AUTH, { action, ...payload });
const adminCall = (action, payload = {}) => postJSON(API_LICENSES, { action, ...payload });

function showLogin() {
  $("loginScreen").hidden = false;
  $("appShell").hidden = true;
  $("ownerCredential").value = "";
  $("ownerCredential").focus();
}

function showApp() {
  $("loginScreen").hidden = true;
  $("appShell").hidden = false;
}

async function login(event) {
  event.preventDefault();
  const button = $("loginButton");
  const credential = $("ownerCredential").value;
  button.disabled = true;
  button.textContent = "Memverifikasi...";
  $("loginError").textContent = "";
  try {
    await authCall("login", { credential });
    $("ownerCredential").value = "";
    showApp();
    setView("overview");
  } catch (error) {
    $("loginError").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Masuk sebagai Owner";
  }
}

async function logout() {
  try { await authCall("logout"); } catch { /* Cookie is also cleared by the server when reachable. */ }
  showLogin();
}

const viewMeta = {
  overview: ["PUSAT KENDALI", "Ringkasan", "Pantau permintaan, inventaris, dan status lisensi TCS."],
  requests: ["VERIFIKASI PEMBELIAN", "Permintaan lisensi", "Cocokkan data transaksi dan pastikan dana telah diterima sebelum menyetujui."],
  inventory: ["KUNCI PRE-ISSUED", "Inventaris kunci", "Kelola stok kunci lisensi terenkripsi berdasarkan SKU produk."],
  licenses: ["KONTROL AKSES", "Lisensi aktif", "Pantau dan kendalikan status akses setiap lisensi."],
  events: ["AUDIT TRAIL", "Riwayat aktivitas", "Catatan tindakan administrasi dan perubahan status."],
  products: ["KATALOG LISENSI", "Produk dan harga", "Atur SKU dan nominal resmi yang menjadi acuan verifikasi pembayaran."],
  payments: ["PEMBAYARAN", "Pembayaran Midtrans", "Pantau transaksi Snap, nominal, metode pembayaran, dan status dana masuk."],
  apps: ["EKOSISTEM TCS", "Aplikasi", "Kelola katalog aplikasi TCS dan kesiapan integrasi."],
  plans: ["KOMERSIAL", "Paket & Tarif", "Atur batas aplikasi, hak akses, jadwal laporan, dan tarif rancangan."],
  customers: ["AKUN PELANGGAN", "Pelanggan", "Pantau akun pelanggan, paket, dan koneksi aplikasi."],
  reports: ["PELAPORAN TERPADU", "Laporan", "Pantau laporan harian, bulanan, dan tahunan ekosistem TCS."],
  promos: ["PROMOSI", "Promo", "Kelola kode promo dan masa berlakunya."],
  "app-control": ["KONTROL APLIKASI", "Kontrol Aplikasi", "Kirim pengaturan, fitur, pemberitahuan, dan informasi versi ke aplikasi desktop melalui server TCS."],
  traffic: ["ANALITIK SITUS", "Analitik Pengunjung", "Pantau kunjungan manusia dan bot pada situs TCS."],
  downloads: ["RIWAYAT PRODUK", "Riwayat Unduhan", "Lihat catatan klik unduh, identitas yang diberikan, produk, dan waktu."],
  brands: ["EKOSISTEM TCS", "Brand Ekosistem", "Kelola informasi dan status brand yang berada dalam naungan ekosistem TCS."],
  applications: ["PENERIMAAN BRAND", "Pengajuan Brand", "Tinjau profil brand yang mengajukan diri untuk bergabung ke ekosistem TCS."],
  crawler: ["KEAMANAN TCS", "TCS Web Crawler", "Pantau dan kendalikan pekerjaan crawler menggunakan wewenang Owner."]
};

function setView(view) {
  if (!viewMeta[view]) view = "overview";
  state.view = view;
  document.querySelectorAll(".view-section").forEach((section) => {
    section.hidden = section.id !== "view-" + view;
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  $("pageEyebrow").textContent = viewMeta[view][0];
  $("pageTitle").textContent = viewMeta[view][1];
  $("pageDescription").textContent = viewMeta[view][2];
  $("sidebar").classList.remove("open");
  loadView(view).catch((error) => toast(error.message, true));
}

async function loadView(view) {
  if (view === "overview") return loadDashboard();
  if (view === "requests") return loadRequests();
  if (view === "inventory") return loadInventory();
  if (view === "licenses") return loadLicenses();
  if (view === "events") return loadEvents();
  if (view === "products") return loadProducts();
  if (view === "payments") return loadPayments();
  if (view === "app-control") return loadAppControl();
  if (["apps","plans","customers","reports","promos"].includes(view) && window.tcsEcosystemLoad) return window.tcsEcosystemLoad(view);
  if (["traffic","downloads","brands","applications","crawler"].includes(view) && window.tcsManagementLoad) return window.tcsManagementLoad(view);
}

async function loadDashboard() {
  const [dashboard, requests] = await Promise.all([
    adminCall("dashboard"),
    adminCall("list_requests")
  ]);
  state.stats = dashboard.stats || {};
  state.products = dashboard.products || [];
  state.requests = requests.requests || [];
  const statMap = {
    statPending: "pendingRequests",
    statVerified: "verifiedRequests",
    statActive: "activeLicenses",
    statSuspended: "suspendedLicenses",
    statRevoked: "revokedLicenses",
    statAvailable: "availableKeys",
    statAssigned: "assignedKeys"
  };
  for (const [elementId, key] of Object.entries(statMap)) $(elementId).textContent = String(state.stats[key] ?? 0);
  const latest = state.requests.filter((request) => request.status === "pending").slice(0, 5);
  $("overviewRequests").innerHTML = latest.length ? latest.map((request) => {
    const productName = request.product?.product_name || request.product_id;
    return '<div class="compact-row"><div><strong>' + escapeHTML(productName) + '</strong><small>' +
      escapeHTML(shortId(request.id)) + " · " + escapeHTML(request.buyer_username || "Data pembeli belum lengkap") +
      '</small></div>' + badge(request.verification_status) + "</div>";
  }).join("") : '<p class="empty-state">Tidak ada permintaan yang menunggu.</p>';
}

async function loadRequests() {
  const result = await adminCall("list_requests");
  state.requests = result.requests || [];
  renderRequests();
}

function requestMatches(request, query, filter) {
  const text = [
    request.id, request.product_id, request.product_sku, request.buyer_username,
    request.transaction_reference, request.purchase_reference, request.status, request.verification_status
  ].join(" ").toLowerCase();
  if (query && !text.includes(query)) return false;
  if (filter === "pending") return request.status === "pending" && request.verification_status !== "verified";
  if (filter === "verified") return request.status === "pending" && request.verification_status === "verified";
  return filter === "all" || request.status === filter;
}

function renderRequests() {
  const query = String($("requestSearch").value || "").trim().toLowerCase();
  const filter = $("requestFilter").value;
  const rows = state.requests.filter((request) => requestMatches(request, query, filter));
  $("requestsTable").innerHTML = rows.length ? rows.map((request) => {
    const product = request.product || {};
    const buyerComplete = Boolean(request.buyer_username && request.transaction_reference);
    const priceReady = product.expected_amount_idr !== null && product.expected_amount_idr !== undefined;
    const canVerify = request.status === "pending" && request.verification_status !== "verified" && buyerComplete && priceReady;
    const canApprove = request.status === "pending" && request.verification_status === "verified" && Number(state.stats.availableKeys || 0) > 0;
    const reference = request.transaction_reference
      ? escapeHTML(request.transaction_reference)
      : request.purchase_reference
        ? '<span class="cell-sub">Referensi lama, belum diverifikasi: ' + escapeHTML(request.purchase_reference) + "</span>"
        : "Belum diisi";
    let actions = "";
    if (request.status === "pending" && request.verification_status !== "verified") {
      actions += '<button class="button button-primary button-small" data-action="verify" data-id="' + escapeHTML(request.id) + '"' + (canVerify ? "" : " disabled") + '>Verifikasi</button>';
      actions += '<button class="button button-outline button-small" data-action="hold" data-id="' + escapeHTML(request.id) + '">Tahan</button>';
      actions += '<button class="button button-danger button-small" data-action="reject" data-id="' + escapeHTML(request.id) + '">Tolak</button>';
    } else if (canApprove) {
      actions += '<button class="button button-primary button-small" data-action="approve" data-id="' + escapeHTML(request.id) + '">Setujui & alokasikan</button>';
      actions += '<button class="button button-danger button-small" data-action="reject" data-id="' + escapeHTML(request.id) + '">Tolak</button>';
    } else if (request.status === "pending" && request.verification_status === "verified") {
      actions += '<span class="cell-sub">Menunggu kunci tersedia</span>';
    } else {
      actions = '<span class="cell-sub">Tidak ada tindakan</span>';
    }
    const completeness = buyerComplete ? "" : '<span class="cell-sub">Username / transaksi belum lengkap</span>';
    const priceNote = priceReady ? "" : '<span class="cell-sub">Harga produk belum diatur</span>';
    return '<tr>' +
      '<td><span class="cell-main">' + escapeHTML(shortId(request.id)) + '</span><span class="cell-sub">' + escapeHTML(dateTime(request.created_at)) + '</span></td>' +
      '<td><span class="cell-main">' + escapeHTML(product.product_name || request.product_id) + '</span><span class="cell-sub">SKU: ' + escapeHTML(request.product_sku) + '</span>' + priceNote + '</td>' +
      '<td><span class="cell-main">' + escapeHTML(request.buyer_username || "Belum tersedia") + '</span>' + completeness + '</td>' +
      '<td><span class="cell-main">' + reference + '</span></td>' +
      '<td>' + badge(request.verification_status) + '<span class="cell-sub">' + badge(request.payment_status) + '</span></td>' +
      '<td>' + badge(request.status) + '</td>' +
      '<td><div class="table-actions">' + actions + '</div></td>' +
      "</tr>";
  }).join("") : '<tr><td colspan="7" class="empty-state">Tidak ada permintaan yang sesuai dengan filter.</td></tr>';
}

function openModal(title, bodyHTML, submitLabel, onSubmit, danger = false) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = bodyHTML;
  $("modalFooter").innerHTML = '<button id="modalCancel" class="button button-outline" type="button">Batal</button>' +
    '<button id="modalSubmit" class="button ' + (danger ? "button-danger" : "button-primary") + '" type="button">' + escapeHTML(submitLabel) + "</button>";
  $("modalBackdrop").hidden = false;
  $("modalClose").onclick = closeModal;
  $("modalCancel").onclick = closeModal;
  $("modalSubmit").onclick = async () => {
    const button = $("modalSubmit");
    button.disabled = true;
    button.textContent = "Memproses...";
    try {
      await onSubmit();
      closeModal();
    } catch (error) {
      const errorBox = $("modalError");
      if (errorBox) errorBox.textContent = error.message;
      else toast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = submitLabel;
    }
  };
}

function closeModal() {
  $("modalBackdrop").hidden = true;
  $("modalBody").innerHTML = "";
  $("modalFooter").innerHTML = "";
}

function openVerifyModal(request) {
  const product = request.product || {};
  const expected = product.expected_amount_idr;
  if (!request.buyer_username || !request.transaction_reference) {
    toast("Data pembeli dan ID transaksi belum lengkap. Minta pembeli melengkapi melalui Choco AI.", true);
    return;
  }
  if (!expected) {
    toast("Atur harga resmi produk terlebih dahulu pada menu Produk dan harga.", true);
    return;
  }
  const body = [
    "<p>Periksa transaksi langsung di Projects.co.id. Form ini hanya mencatat hasil pemeriksaan Owner; data yang tersimpan di Supabase bukan bukti pembayaran.</p>",
    '<div class="modal-field"><label>ID transaksi yang diperiksa</label><input id="verifyOrder" class="form-input" value="' + escapeHTML(request.transaction_reference) + '" required></div>',
    '<div class="modal-field"><label>Username pembeli</label><input id="verifyBuyer" class="form-input" value="' + escapeHTML(request.buyer_username) + '" required></div>',
    '<div class="modal-field"><label>SKU produk terdaftar</label><input id="verifySku" class="form-input" value="' + escapeHTML(request.product_sku) + '" readonly></div>',
    '<div class="modal-field"><label>Harga resmi produk</label><input class="form-input" value="' + escapeHTML(money(expected)) + '" readonly></div>',
    '<div class="modal-field"><label>Nominal yang benar-benar diterima</label><input id="verifyAmount" class="form-input" type="number" min="1" step="1" value="' + escapeHTML(expected) + '" required></div>',
    '<div class="modal-field"><label>Status dana</label><select id="verifyPayment" class="select-input"><option value="funds_received">Dana sudah diterima / saldo telah masuk</option><option value="pending">Masih menunggu</option><option value="disputed">Dalam sengketa</option><option value="refunded">Dikembalikan</option></select></div>',
    '<div class="modal-field"><label>Catatan pemeriksaan</label><textarea id="verifyNote" rows="3" maxlength="500" placeholder="Catat hasil pencocokan transaksi bila diperlukan."></textarea></div>',
    '<p id="modalError" class="form-message" role="status"></p>'
  ].join("");
  openModal("Verifikasi pembayaran", body, "Simpan verifikasi", async () => {
    const amount = Number($("verifyAmount").value);
    await adminCall("verify_purchase", {
      requestId: request.id,
      orderReference: $("verifyOrder").value.trim(),
      buyerUsername: $("verifyBuyer").value.trim(),
      productSku: $("verifySku").value.trim(),
      verifiedAmountIdr: amount,
      paymentStatus: $("verifyPayment").value,
      verificationNote: $("verifyNote").value.trim()
    });
    toast("Pembayaran tercatat terverifikasi. Permintaan belum disetujui sampai kunci dialokasikan.");
    await refreshAllData();
  });
}

function openReasonModal(title, label, action, requestId, submitLabel) {
  const body = '<div class="modal-field"><label for="reasonInput">' + escapeHTML(label) + '</label><textarea id="reasonInput" rows="4" maxlength="500" placeholder="Tuliskan alasan secara singkat." required></textarea></div><p id="modalError" class="form-message" role="status"></p>';
  openModal(title, body, submitLabel, async () => {
    const reason = $("reasonInput").value.trim();
    if (!reason) throw new Error("Tuliskan alasan sebelum melanjutkan.");
    await adminCall(action, { requestId, reasonCode: reason });
    toast(action === "hold" ? "Permintaan ditahan untuk pemeriksaan lanjutan." : "Permintaan ditolak.");
    await refreshAllData();
  }, action === "reject");
}

async function handleRequestAction(action, requestId) {
  const request = state.requests.find((item) => item.id === requestId);
  if (!request) return;
  if (action === "verify") return openVerifyModal(request);
  if (action === "hold") return openReasonModal("Tahan permintaan", "Alasan penahanan", "hold", requestId, "Tahan permintaan");
  if (action === "reject") return openReasonModal("Tolak permintaan", "Alasan penolakan", "reject", requestId, "Tolak permintaan");
  if (action === "approve") {
    if (!window.confirm("Setujui permintaan dan alokasikan satu kunci pre-issued yang tersedia? Tindakan ini tidak mengungkap kunci ke panel.")) return;
    try {
      await adminCall("approve", { requestId });
      toast("Permintaan disetujui dan satu kunci telah dialokasikan.");
      await refreshAllData();
    } catch (error) { toast(error.message, true); }
  }
}

async function loadInventory() {
  const [inventoryResult, productsResult] = await Promise.all([
    adminCall("list_inventory"),
    adminCall("list_products")
  ]);
  state.inventory = inventoryResult.inventory || [];
  state.products = productsResult.products || [];
  $("inventoryProduct").innerHTML = state.products.map((product) =>
    '<option value="' + escapeHTML(product.product_id) + '" data-sku="' + escapeHTML(product.product_sku) + '">' +
    escapeHTML(product.product_name) + " · " + escapeHTML(product.product_sku) + "</option>"
  ).join("");
  const counts = {
    available: state.inventory.filter((item) => item.status === "available").length,
    assigned: state.inventory.filter((item) => item.status === "assigned").length,
    revoked: state.inventory.filter((item) => item.status === "revoked").length
  };
  $("inventorySummary").innerHTML = [
    ["available", "Kunci tersedia", counts.available],
    ["assigned", "Kunci dialokasikan", counts.assigned],
    ["revoked", "Kunci dicabut", counts.revoked],
    ["total", "Total inventaris", state.inventory.length]
  ].map(([key, label, value]) => '<div class="inventory-summary-item"><strong>' + value + '</strong><span>' + label + "</span></div>").join("");
  $("inventoryTable").innerHTML = state.inventory.length ? state.inventory.map((item) =>
    "<tr><td><span class=\"cell-main\">" + escapeHTML(shortId(item.id)) + "</span></td>" +
    "<td>" + escapeHTML(item.product_id) + "</td><td>" + escapeHTML(item.product_sku) + "</td>" +
    "<td>" + badge(item.status) + "</td><td>" + escapeHTML(dateTime(item.created_at)) + "</td>" +
    "<td>" + escapeHTML(dateTime(item.assigned_at)) + "</td></tr>"
  ).join("") : '<tr><td colspan="6" class="empty-state">Belum ada kunci lisensi di inventaris. Impor kunci pre-issued yang sah untuk mengaktifkan alokasi.</td></tr>';
}

async function importKeys(event) {
  event.preventDefault();
  const productId = $("inventoryProduct").value;
  const option = $("inventoryProduct").selectedOptions[0];
  const productSku = option?.dataset.sku || "";
  const keys = $("licenseKeys").value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (!keys.length) return;
  if (keys.length > 100) {
    $("importResult").textContent = "Maksimal 100 kunci per proses impor.";
    return;
  }
  $("importKeysButton").disabled = true;
  $("importKeysButton").textContent = "Mengimpor...";
  $("importResult").textContent = "";
  try {
    const result = await adminCall("import_preissued", { productId, productSku, licenseKeys: keys });
    const failedKeys = keys.filter((key, index) => !result.results?.[index]?.ok);
    $("licenseKeys").value = failedKeys.join("\n");
    const failures = (result.results || []).filter((item) => !item.ok).map((item) => errorText(item.error));
    $("importResult").textContent = result.imported + " kunci berhasil diimpor; " + result.failed + " gagal." +
      (failures.length ? " Rincian: " + failures.join("; ") : "");
    if (result.failed) toast(result.imported + " kunci berhasil; " + result.failed + " gagal. Kunci gagal tetap berada di kolom agar dapat diperiksa.", true);
    else toast(result.imported + " kunci berhasil ditambahkan ke inventaris.");
    await loadInventory();
    await loadDashboard();
  } catch (error) {
    $("importResult").textContent = error.message;
    toast(error.message, true);
  } finally {
    $("importKeysButton").disabled = false;
    $("importKeysButton").textContent = "Impor kunci";
  }
}

async function loadLicenses() {
  const result = await adminCall("list_licenses");
  state.licenses = result.licenses || [];
  $("licensesTable").innerHTML = state.licenses.length ? state.licenses.map((license) => {
    const request = license.request || {};
    let actions = "";
    if (license.status === "active") {
      actions = '<button class="button button-outline button-small" data-license-action="suspended" data-id="' + escapeHTML(license.id) + '">Tangguhkan</button><button class="button button-danger button-small" data-license-action="revoked" data-id="' + escapeHTML(license.id) + '">Cabut</button>';
    } else if (license.status === "suspended") {
      actions = '<button class="button button-primary button-small" data-license-action="active" data-id="' + escapeHTML(license.id) + '">Aktifkan</button><button class="button button-danger button-small" data-license-action="revoked" data-id="' + escapeHTML(license.id) + '">Cabut</button>';
    } else {
      actions = '<span class="cell-sub">Tidak dapat diaktifkan kembali</span>';
    }
    return "<tr><td><span class=\"cell-main\">" + escapeHTML(shortId(license.id)) + "</span><span class=\"cell-sub\">Permintaan " + escapeHTML(shortId(license.request_id)) + "</span></td>" +
      "<td>" + escapeHTML(request.buyer_username || "—") + "</td><td><span class=\"cell-main\">" + escapeHTML(license.product_id) + "</span><span class=\"cell-sub\">" + escapeHTML(license.product_sku) + "</span></td>" +
      "<td>" + badge(license.status) + "</td><td>" + escapeHTML(dateTime(license.activated_at)) + "</td><td>" + escapeHTML(dateTime(license.expires_at)) + "</td>" +
      "<td><div class=\"table-actions\">" + actions + "</div></td></tr>";
  }).join("") : '<tr><td colspan="7" class="empty-state">Belum ada lisensi yang dialokasikan.</td></tr>';
}

async function setLicenseStatus(licenseId, status) {
  const labels = { active: "mengaktifkan", suspended: "menangguhkan", revoked: "mencabut" };
  const irreversible = status === "revoked" ? " Tindakan pencabutan bersifat permanen." : "";
  if (!window.confirm("Anda akan " + labels[status] + " lisensi ini." + irreversible + " Lanjutkan?")) return;
  try {
    await adminCall("set_license_status", { licenseId, status, reasonCode: "owner_panel_action" });
    toast("Status lisensi berhasil diperbarui.");
    await loadLicenses();
    await loadDashboard();
  } catch (error) { toast(error.message, true); }
}

async function loadEvents() {
  const result = await adminCall("list_events");
  state.events = result.events || [];
  $("eventsTable").innerHTML = state.events.length ? state.events.map((event) =>
    "<tr><td>" + escapeHTML(dateTime(event.created_at)) + "</td>" +
    "<td><span class=\"cell-main\">" + escapeHTML(event.event_type) + "</span></td>" +
    "<td>" + escapeHTML(shortId(event.request_id)) + "</td><td>" + escapeHTML(shortId(event.license_id)) + "</td>" +
    "<td><span class=\"cell-sub\">" + escapeHTML(JSON.stringify(event.details || {})) + "</span></td></tr>"
  ).join("") : '<tr><td colspan="5" class="empty-state">Belum ada aktivitas tercatat.</td></tr>';
}


async function loadAppControl() {
  const result = await postJSON(API_APP_CONTROL, { action: "get" });
  const config = result.config || result;
  $("appControlEnabled").checked = config.enabled === true;
  const features = config.features || {};
  $("featureProducts").checked = features.products !== false;
  $("featureStock").checked = features.stock !== false;
  $("featureSales").checked = features.sales !== false;
  $("featureReports").checked = features.reports !== false;
  $("featureSettings").checked = features.settings !== false;
  const notice = config.notification || {};
  $("notificationEnabled").checked = notice.enabled === true;
  $("notificationTitle").value = notice.title || "";
  $("notificationBody").value = notice.body || "";
  $("notificationLevel").value = notice.level || "info";
  const update = config.update || {};
  $("latestVersion").value = update.latestVersion || "1.0.0";
  $("minimumVersion").value = update.minimumVersion || "1.0.0";
  $("updateUrl").value = update.url || "";
  $("updateNotes").value = update.notes || "";
  $("appControlRevision").textContent = "Revisi " + String(config.revision || 1);
  $("appControlStatus").textContent = config.updatedAt ? "Terakhir diperbarui: " + dateTime(config.updatedAt) : "Konfigurasi server berhasil dimuat.";
}

async function saveAppControl(event) {
  event.preventDefault();
  const button = $("saveAppControl");
  button.disabled = true;
  button.textContent = "Mengirim perubahan...";
  $("appControlStatus").textContent = "";
  const payload = {
    action: "update",
    enabled: $("appControlEnabled").checked,
    features: {
      dashboard: true,
      products: $("featureProducts").checked,
      stock: $("featureStock").checked,
      sales: $("featureSales").checked,
      reports: $("featureReports").checked,
      settings: $("featureSettings").checked
    },
    notificationEnabled: $("notificationEnabled").checked,
    notificationTitle: $("notificationTitle").value,
    notificationBody: $("notificationBody").value,
    notificationLevel: $("notificationLevel").value,
    latestVersion: $("latestVersion").value.trim(),
    minimumVersion: $("minimumVersion").value.trim(),
    updateUrl: $("updateUrl").value.trim(),
    updateNotes: $("updateNotes").value
  };
  try {
    const result = await postJSON(API_APP_CONTROL, payload);
    const config = result.config || {};
    $("appControlRevision").textContent = "Revisi " + String(config.revision || "baru");
    $("appControlStatus").textContent = "Berhasil dikirim ke server TCS. Aplikasi desktop akan menerima perubahan otomatis.";
    toast("Pengaturan aplikasi berhasil dikirim ke server TCS.");
  } catch (error) {
    $("appControlStatus").textContent = error.message;
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Simpan dan kirim ke aplikasi";
  }
}

async function loadPayments() {
  const response = await fetch(API_PAYMENTS, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) throw new Error(errorText(result.error || "payment_records_unavailable"));
  state.payments = Array.isArray(result.transactions) ? result.transactions : [];
  $("paymentCount").textContent = String(result.totals?.count ?? state.payments.length);
  $("paymentPending").textContent = String(result.totals?.pending ?? 0);
  $("paymentRevenue").textContent = money(result.totals?.paid ?? 0);
  $("paymentsTable").innerHTML = state.payments.length ? state.payments.map((payment) =>
    "<tr><td><span class=\"cell-main\">" + escapeHTML(payment.order_id) + "</span><span class=\"cell-sub\">" +
    escapeHTML(shortId(payment.midtrans_transaction_id)) + "</span></td>" +
    "<td><span class=\"cell-main\">" + escapeHTML(payment.product_name) + "</span><span class=\"cell-sub\">" +
    escapeHTML(payment.product_sku) + "</span></td>" +
    "<td><span class=\"cell-main\">" + escapeHTML(payment.customer_name || "—") + "</span><span class=\"cell-sub\">" +
    escapeHTML(payment.customer_email || "—") + "</span></td>" +
    "<td>" + escapeHTML(money(payment.amount_idr)) + "</td>" +
    "<td>" + escapeHTML(payment.payment_type || "—") + "</td>" +
    "<td>" + badge(payment.transaction_status) + "</td>" +
    "<td>" + badge(payment.license_status || "not_linked") + "</td>" +
    "<td>" + escapeHTML(dateTime(payment.paid_at || payment.created_at)) + "</td></tr>"
  ).join("") : '<tr><td colspan="8" class="empty-state">Belum ada transaksi Midtrans.</td></tr>';
}

async function loadProducts() {
  const result = await adminCall("list_products");
  state.products = result.products || [];
  $("productsList").innerHTML = state.products.length ? state.products.map((product) =>
    '<article class="product-card"><p class="eyebrow">PRODUK TERDAFTAR</p><h2>' + escapeHTML(product.product_name) + '</h2>' +
    '<p class="product-sku">ID: ' + escapeHTML(product.product_id) + ' · SKU: ' + escapeHTML(product.product_sku) + '</p>' +
    '<div class="modal-field"><label>Harga resmi (IDR)</label><div class="product-price"><input class="form-input" id="price-' + escapeHTML(product.product_id) + '" type="number" min="1" step="1" value="' + (product.expected_amount_idr ?? "") + '" placeholder="Masukkan harga resmi"><button class="button button-primary" data-save-price="' + escapeHTML(product.product_id) + '" type="button">Simpan</button></div></div>' +
    '<p class="price-note">' + (product.expected_amount_idr ? "Harga ini menjadi acuan pencocokan nominal pembayaran." : "Harga belum dikonfigurasi. Verifikasi pembayaran dan persetujuan lisensi akan ditolak sampai harga resmi ditetapkan.") + '</p>' +
    '<p class="price-note">Status produk: ' + (product.active ? "Aktif" : "Nonaktif") + " · Mata uang: " + escapeHTML(product.currency || "IDR") + "</p></article>"
  ).join("") : '<p class="empty-state">Belum ada produk yang terdaftar.</p>';
}

async function saveProductPrice(productId) {
  const input = $("price-" + productId);
  const amount = Number(input?.value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    toast("Masukkan harga resmi dalam rupiah berupa bilangan bulat positif.", true);
    return;
  }
  if (!window.confirm("Tetapkan " + money(amount) + " sebagai harga resmi produk ini?")) return;
  try {
    await adminCall("set_product_price", { productId, expectedAmountIdr: amount });
    toast("Harga resmi produk berhasil diperbarui.");
    await loadProducts();
    await loadDashboard();
  } catch (error) { toast(error.message, true); }
}

async function refreshAllData() {
  await Promise.all([loadDashboard(), loadRequests()]);
  if (state.view !== "overview" && state.view !== "requests") await loadView(state.view);
}

function bindEvents() {
  $("appControlForm").addEventListener("submit", saveAppControl);
  $("reloadAppControl").addEventListener("click", () => loadAppControl().then(() => toast("Pengaturan server berhasil dimuat.")).catch((e) => toast(e.message, true)));
  $("loginForm").addEventListener("submit", login);
  $("toggleCredential").addEventListener("click", () => {
    const input = $("ownerCredential");
    input.type = input.type === "password" ? "text" : "password";
    $("toggleCredential").textContent = input.type === "password" ? "Lihat" : "Sembunyikan";
  });
  $("logoutButton").addEventListener("click", logout);
  $("refreshAll").addEventListener("click", () => refreshAllData().then(() => toast("Data berhasil diperbarui.")).catch((e) => toast(e.message, true)));
  $("sidebarToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  $("modalClose").addEventListener("click", closeModal);
  $("modalBackdrop").addEventListener("click", (event) => { if (event.target === $("modalBackdrop")) closeModal(); });
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.go)));
  $("requestSearch").addEventListener("input", renderRequests);
  $("requestFilter").addEventListener("change", renderRequests);
  $("requestsTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button) handleRequestAction(button.dataset.action, button.dataset.id);
  });
  $("inventoryImportForm").addEventListener("submit", importKeys);
  $("licensesTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-license-action]");
    if (button) setLicenseStatus(button.dataset.id, button.dataset.licenseAction);
  });
  $("productsList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-save-price]");
    if (button) saveProductPrice(button.dataset.savePrice);
  });
  $("refreshPage").addEventListener("click", () => loadView(state.view).catch((e) => toast(e.message, true)));
}

async function initialize() {
  bindEvents();
  try {
    const result = await authCall("verify");
    if (result.authenticated) {
      showApp();
      setView("overview");
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

initialize();
