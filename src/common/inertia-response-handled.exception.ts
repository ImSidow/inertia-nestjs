export class InertiaResponseHandledException extends Error {
    constructor() {
        super('Inertia response already handled.');
        this.name = 'InertiaResponseHandledException';
    }
}
