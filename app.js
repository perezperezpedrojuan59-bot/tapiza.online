"use strict";

const MAX_IMAGE_SIDE = 1280;

const previewCanvas = document.getElementById("previewCanvas");
const previewCtx = previewCanvas.getContext("2d", { willReadFrequently: true });
const imageInput = document.getElementById("imageInput");
const detectionRange = document.getElementById("detectionRange");
const detectionValue = document.getElementById("detectionValue");
const detectBtn = document.getElementById("detectBtn");
const opacityRange = document.getElementById("opacityRange");
const opacityValue = document.getElementById("opacityValue");
const showMaskInput = document.getElementById("showMask");
const showOriginalInput = document.getElementById("showOriginal");
const downloadBtn = document.getElementById("downloadBtn");
const fabricGrid = document.getElementById("fabricGrid");
const sampleGrid = document.getElementById("sampleGrid");
const emptyState = document.getElementById("emptyState");

const state = {
  hasImage: false,
  width: previewCanvas.width,
  height: previewCanvas.height,
  opacity: Number(opacityRange.value),
  detectionSensitivity: Number(detectionRange.value),
  showMaskGuide: showMaskInput.checked,
  showOriginal: showOriginalInput.checked,
  selectedFabricId: null,
  selectedSampleId: null,
  isDetecting: false,
  detectionJob: 0,
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

const furnitureSamples = [
  { id: "cabecero", label: "Cabecero", src: "assets/samples/cabecero.jpg" },
  { id: "silla", label: "Silla", src: "assets/samples/silla.jpg" },
  { id: "sillon", label: "Sillon", src: "assets/samples/sillon.jpg" },
  { id: "sofa", label: "Sofa", src: "assets/samples/sofa.jpg" },
  { id: "puff", label: "Puff", src: "assets/samples/puff.jpg" },
];

state.selectedFabricId = fabrics[0].id;
syncReadouts();
renderSampleOptions();
renderFabricOptions();
resetCanvas();
attachEvents();

function attachEvents() {
  imageInput.addEventListener("change", onImagePicked);

  detectionRange.addEventListener("input", () => {
    state.detectionSensitivity = Number(detectionRange.value);
    syncReadouts();
  });
  detectionRange.addEventListener("change", () => {
    if (state.hasImage) {
      runAutoDetection();
    }
  });

  detectBtn.addEventListener("click", runAutoDetection);

  opacityRange.addEventListener("input", () => {
    state.opacity = Number(opacityRange.value);
    syncReadouts();
    renderPreview();
  });

  showMaskInput.addEventListener("change", () => {
    state.showMaskGuide = showMaskInput.checked;
    renderPreview();
  });
  showOriginalInput.addEventListener("change", () => {
    state.showOriginal = showOriginalInput.checked;
    renderPreview();
  });

  downloadBtn.addEventListener("click", downloadResult);
}

function onImagePicked(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }
  setActiveSample(null);
  const objectUrl = URL.createObjectURL(file);
  loadImageIntoEditor(objectUrl, {
    revokeObjectUrl: true,
    errorMessage: "No se pudo cargar la imagen. Intenta con otro archivo.",
  });
}

