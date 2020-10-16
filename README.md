# RxJS Cache Driver

Simple pluggable reactive cache driver powered and RxJS, it uses cache first strategy. Once expired, it returns cached value and feed cache in background to deliver fresh result at next request.
It is pluggable with your custom logic via get, set, del, and clear operations.

## Sample (with DynamoDB)
		
		const {
			Observable
		} = require('rxjs');
		
		const CacheDriver = require('rxjs-rxjs-cache-driver');
		const {
			DynamoDB
		} = require('rxjs-dynamodb-client');

		const dynamodb = new DynamoDB();

		const namespace = 'someNamespace';
		const cacheDriver = new CacheDriver({
			gzip: false,
			ttr: 7200 * 1000, // default time to refresh (2 hours default)
			set: dynamodb.insertOrReplace,
			get: dynamodb.get,
			del: dynamodb.del,
			clear: args => dynamodb.fetch(args)
				.pipe(
					mergeMap(dynamodb.del)
				)
		});

		const fallback = args => Observable.of('value'); // fallback will be subscribed if id doesn't exists or is expired, this value will be attached to this id with provided ttr

		cacheDriver.get({
			namespace,
			id: 'inexistentId'
		}, fallback, {
			ttr: 100 // custom ttr
		})
		.subscribe(response => {
			console.log(response); // will print "value" from fallback
		});

		cacheDriver.get({
			namespace,
			id: 'someId'
		}, fallback, {
			ttr: 100
		})
		.subscribe(response => {
			console.log(response); // will print "value" from cache
		});

		cacheDriver.get({
			namespace,
			id: 'someId'
		}, fallback, {
			ttr: 100,
			refresh: true
		})
		.subscribe(response => {
			console.log(response); // will print "value" from fallback and refresh cache
		});
		
		cacheDriver.get({
			namespace,
			id: 'someId'
		}, fallback, {
			ttr: 0
		})
		.subscribe(response => {
			console.log(response); // will print "value" from cache and refresh cache in background
		});

		// IF EXPIRED

		cacheDriver.get({
			namespace,
			id: 'someId'
		}, fallback)
		.subscribe(response => {
			console.log(response); // will print "value" from cache, and run fallback in background to feed cache to the next request gets the fresh result
		});

		// FORCE CACHE REFRESH AFTER NEXT REQUEST ALL IDS WHICH CONTAIN "id-"
		cacheDriver.markToRefresh({
			namespace,
			ids: ['id-']
		})
		.subscribe(response => {
			console.log(response);
		});

		// UNSET id MANUALLY
		cacheDriver.del({
			namespace,
			id: 'id-1'
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

		
