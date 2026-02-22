"use strict";

const MAX_IMAGE_SIDE = 1280;
const MAX_UNDO_STEPS = 20;

const previewCanvas = document.getElementById("previewCanvas");
const previewCtx = previewCanvas.getContext("2d", { willReadFrequently: true });
const imageInput = document.getElementById("imageInput");
const brushSizeInput = document.getElementById("brushSize");
const brushSizeValue = document.getElementById("brushSizeValue");
const opacityRange = document.getElementById("opacityRange");
const opacityValue = document.getElementById("opacityValue");
const paintModeBtn = document.getElementById("paintModeBtn");
const eraseModeBtn = document.getElementById("eraseModeBtn");
const undoMaskBtn = document.getElementById("undoMaskBtn");
const clearMaskBtn = document.getElementById("clearMaskBtn");
const showMaskInput = document.getElementById("showMask");
const showOriginalInput = document.getElementById("showOriginal");
const downloadBtn = document.getElementById("downloadBtn");
const fabricGrid = document.getElementById("fabricGrid");
const emptyState = document.getElementById("emptyState");

const state = {
  hasImage: false,
  width: previewCanvas.width,
  height: previewCanvas.height,
  brushSize: Number(brushSizeInput.value),
  opacity: Number(opacityRange.value),
  drawMode: "paint",
  drawing: false,
  lastPoint: null,
  showMaskGuide: showMaskInput.checked,
  showOriginal: showOriginalInput.checked,
  undoStack: [],
  selectedFabricId: null,
  hexCache: new Map(),
  baseImageData: null,
  patternTiles: createPatternTiles(),
  baseCanvas: document.createElement("canvas"),
  maskCanvas: document.createElement("canvas"),
};

const baseCtx = state.baseCanvas.getContext("2d", { willReadFrequently: true });
const maskCtx = state.maskCanvas.getContext("2d", { willReadFrequently: true });

const fabrics = [
  { id: "c-arena", kind: "color", label: "Arena", value: "#c8a47f" },
  { id: "c-grafito", kind: "color", label: "Grafito", value: "#4b535c" },
  { id: "c-azul", kind: "color", label: "Azul petroleo", value: "#2f5d62" },
  { id: "c-oliva", kind: "color", label: "Verde oliva", value: "#68764b" },
  { id: "c-terracota", kind: "color", label: "Terracota", value: "#b56449" },
  { id: "p-lino", kind: "pattern", label: "Lino", tileId: "lino" },
  { id: "p-rayas", kind: "pattern", label: "Rayas", tileId: "rayas" },
  { id: "p-cuadros", kind: "pattern", label: "Cuadros", tileId: "cuadros" },
  { id: "p-espiga", kind: "pattern", label: "Espiga", tileId: "espiga" },
];

state.selectedFabricId = fabrics[0].id;
syncReadouts();
renderFabricOptions();
resetCanvas();
attachEvents();

function attachEvents() {
  imageInput.addEventListener("change", onImagePicked);
  brushSizeInput.addEventListener("input", () => {
    state.brushSize = Number(brushSizeInput.value);
    syncReadouts();
  });
  opacityRange.addEventListener("input", () => {
    state.opacity = Number(opacityRange.value);
    syncReadouts();
    renderPreview();
  });

  paintModeBtn.addEventListener("click", () => setDrawMode("paint"));
  eraseModeBtn.addEventListener("click", () => setDrawMode("erase"));

  undoMaskBtn.addEventListener("click", undoMask);
  clearMaskBtn.addEventListener("click", clearMask);

  showMaskInput.addEventListener("change", () => {
    state.showMaskGuide = showMaskInput.checked;
    renderPreview();
  });
  showOriginalInput.addEventListener("change", () => {
    state.showOriginal = showOriginalInput.checked;
    renderPreview();
  });
  downloadBtn.addEventListener("click", downloadResult);

  previewCanvas.addEventListener("pointerdown", onPointerDown);
  previewCanvas.addEventListener("pointermove", onPointerMove);
  previewCanvas.addEventListener("pointerup", onPointerUp);
  previewCanvas.addEventListener("pointercancel", onPointerUp);
  previewCanvas.addEventListener("pointerleave", onPointerUp);
}