function loadImageIntoEditor(source, options = {}) {
  const revokeObjectUrl = Boolean(options.revokeObjectUrl);
  const errorMessage = options.errorMessage || "No se pudo cargar la imagen.";
  const img = new Image();

  img.onload = () => {
    const fitted = fitInBounds(img.naturalWidth, img.naturalHeight, MAX_IMAGE_SIDE);
    setupCanvases(fitted.width, fitted.height);
    baseCtx.clearRect(0, 0, fitted.width, fitted.height);
    baseCtx.drawImage(img, 0, 0, fitted.width, fitted.height);
    state.baseImageData = baseCtx.getImageData(0, 0, fitted.width, fitted.height);
    state.hasImage = true;
    state.showOriginal = false;
    showOriginalInput.checked = false;
    emptyState.classList.add("hidden");
    downloadBtn.disabled = false;
    detectBtn.disabled = false;
    runAutoDetection();
    if (revokeObjectUrl) {
      URL.revokeObjectURL(source);
    }
  };

  img.onerror = () => {
    if (revokeObjectUrl) {
      URL.revokeObjectURL(source);
    }
    alert(errorMessage);
  };

  img.src = source;
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

function runAutoDetection() {
  if (!state.hasImage || !state.baseImageData || state.isDetecting) {
    return;
  }

  state.isDetecting = true;
  state.detectionJob += 1;
  const jobId = state.detectionJob;

  detectBtn.disabled = true;
  detectBtn.textContent = "Detectando...";

  window.setTimeout(() => {
    if (jobId !== state.detectionJob || !state.baseImageData) {
      return;
    }

    const autoMask = detectUpholsteryMask(
      state.baseImageData,
      state.width,
      state.height,
      state.detectionSensitivity
    );

    writeMaskToCanvas(autoMask, state.width, state.height);
    renderPreview();

    state.isDetecting = false;
    detectBtn.disabled = false;
    detectBtn.textContent = "Recalcular deteccion";
  }, 0);
}

function detectUpholsteryMask(imageData, width, height, sensitivity) {
  const data = imageData.data;
  const objectMask = buildObjectMask(data, width, height, sensitivity);
  return buildUpholsteryMask(data, width, height, objectMask, sensitivity);
}

function buildObjectMask(data, width, height, sensitivity) {
  const total = width * height;
  const bg = estimateBackgroundColor(data, width, height);
  const threshold = estimateBackgroundThreshold(data, width, height, bg, sensitivity);
  const rawMask = new Uint8Array(total);

  let pixel = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = pixel * 4;
      const dist = colorDistance(
        data[idx],
        data[idx + 1],
        data[idx + 2],
        bg.r,
        bg.g,
        bg.b
      );
      rawMask[pixel] = dist > threshold ? 1 : 0;
      pixel += 1;
    }
  }

  let filtered = dilateMask(rawMask, width, height);
  filtered = erodeMask(filtered, width, height);
  filtered = keepLargestComponent(filtered, width, height);

  if (countMaskPixels(filtered) < total * 0.02) {
    return rawMask;
  }
  return filtered;
}

function estimateBackgroundColor(data, width, height) {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 180));
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let x = 0; x < width; x += step) {
    let idxTop = x * 4;
    sumR += data[idxTop];
    sumG += data[idxTop + 1];
    sumB += data[idxTop + 2];
    count += 1;

    let idxBottom = ((height - 1) * width + x) * 4;
    sumR += data[idxBottom];
    sumG += data[idxBottom + 1];
    sumB += data[idxBottom + 2];
    count += 1;
  }

  for (let y = 0; y < height; y += step) {
    let idxLeft = (y * width) * 4;
    sumR += data[idxLeft];
    sumG += data[idxLeft + 1];
    sumB += data[idxLeft + 2];
    count += 1;

    let idxRight = (y * width + (width - 1)) * 4;
    sumR += data[idxRight];
    sumG += data[idxRight + 1];
    sumB += data[idxRight + 2];
    count += 1;
  }

  return {
    r: Math.round(sumR / count),
    g: Math.round(sumG / count),
    b: Math.round(sumB / count),
  };
}

