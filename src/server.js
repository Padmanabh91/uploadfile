const path = require('node:path');
const express = require('express');

const MAX_FILE_SIZE = 2 * 1024 * 1024;
// Leaves room for the multipart boundary and headers around a maximum-size file.
const MAX_BODY_SIZE = MAX_FILE_SIZE + 64 * 1024;

const MESSAGES = {
  type: 'Only PDF and Excel (.xlsx) files are allowed',
  tooLarge: 'File is too large (max 2 MB)',
  empty: 'File is empty',
  missing: 'Please choose a file',
};

const SIGNATURES = {
  '.pdf': Buffer.from('%PDF-', 'latin1'),
  '.xlsx': Buffer.from([0x50, 0x4b, 0x03, 0x04]), // .xlsx files are ZIP archives
};

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

  const signature = SIGNATURES[path.extname(file.name).toLowerCase()];
  if (!signature) return { status: 415, message: MESSAGES.type };
  if (file.size === 0) return { status: 400, message: MESSAGES.empty };
  if (file.size > MAX_FILE_SIZE) return { status: 413, message: MESSAGES.tooLarge };

  const header = Buffer.from(await file.slice(0, signature.length).arrayBuffer());
  if (!header.equals(signature)) return { status: 415, message: MESSAGES.type };

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
