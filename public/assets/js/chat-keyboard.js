// Enter ditangani pada fase capture, lalu memakai klik tombol Kirim yang asli.
    // Dengan demikian perilakunya identik dengan klik tombol dan tidak membuat submit native.
    document.addEventListener("keydown", event => {
      if (event.target?.id !== "message" || event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const sendButton = document.getElementById("send");
      if (sendButton && !sendButton.disabled) sendButton.click();
    }, true);