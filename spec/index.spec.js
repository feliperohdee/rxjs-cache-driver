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
	let fallbackStub;
	let fallback;

	beforeEach(() => {
		sinon.stub(Date, 'now')
			.returns(createdAt);

		fallbackStub = sinon.stub();
		fallback = () => Observable.of('fresh')
			.do(() => fallbackStub());

		cacheDriver = new CacheDriver({
			onError: sinon.stub(),
			operations: {
				get: sinon.spy((namespace, key) => key === 'existentKey' ? Observable.of({
						namespace,
						key,
						value: 'cached',
						createdAt
					})
					.map(JSON.stringify) : Observable.empty()),
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
			}
		});
	});

	afterEach(() => {
		Date.now.restore();
	});

	describe('constructor', () => {
		it('should throw if no operations', () => {
			expect(() => new CacheDriver()).to.throw('operations are missing.');
		});

		it('should throw if no operations.get', () => {
			expect(() => new CacheDriver({
				operations: {
					set: () => null,
					del: () => null,
					clear: () => null
				}
			})).to.throw('operations.get is missing.');
		});

		it('should throw if no operations.set', () => {
			expect(() => new CacheDriver({
				operations: {
					get: () => null,
					del: () => null,
					clear: () => null
				}
			})).to.throw('operations.set is missing.');
		});

		it('should throw if no operations.del', () => {
			expect(() => new CacheDriver({
				operations: {
					get: () => null,
					set: () => null,
					clear: () => null
				}
			})).to.throw('operations.del is missing.');
		});

		it('should throw if no operations.clear', () => {
			expect(() => new CacheDriver({
				operations: {
					get: () => null,
					set: () => null,
					del: () => null
				}
			})).to.throw('operations.clear is missing.');
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

					expect(fallbackStub).to.have.been.called;
					expect(cacheDriver.options.operations.set).to.have.been.called;
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
		});

		describe('expired ttr', () => {
			beforeEach(() => {
				cacheDriver.options.ttr = 0;
			});

			afterEach(() => {
				cacheDriver.options.ttr = 7200;
			});

			it('should get cached value refresh in background', done => {
				cacheDriver.get({
						namespace,
						key: 'existentKey'
					}, fallback)
					.do(response => {
						expect(response).to.equal('cached');
						expect(cacheDriver.options.operations.set).to.have.been.calledWith('spec', 'existentKey', JSON.stringify({
							namespace,
							key: 'existentKey',
							value: 'fresh',
							createdAt
						}));
					})
					.mergeMap(() => cacheDriver.get({
						namespace,
						key: 'key'
					}, fallback))
					.subscribe(response => {
						expect(response).to.equal('fresh');
					}, null, done);
			});
		});

		describe('_get error', () => {
			beforeEach(() => {
				cacheDriver.options.operations.get = () => Observable.throw('ops...');
			});

			it('should run fallback and refresh in background', done => {
				cacheDriver.get({
						namespace,
						key: 'key'
					}, fallback)
					.subscribe(response => {
						expect(response).to.equal('fresh');
						expect(fallbackStub).to.have.been.called;
						expect(cacheDriver.options.onError).to.have.been.called;
						expect(cacheDriver.options.operations.set).to.have.been.called;
					}, null, done);
			});
		});

		describe('non catched error', () => {
			beforeEach(() => {
				if (Date.now.restore) {
					Date.now.restore();
				}

				sinon.stub(Date, 'now')
					.throws('non catched error');
			});

			it('should run fallback and not set cache', done => {
				cacheDriver.get({
						namespace,
						key: 'key'
					}, fallback)
					.subscribe(response => {
						expect(response).to.equal('fresh');

						expect(fallbackStub).to.have.been.called;
					}, null, done);
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
			const callback = sinon.stub();

			it('should return empty', done => {
				cacheDriver._get({
						namespace,
						key: 'inexistentKey'
					})
					.subscribe(callback, null, () => {
						expect(callback).to.have.been.called;
						expect(callback).to.have.been.calledWith({});

						done();
					});
			});
		});

		describe('on error', () => {
			beforeEach(() => {
				cacheDriver.options.operations.get = () => Observable.throw('ops...');
			});

			it('should return empty', done => {
				cacheDriver._get({
						namespace,
						key: 'key'
					})
					.subscribe(response => {
						expect(response).to.deep.equal({});
						expect(cacheDriver.options.onError).to.have.been.called;
					}, null, done);
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

		it('should call operations.set', done => {
			cacheDriver._set({
					namespace,
					key: 'key',
					value: 'fresh',
					createdAt
				})
				.subscribe(() => {
					expect(cacheDriver.options.operations.set).to.have.been.calledWith('spec', 'key', JSON.stringify({
						namespace,
						key: 'key',
						value: 'fresh',
						createdAt
					}));
				}, null, done);
		});

		it('should not call operations.set if no value', done => {
			cacheDriver._set({
					namespace,
					key: 'key'
				})
				.subscribe(() => {
					expect(cacheDriver.options.operations.set).not.to.have.been.called;
					expect(cacheDriver.options.onError).not.to.have.been.called;
				}, null, done);
		});

		describe('on error', () => {
			beforeEach(() => {
				cacheDriver.options.operations.set = () => Observable.throw('ops...');
			});

			it('should return nothing', done => {
				const values = [];

				cacheDriver._set({
						namespace,
						key: 'key',
						value: 'value'
					})
					.subscribe(values.push, null, () => {
						expect(values).to.deep.equal([]);
						expect(cacheDriver.options.onError).to.have.been.called;

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

		it('should call operations.del', done => {
			cacheDriver.del({
					namespace,
					key: 'key'
				})
				.subscribe(() => {
					expect(cacheDriver.options.operations.del).to.have.been.calledWith('spec', 'key');
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

		it('should call operations.set', done => {
			cacheDriver.markToRefresh({
					namespace,
					key: 'existentKey'
				})
				.subscribe(response => {
					expect(cacheDriver.options.operations.set).to.have.been.calledWith(
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

		it('should call operations.clear', done => {
			cacheDriver.clear({
					namespace
				})
				.subscribe(response => {
					expect(cacheDriver.options.operations.clear).to.have.been.calledWith(namespace);
				}, null, done);
		});
	});
});
