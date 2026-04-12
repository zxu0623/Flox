/* Flox: apply light/dark before React (MV3 CSP — no inline scripts). */
(function () {
  function applyFloxTheme(light) {
    var h = document.documentElement;
    var b = document.body;
    if (light) {
      h.classList.remove("dark");
      h.style.colorScheme = "light";
      if (b) b.classList.remove("dark");
    } else {
      h.classList.add("dark");
      h.style.colorScheme = "dark";
      if (b) b.classList.add("dark");
    }
  }
  try {
    var c = sessionStorage.getItem("flox.uiTheme.session");
    if (c === "light") applyFloxTheme(true);
    else if (c === "dark") applyFloxTheme(false);
  } catch (e) {}
  try {
    chrome.storage.local.get("flox.uiTheme", function (r) {
      var light = r["flox.uiTheme"] === "light";
      applyFloxTheme(light);
      try {
        sessionStorage.setItem("flox.uiTheme.session", light ? "light" : "dark");
      } catch (e2) {}
    });
  } catch (e) {}
})();