function estimateBackgroundThreshold(data, width, height, bg, sensitivity) {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 160));
  let count = 0;
  let sum = 0;
  let sumSq = 0;

  function pushDistance(pixelIndex) {
    const idx = pixelIndex * 4;
    const d = colorDistance(
      data[idx],
      data[idx + 1],
      data[idx + 2],
      bg.r,
      bg.g,
      bg.b
    );
    sum += d;
    sumSq += d * d;
    count += 1;
  }

  for (let x = 0; x < width; x += step) {
    pushDistance(x);
    pushDistance((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += step) {
    pushDistance(y * width);
    pushDistance(y * width + (width - 1));
  }

  const mean = count > 0 ? sum / count : 0;
  const variance = count > 0 ? Math.max(0, sumSq / count - mean * mean) : 0;
  const std = Math.sqrt(variance);
  return clamp((mean + std * 3 + 10) * sensitivity, 12, 95);
}

function buildUpholsteryMask(data, width, height, objectMask, sensitivity) {
  const total = width * height;
  const objectArea = countMaskPixels(objectMask);
  if (objectArea === 0) {
    return objectMask;
  }

  const seed = estimateSeedColor(data, width, height, objectMask);

  const centerX1 = Math.floor(width * 0.2);
  const centerX2 = Math.floor(width * 0.8);
  const centerY1 = Math.floor(height * 0.18);
  const centerY2 = Math.floor(height * 0.82);

  let sampleCount = 0;
  let sumDistSq = 0;
  for (let y = centerY1; y < centerY2; y += 2) {
    for (let x = centerX1; x < centerX2; x += 2) {
      const p = y * width + x;
      if (!objectMask[p]) {
        continue;
      }
      const idx = p * 4;
      const l = luminance(data[idx], data[idx + 1], data[idx + 2]);
      if (l < 28) {
        continue;
      }
      const d = colorDistance(
        data[idx],
        data[idx + 1],
        data[idx + 2],
        seed.r,
        seed.g,
        seed.b
      );
      sumDistSq += d * d;
      sampleCount += 1;
    }
  }

  if (sampleCount < 60) {
    for (let p = 0; p < total; p += 1) {
      if (!objectMask[p]) {
        continue;
      }
      const idx = p * 4;
      const l = luminance(data[idx], data[idx + 1], data[idx + 2]);
      if (l < 28) {
        continue;
      }
      const d = colorDistance(
        data[idx],
        data[idx + 1],
        data[idx + 2],
        seed.r,
        seed.g,
        seed.b
      );
      sumDistSq += d * d;
      sampleCount += 1;
    }
  }

  const std = sampleCount > 0 ? Math.sqrt(sumDistSq / sampleCount) : 18;
  const colorThreshold = clamp((std * 2.4 + 20) * sensitivity, 18, 105);
  const seedThreshold = colorThreshold * 0.68;

  const candidateMask = new Uint8Array(total);
  for (let p = 0; p < total; p += 1) {
    if (!objectMask[p]) {
      continue;
    }
    const idx = p * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const l = luminance(r, g, b);
    const d = colorDistance(r, g, b, seed.r, seed.g, seed.b);
    if (l > 28 && d <= colorThreshold) {
      candidateMask[p] = 1;
    }
  }

  const grownMask = growMaskFromCenter(
    candidateMask,
    data,
    width,
    height,
    seed,
    seedThreshold
  );

  let outputMask = countMaskPixels(grownMask) >= objectArea * 0.06 ? grownMask : candidateMask;
  outputMask = dilateMask(outputMask, width, height);
  outputMask = erodeMask(outputMask, width, height);

  for (let p = 0; p < total; p += 1) {
    if (!objectMask[p]) {
      outputMask[p] = 0;
    }
  }

  let outputArea = countMaskPixels(outputMask);
  if (outputArea > objectArea * 0.9) {
    for (let p = 0; p < total; p += 1) {
      if (!outputMask[p]) {
        continue;
      }
      const idx = p * 4;
      if (luminance(data[idx], data[idx + 1], data[idx + 2]) < 42) {
        outputMask[p] = 0;
      }
    }
    outputArea = countMaskPixels(outputMask);
  }

  if (outputArea < objectArea * 0.04) {
    const fallback = new Uint8Array(total);
    for (let p = 0; p < total; p += 1) {
      if (!objectMask[p]) {
        continue;
      }
      const idx = p * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const l = luminance(r, g, b);
      const d = colorDistance(r, g, b, seed.r, seed.g, seed.b);
      if (l > 30 && d <= colorThreshold * 1.2) {
        fallback[p] = 1;
      }
    }
    return fallback;
  }

  return outputMask;
}

function estimateSeedColor(data, width, height, objectMask) {
  const x1 = Math.floor(width * 0.3);
  const x2 = Math.floor(width * 0.7);
  const y1 = Math.floor(height * 0.2);
  const y2 = Math.floor(height * 0.75);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let y = y1; y < y2; y += 1) {
    for (let x = x1; x < x2; x += 1) {
      const p = y * width + x;
      if (!objectMask[p]) {
        continue;
      }
      const idx = p * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const l = luminance(r, g, b);
      if (l < 28 || l > 245) {
        continue;
      }
      sumR += r;
      sumG += g;
      sumB += b;
      count += 1;
    }
  }

  if (count < 100) {
    const total = width * height;
    for (let p = 0; p < total; p += 1) {
      if (!objectMask[p]) {
        continue;
      }
      const idx = p * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const l = luminance(r, g, b);
      if (l < 28 || l > 245) {
        continue;
      }
      sumR += r;
      sumG += g;
      sumB += b;
      count += 1;
    }
  }

  if (count === 0) {
    return { r: 160, g: 160, b: 160 };
  }

  return {
    r: Math.round(sumR / count),
    g: Math.round(sumG / count),
    b: Math.round(sumB / count),
  };
}

