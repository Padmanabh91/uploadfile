class UploadPage {
  constructor(page) {
    this.page = page;
    this.fileInput = page.locator('#file');
    this.uploadButton = page.getByRole('button', { name: 'Upload' });
    this.successMessage = page.locator('#success');
    this.errorMessage = page.locator('#error');
  }

  async goto() {
    await this.page.goto('/');
  }

  // Leave `file` out to submit the form with nothing selected.
  async upload(file) {
    if (file) await this.fileInput.setInputFiles(file);
    await this.uploadButton.click();
  }
}

module.exports = { UploadPage };
