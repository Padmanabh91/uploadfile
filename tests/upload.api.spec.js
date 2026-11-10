const { test, expect } = require('@playwright/test');
const {
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
} = require('./support/files');

const uploadFile = (request, file) => request.post('/upload', { multipart: { file } });

async function expectAccepted(response, filename) {
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ message: 'Uploaded successfully', filename });
}

async function expectRejected(response, status, error) {
  expect(response.status()).toBe(status);
  expect(await response.json()).toEqual({ error });
}

test.describe('POST /upload', () => {
  const accepted = [
    ['valid PDF', validPdf()],
    ['valid .xlsx', validXlsx()],
    ['valid .docx', validDocx()],
    ['valid .doc', validDoc()],
    ['PDF with an upper-case extension', validPdf('REPORT.PDF')],
  ];

  for (const [title, file] of accepted) {
    test(`accepts a ${title}`, async ({ request }) => {
      await expectAccepted(await uploadFile(request, file), file.name);
    });
  }

  const wrongType = [
    ['.txt file', textFile()],
    ['.jpg file', jpgFile()],
    ['.exe file', exeFile()],
    ['.exe renamed .pdf', exeRenamedPdf()],
    ['.exe renamed .xlsx', exeRenamedXlsx()],
    ['.docx renamed .xlsx', docxRenamedXlsx()],
    ['.xlsx renamed .docx', xlsxRenamedDocx()],
    ['real PDF named .txt', validPdf('document.txt')],
  ];

  for (const [title, file] of wrongType) {
    test(`rejects a ${title}`, async ({ request }) => {
      await expectRejected(await uploadFile(request, file), 415, MESSAGES.type);
    });
  }

  test('accepts a file of exactly 2 MB', async ({ request }) => {
    const file = pdfOfSize(MAX_SIZE);
    await expectAccepted(await uploadFile(request, file), file.name);
  });

  test('rejects a file one byte over 2 MB', async ({ request }) => {
    await expectRejected(await uploadFile(request, pdfOfSize(MAX_SIZE + 1)), 413, MESSAGES.tooLarge);
  });

  test('rejects a request body far over the limit', async ({ request }) => {
    await expectRejected(await uploadFile(request, pdfOfSize(5 * MB)), 413, MESSAGES.tooLarge);
  });

  test('rejects an empty file', async ({ request }) => {
    await expectRejected(await uploadFile(request, emptyPdf()), 400, MESSAGES.empty);
  });

  test('rejects a multipart request with no file field', async ({ request }) => {
    const response = await request.post('/upload', { multipart: { note: 'no file here' } });
    await expectRejected(response, 400, MESSAGES.missing);
  });

  test('rejects a request with no body', async ({ request }) => {
    await expectRejected(await request.post('/upload'), 400, MESSAGES.missing);
  });
});
