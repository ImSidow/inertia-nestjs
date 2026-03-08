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
