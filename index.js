const {
	Observable
} = require('rxjs');

module.exports = class CacheDriver {
	constructor(options = {}) {
		if (!options.operations) {
			throw new Error('operations are missing.');
		}

		if (!options.operations.get) {
			throw new Error('operations.get is missing.');
		}
		
		if (!options.operations.set) {
			throw new Error('operations.set is missing.');
		}
		
		if (!options.operations.del) {
			throw new Error('operations.del is missing.');
		}

		if (!options.operations.clear) {
			throw new Error('operations.clear is missing.');
		}

		this.options = Object.assign({
			ttr: 7200
		}, options);
	}

	get(args, fallback) {
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

		if (!fallback.subscribe) {
			return Observable.throw(new Error('Fallback must be instance of Observable.'));
		}

		const fallbackReplay = fallback
			.publishLast()
			.refCount();

		const _set = value => this._set({
			namespace,
			key,
			value
		});

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
					return fallbackReplay
						.do(response => _set(response)
							.publish()
							.connect());
				}

				const expired = Date.now() - createdAt >= (this.options.ttr * 1000) ? true : false;

				// just refresh to next request in background
				if (expired) {
					fallbackReplay
						.mergeMap(_set)
						.publish()
						.connect();
				}

				return Observable.of(value);
			})
			.catch(err => {
				if (typeof this.options.onError === 'function') {
					this.options.onError(err);
				}

				return fallbackReplay;
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

		return this.options.operations.get(namespace, key)
			.mergeMap(response => {
				if (!response) {
					return Observable.of({});
				}

				return Observable.of(JSON.parse(response));
			})
			.catch(err => {
				if (typeof this.options.onError === 'function') {
					this.options.onError(err);
				}

				return Observable.of({});
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

		return this.options.operations.set(namespace, key, JSON.stringify({
				namespace,
				key,
				value,
				createdAt: Date.now()
			}))
			.catch(err => {
				if (typeof this.options.onError === 'function') {
					this.options.onError(err);
				}

				return Observable.empty();
			});
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

		return this.options.operations.del(namespace, key);
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

		return this.options.operations.get(namespace, key)
			.mergeMap(response => {
				const value = JSON.parse(response);

				value.createdAt = 0;

				return this.options.operations.set(namespace, key, JSON.stringify(value));
			});

	}

	clear(args = {}) {
		const {
			namespace
		} = args;

		if (!namespace) {
			return Observable.throw(new Error('No namespace provided.'));
		}

		return this.options.operations.clear(namespace);
	}
}
