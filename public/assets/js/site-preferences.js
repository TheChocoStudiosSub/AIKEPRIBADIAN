(function () {
      const key = "choco_site_preferences_v1";
      const backdrop = document.getElementById("sitePreferenceBackdrop");
      const accept = document.getElementById("sitePreferenceAccept");
      const reject = document.getElementById("sitePreferenceReject");

      const sponsorLinkSlot = document.getElementById("sponsorLinkSlot");
      const preferencesLink = document.getElementById("openSitePreferences");
      const messages = document.getElementById("messages");
      const welcome = document.getElementById("welcome");
      let adsAllowed = false;

      function loadAds() {
        adsAllowed = true;
        if (sponsorLinkSlot) sponsorLinkSlot.hidden = false;
        if (typeof window.loadChocoNativeAd === "function") window.loadChocoNativeAd();
      }

      function saveChoice(allowed) {
        try {
          localStorage.setItem(key, JSON.stringify({ adsAllowed: allowed, savedAt: new Date().toISOString() }));
        } catch (error) {
          backdrop.hidden = false;
          return;
        }
        const wasAllowed = adsAllowed;
        adsAllowed = allowed;
        backdrop.hidden = true;
        if (allowed) {
          loadAds();
        } else {
          if (sponsorLinkSlot) sponsorLinkSlot.hidden = true;
          // A third-party script already loaded cannot be reliably unloaded in place.
          if (wasAllowed) window.location.reload();
        }
      }

      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch (error) { saved = null; }
      if (saved && saved.adsAllowed === true) loadAds();
      else if (!saved || typeof saved.adsAllowed !== "boolean") backdrop.hidden = false;

      accept.addEventListener("click", () => saveChoice(true));
      reject.addEventListener("click", () => saveChoice(false));
      preferencesLink.addEventListener("click", () => { backdrop.hidden = false; });
    })();