const $ = (id) => document.getElementById(id);
const money = (amount) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount || 0);
const statusLabels = {
  pending: "Menunggu pembayaran", settlement: "Pembayaran berhasil", capture: "Pembayaran berhasil",
  deny: "Pembayaran ditolak", cancel: "Transaksi dibatalkan", expire: "Transaksi kedaluwarsa",
  refund: "Dana dikembalikan", partial_refund: "Pengembalian sebagian", challenge: "Sedang diperiksa", failure: "Gagal"
};

let products = [];
let snapReady = false;

function showMessage(message, type = "info") {
  const el = $("message");
  el.textContent = message;
  el.dataset.type = type;
  el.hidden = false;
}

async function getJSON(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) throw new Error(data.error || "Permintaan tidak dapat diproses.");
  return data;
}

function selectedProduct() {
  return products.find((item) => item.productId === $("product").value) || null;
}

function updatePrice() {
  const product = selectedProduct();
  $("price").textContent = product && product.amountIdr ? money(product.amountIdr) : "Harga belum tersedia";
  $("payButton").disabled = !product || !product.amountIdr;
}

async function loadCatalog() {
  const data = await getJSON("/api/payments/catalog");
  products = data.products || [];
  const requested = new URLSearchParams(location.search).get("product");
  $("product").innerHTML = products.map((item) =>
    '<option value="' + item.productId.replace(/[^a-z0-9_-]/gi, "") + '">' +
    item.name.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])) +
    (item.amountIdr ? " · " + money(item.amountIdr) : " · Harga belum diatur") + "</option>"
  ).join("");
  if (requested && products.some((item) => item.productId === requested)) $("product").value = requested;
  if (!products.length) {
    $("product").innerHTML = '<option value="">Belum ada produk aktif</option>';
    showMessage("Belum ada produk dengan harga aktif. Harga resmi perlu ditetapkan melalui Panel Admin TCS.", "warning");
  }
  updatePrice();
}

async function loadSnap() {
  if (snapReady && window.snap) return;
  const config = await getJSON("/api/payments/config");
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = config.snapScriptUrl;
    script.dataset.clientKey = config.clientKey;
    script.setAttribute("data-client-key", config.clientKey);
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  if (!window.snap) throw new Error("Komponen pembayaran Midtrans belum siap.");
  snapReady = true;
}

async function checkStatus(orderId, attempts = 0) {
  try {
    const result = await getJSON("/api/payments/status?orderId=" + encodeURIComponent(orderId));
    const label = statusLabels[result.status] || result.status;
    if (["settlement", "capture"].includes(result.status)) {
      showMessage("Pembayaran berhasil dikonfirmasi oleh Midtrans. Simpan ID pesanan " + orderId + " untuk referensi.", "success");
      return;
    }
    if (["deny", "cancel", "expire", "refund", "partial_refund", "failure"].includes(result.status)) {
      showMessage("Status pesanan " + orderId + ": " + label + ".", "warning");
      return;
    }
    if (attempts < 24) window.setTimeout(() => checkStatus(orderId, attempts + 1), 5000);
  } catch {
    if (attempts < 6) window.setTimeout(() => checkStatus(orderId, attempts + 1), 5000);
  }
}

async function submitCheckout(event) {
  event.preventDefault();
  const product = selectedProduct();
  if (!product || !product.amountIdr) return;
  const button = $("payButton");
  button.disabled = true;
  button.textContent = "Menyiapkan pembayaran...";
  $("message").hidden = true;
  try {
    const result = await getJSON("/api/payments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.productId,
        customerName: $("customerName").value.trim(),
        customerEmail: $("customerEmail").value.trim(),
        customerPhone: $("customerPhone").value.trim()
      })
    });
    showMessage("Pesanan " + result.orderId + " berhasil dibuat. Selesaikan pembayaran pada halaman Midtrans.", "info");
    await loadSnap();
    window.snap.pay(result.token, {
      onSuccess: () => {
        showMessage("Pembayaran diterima. Sistem sedang memverifikasi status transaksi.", "success");
        checkStatus(result.orderId);
      },
      onPending: () => {
        showMessage("Pembayaran belum selesai. Selesaikan sesuai instruksi metode pembayaran Anda.", "info");
        checkStatus(result.orderId);
      },
      onError: () => {
        showMessage("Midtrans melaporkan kendala pembayaran. Periksa status pesanan sebelum mencoba ulang.", "warning");
        checkStatus(result.orderId);
      },
      onClose: () => {
        showMessage("Jendela pembayaran ditutup. Status pesanan tetap dapat diperiksa menggunakan ID " + result.orderId + ".", "info");
        checkStatus(result.orderId);
      }
    });
  } catch (error) {
    const messages = {
      payment_backend_not_configured: "Konfigurasi backend pembayaran belum lengkap.",
      payment_frontend_not_configured: "Client Key Midtrans belum dikonfigurasi.",
      product_price_not_configured: "Harga produk belum ditetapkan oleh Owner.",
      product_unavailable: "Produk tidak tersedia."
    };
    showMessage(messages[error.message] || "Pembayaran belum dapat dibuat. Silakan coba kembali beberapa saat lagi.", "warning");
  } finally {
    button.disabled = false;
    button.textContent = "Lanjutkan pembayaran";
    updatePrice();
  }
}

$("product").addEventListener("change", updatePrice);
$("checkoutForm").addEventListener("submit", submitCheckout);
loadCatalog().catch(() => showMessage("Katalog produk belum dapat dimuat. Silakan coba kembali.", "warning"));
