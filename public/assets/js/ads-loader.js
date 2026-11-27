const nativeAdSlot = document.querySelector(".native-ad-slot");
            const nativeAdContainer = document.getElementById("container-4c7148c2e2f23b913be9dd10ba77ad61");
            window.loadChocoNativeAd = function () {
              if (!nativeAdSlot || !nativeAdContainer || nativeAdContainer.dataset.requested === "true") return;
              nativeAdContainer.dataset.requested = "true";
              const adScript = document.createElement("script");
              adScript.async = true;
              adScript.dataset.cfasync = "false";
              adScript.src = "https://bauval.org/21/4c7148c2e2f23b913be9dd10ba77ad61";
              adScript.onerror = function () { nativeAdSlot.hidden = true; };
              nativeAdContainer.before(adScript);
              const observer = new MutationObserver(() => {
                if (nativeAdContainer.childNodes.length > 0 || nativeAdContainer.textContent.trim()) nativeAdSlot.hidden = false;
              });
              observer.observe(nativeAdContainer, { childList: true, subtree: true, characterData: true });
            };