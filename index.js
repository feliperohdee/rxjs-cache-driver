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
			key
		} = args;

		options = Object.assign({}, this.options, options);

		if (!namespace) {
			return Observable.throw(new Error('No namespace provided.'));
		}

		if (!key) {
			return Observable.throw(new Error('No key provided.'));
		}

		if (typeof fallback !== 'function') {
			return Observable.throw(new Error('Fallback must be a function which returns an Observable.'));
		}

		const _set = value => this._set({
			namespace,
			key,
			value
		});

		const fallbackAndSet = args => fallback(args)
			.do(response => {
				return _set(response)
					.publish()
					.connect()
			});

		if(options.forceRefresh) {
			return fallbackAndSet(args);
		}

		return this._get({
				namespace,
				key
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
			key
		} = args;

		if (!namespace) {
			return Observable.throw(new Error('No namespace provided.'));
		}

		if (!key) {
			return Observable.throw(new Error('No key provided.'));
		}

		return this.options.get(namespace, key)
			.mergeMap(response => {
				if (!response) {
					return Observable.of({});
				}

				return Observable.of(typeof response === 'string' ? JSON.parse(response) : response);
			})
			.defaultIfEmpty({});
	}

	_set(args) {
		const {
			namespace,
			key,
			value
		} = args;

		if (!namespace) {
			return Observable.throw(new Error('No namespace provided.'));
		}

		if (!key) {
			return Observable.throw(new Error('No key provided.'));
		}

		if (!value) {
			return Observable.empty();
		}

		return this.options.set(namespace, key, JSON.stringify({
				namespace,
				key,
				value,
				createdAt: Date.now()
			}));
	}

	del(args) {
		const {
			namespace,
			key
		} = args;

		if (!namespace) {
			return Observable.throw(new Error('No namespace provided.'));
		}

		if (!key) {
			return Observable.throw(new Error('No key provided.'));
		}

		return this.options.del(namespace, key);
	}

	markToRefresh(args) {
		const {
			namespace,
			key
		} = args;

		if (!namespace) {
			return Observable.throw(new Error('No namespace provided.'));
		}

		if (!key) {
			return Observable.throw(new Error('No key provided.'));
		}

		return this.options.get(namespace, key)
			.mergeMap(response => {
				const value = JSON.parse(response);

				value.createdAt = 0;

				return this.options.set(namespace, key, JSON.stringify(value));
			});

	}

	clear(args = {}) {
		const {
			namespace
		} = args;

		if (!namespace) {
			return Observable.throw(new Error('No namespace provided.'));
		}

		return this.options.clear(namespace);
	}
}
