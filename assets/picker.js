// Image color picker: upload or paste an image, hover with a loupe, click to get the color; extract a palette.
(function () {
  const drop = document.getElementById("drop");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const loupe = document.getElementById("loupe");
  const loupeCanvas = document.getElementById("loupeCanvas");
  const lctx = loupeCanvas.getContext("2d");
  const fileInput = document.getElementById("file");
  const sw = document.getElementById("sw");
  const codes = document.getElementById("codes");
  const nameEl = document.getElementById("colorName");
  const paletteEl = document.getElementById("palette");
  const paletteWrap = document.getElementById("paletteWrap");
  const screenBtn = document.getElementById("screenPick");
  const resetBtn = document.getElementById("reset");
  let hasImage = false;

  // ---- color math (same formulas as the extension) ----
  const hex = ({ r, g, b }) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  const rgbOf = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
  function hsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2; let h = 0, s = 0;
    if (max !== min) { const d = max - min; s = l > .5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
  }
  function hsb({ r, g, b }) {
    r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; let h = 0;
    if (d) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return `hsb(${Math.round(h)}, ${Math.round((max ? d / max : 0) * 100)}%, ${Math.round(max * 100)}%)`;
  }
  const NAMES = [["Black","#000000"],["White","#FFFFFF"],["Gray","#808080"],["Silver","#C0C0C0"],["Red","#FF0000"],["Crimson","#DC143C"],["Tomato","#FF6347"],["Coral","#FF7F50"],["Orange","#FFA500"],["Gold","#FFD700"],["Yellow","#FFFF00"],["Khaki","#F0E68C"],["Lime","#00FF00"],["Green","#008000"],["Forest Green","#228B22"],["Sea Green","#2E8B57"],["Teal","#008080"],["Turquoise","#40E0D0"],["Cyan","#00FFFF"],["Sky Blue","#87CEEB"],["Dodger Blue","#1E90FF"],["Royal Blue","#4169E1"],["Blue","#0000FF"],["Navy","#000080"],["Indigo","#4B0082"],["Purple","#800080"],["Violet","#EE82EE"],["Orchid","#DA70D6"],["Magenta","#FF00FF"],["Hot Pink","#FF69B4"],["Pink","#FFC0CB"],["Brown","#A52A2A"],["Chocolate","#D2691E"],["Sienna","#A0522D"],["Tan","#D2B48C"],["Beige","#F5F5DC"],["Ivory","#FFFFF0"],["Lavender","#E6E6FA"],["Olive","#808000"],["Maroon","#800000"],["Slate Gray","#708090"],["Dim Gray","#696969"],["Steel Blue","#4682B4"],["Salmon","#FA8072"],["Peach Puff","#FFDAB9"],["Mint Cream","#F5FFFA"]];
  function nearestName(c) {
    let best = "", bd = Infinity;
    for (const [n, h] of NAMES) { const o = rgbOf(h); const d = (c.r - o.r) ** 2 + (c.g - o.g) ** 2 + (c.b - o.b) ** 2; if (d < bd) { bd = d; best = n; } }
    return bd === 0 ? best : `≈ ${best}`;
  }

  // ---- UI ----
  function show(c) {
    const h = hex(c);
    sw.style.background = h; sw.textContent = "";
    nameEl.textContent = nearestName(c);
    const items = [["HEX", h], ["RGB", `rgb(${c.r}, ${c.g}, ${c.b})`], ["HSL", hsl(c)], ["HSB", hsb(c)], ["CSS", `--color: ${h};`]];
    codes.replaceChildren(...items.map(([l, v]) => {
      const b = document.createElement("button"); b.type = "button";
      b.innerHTML = `<span class="lbl">${l}</span><span class="val"></span>`; b.querySelector(".val").textContent = v;
      b.addEventListener("click", () => window.copyText(v)); return b;
    }));
    document.getElementById("result").hidden = false;
  }
  function pixelAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - r.left) * canvas.width / r.width), y = Math.floor((clientY - r.top) * canvas.height / r.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    const [rr, gg, bb] = ctx.getImageData(x, y, 1, 1).data; return { r: rr, g: gg, b: bb, x, y };
  }
  function loadImage(src) {
    const img = new Image();
    img.onload = () => {
      const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * k); canvas.height = Math.round(img.height * k);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drop.classList.add("has-image"); hasImage = true; canvas.hidden = false;
      document.getElementById("dropHint").hidden = true; resetBtn.hidden = false;
      buildPalette();
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    };
    img.src = src;
  }
  function handleFile(f) { if (f && f.type.startsWith("image/")) loadImage(URL.createObjectURL(f)); }

  // Palette: quantize to 5 bits/channel, count, take the most frequent distinct colors.
  function buildPalette() {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const counts = new Map(); const step = Math.max(1, Math.floor(data.length / 4 / 60000)) * 4;
    for (let i = 0; i < data.length; i += step) {
      if (data[i + 3] < 128) continue;
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const picked = [];
    for (const [key] of sorted) {
      const c = { r: ((key >> 10) & 31) * 8 + 4, g: ((key >> 5) & 31) * 8 + 4, b: (key & 31) * 8 + 4 };
      if (picked.every((p) => (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2 > 40 ** 2)) picked.push(c);
      if (picked.length >= 8) break;
    }
    paletteEl.replaceChildren(...picked.map((c) => {
      const b = document.createElement("button"); b.type = "button"; b.style.background = hex(c); b.title = hex(c) + " — click to copy";
      b.addEventListener("click", () => { show(c); window.copyText(hex(c)); }); return b;
    }));
    paletteWrap.hidden = picked.length === 0;
  }

  // events
  drop.addEventListener("click", () => { if (!hasImage) fileInput.click(); });
  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
  document.addEventListener("paste", (e) => { const f = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/")); if (f) handleFile(f.getAsFile()); });
  canvas.addEventListener("mousemove", (e) => {
    const p = pixelAt(e.clientX, e.clientY); if (!p) { loupe.style.display = "none"; return; }
    const r = drop.getBoundingClientRect();
    loupe.style.display = "block"; loupe.style.left = (e.clientX - r.left) + "px"; loupe.style.top = (e.clientY - r.top) + "px";
    lctx.imageSmoothingEnabled = false; lctx.clearRect(0, 0, 11, 11); lctx.drawImage(canvas, p.x - 5, p.y - 5, 11, 11, 0, 0, 11, 11);
  });
  canvas.addEventListener("mouseleave", () => { loupe.style.display = "none"; });
  canvas.addEventListener("click", (e) => { const p = pixelAt(e.clientX, e.clientY); if (p) { show(p); window.copyText(hex(p)); } });
  resetBtn.addEventListener("click", () => {
    hasImage = false; canvas.hidden = true; drop.classList.remove("has-image"); document.getElementById("dropHint").hidden = false;
    resetBtn.hidden = true; paletteWrap.hidden = true; fileInput.value = "";
  });
  if ("EyeDropper" in window) {
    screenBtn.hidden = false;
    screenBtn.addEventListener("click", async () => {
      try { const r = await new EyeDropper().open(); const c = rgbOf(r.sRGBHex.toUpperCase()); show(c); window.copyText(hex(c)); } catch {}
    });
  }
  // demo image: a generated gradient so the tool is never empty-looking? No — keep it honest: empty state with instructions.
})();
