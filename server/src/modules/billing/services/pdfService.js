// Tax invoice, payment receipt and credit note PDFs, rendered from stored (immutable) records.
const path = require('path');
const PDFDocument = require('pdfkit');
const { STATE_NAMES } = require('../domain/gst');
const config = require('../config');

const LOGO = path.join(__dirname, '..', 'assets', 'capabble-mark.png');
const LOGO_SIZE = 34;

// The standard PDF fonts have no rupee glyph, so amounts print as "INR 1,234.50".
const inr = (paise) => {
  const abs = Math.abs(paise);
  return `${paise < 0 ? '-' : ''}INR ${Math.floor(abs / 100).toLocaleString('en-IN')}.${String(abs % 100).padStart(2, '0')}`;
};
const amount = (paise) => inr(paise).replace('INR ', '');

const date = (value) => (value ? new Intl.DateTimeFormat('en-IN', {
  timeZone: config.timezone, day: '2-digit', month: 'short', year: 'numeric'
}).format(new Date(value)) : '');

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowThousand(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

/** Indian system: crore, lakh, thousand. */
function inWords(paise) {
  let rupees = Math.floor(paise / 100);
  const p = paise % 100;
  if (rupees === 0 && p === 0) return 'Rupees Zero Only';
  const parts = [];
  const units = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']];
  for (const [size, label] of units) {
    if (rupees >= size) {
      const count = Math.floor(rupees / size);
      const words = count >= 1000 ? inWords(count * 100).replace(/^Rupees | Only$/g, '') : belowThousand(count);
      parts.push(`${words} ${label}`);
      rupees %= size;
    }
  }
  if (rupees) parts.push(belowThousand(rupees));
  let text = `Rupees ${parts.join(' ')}`.replace(/\s+/g, ' ').trim();
  if (p) text += ` and ${belowThousand(p)} Paise`;
  return `${text} Only`;
}

const stateLabel = (code) => (code ? `${STATE_NAMES[code] || 'Unknown'} (${code})` : '');

function addressLines(party) {
  return [
    party.addressLine1,
    party.addressLine2,
    [party.city, party.postalCode].filter(Boolean).join(' '),
    party.stateCode ? stateLabel(party.stateCode) : ''
  ].filter(Boolean);
}

function streamDoc(res, filename, draw) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: filename, Author: 'Capabble', Creator: 'Capabble billing' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}.pdf"`);
  doc.pipe(res);
  draw(doc);
  doc.end();
}

function header(doc, title, supplier) {
  const textX = 40 + LOGO_SIZE + 10;
  doc.image(LOGO, 40, 38, { width: LOGO_SIZE, height: LOGO_SIZE });
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#000').text(supplier.legalName || 'Capabble', textX, 40, { width: 260 });
  doc.font('Helvetica').fontSize(9).fillColor('#444');
  if (supplier.address) doc.text(supplier.address, textX, doc.y, { width: 260 });
  doc.text(supplier.gstin ? `GSTIN: ${supplier.gstin}` : 'GSTIN: Registration pending', textX, doc.y);
  if (supplier.stateCode) doc.text(`State: ${stateLabel(supplier.stateCode)}`, textX, doc.y);
  if (supplier.email) doc.text(supplier.email, textX, doc.y);
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(14).text(title, 360, 40, { width: 195, align: 'right' });
  doc.moveDown(0.5);
}

function keyValues(doc, x, y, rows, width = 195) {
  doc.fontSize(9);
  let cursor = y;
  for (const [label, value] of rows) {
    if (!value) continue;
    doc.font('Helvetica').fillColor('#555').text(label, x, cursor, { width: 90 });
    doc.font('Helvetica-Bold').fillColor('#000').text(String(value), x + 90, cursor, { width: width - 90, align: 'right' });
    cursor += 14;
  }
  return cursor;
}

