[![CircleCI](https://circleci.com/gh/feliperohdee/smallorange-rxjs-cache-driver.svg?style=svg)](https://circleci.com/gh/feliperohdee/smallorange-rxjs-cache-driver)

# Small Orange RXJS Cache Driver

Simple pluggable reactive cache driver powered and RxJS, it uses cache first strategy. Once expired, it returns cached value and feed cache in background to deliver fresh result at next request.
It is pluggable with your own custom logic via 'operations' params.

## Sample (with DynamoDB)
		
		const {
			Observable
		} = require('rxjs');
		
		const CacheDriver = require('smallorange-rxjs-cache-driver');
		const {
			DynamoDB
		} = require('smallorange-dynamodb-client');

		const dynamodb = new DynamoDB();

		const namespace = 'someNamespace';
		const cacheDriver = new CacheDriver({
			logError: console.error,
			ttl: 7200 * 1000,
			operations: {
				set: (namespace, key, value) => dynamodb.set({namespace, key, value}),
				get: (namespace, key) => dynamodb.get({namespace, key}),
				del: (namespace, key) => dynamodb.del({namespace, key}),
				clear: (namespace) => dynamodb.fetch({namespace})
					.mergeMap(::dynamodb.del)
			}
		});

		const fallback = args => Observable.of('value'); // fallback will be subscribed if key doesn't exists or is expired, this value will be attached to this key with provided ttl

		cacheDriver.get({
			namespace,
			key: 'someKey'
		}, fallback)
		.subscribe(response => {
			console.log(response); // will print "value" from fallback
		});

		cacheDriver.get({
			namespace,
			key: 'someKey'
		}, fallback)
		.subscribe(response => {
			console.log(response); // will print "value" from cache
		});

		// IF EXPIRED

		cacheDriver.get({
			namespace,
			key: 'someKey'
		}, fallback)
		.subscribe(response => {
			console.log(response); // will print "value" from cache, and run fallback in background to feed cache to the next request gets the fresh result
		});

		// FORCE CACHE REFRESH AFTER NEXT REQUEST ALL KEYS WHICH CONTAIN "key-"
		cacheDriver.markToRefresh({
			namespace,
			keys: ['key-']
		})
		.subscribe(response => {
			console.log(response);
		});

		// UNSET KEY MANUALLY
		cacheDriver.del({
			namespace,
			key: 'key-1'
		})
		.subscribe(response => {
			console.log(response);
		});

		// CLEAR WHOLE NAMESPACE MANUALLY
		cacheDriver.clear({
			namespace
		})
		.subscribe(response => {
			console.log(response);
		});

		
