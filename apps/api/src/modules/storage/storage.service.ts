import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, CopyDestinationOptions, CopySourceOptions } from 'minio';

// Bucket layout:
//   tmp/{userId}/{uuid}.{ext}       browser uploads; private, expire after a day unless claimed
//   items/{itemId}/{imageId}.{ext}  product images; public read, never overwritten
export const TMP_PREFIX = 'tmp/';
export const PUBLIC_PREFIXES = ['items/'];
const TMP_EXPIRY_DAYS = 1;
const UPLOAD_URL_TTL_MS = 5 * 60 * 1000;
const IMMUTABLE = 'public, max-age=31536000, immutable';
// Fixed so the client never has to ask the server, which the browser-facing host may not reach.
const REGION = 'us-east-1';

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function client(url: string) {
  const { hostname, port, protocol } = new URL(url);
  const useSSL = protocol === 'https:';
  return new Client({
    endPoint: hostname,
    port: port ? Number(port) : useSSL ? 443 : 80,
    useSSL,
    region: REGION,
    accessKey: env('MINIO_ACCESS_KEY'),
    secretKey: env('MINIO_SECRET_KEY'),
  });
}

// Plain function so views can build URLs without injecting the service.
export const mediaUrl = (key: string) =>
  `${env('MINIO_PUBLIC_URL')}/${env('MINIO_BUCKET')}/${key}`;

const isMissing = (error: unknown) =>
  ['NotFound', 'NoSuchKey'].includes((error as { code?: string }).code ?? '');

@Injectable()
export class StorageService implements OnModuleInit {
  readonly bucket = env('MINIO_BUCKET');
  private readonly minio = client(env('MINIO_ENDPOINT'));
  // Browsers may reach MinIO on another host than the API does, and a signature covers the host.
  private readonly browserMinio = client(env('MINIO_PUBLIC_URL'));

  async onModuleInit() {
    const bucket = this.bucket;
    if (!(await this.minio.bucketExists(bucket))) {
      await this.minio.makeBucket(bucket, REGION);
    }
    await this.minio.setBucketPolicy(
      bucket,
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: PUBLIC_PREFIXES.map(
              (p) => `arn:aws:s3:::${bucket}/${p}*`,
            ),
          },
        ],
      }),
    );
    await this.minio.setBucketLifecycle(bucket, {
      Rule: [
        {
          ID: 'expire-unclaimed-uploads',
          Status: 'Enabled',
          Filter: { Prefix: TMP_PREFIX },
          Expiration: { Days: TMP_EXPIRY_DAYS },
        },
      ],
    });
  }

  async ping() {
    if (!(await this.minio.bucketExists(this.bucket))) {
      throw new Error(`Bucket ${this.bucket} is missing`);
    }
  }

  // A POST policy, unlike a presigned PUT, lets MinIO itself enforce the size limit.
  async presignUpload(key: string, contentType: string, maxBytes: number) {
    const policy = this.browserMinio.newPostPolicy();
    policy.setBucket(this.bucket);
    policy.setKey(key);
    policy.setContentType(contentType);
    policy.setContentLengthRange(1, maxBytes);
    policy.setExpires(new Date(Date.now() + UPLOAD_URL_TTL_MS));
    const { postURL, formData } =
      await this.browserMinio.presignedPostPolicy(policy);
    return { url: postURL, fields: formData };
  }

  // Size and the first bytes, to check what was really uploaded; null if nothing is there.
  async inspect(key: string, bytes: number) {
    try {
      const { size } = await this.minio.statObject(this.bucket, key);
      const stream = await this.minio.getPartialObject(
        this.bucket,
        key,
        0,
        bytes,
      );
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      return { size, start: Buffer.concat(chunks) };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async copy(from: string, to: string, contentType: string) {
    await this.minio.copyObject(
      new CopySourceOptions({ Bucket: this.bucket, Object: from }),
      new CopyDestinationOptions({
        Bucket: this.bucket,
        Object: to,
        MetadataDirective: 'REPLACE',
        Headers: { 'Content-Type': contentType, 'Cache-Control': IMMUTABLE },
      }),
    );
  }

  async delete(keys: string[]) {
    if (!keys.length) return;
    await this.minio.removeObjects(this.bucket, keys);
  }
}
