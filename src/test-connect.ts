import { Connection, NodeConnection, ORACLE_HOST } from './connect';
import { exec } from 'child_process';

const COLOR_SKY_BLUE = '\x1b[36m';
const COLOR_GREEN = '\x1b[32m';
const COLOR_AMBER = '\x1b[33m';
const COLOR_RED = '\x1b[31m';
const COLOR_RESET = '\x1b[0m';

function formatGigabytes(bytes: number): string {
    return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}

function colorizeFreeResource(bytes: number, greenThreshold: number, amberThreshold: number): string {
    let color = COLOR_RED;
    if (bytes >= greenThreshold) {
        color = COLOR_GREEN;
    } else if (bytes >= amberThreshold) {
        color = COLOR_AMBER;
    }

    return `${color}${formatGigabytes(bytes)}${COLOR_RESET}`;
}

function compareNodeVersions(current?: string, latest?: string): number {
    if (!current || !latest) {
        return 0;
    }

    const normalize = (version: string): number[] => {
        const trimmed = version.trim().replace(/^v/i, '');
        return trimmed.split('.').map(part => {
            const value = Number(part);
            return Number.isFinite(value) ? value : 0;
        });
    };

    const currentParts = normalize(current);
    const latestParts = normalize(latest);
    const length = Math.max(currentParts.length, latestParts.length);

    for (let index = 0; index < length; index += 1) {
        const currentValue = currentParts[index] ?? 0;
        const latestValue = latestParts[index] ?? 0;
        if (currentValue > latestValue) {
            return 1;
        }
        if (currentValue < latestValue) {
            return -1;
        }
    }

    return 0;
}

class ConnectionHealthCheck {
    constructor(private readonly connection = new NodeConnection()) {}

    public async run(): Promise<void> {
        try {
            await this.connection.connect();
            console.log(`Connected successfully to ${COLOR_SKY_BLUE}${ORACLE_HOST}${COLOR_RESET}`);

            await this.reportCpu();
            await this.reportMemory();
            await this.reportDisk();
            await this.reportNode();
        } catch (error) {
            console.error('SSH connection failed:', (error as Error).message);
            this.pingHost();
        } finally {
            this.connection.disconnect();
        }
    }

    protected async reportCpu(): Promise<void> {
        const nprocOutput = await this.connection.runCommand('nproc');
        const cpuCount = parseInt(nprocOutput, 10);
        if (!Number.isFinite(cpuCount)) {
            throw new Error(`Unable to parse CPU count from output: "${nprocOutput}"`);
        }
        console.log(`Server reports ${cpuCount} CPUs`);
    }

    protected async reportMemory(): Promise<void> {
        const memInfoOutput = await this.connection.runCommand('cat /proc/meminfo');
        const memInfoLines = memInfoOutput.split('\n');
        const memTotalLine = memInfoLines.find(line => line.startsWith('MemTotal:'));
        const memAvailableLine = memInfoLines.find(line => line.startsWith('MemAvailable:'));

        if (!memTotalLine || !memAvailableLine) {
            throw new Error('Unable to read memory information from /proc/meminfo');
        }

        const parseMemLine = (line: string): number => {
            const parts = line.split(/\s+/);
            const value = parseInt(parts[1], 10);
            if (!Number.isFinite(value)) {
                throw new Error(`Unable to parse memory value from line: "${line}"`);
            }
            return value * 1024; // values reported in kB
        };

        const totalBytes = parseMemLine(memTotalLine);
        const availableBytes = parseMemLine(memAvailableLine);

        console.log(
            `Memory total ${formatGigabytes(totalBytes)}, free ${colorizeFreeResource(availableBytes, 4 * 1024 ** 3, 1 * 1024 ** 3)}`
        );
    }

    protected async reportDisk(): Promise<void> {
        const dfOutput = await this.connection.runCommand('df --output=avail,size -B1 /');
        const dfLines = dfOutput.split('\n').map(line => line.trim()).filter(Boolean);
        if (dfLines.length < 2) {
            throw new Error(`Unexpected df output: ${dfOutput}`);
        }

        const [, data] = dfLines;
        const columns = data.split(/\s+/);
        if (columns.length < 2) {
            throw new Error(`Unable to parse disk usage from line: "${data}"`);
        }

        const diskFree = Number(columns[0]);
        const diskTotal = Number(columns[1]);
        if (!Number.isFinite(diskFree) || !Number.isFinite(diskTotal)) {
            throw new Error(`Unable to parse disk usage values from line: "${data}"`);
        }

        console.log(
            `Disk total ${formatGigabytes(diskTotal)}, free ${colorizeFreeResource(diskFree, 16 * 1024 ** 3, 4 * 1024 ** 3)}`
        );
    }

    protected async reportNode(): Promise<void> {
        const result = await (this.connection as NodeConnection).inspectNode();

        if (result.nodeInstalled && result.nodeVersion) {
            console.log(`Node.js version ${result.nodeVersion}`);
        } else {
            console.log('Node.js not installed');
        }

        if (result.nvmInstalled) {
            console.log(`nvm installed${result.nvmVersion ? ` (version ${result.nvmVersion})` : ''}`);
        } else {
            console.log('nvm not installed');
        }

        if (result.latestNodeVersion) {
            const comparison = result.nodeInstalled && result.nodeVersion
                ? compareNodeVersions(result.nodeVersion, result.latestNodeVersion)
                : -1;
            const color = comparison >= 0 ? COLOR_GREEN : COLOR_AMBER;
            const suffix = comparison >= 0 ? ' (in use)' : ' (update available)';
            console.log(`${color}Latest Node.js via nvm ${result.latestNodeVersion}${suffix}${COLOR_RESET}`);
        } else if (result.nvmInstalled) {
            console.log(`${COLOR_AMBER}Unable to resolve latest Node.js version via nvm${COLOR_RESET}`);
        }
    }

    protected pingHost(): void {
        exec(`ping -n 1 ${ORACLE_HOST}`, (err) => {
            if (err) {
                console.log('Ping failed: Server may be unreachable');
            } else {
                console.log('\x1b[32mPing successful: Server is reachable\x1b[0m');
            }
        });
    }
}

new ConnectionHealthCheck().run();