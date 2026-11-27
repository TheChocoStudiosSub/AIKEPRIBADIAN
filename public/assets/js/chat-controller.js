const form = document.getElementById("form");
    const input = document.getElementById("message");
    const send = document.getElementById("send");
    const messages = document.getElementById("messages");
    const welcome = document.getElementById("welcome");
    const chatScroll = document.getElementById("chatScroll");
    const recentList = document.getElementById("recentList");
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");
    const toast = document.getElementById("toast");

    function getSelectedResponseLanguage() {
      const selected = String(document.documentElement.lang || "id").toLowerCase();
      if (selected.startsWith("en")) return "en";
      if (selected.startsWith("zh")) return "zh";
      return "id";
    }

    const CONVERSATION_STORAGE_KEY = "chocoCurrentConversationV1";
    try { localStorage.removeItem(CONVERSATION_STORAGE_KEY); } catch {}
    let history = [];
    const modelMode = "standard";
    let busy = false;
    let cooldownUntil = 0;
    let cooldownTimer = null;
    let toastTimer;
    const COOLDOWN_STATE_KEY = "chocoSendPacingV1";
    const COOLDOWN_IDLE_RESET_MS = 30 * 60 * 1000;
    let cooldownLevel = 0;
    let cooldownLastSentAt = 0;
    try {
      const pacingState = JSON.parse(localStorage.getItem(COOLDOWN_STATE_KEY) || "null");
      const lastSentAt = Number(pacingState && pacingState.lastSentAt);
      if (Number.isFinite(lastSentAt) && lastSentAt > 0 && Date.now() - lastSentAt <= COOLDOWN_IDLE_RESET_MS) {
        cooldownLevel = Math.min(6, Math.max(0, Math.floor(Number(pacingState.level) || 0)));
        cooldownLastSentAt = lastSentAt;
      } else {
        localStorage.removeItem(COOLDOWN_STATE_KEY);
      }
    } catch {}
    let conversationTitle = "";
    let conversationStarted = false;
    const defaultPreferences = { ageGroup: "unset", responseLength: "balanced", typingEffect: true, timeGreeting: true, tonePreference: "adaptive", detailPreference: "adaptive", humorPreference: true, emojiPreference: false };
    let preferences = { ...defaultPreferences };
    function loadPreferences() {
      try { preferences = { ...defaultPreferences, ...JSON.parse(localStorage.getItem("chocoPreferences") || "{}") }; } catch { preferences = { ...defaultPreferences }; }
      Object.keys(defaultPreferences).forEach(key => { const el = document.getElementById(key); if (el) el.type === "checkbox" ? el.checked = Boolean(preferences[key]) : el.value = preferences[key]; });
    }
    function savePreferenceFields(keys) {
      keys.forEach(key => { const el = document.getElementById(key); if (el) preferences[key] = el.type === "checkbox" ? el.checked : el.value; });
      try { localStorage.setItem("chocoPreferences", JSON.stringify(preferences)); showToast("Preferensi berhasil disimpan."); } catch { showToast("Preferensi tidak bisa disimpan di browser."); }
    }
    function openPanel(name) { document.getElementById(name + "Backdrop").hidden = false; }
    document.querySelectorAll("[data-open-panel]").forEach(button => button.addEventListener("click", () => openPanel(button.dataset.openPanel)));
    document.querySelectorAll("[data-close-panel]").forEach(button => button.addEventListener("click", () => button.closest(".modal-backdrop").hidden = true));
    document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.hidden = true; }));
    const saveSettingsButton = document.getElementById("saveSettings");
    if (saveSettingsButton) saveSettingsButton.addEventListener("click", () => { document.getElementById("settingsBackdrop").hidden = true; });
    document.getElementById("savePersonality").addEventListener("click", () => { savePreferenceFields(["tonePreference","detailPreference","humorPreference","emojiPreference"]); document.getElementById("sitePreferenceBackdrop").hidden = true; });
    function updateSendCooldown() {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      if (!busy) send.disabled = remaining > 0;
      send.innerHTML = remaining > 0 ? String(remaining) : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 11.6 19.1 4.8c.7-.3 1.4.4 1.1 1.1l-6.8 14.6c-.3.7-1.3.6-1.5-.2l-1.5-6.1-6.1-1.5c-.8-.2-.9-1.2-.3-1.5Z"></path><path d="m10.4 13.6 9.3-8.9"></path></svg>';
      send.title = remaining > 0 ? "Tunggu " + remaining + " detik sebelum mengirim pesan berikutnya." : "Kirim pesan";
      send.setAttribute("aria-label", remaining > 0 ? "Tunggu " + remaining + " detik" : "Kirim pesan");
      if (remaining <= 0 && cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
    }
    function startSendCooldown() {
      const now = Date.now();
      if (cooldownLastSentAt && now - cooldownLastSentAt > COOLDOWN_IDLE_RESET_MS) cooldownLevel = 0;

      const cooldownMs = Math.min(12000 + cooldownLevel * 8000, 60000);
      cooldownLevel = Math.min(cooldownLevel + 1, 6);
      cooldownLastSentAt = now;
      cooldownUntil = now + cooldownMs;

      try {
        localStorage.setItem("chocoNextAllowedAt", String(cooldownUntil));
        localStorage.setItem(COOLDOWN_STATE_KEY, JSON.stringify({ level: cooldownLevel, lastSentAt: cooldownLastSentAt }));
      } catch {}

      if (cooldownTimer) clearInterval(cooldownTimer);
      updateSendCooldown();
      cooldownTimer = setInterval(updateSendCooldown, 250);
    }
    try { cooldownUntil = Math.max(0, Number(localStorage.getItem("chocoNextAllowedAt") || 0)); } catch {}
    if (cooldownUntil > Date.now()) cooldownTimer = setInterval(updateSendCooldown, 250);
    else cooldownUntil = 0;
    updateSendCooldown();

    document.addEventListener("keydown", event => { if (event.key === "Escape") document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.hidden = true); });
    loadPreferences();
    function updateWelcomeGreeting() {
      const heading = document.getElementById("welcomeHeading");
      if (!heading) return;
      if (!preferences.timeGreeting) { heading.textContent = "Selamat datang di Choco AI"; return; }
      const hour = new Date().getHours();
      const greeting = hour < 4 ? "Selamat malam" : hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
      heading.replaceChildren(document.createTextNode(greeting + ", "), Object.assign(document.createElement("span"), { className: "gradient-text", textContent: "selamat datang di Choco AI" }));
    }
    updateWelcomeGreeting();

    async function handleTcsLicenseRequest() {
      const STORAGE_KEY = "tcs_license_request";
      const url = new URL(window.location.href);
      const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
      const urlRequestId = fragment.get("license_request") || url.searchParams.get("license_request") || "";
      const urlRequestToken = fragment.get("license_token") || url.searchParams.get("license_token") || "";
      if (urlRequestId || urlRequestToken) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(urlRequestId) || urlRequestToken.length < 20 || urlRequestToken.length > 200) {
          showToast("Tautan permintaan lisensi tidak valid.");
          return;
        }
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          requestId: urlRequestId,
          requestToken: urlRequestToken,
          submitted: false,
          savedAt: Date.now()
        }));
        url.searchParams.delete("license_request");
        url.searchParams.delete("license_token");
        url.hash = "";
        window.history.replaceState({}, document.title, url.pathname + url.search);
      }

      let saved;
      try { saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); } catch { saved = null; }
      if (!saved || !saved.requestId || !saved.requestToken) return;
      const { requestId, requestToken } = saved;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) || requestToken.length < 20 || requestToken.length > 200) {
        sessionStorage.removeItem(STORAGE_KEY);
        showToast("Data sesi permintaan lisensi tidak valid.");
        return;
      }

      const licenseMessage = document.createElement("article");
      licenseMessage.className = "message assistant license-request-message";
      const licenseAvatar = document.createElement("div");
      licenseAvatar.className = "ai-avatar";
      licenseAvatar.appendChild(createChocoAvatar());
      const licenseBody = document.createElement("div");
      licenseBody.className = "message-body";
      const licenseTitle = document.createElement("strong");
      licenseTitle.textContent = "Permintaan lisensi TCS";
      const licenseDescription = document.createElement("p");
      licenseDescription.textContent = "Permintaan ini ditinjau secara manual oleh Owner. Lengkapi identitas pembeli dan referensi transaksi dari kanal pembayaran yang digunakan. Jangan mengirim kata sandi atau data kartu.";
      licenseDescription.style.cssText = "margin:8px 0 12px;color:#aab4ce;line-height:1.6";
      const referenceForm = document.createElement("form");
      referenceForm.style.cssText = "display:grid;gap:9px;max-width:520px";
      const buyerLabel = document.createElement("label");
      buyerLabel.textContent = "Identitas pembeli / akun pembayaran";
      buyerLabel.style.cssText = "font-size:12px;color:#dce4f4";
      const buyerInput = document.createElement("input");
      buyerInput.type = "text";
      buyerInput.required = true;
      buyerInput.minLength = 3;
      buyerInput.maxLength = 80;
      buyerInput.autocomplete = "username";
      buyerInput.placeholder = "Masukkan identitas pembeli";
      buyerInput.pattern = "[A-Za-z0-9._-]{3,80}";
      buyerInput.style.cssText = "width:100%;padding:11px;border:1px solid rgba(135,148,191,.25);border-radius:9px;background:#0c1220;color:#eef2ff";
      const referenceLabel = document.createElement("label");
      referenceLabel.textContent = "ID transaksi / referensi pembayaran";
      referenceLabel.style.cssText = "font-size:12px;color:#dce4f4;margin-top:3px";
      const referenceInput = document.createElement("input");
      referenceInput.type = "text";
      referenceInput.required = true;
      referenceInput.minLength = 4;
      referenceInput.maxLength = 120;
      referenceInput.autocomplete = "off";
      referenceInput.placeholder = "Masukkan ID transaksi atau referensi pembayaran";
      referenceInput.style.cssText = "width:100%;padding:11px;border:1px solid rgba(135,148,191,.25);border-radius:9px;background:#0c1220;color:#eef2ff";
      const formActions = document.createElement("div");
      formActions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
      const referenceButton = document.createElement("button");
      referenceButton.type = "submit";
      referenceButton.textContent = "Kirim referensi transaksi";
      referenceButton.style.cssText = "padding:10px 14px;border:0;border-radius:9px;background:linear-gradient(110deg,#648bff,#a76cff);color:white;cursor:pointer";
      const checkButton = document.createElement("button");
      checkButton.type = "button";
      checkButton.textContent = "Periksa status";
      checkButton.style.cssText = "padding:10px 14px;border:1px solid rgba(135,148,191,.3);border-radius:9px;background:transparent;color:#dce4f4;cursor:pointer";
      formActions.append(referenceButton, checkButton);
      const referenceStatus = document.createElement("p");
      referenceStatus.setAttribute("role", "status");
      referenceStatus.style.cssText = "margin:9px 0 0;color:#aab4ce;font-size:12px;line-height:1.6";
      const keyContainer = document.createElement("div");
      keyContainer.style.cssText = "display:none;margin-top:14px;padding:14px;border:1px solid rgba(115,199,160,.3);border-radius:12px;background:rgba(37,104,78,.12)";
      referenceForm.append(buyerLabel, buyerInput, referenceLabel, referenceInput, formActions, referenceStatus, keyContainer);
      licenseBody.append(licenseTitle, licenseDescription, referenceForm);
      licenseMessage.append(licenseAvatar, licenseBody);
      messages.appendChild(licenseMessage);

      let pollTimer = null;
      let checking = false;
      let deliveredKey = "";
      const updateSaved = () => sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      const stopPolling = () => {
        if (pollTimer) window.clearInterval(pollTimer);
        pollTimer = null;
      };
      const showKey = (key) => {
        deliveredKey = key;
        keyContainer.style.display = "block";
        keyContainer.replaceChildren();
        const label = document.createElement("p");
        label.textContent = "Kunci lisensi telah tersedia. Simpan kunci ini di tempat yang aman.";
        label.style.cssText = "margin:0 0 9px;color:#bde8d2;font-size:12px";
        const code = document.createElement("code");
        code.textContent = key;
        code.style.cssText = "display:block;padding:11px;border-radius:8px;background:rgba(0,0,0,.25);color:#f0fff7;font-size:13px;overflow-wrap:anywhere;user-select:all";
        const copy = document.createElement("button");
        copy.type = "button";
        copy.textContent = "Salin kunci lisensi";
        copy.style.cssText = "margin-top:10px;padding:9px 12px;border:0;border-radius:8px;background:#79c9a2;color:#10251c;font-weight:700;cursor:pointer";
        copy.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(deliveredKey);
            copy.textContent = "Kunci berhasil disalin";
          } catch {
            const range = document.createRange();
            range.selectNodeContents(code);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            copy.textContent = "Pilih teks kunci lalu salin";
          }
        });
        keyContainer.append(label, code, copy);
      };

      const refreshStatus = async (silent = false) => {
        if (checking) return;
        checking = true;
        if (!silent) checkButton.disabled = true;
        try {
          const response = await fetch("/api/license", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ action: "status", requestId, requestToken })
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) throw new Error(data.error || "Status permintaan tidak dapat diperiksa.");
          if (data.buyerDetailsReceived) {
            saved.submitted = true;
            updateSaved();
            buyerInput.disabled = true;
            referenceInput.disabled = true;
            referenceButton.disabled = true;
            referenceButton.textContent = "Referensi transaksi terkirim";
          }
          if (data.status === "approved" && data.verificationStatus === "verified") {
            referenceStatus.textContent = "Pembayaran telah diverifikasi dan permintaan disetujui. Mengambil kunci lisensi dari penyimpanan aman...";
            const delivery = await fetch("/api/license", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({ action: "deliver", requestId, requestToken })
            });
            const delivered = await delivery.json().catch(() => ({}));
            if (delivery.ok && delivered.ok && delivered.licenseKey) {
              showKey(delivered.licenseKey);
              referenceStatus.textContent = "Lisensi berhasil dialokasikan dan diambil dari Supabase.";
              stopPolling();
              showToast("Lisensi telah disetujui dan kunci tersedia.");
            } else if (["license_suspended", "license_revoked"].includes(delivered.error)) {
              referenceStatus.textContent = delivered.error === "license_suspended"
                ? "Lisensi sedang ditangguhkan. Hubungi The Choco Studios untuk pemeriksaan."
                : "Lisensi telah dicabut dan tidak dapat digunakan.";
              stopPolling();
            } else {
              referenceStatus.textContent = "Pembayaran sudah terverifikasi. Kunci sedang menunggu proses alokasi.";
            }
          } else if (data.status === "rejected") {
            referenceStatus.textContent = "Permintaan lisensi ditolak. " + (data.verificationNote ? "Alasan: " + data.verificationNote : "Silakan hubungi The Choco Studios untuk informasi lebih lanjut.");
            stopPolling();
            sessionStorage.removeItem(STORAGE_KEY);
          } else if (data.status === "expired") {
            referenceStatus.textContent = "Masa berlaku permintaan lisensi telah berakhir. Buat permintaan baru dari aplikasi produk.";
            stopPolling();
            sessionStorage.removeItem(STORAGE_KEY);
          } else if (data.verificationStatus === "hold") {
            referenceStatus.textContent = "Permintaan ditahan untuk pemeriksaan tambahan. " + (data.verificationNote ? "Alasan: " + data.verificationNote : "Belum ada kunci yang dialokasikan.");
          } else if (data.verificationStatus === "verified") {
            referenceStatus.textContent = "Pembayaran telah diverifikasi. Permintaan menunggu persetujuan dan alokasi kunci oleh Owner.";
          } else if (data.buyerDetailsReceived) {
            referenceStatus.textContent = "Data pembelian diterima. Tim The Choco Studios akan mencocokkan transaksi dan memastikan dana telah diterima.";
          } else {
            referenceStatus.textContent = "Lengkapi identitas pembeli dan referensi transaksi agar permintaan dapat diperiksa.";
          }
          if (data.status === "pending" && (data.buyerDetailsReceived || saved.submitted) && !pollTimer) {
            pollTimer = window.setInterval(() => refreshStatus(true), 20000);
          }
        } catch (error) {
          if (!silent) referenceStatus.textContent = error.message || "Status belum dapat diperiksa. Coba kembali.";
        } finally {
          checking = false;
          checkButton.disabled = false;
          scrollToBottom();
        }
      };

      referenceForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const buyerUsername = buyerInput.value.trim();
        const transactionReference = referenceInput.value.trim();
        if (!/^[A-Za-z0-9._-]{3,80}$/.test(buyerUsername) || transactionReference.length < 4 || transactionReference.length > 120) {
          referenceStatus.textContent = "Periksa kembali username dan ID transaksi yang dimasukkan.";
          return;
        }
        referenceButton.disabled = true;
        buyerInput.disabled = true;
        referenceInput.disabled = true;
        referenceStatus.textContent = "Mengirim data pembelian ke server lisensi...";
        try {
          const response = await fetch("/api/license", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ action: "submit_purchase_reference", requestId, requestToken, buyerUsername, transactionReference })
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.ok || !result.submitted) throw new Error(result.error || "Data pembelian belum berhasil disimpan.");
          saved.submitted = true;
          updateSaved();
          referenceButton.textContent = "Data pembelian terkirim";
          referenceStatus.textContent = "Referensi transaksi berhasil diterima. Owner TCS akan memeriksanya secara manual.";
          await refreshStatus(true);
        } catch (error) {
          referenceStatus.textContent = error.message || "Data pembelian gagal dikirim. Silakan coba lagi.";
          referenceButton.disabled = false;
          buyerInput.disabled = false;
          referenceInput.disabled = false;
        }
        scrollToBottom();
      });

      checkButton.addEventListener("click", () => refreshStatus(false));
      if (saved.submitted) {
        buyerInput.disabled = true;
        referenceInput.disabled = true;
        referenceButton.disabled = true;
        referenceButton.textContent = "Data pembelian terkirim";
      }
      await refreshStatus(false);
      showToast("Permintaan lisensi terhubung. Lengkapi data pembelian untuk memulai pemeriksaan.");
    }
    handleTcsLicenseRequest();


    function showToast(message) {
      toast.textContent = message;
      toast.classList.add("show");

      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove("show");
      }, 5000);
    }

    function scrollToBottom() {
      requestAnimationFrame(() => {
        chatScroll.scrollTop = chatScroll.scrollHeight;
      });
    }

    function closeSidebar() {
      sidebar.classList.remove("open");
      sidebarOverlay.classList.remove("open");
    }

    function openSidebar() {
      sidebar.classList.add("open");
      sidebarOverlay.classList.add("open");
    }

    document.getElementById("menuButton").addEventListener("click", openSidebar);
    sidebarOverlay.addEventListener("click", closeSidebar);

    function createChocoAvatar(label = "Logo Choco AI") {
      const image = document.createElement("img");
      image.src = "/assets/choco-app-icon.png?v=20261121"; image.alt = label; image.width = 32; image.height = 32;
      return image;
    }

    function renderAssistantText(container, text) {
      container.replaceChildren();
      const pattern = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>()]+|\*\*[^*]+\*\*|`[^`]+`)/g;
      let cursor = 0; const source = String(text);
      for (const match of source.matchAll(pattern)) {
        const token = match[0]; const index = match.index ?? 0;
        if (index > cursor) container.appendChild(document.createTextNode(source.slice(cursor, index)));
        const markdownLink = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (markdownLink) {
          const anchor = document.createElement("a"); anchor.className = "assistant-link"; anchor.href = markdownLink[2]; anchor.target = "_blank";
          anchor.rel = "noopener noreferrer"; anchor.textContent = markdownLink[1]; container.appendChild(anchor);
        } else if (/^https?:\/\//i.test(token)) {
          const cleanUrl = token.replace(/[.,!?;:]+$/, ""); const anchor = document.createElement("a");
          anchor.className = "assistant-link"; anchor.href = cleanUrl; anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; anchor.textContent = cleanUrl; container.appendChild(anchor);
          if (cleanUrl.length < token.length) container.appendChild(document.createTextNode(token.slice(cleanUrl.length)));
        } else if (token.startsWith("**")) {
          const strong = document.createElement("strong"); strong.textContent = token.slice(2, -2); container.appendChild(strong);
        } else { const code = document.createElement("code"); code.textContent = token.slice(1, -1); container.appendChild(code); }
        cursor = index + token.length;
      }
      if (cursor < source.length) container.appendChild(document.createTextNode(source.slice(cursor)));
    }
    function addMessage(text, role, options = {}) {
      const wrapper = document.createElement("article");
      wrapper.className = "message " + role;

      if (options.error) {
        wrapper.classList.add("error");
      }

      if (role === "assistant") {
        const avatar = document.createElement("div");
        avatar.className = "ai-avatar";
        avatar.appendChild(createChocoAvatar());

        const body = document.createElement("div");
        body.className = "message-body";

        const name = document.createElement("span");
        name.className = "message-name";
        name.textContent = "Choco AI";

        const content = document.createElement("div");
        renderAssistantText(content, text);

        body.append(name, content);
        wrapper.append(avatar, body);

        if (options.typing) {
          content.textContent = "";

          const dots = document.createElement("div");
          dots.className = "typing";
          dots.innerHTML = "<span></span><span></span><span></span>";
          content.appendChild(dots);
        }
      } else {
        const body = document.createElement("div");
        body.className = "message-body";
        body.textContent = text;
        wrapper.appendChild(body);
      }

      messages.appendChild(wrapper);
      scrollToBottom();
      return wrapper;
    }

    async function revealReply(text) {
      const wrapper = addMessage("", "assistant");
      const content = wrapper.querySelector(".message-body > div:last-child");
      if (!preferences.typingEffect) { renderAssistantText(content, text); return; }
      for (let i = 0; i < text.length; i += 4) {
        renderAssistantText(content, text.slice(0, i + 4));
        scrollToBottom();
        await new Promise(resolve => setTimeout(resolve, 12));
      }
    }
    function updateRecentTitle(title) {
      if (!conversationStarted) {
        conversationStarted = true;
        conversationTitle = title.slice(0, 36);

        recentList.replaceChildren();

        const item = document.createElement("div");
        item.className = "recent-item";
        item.textContent = conversationTitle;
        item.title = conversationTitle;
        item.addEventListener("click", () => {
          showToast("Riwayat ini hanya tersedia selama sesi halaman ini.");
        });

        recentList.appendChild(item);
      }
    }

    // Riwayat chat sengaja tidak dipulihkan setelah refresh.

    window.addEventListener("storage", event => {
      if (event.key === "chocoNextAllowedAt" && event.newValue) {
        cooldownUntil = Math.max(cooldownUntil, Number(event.newValue) || 0);
        if (cooldownUntil > Date.now()) {
          if (cooldownTimer) clearInterval(cooldownTimer);
          updateSendCooldown();
          cooldownTimer = setInterval(updateSendCooldown, 250);
        }
      }
    });

    document.querySelectorAll(".nav-item[data-page]").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".nav-item[data-page]").forEach(item => {
          item.classList.remove("active");
        });

        button.classList.add("active");
        closeSidebar();
        scrollToBottom();
      });
    });

    function resizeInput() {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 180) + "px";
    }

    input.addEventListener("input", resizeInput);

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const message = input.value.trim();

      if (!message || busy) return;
      if (Date.now() < cooldownUntil) {
        updateSendCooldown();
        const remaining = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
        const language = document.documentElement.lang || "id";
        const notice = language.startsWith("zh")
          ? `请再等待 ${remaining} 秒后发送下一条消息。`
          : language.startsWith("en")
            ? `Please wait ${remaining} more seconds before sending another message.`
            : `Tunggu ${remaining} detik lagi sebelum mengirim pesan berikutnya.`;
        showToast(notice);
        return;
      }

      const isOwnerCredentialCandidate = /^[A-Za-z0-9._~-]{8,200}$/.test(message);
      busy = true;
      send.disabled = true;
      welcome.style.display = "none";

      if (!isOwnerCredentialCandidate) {
        updateRecentTitle(message);
        addMessage(message, "user");
      }
      input.value = "";
      resizeInput();

      const waiting = addMessage("", "assistant", { typing: true });
      let streamedWrapper = null;
      let streamedContent = null;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            history,
            memories: [],
            preferences,
            responseLanguage: getSelectedResponseLanguage(),
            modelMode,
            client: "chatbot",
            stream: true
          })
        });

        let data;
        if ((response.headers.get("content-type") || "").includes("text/event-stream")) {
          waiting.remove();
          streamedWrapper = addMessage("", "assistant");
          streamedContent = streamedWrapper.querySelector(".message-body > div:last-child");
          const reader = response.body && response.body.getReader();
          if (!reader) throw new Error("Browser tidak dapat membaca aliran respons.");
          const decoder = new TextDecoder();
          let buffer = "";
          let reply = "";
          let streamDone = false;
          const consumeFrame = frame => {
            const payload = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
            if (!payload) return;
            if (payload === "[DONE]") { streamDone = true; return; }
            let eventData;
            try { eventData = JSON.parse(payload); } catch { return; }
            if (eventData && eventData.error) throw new Error(eventData.error.message || String(eventData.error));
            const delta = eventData && eventData.choices && eventData.choices[0] && eventData.choices[0].delta && eventData.choices[0].delta.content;
            if (typeof delta === "string" && delta) { reply += delta; renderAssistantText(streamedContent, reply); scrollToBottom(); }
          };
          try {
            while (!streamDone) {
              const result = await reader.read();
              if (result.done) break;
              buffer += decoder.decode(result.value, { stream: true });
              const frames = buffer.split(/\r?\n\r?\n/);
              buffer = frames.pop() || "";
              for (const frame of frames) consumeFrame(frame);
            }
            buffer += decoder.decode();
            if (buffer.trim()) consumeFrame(buffer);
          } finally { reader.releaseLock(); }
          if (!response.ok) throw new Error("Permintaan streaming gagal (HTTP " + response.status + ").");
          if (!reply.trim()) throw new Error("Groq tidak mengirimkan isi jawaban.");
          data = { reply };
        } else {
          try { data = await response.json(); }
          catch { throw new Error("Respons backend bukan JSON yang valid."); }
          waiting.remove();
        }
        if (data.authAttempt === true) {
          await revealReply(typeof data.reply === "string" ? data.reply : "Verifikasi Owner selesai.");
          return;
        }

        if (!response.ok) {
          addMessage(
            data.error || "Permintaan gagal. Periksa konfigurasi backend.",
            "assistant",
            { error: true }
          );
          return;
        }

        const reply = typeof data.reply === "string"
          ? data.reply
          : "";

        if (!reply.trim()) {
          addMessage(
            "Model mengembalikan jawaban kosong. Coba kirim ulang pesan lu.",
            "assistant",
            { error: true }
          );
          return;
        }

        if (streamedWrapper) renderAssistantText(streamedContent, reply);
        else await revealReply(reply);

        history.push(
          { role: "user", content: message },
          { role: "assistant", content: reply }
        );

        // Riwayat hanya tersimpan sementara di memori halaman.

      } catch (error) {
        waiting.remove();
        if (streamedWrapper) streamedWrapper.remove();

        addMessage(
          error.message || "Gagal menghubungi backend. Coba lagi nanti.",
          "assistant",
          { error: true }
        );
      } finally {
        busy = false;
        startSendCooldown();
        input.focus();
        scrollToBottom();
      }
    });

// Start a clean in-memory conversation. This does not delete or alter server data.
function startNewConversation() {
  if (busy) {
    showToast("Tunggu sampai jawaban Choco AI selesai sebelum memulai percakapan baru.");
    return;
  }

  history = [];
  conversationTitle = "";
  conversationStarted = false;
  messages.querySelectorAll(".message:not(.license-request-message)").forEach(message => message.remove());
  welcome.style.display = "";
  recentList.replaceChildren();

  const emptyState = document.createElement("div");
  emptyState.className = "recent-item recent-empty";
  emptyState.textContent = "Belum ada percakapan";
  recentList.appendChild(emptyState);

  input.value = "";
  resizeInput();
  closeSidebar();
  updateWelcomeGreeting();
  showToast("Percakapan baru dimulai.");
}

document.querySelectorAll("[data-new-chat]").forEach(button => {
  button.addEventListener("click", startNewConversation);
});
