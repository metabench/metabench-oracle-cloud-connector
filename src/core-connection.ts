import { Client, ConnectConfig } from 'ssh2';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export const ORACLE_HOST = '158.101.219.254';
export const DEFAULT_KEY_DIRECTORY = 'C:\\Users\\james\\.ssh';
export const DEFAULT_KEY_FILENAME = 'ssh-key-2025-11-11.key';
export const DEFAULT_USERNAME = 'opc';

export interface OracleSshOptions {
    username?: string;
    keyDirectory?: string;
    passphrase?: string;
    port?: number;
}

function isPrivateKey(content: string): boolean {
    return content.startsWith('-----BEGIN') && content.includes('PRIVATE KEY');
}

function isPublicKey(content: string): boolean {
    return content.startsWith('ssh-') || content.startsWith('-----BEGIN PUBLIC KEY');
}

function isLikelyKeyFilename(file: string): boolean {
    if (file.startsWith('.')) {
        return false;
    }

    const lower = file.toLowerCase();
    if (lower === 'known_hosts' || lower === 'authorized_keys' || lower === 'config') {
        return false;
    }

    if (/(\.key|\.pem|\.pub)$/i.test(lower)) {
        return true;
    }

    const keyBasenames = ['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519'];
    return keyBasenames.includes(lower);
}

export class Connection {
    protected client?: Client;

    constructor(protected readonly options: OracleSshOptions = {}) {}

    protected get host(): string {
        return ORACLE_HOST;
    }

    protected get username(): string {
        return this.options.username ?? DEFAULT_USERNAME;
    }

    protected get keyDirectory(): string {
        return this.options.keyDirectory ?? DEFAULT_KEY_DIRECTORY;
    }

    protected get port(): number {
        return this.options.port ?? 22;
    }

    protected get passphrase(): string | undefined {
        return this.options.passphrase;
    }

    protected resolveKeyPaths(): { privateKeyPath: string; publicKeyPath?: string } {
        const keyDir = this.keyDirectory;

        if (!existsSync(keyDir)) {
            throw new Error(`Key directory not found: ${keyDir}`);
        }

        const defaultPrivateKeyPath = join(keyDir, DEFAULT_KEY_FILENAME);
        if (existsSync(defaultPrivateKeyPath)) {
            const possiblePublicKey = `${defaultPrivateKeyPath}.pub`;
            return {
                privateKeyPath: defaultPrivateKeyPath,
                publicKeyPath: existsSync(possiblePublicKey) ? possiblePublicKey : undefined
            };
        }

        const files = readdirSync(keyDir)
            .filter(isLikelyKeyFilename)
            .map(file => ({
                name: file,
                fullPath: join(keyDir, file)
            }))
            .filter(entry => {
                try {
                    return statSync(entry.fullPath).isFile();
                } catch {
                    return false;
                }
            });

        if (files.length > 2) {
            const names = files.map(f => f.name);
            throw new Error(`Too many key files in directory (${names.length}): ${names.join(', ')}. Expected 1-2 key files.`);
        }

        if (files.length === 0) {
            throw new Error(`No key files found in ${keyDir}`);
        }

        let privateKeyPath: string | undefined;
        let publicKeyPath: string | undefined;

        for (const { fullPath, name } of files) {
            const content = readFileSync(fullPath, 'utf8').trim();

            if (isPrivateKey(content)) {
                if (privateKeyPath) throw new Error('Multiple private keys found');
                privateKeyPath = fullPath;
            } else if (isPublicKey(content)) {
                if (publicKeyPath) throw new Error('Multiple public keys found');
                publicKeyPath = fullPath;
            } else if (name.endsWith('.pub')) {
                if (publicKeyPath) throw new Error('Multiple public keys found');
                publicKeyPath = fullPath;
            } else {
                if (privateKeyPath) throw new Error('Multiple private keys found');
                privateKeyPath = fullPath;
            }
        }

        if (!privateKeyPath) {
            throw new Error('No private key found in directory');
        }

        return { privateKeyPath, publicKeyPath };
    }

    protected loadPrivateKey(privateKeyPath: string): Buffer {
        if (!existsSync(privateKeyPath)) {
            throw new Error(`Private key not found at ${privateKeyPath}`);
        }

        return readFileSync(privateKeyPath);
    }

    protected buildSshConfig(privateKey: Buffer): ConnectConfig {
        const sshConfig: ConnectConfig = {
            host: this.host,
            port: this.port,
            username: this.username,
            privateKey,
            passphrase: this.passphrase,
            keepaliveInterval: 15000,
            keepaliveCountMax: 10,
            readyTimeout: 20000
        };

        if (process.env.SSH_AUTH_SOCK) {
            sshConfig.agent = process.env.SSH_AUTH_SOCK;
        }

        return sshConfig;
    }

    protected resetClient(client: Client): void {
        client.removeAllListeners();
        if (this.client === client) {
            this.client = undefined;
        }
    }

    public async connect(): Promise<Client> {
        if (this.client) {
            return this.client;
        }

        const { privateKeyPath } = this.resolveKeyPaths();
        const privateKey = this.loadPrivateKey(privateKeyPath);
        const sshConfig = this.buildSshConfig(privateKey);

        return new Promise((resolve, reject) => {
            const client = new Client();
            this.client = client;

            client.once('ready', () => resolve(client));
            client.once('error', (error: Error) => {
                this.resetClient(client);
                reject(error);
            });
            client.once('end', () => {
                this.resetClient(client);
            });

            client.connect(sshConfig);
        });
    }

    public disconnect(): void {
        if (!this.client) {
            return;
        }

        const client = this.client;
        this.resetClient(client);
        client.end();
    }

    public async runCommand(command: string): Promise<string> {
        const client = this.client ?? await this.connect();

        return new Promise((resolve, reject) => {
            client.exec(command, (err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }

                let stdout = '';
                let stderr = '';

                stream.on('data', (chunk: Buffer) => {
                    stdout += chunk.toString();
                });

                stream.stderr.on('data', (chunk: Buffer) => {
                    stderr += chunk.toString();
                });

                stream.on('close', (code: number | null) => {
                    if (code === 0) {
                        resolve(stdout.trim());
                    } else {
                        reject(new Error(`${command} exited with code ${code ?? 'unknown'}: ${stderr.trim()}`));
                    }
                });
            });
        });
    }
}

export async function connectToOracle(options: OracleSshOptions = {}): Promise<Client> {
    const connection = new Connection(options);
    return connection.connect();
}