function onImagePicked(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const fitted = fitInBounds(img.naturalWidth, img.naturalHeight, MAX_IMAGE_SIDE);
    setupCanvases(fitted.width, fitted.height);
    baseCtx.clearRect(0, 0, fitted.width, fitted.height);
    baseCtx.drawImage(img, 0, 0, fitted.width, fitted.height);
    state.baseImageData = baseCtx.getImageData(0, 0, fitted.width, fitted.height);
    clearMaskPixels();
    state.hasImage = true;
    state.showOriginal = false;
    showOriginalInput.checked = false;
    emptyState.classList.add("hidden");
    downloadBtn.disabled = false;
    state.undoStack = [];
    renderPreview();
    URL.revokeObjectURL(objectUrl);
  };
  img.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    alert("No se pudo cargar la imagen. Intenta con otro archivo.");
  };
  img.src = objectUrl;
}

function setupCanvases(width, height) {
  state.width = width;
  state.height = height;

  previewCanvas.width = width;
  previewCanvas.height = height;
  state.baseCanvas.width = width;
  state.baseCanvas.height = height;
  state.maskCanvas.width = width;
  state.maskCanvas.height = height;
}

function setDrawMode(mode) {
  state.drawMode = mode;
  paintModeBtn.classList.toggle("active", mode === "paint");
  eraseModeBtn.classList.toggle("active", mode === "erase");
}

function onPointerDown(event) {
  if (!state.hasImage) {
    return;
  }
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  event.preventDefault();
  state.drawing = true;
  previewCanvas.setPointerCapture(event.pointerId);
  pushUndoSnapshot();
  const point = eventToCanvasPoint(event);
  state.lastPoint = point;
  paintStroke(point, point);
  renderPreview();
}

function onPointerMove(event) {
  if (!state.drawing || !state.hasImage) {
    return;
  }
  const point = eventToCanvasPoint(event);
  paintStroke(state.lastPoint, point);
  state.lastPoint = point;
  renderPreview();
}

function onPointerUp() {
  state.drawing = false;
  state.lastPoint = null;
}

function eventToCanvasPoint(event) {
  const rect = previewCanvas.getBoundingClientRect();
  const scaleX = state.width / rect.width;
  const scaleY = state.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  return {
    x: clamp(x, 0, state.width - 1),
    y: clamp(y, 0, state.height - 1),
  };
}

function paintStroke(from, to) {
  maskCtx.save();
  maskCtx.lineWidth = state.brushSize;
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";

  if (state.drawMode === "paint") {
    maskCtx.globalCompositeOperation = "source-over";
    maskCtx.strokeStyle = "rgba(255,255,255,1)";
  } else {
    maskCtx.globalCompositeOperation = "destination-out";
    maskCtx.strokeStyle = "rgba(0,0,0,1)";
  }

  maskCtx.beginPath();
  maskCtx.moveTo(from.x, from.y);
  maskCtx.lineTo(to.x, to.y);
  maskCtx.stroke();
  maskCtx.restore();
}

function pushUndoSnapshot() {
  if (!state.hasImage) {
    return;
  }
  const snapshot = maskCtx.getImageData(0, 0, state.width, state.height);
  state.undoStack.push(snapshot);
  if (state.undoStack.length > MAX_UNDO_STEPS) {
    state.undoStack.shift();
  }
}

function undoMask() {
  if (!state.hasImage || state.undoStack.length === 0) {
    return;
  }
  const snapshot = state.undoStack.pop();
  maskCtx.putImageData(snapshot, 0, 0);
  renderPreview();
}

function clearMask() {
  if (!state.hasImage) {
    return;
  }
  pushUndoSnapshot();
  clearMaskPixels();
  renderPreview();
}

