import { Connection } from './core-connection';

export interface NodeInspectionResult {
    nodeInstalled: boolean;
    nodeVersion?: string;
    nvmInstalled: boolean;
    nvmVersion?: string;
    latestNodeVersion?: string;
}

export interface EnsureNodeEnvironmentOptions {
    installNvmIfMissing?: boolean;
    installNodeIfMissing?: boolean;
    nodeSpecifier?: string;
}

export class NodeConnection extends Connection {
    private static readonly NVM_INSTALL_URL = 'https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh';

    public async inspectNode(): Promise<NodeInspectionResult> {
        const [nodeInstalled, nodeVersion] = await this.checkBashCommands([
            'command -v node >/dev/null 2>&1',
            'node -v'
        ]);

        const [nvmInstalled, nvmVersion] = await this.checkBashCommands([
            this.nvmDirExport,
            '[ -s "$NVM_DIR/nvm.sh" ]',
            '. "$NVM_DIR/nvm.sh"',
            'nvm --version'
        ], true);

        const latestNodeVersion = nvmInstalled ? await this.resolveLatestNodeVersion() : undefined;

        return {
            nodeInstalled,
            nodeVersion,
            nvmInstalled,
            nvmVersion,
            latestNodeVersion
        };
    }

    public async ensureNodeEnvironment(options: EnsureNodeEnvironmentOptions = {}): Promise<NodeInspectionResult> {
        const installNvmIfMissing = options.installNvmIfMissing ?? true;
        const installNodeIfMissing = options.installNodeIfMissing ?? true;
        const nodeSpecifier = options.nodeSpecifier ?? '--lts';

        let result = await this.inspectNode();

        if (!result.nvmInstalled && installNvmIfMissing) {
            await this.installNvm();
            result = await this.inspectNode();
        }

        const shouldInstallNode = installNodeIfMissing && !result.nodeInstalled;

        if (shouldInstallNode) {
            await this.installNode(nodeSpecifier);
            result = await this.inspectNode();
        }

        return result;
    }

    protected async installNvm(): Promise<void> {
        await this.runBashCommands([
            this.nvmDirExport,
            `if [ ! -s "$NVM_DIR/nvm.sh" ]; then curl -o- ${NodeConnection.NVM_INSTALL_URL} | bash; fi`
        ]);
    }

    protected async installNode(target: string): Promise<void> {
        await this.runBashCommands([
            this.nvmDirExport,
            '[ -s "$NVM_DIR/nvm.sh" ]',
            '. "$NVM_DIR/nvm.sh"',
            `nvm install ${target}`,
            `nvm alias default ${this.resolveDefaultAlias(target)}`,
            `nvm use ${this.resolveDefaultAlias(target)}`
        ]);
    }

    protected resolveDefaultAlias(target: string): string {
        const normalized = target.trim();
        if (normalized === '--lts' || normalized === 'lts' || normalized === 'node' || normalized === 'stable') {
            return 'node';
        }

        return normalized;
    }

    protected get nvmDirExport(): string {
        return 'export NVM_DIR="$HOME/.nvm"';
    }

    protected async resolveLatestNodeVersion(): Promise<string | undefined> {
        try {
            const output = await this.runBashCommands([
                this.nvmDirExport,
                '[ -s "$NVM_DIR/nvm.sh" ]',
                '. "$NVM_DIR/nvm.sh"',
                'nvm version-remote node'
            ]);

            const lines = output.split('\n').map(line => line.trim()).filter(Boolean);
            if (lines.length === 0) {
                return undefined;
            }

            const version = lines[lines.length - 1];
            if (!version || version.toUpperCase() === 'N/A') {
                return undefined;
            }

            return version.startsWith('v') ? version : `v${version}`;
        } catch {
            return undefined;
        }
    }

    protected async checkBashCommands(commands: string[], allowMultiLine = false): Promise<[boolean, string | undefined]> {
        return this.checkCommand(this.buildBashCommand(commands), allowMultiLine);
    }

    protected buildBashCommand(commands: string[], separator: '&&' | ';' = '&&'): string {
        const joined = commands.join(` ${separator} `);
        const escaped = joined.replace(/'/g, `'\\''`);
        return `bash -lc '${escaped}'`;
    }

    protected async runBashCommands(commands: string[], separator: '&&' | ';' = '&&'): Promise<string> {
        return this.runCommand(this.buildBashCommand(commands, separator));
    }

    protected async checkCommand(command: string, allowMultiLine = false): Promise<[boolean, string | undefined]> {
        try {
            const output = await this.runCommand(command);
            const parsed = allowMultiLine ? output.trim() : output.trim().split('\n')[0];
            return [parsed.length > 0, parsed.length > 0 ? parsed : undefined];
        } catch (error) {
            const message = (error as Error).message;
            if (
                message.includes('not found') ||
                message.includes('command not found') ||
                message.includes('is not recognized') ||
                message.includes('exited with code')
            ) {
                return [false, undefined];
            }

            throw error;
        }
    }
}
