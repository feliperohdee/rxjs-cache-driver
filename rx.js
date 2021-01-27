module.exports = {
    defaultIfEmpty: require('rxjs/internal/operators/defaultIfEmpty').defaultIfEmpty,
    empty: require('rxjs/internal/observable/empty').empty,
    map: require('rxjs/internal/operators/map').map,
    mergeMap: require('rxjs/internal/operators/mergeMap').mergeMap,
    Observable: require('rxjs/internal/Observable').Observable,
    of: require('rxjs/internal/observable/of').of,
    publish: require('rxjs/internal/operators/publish').publish,
    tap: require('rxjs/internal/operators/tap').tap,
    throwError: require('rxjs/internal/observable/throwError').throwError
};