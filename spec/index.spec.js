const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

const {
	Observable
} = require('rxjs');

const CacheDriver = require('../');

chai.use(sinonChai);

const expect = chai.expect;
const namespace = 'spec';
const createdAt = Date.now();

describe('index.js', () => {
	let fallback;

	beforeEach(() => {
		sinon.stub(Date, 'now')
			.returns(createdAt);

		fallback = sinon.stub()
			.callsFake(() => Observable.of('fresh'));

		cacheDriver = new CacheDriver({
			get: sinon.spy((namespace, key) => {
				if (key === 'existentKey') {
					return Observable.of({
							namespace,
							key,
							value: 'cached',
							createdAt
						})
						.map(JSON.stringify);
				} else if (key === 'nullKey') {
					return Observable.of(null);
				}

				return Observable.empty();
			}),
			set: sinon.spy((namespace, key, value) => Observable.of({
				namespace,
				key,
				value
			})),
			del: sinon.spy((namespace, key) => Observable.of({
				namespace,
				key
			})),
			clear: sinon.spy(namespace => Observable.of({
				namespace
			}))
		});
	});

	afterEach(() => {
		Date.now.restore();
	});

	describe('constructor', () => {
		it('should throw if no get', () => {
			expect(() => new CacheDriver({
				set: () => null,
				del: () => null,
				clear: () => null
			})).to.throw('get is missing.');
		});

		it('should throw if no set', () => {
			expect(() => new CacheDriver({
				get: () => null,
				del: () => null,
				clear: () => null
			})).to.throw('set is missing.');
		});

		it('should throw if no del', () => {
			expect(() => new CacheDriver({
				get: () => null,
				set: () => null,
				clear: () => null
			})).to.throw('del is missing.');
		});

		it('should throw if no clear', () => {
			expect(() => new CacheDriver({
				get: () => null,
				set: () => null,
				del: () => null
			})).to.throw('clear is missing.');
		});
	});

	describe('get', () => {
		it('should throw if no namespace', done => {
			cacheDriver.get({}, fallback)
				.subscribe(null, err => {
					expect(err.message).to.equal('No namespace provided.');

					done();
				});
		});

		it('should throw if no key', done => {
			cacheDriver.get({
					namespace
				}, fallback)
				.subscribe(null, err => {
					expect(err.message).to.equal('No key provided.');

					done();
				});
		});

		it('should throw if fallback isn\'t a function', done => {
			cacheDriver.get({
					namespace,
					key: 'key'
				}, null)
				.subscribe(null, err => {
					expect(err.message).to.equal('Fallback must be a function which returns an Observable.');

					done();
				});
		});

		it('should run fallback and set cache in background if no cached value', done => {
			cacheDriver.get({
					namespace,
					key: 'inexistentKey'
				}, fallback)
				.subscribe(response => {
					expect(response).to.equal('fresh');
					expect(fallback).to.have.been.called;
					expect(cacheDriver.options.set).to.have.been.called;
				}, null, done);
		});

		describe('no expired', () => {
			it('should get cached value', done => {
				cacheDriver.get({
						namespace,
						key: 'existentKey'
					}, fallback)
					.subscribe(response => {
						expect(response).to.equal('cached');
					}, null, done);
			});

			describe('forceRefresh', () => {
				it('should get fresh value and refresh', done => {
					cacheDriver.get({
						namespace,
						key: 'existentKey',
						forceRefresh: true
					}, fallback)
					.subscribe(response => {
						expect(response).to.equal('fresh');
						expect(fallback).to.have.been.called;
						expect(cacheDriver.options.set).to.have.been.calledWith('spec', 'existentKey', JSON.stringify({
							namespace,
							key: 'existentKey',
							value: 'fresh',
							createdAt
						}));
					}, null, done);
				});
			});
		});

		describe('expired ttr', () => {
			it('should get cached value and refresh in background', done => {
				cacheDriver.get({
						namespace,
						key: 'existentKey'
					}, fallback, {
						ttr: 0
					})
					.subscribe(response => {
						expect(response).to.equal('cached');
						expect(fallback).to.have.been.called;
						expect(cacheDriver.options.set).to.have.been.calledWith('spec', 'existentKey', JSON.stringify({
							namespace,
							key: 'existentKey',
							value: 'fresh',
							createdAt
						}));
					}, null, done);
			});
		});

		describe('_get error', () => {
			beforeEach(() => {
				cacheDriver.options.get = () => Observable.throw('ops...');
			});

			it('should throw', done => {
				cacheDriver.get({
						namespace,
						key: 'key'
					}, fallback)
					.subscribe(null, err => {
						expect(err).to.equal('ops...');
						done();
					});
			});
		});

		describe('non catched error', () => {
			beforeEach(() => {
				if (Date.now.restore) {
					Date.now.restore();
				}

				sinon.stub(Date, 'now')
					.throws(new Error('non catched error'));
			});

			it('should throw', done => {
				cacheDriver.get({
						namespace,
						key: 'existentKey'
					}, fallback)
					.subscribe(null, err => {
						expect(err.message).to.equal('non catched error');
						done();
					});
			});
		});
	});

	describe('_get', () => {
		it('should throw if no namespace', done => {
			cacheDriver._get({})
				.subscribe(null, err => {
					expect(err.message).to.equal('No namespace provided.');

					done();
				});
		});

		it('should throw if no key', done => {
			cacheDriver._get({
					namespace
				})
				.subscribe(null, err => {
					expect(err.message).to.equal('No key provided.');

					done();
				});
		});

		describe('no value', () => {
			it('should return empty', done => {
				cacheDriver._get({
						namespace,
						key: 'inexistentKey'
					})
					.subscribe(response => {
						expect(response).to.deep.equal({});
					}, null, done);
			});
		});

		describe('null value', () => {
			it('should return empty', done => {
				cacheDriver._get({
						namespace,
						key: 'nullKey'
					})
					.subscribe(response => {
						expect(response).to.deep.equal({});
					}, null, done);
			});
		});

		describe('on error', () => {
			beforeEach(() => {
				cacheDriver.options.get = () => Observable.throw('ops...');
			});

			it('should throw', done => {
				cacheDriver._get({
						namespace,
						key: 'key'
					})
					.subscribe(null, err => {
						expect(err).to.equal('ops...');
						done();
					});
			});
		});
	});

	describe('_set', () => {
		it('should throw if no namespace', done => {
			cacheDriver._set({})
				.subscribe(null, err => {
					expect(err.message).to.equal('No namespace provided.');

					done();
				});
		});

		it('should throw if no key', done => {
			cacheDriver._set({
					namespace
				})
				.subscribe(null, err => {
					expect(err.message).to.equal('No key provided.');

					done();
				});
		});

		it('should call set', done => {
			cacheDriver._set({
					namespace,
					key: 'key',
					value: 'fresh',
					createdAt
				})
				.subscribe(() => {
					expect(cacheDriver.options.set).to.have.been.calledWith('spec', 'key', JSON.stringify({
						namespace,
						key: 'key',
						value: 'fresh',
						createdAt
					}));
				}, null, done);
		});

		it('should not call set if no value', done => {
			cacheDriver._set({
					namespace,
					key: 'key'
				})
				.subscribe(() => {
					expect(cacheDriver.options.set).not.to.have.been.called;
				}, null, done);
		});

		describe('on error', () => {
			beforeEach(() => {
				cacheDriver.options.set = () => Observable.throw('ops...');
			});

			it('should throw', done => {
				cacheDriver._set({
						namespace,
						key: 'key',
						value: 'value'
					})
					.subscribe(null, err => {
						expect(err).to.equal('ops...');
						done();
					});
			});
		});
	});

	describe('del', () => {
		it('should throw if no namespace', done => {
			cacheDriver.del({})
				.subscribe(null, err => {
					expect(err.message).to.equal('No namespace provided.');

					done();
				});
		});

		it('should throw if no key', done => {
			cacheDriver.del({
					namespace
				})
				.subscribe(null, err => {
					expect(err.message).to.equal('No key provided.');

					done();
				});
		});

		it('should call del', done => {
			cacheDriver.del({
					namespace,
					key: 'key'
				})
				.subscribe(() => {
					expect(cacheDriver.options.del).to.have.been.calledWith('spec', 'key');
				}, null, done);
		});
	});

	describe('markToRefresh', () => {
		it('should throw if no namespace', done => {
			cacheDriver.markToRefresh({})
				.subscribe(null, err => {
					expect(err.message).to.equal('No namespace provided.');

					done();
				});
		});

		it('should throw if no key', done => {
			cacheDriver.markToRefresh({
					namespace
				})
				.subscribe(null, err => {
					expect(err.message).to.equal('No key provided.');

					done();
				});
		});

		it('should call set', done => {
			cacheDriver.markToRefresh({
					namespace,
					key: 'existentKey'
				})
				.subscribe(response => {
					expect(cacheDriver.options.set).to.have.been.calledWith(
						namespace,
						'existentKey',
						JSON.stringify({
							namespace,
							key: 'existentKey',
							value: 'cached',
							createdAt: 0
						})
					);
				}, null, done);
		});
	});

	describe('clear', () => {
		it('should throw if no namespace', done => {
			cacheDriver.clear({})
				.subscribe(null, err => {
					expect(err.message).to.equal('No namespace provided.');

					done();
				});
		});

		it('should call clear', done => {
			cacheDriver.clear({
					namespace
				})
				.subscribe(response => {
					expect(cacheDriver.options.clear).to.have.been.calledWith(namespace);
				}, null, done);
		});
	});
});
