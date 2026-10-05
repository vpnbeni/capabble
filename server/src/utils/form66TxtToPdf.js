const puppeteer = require('puppeteer');
const { resolveChromeExecutablePath } = require('./chromeExecutable');

/**
 * Convert Form 66 TXT content to PDF preserving exact formatting
 * @param {string} txtContent - The TXT file content
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function convertTxtToPdf(txtContent) {
  let browser = null;

  try {
    console.log('📄 Converting TXT to PDF...');

    // Split content by form feed character (page breaks)
    const pages = txtContent.split('\f').filter((page) => page.trim());
    console.log(`Found ${pages.length} pages in TXT file`);

    // Generate HTML with monospace font preserving formatting
    const html = generateHtml(pages);

    // Launch Puppeteer
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: await resolveChromeExecutablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });

    await browser.close();
    browser = null;

    console.log(`✅ PDF generated: ${pdfBuffer.length} bytes`);
    return pdfBuffer;
  } catch (error) {
    console.error('❌ TXT to PDF conversion error:', error);

    if (browser) {
      await browser.close().catch(() => { });
    }

    throw new Error(`Failed to convert TXT to PDF: ${error.message}`);
  }
}

/**
 * Generate HTML from TXT pages with proper formatting
 * @param {string[]} pages - Array of page contents
 * @returns {string} - HTML string
 */
function generateHtml(pages) {
  const pageStyles = `
    @page {
      size: A4 landscape;
      margin: 10mm;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.3;
      margin: 0;
      padding: 0;
    }
    .page {
      page-break-after: always;
      white-space: pre;
      overflow: hidden;
    }
    .page:last-child {
      page-break-after: avoid;
    }
  `;

  const pagesHtml = pages.map((pageContent, index) => {
    // Escape HTML entities
    const escapedContent = pageContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    return `<div class="page" data-page="${index + 1}">${escapedContent}</div>`;
  }).join('\n');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>${pageStyles}</style>
    </head>
    <body>
      ${pagesHtml}
    </body>
    </html>
  `;
}

/**
 * Extract page information (date, subject) from page content
 * @param {string} pageContent - Single page content
 * @returns {Object|null} - { date, subjectCode, subject } or null
 */
function extractPageInfo(pageContent) {
  // Look for date and subject - Format: "15.02.2025 184 ENGLISH (LANGUAGE AND LITERATURE)"
  const dateMatch = pageContent.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d+)\s+([^\n]+)/);
  if (dateMatch) {
    return {
      date: dateMatch[1],
      subjectCode: dateMatch[2],
      subject: dateMatch[3].trim()
    };
  }
  return null;
}

/**
 * Split TXT content into pages and extract info from each
 * @param {string} txtContent - The TXT file content
 * @returns {Array<{content: string, date: string, subjectCode: string, subject: string, pageIndex: number}>}
 */
function splitIntoPages(txtContent) {
  const pages = txtContent.split('\f').filter((page) => page.trim());

  return pages.map((content, index) => {
    const info = extractPageInfo(content);
    return {
      content,
      date: info?.date || '',
      subjectCode: info?.subjectCode || '',
      subject: info?.subject || '',
      pageIndex: index
    };
  });
}

module.exports = {
  convertTxtToPdf,
  generateHtml,
  extractPageInfo,
  splitIntoPages
};
