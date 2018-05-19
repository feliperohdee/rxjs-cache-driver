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
            get: sinon.spy(({
                namespace,
                id
            }) => {
                if (id === 'existentid') {
                    return Observable.of({
                        namespace,
                        id,
                        value: 'cached',
                        createdAt
                    });
                } else if (id === 'nullid') {
                    return Observable.of(null);
                }

                return Observable.empty();
            }),
            set: sinon.spy(({
                namespace,
                id,
                value
            }) => Observable.of({
                namespace,
                id,
                value
            })),
            del: sinon.spy(({
                namespace,
                id
            }) => Observable.of({
                namespace,
                id
            })),
            clear: sinon.spy(({
                namespace
            }) => Observable.of({
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
                    id: 'inexistentid'
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
                        id: 'existentid'
                    }, fallback)
                    .subscribe(response => {
                        expect(response).to.equal('cached');
                    }, null, done);
            });

            describe('forceRefresh', () => {
                it('should get fresh value and refresh', done => {
                    cacheDriver.get({
                            namespace,
                            id: 'existentid'
                        }, fallback, {
                            forceRefresh: true
                        })
                        .subscribe(response => {
                            expect(response).to.equal('fresh');
                            expect(fallback).to.have.been.called;
                            expect(cacheDriver.options.set).to.have.been.calledWith({
                                namespace,
                                id: 'existentid',
                                value: 'fresh',
                                createdAt
                            });
                        }, null, done);
                });
            });
        });

        describe('expired ttr', () => {
            it('should get cached value and refresh in background', done => {
                cacheDriver.get({
                        namespace,
                        id: 'existentid'
                    }, fallback, {
                        ttr: 0
                    })
                    .subscribe(response => {
                        expect(response).to.equal('cached');
                        expect(fallback).to.have.been.called;
                        expect(cacheDriver.options.set).to.have.been.calledWith({
                            namespace,
                            id: 'existentid',
                            value: 'fresh',
                            createdAt
                        });
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
                        id: 'existentid'
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
                    id: 'existentid'
                })
                .subscribe(response => {
                    expect(response).to.deep.equal({
                        namespace: 'spec',
                        id: 'existentid',
                        value: 'cached',
                        createdAt: response.createdAt
                    });
                }, null, done);
        });

        it('should return', done => {
            cacheDriver._get({
                    namespace,
                    id: 'existentid'
                })
                .subscribe(response => {
                    expect(response).to.deep.equal({
                        namespace: 'spec',
                        id: 'existentid',
                        value: 'cached',
                        createdAt: response.createdAt
                    });
                }, null, done);
        });

        describe('no value', () => {
            it('should return empty', done => {
                cacheDriver._get({
                        namespace,
                        id: 'inexistentid'
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
                cacheDriver.options.get = () => Observable.throw('ops...');
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
                        namespace,
                        id: 'id',
                        value: 'fresh',
                        createdAt
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
                cacheDriver.options.set = () => Observable.throw('ops...');
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
                    id: 'existentid'
                })
                .subscribe(response => {
                    expect(cacheDriver.options.set).to.have.been.calledWith({
                        namespace,
                        id: 'existentid',
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
    });
});