function partyBlock(doc, label, party, x, y) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#555').text(label, x, y);
  doc.fillColor('#000').fontSize(10).text(party.legalName || party.tenantName || '', x, y + 13, { width: 250 });
  doc.font('Helvetica').fontSize(9);
  for (const line of addressLines(party)) doc.text(line, { width: 250 });
  doc.text(party.gstin ? `GSTIN: ${party.gstin}` : 'GSTIN: Unregistered', { width: 250 });
  if (party.email) doc.text(party.email, { width: 250 });
  return doc.y;
}

function table(doc, y, columns, rows) {
  const left = 40;
  const total = 515;
  let x = left;
  doc.rect(left, y, total, 18).fill('#f2f2f2').fillColor('#000');
  doc.font('Helvetica-Bold').fontSize(8);
  for (const col of columns) {
    doc.text(col.label, x + 4, y + 5, { width: col.width - 8, align: col.align || 'left' });
    x += col.width;
  }
  let cursor = y + 22;
  doc.font('Helvetica').fontSize(8);
  for (const row of rows) {
    x = left;
    const height = Math.max(...columns.map((col, i) => doc.heightOfString(String(row[i] ?? ''), { width: col.width - 8 })));
    if (cursor + height > 760) {
      doc.addPage();
      cursor = 40;
    }
    columns.forEach((col, i) => {
      doc.text(String(row[i] ?? ''), x + 4, cursor, { width: col.width - 8, align: col.align || 'left' });
      x += col.width;
    });
    cursor += height + 6;
    doc.moveTo(left, cursor - 3).lineTo(left + total, cursor - 3).strokeColor('#e5e5e5').lineWidth(0.5).stroke();
  }
  return cursor;
}

function totals(doc, y, rows) {
  let cursor = y + 4;
  for (const [label, value, bold] of rows) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9);
    doc.text(label, 330, cursor, { width: 120, align: 'right' });
    doc.text(value, 455, cursor, { width: 100, align: 'right' });
    cursor += bold ? 16 : 13;
  }
  return cursor;
}

function taxRows(record) {
  const rows = [];
  if (record.igstPaise > 0) rows.push(['IGST 18%', amount(record.igstPaise)]);
  if (record.cgstPaise > 0 || record.sgstPaise > 0) {
    rows.push(['CGST 9%', amount(record.cgstPaise)]);
    rows.push(['SGST 9%', amount(record.sgstPaise)]);
  }
  return rows;
}

function footer(doc, note) {
  doc.font('Helvetica').fontSize(8).fillColor('#666')
    .text(note, 40, 790, { width: 515, align: 'center' });
}

function renderInvoice(res, invoice) {
  streamDoc(res, invoice.number, (doc) => {
    header(doc, 'TAX INVOICE', invoice.supplier);
    keyValues(doc, 360, 62, [
      ['Invoice no.', invoice.number],
      ['Invoice date', date(invoice.issuedAt)],
      ['Due date', date(invoice.dueAt)],
      ['Status', invoice.status.toUpperCase()],
      ['Place of supply', stateLabel(invoice.placeOfSupply)]
    ]);
    const bottom = partyBlock(doc, 'BILL TO', invoice.buyer, 40, 150);
    let y = Math.max(bottom, 210) + 10;
    if (invoice.periodStart && invoice.periodEnd) {
      doc.font('Helvetica').fontSize(9).text(`Service period: ${date(invoice.periodStart)} to ${date(new Date(new Date(invoice.periodEnd).getTime() - 1))}${invoice.studentsBilled ? `  ·  Students billed: ${invoice.studentsBilled}` : ''}`, 40, y);
      y += 18;
    }
    y = table(doc, y, [
      { label: '#', width: 22 },
      { label: 'Description', width: 203 },
      { label: 'SAC', width: 50 },
      { label: 'Qty', width: 35, align: 'right' },
      { label: 'Rate', width: 65, align: 'right' },
      { label: 'Discount', width: 65, align: 'right' },
      { label: 'Taxable', width: 75, align: 'right' }
    ], invoice.lines.map((line) => [
      line.position, line.description, line.hsnSac, line.quantity, amount(line.unitPaise), amount(line.discountPaise), amount(line.taxablePaise)
    ]));
    y = totals(doc, y, [
      ['Subtotal', amount(invoice.subtotalPaise)],
      ...(invoice.discountPaise ? [['Discount', `-${amount(invoice.discountPaise)}`]] : []),
      ['Taxable value', amount(invoice.taxablePaise)],
      ...taxRows(invoice),
      ['Total', inr(invoice.totalPaise), true],
      ...(invoice.amountPaidPaise ? [['Paid', amount(invoice.amountPaidPaise)]] : []),
      ...(invoice.amountCreditedPaise ? [['Credited', amount(invoice.amountCreditedPaise)]] : []),
      ...(invoice.status === 'open' ? [['Balance due', inr(invoice.outstandingPaise ?? invoice.totalPaise), true]] : [])
    ]);
    doc.font('Helvetica').fontSize(9).text(`Amount in words: ${inWords(invoice.totalPaise)}`, 40, y + 8, { width: 515 });
    doc.text('Tax is not payable on reverse charge basis.', { width: 515 });
    if (invoice.notes) doc.moveDown(0.5).text(invoice.notes, { width: 515 });
    footer(doc, 'This is a computer-generated invoice and does not need a signature.');
  });
}

