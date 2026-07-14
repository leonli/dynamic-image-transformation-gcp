/**
 * Shared jest mocks for the GCP client libraries, mirroring the AWS solution's
 * test/mock.ts (which mocks aws-sdk S3/Rekognition/SecretsManager).
 *
 * IMPORTANT: import this module BEFORE importing anything from ../src in a spec,
 * so the jest.mock factories are registered before the source modules require
 * the GCP clients.
 */

// ---------------------------------------------------------------------------
// @google-cloud/storage
// ---------------------------------------------------------------------------
export const mockStorageFile = {
  getMetadata: jest.fn(),
  download: jest.fn(),
};

export const mockStorageBucket = {
  file: jest.fn(() => mockStorageFile),
};

export const mockStorage = {
  bucket: jest.fn(() => mockStorageBucket),
};

jest.mock("@google-cloud/storage", () => ({
  Storage: jest.fn(() => mockStorage),
}));

// ---------------------------------------------------------------------------
// @google-cloud/vision — note vision-client.ts uses the DEFAULT import
// (`import vision from "@google-cloud/vision"`) and calls
// `new vision.ImageAnnotatorClient()`, so the mock must expose the client on
// both the default export and the named export.
// ---------------------------------------------------------------------------
export const mockVision = {
  faceDetection: jest.fn(),
  safeSearchDetection: jest.fn(),
};

jest.mock("@google-cloud/vision", () => {
  const ImageAnnotatorClient = jest.fn(() => mockVision);
  return {
    __esModule: true,
    default: { ImageAnnotatorClient },
    ImageAnnotatorClient,
  };
});

// ---------------------------------------------------------------------------
// @google-cloud/secret-manager
// ---------------------------------------------------------------------------
export const mockSecretManager = {
  accessSecretVersion: jest.fn(),
  getProjectId: jest.fn(async () => "test-project"),
};

jest.mock("@google-cloud/secret-manager", () => ({
  SecretManagerServiceClient: jest.fn(() => mockSecretManager),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Makes the storage mock return the given object bytes + metadata for any bucket/key. */
export function givenStorageObject(buffer: Buffer, metadata: Record<string, unknown> = {}): void {
  mockStorageFile.getMetadata.mockResolvedValue([metadata]);
  mockStorageFile.download.mockResolvedValue([buffer]);
}

/** Makes any storage lookup fail (surfaces as 404 NoSuchKey through StorageProvider). */
export function givenStorageFailure(message = "No such object"): void {
  mockStorageFile.getMetadata.mockRejectedValue(new Error(message));
  mockStorageFile.download.mockRejectedValue(new Error(message));
}

/** Restores the default bucket→file wiring after a test overrode implementations. */
export function restoreStorageWiring(): void {
  mockStorage.bucket.mockImplementation(() => mockStorageBucket);
  mockStorageBucket.file.mockImplementation(() => mockStorageFile);
}

/** Makes the secret-manager mock return the given JSON payload. */
export function givenSecret(payload: Record<string, string>): void {
  mockSecretManager.accessSecretVersion.mockResolvedValue([
    { payload: { data: Buffer.from(JSON.stringify(payload)) } },
  ]);
}