function growMaskFromCenter(candidateMask, data, width, height, seed, seedThreshold) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const output = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const centerX1 = Math.floor(width * 0.3);
  const centerX2 = Math.floor(width * 0.7);
  const centerY1 = Math.floor(height * 0.2);
  const centerY2 = Math.floor(height * 0.78);

  for (let y = centerY1; y < centerY2; y += 1) {
    for (let x = centerX1; x < centerX2; x += 1) {
      const p = y * width + x;
      if (!candidateMask[p] || visited[p]) {
        continue;
      }
      const idx = p * 4;
      const d = colorDistance(
        data[idx],
        data[idx + 1],
        data[idx + 2],
        seed.r,
        seed.g,
        seed.b
      );
      if (d > seedThreshold) {
        continue;
      }
      visited[p] = 1;
      output[p] = 1;
      queue[tail] = p;
      tail += 1;
    }
  }

  if (tail === 0) {
    const cx = width * 0.5;
    const cy = height * 0.5;
    let bestPixel = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let p = 0; p < total; p += 1) {
      if (!candidateMask[p]) {
        continue;
      }
      const x = p % width;
      const y = Math.floor(p / width);
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bestDist) {
        bestDist = d;
        bestPixel = p;
      }
    }
    if (bestPixel >= 0) {
      visited[bestPixel] = 1;
      output[bestPixel] = 1;
      queue[tail] = bestPixel;
      tail += 1;
    }
  }

  while (head < tail) {
    const p = queue[head];
    head += 1;
    const x = p % width;
    const y = Math.floor(p / width);

    if (x > 0) {
      const n = p - 1;
      if (candidateMask[n] && !visited[n]) {
        visited[n] = 1;
        output[n] = 1;
        queue[tail] = n;
        tail += 1;
      }
    }
    if (x < width - 1) {
      const n = p + 1;
      if (candidateMask[n] && !visited[n]) {
        visited[n] = 1;
        output[n] = 1;
        queue[tail] = n;
        tail += 1;
      }
    }
    if (y > 0) {
      const n = p - width;
      if (candidateMask[n] && !visited[n]) {
        visited[n] = 1;
        output[n] = 1;
        queue[tail] = n;
        tail += 1;
      }
    }
    if (y < height - 1) {
      const n = p + width;
      if (candidateMask[n] && !visited[n]) {
        visited[n] = 1;
        output[n] = 1;
        queue[tail] = n;
        tail += 1;
      }
    }
  }

  return output;
}

