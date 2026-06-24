import { SetMetadata } from '@nestjs/common';

export const INERTIA_VALIDATE_KEY = 'inertia:validate:component';

export const InertiaValidate = (component: string) =>
    SetMetadata(INERTIA_VALIDATE_KEY, component);
