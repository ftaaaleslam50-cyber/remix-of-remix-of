declare module 'webpush-webcrypto' {
  export interface ApplicationServerKeysJSON {
    publicKey: string;
    privateKey: string;
  }

  export class ApplicationServerKeys {
    static fromJSON(keys: ApplicationServerKeysJSON): Promise<ApplicationServerKeys>;
  }

  export interface PushHTTPRequestOptions {
    applicationServerKeys: ApplicationServerKeys;
    payload: string;
    target: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    adminContact: string;
    ttl: number;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
  }

  export function generatePushHTTPRequest(options: PushHTTPRequestOptions): Promise<{
    endpoint: string;
    headers: Record<string, string>;
    body: ArrayBuffer;
  }>;
}
