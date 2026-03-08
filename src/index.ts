// Module
export {
    InertiaModule,
    InertiaModuleAsyncOptions,
    INERTIA_MODULE_OPTIONS,
} from './module/inertia.module';

// Service
export { InertiaService } from './services/inertia.service';

// Middleware
export { HandleInertiaRequests } from './middleware/handle-inertia-requests.middleware';

// Interceptor
export { InertiaInterceptor } from './interceptors/inertia.interceptor';

// Decorators
export { Inertia } from './decorators/inertia.decorator';

// Prop helpers
export {
    lazy,
    always,
    defer,
    merge,
    isLazy,
    isAlways,
    isDefer,
    isMerge,
} from './common/inertia.props';

// Interfaces / types
export {
    InertiaPage,
    InertiaModuleOptions,
    InertiaProps,
    RenderOptions,
    PropValue,
    LazyProp,
    AlwaysProp,
    DeferProp,
    MergeProp,
} from './common/inertia.interfaces';

// Constants
export {
    INERTIA_HEADER,
    INERTIA_VERSION_HEADER,
    INERTIA_LOCATION_HEADER,
    INERTIA_PARTIAL_COMPONENT_HEADER,
    INERTIA_PARTIAL_DATA_HEADER,
    INERTIA_PARTIAL_EXCEPT_HEADER,
    INERTIA_ERROR_BAG_HEADER,
    INERTIA_ENCRYPT_HISTORY_HEADER,
    INERTIA_CLEAR_HISTORY_HEADER,
} from './common/inertia.constants';
