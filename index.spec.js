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
const testRx = (next, error, complete) => {
    return response => {
        try {
            if (typeof next === 'function') {
                next(response);
            }
            
            if (typeof complete === 'function') {
                complete();
            }
        } catch (err) {
            if (typeof error === 'function') {
                return error(err);
            }

            throw err;
        }
    };
};

describe('index.js', () => {
    let cacheDriver = new CacheDriver({
        clear: () => null,
        del: () => null,
        get: () => null,
        set: () => null
    });

    let source;

    beforeEach(() => {
        sinon.stub(Date, 'now')
            .returns(createdAt);

        source = sinon.stub()
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
                        value: JSON.stringify('cached'),
                        createdAt
                    });
                } else if (id === 'nullId') {
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
            cacheDriver.get({}, source)
                .subscribe(null, testRx(err => {
                    expect(err.message).to.equal('No namespace provided.');
                }, null, done));
        });

        it('should throw if source isn\'t a function', done => {
            cacheDriver.get({
                    namespace,
                    id: 'id'
                }, null)
                .subscribe(null, testRx(err => {
                    expect(err.message).to.equal('Source must be a function which returns an Observable.');
                }, null, done));
        });

        it('should run source and set cache if no cached value', done => {
            cacheDriver.get({
                    namespace,
                    id: 'inexistentId'
                }, source)
                .subscribe(testRx(response => {
                    expect(response).to.equal('fresh');
                    expect(source).to.have.been.called;
                    expect(cacheDriver.options.set).to.have.been.calledWith({
                        createdAt,
                        id: 'inexistentId',
                        namespace,
                        ttl: Math.floor((createdAt + cacheDriver.options.ttl) / 1000),
                        value: JSON.stringify('fresh')
                    });
                }, null, done));
        });

        it('should run source and not set cache if setFilter returns false', done => {
            cacheDriver.get({
                    namespace,
                    id: 'inexistentId'
                }, source, {
                    setFilter: response => {
                        return response !== 'fresh';
                    }
                })
                .subscribe(testRx(response => {
                    expect(response).to.equal('fresh');
                    expect(source).to.have.been.called;
                    expect(cacheDriver.options.set).to.not.have.been.called;
                }, null, done));
        });

        it('should run source and set cache with custom ttl', done => {
            cacheDriver.get({
                    namespace,
                    id: 'inexistentId'
                }, source, {
                    ttl: 1
                })
                .subscribe(testRx(response => {
                    expect(response).to.equal('fresh');
                    expect(source).to.have.been.called;
                    expect(cacheDriver.options.set).to.have.been.calledWith({
                        createdAt,
                        id: 'inexistentId',
                        namespace,
                        ttl: Math.floor((createdAt + 1) / 1000),
                        value: JSON.stringify('fresh')
                    });
                }, null, done));
        });

        describe('no expired', () => {
            it('should get cached value', done => {
                cacheDriver.get({
                        namespace,
                        id: 'existentId'
                    }, source)
                    .subscribe(testRx(response => {
                        expect(response).to.equal('cached');
                    }, null, done));
            });

            describe('refresh', () => {
                it('should get fresh value and refresh', done => {
                    cacheDriver.get({
                            namespace,
                            id: 'existentId'
                        }, source, {
                            refresh: true
                        })
                        .subscribe(testRx(response => {
                            expect(response).to.equal('fresh');
                            expect(source).to.have.been.called;
                            expect(cacheDriver.options.set).to.have.been.calledWith({
                                createdAt,
                                id: 'existentId',
                                namespace,
                                ttl: Math.floor((createdAt + cacheDriver.options.ttl) / 1000),
                                value: JSON.stringify('fresh')
                            });
                        }, null, done));
                });
            });
        });

        describe('expired ttr', () => {
            it('should refresh', done => {
                cacheDriver.get({
                        namespace,
                        id: 'existentId'
                    }, source, {
                        ttr: 0
                    })
                    .subscribe(testRx(response => {
                        expect(response).to.equal('fresh');
                        expect(source).to.have.been.called;
                        expect(cacheDriver.options.set).to.have.been.calledWith({
                            createdAt,
                            id: 'existentId',
                            namespace,
                            ttl: Math.floor((createdAt + cacheDriver.options.ttl) / 1000),
                            value: JSON.stringify('fresh')
                        });
                    }, null, done));
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
                    }, source)
                    .subscribe(null, testRx(err => {
                        expect(err).to.equal('ops...');
                    }, null, done));
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
                    }, source)
                    .subscribe(null, testRx(err => {
                        expect(err.message).to.equal('non catched error');
                    }, null, done));
            });
        });
    });

    describe('_get', () => {
        it('should throw if no namespace', done => {
            cacheDriver._get({})
                .subscribe(null, testRx(err => {
                    expect(err.message).to.equal('No namespace provided.');
                }, null, done));
        });

        it('should returns', done => {
            cacheDriver._get({
                    namespace,
                    id: 'existentId'
                })
                .subscribe(testRx(response => {
                    expect(response).to.deep.equal({
                        namespace,
                        id: 'existentId',
                        value: 'cached',
                        createdAt: response.createdAt
                    });
                }, null, done));
        });

        it('should returns', done => {
            cacheDriver._get({
                    namespace,
                    id: 'existentId'
                })
                .subscribe(testRx(response => {
                    expect(response).to.deep.equal({
                        namespace,
                        id: 'existentId',
                        value: 'cached',
                        createdAt: response.createdAt
                    });
                }, null, done));
        });

        describe('no value', () => {
            it('should returns empty', done => {
                cacheDriver._get({
                        namespace,
                        id: 'inexistentId'
                    })
                    .subscribe(testRx(response => {
                        expect(response).to.deep.equal({});
                    }, null, done));
            });
        });

        describe('null value', () => {
            it('should returns empty', done => {
                cacheDriver._get({
                        namespace,
                        id: 'nullId'
                    })
                    .subscribe(testRx(response => {
                        expect(response).to.deep.equal({});
                    }, null, done));
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
                    .subscribe(null, testRx(err => {
                        expect(err).to.equal('ops...');
                    }, null, done));
            });
        });

        describe('with gzip', () => {
            beforeEach(() => {
                cacheDriver.options.gzip = true;
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
                    .subscribe(testRx(response => {
                        expect(response).to.deep.equal({
                            namespace,
                            id: 'existentId',
                            value: 'cached',
                            createdAt: response.createdAt
                        });
                    }, null, done));
            });
        });

        describe('no json', () => {
            beforeEach(() => {
                cacheDriver.options.json = false;
            });

            afterEach(() => {
                cacheDriver.options.json = true;
            });

            it('should returns', done => {
                cacheDriver._get({
                        namespace,
                        id: 'existentId'
                    })
                    .subscribe(testRx(response => {
                        expect(response).to.deep.equal({
                            namespace,
                            id: 'existentId',
                            value: '"cached"',
                            createdAt: response.createdAt
                        });
                    }, null, done));
            });
        });
    });

    describe('_gzip', () => {
        it('should throw if value not string or buffer', done => {
            cacheDriver._gzip({
                    value: {
                        a: 1
                    }
                })
                .subscribe(null, testRx(err => {
                    expect(err.message).to.equal('value must be string or Buffer.');
                }, null, done));
        });

        it('should not gzip if false', done => {
            cacheDriver.options.gzip = false;
            cacheDriver._gzip({
                    value: JSON.stringify({
                        a: 1
                    })
                })
                .subscribe(testRx(response => {
                    expect(response).to.deep.equal({
                        value: JSON.stringify({
                            a: 1
                        })
                    });
                }, null, done));
        });

        it('should not gzip if wrong option type', done => {
            cacheDriver.options.gzip = 'a';
            cacheDriver._gzip({
                    value: JSON.stringify({
                        a: 1
                    })
                })
                .subscribe(testRx(response => {
                    expect(response).to.deep.equal({
                        value: JSON.stringify({
                            a: 1
                        })
                    });
                }, null, done));
        });

        it('should not gzip if lass than threshold', done => {
            cacheDriver.options.gzip = 10;
            cacheDriver._gzip({
                    value: JSON.stringify({
                        a: 1
                    })
                })
                .subscribe(testRx(response => {
                    expect(response).to.deep.equal({
                        value: JSON.stringify({
                            a: 1
                        })
                    });
                }, null, done));
        });

        it('should gzip', done => {
            cacheDriver.options.gzip = 6 / 1000;
            cacheDriver._gzip({
                    value: JSON.stringify({
                        a: 1
                    })
                })
                .subscribe(testRx(response => {
                    expect(response).to.deep.equal({
                        value: zlib.gzipSync(JSON.stringify({
                            a: 1
                        }))
                    });
                }, null, done));
        });
    });

    describe('_gunzip', () => {
        it('should not unzip object', done => {
            cacheDriver._gunzip({
                    value: {
                        a: 1
                    }
                })
                .subscribe(testRx(response => {
                    expect(response).to.deep.equal({
                        value: {
                            a: 1
                        }
                    });
                }, null, done));
        });

        it('should not unzip other buffer', done => {
            const buffer = Buffer.from(JSON.stringify({
                a: 1
            }));

            cacheDriver._gunzip({
                    value: buffer
                })
                .subscribe(testRx(response => {
                    expect(response).to.deep.equal({
                        value: buffer
                    });
                }, null, done));
        });

        it('should unzip', done => {
            const zipped = zlib.gzipSync(JSON.stringify({
                a: 1
            }));

            cacheDriver._gunzip({
                    value: zipped
                })
                .subscribe(testRx(response => {
                    expect(response).to.deep.equal({
                        value: JSON.stringify({
                            a: 1
                        })
                    });
                }, null, done));
        });
    });

    describe('_set', () => {
        it('should throw if no namespace', done => {
            cacheDriver._set({})
                .subscribe(null, testRx(err => {
                    expect(err.message).to.equal('No namespace provided.');
                }, null, done));
        });

        it('should call set', done => {
            cacheDriver._set({
                    namespace,
                    id: 'id',
                    value: 'fresh',
                    createdAt
                })
                .subscribe(testRx(() => {
                    expect(cacheDriver.options.set).to.have.been.calledWith({
                        createdAt,
                        id: 'id',
                        namespace,
                        ttl: Math.floor((createdAt + cacheDriver.options.ttl) / 1000),
                        value: JSON.stringify('fresh')
                    });
                }, null, done));
        });

        it('should call set with custom options', done => {
            cacheDriver._set({
                    namespace,
                    id: 'id',
                    value: 'fresh',
                    createdAt
                }, {
                    ttl: 1
                })
                .subscribe(testRx(() => {
                    expect(cacheDriver.options.set).to.have.been.calledWith({
                        createdAt,
                        id: 'id',
                        namespace,
                        ttl: Math.floor((createdAt + 1) / 1000),
                        value: JSON.stringify('fresh')
                    });
                }, null, done));
        });

        it('should not call set if no value', done => {
            cacheDriver._set({
                    namespace,
                    id: 'id'
                })
                .subscribe(null, null, testRx(() => {
                    expect(cacheDriver.options.set).not.to.have.been.called;
                    done();
                }));
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
                    .subscribe(null, testRx(err => {
                        expect(err).to.equal('ops...');
                    }, null, done));
            });
        });

        describe('with gzip', () => {
            beforeEach(() => {
                cacheDriver.options.gzip = true;
            });

            it('should zip', done => {
                cacheDriver._set({
                        namespace,
                        id: 'id',
                        value: 'fresh',
                        createdAt
                    })
                    .subscribe(testRx(response => {
                        expect(cacheDriver.options.set).to.have.been.calledWith({
                            createdAt,
                            id: 'id',
                            namespace,
                            ttl: Math.floor((createdAt + cacheDriver.options.ttl) / 1000),
                            value: zlib.gzipSync(JSON.stringify('fresh'))
                        });
                    }, null, done));
            });
        });

        describe('no json', () => {
            beforeEach(() => {
                cacheDriver.options.json = false;
            });

            afterEach(() => {
                cacheDriver.options.json = true;
            });

            it('should returns', done => {
                const obj = {};

                cacheDriver._set({
                        namespace,
                        id: 'id',
                        value: obj,
                        createdAt
                    })
                    .subscribe(() => {
                        expect(cacheDriver.options.set).to.have.been.calledWith({
                            createdAt,
                            id: 'id',
                            namespace,
                            ttl: Math.floor((createdAt + cacheDriver.options.ttl) / 1000),
                            value: obj
                        });
                    }, null, done);
            });
        });
    });

    describe('del', () => {
        it('should throw if no namespace', done => {
            cacheDriver.del({})
                .subscribe(null, testRx(err => {
                    expect(err.message).to.equal('No namespace provided.');
                }, null, done));
        });

        it('should call del', done => {
            cacheDriver.del({
                    namespace,
                    id: 'id'
                })
                .subscribe(() => {
                    expect(cacheDriver.options.del).to.have.been.calledWith({
                        namespace,
                        id: 'id'
                    });
                }, null, done);
        });
    });

    describe('markToRefresh', () => {
        it('should throw if no namespace', done => {
            cacheDriver.markToRefresh({})
                .subscribe(null, testRx(err => {
                    expect(err.message).to.equal('No namespace provided.');
                }, null, done));
        });

        it('should call set', done => {
            cacheDriver.markToRefresh({
                    namespace,
                    id: 'existentId'
                })
                .subscribe(testRx(response => {
                    expect(cacheDriver.options.set).to.have.been.calledWith({
                        namespace,
                        id: 'existentId',
                        value: JSON.stringify('cached'),
                        createdAt: 0
                    });
                }, null, done));
        });
    });

    describe('clear', () => {
        it('should throw if no namespace', done => {
            cacheDriver.clear({})
                .subscribe(null, testRx(err => {
                    expect(err.message).to.equal('No namespace provided.');
                }, null, done));
        });

        it('should call clear', done => {
            cacheDriver.clear({
                    namespace
                })
                .subscribe(testRx(response => {
                    expect(cacheDriver.options.clear).to.have.been.calledWith({
                        namespace
                    });
                }, null, done));
        });

        it('should call clear with id', done => {
            cacheDriver.clear({
                    id: 'id',
                    namespace
                })
                .subscribe(testRx(response => {
                    expect(cacheDriver.options.clear).to.have.been.calledWith({
                        id: 'id',
                        namespace
                    });
                }, null, done));
        });
    });
});