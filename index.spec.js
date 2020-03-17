const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const zlib = require('zlib');

const rx = require('rxjs');

const CacheDriver = require('./');

chai.use(sinonChai);

const expect = chai.expect;
const namespace = 'spec';
const createdAt = Date.now();

describe('index.js', () => {
    let cacheDriver;
    let fallback;

    beforeEach(() => {
        sinon.stub(Date, 'now')
            .returns(createdAt);

        fallback = sinon.stub()
            .callsFake(() => rx.of('fresh'));

        cacheDriver = new CacheDriver({
            get: sinon.spy(({
                namespace,
                id
            }) => {
                if (id === 'existentId') {
                    return rx.of({
                        namespace,
                        id,
                        value: 'cached',
                        createdAt
                    });
                } else if (id === 'nullid') {
                    return rx.of(null);
                }

                return rx.empty();
            }),
            set: sinon.spy(({
                namespace,
                id,
                value
            }) => rx.of({
                namespace,
                id,
                value
            })),
            del: sinon.spy(({
                namespace,
                id
            }) => rx.of({
                namespace,
                id
            })),
            clear: sinon.spy(({
                namespace
            }) => rx.of({
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

        it('should throw if no id', done => {
            cacheDriver.get({
                    namespace
                }, fallback)
                .subscribe(null, err => {
                    expect(err.message).to.equal('No id provided.');

                    done();
                });
        });

        it('should throw if fallback isn\'t a function', done => {
            cacheDriver.get({
                    namespace,
                    id: 'id'
                }, null)
                .subscribe(null, err => {
                    expect(err.message).to.equal('Fallback must be a function which returns an Observable.');

                    done();
                });
        });

        it('should run fallback and set cache in background if no cached value', done => {
            cacheDriver.get({
                    namespace,
                    id: 'inexistentId'
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
                        id: 'existentId'
                    }, fallback)
                    .subscribe(response => {
                        expect(response).to.equal('cached');
                    }, null, done);
            });

            describe('refresh', () => {
                it('should get fresh value and refresh', done => {
                    cacheDriver.get({
                            namespace,
                            id: 'existentId'
                        }, fallback, {
                            refresh: true
                        })
                        .subscribe(response => {
                            expect(response).to.equal('fresh');
                            expect(fallback).to.have.been.called;
                            expect(cacheDriver.options.set).to.have.been.calledWith({
                                createdAt,
                                id: 'existentId',
                                namespace,
                                ttl: Math.floor((createdAt + cacheDriver.options.ttl) / 1000),
                                value: 'fresh'
                            });
                        }, null, done);
                });
            });
        });

        describe('expired ttr', () => {
            it('should get cached value and refresh in background', done => {
                cacheDriver.get({
                        namespace,
                        id: 'existentId'
                    }, fallback, {
                        ttr: 0
                    })
                    .subscribe(response => {
                        expect(response).to.equal('cached');
                        expect(fallback).to.have.been.called;
                        expect(cacheDriver.options.set).to.have.been.calledWith({
                            createdAt,
                            id: 'existentId',
                            namespace,
                            ttl: Math.floor((createdAt + cacheDriver.options.ttl) / 1000),
                            value: 'fresh'
                        });
                    }, null, done);
            });
        });

        describe('_get error', () => {
            beforeEach(() => {
                cacheDriver.options.get = () => rx.throwError('ops...');
            });

            it('should throw', done => {
                cacheDriver.get({
                        namespace,
                        id: 'id'
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
                        id: 'existentId'
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

        it('should throw if no id', done => {
            cacheDriver._get({
                    namespace
                })
                .subscribe(null, err => {
                    expect(err.message).to.equal('No id provided.');

                    done();
                });
        });

        it('should return', done => {
            cacheDriver._get({
                    namespace,
                    id: 'existentId'
                })
                .subscribe(response => {
                    expect(response).to.deep.equal({
                        namespace: 'spec',
                        id: 'existentId',
                        value: 'cached',
                        createdAt: response.createdAt
                    });
                }, null, done);
        });

        it('should return', done => {
            cacheDriver._get({
                    namespace,
                    id: 'existentId'
                })
                .subscribe(response => {
                    expect(response).to.deep.equal({
                        namespace: 'spec',
                        id: 'existentId',
                        value: 'cached',
                        createdAt: response.createdAt
                    });
                }, null, done);
        });

        describe('no value', () => {
            it('should return empty', done => {
                cacheDriver._get({
                        namespace,
                        id: 'inexistentId'
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
                        id: 'nullid'
                    })
                    .subscribe(response => {
                        expect(response).to.deep.equal({});
                    }, null, done);
            });
        });

        describe('on error', () => {
            beforeEach(() => {
                cacheDriver.options.get = () => rx.throwError('ops...');
            });

            it('should throw', done => {
                cacheDriver._get({
                        namespace,
                        id: 'id'
                    })
                    .subscribe(null, err => {
                        expect(err).to.equal('ops...');
                        done();
                    });
            });
        });

        describe('with gzip', () => {
            beforeEach(() => {
                cacheDriver.gzip = true;
                cacheDriver.options.get = sinon.spy(({
                    namespace,
                    id
                }) => {
                    return rx.of({
                        namespace,
                        id,
                        value: zlib.gzipSync(JSON.stringify('cached')),
                        createdAt
                    });
                });
            });

            it('should unzip', done => {
                cacheDriver._get({
                        namespace,
                        id: 'existentId'
                    })
                    .subscribe(response => {
                        expect(response).to.deep.equal({
                            namespace: 'spec',
                            id: 'existentId',
                            value: 'cached',
                            createdAt: response.createdAt
                        });
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

        it('should throw if no id', done => {
            cacheDriver._set({
                    namespace
                })
                .subscribe(null, err => {
                    expect(err.message).to.equal('No id provided.');

                    done();
                });
        });

        it('should call set', done => {
            cacheDriver._set({
                    namespace,
                    id: 'id',
                    value: 'fresh',
                    createdAt
                })
                .subscribe(() => {
                    expect(cacheDriver.options.set).to.have.been.calledWith({
                        createdAt,
                        id: 'id',
                        namespace,
                        ttl: Math.floor((createdAt + cacheDriver.options.ttl) / 1000),
                        value: 'fresh'
                    });
                }, null, done);
        });

        it('should not call set if no value', done => {
            cacheDriver._set({
                    namespace,
                    id: 'id'
                })
                .subscribe(() => {
                    expect(cacheDriver.options.set).not.to.have.been.called;
                }, null, done);
        });

        describe('on error', () => {
            beforeEach(() => {
                cacheDriver.options.set = () => rx.throwError('ops...');
            });

            it('should throw', done => {
                cacheDriver._set({
                        namespace,
                        id: 'id',
                        value: 'value'
                    })
                    .subscribe(null, err => {
                        expect(err).to.equal('ops...');
                        done();
                    });
            });
        });

        describe('with gzip', () => {
            beforeEach(() => {
                cacheDriver.gzip = true;
            });

            it('should zip', done => {
                cacheDriver._set({
                        namespace,
                        id: 'id',
                        value: 'fresh',
                        createdAt
                    })
                    .subscribe(response => {
                        expect(cacheDriver.options.set).to.have.been.calledWith({
                            createdAt,
                            id: 'id',
                            namespace,
                            ttl: Math.floor((createdAt + cacheDriver.options.ttl) / 1000),
                            value: zlib.gzipSync(JSON.stringify('fresh'))
                        });
                    }, null, done);
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

        it('should throw if no id', done => {
            cacheDriver.del({
                    namespace
                })
                .subscribe(null, err => {
                    expect(err.message).to.equal('No id provided.');

                    done();
                });
        });

        it('should call del', done => {
            cacheDriver.del({
                    namespace,
                    id: 'id'
                })
                .subscribe(() => {
                    expect(cacheDriver.options.del).to.have.been.calledWith({
                        namespace: 'spec',
                        id: 'id'
                    });
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

        it('should throw if no id', done => {
            cacheDriver.markToRefresh({
                    namespace
                })
                .subscribe(null, err => {
                    expect(err.message).to.equal('No id provided.');

                    done();
                });
        });

        it('should call set', done => {
            cacheDriver.markToRefresh({
                    namespace,
                    id: 'existentId'
                })
                .subscribe(response => {
                    expect(cacheDriver.options.set).to.have.been.calledWith({
                        namespace,
                        id: 'existentId',
                        value: 'cached',
                        createdAt: 0
                    });
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
                    expect(cacheDriver.options.clear).to.have.been.calledWith({
                        namespace
                    });
                }, null, done);
        });

        it('should call clear with id', done => {
            cacheDriver.clear({
                    id: 'id',
                    namespace
                })
                .subscribe(response => {
                    expect(cacheDriver.options.clear).to.have.been.calledWith({
                        id: 'id',
                        namespace
                    });
                }, null, done);
        });
    });
});