function clearMaskPixels() {
  maskCtx.clearRect(0, 0, state.width, state.height);
}

function renderPreview() {
  if (!state.hasImage || !state.baseImageData) {
    resetCanvas();
    return;
  }

  drawCompositeToContext(previewCtx, {
    showOriginal: state.showOriginal,
    showGuide: state.showMaskGuide,
  });
}

function drawCompositeToContext(targetCtx, options) {
  const showOriginal = Boolean(options && options.showOriginal);
  const showGuide = Boolean(options && options.showGuide);
  const width = state.width;
  const height = state.height;

  if (showOriginal) {
    targetCtx.putImageData(state.baseImageData, 0, 0);
    if (showGuide) {
      drawMaskGuide(targetCtx);
    }
    return;
  }

  const selected = getSelectedFabric();
  const maskData = maskCtx.getImageData(0, 0, width, height).data;
  const baseData = state.baseImageData.data;
  const output = targetCtx.createImageData(width, height);
  const out = output.data;
  const opacity = state.opacity;

  const colorRgb = selected.kind === "color" ? hexToRgb(selected.value) : null;
  const pattern = selected.kind === "pattern" ? state.patternTiles[selected.tileId] : null;

  let idx = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const r = baseData[idx];
      const g = baseData[idx + 1];
      const b = baseData[idx + 2];
      const a = baseData[idx + 3];
      const maskAlpha = maskData[idx + 3] / 255;

      if (maskAlpha <= 0) {
        out[idx] = r;
        out[idx + 1] = g;
        out[idx + 2] = b;
        out[idx + 3] = a;
        idx += 4;
        continue;
      }

      let fabricR;
      let fabricG;
      let fabricB;
      if (pattern) {
        const pIndex =
          (((y % pattern.size) * pattern.size + (x % pattern.size)) * 4) | 0;
        fabricR = pattern.data[pIndex];
        fabricG = pattern.data[pIndex + 1];
        fabricB = pattern.data[pIndex + 2];
      } else {
        fabricR = colorRgb.r;
        fabricG = colorRgb.g;
        fabricB = colorRgb.b;
      }

      // Preserve volume/light from the source image while adding fabric color.
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const shade = 0.45 + luminance * 0.85;
      const shadedR = clamp(Math.round(fabricR * shade), 0, 255);
      const shadedG = clamp(Math.round(fabricG * shade), 0, 255);
      const shadedB = clamp(Math.round(fabricB * shade), 0, 255);

      const strength = maskAlpha * opacity;
      out[idx] = Math.round(r * (1 - strength * 0.35) + shadedR * strength);
      out[idx + 1] = Math.round(g * (1 - strength * 0.35) + shadedG * strength);
      out[idx + 2] = Math.round(b * (1 - strength * 0.35) + shadedB * strength);
      out[idx + 3] = a;
      idx += 4;
    }
  }

  targetCtx.putImageData(output, 0, 0);
  if (showGuide) {
    drawMaskGuide(targetCtx);
  }
}

function drawMaskGuide(targetCtx) {
  targetCtx.save();
  targetCtx.fillStyle = "rgba(72, 182, 255, 0.25)";
  targetCtx.fillRect(0, 0, state.width, state.height);
  targetCtx.globalCompositeOperation = "destination-in";
  targetCtx.drawImage(state.maskCanvas, 0, 0);
  targetCtx.restore();
}

function downloadResult() {
  if (!state.hasImage) {
    return;
  }
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = state.width;
  exportCanvas.height = state.height;
  const exportCtx = exportCanvas.getContext("2d", { willReadFrequently: true });

  drawCompositeToContext(exportCtx, {
    showOriginal: false,
    showGuide: false,
  });

  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  anchor.href = exportCanvas.toDataURL("image/png");
  anchor.download = `tapizado-virtual-${stamp}.png`;
  anchor.click();
}

function syncReadouts() {
  brushSizeValue.textContent = `${state.brushSize} px`;
  opacityValue.textContent = `${Math.round(state.opacity * 100)}%`;
}

