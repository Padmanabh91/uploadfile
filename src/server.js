const path = require('node:path');
const express = require('express');

const MAX_FILE_SIZE = 2 * 1024 * 1024;
// Leaves room for the multipart boundary and headers around a maximum-size file.
const MAX_BODY_SIZE = MAX_FILE_SIZE + 64 * 1024;

const MESSAGES = {
  type: 'Only PDF, Word (.doc, .docx) and Excel (.xlsx) files are allowed',
  tooLarge: 'File is too large (max 2 MB)',
  empty: 'File is empty',
  missing: 'Please choose a file',
};

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const FILE_TYPES = {
  '.pdf': { signature: Buffer.from('%PDF-', 'latin1') },
  '.doc': { signature: OLE_SIGNATURE },
  // Modern Office files are ZIP archives, told apart by their top-level folder.
  '.docx': { signature: ZIP_SIGNATURE, folder: 'word/' },
  '.xlsx': { signature: ZIP_SIGNATURE, folder: 'xl/' },
};

const ZIP_END_RECORD = 0x06054b50;
const ZIP_END_RECORD_SIZE = 22;
const ZIP_DIRECTORY_ENTRY = 0x02014b50;
const ZIP_DIRECTORY_ENTRY_SIZE = 46;
const ZIP_MAX_COMMENT_SIZE = 0xffff;

function findZipEndRecord(bytes) {
  const last = bytes.length - ZIP_END_RECORD_SIZE;
  for (let offset = last; offset >= Math.max(0, last - ZIP_MAX_COMMENT_SIZE); offset -= 1) {
    if (
      bytes.readUInt32LE(offset) === ZIP_END_RECORD &&
      offset + ZIP_END_RECORD_SIZE + bytes.readUInt16LE(offset + 20) === bytes.length
    ) {
      return offset;
    }
  }
  return -1;
}

// Reads names from the ZIP directory, so text inside an entry can't pass as a folder.
// A malformed archive yields no names, which fails validation.
function zipEntryNames(bytes) {
  const end = findZipEndRecord(bytes);
  if (end === -1) return [];

  const names = [];
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    if (offset + ZIP_DIRECTORY_ENTRY_SIZE > end) return [];
    if (bytes.readUInt32LE(offset) !== ZIP_DIRECTORY_ENTRY) return [];

    const nameStart = offset + ZIP_DIRECTORY_ENTRY_SIZE;
    const nameEnd = nameStart + bytes.readUInt16LE(offset + 28);
    if (nameEnd > end) return [];

    names.push(bytes.toString('latin1', nameStart, nameEnd));
    offset = nameEnd + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  return names;
}

async function readUploadedFile(req) {
  if (!Buffer.isBuffer(req.body)) return null;
  try {
    // Node's built-in Response parses multipart bodies, so no upload library is needed.
    const response = new Response(req.body, {
      headers: { 'content-type': req.headers['content-type'] },
    });
    const file = (await response.formData()).get('file');
    return file instanceof File && file.name ? file : null;
  } catch {
    return null;
  }
}

async function validate(file) {
  if (!file) return { status: 400, message: MESSAGES.missing };

  const type = FILE_TYPES[path.extname(file.name).toLowerCase()];
  if (!type) return { status: 415, message: MESSAGES.type };
  if (file.size === 0) return { status: 400, message: MESSAGES.empty };
  if (file.size > MAX_FILE_SIZE) return { status: 413, message: MESSAGES.tooLarge };

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.subarray(0, type.signature.length).equals(type.signature)) {
    return { status: 415, message: MESSAGES.type };
  }
  if (type.folder && !zipEntryNames(bytes).some((name) => name.startsWith(type.folder))) {
    return { status: 415, message: MESSAGES.type };
  }

  return null;
}

const app = express();

app.use(express.static(path.join(__dirname, '..', 'public')));

// Files are validated in memory and never written to disk.
app.post(
  '/upload',
  express.raw({ type: 'multipart/form-data', limit: MAX_BODY_SIZE }),
  async (req, res, next) => {
    try {
      const file = await readUploadedFile(req);
      const failure = await validate(file);
      if (failure) return res.status(failure.status).json({ error: failure.message });
      return res.json({ message: 'Uploaded successfully', filename: file.name });
    } catch (error) {
      return next(error);
    }
  },
);

app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: MESSAGES.tooLarge });
  }
  console.error(error);
  return res.status(500).json({ error: 'Upload failed, please try again' });
});

const port = Number(process.env.PORT) || 3210;
app.listen(port, '127.0.0.1', () => {
  console.log(`Upload app running at http://127.0.0.1:${port}`);
});
