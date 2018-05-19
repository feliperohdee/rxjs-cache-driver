const {
    Observable
} = require('rxjs');

module.exports = class CacheDriver {
    constructor(options = {}) {
        if (!options.get) {
            throw new Error('get is missing.');
        }

        if (!options.set) {
            throw new Error('set is missing.');
        }

        if (!options.del) {
            throw new Error('del is missing.');
        }

        if (!options.clear) {
            throw new Error('clear is missing.');
        }

        this.options = Object.assign({
            ttr: 7200
        }, options);
    }

    get(args, fallback, options) {
        const {
            namespace,
            id
        } = args;

        options = Object.assign({}, this.options, options);

        if (!namespace) {
            return Observable.throw(new Error('No namespace provided.'));
        }

        if (!id) {
            return Observable.throw(new Error('No id provided.'));
        }

        if (typeof fallback !== 'function') {
            return Observable.throw(new Error('Fallback must be a function which returns an Observable.'));
        }

        const _set = value => this._set({
            namespace,
            id,
            value
        });

        const fallbackAndSet = args => fallback(args)
            .do(response => {
                return _set(response)
                    .publish()
                    .connect()
            });

        if (options.forceRefresh) {
            return fallbackAndSet(args);
        }

        return this._get({
                namespace,
                id
            })
            .mergeMap(response => {
                const {
                    value = null,
                        createdAt = 0
                } = response;

                if (!value) {
                    return fallbackAndSet(args);
                }

                const expired = Date.now() - createdAt >= (options.ttr * 1000) ? true : false;

                // just refresh to next request in background
                if (expired) {
                    fallbackAndSet(args)
                        .publish()
                        .connect();
                }

                return Observable.of(value);
            });
    }

    _get(args) {
        const {
            namespace,
            id
        } = args;

        if (!namespace) {
            return Observable.throw(new Error('No namespace provided.'));
        }

        if (!id) {
            return Observable.throw(new Error('No id provided.'));
        }

        return this.options.get({
                namespace,
                id
            })
            .mergeMap(response => {
                if (!response) {
                    return Observable.of({});
                }

                return Observable.of(response);
            })
            .defaultIfEmpty({});
    }

    _set(args) {
        const {
            namespace,
            id,
            value
        } = args;

        if (!namespace) {
            return Observable.throw(new Error('No namespace provided.'));
        }

        if (!id) {
            return Observable.throw(new Error('No id provided.'));
        }

        if (!value) {
            return Observable.empty();
        }

        return this.options.set({
            namespace,
            id,
            value,
            createdAt: Date.now()
        });
    }

    del(args) {
        const {
            namespace,
            id
        } = args;

        if (!namespace) {
            return Observable.throw(new Error('No namespace provided.'));
        }

        if (!id) {
            return Observable.throw(new Error('No id provided.'));
        }

        return this.options.del({
            namespace,
            id
        });
    }

    markToRefresh(args) {
        const {
            namespace,
            id
        } = args;

        if (!namespace) {
            return Observable.throw(new Error('No namespace provided.'));
        }

        if (!id) {
            return Observable.throw(new Error('No id provided.'));
        }

        return this.options.get({
                namespace,
                id
            })
            .mergeMap(response => {
                response.createdAt = 0;

                return this.options.set(response);
            });

    }

    clear(args = {}) {
        const {
            namespace
        } = args;

        if (!namespace) {
            return Observable.throw(new Error('No namespace provided.'));
        }

        return this.options.clear({
            namespace
        });
    }
}