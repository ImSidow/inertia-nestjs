/**
 * Inertia HTTP header constants.
 * Mirrors the Header class from inertia-laravel.
 */
export const INERTIA_HEADER = 'x-inertia';
export const INERTIA_VERSION_HEADER = 'x-inertia-version';
export const INERTIA_LOCATION_HEADER = 'x-inertia-location';
export const INERTIA_PARTIAL_COMPONENT_HEADER = 'x-inertia-partial-component';
export const INERTIA_PARTIAL_DATA_HEADER = 'x-inertia-partial-data';
export const INERTIA_PARTIAL_EXCEPT_HEADER = 'x-inertia-partial-except';
export const INERTIA_ERROR_BAG_HEADER = 'x-inertia-error-bag';
export const INERTIA_ENCRYPT_HISTORY_HEADER = 'x-inertia-encrypt-history';
export const INERTIA_CLEAR_HISTORY_HEADER = 'x-inertia-clear-history';

/** Metadata key used to attach Inertia render options to route handlers. */
export const INERTIA_RENDER_KEY = 'inertia:render';

/** Metadata key used to mark a route handler as an Inertia responder. */
export const INERTIA_COMPONENT_KEY = 'inertia:component';

/** Metadata key used by @InertiaValidate() to store the target component (or redirect-back sentinel). */
export const INERTIA_VALIDATE_KEY = 'inertia:validate:component';

/** Sentinel value for @InertiaValidate() meaning "redirect back with errors" instead of re-rendering a page. */
export const INERTIA_VALIDATE_REDIRECT_BACK = '__redirectBack__';

/** Metadata key used by @InertiaHandleException() to store which status codes to intercept and an optional return path. */
export const INERTIA_HANDLE_EXCEPTION_KEY = 'inertia:handle:exception';
