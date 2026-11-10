const { test, expect } = require('@playwright/test');
const { UploadPage } = require('./pages/upload.page');
const {
  MAX_SIZE,
  MESSAGES,
  emptyPdf,
  exeFile,
  exeRenamedPdf,
  jpgFile,
  pdfOfSize,
  textFile,
  validPdf,
  validXlsx,
} = require('./support/files');

test.describe('Upload page', () => {
  let uploadPage;

  async function expectSuccess(filename) {
    await expect(uploadPage.successMessage).toHaveText(`Uploaded successfully: ${filename}`);
    await expect(uploadPage.errorMessage).toBeHidden();
  }

  async function expectError(message) {
    await expect(uploadPage.errorMessage).toHaveText(message);
    await expect(uploadPage.successMessage).toBeHidden();
  }

  test.beforeEach(async ({ page }) => {
    uploadPage = new UploadPage(page);
    await uploadPage.goto();
  });

  for (const [title, file] of [
    ['PDF', validPdf()],
    ['.xlsx', validXlsx()],
  ]) {
    test(`uploads a valid ${title} and shows its filename`, async () => {
      await uploadPage.upload(file);
      await expectSuccess(file.name);
    });
  }

  for (const [title, file] of [
    ['.txt', textFile()],
    ['.jpg', jpgFile()],
    ['.exe', exeFile()],
    ['.exe renamed .pdf', exeRenamedPdf()],
  ]) {
    test(`shows the file type error for ${title}`, async () => {
      await uploadPage.upload(file);
      await expectError(MESSAGES.type);
    });
  }

  test('accepts a file of exactly 2 MB', async () => {
    const file = pdfOfSize(MAX_SIZE);
    await uploadPage.upload(file);
    await expectSuccess(file.name);
  });

  test('shows the size error one byte over 2 MB', async () => {
    await uploadPage.upload(pdfOfSize(MAX_SIZE + 1));
    await expectError(MESSAGES.tooLarge);
  });

  test('shows the empty file error', async () => {
    await uploadPage.upload(emptyPdf());
    await expectError(MESSAGES.empty);
  });

  test('shows the missing file error when nothing is selected', async () => {
    await uploadPage.upload();
    await expectError(MESSAGES.missing);
  });

  test('replaces an earlier error after a successful upload', async () => {
    await uploadPage.upload(textFile());
    await expectError(MESSAGES.type);
    await uploadPage.upload(validPdf());
    await expectSuccess('valid.pdf');
  });

  test('Remove empties the input so Upload reports a missing file', async () => {
    await uploadPage.fileInput.setInputFiles(validPdf());
    await uploadPage.removeButton.click();
    await expect(uploadPage.fileInput).toHaveValue('');
    await uploadPage.upload();
    await expectError(MESSAGES.missing);
  });
});
