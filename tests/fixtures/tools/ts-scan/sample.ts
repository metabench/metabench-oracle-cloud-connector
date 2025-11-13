// @ts-nocheck
import type { Foo } from './types';

function Component(): ClassDecorator {
  return (_target) => undefined;
}
function Injectable(): ClassDecorator {
  return (_target) => undefined;
}
function Input(): PropertyDecorator {
  return (_target, _propertyKey) => undefined;
}
function __decorate(..._args: unknown[]): void {}
function __metadata(..._args: unknown[]): void {}

export interface User {
  id: string;
  readonly name: string;
}

export type Role = 'admin' | 'user';

export enum Status {
  Pending = 'pending',
  Complete = 'complete'
}

export namespace Legacy {
  export const enabled = true;
}

@Injectable()
@Component()
export abstract class ExampleService {
  public constructor(
    private readonly repository: Repository,
    private token: string
  ) {}

  @Input()
  public value!: string;

  protected readonly config = 42;

  protected abstract compute(): void;
}

export type { Foo } from './types';

class Repository {}
__decorate([Input()], ExampleService.prototype, 'value', void 0);
__metadata('design:paramtypes', [Repository, String]);
