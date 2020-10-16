const rx = require('rxjs');
const rxop = require('rxjs/operators');
const zlib = require('zlib');

const gzip = (data, compress = true) => {
    return new rx.Observable(subscriber => {
        zlib[compress ? 'gzip' : 'gunzip'](compress ? JSON.stringify(data) : data, (err, data) => {
            if (err) {
                return subscriber.error(err);
            }

            subscriber.next(compress ? data : JSON.parse(data));
            subscriber.complete();
        });
    });
};

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

        this.gzip = !!options.gzip;
        this.options = Object.assign({
            ttr: 7200 * 1000, // 2 hours optional
            ttl: 60 * 24 * 60 * 60 * 1000 // 60 days optional
        }, options);
    }

    get(args, fallback, options) {
        const {
            namespace,
            id
        } = args;

        options = Object.assign({}, this.options, options);

        if (!namespace) {
            return rx.throwError(new Error('No namespace provided.'));
        }

        if (typeof fallback !== 'function') {
            return rx.throwError(new Error('Fallback must be a function which returns an Observable.'));
        }

        const _set = value => {
            return this._set({
                namespace,
                id,
                value
            });
        };

        const fallbackAndSet = args => fallback(args)
            .pipe(
                rxop.tap(response => {
                    return _set(response)
                        .pipe(
                            rxop.publish()
                        )
                        .connect();
                })
            );

        if (options.refresh) {
            return fallbackAndSet(args);
        }

        return this._get({
                namespace,
                id
            })
            .pipe(
                rxop.mergeMap(response => {
                    const {
                        value = null,
                        createdAt = 0
                    } = response;

                    if (!value) {
                        return fallbackAndSet(args);
                    }

                    const expired = Date.now() - createdAt >= options.ttr ? true : false;

                    // just refresh to next request in background
                    if (expired) {
                        fallbackAndSet(args)
                            .pipe(
                                rxop.publish()
                            )
                            .connect();
                    }

                    return rx.of(value);
                })
            );
    }

    _get(args) {
        const {
            namespace,
            id
        } = args;

        if (!namespace) {
            return rx.throwError(new Error('No namespace provided.'));
        }

        return this.options.get({
                namespace,
                id
            })
            .pipe(
                rxop.mergeMap(response => {
                    if (!response) {
                        return rx.of({});
                    }

                    if (this.gzip) {
                        return gzip(response.value, false)
                            .pipe(
                                rxop.map(value => {
                                    return Object.assign({}, response, {
                                        value
                                    });
                                })
                            );
                    }

                    return rx.of(response);
                }),
                rxop.defaultIfEmpty({})
            );
    }

    _set(args) {
        const {
            namespace,
            id,
            value
        } = args;

        if (!namespace) {
            return rx.throwError(new Error('No namespace provided.'));
        }

        if (!value) {
            return rx.empty();
        }

        return (this.gzip ? gzip(value, true) : rx.of(value))
            .pipe(
                rxop.mergeMap(value => {
                    return this.options.set({
                        createdAt: Date.now(),
                        id,
                        namespace,
                        ttl: Math.floor((Date.now() + this.options.ttl) / 1000),
                        value
                    });
                })
            );
    }

    del(args) {
        const {
            namespace,
            id
        } = args;

        if (!namespace) {
            return rx.throwError(new Error('No namespace provided.'));
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
            return rx.throwError(new Error('No namespace provided.'));
        }

        return this.options.get({
                namespace,
                id
            })
            .pipe(
                rxop.mergeMap(response => {
                    response.createdAt = 0;

                    return this.options.set(response);
                })
            );

    }

    clear(args = {}) {
        const {
            namespace
        } = args;

        if (!namespace) {
            return rx.throwError(new Error('No namespace provided.'));
        }

        return this.options.clear(args);
    }
};