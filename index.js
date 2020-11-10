const rx = require('rxjs');
const rxop = require('rxjs/operators');
const zlib = require('zlib');

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

        this.options = {
            ...options,
            setFilter: () => true,
            ttr: 7200 * 1000, // 2 hours optional
            ttl: 60 * 24 * 60 * 60 * 1000 // 60 days optional
        };
    }

    get(args, fallback, options) {
        const {
            namespace,
            id
        } = args;

        options = {
            ...this.options,
            ...options
        };

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
                    if (typeof options.setFilter !== 'function') {
                        options.setFilter = () => true;
                    }

                    if (options.setFilter(response)) {
                        _set(response)
                            .pipe(
                                rxop.publish()
                            )
                            .connect();
                    }
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

                    return this._gunzip(response);
                }),
                rxop.map(response => {
                    if (response.value) {
                        return {
                            ...response,
                            value: JSON.parse(response.value)
                        };
                    }

                    return response;
                }),
                rxop.defaultIfEmpty({})
            );
    }

    _gzip(data) {
        return new rx.Observable(subscriber => {
            let compress = true;

            if (
                typeof data.value !== 'string' &&
                !Buffer.isBuffer(data.value)
            ) {
                throw new Error('value must be string or Buffer.');
            }

            if (typeof this.options.gzip === 'boolean') {
                compress = this.options.gzip;
            } else if (typeof this.options.gzip === 'number') {
                compress = Buffer.byteLength(data.value) > this.options.gzip * 1000;
            } else {
                compress = false;
            }

            if (compress) {
                return zlib.gzip(data.value, (err, buffer) => {
                    if (err) {
                        return subscriber.error(err);
                    }

                    subscriber.next({
                        ...data,
                        value: buffer
                    });
                    subscriber.complete();
                });
            }

            subscriber.next(data);
            subscriber.complete();
        });
    }

    _gunzip(data) {
        return new rx.Observable(subscriber => {
            const {
                value
            } = data;

            if (
                Buffer.isBuffer(value) &&
                value.length >= 3 &&
                value[0] === 0x1F &&
                value[1] === 0x8B &&
                value[2] === 0x08
            ) {
                return zlib.gunzip(value, (err, value) => {
                    if (err) {
                        return subscriber.error(err);
                    }

                    subscriber.next({
                        ...data,
                        value: value.toString()
                    });
                    subscriber.complete();
                });
            }

            subscriber.next(data);
            subscriber.complete();
        });
    }

    _set(args) {
        const {
            namespace,
            value
        } = args;

        if (!namespace) {
            return rx.throwError(new Error('No namespace provided.'));
        }

        if (!value) {
            return rx.empty();
        }

        args = {
            ...args,
            value: JSON.stringify(value)
        };

        return this._gzip(args)
            .pipe(
                rxop.mergeMap(response => {
                    return this.options.set({
                        ...response,
                        createdAt: Date.now(),
                        ttl: Math.floor((Date.now() + this.options.ttl) / 1000)
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