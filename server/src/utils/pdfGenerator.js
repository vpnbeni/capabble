const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const { resolveChromeExecutablePath } = require('./chromeExecutable');

class PDFGenerator {
  constructor() {
    this.templatesPath = path.join(__dirname, '../templates');
  }

  /**
   * Generate a PDF from a Handlebars template.
   *
   * @param {string} templateName  — name (without .html) in /templates
   * @param {object} data          — Handlebars context
   * @param {object} [options]     — extra options forwarded to page.pdf()
   * @returns {Promise<Buffer>}
   */
  async generatePDF(templateName, data, options = {}) {
    let browser = null;

    try {
      // Read template file
      const templatePath = path.join(this.templatesPath, `${templateName}.html`);
      const templateContent = await fs.readFile(templatePath, 'utf-8');

      // Compile template with Handlebars
      const template = handlebars.compile(templateContent);
      const html = template(data);

      // Keep Chromium flags platform-aware to avoid Windows crashes.
      const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ];

      if (process.platform === 'linux') {
        launchArgs.push(
          '--disable-gpu',
          '--single-process',
          '--no-zygote',
          '--disable-software-rasterizer'
        );
      }

      // Launch browser
      browser = await puppeteer.launch({
        headless: 'new',
        executablePath: await resolveChromeExecutablePath(),
        args: launchArgs,
        pipe: true,
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Generate PDF — let CSS @page rules control size, orientation & margins
      // via preferCSSPageSize.  Puppeteer margin is set to 0 so the CSS @page
      // margin is the sole source of truth.
      const pdfBytes = await page.pdf({
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        preferCSSPageSize: true,
        ...options,
      });
      const pdfBuffer = Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);

      await browser.close();
      browser = null;

      return pdfBuffer;
    } catch (error) {
      console.error('PDF Generation Error:', error);
      throw new Error(`Failed to generate PDF: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  async generateMainGate(data) {
    return this.generatePDF('main-gate', data);
  }

  async generateRoomFolderSlip(data) {
    return this.generatePDF('room-folder-slip', data);
  }

  async generateRoomDoorSlip(data) {
    return this.generatePDF('room-door-slip', data);
  }

  async generateCBSECopy(data) {
    return this.generatePDF('cbse-copy', data);
  }

  async generateAnswerSheetDispatchRecord(data) {
    return this.generatePDF('answer-sheet-dispatch-record', data);
  }

  async generateAnswerSheetConsolidatedRecord(data) {
    return this.generatePDF('answer-sheet-consolidated-record', data);
  }

  async generateAttendanceAbsenteeList(data) {
    return this.generatePDF('attendance-absentee-list', data);
  }

  async generateFunctionaryDutyRecord(data) {
    // Do NOT pass format/landscape to page.pdf() — the template's
    // @page { size: A4 landscape; margin: 10mm } handles everything.
    // Passing them caused Puppeteer to apply landscape rotation on top
    // of the CSS-defined landscape, resulting in content sized for
    // portrait width on a landscape page.
    return this.generatePDF('functionary-duty-record', data);
  }
}

module.exports = new PDFGenerator();
