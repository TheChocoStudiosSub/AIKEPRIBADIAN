(function () {
  "use strict";

  const key = "choco_site_preferences_v1";
  const backdrop = document.getElementById("sitePreferenceBackdrop");
  const accept = document.getElementById("sitePreferenceAccept");
  const reject = document.getElementById("sitePreferenceReject");
  const sponsorLinkSlot = document.getElementById("sponsorLinkSlot");
  let adsAllowed = false;

  function openPreferences() {
    if (backdrop) backdrop.hidden = false;
    document.getElementById("sidebar")?.classList.remove("open");
    document.getElementById("sidebarOverlay")?.classList.remove("open");
  }

  function loadAds() {
    adsAllowed = true;
    if (sponsorLinkSlot) sponsorLinkSlot.hidden = false;
    if (typeof window.loadChocoNativeAd === "function") window.loadChocoNativeAd();
  }

  function saveChoice(allowed) {
    try {
      localStorage.setItem(key, JSON.stringify({ adsAllowed: allowed, savedAt: new Date().toISOString() }));
    } catch {
      openPreferences();
      return;
    }

    const wasAllowed = adsAllowed;
    adsAllowed = allowed;
    if (backdrop) backdrop.hidden = true;

    if (allowed) {
      loadAds();
    } else {
      if (sponsorLinkSlot) sponsorLinkSlot.hidden = true;
      // A third-party script already loaded cannot be reliably unloaded in place.
      if (wasAllowed) window.location.reload();
    }
  }

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    saved = null;
  }

  if (saved && saved.adsAllowed === true) loadAds();
  else if (!saved || typeof saved.adsAllowed !== "boolean") openPreferences();

  if (accept) accept.addEventListener("click", () => saveChoice(true));
  if (reject) reject.addEventListener("click", () => saveChoice(false));

  document.querySelectorAll("[data-open-site-preferences]").forEach(button => {
    button.addEventListener("click", openPreferences);
  });

  const preferencesLink = document.getElementById("openSitePreferences");
  if (preferencesLink) preferencesLink.addEventListener("click", openPreferences);
})();