function renderReceipt(res, { payment, invoice }) {
  streamDoc(res, payment.receiptNumber, (doc) => {
    header(doc, 'PAYMENT RECEIPT', invoice.supplier);
    keyValues(doc, 360, 62, [
      ['Receipt no.', payment.receiptNumber],
      ['Date', date(payment.capturedAt)],
      ['Against invoice', invoice.number]
    ]);
    const bottom = partyBlock(doc, 'RECEIVED FROM', invoice.buyer, 40, 150);
    const method = {
      upi: 'UPI',
      card: 'Card',
      netbanking: 'Netbanking',
      wallet: 'Wallet',
      emi: 'EMI',
      offline_bank: 'Bank transfer',
      offline_cheque: 'Cheque',
      offline_cash: 'Cash'
    }[payment.method] || 'Online';
    const y = keyValues(doc, 40, Math.max(bottom, 210) + 20, [
      ['Amount received', inr(payment.amountPaise)],
      ['Payment method', method],
      ['Reference', payment.reference || payment.providerPaymentId || ''],
      ['Invoice total', inr(invoice.totalPaise)],
      ['Balance due', inr(Math.max(0, invoice.totalPaise - invoice.amountPaidPaise - invoice.amountCreditedPaise))]
    ], 300);
    doc.font('Helvetica').fontSize(9).text(`Amount in words: ${inWords(payment.amountPaise)}`, 40, y + 10, { width: 515 });
    footer(doc, 'This is a computer-generated receipt and does not need a signature.');
  });
}

function renderCreditNote(res, { note, invoice }) {
  streamDoc(res, note.number, (doc) => {
    header(doc, 'CREDIT NOTE', invoice.supplier);
    keyValues(doc, 360, 62, [
      ['Credit note no.', note.number],
      ['Date', date(note.issuedAt)],
      ['Original invoice', invoice.number],
      ['Invoice date', date(invoice.issuedAt)],
      ['Place of supply', stateLabel(invoice.placeOfSupply)]
    ]);
    const bottom = partyBlock(doc, 'ISSUED TO', invoice.buyer, 40, 150);
    let y = Math.max(bottom, 210) + 15;
    doc.font('Helvetica').fontSize(9).text(`Reason: ${note.reason}`, 40, y, { width: 515 });
    y = totals(doc, doc.y + 10, [
      ['Taxable value', amount(note.taxablePaise)],
      ...taxRows(note),
      ['Credit total', inr(note.totalPaise), true],
      ...(note.refundPaise ? [['Refunded', amount(note.refundPaise)]] : [])
    ]);
    doc.font('Helvetica').fontSize(9).text(`Amount in words: ${inWords(note.totalPaise)}`, 40, y + 8, { width: 515 });
    footer(doc, 'This is a computer-generated credit note and does not need a signature.');
  });
}

module.exports = { renderInvoice, renderReceipt, renderCreditNote, inWords, inr };
