/**
 * locales.js — Internationalization strings for Valfi Site Toolkit.
 * Loaded in popup context. Content/background scripts receive lang via messages.
 */

const LOCALES = {
  fi: {
    // Header
    headerTitle: 'Valfi Local SEO Toolkit',
    loading: 'Ladataan...',
    pageLabel: 'Sivu',

    // Content selection
    selectContent: 'Valitse sisältö',
    sourceTitle: 'Lähdekoodi (siivottu)',
    sourceDesc: 'Headingit, tekstit, kuvat & alt-tekstit',
    screenshotTitle: 'Kuvakaappaus (PNG)',
    screenshotDesc: 'Koko sivun kuvakaappaus',
    networkTitle: 'Verkkopyynnöt (CSV)',
    networkDesc: 'Resurssit, osoitteet, latausajat',
    schemaTitle: 'JSON-LD Schema',
    schemaDesc: 'Rakenteinen data (structured data)',
    altsTitle: 'Generoidut ALT-tekstit (TSV)',
    altsDesc: 'AI:lla generoidut kuvaukset',

    // ALT generator
    altSectionTitle: 'ALT-tekstigeneraattori',
    lmStudioLabel: 'LM Studio',
    lmConnected: 'LM Studio yhdistetty',
    lmNoConnection: 'Ei yhteyttä',
    lmNotResponding: 'LM Studio ei vastaa',
    lmChecking: 'Tarkistetaan LM Studio -yhteyttä...',
    scanBtn: 'Skannaa kuvat',
    scanning: 'Skannataan...',
    scanFailed: '❌ Skannaus epäonnistui: ',
    allImagesHaveAlt: '✅ Kaikissa kuvissa on alt-teksti!',
    imagesCount: '{n} kuvaa',
    altMissing: '⚠️ alt puuttuu',
    altEmpty: '⚠️ alt tyhjä',
    selectAll: 'Valitse kaikki',
    generateBtn: 'Generoi ALT-tekstit',
    generateBtnN: 'Generoi ALT-tekstit ({n})',
    generating: 'Generoidaan...',
    generatingN: 'Generoidaan {x}/{y}...',
    done: '✅ Valmis',
    generatedAlt: 'Generoitu ALT',
    copyBtn: '📋 Kopioi',
    error: '❌ Virhe',
    altsDone: '✅ Valmis! {n} alt-tekstiä generoitu.',

    // Download
    downloadBtn: 'Lataa SEO-paketti (.zip)',
    selectAtLeastOne: 'Valitse vähintään yksi vaihtoehto.',
    cleaningSource: 'Siivotaan lähdekoodia...',
    takingScreenshot: 'Otetaan kuvakaappausta...',
    collectingNetwork: 'Kerätään verkkopyyntöjä...',
    collectingSchema: 'Kerätään JSON-LD schemoja...',
    collectingAlts: 'Kerätään generoituja ALT-tekstejä...',
    noData: 'Ei dataa kerättävänä.',
    downloadingFile: 'Ladataan tiedostoa...',
    packingZip: 'Pakataan ZIP-tiedostoa...',
    fileDownloaded: '✅ Tiedosto ladattu: {name}',
    packageDownloaded: '✅ SEO-paketti ladattu! ({n} tiedostoa)',
    filesDownloaded: '✅ {n} tiedostoa ladattu erikseen.',
    errorPrefix: '❌ Virhe: ',
    preparing: 'Valmistellaan...',

    // Misc
    noActiveTab: 'Aktiivista välilehteä ei löytynyt.',
    cannotAnalyze: 'Ei voi analysoida tätä sivua (chrome:// tai suojattu sivu).',
  },

  en: {
    headerTitle: 'Valfi Local SEO Toolkit',
    loading: 'Loading...',
    pageLabel: 'Page',

    selectContent: 'Select content',
    sourceTitle: 'Source code (cleaned)',
    sourceDesc: 'Headings, texts, images & alt texts',
    screenshotTitle: 'Screenshot (PNG)',
    screenshotDesc: 'Full page screenshot',
    networkTitle: 'Network requests (CSV)',
    networkDesc: 'Resources, URLs, load times',
    schemaTitle: 'JSON-LD Schema',
    schemaDesc: 'Structured data',
    altsTitle: 'Generated ALT texts (TSV)',
    altsDesc: 'AI generated image descriptions',

    altSectionTitle: 'ALT text generator',
    lmStudioLabel: 'LM Studio',
    lmConnected: 'LM Studio connected',
    lmNoConnection: 'No connection',
    lmNotResponding: 'LM Studio not responding',
    lmChecking: 'Checking LM Studio connection...',
    scanBtn: 'Scan images',
    scanning: 'Scanning...',
    scanFailed: '❌ Scan failed: ',
    allImagesHaveAlt: '✅ All images have alt text!',
    imagesCount: '{n} images',
    altMissing: '⚠️ alt missing',
    altEmpty: '⚠️ alt empty',
    selectAll: 'Select all',
    generateBtn: 'Generate ALT texts',
    generateBtnN: 'Generate ALT texts ({n})',
    generating: 'Generating...',
    generatingN: 'Generating {x}/{y}...',
    done: '✅ Done',
    generatedAlt: 'Generated ALT',
    copyBtn: '📋 Copy',
    error: '❌ Error',
    altsDone: '✅ Done! {n} alt texts generated.',

    downloadBtn: 'Download SEO package (.zip)',
    selectAtLeastOne: 'Select at least one option.',
    cleaningSource: 'Cleaning source code...',
    takingScreenshot: 'Taking screenshot...',
    collectingNetwork: 'Collecting network requests...',
    collectingSchema: 'Collecting JSON-LD schemas...',
    collectingAlts: 'Collecting generated ALT texts...',
    noData: 'No data to collect.',
    downloadingFile: 'Downloading file...',
    packingZip: 'Packing ZIP file...',
    fileDownloaded: '✅ File downloaded: {name}',
    packageDownloaded: '✅ SEO package downloaded! ({n} files)',
    filesDownloaded: '✅ {n} files downloaded separately.',
    errorPrefix: '❌ Error: ',
    preparing: 'Preparing...',

    noActiveTab: 'No active tab found.',
    cannotAnalyze: 'Cannot analyze this page (chrome:// or protected page).',
  },
};

/**
 * Helper: get a translated string with placeholder replacement.
 * Usage: t('imagesCount', { n: 5 }) → "5 kuvaa" or "5 images"
 */
let _currentLang = 'en';

function setLang(lang) {
  _currentLang = lang;
}

function t(key, params) {
  const str = (LOCALES[_currentLang] && LOCALES[_currentLang][key]) || LOCALES.fi[key] || key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => params[k] !== undefined ? params[k] : `{${k}}`);
}
