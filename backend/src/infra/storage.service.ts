import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Global, Injectable, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { env } from '../config/env';
import type { Id } from '../common/ids';

/** S3-compatible object storage. Credentials never leave the backend; clients get short-lived signed URLs. */
@Injectable()
export class StorageService implements OnApplicationBootstrap {
  private readonly log = new Logger('Storage');
  private readonly s3: S3Client;
  /** Signs URLs against the browser-reachable host when it differs from the internal one (e.g. Docker). */
  private readonly signer: S3Client;
  private readonly bucket: string;

  constructor() {
    const e = env();
    this.bucket = e.S3_BUCKET;
    const client = (endpoint?: string) => new S3Client({
      region: e.S3_REGION,
      endpoint,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
    });
    this.s3 = client(e.S3_ENDPOINT);
    this.signer = e.S3_PUBLIC_ENDPOINT ? client(e.S3_PUBLIC_ENDPOINT) : this.s3;
  }

  /** Runs in the background so boot never blocks on storage; the store may still be starting (e.g. in Compose). */
  onApplicationBootstrap() {
    void this.ensureBucket();
  }

  private async ensureBucket(attempts = 15) {
    const status = (err: unknown) => (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    for (let i = 1; i <= attempts; i++) {
      try {
        await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
        return;
      } catch (headErr) {
        let err = headErr;
        if (status(err) === 404) {
          try {
            await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
            this.log.log(`Created bucket "${this.bucket}"`);
            return;
          } catch (e) {
            if (status(e) === 409) return;
            err = e;
          }
        }
        if (i === attempts) this.log.warn(`Bucket "${this.bucket}" is not reachable: ${(err as Error).message || (err as Error).name}`);
        else await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  /** companies/{companyId}/services/{serviceId}/{folder}/{name} */
  key(companyId: Id, folder: string, name: string, serviceId?: Id | null) {
    return serviceId
      ? `companies/${companyId}/services/${serviceId}/${folder}/${name}`
      : `companies/${companyId}/${folder}/${name}`;
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  signedUrl(key: string, expiresIn = 300) {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
