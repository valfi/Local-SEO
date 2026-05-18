/**
 * popup.js — Main controller for the Valfi Site Toolkit popup.
 * Orchestrates data gathering (source, screenshot, network, schema) and ZIP packaging.
 * Supports Finnish (fi) and English (en) via locales.js.
 */

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const btnDownload = document.getElementById('btnDownload');
  const progressArea = document.getElementById('progressArea');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const statusEl = document.getElementById('status');
  const currentUrlEl = document.getElementById('currentUrl');
  const pageTitleEl = document.getElementById('pageTitle');

  // --- Language setup ---
  let lang = 'en';
  try {
    const stored = await chrome.storage.local.get('lang');
    if (stored.lang && LOCALES[stored.lang]) lang = stored.lang;
  } catch (_) {}
  setLang(lang);
  applyTranslations();
  activateLangButton(lang);

  // Language toggle handler
  document.getElementById('langToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.lang-btn');
    if (!btn) return;
    const newLang = btn.dataset.lang;
    if (newLang === lang) return;
    lang = newLang;
    setLang(lang);
    chrome.storage.local.set({ lang });
    applyTranslations();
    activateLangButton(lang);
    // Re-apply dynamic counts if scan results visible
    if (scannedImages.length > 0) {
      altCount.textContent = t('imagesCount', { n: scannedImages.length });
    }
    updateGenerateButton();
  });

  function activateLangButton(activeLang) {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === activeLang);
    });
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const val = t(key);
      if (val && val !== key) el.textContent = val;
    });
    // Update dynamic title attribute
    const lmStatusEl = document.getElementById('lmStatus');
    if (lmStatusEl) lmStatusEl.title = t('lmChecking');
  }

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    showStatus(t('noActiveTab'), 'error');
    return;
  }

  // Show page info
  currentUrlEl.textContent = truncateUrl(tab.url, 40);
  currentUrlEl.title = tab.url;
  currentUrlEl.removeAttribute('data-i18n'); // Stop re-translating after URL is set
  pageTitleEl.textContent = tab.title || '—';

  // Inject content script
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch (e) {
    showStatus(t('cannotAnalyze'), 'error');
    btnDownload.disabled = true;
    return;
  }

  // --- LM Studio connection check ---
  const lmDot = document.getElementById('lmDot');
  const lmLabel = document.getElementById('lmLabel');
  const lmStatus = document.getElementById('lmStatus');
  checkLmStudioConnection();

  async function checkLmStudioConnection() {
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'checkLmStudio' });
      if (resp && resp.connected) {
        lmDot.className = 'lm-dot connected';
        lmLabel.textContent = t('lmStudioLabel');
        lmStatus.title = t('lmConnected');
      } else {
        lmDot.className = 'lm-dot disconnected';
        lmLabel.textContent = t('lmNoConnection');
        lmStatus.title = t('lmNotResponding');
      }
    } catch (e) {
      lmDot.className = 'lm-dot disconnected';
      lmLabel.textContent = t('lmNoConnection');
      lmStatus.title = t('lmNotResponding');
    }
  }

  // --- ALT text scan + generate ---
  const btnAltScan = document.getElementById('btnAltScan');
  const altResultsArea = document.getElementById('altResultsArea');
  const altList = document.getElementById('altList');
  const altCount = document.getElementById('altCount');
  const altSelectAll = document.getElementById('altSelectAll');
  const btnGenerate = document.getElementById('btnGenerate');
  const btnGenerateText = document.getElementById('btnGenerateText');
  const altProgressText = document.getElementById('altProgressText');

  let scannedImages = []; // Store scan results
  let pageContext = { title: '', description: '' };

  // Scan button
  btnAltScan.addEventListener('click', async () => {
    btnAltScan.disabled = true;
    const scanSpan = btnAltScan.querySelector('span[data-i18n="scanBtn"]');
    if (scanSpan) scanSpan.textContent = t('scanning');

    try {
      const result = await sendMessageToTab(tab.id, { action: 'scanImages' });
      if (!result.success) throw new Error(result.error);

      scannedImages = result.data.images;
      pageContext = {
        title: result.data.pageTitle,
        description: result.data.pageDescription,
      };

      renderImageList(scannedImages);
      altResultsArea.style.display = 'flex';
    } catch (e) {
      showStatus(t('scanFailed') + e.message, 'error');
    }

    btnAltScan.disabled = false;
    const scanSpan2 = btnAltScan.querySelector('span[data-i18n="scanBtn"]');
    if (scanSpan2) scanSpan2.textContent = t('scanBtn');
  });

  function renderImageList(images) {
    altList.innerHTML = '';

    if (images.length === 0) {
      altList.innerHTML = `<div class="alt-empty-msg">${t('allImagesHaveAlt')}</div>`;
      altCount.textContent = t('imagesCount', { n: 0 });
      btnGenerate.disabled = true;
      altSelectAll.checked = false;
      return;
    }

    altCount.textContent = t('imagesCount', { n: images.length });

    images.forEach((img, idx) => {
      const item = document.createElement('div');
      item.className = 'alt-item';
      item.dataset.index = idx;

      const statusText = img.currentAlt === null ? t('altMissing') : t('altEmpty');
      const statusClass = img.currentAlt === null ? 'missing' : '';
      const dims = (img.width && img.height) ? `${img.width}×${img.height}` : '';

      item.innerHTML = `
        <input type="checkbox" class="alt-item-check" data-idx="${idx}">
        <img class="alt-item-thumb" src="${escapeAttr(img.src)}" alt="" loading="lazy"
             onerror="this.style.display='none'">
        <div class="alt-item-info">
          <span class="alt-item-name" title="${escapeAttr(img.filename)}">${escapeHtmlInline(img.filename)}</span>
          ${dims ? `<span class="alt-item-dims">${dims}</span>` : ''}
          <span class="alt-item-status ${statusClass}">${statusText}</span>
        </div>
      `;

      // Toggle selected class on checkbox change
      const checkbox = item.querySelector('.alt-item-check');
      checkbox.addEventListener('change', () => {
        item.classList.toggle('selected', checkbox.checked);
        updateGenerateButton();
        updateSelectAllState();
      });

      altList.appendChild(item);
    });

    updateGenerateButton();
  }

  function updateGenerateButton() {
    const checked = altList.querySelectorAll('.alt-item-check:checked');
    btnGenerate.disabled = checked.length === 0;
    btnGenerateText.textContent = checked.length > 0
      ? t('generateBtnN', { n: checked.length })
      : t('generateBtn');
  }

  function updateSelectAllState() {
    const all = altList.querySelectorAll('.alt-item-check');
    const checked = altList.querySelectorAll('.alt-item-check:checked');
    altSelectAll.checked = all.length > 0 && checked.length === all.length;
    altSelectAll.indeterminate = checked.length > 0 && checked.length < all.length;
  }

  // Select all toggle
  altSelectAll.addEventListener('change', () => {
    const checkboxes = altList.querySelectorAll('.alt-item-check');
    checkboxes.forEach(cb => {
      cb.checked = altSelectAll.checked;
      cb.closest('.alt-item').classList.toggle('selected', altSelectAll.checked);
    });
    updateGenerateButton();
  });

  // Generate button
  btnGenerate.addEventListener('click', async () => {
    const checkedBoxes = altList.querySelectorAll('.alt-item-check:checked');
    if (checkedBoxes.length === 0) return;

    btnGenerate.disabled = true;
    btnGenerate.classList.add('loading');
    btnAltScan.disabled = true;
    altProgressText.style.display = 'block';

    let completed = 0;
    const total = checkedBoxes.length;

    for (const cb of checkedBoxes) {
      const idx = parseInt(cb.dataset.idx, 10);
      const img = scannedImages[idx];
      const itemEl = cb.closest('.alt-item');

      // Remove any existing result
      const existingResult = itemEl.querySelector('.alt-item-result');
      if (existingResult) existingResult.remove();

      // Show spinner
      const statusEl = itemEl.querySelector('.alt-item-status');
      statusEl.innerHTML = `<span class="alt-item-spinner"></span> ${t('generating')}`;
      statusEl.className = 'alt-item-status';

      altProgressText.textContent = t('generatingN', { x: completed + 1, y: total });

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'generateAltText',
          imageUrl: img.src,
          pageTitle: pageContext.title,
          pageDescription: pageContext.description,
          lang: lang,
        });

        if (response.success) {
          statusEl.textContent = t('done');
          statusEl.style.color = '#34d399';
          img.generatedAlt = response.altText;

          const resultDiv = document.createElement('div');
          resultDiv.className = 'alt-item-result';
          resultDiv.innerHTML = `
            <div class="alt-item-result-header">
              <span class="alt-item-result-label">${t('generatedAlt')}</span>
              <button class="alt-item-copy-btn" data-text="${escapeAttr(response.altText)}">${t('copyBtn')}</button>
            </div>
            <span>${escapeHtmlInline(response.altText)}</span>
          `;
          itemEl.querySelector('.alt-item-info').appendChild(resultDiv);

          // Copy button handler
          resultDiv.querySelector('.alt-item-copy-btn').addEventListener('click', (e) => {
            const text = e.target.dataset.text;
            navigator.clipboard.writeText(text).then(() => {
              e.target.textContent = '✅';
              setTimeout(() => { e.target.textContent = t('copyBtn'); }, 1500);
            });
          });
        } else {
          statusEl.textContent = t('error');
          statusEl.className = 'alt-item-status missing';

          const resultDiv = document.createElement('div');
          resultDiv.className = 'alt-item-result error';
          resultDiv.textContent = response.error;
          itemEl.querySelector('.alt-item-info').appendChild(resultDiv);
        }
      } catch (err) {
        statusEl.textContent = t('error');
        statusEl.className = 'alt-item-status missing';

        const resultDiv = document.createElement('div');
        resultDiv.className = 'alt-item-result error';
        resultDiv.textContent = err.message;
        itemEl.querySelector('.alt-item-info').appendChild(resultDiv);
      }

      completed++;
    }

    altProgressText.textContent = t('altsDone', { n: completed });
    setTimeout(() => { altProgressText.style.display = 'none'; }, 4000);

    btnGenerate.classList.remove('loading');
    btnGenerate.disabled = false;
    btnAltScan.disabled = false;
    updateGenerateButton();
  });

  // Download handler
  btnDownload.addEventListener('click', async () => {
    const optSource = document.getElementById('optSource').checked;
    const optScreenshot = document.getElementById('optScreenshot').checked;
    const optNetwork = document.getElementById('optNetwork').checked;
    const optSchema = document.getElementById('optSchema').checked;
    const optAlts = document.getElementById('optAlts').checked;

    if (!optSource && !optScreenshot && !optNetwork && !optSchema && !optAlts) {
      showStatus(t('selectAtLeastOne'), 'warning');
      return;
    }

    btnDownload.disabled = true;
    btnDownload.classList.add('loading');
    progressArea.style.display = 'flex';
    statusEl.style.display = 'none';

    const files = [];
    const totalSteps = [optSource, optScreenshot, optNetwork, optSchema, optAlts].filter(Boolean).length;
    let currentStep = 0;

    const hostname = getHostname(tab.url);
    const timestamp = getTimestamp();
    const prefix = `seo_${hostname}_${timestamp}`;

    try {
      // 1. Clean source code
      if (optSource) {
        updateProgress(currentStep, totalSteps, t('cleaningSource'));
        const sourceResult = await sendMessageToTab(tab.id, { action: 'extractSource', lang });
        if (sourceResult.success) {
          files.push({
            name: `${prefix}_source.html`,
            content: sourceResult.data,
            type: 'text/html',
          });
        } else {
          console.error('Source extraction failed:', sourceResult.error);
        }
        currentStep++;
      }

      // 2. Full page screenshot
      if (optScreenshot) {
        updateProgress(currentStep, totalSteps, t('takingScreenshot'));
        try {
          const ssResult = await chrome.runtime.sendMessage({
            action: 'captureFullPage',
            tabId: tab.id,
          });
          if (ssResult.success) {
            files.push({
              name: `${prefix}_screenshot.png`,
              content: dataUrlToBlob(ssResult.data),
              type: 'image/png',
              isBlob: true,
            });
          } else {
            // Fallback: capture only visible area
            console.warn('Full page capture failed, using visible area:', ssResult.error);
            const visibleDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            files.push({
              name: `${prefix}_screenshot.png`,
              content: dataUrlToBlob(visibleDataUrl),
              type: 'image/png',
              isBlob: true,
            });
          }
        } catch (e) {
          console.warn('Screenshot failed, trying visible area:', e);
          try {
            const visibleDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            files.push({
              name: `${prefix}_screenshot.png`,
              content: dataUrlToBlob(visibleDataUrl),
              type: 'image/png',
              isBlob: true,
            });
          } catch (e2) {
            console.error('All screenshot methods failed:', e2);
          }
        }
        currentStep++;
      }

      // 3. Network requests
      if (optNetwork) {
        updateProgress(currentStep, totalSteps, t('collectingNetwork'));
        const netResult = await sendMessageToTab(tab.id, { action: 'extractNetwork', lang });
        if (netResult.success) {
          files.push({
            name: `${prefix}_network.tsv`,
            content: netResult.data,
            type: 'text/tab-separated-values',
          });
        } else {
          console.error('Network extraction failed:', netResult.error);
        }
        currentStep++;
      }

      // 4. JSON-LD structured data
      if (optSchema) {
        updateProgress(currentStep, totalSteps, t('collectingSchema'));
        const schemaResult = await sendMessageToTab(tab.id, { action: 'extractSchema' });
        if (schemaResult.success) {
          files.push({
            name: `${prefix}_schema.json`,
            content: schemaResult.data,
            type: 'application/json',
          });
        } else {
          console.error('Schema extraction failed:', schemaResult.error);
        }
        currentStep++;
      }

      // 5. Generated ALTs
      if (optAlts) {
        updateProgress(currentStep, totalSteps, t('collectingAlts'));
        const altsToExport = scannedImages.filter(img => img.generatedAlt);
        
        if (altsToExport.length > 0) {
          let tsv = [
            ['URL', 'Filename', 'Generated ALT'].join('\t')
          ];
          altsToExport.forEach(img => {
            tsv.push([img.src, img.filename, img.generatedAlt].join('\t'));
          });
          files.push({
            name: `${prefix}_alts.tsv`,
            content: tsv.join('\n'),
            type: 'text/tab-separated-values',
          });
        } else {
          console.warn('No generated ALTs to export.');
        }
        currentStep++;
      }

      if (files.length === 0) {
        showStatus(t('noData'), 'error');
        resetButton();
        return;
      }

      // Single file → download directly, multiple → ZIP
      if (files.length === 1) {
        updateProgress(totalSteps, totalSteps, t('downloadingFile'));
        const file = files[0];
        const blob = file.isBlob
          ? file.content
          : new Blob([file.content], { type: file.type });
        downloadBlob(blob, file.name);
        showStatus(t('fileDownloaded', { name: file.name }), 'success');
      } else if (typeof JSZip !== 'undefined') {
        updateProgress(totalSteps, totalSteps, t('packingZip'));
        await downloadAsZip(files, `${prefix}.zip`);
        showStatus(t('packageDownloaded', { n: files.length }), 'success');
      } else {
        // Fallback: download individual files if JSZip unavailable
        await downloadIndividualFiles(files);
        showStatus(t('filesDownloaded', { n: files.length }), 'success');
      }

    } catch (err) {
      console.error('SEO Analyzer error:', err);
      showStatus(t('errorPrefix') + err.message, 'error');
    }

    resetButton();
  });

  // --- Utility functions ---

  function updateProgress(step, total, text) {
    const pct = total > 0 ? Math.round(((step + 0.5) / total) * 100) : 0;
    progressBar.style.width = `${pct}%`;
    progressText.textContent = text;
  }

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
    statusEl.style.display = 'block';
    progressArea.style.display = 'none';
  }

  function resetButton() {
    btnDownload.disabled = false;
    btnDownload.classList.remove('loading');
    progressBar.style.width = '100%';
    setTimeout(() => {
      progressArea.style.display = 'none';
      progressBar.style.width = '0%';
    }, 1500);
  }
}

// --- Global helpers ---

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function downloadAsZip(files, zipName) {
  const zip = new JSZip();

  for (const file of files) {
    if (file.isBlob) {
      // Binary content (screenshot)
      const arrayBuffer = await file.content.arrayBuffer();
      zip.file(file.name, arrayBuffer);
    } else {
      // Text content
      zip.file(file.name, file.content);
    }
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  downloadBlob(blob, zipName);
}

async function downloadIndividualFiles(files) {
  for (const file of files) {
    const blob = file.isBlob
      ? file.content
      : new Blob([file.content], { type: file.type });
    downloadBlob(blob, file.name);
    // Small delay between downloads
    await new Promise(r => setTimeout(r, 300));
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bstr = atob(parts[1]);
  const arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) {
    arr[i] = bstr.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').replace(/\./g, '_');
  } catch {
    return 'page';
  }
}

function getTimestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function truncateUrl(url, maxLen) {
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 3) + '...';
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlInline(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
