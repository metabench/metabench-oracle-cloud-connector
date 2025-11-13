export {
    ORACLE_HOST,
    DEFAULT_KEY_DIRECTORY,
    DEFAULT_KEY_FILENAME,
    DEFAULT_USERNAME,
    Connection,
    connectToOracle
} from './core-connection';

export type { OracleSshOptions } from './core-connection';

export { NodeConnection } from './node-connection';
export type { NodeInspectionResult, EnsureNodeEnvironmentOptions } from './node-connection';
