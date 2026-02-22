"use strict";

const MAX_IMAGE_SIDE = 1280;
const DETECTION_SENSITIVITY = 1;
const UPHOLSTERY_STRENGTH = 0.95;
const TILE_SIZE = 64;

const previewCanvas = document.getElementById("previewCanvas");
const previewCtx = previewCanvas.getContext("2d", { willReadFrequently: true });
const imageInput = document.getElementById("imageInput");
const fabricImageInput = document.getElementById("fabricImageInput");
const viewResultBtn = document.getElementById("viewResultBtn");
const showOriginalInput = document.getElementById("showOriginal");
const downloadBtn = document.getElementById("downloadBtn");
const fabricGrid = document.getElementById("fabricGrid");
const sampleGrid = document.getElementById("sampleGrid");
const emptyState = document.getElementById("emptyState");

const state = {
  hasImage: false,
  width: previewCanvas.width,
  height: previewCanvas.height,
  showOriginal: showOriginalInput.checked,
  selectedFabricId: null,
  selectedSampleId: null,
  isDetecting: false,
  detectionJob: 0,
  baseImageData: null,
  patternTiles: {},
  tilePromises: new Map(),
  fabrics: buildAcantoFabrics(),
  baseCanvas: document.createElement("canvas"),
  maskCanvas: document.createElement("canvas"),
};

const baseCtx = state.baseCanvas.getContext("2d", { willReadFrequently: true });
const maskCtx = state.maskCanvas.getContext("2d", { willReadFrequently: true });

const furnitureSamples = [
  { id: "cabecero", label: "Cabecero", src: "assets/samples/cabecero.jpg" },
  {
    id: "cabecero-capitone",
    label: "Cabecero capitonado",
    src: "assets/samples/cabecero-capitone.jpg",
  },
  { id: "silla", label: "Silla", src: "assets/samples/silla.jpg" },
  { id: "sillon", label: "Sillon", src: "assets/samples/sillon.jpg" },
  { id: "sofa", label: "Sofa", src: "assets/samples/sofa.jpg" },
  { id: "puff", label: "Puff", src: "assets/samples/puff.jpg" },
];

state.selectedFabricId = state.fabrics[0] ? state.fabrics[0].id : null;
renderSampleOptions();
renderFabricOptions();
resetCanvas();
attachEvents();
ensureSelectedFabricReady();

function attachEvents() {
  if (imageInput) {
    imageInput.addEventListener("change", onFurnitureImagePicked);
  }
  if (fabricImageInput) {
    fabricImageInput.addEventListener("change", onFabricImagePicked);
  }

  if (viewResultBtn) {
    viewResultBtn.disabled = false;
    viewResultBtn.addEventListener("click", () => {
      if (!state.hasImage) {
        alert("Primero carga una imagen del mueble.");
        return;
      }
      state.showOriginal = false;
      if (showOriginalInput) {
        showOriginalInput.checked = false;
      }
      renderPreview();
    });
  }

  if (showOriginalInput) {
    showOriginalInput.addEventListener("change", () => {
      state.showOriginal = showOriginalInput.checked;
      renderPreview();
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadResult);
  }
}

function onFurnitureImagePicked(event) {
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

function onFabricImagePicked(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  createTileFromImageSource(objectUrl, { revokeObjectUrl: true })
    .then((tile) => {
      upsertCustomFabric(tile);
      renderFabricOptions();
      renderPreview();
      fabricImageInput.value = "";
    })
    .catch(() => {
      alert("No se pudo cargar la tela. Prueba con otra imagen.");
    });
}

function upsertCustomFabric(tile) {
  const id = "custom-upload";
  const tileId = "custom-upload";
  state.patternTiles[tileId] = tile;

  const customFabric = {
    id,
    kind: "pattern-image",
    label: "Tela subida",
    tileId,
    src: tile.dataUrl,
    previewSrc: tile.dataUrl,
    fallbackRgb: tile.avg,
  };

  const idx = state.fabrics.findIndex((fabric) => fabric.id === id);
  if (idx >= 0) {
    state.fabrics[idx] = customFabric;
  } else {
    state.fabrics.unshift(customFabric);
  }
  state.selectedFabricId = id;
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
    state.showOriginal = true;
    if (showOriginalInput) {
      showOriginalInput.checked = true;
    }
    emptyState.classList.add("hidden");
    downloadBtn.disabled = false;
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

  window.setTimeout(() => {
    if (jobId !== state.detectionJob || !state.baseImageData) {
      return;
    }

    const autoMask = detectUpholsteryMask(
      state.baseImageData,
      state.width,
      state.height,
      DETECTION_SENSITIVITY
    );

    writeMaskToCanvas(autoMask, state.width, state.height);
    state.isDetecting = false;
    ensureSelectedFabricReady().finally(renderPreview);
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
    let idxLeft = y * width * 4;
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
  });
}

function drawCompositeToContext(targetCtx, options) {
  const showOriginal = Boolean(options && options.showOriginal);
  const width = state.width;
  const height = state.height;

  if (showOriginal) {
    targetCtx.putImageData(state.baseImageData, 0, 0);
    return;
  }

  const selected = getSelectedFabric();
  const maskData = maskCtx.getImageData(0, 0, width, height).data;
  const baseData = state.baseImageData.data;
  const output = targetCtx.createImageData(width, height);
  const out = output.data;

  const pattern =
    selected && selected.kind === "pattern-image"
      ? state.patternTiles[selected.tileId] || null
      : null;
  const fallbackColor =
    selected && selected.fallbackRgb ? selected.fallbackRgb : { r: 180, g: 180, b: 180 };

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

      let fabricR = fallbackColor.r;
      let fabricG = fallbackColor.g;
      let fabricB = fallbackColor.b;

      if (pattern) {
        const pIndex =
          (((y % pattern.size) * pattern.size + (x % pattern.size)) * 4) | 0;
        fabricR = pattern.data[pIndex];
        fabricG = pattern.data[pIndex + 1];
        fabricB = pattern.data[pIndex + 2];
      }

      const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const shade = 0.45 + light * 0.85;
      const shadedR = clamp(Math.round(fabricR * shade), 0, 255);
      const shadedG = clamp(Math.round(fabricG * shade), 0, 255);
      const shadedB = clamp(Math.round(fabricB * shade), 0, 255);

      const strength = maskAlpha * UPHOLSTERY_STRENGTH;
      out[idx] = Math.round(r * (1 - strength * 0.35) + shadedR * strength);
      out[idx + 1] = Math.round(g * (1 - strength * 0.35) + shadedG * strength);
      out[idx + 2] = Math.round(b * (1 - strength * 0.35) + shadedB * strength);
      out[idx + 3] = a;
      idx += 4;
    }
  }

  targetCtx.putImageData(output, 0, 0);
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
  });

  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  anchor.href = exportCanvas.toDataURL("image/png");
  anchor.download = `tapizado-virtual-${stamp}.png`;
  anchor.click();
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

  for (const fabric of state.fabrics) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "fabric-option";
    item.classList.toggle("active", fabric.id === state.selectedFabricId);
    item.dataset.fabricId = fabric.id;

    const swatch = document.createElement("span");
    swatch.className = "fabric-swatch";
    swatch.style.backgroundImage = `url("${fabric.previewSrc || fabric.src}")`;
    swatch.style.backgroundSize = "cover";
    swatch.style.backgroundPosition = "center";

    const label = document.createElement("span");
    label.className = "fabric-label";
    label.textContent = fabric.label;

    item.append(swatch, label);
    item.addEventListener("click", () => {
      state.selectedFabricId = fabric.id;
      for (const node of fabricGrid.children) {
        node.classList.toggle("active", node.dataset.fabricId === fabric.id);
      }
      ensureFabricTile(fabric).finally(renderPreview);
    });
    fabricGrid.appendChild(item);
  }
}

