import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

/**
 * Secret Manager wrapper mirroring the AWS SecretProvider: fetches the secret payload
 * (a JSON document, same convention as Secrets Manager SecretString) and caches it per
 * secret id for the lifetime of the instance.
 */
export class SecretProvider {
  private cachedSecretId: string | null = null;
  private cachedSecretString: string | null = null;

  constructor(private readonly client: SecretManagerServiceClient = new SecretManagerServiceClient()) {}

  /**
   * @param secretId Secret Manager secret name (short name or full resource path).
   *                 Short names resolve against GCP_PROJECT / ADC project, version "latest".
   */
  public async getSecret(secretId: string): Promise<string> {
    if (this.cachedSecretId === secretId && this.cachedSecretString !== null) {
      return this.cachedSecretString;
    }
    const name = secretId.includes("/")
      ? secretId
      : `projects/${process.env.GCP_PROJECT ?? (await this.client.getProjectId())}/secrets/${secretId}/versions/latest`;
    const [version] = await this.client.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString() ?? "";
    this.cachedSecretId = secretId;
    this.cachedSecretString = payload;
    return payload;
  }
}