function keepLargestComponent(mask, width, height) {
  const total = width * height;
  const labels = new Int32Array(total);
  const queue = new Int32Array(total);
  let componentId = 0;
  let bestId = 0;
  let bestSize = 0;

  for (let p = 0; p < total; p += 1) {
    if (!mask[p] || labels[p] !== 0) {
      continue;
    }

    componentId += 1;
    let head = 0;
    let tail = 0;
    let size = 0;
    labels[p] = componentId;
    queue[tail] = p;
    tail += 1;

    while (head < tail) {
      const current = queue[head];
      head += 1;
      size += 1;
      const x = current % width;
      const y = Math.floor(current / width);

      if (x > 0) {
        const n = current - 1;
        if (mask[n] && labels[n] === 0) {
          labels[n] = componentId;
          queue[tail] = n;
          tail += 1;
        }
      }
      if (x < width - 1) {
        const n = current + 1;
        if (mask[n] && labels[n] === 0) {
          labels[n] = componentId;
          queue[tail] = n;
          tail += 1;
        }
      }
      if (y > 0) {
        const n = current - width;
        if (mask[n] && labels[n] === 0) {
          labels[n] = componentId;
          queue[tail] = n;
          tail += 1;
        }
      }
      if (y < height - 1) {
        const n = current + width;
        if (mask[n] && labels[n] === 0) {
          labels[n] = componentId;
          queue[tail] = n;
          tail += 1;
        }
      }
    }

    if (size > bestSize) {
      bestSize = size;
      bestId = componentId;
    }
  }

  if (bestId === 0) {
    return mask;
  }

  const output = new Uint8Array(total);
  for (let p = 0; p < total; p += 1) {
    output[p] = labels[p] === bestId ? 1 : 0;
  }
  return output;
}

function countMaskPixels(mask) {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) {
    count += mask[i] ? 1 : 0;
  }
  return count;
}

function writeMaskToCanvas(mask, width, height) {
  const imageData = maskCtx.createImageData(width, height);
  const data = imageData.data;
  for (let p = 0; p < mask.length; p += 1) {
    const idx = p * 4;
    const alpha = mask[p] ? 255 : 0;
    data[idx] = 255;
    data[idx + 1] = 255;
    data[idx + 2] = 255;
    data[idx + 3] = alpha;
  }
  maskCtx.putImageData(imageData, 0, 0);
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

      const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const shade = 0.45 + light * 0.85;
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
  opacityValue.textContent = `${Math.round(state.opacity * 100)}%`;
  detectionValue.textContent = `${Math.round(state.detectionSensitivity * 100)}%`;
}

function renderSampleOptions() {
  sampleGrid.innerHTML = "";

  for (const sample of furnitureSamples) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "sample-option";
    item.dataset.sampleId = sample.id;
    item.classList.toggle("active", sample.id === state.selectedSampleId);

    const image = document.createElement("img");
    image.className = "sample-thumb";
    image.src = sample.src;
    image.alt = `Mueble de ejemplo: ${sample.label}`;
    image.loading = "lazy";

    const label = document.createElement("span");
    label.className = "sample-label";
    label.textContent = sample.label;

    item.append(image, label);
    item.addEventListener("click", () => {
      setActiveSample(sample.id);
      imageInput.value = "";
      loadImageIntoEditor(sample.src, {
        errorMessage: `No se pudo cargar el ejemplo de ${sample.label.toLowerCase()}.`,
      });
    });

    sampleGrid.appendChild(item);
  }
}

function setActiveSample(sampleId) {
  state.selectedSampleId = sampleId;
  for (const node of sampleGrid.children) {
    node.classList.toggle("active", node.dataset.sampleId === sampleId);
  }
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

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
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

function dilateMask(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (mask[p]) {
        out[p] = 1;
        continue;
      }
      let on = false;
      for (let oy = -1; oy <= 1 && !on; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            continue;
          }
          if (mask[ny * width + nx]) {
            on = true;
            break;
          }
        }
      }
      out[p] = on ? 1 : 0;
    }
  }
  return out;
}

function erodeMask(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (!mask[p]) {
        continue;
      }
      let keep = true;
      for (let oy = -1; oy <= 1 && keep; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            keep = false;
            break;
          }
          if (!mask[ny * width + nx]) {
            keep = false;
            break;
          }
        }
      }
      out[p] = keep ? 1 : 0;
    }
  }
  return out;
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