function buildAcantoFabrics() {
  const list = [];
  for (let i = 1; i <= 34; i += 1) {
    const code = String(i).padStart(2, "0");
    list.push({
      id: `acanto-${code}`,
      kind: "pattern-image",
      label: `ACANTO ${code}`,
      tileId: `acanto-${code}`,
      src: `assets/fabrics/acanto/acanto-${code}.webp`,
      previewSrc: `assets/fabrics/acanto/acanto-${code}.webp`,
      fallbackRgb: { r: 180, g: 180, b: 180 },
    });
  }
  return list;
}

function getSelectedFabric() {
  return (
    state.fabrics.find((fabric) => fabric.id === state.selectedFabricId) || state.fabrics[0]
  );
}

function ensureSelectedFabricReady() {
  const selected = getSelectedFabric();
  return ensureFabricTile(selected);
}

function ensureFabricTile(fabric) {
  if (!fabric || fabric.kind !== "pattern-image") {
    return Promise.resolve();
  }
  if (state.patternTiles[fabric.tileId]) {
    return Promise.resolve();
  }

  if (state.tilePromises.has(fabric.tileId)) {
    return state.tilePromises.get(fabric.tileId);
  }

  const promise = createTileFromImageSource(fabric.src)
    .then((tile) => {
      state.patternTiles[fabric.tileId] = tile;
      fabric.fallbackRgb = tile.avg;
    })
    .catch(() => {
      // Keep fallback color if loading fails.
    })
    .finally(() => {
      state.tilePromises.delete(fabric.tileId);
    });

  state.tilePromises.set(fabric.tileId, promise);
  return promise;
}

function createTileFromImageSource(source, options = {}) {
  const revokeObjectUrl = Boolean(options.revokeObjectUrl);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const minSide = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = Math.floor((img.naturalWidth - minSide) / 2);
        const sy = Math.floor((img.naturalHeight - minSide) / 2);
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, TILE_SIZE, TILE_SIZE);

        const imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
        const avg = averageRgb(imageData.data);

        if (revokeObjectUrl) {
          URL.revokeObjectURL(source);
        }

        resolve({
          size: TILE_SIZE,
          data: imageData.data,
          dataUrl: canvas.toDataURL(),
          avg,
        });
      } catch (error) {
        if (revokeObjectUrl) {
          URL.revokeObjectURL(source);
        }
        reject(error);
      }
    };

    img.onerror = () => {
      if (revokeObjectUrl) {
        URL.revokeObjectURL(source);
      }
      reject(new Error("No se pudo cargar la imagen de tela."));
    };

    img.src = source;
  });
}

function averageRgb(data) {
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return {
    r: Math.round(r / pixels),
    g: Math.round(g / pixels),
    b: Math.round(b / pixels),
  };
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
