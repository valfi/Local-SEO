/**
 * content.js — Injected into the page to extract cleaned source & network timing data.
 * Communicates back to popup.js via chrome.runtime messaging.
 * Supports Finnish (fi) and English (en) output via lang parameter.
 */

(() => {
  // Minimal i18n for output content
  const CONTENT_LOCALES = {
    fi: {
      altMissing: '⚠️ PUUTTUU',
      altWarning: '⚠️ ALT-TEKSTI PUUTTUU!',
      // Network CSV headers
      netUrl: 'URL',
      netType: 'Tyyppi',
      netSize: 'Koko (kt)',
      netDuration: 'Kesto (ms)',
      netStart: 'Aloitusaika (ms)',
      netProtocol: 'Protokolla',
      netMime: 'MIME / Initiator',
      // Type names
      imgPng: 'Kuva/PNG', imgJpg: 'Kuva/JPG', imgJpeg: 'Kuva/JPEG',
      imgGif: 'Kuva/GIF', imgWebp: 'Kuva/WebP', imgSvg: 'Kuva/SVG',
      fontWoff: 'Fontti/WOFF', fontWoff2: 'Fontti/WOFF2',
      fontTtf: 'Fontti/TTF', fontEot: 'Fontti/EOT',
      image: 'kuva',
    },
    en: {
      altMissing: '⚠️ MISSING',
      altWarning: '⚠️ ALT TEXT MISSING!',
      netUrl: 'URL',
      netType: 'Type',
      netSize: 'Size (kB)',
      netDuration: 'Duration (ms)',
      netStart: 'Start time (ms)',
      netProtocol: 'Protocol',
      netMime: 'MIME / Initiator',
      imgPng: 'Image/PNG', imgJpg: 'Image/JPG', imgJpeg: 'Image/JPEG',
      imgGif: 'Image/GIF', imgWebp: 'Image/WebP', imgSvg: 'Image/SVG',
      fontWoff: 'Font/WOFF', fontWoff2: 'Font/WOFF2',
      fontTtf: 'Font/TTF', fontEot: 'Font/EOT',
      image: 'image',
    },
  };

  function ct(lang, key) {
    const loc = CONTENT_LOCALES[lang] || CONTENT_LOCALES.fi;
    return loc[key] || CONTENT_LOCALES.fi[key] || key;
  }

  /**
   * Extract a clean, SEO-focused version of the page source.
   * Keeps: headings, paragraphs, lists, images (with alt), links, tables, meta tags.
   */
  function extractCleanSource(lang) {
    const doc = document;
    const lines = [];

    // --- Meta information ---
    lines.push('<!DOCTYPE html>');
    lines.push(`<html lang="${doc.documentElement.lang || 'unknown'}">`);
    lines.push('<head>');
    lines.push(`  <title>${escapeHtml(doc.title)}</title>`);

    // Meta tags of SEO interest
    const metaSelectors = [
      'meta[name="description"]',
      'meta[name="keywords"]',
      'meta[name="robots"]',
      'meta[name="author"]',
      'meta[name="viewport"]',
      'meta[property^="og:"]',
      'meta[name^="twitter:"]',
      'link[rel="canonical"]',
      'link[rel="alternate"][hreflang]',
    ];
    metaSelectors.forEach(sel => {
      doc.querySelectorAll(sel).forEach(el => {
        lines.push(`  ${el.outerHTML}`);
      });
    });

    // Structured data (JSON-LD)
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
      try {
        const json = JSON.parse(el.textContent);
        lines.push(`  <script type="application/ld+json">`);
        lines.push(`  ${JSON.stringify(json, null, 2)}`);
        lines.push(`  </script>`);
      } catch (_) {
        lines.push(`  ${el.outerHTML}`);
      }
    });

    lines.push('</head>');
    lines.push('<body>');
    lines.push('');

    // --- Body content ---
    const body = doc.body;
    if (!body) {
      lines.push('<!-- No body element found -->');
      lines.push('</body></html>');
      return lines.join('\n');
    }

    // Walk the DOM and extract relevant elements
    const walker = doc.createTreeWalker(
      body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          const tag = node.tagName.toLowerCase();
          // Skip hidden elements, scripts, styles
          if (['script', 'style', 'noscript', 'svg', 'template'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip elements hidden via CSS
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const relevantTags = new Set([
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'li', 'blockquote', 'figcaption', 'caption',
      'img', 'picture', 'video', 'iframe',
      'a',
      'table', 'th', 'td',
      'nav', 'header', 'footer', 'main', 'section', 'article', 'aside',
      'form', 'button', 'input', 'label', 'select', 'textarea',
    ]);

    const seenTexts = new Set();
    let currentSection = '';

    let node;
    while ((node = walker.nextNode())) {
      const tag = node.tagName.toLowerCase();

      if (!relevantTags.has(tag)) continue;

      // Semantic landmarks
      if (['nav', 'header', 'footer', 'main', 'section', 'article', 'aside'].includes(tag)) {
        const label = node.getAttribute('aria-label') || node.getAttribute('role') || '';
        const id = node.id ? ` id="${node.id}"` : '';
        const ariaLabel = label ? ` aria-label="${escapeHtml(label)}"` : '';
        if (currentSection !== tag) {
          lines.push('');
          lines.push(`<!-- ===== <${tag}${id}${ariaLabel}> ===== -->`);
          currentSection = tag;
        }
        continue;
      }

      // Headings
      if (tag.match(/^h[1-6]$/)) {
        const text = getCleanText(node);
        if (text) {
          lines.push('');
          lines.push(`<${tag}>${escapeHtml(text)}</${tag}>`);
        }
        continue;
      }

      // Paragraphs, list items, blockquotes, figcaptions
      if (['p', 'li', 'blockquote', 'figcaption', 'caption'].includes(tag)) {
        const text = getCleanText(node);
        if (text && text.length > 1 && !seenTexts.has(text)) {
          seenTexts.add(text);
          lines.push(`<${tag}>${escapeHtml(text)}</${tag}>`);
        }
        continue;
      }

      // Images
      if (tag === 'img') {
        const src = node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('data-lazy-src') || '';
        const alt = node.getAttribute('alt');
        const title = node.getAttribute('title') || '';
        const width = node.naturalWidth || node.width || '';
        const height = node.naturalHeight || node.height || '';

        let attrs = `src="${escapeHtml(resolveUrl(src))}"`;
        attrs += ` alt="${alt !== null ? escapeHtml(alt) : ct(lang, 'altMissing')}"`;
        if (title) attrs += ` title="${escapeHtml(title)}"`;
        if (width) attrs += ` width="${width}"`;
        if (height) attrs += ` height="${height}"`;

        // Flag missing alt
        const warning = (alt === null || alt === '') ? ` <!-- ${ct(lang, 'altWarning')} -->` : '';
        lines.push(`<img ${attrs}>${warning}`);
        continue;
      }

      // Links (only meaningful ones)
      if (tag === 'a') {
        const href = node.getAttribute('href') || '';
        const text = getCleanText(node);
        if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          const rel = node.getAttribute('rel') || '';
          let attrs = `href="${escapeHtml(resolveUrl(href))}"`;
          if (rel) attrs += ` rel="${escapeHtml(rel)}"`;
          lines.push(`<a ${attrs}>${escapeHtml(text)}</a>`);
        }
        continue;
      }

      // Table cells
      if (['th', 'td'].includes(tag)) {
        const text = getCleanText(node);
        if (text) {
          lines.push(`  <${tag}>${escapeHtml(text)}</${tag}>`);
        }
        continue;
      }

      // Forms/inputs (SEO: check for accessible labels)
      if (['input', 'button', 'select', 'textarea'].includes(tag)) {
        const type = node.getAttribute('type') || '';
        const name = node.getAttribute('name') || '';
        const ariaLabel = node.getAttribute('aria-label') || '';
        const placeholder = node.getAttribute('placeholder') || '';
        if (name || ariaLabel || placeholder) {
          let attrs = tag === 'input' ? ` type="${type}"` : '';
          if (name) attrs += ` name="${escapeHtml(name)}"`;
          if (ariaLabel) attrs += ` aria-label="${escapeHtml(ariaLabel)}"`;
          if (placeholder) attrs += ` placeholder="${escapeHtml(placeholder)}"`;
          lines.push(`<${tag}${attrs}>`);
        }
        continue;
      }
    }

    lines.push('');
    lines.push('</body>');
    lines.push('</html>');

    return lines.join('\n');
  }

  /**
   * Extract all JSON-LD structured data blocks from the page.
   * Returns a JSON string (pretty-printed array of all schema objects).
   */
  function extractJsonLd() {
    const schemas = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
      try {
        const parsed = JSON.parse(el.textContent);
        schemas.push(parsed);
      } catch (e) {
        // If parsing fails, push the raw text wrapped in an object
        schemas.push({ _parseError: e.message, _raw: el.textContent.trim() });
      }
    });
    return JSON.stringify(schemas, null, 2);
  }

  /**
   * Extract network resource timing data using the Performance API.
   * Returns CSV string with columns: URL, Type, Size, Duration, Start Time, Protocol
   */
  function extractNetworkData(lang) {
    const entries = performance.getEntriesByType('resource');

    const csvLines = [];
    csvLines.push([
      ct(lang, 'netUrl'),
      ct(lang, 'netType'),
      ct(lang, 'netSize'),
      ct(lang, 'netDuration'),
      ct(lang, 'netStart'),
      ct(lang, 'netProtocol'),
      ct(lang, 'netMime'),
    ].join('\t'));

    entries.forEach(entry => {
      const url = entry.name;
      const type = entry.initiatorType || 'unknown';
      const size = entry.transferSize !== undefined
        ? (entry.transferSize / 1024).toFixed(1)
        : '—';
      const duration = entry.duration.toFixed(1);
      const startTime = entry.startTime.toFixed(1);
      const protocol = entry.nextHopProtocol || '—';

      // Determine content type from extension
      const ext = url.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
      const typeMap = {
        js: 'JavaScript',
        css: 'CSS',
        png: ct(lang, 'imgPng'),
        jpg: ct(lang, 'imgJpg'),
        jpeg: ct(lang, 'imgJpeg'),
        gif: ct(lang, 'imgGif'),
        webp: ct(lang, 'imgWebp'),
        svg: ct(lang, 'imgSvg'),
        woff: ct(lang, 'fontWoff'),
        woff2: ct(lang, 'fontWoff2'),
        ttf: ct(lang, 'fontTtf'),
        eot: ct(lang, 'fontEot'),
        json: 'JSON',
        xml: 'XML',
        html: 'HTML',
        php: 'PHP',
      };
      const mimeGuess = typeMap[ext] || ext;

      csvLines.push([
        url,
        type,
        size,
        duration,
        startTime,
        protocol,
        mimeGuess
      ].join('\t'));
    });

    return csvLines.join('\n');
  }

  // --- Utility functions ---

  function getCleanText(el) {
    // Get direct text, skip child elements that are separately processed
    const clone = el.cloneNode(true);
    // Remove child block elements that would duplicate
    clone.querySelectorAll('h1,h2,h3,h4,h5,h6,p,ul,ol,table,figure').forEach(c => c.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resolveUrl(url) {
    if (!url) return '';
    try {
      return new URL(url, document.location.href).href;
    } catch {
      return url;
    }
  }

  // --- Message listener ---
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'extractSource') {
      try {
        const html = extractCleanSource(msg.lang || 'fi');
        sendResponse({ success: true, data: html });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }

    if (msg.action === 'extractNetwork') {
      try {
        const csv = extractNetworkData(msg.lang || 'fi');
        sendResponse({ success: true, data: csv });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }

    if (msg.action === 'extractSchema') {
      try {
        const json = extractJsonLd();
        sendResponse({ success: true, data: json });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }

    if (msg.action === 'getPageInfo') {
      sendResponse({
        success: true,
        data: {
          title: document.title,
          url: document.location.href,
        }
      });
      return true;
    }

    if (msg.action === 'scanImages') {
      try {
        const images = scanImagesWithoutAlt();
        const descMeta = document.querySelector('meta[name="description"]');
        sendResponse({
          success: true,
          data: {
            images,
            pageTitle: document.title || '',
            pageDescription: descMeta ? descMeta.getAttribute('content') || '' : '',
          }
        });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }
  });

  /**
   * Scan all page images and return those missing an alt attribute.
   * Returns array of { src, filename, width, height }.
   */
  function scanImagesWithoutAlt() {
    const allImgs = document.querySelectorAll('img');
    const results = [];
    const seenSrcs = new Set();

    allImgs.forEach(img => {
      const alt = img.getAttribute('alt');
      // Include images where alt is null (missing) or empty string
      if (alt !== null && alt !== '') return;

      const src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
      if (!src) return;

      // Check it's a real image (png/jpg/webp or has dimensions)
      const urlClean = src.split('?')[0].toLowerCase();
      const isImage = urlClean.endsWith('.png') || urlClean.endsWith('.jpg')
        || urlClean.endsWith('.jpeg') || urlClean.endsWith('.webp')
        || img.naturalWidth > 1;
      if (!isImage) return;

      // Resolve to full URL
      let fullUrl;
      try {
        fullUrl = new URL(src, document.location.href).href;
      } catch {
        fullUrl = src;
      }

      // Deduplicate
      if (seenSrcs.has(fullUrl)) return;
      seenSrcs.add(fullUrl);

      // Extract filename from URL
      const urlPath = fullUrl.split('?')[0].split('#')[0];
      const filename = urlPath.split('/').pop() || 'image';

      results.push({
        src: fullUrl,
        filename,
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        currentAlt: alt, // null or ''
      });
    });

    return results;
  }
})();
