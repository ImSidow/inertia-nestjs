import { SetMetadata } from '@nestjs/common';
import { INERTIA_VALIDATE_KEY, INERTIA_VALIDATE_REDIRECT_BACK } from '../common/inertia.constants';

// Re-export for backward compatibility
export { INERTIA_VALIDATE_KEY, INERTIA_VALIDATE_REDIRECT_BACK };

export const InertiaValidate = (component?: string) =>
    SetMetadata(INERTIA_VALIDATE_KEY, component ?? INERTIA_VALIDATE_REDIRECT_BACK);
