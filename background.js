/**
 * background.js — Service worker for the SEO Analyzer extension.
 * Handles full-page screenshot capture via Chrome Debugger API,
 * LM Studio connection checks, and ALT text generation via vision model.
 */

const LM_STUDIO_BASE = 'http://localhost:1234';
const LM_MODEL = 'gemma-4-26b-a4b-it-mlx';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'captureFullPage') {
    captureFullPage(msg.tabId)
      .then(dataUrl => sendResponse({ success: true, data: dataUrl }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (msg.action === 'checkLmStudio') {
    checkLmStudio()
      .then(connected => sendResponse({ connected }))
      .catch(() => sendResponse({ connected: false }));
    return true;
  }

  if (msg.action === 'generateAltText') {
    generateAltText(msg.imageUrl, msg.pageTitle, msg.pageDescription, msg.lang || 'fi')
      .then(altText => sendResponse({ success: true, altText }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.action === 'fetchImageAsBase64') {
    fetchImageAsBase64(msg.imageUrl)
      .then(base64 => sendResponse({ success: true, base64 }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Check if LM Studio is reachable by pinging the /v1/models endpoint.
 */
async function checkLmStudio() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const resp = await fetch(`${LM_STUDIO_BASE}/v1/models`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return resp.ok;
  } catch (e) {
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * Fetch an image from any URL and return it as a base64 data URL.
 * Runs in the service worker to avoid CORS restrictions.
 */
async function fetchImageAsBase64(imageUrl) {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`Image fetch failed: ${resp.status}`);

  // Determine source MIME type from URL extension
  const ext = imageUrl.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
  const isWebp = ext === 'webp';
  const isGif = ext === 'gif';
  const needsConversion = isWebp || isGif; // LM Studio doesn't accept webp/gif

  if (needsConversion) {
    // Convert to JPEG via OffscreenCanvas (available in service workers)
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    const ab = await jpegBlob.arrayBuffer();
    const base64 = arrayBufferToBase64(new Uint8Array(ab));
    return `data:image/jpeg;base64,${base64}`;
  }

  // PNG / JPEG — pass through directly
  const arrayBuffer = await resp.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const base64 = arrayBufferToBase64(bytes);

  const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
  const mime = mimeMap[ext] || 'image/jpeg';

  return `data:${mime};base64,${base64}`;
}

/**
 * Convert a Uint8Array to base64 string in chunks to avoid stack overflow.
 */
function arrayBufferToBase64(bytes) {
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

/**
 * Generate an SEO-optimized ALT text for an image using LM Studio vision model.
 * @param {string} imageUrl - URL of the image (will be fetched and converted to base64)
 * @param {string} pageTitle - The page's <title>
 * @param {string} pageDescription - The page's meta description
 * @param {string} lang - Language for the prompt ('fi' or 'en')
 * @returns {string} Generated ALT text
 */
async function generateAltText(imageUrl, pageTitle, pageDescription, lang) {
  // Fetch the image as base64
  const imageDataUrl = await fetchImageAsBase64(imageUrl);

  // Build context from page metadata
  let contextParts = [];
  if (lang === 'en') {
    if (pageTitle) contextParts.push(`Page title: "${pageTitle}"`);
    if (pageDescription) contextParts.push(`Meta description: "${pageDescription}"`);
  } else {
    if (pageTitle) contextParts.push(`Sivun otsikko: "${pageTitle}"`);
    if (pageDescription) contextParts.push(`Meta description: "${pageDescription}"`);
  }

  const contextLabel = lang === 'en' ? 'Page context' : 'Sivun konteksti';
  const contextStr = contextParts.length > 0
    ? `\n\n${contextLabel}:\n${contextParts.join('\n')}`
    : '';

  const prompts = {
    fi: `Generoi tälle kuvalle SEO-optimoitu alt-teksti suomeksi. Alt-tekstin tulee olla 1–3 lausetta pitkä, kuvailla kuvan sisältöä tarkasti ja sisältää luonnollisesti sivun aihepiiriin sopivia avainsanoja. Vastaa pelkällä alt-tekstillä, älä lisää mitään muuta.${contextStr}`,
    en: `Generate an SEO-optimized alt text for this image in English. The alt text should be 1–3 sentences long, accurately describe the image content, and naturally include keywords relevant to the page topic. Respond with only the alt text, nothing else.${contextStr}`,
  };

  const prompt = prompts[lang] || prompts.fi;

  const body = {
    model: LM_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: imageDataUrl },
          },
        ],
      },
    ],
    temperature: 0.5,
    max_tokens: 250,
  };

  const resp = await fetch(`${LM_STUDIO_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`LM Studio API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    const emptyMsg = lang === 'en' ? 'LM Studio returned an empty response' : 'LM Studio palautti tyhjän vastauksen';
    throw new Error(emptyMsg);
  }

  return choice.message.content.trim();
}

/**
 * Capture a full-page screenshot using Chrome DevTools Protocol.
 * This captures the entire page, not just the visible viewport.
 */
async function captureFullPage(tabId) {
  const debuggee = { tabId };

  try {
    // Attach debugger
    await chrome.debugger.attach(debuggee, '1.3');

    // Get the full page dimensions
    const layoutMetrics = await chrome.debugger.sendCommand(
      debuggee,
      'Page.getLayoutMetrics'
    );

    const contentSize = layoutMetrics.cssContentSize || layoutMetrics.contentSize;
    const width = Math.ceil(contentSize.width);
    const height = Math.ceil(contentSize.height);

    // Override device metrics to match full page
    await chrome.debugger.sendCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
      mobile: false,
      width: width,
      height: height,
      deviceScaleFactor: 1,
    });

    // Wait a moment for rendering
    await new Promise(r => setTimeout(r, 500));

    // Capture screenshot
    const result = await chrome.debugger.sendCommand(debuggee, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: width,
        height: height,
        scale: 1,
      },
    });

    // Reset device metrics
    await chrome.debugger.sendCommand(debuggee, 'Emulation.clearDeviceMetricsOverride');

    // Detach debugger
    await chrome.debugger.detach(debuggee);

    return `data:image/png;base64,${result.data}`;

  } catch (err) {
    // Make sure we detach on error
    try {
      await chrome.debugger.detach(debuggee);
    } catch (_) {}
    throw err;
  }
}