function renderFabricOptions() {
  fabricGrid.innerHTML = "";

  for (const fabric of fabrics) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "fabric-option";
    item.classList.toggle("active", fabric.id === state.selectedFabricId);
    item.dataset.fabricId = fabric.id;

    const swatch = document.createElement("span");
    swatch.className = "fabric-swatch";

    if (fabric.kind === "color") {
      swatch.style.background = fabric.value;
    } else {
      const tile = state.patternTiles[fabric.tileId];
      swatch.style.backgroundImage = `url("${tile.dataUrl}")`;
      swatch.style.backgroundSize = "64px 64px";
    }

    const label = document.createElement("span");
    label.className = "fabric-label";
    label.textContent = fabric.label;

    item.append(swatch, label);
    item.addEventListener("click", () => {
      state.selectedFabricId = fabric.id;
      for (const node of fabricGrid.children) {
        node.classList.toggle("active", node.dataset.fabricId === fabric.id);
      }
      renderPreview();
    });
    fabricGrid.appendChild(item);
  }
}

function getSelectedFabric() {
  return fabrics.find((fabric) => fabric.id === state.selectedFabricId) || fabrics[0];
}

function resetCanvas() {
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.fillStyle = "#0f1724";
  previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
}

function fitInBounds(width, height, maxSide) {
  const largest = Math.max(width, height);
  if (largest <= maxSide) {
    return { width, height };
  }
  const scale = maxSide / largest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function hexToRgb(hexValue) {
  if (state.hexCache.has(hexValue)) {
    return state.hexCache.get(hexValue);
  }

  let hex = hexValue.replace("#", "").trim();
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const intVal = Number.parseInt(hex, 16);
  const rgb = {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
  state.hexCache.set(hexValue, rgb);
  return rgb;
}

function clamp(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function createPatternTiles() {
  return {
    lino: createLinenTile(),
    rayas: createStripeTile(),
    cuadros: createCheckeredTile(),
    espiga: createHerringboneTile(),
  };
}

function createLinenTile() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ceb396";
  ctx.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += 4) {
    const alpha = 0.08 + ((x / 4) % 3) * 0.04;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(x, 0, 1, size);
  }
  for (let y = 0; y < size; y += 5) {
    const alpha = 0.05 + ((y / 5) % 4) * 0.03;
    ctx.fillStyle = `rgba(75,48,28,${alpha})`;
    ctx.fillRect(0, y, size, 1);
  }

  return tileFromCanvas(canvas, ctx, size);
}

function createStripeTile() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#7f9aa6";
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 12) {
    ctx.fillStyle = "#d7d7d4";
    ctx.fillRect(x, 0, 5, size);
  }
  for (let y = 0; y < size; y += 8) {
    ctx.fillStyle = "rgba(31,42,59,0.12)";
    ctx.fillRect(0, y, size, 1);
  }

  return tileFromCanvas(canvas, ctx, size);
}

function createCheckeredTile() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const block = 16;
  for (let y = 0; y < size; y += block) {
    for (let x = 0; x < size; x += block) {
      const dark = ((x + y) / block) % 2 === 0;
      ctx.fillStyle = dark ? "#808489" : "#b0b4b6";
      ctx.fillRect(x, y, block, block);
    }
  }
  ctx.strokeStyle = "rgba(30,35,45,0.2)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= size; i += block) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  return tileFromCanvas(canvas, ctx, size);
}

function createHerringboneTile() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#9f6f4d";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(255,230,210,0.35)";
  ctx.lineWidth = 3;

  for (let x = -size; x < size * 2; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + size, size);
    ctx.stroke();
  }
  for (let x = 0; x < size * 2; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - size, size);
    ctx.stroke();
  }

  return tileFromCanvas(canvas, ctx, size);
}

function tileFromCanvas(canvas, ctx, size) {
  return {
    size,
    data: ctx.getImageData(0, 0, size, size).data,
    dataUrl: canvas.toDataURL(),
  };
}
