# PDF Output Specifications

## Standard Page Size

### A4 Paper Size - MANDATORY
All seating plan PDF outputs MUST use A4 size paper.

**Dimensions:**
- **Width**: 210mm (8.27 inches)
- **Height**: 297mm (11.69 inches)
- **Orientation**: Portrait (default)
- **Aspect Ratio**: 1:√2 (1:1.414)

### Why A4?
- International standard (ISO 216)
- Used by CBSE and most Indian educational institutions
- Widely available in India
- Standard printer paper size
- Consistent with examination board requirements

## Page Specifications

### All Four Formats Use A4

#### 1. Notice Board Format
```
Page Size: A4 (210mm × 297mm)
Orientation: Portrait
Margins: TBD based on provided template
```

#### 2. Invigilator Slip Format
```
Page Size: A4 (210mm × 297mm)
Orientation: Portrait
Margins: TBD based on provided template
```

#### 3. Room Door Slip Format
```
Page Size: A4 (210mm × 297mm)
Orientation: Portrait or Landscape (TBD)
Margins: TBD based on provided template
```

#### 4. CBSE Copy Format
```
Page Size: A4 (210mm × 297mm)
Orientation: Portrait
Margins: TBD based on provided template
```

## Technical Implementation

### Puppeteer Configuration
```javascript
const pdfOptions = {
  format: 'A4',              // Enforces 210mm × 297mm
  width: '210mm',            // Explicit width
  height: '297mm',           // Explicit height
  printBackground: true,     // Include background colors/images
  preferCSSPageSize: false,  // Ignore CSS @page size, use A4
  displayHeaderFooter: false // Custom headers/footers in HTML
}
```

### CSS @page Rule
```css
@page {
  size: A4 portrait;         /* 210mm × 297mm */
  margin: 20mm 25mm;         /* Adjust per format */
}

@media print {
  body {
    width: 210mm;
    height: 297mm;
  }
}
```

### HTML Meta Tags
```html
<meta name="viewport" content="width=210mm, height=297mm">
<style>
  * {
    box-sizing: border-box;
  }
  body {
    width: 210mm;
    min-height: 297mm;
    margin: 0;
    padding: 0;
  }
</style>
```

## Print Settings

### Recommended Printer Settings
- **Paper Size**: A4 (210 × 297 mm)
- **Orientation**: Portrait (or as specified)
- **Scale**: 100% (No scaling)
- **Margins**: As defined in template
- **Color**: Black & White or Color (as needed)
- **Quality**: High/Best

### Browser Print Settings
When printing from browser:
- Paper size: A4
- Margins: None (margins in PDF)
- Scale: Default (100%)
- Background graphics: On

## Quality Assurance

### Verification Checklist
- [ ] PDF opens at A4 size in viewer
- [ ] No content is cut off
- [ ] Margins are correct
- [ ] Text is readable
- [ ] Tables fit within page
- [ ] No overflow or clipping
- [ ] Print preview shows A4
- [ ] Physical print matches digital

### Testing Procedure
1. Generate PDF
2. Open in Adobe Reader/Chrome
3. Check document properties (should show A4)
4. Print preview
5. Print test page
6. Measure with ruler (should be 210mm × 297mm)

## Common Issues and Solutions

### Issue 1: Content Overflow
**Problem**: Content doesn't fit on A4 page
**Solution**: 
- Reduce font size
- Adjust margins
- Use smaller line spacing
- Split into multiple pages

### Issue 2: Wrong Page Size
**Problem**: PDF generates as Letter (8.5" × 11")
**Solution**:
- Set `format: 'A4'` explicitly
- Use `preferCSSPageSize: false`
- Check printer default settings

### Issue 3: Scaling Issues
**Problem**: Content appears too small/large
**Solution**:
- Use mm/cm units instead of px
- Set explicit width/height
- Test with actual A4 paper

## File Naming Convention

```
Format: [Type]_[Date]_[Subject]_[Class].pdf

Examples:
- NoticeBoard_2026-02-17_Math_10.pdf
- RoomFolderSlip_Room101_2026-02-17_Math_10.pdf
- RoomDoorSlip_Room101_2026-02-17_Math_10.pdf
- CBSECopy_2026-02-17_Math_10.pdf
```

## Metadata in PDF

Each generated PDF should include:
```javascript
{
  title: 'Seating Plan - Mathematics - Class 10',
  author: 'Examination Management System',
  subject: 'Seating Arrangement',
  keywords: 'seating, examination, CBSE',
  creator: 'Capabble',
  producer: 'Puppeteer PDF Generator',
  creationDate: new Date(),
  format: 'A4',
  pageSize: '210mm × 297mm'
}
```

## Storage and Archival

### File Size Expectations
- Notice Board: ~50-200 KB (text-heavy)
- Invigilator Slip: ~30-100 KB per room
- Room Door Slip: ~20-50 KB per room
- CBSE Copy: ~100-500 KB (table-heavy)

### Compression
- Use PDF compression
- Optimize images if any
- Remove unnecessary metadata
- Target: < 1 MB per file

## Compliance

### Standards Adherence
- ✅ ISO 216 (A4 paper size)
- ✅ PDF/A-1b (archival)
- ✅ CBSE format requirements
- ✅ Accessibility (readable fonts)

### Legal Requirements
- Must be printable on standard A4 paper
- Must be readable without magnification
- Must maintain data integrity
- Must be archivable for required period

---

## Summary

**All seating plan PDFs MUST be generated in A4 size (210mm × 297mm) to ensure:**
- Compatibility with standard printers
- Compliance with CBSE requirements
- Consistency across all formats
- Easy printing and distribution
- Professional appearance

**No exceptions to A4 size standard.**
