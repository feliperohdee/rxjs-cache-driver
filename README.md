# RxJS Cache Driver

Simple pluggable reactive cache driver powered by RxJS. Pluggable with your custom logic via get, set, del, and clear operations.

## Sample (with DynamoDB)
		
		const rx = require('rxjs');
		
		const CacheDriver = require('rxjs-rxjs-cache-driver');
		const {
			DynamoDB
		} = require('rxjs-dynamodb-client');

		const dynamodb = new DynamoDB();

		const namespace = 'someNamespace';
		const cacheDriver = new CacheDriver({
			gzip: false, // or number in Kb
			ttr: 7200 * 1000, // default time to refresh (2 hours default)
			set: dynamodb.insertOrReplace,
			setFilter: args => true, // filter when cache should set
			get: dynamodb.get,
			del: dynamodb.del,
			clear: args => dynamodb.fetch(args)
				.pipe(
					mergeMap(dynamodb.del)
				)
		});

		// source will be subscribed if id doesn't exists or is expired, this value will be attached to this id with provided ttr
		const source = args => {
			retun rx.of('value');
		};

		cacheDriver.get({
			namespace,
			id: 'inexistentId'
		}, source, {
			ttr: 100 // custom ttr
		})
		.subscribe(response => {
			console.log(response); // will print "value" from source
		});

		cacheDriver.get({
			namespace,
			id: 'someId'
		}, source, {
			ttr: 100
		})
		.subscribe(response => {
			console.log(response); // will print "value" from cache
		});

		cacheDriver.get({
			namespace,
			id: 'someId'
		}, source, {
			ttr: 100,
			refresh: true
		})
		.subscribe(response => {
			console.log(response); // will refresh cache and print "value" from source
		});
	
		// IF EXPIRED
		cacheDriver.get({
			namespace,
			id: 'someId'
		}, source)
		.subscribe(response => {
			console.log(response); // will refresh and print "value" from source
		});

		// FORCE CACHE REFRESH AFTER NEXT REQUEST
		cacheDriver.markToRefresh({
			namespace,
			id: 'id'
		})
		.subscribe(response => {
			console.log(response);
		});

		// UNSET MANUALLY
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

		
