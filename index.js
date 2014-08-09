var _      = require('lodash');
var redis  = require('redis');
var when   = require('when');

module.exports = function(options) {

  options = _.extend({
    host: "127.0.0.1",
    port: 6379,
    keepalive: 3000,
    request: 500,
    requests: Infinity,
    refresh: 1000,
    refreshes: Infinity
  }, options);

  var client = options.client || redis.createClient(
    options.port, options.host
  );

  client.on('error', function(err) {
    console.log("REDIS ERROR", err);
  });

  /**
   * Acquire a lock
   *
   * @param  {[type]}   name    [description]
   * @param  {[type]}   retries [description]
   * @param  {Function} cb      [description]
   * @return {[type]}           [description]
   */
  return function(name, retries, cb) {
    return when.promise(function(resolve, reject) {
      var requests = 0
        , refreshes = 0
        , interval = null
        , value = 'someval';

      function request() {
        client.set(name, value, "PX", options.keepalive, "NX",
          function(err, res) {

            if (err) {
              next("REQUEST_ERROR");
            }
            else if (res === 'OK') {
              next(options.refresh, refresh);
              cb(release);
            }
            else if (requests++ >= options.requests) {
              next("REQUEST_TIMEOUT");
            }
            else if (!interval) {
              next(options.request, request);
            }
        });
      }

      function refresh() {
        client.set(name, value, "PX", options.keepalive,
          function(err) {

            if (err) {
              next("REFRESH_ERROR");
            }
            else if (refreshes++ >= options.refreshes) {
              next("REFRESH_TIMEOUT");
            }
        });
      }

      function release(err, data) {
        client.del(name,
          function(err) {

            if (err) {
              next("RELEASE_ERROR");
            }
            else {
              next(null, data);
            }
        });
      }

      function next(time, data) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        if (!time) {
          resolve(data);
        }
        else if (!data) {
          reject(time);
        }
        else {
          interval = setInterval(time, data);
        }
      }

      return client
        ? request()
        : reject("REDIS_ERROR");
    });
  }
};