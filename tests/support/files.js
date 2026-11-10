// Every test file is built in memory, so nothing binary is committed.

const MB = 1024 * 1024;
const MAX_SIZE = 2 * MB;

const MESSAGES = {
  type: 'Only PDF, Word (.doc, .docx) and Excel (.xlsx) files are allowed',
  tooLarge: 'File is too large (max 2 MB)',
  empty: 'File is empty',
  missing: 'Please choose a file',
};

function buildPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

// Writes an uncompressed ZIP archive.
function buildZip(entries) {
  const records = [];
  const directory = [];
  let offset = 0;

  for (const [entryName, text] of entries) {
    const name = Buffer.from(entryName);
    const data = Buffer.from(text);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x21, 12); // 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    records.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, centralDirectory, end]);
}

const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelationships = 'http://schemas.openxmlformats.org/package/2006/relationships';

function buildDocx() {
  const main = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  return buildZip([
    [
      '[Content_Types].xml',
      `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    ],
    [
      '_rels/.rels',
      `${xml}<Relationships xmlns="${packageRelationships}">` +
        `<Relationship Id="rId1" Type="${relationships}/officeDocument" Target="word/document.xml"/>` +
        '</Relationships>',
    ],
    [
      'word/document.xml',
      `${xml}<w:document xmlns:w="${main}"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
    ],
  ]);
}

// Only the 512-byte OLE header of a legacy .doc: the server checks nothing past the signature.
function buildDoc() {
  const header = Buffer.alloc(512);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header);
  header.writeUInt16LE(0x003e, 24); // minor version
  header.writeUInt16LE(0x0003, 26); // major version
  header.writeUInt16LE(0xfffe, 28); // byte order mark
  header.writeUInt16LE(9, 30); // 512-byte sectors
  header.writeUInt16LE(6, 32); // 64-byte mini sectors
  return header;
}

function buildXlsx() {
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  return buildZip([
    [
      '[Content_Types].xml',
      `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
    ],
    [
      '_rels/.rels',
      `${xml}<Relationships xmlns="${packageRelationships}">` +
        `<Relationship Id="rId1" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/>` +
        '</Relationships>',
    ],
    [
      'xl/workbook.xml',
      `${xml}<workbook xmlns="${main}" xmlns:r="${relationships}">` +
        '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `${xml}<Relationships xmlns="${packageRelationships}">` +
        `<Relationship Id="rId1" Type="${relationships}/worksheet" Target="worksheets/sheet1.xml"/>` +
        '</Relationships>',
    ],
    [
      'xl/worksheets/sheet1.xml',
      `${xml}<worksheet xmlns="${main}"><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`,
    ],
  ]);
}

const file = (name, mimeType, buffer) => ({ name, mimeType, buffer });

const PDF_TYPE = 'application/pdf';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOC_TYPE = 'application/msword';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const exeBytes = () => Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(256, 0x90)]);

const validPdf = (name = 'valid.pdf') => file(name, PDF_TYPE, buildPdf());
const validXlsx = (name = 'valid.xlsx') => file(name, XLSX_TYPE, buildXlsx());
const validDocx = (name = 'valid.docx') => file(name, DOCX_TYPE, buildDocx());
const validDoc = (name = 'valid.doc') => file(name, DOC_TYPE, buildDoc());
const textFile = () => file('notes.txt', 'text/plain', Buffer.from('plain text'));
const jpgFile = () =>
  file('photo.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]));
const exeFile = () => file('program.exe', 'application/octet-stream', exeBytes());
// The browser-style MIME type is deliberately misleading: only the content gives these away.
const exeRenamedPdf = () => file('renamed.pdf', PDF_TYPE, exeBytes());
const exeRenamedXlsx = () => file('renamed.xlsx', XLSX_TYPE, exeBytes());
const docxRenamedXlsx = () => file('renamed.xlsx', XLSX_TYPE, buildDocx());
const xlsxRenamedDocx = () => file('renamed.docx', DOCX_TYPE, buildXlsx());
const emptyPdf = () => file('empty.pdf', PDF_TYPE, Buffer.alloc(0));

// A valid PDF padded with trailing spaces to exactly the requested size.
function pdfOfSize(size, name = `size-${size}.pdf`) {
  const pdf = buildPdf();
  return file(name, PDF_TYPE, Buffer.concat([pdf, Buffer.alloc(size - pdf.length, 0x20)]));
}

module.exports = {
  MAX_SIZE,
  MB,
  MESSAGES,
  docxRenamedXlsx,
  emptyPdf,
  exeFile,
  exeRenamedPdf,
  exeRenamedXlsx,
  jpgFile,
  pdfOfSize,
  textFile,
  validDoc,
  validDocx,
  validPdf,
  validXlsx,
  xlsxRenamedDocx,
};
